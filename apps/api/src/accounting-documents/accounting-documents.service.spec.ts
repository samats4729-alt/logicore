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
            update: jest.fn(async ({ data }: any) => ({ id: 'doc-1', ...data })),
        },
        accountingDocumentLine: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
        accountingDocumentOrder: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma: any = {
        company: {
            findUnique: jest.fn(({ where }: any) => Promise.resolve(companySnapshot(where.id))),
        },
        contract: { findUnique: jest.fn().mockResolvedValue(null) },
        financeAccount: { findFirst: jest.fn().mockResolvedValue(null) },
        order: { count: jest.fn().mockResolvedValue(0) },
        accountingDocument: {
            findUnique: jest.fn(),
            update: jest.fn(async ({ data }: any) => ({ id: 'doc-1', ...data })),
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
    const financialReports = {
        getReconciliationAct: jest.fn().mockResolvedValue({
            company: { id: COMPANY, name: 'Наша компания', bin: '123456789012' },
            counterparty: { id: COUNTERPARTY, name: 'Контрагент', bin: '987654321098' },
            period: {
                start: '2026-07-01T00:00:00.000Z',
                end: '2026-07-31T23:59:59.999Z',
            },
            openingBalance: 100,
            rows: [
                {
                    date: new Date('2026-07-15T18:00:00.000Z'),
                    doc: 'Заявка №AB00000123',
                    description: 'Транспортные услуги',
                    debit: 500,
                    credit: 0,
                    balance: 600,
                },
                {
                    date: new Date('2026-07-31T18:00:00.000Z'),
                    doc: 'Оплата по заявке №AB00000123',
                    description: 'Поступление оплаты',
                    debit: 0,
                    credit: 200,
                    balance: 400,
                },
            ],
            totals: { debit: 500, credit: 200 },
            closingBalance: 400,
            generatedAt: '2026-07-31T20:00:00.000Z',
        }),
    };
    const service = new AccountingDocumentsService(
        prisma,
        new AccountingDocumentCalculatorService(),
        periodClosing as any,
        financialReports as any,
    );
    return { service, prisma, tx, periodClosing, financialReports };
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
    // T-16: у прежней модели счетов публичная ссылка была вечной и отозвать
    // её было нельзя — утёкшая ссылка навсегда открывала документ с
    // реквизитами. Здесь ссылка перевыпускается и отзывается.
    describe('публичная ссылка на документ', () => {
        it('перевыпуск выдаёт новый токен и снимает отзыв', async () => {
            const { service, prisma } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue({ id: 'doc-1' });

            await service.regenerateShareToken(COMPANY, 'doc-1');

            const [args] = prisma.accountingDocument.update.mock.calls[0];
            expect(args.data.shareRevokedAt).toBeNull();
            expect(typeof args.data.shareToken).toBe('string');
            expect(args.data.shareToken.length).toBeGreaterThan(20);
        });

        it('отзыв проставляет дату и не трогает токен', async () => {
            const { service, prisma } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue({ id: 'doc-1' });

            await service.revokeShare(COMPANY, 'doc-1');

            const [args] = prisma.accountingDocument.update.mock.calls[0];
            expect(args.data.shareRevokedAt).toBeInstanceOf(Date);
            expect(args.data.shareToken).toBeUndefined();
        });

        it('чужой документ не отзывается', async () => {
            const { service, prisma } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue(null);

            await expect(service.revokeShare(COMPANY, 'doc-чужой')).rejects.toThrow(/не найден/);
        });

        it('по отозванной ссылке документ не отдаётся', async () => {
            const { service, prisma } = makeService();
            prisma.accountingDocument.findUnique.mockResolvedValue(
                storedDocument({ status: AccountingDocumentStatus.POSTED, shareRevokedAt: new Date() }),
            );

            await expect(service.getPublicByToken('t')).rejects.toThrow(/недействительна/);
        });

        it('черновик по ссылке не отдаётся', async () => {
            const { service, prisma } = makeService();
            prisma.accountingDocument.findUnique.mockResolvedValue(
                storedDocument({ status: AccountingDocumentStatus.DRAFT, shareRevokedAt: null }),
            );

            await expect(service.getPublicByToken('t')).rejects.toThrow(/недействительна/);
        });

        it('проведённый документ отдаётся без внутренних полей', async () => {
            const { service, prisma } = makeService();
            prisma.accountingDocument.findUnique.mockResolvedValue(
                storedDocument({
                    status: AccountingDocumentStatus.POSTED,
                    shareRevokedAt: null,
                    note: 'внутренняя пометка',
                    checksum: 'abc',
                    createdBy: { id: 'u1', firstName: 'И', lastName: 'И' },
                }),
            );

            const result: any = await service.getPublicByToken('t');

            expect(result.number).toBe('СЧ-2026-000001');
            expect(result.note).toBeUndefined();
            expect(result.checksum).toBeUndefined();
            expect(result.createdBy).toBeUndefined();
        });
    });

    // T-19: у компании может быть несколько расчётных счетов, а в карточке
    // организации хранится только один комплект реквизитов. В счёт обязаны
    // попасть реквизиты того счёта, с которого его выставили, — иначе
    // контрагент заплатит не в тот банк.
    describe('расчётный счёт организации в документе', () => {
        const bankAccount = {
            id: 'acc-kaspi',
            name: 'Kaspi',
            kind: 'BANK',
            isActive: true,
            iban: 'KZ13722S000013131565',
            bankName: 'АО «KASPI BANK»',
            bankBic: 'CASPKZKA',
            kbe: '17',
        };

        const invoiceDto = (extra: Record<string, unknown> = {}) => ({
            type: AccountingDocumentType.PAYMENT_INVOICE,
            direction: AccountingDocumentDirection.OUTGOING,
            counterpartyId: COUNTERPARTY,
            documentDate: '2026-07-22',
            lines: [{ name: 'Транспортные услуги', unitPrice: '20000.00' }],
            ...extra,
        }) as any;

        it('печатает реквизиты выбранного счёта, а не карточки организации', async () => {
            const { service, prisma, tx } = makeService();
            prisma.financeAccount.findFirst.mockResolvedValue(bankAccount);

            await service.createDraft(COMPANY, 'user-1', invoiceDto({ bankAccountId: 'acc-kaspi' }));

            const { data } = tx.accountingDocument.create.mock.calls[0][0];
            expect(data.bankAccountId).toBe('acc-kaspi');
            expect(data.issuerSnapshot).toMatchObject({
                bankAccount: 'KZ13722S000013131565',
                bankName: 'АО «KASPI BANK»',
                bankBic: 'CASPKZKA',
                kbe: '17',
            });
        });

        it('без явного выбора берёт банковский счёт по умолчанию', async () => {
            const { service, prisma, tx } = makeService();
            prisma.financeAccount.findFirst.mockResolvedValue(bankAccount);

            await service.createDraft(COMPANY, 'user-1', invoiceDto());

            const [args] = prisma.financeAccount.findFirst.mock.calls[0];
            expect(args.where).toMatchObject({ companyId: COMPANY, kind: 'BANK', isActive: true });
            expect(tx.accountingDocument.create.mock.calls[0][0].data.bankAccountId).toBe('acc-kaspi');
        });

        it('без банковских счетов печатает реквизиты организации, как раньше', async () => {
            const { service, prisma, tx } = makeService();
            prisma.financeAccount.findFirst.mockResolvedValue(null);

            await service.createDraft(COMPANY, 'user-1', invoiceDto());

            const { data } = tx.accountingDocument.create.mock.calls[0][0];
            expect(data.bankAccountId).toBeNull();
            expect(data.issuerSnapshot).toMatchObject({ id: COMPANY });
        });

        it('не даёт выставить счёт с кассы', async () => {
            const { service, prisma } = makeService();
            prisma.financeAccount.findFirst.mockResolvedValue({ ...bankAccount, kind: 'CASH' });

            await expect(
                service.createDraft(COMPANY, 'user-1', invoiceDto({ bankAccountId: 'acc-cash' })),
            ).rejects.toThrow(/только банковский счёт/);
        });

        it('не даёт выставить счёт с закрытого счёта', async () => {
            const { service, prisma } = makeService();
            prisma.financeAccount.findFirst.mockResolvedValue({ ...bankAccount, isActive: false });

            await expect(
                service.createDraft(COMPANY, 'user-1', invoiceDto({ bankAccountId: 'acc-kaspi' })),
            ).rejects.toThrow(/закрыт/);
        });
    });

    it('создаёт черновик акта сверки из реальных строк регистра', async () => {
        const { service, tx, financialReports } = makeService();

        const result: any = await service.createReconciliationDraftFromLedger(
            COMPANY,
            'user-1',
            {
                counterpartyId: COUNTERPARTY,
                reportPeriodFrom: '2026-07-01',
                reportPeriodTo: '2026-07-31',
            },
        );

        expect(financialReports.getReconciliationAct).toHaveBeenCalledWith(
            COMPANY,
            COUNTERPARTY,
            { startDate: '2026-07-01', endDate: '2026-07-31' },
        );
        expect(result.type).toBe(AccountingDocumentType.RECONCILIATION_ACT);
        const createData = tx.accountingDocument.create.mock.calls[0][0].data;
        expect(createData.openingBalance.toFixed(2)).toBe('100.00');
        expect(createData.closingBalance.toFixed(2)).toBe('400.00');
        expect(createData.reconciliationLines.create).toHaveLength(2);
        expect(createData.reconciliationLines.create[0]).toMatchObject({
            sourceDocumentType: 'Заявка',
            sourceDocumentNumber: 'AB00000123',
            description: 'Транспортные услуги',
        });
        expect(createData.reconciliationLines.create[1].transactionDate).toEqual(
            new Date('2026-07-31'),
        );
    });

    it('не запрашивает регистр при перевёрнутом периоде', async () => {
        const { service, financialReports } = makeService();

        await expect(service.createReconciliationDraftFromLedger(
            COMPANY,
            'user-1',
            {
                counterpartyId: COUNTERPARTY,
                reportPeriodFrom: '2026-08-01',
                reportPeriodTo: '2026-07-31',
            },
        )).rejects.toThrow('Начало отчётного периода позже его окончания');
        expect(financialReports.getReconciliationAct).not.toHaveBeenCalled();
    });

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

    // T-01б: карточка документа умеет «Записать» — но только для черновика.
    // Проведённый счёт уже у контрагента на руках, и меняться задним числом
    // он не должен.
    describe('правка черновика из карточки', () => {
        const draft = (overrides: Record<string, unknown> = {}) => ({
            id: 'doc-1',
            type: AccountingDocumentType.PAYMENT_INVOICE,
            direction: AccountingDocumentDirection.OUTGOING,
            counterpartyId: COUNTERPARTY,
            status: AccountingDocumentStatus.DRAFT,
            documentDate: new Date('2026-07-22'),
            amountPaid: new Prisma.Decimal('0'),
            orders: [],
            ...overrides,
        });

        it('заменяет строки целиком и пересчитывает итоги', async () => {
            const { service, prisma, tx } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue(draft());
            jest.spyOn(service, 'getById').mockResolvedValue({ id: 'doc-1' } as any);

            await service.updateDraft(COMPANY, 'doc-1', {
                lines: [
                    { name: 'Перевозка Алматы — Астана', unitPrice: '100000', vatRate: '12', vatTreatment: 'STANDARD', vatCalculation: 'INCLUDED' } as any,
                    { name: 'Простой', quantity: '2', unitPrice: '5000' } as any,
                ],
            });

            expect(tx.accountingDocumentLine.deleteMany).toHaveBeenCalledWith({
                where: { documentId: 'doc-1' },
            });
            const { data } = tx.accountingDocument.update.mock.calls[0][0];
            // 100 000 с НДС 12 % «в том числе» = 89 285.71 + 10 714.29,
            // плюс 2 × 5 000 без НДС.
            expect(data.subtotal.toFixed(2)).toBe('99285.71');
            expect(data.vatTotal.toFixed(2)).toBe('10714.29');
            expect(data.total.toFixed(2)).toBe('110000.00');
            expect(data.balanceDue.toFixed(2)).toBe('110000.00');
            expect(data.lines.create).toHaveLength(2);
            expect(data.lines.create[1].quantity.toFixed(0)).toBe('2');
        });

        it('оставляет строки и итоги нетронутыми, если пришли только реквизиты шапки', async () => {
            const { service, prisma, tx } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue(draft());
            jest.spyOn(service, 'getById').mockResolvedValue({ id: 'doc-1' } as any);

            await service.updateDraft(COMPANY, 'doc-1', { note: '  Оплата до конца недели  ' });

            expect(tx.accountingDocumentLine.deleteMany).not.toHaveBeenCalled();
            const { data } = tx.accountingDocument.update.mock.calls[0][0];
            expect(data.note).toBe('Оплата до конца недели');
            expect(data.total).toBeUndefined();
            expect(data.lines).toBeUndefined();
        });

        it('переносит реквизиты выбранного банковского счёта в снимок выставителя', async () => {
            const { service, prisma, tx } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue(draft());
            prisma.financeAccount.findFirst.mockResolvedValue({
                id: 'acc-kaspi',
                name: 'Kaspi',
                kind: 'BANK',
                isActive: true,
                iban: 'KZ13722S000013131565',
                bankName: 'АО «KASPI BANK»',
                bankBic: 'CASPKZKA',
                kbe: '17',
            });
            jest.spyOn(service, 'getById').mockResolvedValue({ id: 'doc-1' } as any);

            await service.updateDraft(COMPANY, 'doc-1', { bankAccountId: 'acc-kaspi' });

            const { data } = tx.accountingDocument.update.mock.calls[0][0];
            expect(data.bankAccountId).toBe('acc-kaspi');
            // Исходящий документ — выставляем мы, значит наши реквизиты
            // стоят в «Исполнителе», а контрагент остаётся как был.
            expect(data.issuerSnapshot.bankAccount).toBe('KZ13722S000013131565');
            expect(data.issuerSnapshot.bankName).toBe('АО «KASPI BANK»');
            expect(data.recipientSnapshot.id).toBe(COUNTERPARTY);
            expect(data.recipientSnapshot.bankAccount).toBeNull();
        });

        it('не изменяет проведённый документ', async () => {
            const { service, prisma, tx } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue(
                draft({ status: AccountingDocumentStatus.POSTED }),
            );

            await expect(
                service.updateDraft(COMPANY, 'doc-1', { note: 'Правка' }),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(tx.accountingDocument.update).not.toHaveBeenCalled();
        });

        it('отклоняет перенос даты в другой год — номер выдан в разрезе года', async () => {
            const { service, prisma, tx } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue(draft());

            await expect(
                service.updateDraft(COMPANY, 'doc-1', { documentDate: '2027-01-10' }),
            ).rejects.toThrow('создайте документ заново');
            expect(tx.accountingDocument.update).not.toHaveBeenCalled();
        });

        it('не пускает в документ чужую заявку', async () => {
            const { service, prisma, tx } = makeService();
            prisma.accountingDocument.findFirst.mockResolvedValue(draft());
            prisma.order.count.mockResolvedValue(0);

            await expect(
                service.updateDraft(COMPANY, 'doc-1', { orderIds: ['order-чужой'] }),
            ).rejects.toThrow('Некоторые заявки недоступны');
            expect(tx.accountingDocument.update).not.toHaveBeenCalled();
        });
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
