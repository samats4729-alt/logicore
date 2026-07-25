import { ConflictException } from '@nestjs/common';
import {
    AccountingDocumentDirection,
    AccountingDocumentStatus,
    AccountingDocumentType,
    Prisma,
} from '@prisma/client';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';
import { AccountingDocumentsService } from './accounting-documents.service';

const COMPANY = 'company-1';
const COUNTERPARTY = 'company-2';

const companySnapshot = (id: string) => ({
    id,
    name: id === COMPANY ? 'Наша компания' : 'Контрагент',
    bin: id === COMPANY ? '123456789012' : '987654321098',
    address: 'Астана',
    actualAddress: null,
    phone: null,
    email: null,
    directorName: null,
    bankAccount: null,
    bankName: null,
    bankBic: null,
    kbe: null,
});

function makeService() {
    const tx: any = {
        accountingDocumentNumbering: {
            upsert: jest.fn().mockResolvedValue({
                prefix: 'СЧ-2026-',
                nextNumber: 2,
                padLength: 6,
            }),
        },
        accountingDocument: {
            create: jest.fn(async ({ data }: any) => ({ id: 'doc-1', status: 'DRAFT', ...data })),
        },
    };
    const prisma: any = {
        company: {
            findUnique: jest.fn(({ where }: any) => Promise.resolve(companySnapshot(where.id))),
        },
        contract: { findUnique: jest.fn().mockResolvedValue(null) },
        order: { count: jest.fn().mockResolvedValue(0) },
        accountingDocument: {
            findFirst: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn(async (input: any) => {
            if (typeof input === 'function') return input(tx);
            return Promise.all(input);
        }),
    };
    const periodClosing = { checkPeriodNotClosed: jest.fn().mockResolvedValue(undefined) };
    const service = new AccountingDocumentsService(
        prisma,
        new AccountingDocumentCalculatorService(),
        periodClosing as any,
    );
    return { service, prisma, tx, periodClosing };
}

const storedDocument = (overrides: Record<string, unknown> = {}) => ({
    id: 'doc-1',
    companyId: COMPANY,
    counterpartyId: COUNTERPARTY,
    type: AccountingDocumentType.PAYMENT_INVOICE,
    direction: AccountingDocumentDirection.OUTGOING,
    status: AccountingDocumentStatus.DRAFT,
    number: 'СЧ-2026-000001',
    externalNumber: null,
    documentDate: new Date('2026-07-22'),
    operationDate: null,
    currency: 'KZT',
    subtotal: new Prisma.Decimal('17241.38'),
    vatTotal: new Prisma.Decimal('2758.62'),
    total: new Prisma.Decimal('20000.00'),
    balanceDue: new Prisma.Decimal('20000.00'),
    issuerSnapshot: companySnapshot(COMPANY),
    recipientSnapshot: companySnapshot(COUNTERPARTY),
    reportPeriodFrom: null,
    reportPeriodTo: null,
    lines: [{ lineNumber: 1, name: 'Услуга', total: new Prisma.Decimal('20000.00') }],
    reconciliationLines: [],
    paymentAllocations: [],
    ...overrides,
});

describe('AccountingDocumentsService', () => {
    it('создаёт черновик одной транзакцией с автоматическим номером и снимками сторон', async () => {
        const { service, tx } = makeService();

        const result: any = await service.createDraft(COMPANY, 'user-1', {
            type: AccountingDocumentType.PAYMENT_INVOICE,
            direction: AccountingDocumentDirection.OUTGOING,
            counterpartyId: COUNTERPARTY,
            documentDate: '2026-07-22',
            lines: [{
                name: 'Экспедиторские услуги',
                unitPrice: '20000',
                vatTreatment: 'STANDARD' as any,
                vatCalculation: 'INCLUDED' as any,
                vatRate: '16',
            }],
        });

        expect(result.number).toBe('СЧ-2026-000001');
        expect(result.total.toFixed(2)).toBe('20000.00');
        expect(result.vatTotal.toFixed(2)).toBe('2758.62');
        expect(result.issuerSnapshot.id).toBe(COMPANY);
        expect(result.recipientSnapshot.id).toBe(COUNTERPARTY);
        expect(tx.accountingDocumentNumbering.upsert).toHaveBeenCalled();
        expect(tx.accountingDocument.create).toHaveBeenCalledTimes(1);
    });

    it('проводит только черновик, проверяет период и записывает SHA-256', async () => {
        const { service, prisma, periodClosing } = makeService();
        jest.spyOn(service, 'getById')
            .mockResolvedValueOnce(storedDocument() as any)
            .mockResolvedValueOnce(storedDocument({
                status: AccountingDocumentStatus.POSTED,
                checksum: 'saved-checksum',
            }) as any);

        await service.post(COMPANY, 'accountant-1', 'doc-1');

        expect(periodClosing.checkPeriodNotClosed).toHaveBeenCalledWith(
            COMPANY,
            new Date('2026-07-22'),
        );
        const update = prisma.accountingDocument.updateMany.mock.calls[0][0];
        expect(update.where.status).toBe(AccountingDocumentStatus.DRAFT);
        expect(update.data.status).toBe(AccountingDocumentStatus.POSTED);
        expect(update.data.checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('не отменяет проведённый документ, пока к нему распределён платёж', async () => {
        const { service, prisma } = makeService();
        jest.spyOn(service, 'getById').mockResolvedValue(storedDocument({
            status: AccountingDocumentStatus.POSTED,
            paymentAllocations: [{ id: 'allocation-1' }],
        }) as any);

        await expect(
            service.cancel(COMPANY, 'accountant-1', 'doc-1', 'Ошибка'),
        ).rejects.toThrow('Сначала снимите распределение платежей');
        expect(prisma.accountingDocument.updateMany).not.toHaveBeenCalled();
    });

    it('защищается от одновременного повторного проведения', async () => {
        const { service, prisma } = makeService();
        jest.spyOn(service, 'getById').mockResolvedValue(storedDocument() as any);
        prisma.accountingDocument.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.post(COMPANY, 'accountant-1', 'doc-1')).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it('удаляет только черновик выбранной компании', async () => {
        const { service, prisma } = makeService();

        await expect(service.deleteDraft(COMPANY, 'doc-1')).resolves.toEqual({ success: true });
        expect(prisma.accountingDocument.deleteMany).toHaveBeenCalledWith({
            where: {
                id: 'doc-1',
                companyId: COMPANY,
                status: AccountingDocumentStatus.DRAFT,
            },
        });
    });
});
