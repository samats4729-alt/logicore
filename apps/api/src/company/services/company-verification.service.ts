import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CompanyVerificationStatus, DocumentType, OrderStatus, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';

/** Рубильник: требовать ли подтверждение организации для работы. */
const SETTING_VERIFICATION_REQUIRED = 'verification_required';
const REQUIRED_CACHE_TTL_MS = 60_000;

/**
 * Пакет документов, которым в РК подтверждают компанию.
 *
 * Справка о госрегистрации доказывает, что юрлицо с таким БИН существует,
 * но не связывает его с заявителем — БИН публичен. Поэтому к ней нужен
 * приказ о назначении руководителя и удостоверение личности: вместе они
 * показывают, что заявку подаёт именно директор этой компании.
 */
export const REQUIRED_VERIFICATION_DOCUMENTS: DocumentType[] = [
    DocumentType.COMPANY_REGISTRATION,
    DocumentType.DIRECTOR_APPOINTMENT,
    DocumentType.DIRECTOR_ID,
];

export const VERIFICATION_DOCUMENT_LABELS: Record<string, string> = {
    COMPANY_REGISTRATION: 'Справка о государственной регистрации юридического лица',
    DIRECTOR_APPOINTMENT: 'Приказ (решение) о назначении первого руководителя',
    DIRECTOR_ID: 'Удостоверение личности руководителя',
};

@Injectable()
export class CompanyVerificationService {
    /** Рубильник спрашивают на каждом действии — держим ответ минуту. */
    private requiredCache: { value: boolean; expiresAt: number } | null = null;

    constructor(
        private readonly prisma: PrismaService,
        private readonly s3Service: S3Service,
    ) {}

    /**
     * Приложить документ к заявке на подтверждение.
     *
     * Документ одного вида хранится один: повторная загрузка заменяет
     * прежний файл, иначе после замечания владельца в карточке лежали бы
     * две справки и было бы непонятно, какую он смотрел.
     */
    async attachDocument(
        companyId: string,
        userId: string,
        type: DocumentType,
        file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
    ) {
        if (!REQUIRED_VERIFICATION_DOCUMENTS.includes(type)) {
            throw new BadRequestException('Этот вид документа не относится к проверке организации');
        }
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, verificationStatus: true },
        });
        if (!company) throw new NotFoundException('Организация не найдена');
        if (company.verificationStatus === CompanyVerificationStatus.VERIFIED) {
            throw new ConflictException('Организация уже подтверждена');
        }

        const safeName = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-80);
        const relativePath = `uploads/verification/${companyId}_${type}_${Date.now()}_${safeName}`;

        if (this.s3Service.isS3Enabled()) {
            await this.s3Service.uploadFile(relativePath, file.buffer, file.mimetype);
        } else {
            const dir = path.join(process.cwd(), 'uploads', 'verification');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(process.cwd(), relativePath), file.buffer);
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.document.deleteMany({ where: { companyId, type } });
            return tx.document.create({
                data: {
                    type,
                    fileName: file.originalname,
                    fileUrl: relativePath,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    companyId,
                    uploadedById: userId,
                },
                select: { id: true, type: true, fileName: true, createdAt: true },
            });
        });
    }

    /**
     * Состояние проверки для кабинета компании: статус, что уже приложено и
     * чего не хватает.
     */
    async getStatus(companyId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: {
                id: true,
                name: true,
                bin: true,
                verificationStatus: true,
                verificationSubmittedAt: true,
                verifiedAt: true,
                rejectionReason: true,
            },
        });
        if (!company) throw new NotFoundException('Организация не найдена');

        const documents = await this.prisma.document.findMany({
            where: { companyId, type: { in: REQUIRED_VERIFICATION_DOCUMENTS } },
            select: { id: true, type: true, fileName: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });

        const attached = new Set(documents.map((document) => document.type));
        return {
            ...company,
            documents,
            missingDocuments: REQUIRED_VERIFICATION_DOCUMENTS.filter((type) => !attached.has(type)),
            canSubmit: this.canSubmit(company.verificationStatus)
                && REQUIRED_VERIFICATION_DOCUMENTS.every((type) => attached.has(type)),
        };
    }

    /**
     * Отправить компанию на проверку владельцу платформы.
     *
     * Повторная подача после отказа разрешена — иначе исправить замечание
     * было бы нечем.
     */
    async submit(companyId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, verificationStatus: true },
        });
        if (!company) throw new NotFoundException('Организация не найдена');
        if (!this.canSubmit(company.verificationStatus)) {
            throw new ConflictException(
                company.verificationStatus === CompanyVerificationStatus.PENDING
                    ? 'Заявка уже на проверке'
                    : 'Организация уже подтверждена',
            );
        }

        const attached = await this.prisma.document.findMany({
            where: { companyId, type: { in: REQUIRED_VERIFICATION_DOCUMENTS } },
            select: { type: true },
        });
        const attachedTypes = new Set(attached.map((document) => document.type));
        const missing = REQUIRED_VERIFICATION_DOCUMENTS.filter((type) => !attachedTypes.has(type));
        if (missing.length) {
            throw new BadRequestException(
                `Не приложены документы: ${missing.map((type) => VERIFICATION_DOCUMENT_LABELS[type]).join('; ')}`,
            );
        }

        return this.prisma.company.update({
            where: { id: companyId },
            data: {
                verificationStatus: CompanyVerificationStatus.PENDING,
                verificationSubmittedAt: new Date(),
                rejectionReason: null,
            },
            select: { id: true, verificationStatus: true, verificationSubmittedAt: true },
        });
    }

    /**
     * Файл документа для просмотра владельцем платформы.
     *
     * Отдаётся только через эту ручку и только админу: в пакете есть скан
     * удостоверения личности, и раздавать его статикой по пути файла
     * нельзя — ссылку можно было бы угадать или переслать.
     */
    async readDocument(documentId: string) {
        const document = await this.prisma.document.findFirst({
            where: { id: documentId, type: { in: REQUIRED_VERIFICATION_DOCUMENTS } },
            select: { fileUrl: true, fileName: true, mimeType: true },
        });
        if (!document) throw new NotFoundException('Документ не найден');

        if (this.s3Service.isS3Enabled()) {
            const { stream, mimeType } = await this.s3Service.downloadFile(document.fileUrl);
            return { stream, mimeType: mimeType || document.mimeType, fileName: document.fileName };
        }

        const absolute = path.join(process.cwd(), document.fileUrl);
        if (!fs.existsSync(absolute)) throw new NotFoundException('Файл не найден');
        return {
            stream: fs.createReadStream(absolute),
            mimeType: document.mimeType,
            fileName: document.fileName,
        };
    }

    /**
     * Очередь проверки в админке платформы.
     *
     * К каждой заявке добавляется, что ещё известно про её БИН: подтверждена
     * ли уже организация с таким номером и не заведён ли он у кого-то как
     * контрагент. Без этого решение принималось вслепую — совпадение
     * всплывало только отказом в момент нажатия «Подтвердить».
     */
    async listForReview(status?: CompanyVerificationStatus) {
        const where: Prisma.CompanyWhereInput = {
            isExternal: false,
            verificationStatus: status ?? CompanyVerificationStatus.PENDING,
        };
        const companies = await this.prisma.company.findMany({
            where,
            select: {
                id: true,
                name: true,
                bin: true,
                email: true,
                phone: true,
                directorName: true,
                verificationStatus: true,
                verificationSubmittedAt: true,
                verifiedAt: true,
                rejectionReason: true,
                createdAt: true,
                documents: {
                    where: { type: { in: REQUIRED_VERIFICATION_DOCUMENTS } },
                    select: { id: true, type: true, fileName: true, fileUrl: true, createdAt: true },
                    orderBy: { createdAt: 'desc' },
                },
            },
            orderBy: [{ verificationSubmittedAt: 'asc' }, { createdAt: 'asc' }],
            take: 200,
        });

        const bins = companies.map((company) => company.bin).filter((bin): bin is string => !!bin);
        if (bins.length === 0) {
            return companies.map((company) => ({ ...company, binVerifiedBy: null, binKnownAsPartner: [] }));
        }

        const sameBin = await this.prisma.company.findMany({
            where: {
                bin: { in: bins },
                id: { notIn: companies.map((company) => company.id) },
            },
            select: {
                id: true,
                name: true,
                bin: true,
                isExternal: true,
                verificationStatus: true,
                createdByCompany: { select: { id: true, name: true } },
            },
        });

        return companies.map((company) => ({
            ...company,
            // Организация с этим БИН уже работает — подтвердить вторую нельзя.
            binVerifiedBy: sameBin.find((other) => other.bin === company.bin
                && !other.isExternal
                && other.verificationStatus === CompanyVerificationStatus.VERIFIED) ?? null,
            // Этот БИН уже заведён у кого-то как контрагент.
            binKnownAsPartner: sameBin
                .filter((other) => other.bin === company.bin && other.isExternal)
                .map((other) => ({
                    id: other.id,
                    name: other.name,
                    ownerCompanyName: other.createdByCompany?.name ?? null,
                })),
        }));
    }

    /** Решение владельца платформы: подтвердить компанию. */
    async approve(companyId: string, reviewerId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, bin: true, verificationStatus: true },
        });
        if (!company) throw new NotFoundException('Организация не найдена');
        if (company.verificationStatus === CompanyVerificationStatus.VERIFIED) {
            throw new ConflictException('Организация уже подтверждена');
        }

        // Одна работающая организация на один БИН.
        //
        // Проверка стоит на подтверждении, а не на подаче заявки, и это
        // намеренно. БИН — публичный номер: запрет подать заявку означал бы,
        // что любой, набрав чужой БИН, навсегда закрывает настоящему
        // владельцу вход на платформу. Подать может кто угодно, а решение
        // принимает человек, посмотрев документы.
        if (company.bin) {
            const taken = await this.prisma.company.findFirst({
                where: {
                    bin: company.bin,
                    isExternal: false,
                    verificationStatus: CompanyVerificationStatus.VERIFIED,
                    id: { not: companyId },
                },
                select: { name: true },
            });
            if (taken) {
                throw new ConflictException(
                    `БИН ${company.bin} уже подтверждён у организации «${taken.name}». `
                    + 'Одна организация — один БИН: если это та же фирма, работайте в её кабинете, '
                    + 'а эту заявку отклоните с причиной.',
                );
            }
        }

        return this.prisma.company.update({
            where: { id: companyId },
            data: {
                verificationStatus: CompanyVerificationStatus.VERIFIED,
                verifiedAt: new Date(),
                verifiedById: reviewerId,
                rejectionReason: null,
            },
            select: { id: true, name: true, verificationStatus: true, verifiedAt: true },
        });
    }

    /**
     * Отдать подтверждённой организации её рейсы, которые сейчас в работе.
     *
     * До регистрации фирму заводили как контрагента вручную — карточкой в
     * чужом справочнике. Когда фирма пришла на платформу сама, её рейсы
     * остаются привязанными к этой карточке, и в своём кабинете она не видит
     * ничего, хотя груз едет прямо сейчас.
     *
     * Переносятся только незавершённые рейсы. Закрытая история — чужая
     * бухгалтерия, и по совпадению номера её не отдают: БИН публичен.
     * Счета и платежи не трогаются вовсе, они остаются на карточке у того,
     * кто её завёл, — иначе порвались бы взаиморасчёты.
     *
     * Вызывается только вручную, после того как документы проверены.
     */
    async linkActiveOrders(companyId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true, bin: true, isExternal: true, verificationStatus: true },
        });
        if (!company) throw new NotFoundException('Организация не найдена');
        if (company.isExternal) {
            throw new BadRequestException('Это карточка контрагента, а не организация платформы');
        }
        if (company.verificationStatus !== CompanyVerificationStatus.VERIFIED) {
            throw new BadRequestException(
                'Сначала подтвердите организацию: рейсы отдаются только по проверенным документам',
            );
        }
        if (!company.bin) {
            throw new BadRequestException('У организации не указан БИН');
        }

        const cards = await this.prisma.company.findMany({
            where: { bin: company.bin, isExternal: true },
            select: { id: true },
        });
        if (cards.length === 0) {
            return { movedOrders: 0, partnerCards: 0 };
        }
        const cardIds = cards.map((card) => card.id);
        const active = { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] };

        const [asCustomer, asSubForwarder, asPartner] = await this.prisma.$transaction([
            this.prisma.order.updateMany({
                where: { customerCompanyId: { in: cardIds }, status: active },
                data: { customerCompanyId: companyId },
            }),
            this.prisma.order.updateMany({
                where: { subForwarderId: { in: cardIds }, status: active },
                data: { subForwarderId: companyId },
            }),
            this.prisma.order.updateMany({
                where: { partnerId: { in: cardIds }, status: active },
                data: { partnerId: companyId },
            }),
        ]);

        return {
            movedOrders: asCustomer.count + asSubForwarder.count + asPartner.count,
            partnerCards: cardIds.length,
            companyName: company.name,
            bin: company.bin,
        };
    }

    /** Решение владельца платформы: отклонить с причиной. */
    async reject(companyId: string, reviewerId: string, reason: string) {
        if (!reason?.trim()) {
            throw new BadRequestException('Укажите причину отказа — она видна заявителю');
        }
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, verificationStatus: true },
        });
        if (!company) throw new NotFoundException('Организация не найдена');

        return this.prisma.company.update({
            where: { id: companyId },
            data: {
                verificationStatus: CompanyVerificationStatus.REJECTED,
                rejectionReason: reason.trim(),
                verifiedById: reviewerId,
                verifiedAt: null,
            },
            select: { id: true, name: true, verificationStatus: true, rejectionReason: true },
        });
    }

    /**
     * Пропуск к рабочим действиям. Вызывается гвардом перед созданием
     * заявок и бухгалтерских документов.
     */
    /**
     * Требуется ли подтверждение, чтобы работать.
     *
     * Владелец платформы решает сам. Сейчас выключено: люди должны иметь
     * возможность вести учёт с первого дня, а проверка — догонять их. Когда
     * компаний станет больше и проверка начнёт что-то значить, рубильник
     * включается без правки кода.
     */
    async isVerificationRequired(): Promise<boolean> {
        if (this.requiredCache && this.requiredCache.expiresAt > Date.now()) {
            return this.requiredCache.value;
        }
        const row = await this.prisma.platformSetting.findUnique({
            where: { key: SETTING_VERIFICATION_REQUIRED },
        });
        const value = row?.value === 'true';
        this.requiredCache = { value, expiresAt: Date.now() + REQUIRED_CACHE_TTL_MS };
        return value;
    }

    async setVerificationRequired(value: boolean) {
        await this.prisma.platformSetting.upsert({
            where: { key: SETTING_VERIFICATION_REQUIRED },
            create: { key: SETTING_VERIFICATION_REQUIRED, value: String(value) },
            update: { value: String(value) },
        });
        this.requiredCache = null;
        return { required: value };
    }

    async assertVerified(companyId: string) {
        // Пока подтверждение не требуется, работают все. Проверка при этом
        // никуда не девается: галочка у компании остаётся, её видно и ей
        // верят — просто она не запирает дверь.
        if (!(await this.isVerificationRequired())) return;

        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { verificationStatus: true, rejectionReason: true },
        });
        if (!company) throw new NotFoundException('Организация не найдена');
        if (company.verificationStatus === CompanyVerificationStatus.VERIFIED) return;

        throw new ForbiddenException(
            company.verificationStatus === CompanyVerificationStatus.REJECTED
                ? `Организация не подтверждена: ${company.rejectionReason ?? 'заявка отклонена'}`
                : 'Организация ещё не подтверждена. Приложите документы и дождитесь проверки',
        );
    }

    private canSubmit(status: CompanyVerificationStatus) {
        return status === CompanyVerificationStatus.DRAFT
            || status === CompanyVerificationStatus.REJECTED;
    }
}
