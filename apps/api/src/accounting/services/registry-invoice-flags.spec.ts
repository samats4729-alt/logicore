import { FinanceCalculatorService } from './finance-calculator.service';
import { FinancialReportsService } from './financial-reports.service';

/**
 * Признак «по рейсу выставлен счёт» в реестре заявок.
 *
 * Рейс без счёта — это деньги, которых мы ещё не попросили. Их не видно
 * нигде: в дебиторке их нет (пока счёта нет, долга формально нет), в списке
 * неоплаченных счетов — тоже нет, потому что счёта не существует. Рейс молча
 * выглядит как «всё в порядке», пока кто-нибудь не вспомнит.
 */
describe('Реестр: выставлен ли счёт по рейсу', () => {
    const COMPANY = 'c-1';

    const order = (documents: Array<{ direction: string }>) => ({
        id: 'o-1',
        orderNumber: '000000001',
        createdAt: new Date('2026-08-01'),
        status: 'COMPLETED',
        customerPrice: 100000,
        driverCost: 80000,
        currency: 'KZT',
        driverCostCurrency: 'KZT',
        forwarderId: COMPANY,
        customerCompanyId: 'cust-1',
        payments: [], incomes: [], expenses: [],
        routePoints: [],
        accountingDocuments: documents.map((d) => ({ document: d })),
    });

    const build = (orders: any[]) => {
        const prisma: any = {
            order: {
                findMany: jest.fn().mockResolvedValue(orders),
                count: jest.fn().mockResolvedValue(orders.length),
            },
        };
        const service = new FinancialReportsService(
            prisma, {} as any, {} as any, new FinanceCalculatorService(),
            {} as any, {} as any, {} as any, {} as any,
            { differencesForPeriod: async () => ({ gain: 0, loss: 0, net: 0, rows: [] }) } as any,
        );
        return { service, prisma };
    };

    const rowsOf = async (service: FinancialReportsService) => {
        const result = await service.getFinancialRegistry(COMPANY);
        return Array.isArray(result) ? result : result.data;
    };

    it('счёт заказчику выставлен — признак поднят', async () => {
        const { service } = build([order([{ direction: 'OUTGOING' }])]);
        const rows = await rowsOf(service);

        expect(rows[0].hasCustomerInvoice).toBe(true);
    });

    it('счёта нет — признак опущен', async () => {
        const { service } = build([order([])]);
        const rows = await rowsOf(service);

        expect(rows[0].hasCustomerInvoice).toBe(false);
    });

    it('счёт от перевозчика считается отдельно от нашего', async () => {
        // По рейсу может быть выставлен один и не выставлен другой — это две
        // разные незакрытые вещи.
        const { service } = build([order([{ direction: 'INCOMING' }])]);
        const rows = await rowsOf(service);

        expect(rows[0].hasCustomerInvoice).toBe(false);
        expect(rows[0].hasCarrierInvoice).toBe(true);
    });

    it('считаются только счета на оплату, и только не отменённые', async () => {
        // Акт выполненных работ — не счёт: по акту не платят. А отменённый
        // счёт означает, что рейс снова без счёта и должен вернуться в
        // список «надо выставить».
        const { service, prisma } = build([order([])]);
        await service.getFinancialRegistry(COMPANY);

        const include = prisma.order.findMany.mock.calls[0][0].include;
        expect(include.accountingDocuments.where.document.status).toEqual({ not: 'CANCELLED' });
        expect(include.accountingDocuments.where.document.type).toBe('PAYMENT_INVOICE');
    });
});
