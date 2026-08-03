import { Prisma } from '@prisma/client';
import { FinancialReportsService } from './financial-reports.service';
import { FinanceCalculatorService } from './finance-calculator.service';

const COMPANY = 'company-1';
const CUSTOMER = 'company-2';

const D = (v: string | number) => new Prisma.Decimal(v);

/**
 * Один рейс: мы экспедитор, заказчик — CUSTOMER. Платежи и документы
 * подставляются в каждом тесте свои.
 */
const order = (overrides: Record<string, unknown> = {}) => ({
    id: 'o-1',
    orderNumber: 'ЗК-001',
    createdAt: new Date('2026-07-01'),
    completedAt: new Date('2026-07-05'),
    status: 'COMPLETED',
    cargoDescription: 'напитки',
    customerPrice: D(100000),
    subForwarderPrice: null,
    driverCost: D(70000),
    customerCompanyId: CUSTOMER,
    customerCompany: { id: CUSTOMER, name: 'ТОО «Заказчик»' },
    forwarderId: COMPANY,
    forwarder: { id: COMPANY, name: 'Мы' },
    subForwarderId: null,
    subForwarder: null,
    partnerId: null,
    partner: null,
    driver: null,
    routePoints: [],
    customerPaymentDate: new Date('2026-07-20'),
    driverPaymentDate: null,
    customerPaidAt: null,
    subForwarderPaidAt: null,
    driverPaidAt: null,
    isCustomerPaid: false,
    isDriverPaid: false,
    isSubForwarderPaid: false,
    assignedDriverPlate: null,
    payments: [],
    incomes: [],
    expenses: [],
    accountingDocuments: [],
    ...overrides,
});

const paymentIn = (amount: number) => ({
    direction: 'IN',
    amount: D(amount),
    companyId: COMPANY,
});

const invoiceLink = (overrides: Record<string, unknown> = {}) => ({
    document: {
        id: 'doc-1',
        number: 'СЧ-2026-000001',
        type: 'PAYMENT_INVOICE',
        direction: 'OUTGOING',
        status: 'POSTED',
        total: D(100000),
        amountPaid: D(0),
        balanceDue: D(100000),
        dueDate: new Date('2026-07-20'),
        ...overrides,
    },
});

function makeService(orders: any[]) {
    const prisma: any = {
        order: { findMany: jest.fn().mockResolvedValue(orders) },
        counterpartyOpeningBalance: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return new FinancialReportsService(
        prisma,
        {} as any,
        {} as any,
        new FinanceCalculatorService() as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        // переоценки: в этом тесте не участвуют
        { differencesForPeriod: async () => ({ gain: 0, loss: 0, net: 0, rows: [] }) } as any,
    );
}

/** Строка рейса со стороны заказчика — та, где деньги должны нам. */
async function customerRow(orders: any[]) {
    const service = makeService(orders);
    const report = await service.getCounterpartyReport(COMPANY);
    const entry = report.counterparties.find((c: any) => c.counterparty.id === CUSTOMER);
    return entry?.orders.find((o: any) => o.direction === 'theyOwe');
}

describe('Взаиморасчёты: состояние оплаты и счёт по каждому рейсу', () => {
    describe('состояние оплаты', () => {
        it('без платежей — не оплачено, остаток равен сумме', async () => {
            const row = await customerRow([order()]);

            expect(row.paymentState).toBe('UNPAID');
            expect(row.paidAmount).toBe(0);
            expect(row.remaining).toBe(100000);
        });

        it('частичная оплата видна как частичная, а не как неоплата', async () => {
            // Главное, ради чего задача: раньше был только флаг «оплачено»,
            // и пришедшие 40 000 из 100 000 выглядели как полная неоплата.
            const row = await customerRow([order({ payments: [paymentIn(40000)] })]);

            expect(row.paymentState).toBe('PARTIAL');
            expect(row.paidAmount).toBe(40000);
            expect(row.remaining).toBe(60000);
        });

        it('полная оплата закрывает остаток', async () => {
            const row = await customerRow([order({ payments: [paymentIn(100000)] })]);

            expect(row.paymentState).toBe('PAID');
            expect(row.remaining).toBe(0);
        });

        it('переплата не даёт отрицательного остатка', async () => {
            const row = await customerRow([order({ payments: [paymentIn(130000)] })]);

            expect(row.remaining).toBe(0);
            expect(row.paymentState).toBe('PAID');
        });

        it('канонический флаг оплаты важнее видимых платежей', async () => {
            // Платёж мог провести встречная сторона — тогда мы его не видим,
            // но факт оплаты сохранён в заявке и должен побеждать.
            const row = await customerRow([order({ isCustomerPaid: true, payments: [] })]);

            expect(row.paymentState).toBe('PAID');
        });
    });

    describe('счёт по рейсу', () => {
        it('без документов счёта нет', async () => {
            const row = await customerRow([order()]);

            expect(row.invoice).toBeNull();
        });

        it('показывает номер и остаток по выставленному счёту', async () => {
            const row = await customerRow([order({ accountingDocuments: [invoiceLink()] })]);

            expect(row.invoice).toMatchObject({
                number: 'СЧ-2026-000001',
                status: 'POSTED',
                balanceDue: 100000,
            });
        });

        it('отменённый счёт не считается выставленным', async () => {
            // Иначе ошибочно отменённый счёт навсегда прятал бы рейс из
            // списка «счёт не выставлен».
            const row = await customerRow([
                order({ accountingDocuments: [invoiceLink({ status: 'CANCELLED' })] }),
            ]);

            expect(row.invoice).toBeNull();
        });

        it('входящий счёт не подставляется в строку «нам должны»', async () => {
            // Строка со стороны заказчика ждёт наш исходящий счёт; счёт,
            // который выставили НАМ, к ней отношения не имеет.
            const row = await customerRow([
                order({ accountingDocuments: [invoiceLink({ direction: 'INCOMING' })] }),
            ]);

            expect(row.invoice).toBeNull();
        });

        it('акт выполненных работ не путается со счётом', async () => {
            const row = await customerRow([
                order({ accountingDocuments: [invoiceLink({ type: 'SERVICE_ACT' })] }),
            ]);

            expect(row.invoice).toBeNull();
        });
    });
});
