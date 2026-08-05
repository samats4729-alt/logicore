import { Prisma } from '@prisma/client';
import { FinancialReportsService } from './financial-reports.service';
import { FinanceCalculatorService } from './finance-calculator.service';

const COMPANY = 'company-1';
const D = (v: string | number) => new Prisma.Decimal(v);

/** Проведённый счёт нашей организации в пользу заказчика. */
const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: 'doc-1',
    number: 'СЧ-2026-000001',
    direction: 'OUTGOING',
    documentDate: new Date('2026-07-10'),
    dueDate: new Date('2026-07-20'),
    total: D(100000),
    amountPaid: D(0),
    balanceDue: D(100000),
    counterparty: { id: 'cp-1', name: 'ТОО «Заказчик»' },
    orders: [{ order: { id: 'o-1', orderNumber: 'ЗК-001' } }],
    ...overrides,
});

/** Рейс с долгом заказчика, по которому счёта нет. */
const orderWithDebt = (overrides: Record<string, unknown> = {}) => ({
    id: 'o-9',
    orderNumber: 'ЗК-009',
    createdAt: new Date('2026-07-01'),
    status: 'COMPLETED',
    customerPrice: D(70000),
    subForwarderPrice: null,
    driverCost: null,
    customerCompanyId: 'cp-1',
    customerCompany: { id: 'cp-1', name: 'ТОО «Заказчик»' },
    forwarderId: COMPANY,
    forwarder: { id: COMPANY, name: 'Мы' },
    subForwarderId: null,
    subForwarder: null,
    partnerId: null,
    partner: null,
    isCustomerPaid: false,
    isDriverPaid: false,
    isSubForwarderPaid: false,
    payments: [],
    incomes: [],
    expenses: [],
    ...overrides,
});

function makeService(docs: any[], orders: any[] = []) {
    const prisma: any = {
        accountingDocument: { findMany: jest.fn(async () => docs) },
        order: { findMany: jest.fn(async () => orders) },
    };
    return new FinancialReportsService(
        prisma, {} as any, {} as any,
        new FinanceCalculatorService() as any,
        {} as any, {} as any, {} as any, {} as any,
        { differencesForPeriod: async () => ({ gain: 0, loss: 0, net: 0, rows: [] }) } as any,
    );
}

describe('Планируемые платежи считаются от выставленного счёта', () => {
    describe('что попадает в план', () => {
        it('проведённый счёт нам — это ожидаемый приход', async () => {
            const service = makeService([invoice()]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toMatchObject({
                direction: 'IN',
                invoiceNumber: 'СЧ-2026-000001',
                amount: 100000,
                party: 'ТОО «Заказчик»',
            });
        });

        it('входящий счёт — это наш расход', async () => {
            const service = makeService([invoice({ direction: 'INCOMING' })]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows[0].direction).toBe('OUT');
            expect(result.totals.totalOut).toBe(100000);
        });

        it('СРОК БЕРЁТСЯ ИЗ СЧЁТА, а не из даты в карточке рейса', async () => {
            // Ради этого задача и делалась: дата в заявке — договорённость
            // менеджера, а обязательство создаёт счёт.
            const service = makeService([invoice({ dueDate: new Date('2026-08-15') })]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows[0].dueDate).toEqual(new Date('2026-08-15'));
            expect(result.rows[0].issuedAt).toEqual(new Date('2026-07-10'));
        });

        it('в план идёт остаток долга, а не вся сумма счёта', async () => {
            const service = makeService([
                invoice({ amountPaid: D(40000), balanceDue: D(60000) }),
            ]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows[0].amount).toBe(60000);
            expect(result.rows[0].invoiceTotal).toBe(100000);
            expect(result.rows[0].paidAmount).toBe(40000);
        });

        it('просроченный счёт помечен и посчитан отдельно', async () => {
            const service = makeService([invoice({ dueDate: new Date('2020-01-01') })]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows[0].isOverdue).toBe(true);
            expect(result.totals.overdueIn).toBe(100000);
        });

        it('счёт без срока оплаты просроченным не считается', async () => {
            const service = makeService([invoice({ dueDate: null })]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows[0].isOverdue).toBe(false);
        });

        it('в счёте видны все его рейсы', async () => {
            const service = makeService([invoice({
                orders: [
                    { order: { id: 'o-1', orderNumber: 'ЗК-001' } },
                    { order: { id: 'o-2', orderNumber: 'ЗК-002' } },
                ],
            })]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows[0].orderNumber).toBe('ЗК-001, ЗК-002');
            expect(result.rows[0].orders).toHaveLength(2);
        });

        it('счета сортируются по сроку, без срока — в конце', async () => {
            const service = makeService([
                invoice({ id: 'd-late', dueDate: new Date('2026-09-01') }),
                invoice({ id: 'd-none', dueDate: null }),
                invoice({ id: 'd-soon', dueDate: new Date('2026-07-15') }),
            ]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows.map((r: any) => r.documentId)).toEqual(['d-soon', 'd-late', 'd-none']);
        });
    });

    describe('запрос к базе', () => {
        it('черновики и отменённые счета в план не берутся', async () => {
            // Черновик никому не отправлен: обязательства он не создаёт.
            const service = makeService([invoice()]);

            await service.getPlannedPayments(COMPANY);

            const where = (service as any).prisma.accountingDocument.findMany.mock.calls[0][0].where;
            expect(where.status).toBe('POSTED');
            expect(where.type).toBe('PAYMENT_INVOICE');
        });

        it('полностью оплаченные счета в план не берутся', async () => {
            const service = makeService([invoice()]);

            await service.getPlannedPayments(COMPANY);

            const where = (service as any).prisma.accountingDocument.findMany.mock.calls[0][0].where;
            expect(where.balanceDue).toEqual({ gt: 0 });
        });

        it('чужие счета в план не берутся', async () => {
            const service = makeService([invoice()]);

            await service.getPlannedPayments(COMPANY);

            const where = (service as any).prisma.accountingDocument.findMany.mock.calls[0][0].where;
            expect(where.companyId).toBe(COMPANY);
        });
    });

    describe('долги без счёта не теряются', () => {
        it('сделка с долгом и без счёта показана отдельным блоком', async () => {
            // В план платежей она не попадает — срок ещё не начался, — но и
            // молча исчезнуть не должна: это работа для бухгалтера.
            const service = makeService([], [orderWithDebt()]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.rows).toHaveLength(0);
            expect(result.withoutInvoice.count).toBe(1);
            expect(result.withoutInvoice.totalIn).toBe(70000);
            expect(result.withoutInvoice.items[0].orderNumber).toBe('ЗК-009');
        });

        it('оплаченная сделка без счёта в блок не попадает', async () => {
            const service = makeService([], [
                orderWithDebt({ isCustomerPaid: true, payments: [] }),
            ]);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.withoutInvoice.count).toBe(0);
        });

        it('считаются все сделки с долгом, а не только показанные', async () => {
            const many = Array.from({ length: 14 }, (_, i) =>
                orderWithDebt({ id: `o-${i}`, orderNumber: `ЗК-${i}` }));
            const service = makeService([], many);

            const result = await service.getPlannedPayments(COMPANY);

            expect(result.withoutInvoice.count).toBe(14);
            expect(result.withoutInvoice.items).toHaveLength(10);
        });

        it('в выборку берутся только рейсы без проведённого счёта', async () => {
            const service = makeService([], [orderWithDebt()]);

            await service.getPlannedPayments(COMPANY);

            const where = (service as any).prisma.order.findMany.mock.calls[0][0].where;
            expect(where.accountingDocuments.none.document).toMatchObject({
                type: 'PAYMENT_INVOICE',
                status: 'POSTED',
            });
        });
    });
});
