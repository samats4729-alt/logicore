import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CompanyVerificationStatus, DocumentType } from '@prisma/client';
import {
    CompanyVerificationService,
    REQUIRED_VERIFICATION_DOCUMENTS,
} from './company-verification.service';

const COMPANY = 'company-1';
const REVIEWER = 'platform-admin';

const makeService = (overrides: Record<string, any> = {}) => {
    const prisma: any = {
        company: {
            findUnique: jest.fn().mockResolvedValue({
                id: COMPANY,
                verificationStatus: CompanyVerificationStatus.DRAFT,
                rejectionReason: null,
            }),
            update: jest.fn(async ({ data }: any) => ({ id: COMPANY, ...data })),
            findMany: jest.fn().mockResolvedValue([]),
        },
        document: { findMany: jest.fn().mockResolvedValue([]) },
        ...overrides,
    };
    const s3: any = { isS3Enabled: jest.fn().mockReturnValue(false), uploadFile: jest.fn() };
    return { service: new CompanyVerificationService(prisma, s3), prisma, s3 };
};

const allDocuments = REQUIRED_VERIFICATION_DOCUMENTS.map((type) => ({ type }));

describe('CompanyVerificationService', () => {
    describe('пакет документов', () => {
        it('требует справку о регистрации, приказ о директоре и удостоверение личности', () => {
            // Справка доказывает, что юрлицо существует, но БИН публичен —
            // связь с заявителем дают приказ и удостоверение.
            expect(REQUIRED_VERIFICATION_DOCUMENTS).toEqual([
                DocumentType.COMPANY_REGISTRATION,
                DocumentType.DIRECTOR_APPOINTMENT,
                DocumentType.DIRECTOR_ID,
            ]);
        });

        it('не отправляет заявку, пока не приложены все документы', async () => {
            const { service, prisma } = makeService();
            prisma.document.findMany.mockResolvedValue([
                { type: DocumentType.COMPANY_REGISTRATION },
            ]);

            await expect(service.submit(COMPANY)).rejects.toBeInstanceOf(BadRequestException);
            await expect(service.submit(COMPANY)).rejects.toThrow('Приказ');
            expect(prisma.company.update).not.toHaveBeenCalled();
        });

        it('с полным пакетом переводит компанию на проверку', async () => {
            const { service, prisma } = makeService();
            prisma.document.findMany.mockResolvedValue(allDocuments);

            await service.submit(COMPANY);

            const { data } = prisma.company.update.mock.calls[0][0];
            expect(data.verificationStatus).toBe(CompanyVerificationStatus.PENDING);
            expect(data.verificationSubmittedAt).toBeInstanceOf(Date);
            // Прежняя причина отказа снимается: заявка подана заново.
            expect(data.rejectionReason).toBeNull();
        });

        it('показывает, каких документов не хватает', async () => {
            const { service, prisma } = makeService();
            prisma.document.findMany.mockResolvedValue([
                { id: 'd1', type: DocumentType.COMPANY_REGISTRATION, fileName: 'spravka.pdf', createdAt: new Date() },
            ]);

            const status = await service.getStatus(COMPANY);

            expect(status.missingDocuments).toEqual([
                DocumentType.DIRECTOR_APPOINTMENT,
                DocumentType.DIRECTOR_ID,
            ]);
            expect(status.canSubmit).toBe(false);
        });
    });

    describe('решение владельца платформы', () => {
        it('подтверждает компанию и записывает, кто это сделал', async () => {
            const { service, prisma } = makeService();

            await service.approve(COMPANY, REVIEWER);

            const { data } = prisma.company.update.mock.calls[0][0];
            expect(data.verificationStatus).toBe(CompanyVerificationStatus.VERIFIED);
            expect(data.verifiedById).toBe(REVIEWER);
            expect(data.verifiedAt).toBeInstanceOf(Date);
        });

        it('не отклоняет без причины — заявителю нужно знать, что исправить', async () => {
            const { service, prisma } = makeService();

            await expect(service.reject(COMPANY, REVIEWER, '   ')).rejects.toBeInstanceOf(
                BadRequestException,
            );
            expect(prisma.company.update).not.toHaveBeenCalled();
        });

        it('отклоняет с причиной и снимает подтверждение', async () => {
            const { service, prisma } = makeService();

            await service.reject(COMPANY, REVIEWER, '  Приказ без подписи  ');

            const { data } = prisma.company.update.mock.calls[0][0];
            expect(data.verificationStatus).toBe(CompanyVerificationStatus.REJECTED);
            expect(data.rejectionReason).toBe('Приказ без подписи');
            expect(data.verifiedAt).toBeNull();
        });

        it('после отказа компания может подать заявку заново', async () => {
            const { service, prisma } = makeService();
            prisma.company.findUnique.mockResolvedValue({
                id: COMPANY,
                verificationStatus: CompanyVerificationStatus.REJECTED,
            });
            prisma.document.findMany.mockResolvedValue(allDocuments);

            await service.submit(COMPANY);

            expect(prisma.company.update.mock.calls[0][0].data.verificationStatus)
                .toBe(CompanyVerificationStatus.PENDING);
        });

        it('не принимает повторную заявку, пока идёт проверка', async () => {
            const { service, prisma } = makeService();
            prisma.company.findUnique.mockResolvedValue({
                id: COMPANY,
                verificationStatus: CompanyVerificationStatus.PENDING,
            });

            await expect(service.submit(COMPANY)).rejects.toBeInstanceOf(ConflictException);
            expect(prisma.company.update).not.toHaveBeenCalled();
        });
    });

    describe('допуск к работе', () => {
        it.each([
            [CompanyVerificationStatus.DRAFT],
            [CompanyVerificationStatus.PENDING],
            [CompanyVerificationStatus.REJECTED],
        ])('не пускает работать компанию в статусе %s', async (status) => {
            const { service, prisma } = makeService();
            prisma.company.findUnique.mockResolvedValue({
                verificationStatus: status,
                rejectionReason: 'Документы не читаются',
            });

            await expect(service.assertVerified(COMPANY)).rejects.toBeInstanceOf(ForbiddenException);
        });

        it('в отказе показывает причину, чтобы было понятно, что исправить', async () => {
            const { service, prisma } = makeService();
            prisma.company.findUnique.mockResolvedValue({
                verificationStatus: CompanyVerificationStatus.REJECTED,
                rejectionReason: 'Документы не читаются',
            });

            await expect(service.assertVerified(COMPANY)).rejects.toThrow('Документы не читаются');
        });

        it('подтверждённую компанию пропускает', async () => {
            const { service, prisma } = makeService();
            prisma.company.findUnique.mockResolvedValue({
                verificationStatus: CompanyVerificationStatus.VERIFIED,
                rejectionReason: null,
            });

            await expect(service.assertVerified(COMPANY)).resolves.toBeUndefined();
        });
    });
});
