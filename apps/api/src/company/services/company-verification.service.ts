import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { CompanyVerificationStatus, DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
    constructor(private readonly prisma: PrismaService) {}

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
