import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CompanyVerificationStatus, DocumentType, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';

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

    /** Очередь проверки в админке платформы. */
    async listForReview(status?: CompanyVerificationStatus) {
        const where: Prisma.CompanyWhereInput = {
            isExternal: false,
            verificationStatus: status ?? CompanyVerificationStatus.PENDING,
        };
        return this.prisma.company.findMany({
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
    }

    /** Решение владельца платформы: подтвердить компанию. */
    async approve(companyId: string, reviewerId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, verificationStatus: true },
        });
        if (!company) throw new NotFoundException('Организация не найдена');
        if (company.verificationStatus === CompanyVerificationStatus.VERIFIED) {
            throw new ConflictException('Организация уже подтверждена');
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
    async assertVerified(companyId: string) {
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
