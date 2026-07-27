import { BadRequestException } from '@nestjs/common';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

import { FinancialReportsService } from './financial-reports.service';
import { FinanceCalculatorService } from './finance-calculator.service';

const COMPANY = 'company-1';

const order = (id: string, createdAt: string) => ({
    id,
    orderNumber: id.toUpperCase(),
    createdAt: new Date(createdAt),
    status: 'COMPLETED',
    cargoDescription: 'Груз',
    customerPrice: 100000,
    customerPriceType: null,
    customerPaidAt: null,
    customerPaymentCondition: null,
    customerPaymentForm: null,
    completedAt: null,
    driverCost: 80000,
    subForwarderPrice: null,
    subForwarderId: null,
    driverPaidAt: null,
    subForwarderPaidAt: null,
    driverPaymentCondition: null,
    driverPaymentForm: null,
    assignedDriverName: null,
    assignedDriverPhone: null,
    customerCompany: { id: 'company-2', name: 'Контрагент' },
    customer: null,
    driver: null,
    partner: null,
    subForwarder: null,
    payments: [],
    incomes: [],
    expenses: [],
});

const makeService = () => {
    const prisma: any = {
        order: {
            findMany: jest.fn().mockResolvedValue([
                order('o-1', '2026-06-10T10:00:00.000Z'),
                order('o-2', '2026-06-20T10:00:00.000Z'),
            ]),
            count: jest.fn().mockResolvedValue(37),
        },
    };
    const service = new FinancialReportsService(
        prisma,
        {} as any,
        {} as any,
        new FinanceCalculatorService() as any,
        {} as any,
        {} as any,
        {} as any,
    
        {} as any, // shareLinks
    );
    return { service, prisma };
};

/**
 * T-08: журналы грузили всю историю разом — на большой базе это единственный
 * запрос, который кладёт раздел. Здесь проверяется, что период и страница
 * доходят до запроса, а прежние вызовы без параметров не меняют ни форму
 * ответа, ни отбор.
 */
describe('FinancialReportsService — период и страница журналов', () => {
    describe('журнал доходов', () => {
        it('без параметров отдаёт массив и не ограничивает выборку', async () => {
            const { service, prisma } = makeService();

            const result = await service.getIncomesJournal(COMPANY);

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
            const args = prisma.order.findMany.mock.calls[0][0];
            expect(args.where.createdAt).toBeUndefined();
            expect(args.skip).toBeUndefined();
            expect(args.take).toBeUndefined();
            // Считать total незачем, пока страницу не попросили
            expect(prisma.order.count).not.toHaveBeenCalled();
        });

        it('период уходит в запрос, а конец периода растянут до конца суток', async () => {
            const { service, prisma } = makeService();

            await service.getIncomesJournal(COMPANY, { from: '2026-06-01', to: '2026-06-30' });

            const { createdAt } = prisma.order.findMany.mock.calls[0][0].where;
            expect(createdAt.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'));
            expect(createdAt.lte).toEqual(new Date('2026-06-30T23:59:59.999Z'));
        });

        it('со страницей отдаёт data, total и число страниц', async () => {
            const { service, prisma } = makeService();

            const result: any = await service.getIncomesJournal(COMPANY, { page: '2', limit: '10' });

            expect(result.data).toHaveLength(2);
            expect(result).toMatchObject({ total: 37, page: 2, limit: 10, totalPages: 4 });
            const args = prisma.order.findMany.mock.calls[0][0];
            expect(args.skip).toBe(10);
            expect(args.take).toBe(10);
        });

        it('перевёрнутый период — понятная ошибка, а не пустой журнал', async () => {
            const { service } = makeService();

            await expect(service.getIncomesJournal(COMPANY, { from: '2026-07-01', to: '2026-06-01' }))
                .rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('журнал расходов', () => {
        it('без параметров отдаёт массив, как раньше', async () => {
            const { service, prisma } = makeService();

            const result = await service.getExpensesJournal(COMPANY);

            expect(Array.isArray(result)).toBe(true);
            expect(prisma.order.findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
        });

        it('считает total по тому же отбору, что и страницу', async () => {
            const { service, prisma } = makeService();

            const result: any = await service.getExpensesJournal(COMPANY, {
                from: '2026-06-01',
                page: '1',
                limit: '20',
            });

            expect(result.total).toBe(37);
            const listWhere = prisma.order.findMany.mock.calls[0][0].where;
            const countWhere = prisma.order.count.mock.calls[0][0].where;
            // Иначе «всего 37» относилось бы к другой выборке, чем сами строки
            expect(countWhere).toEqual(listWhere);
        });
    });

    describe('реестр заявок', () => {
        it('без параметров отдаёт массив', async () => {
            const { service, prisma } = makeService();

            const result = await service.getFinancialRegistry(COMPANY);

            expect(Array.isArray(result)).toBe(true);
            expect(prisma.order.count).not.toHaveBeenCalled();
        });

        it('со страницей отдаёт data и total по тому же отбору', async () => {
            const { service, prisma } = makeService();

            const result: any = await service.getFinancialRegistry(COMPANY, {
                from: '2026-06-01',
                to: '2026-06-30',
                page: '1',
                limit: '25',
            });

            expect(result).toMatchObject({ total: 37, page: 1, limit: 25, totalPages: 2 });
            expect(prisma.order.count.mock.calls[0][0].where)
                .toEqual(prisma.order.findMany.mock.calls[0][0].where);
        });
    });

    // Планируемые платежи сортируются по сроку оплаты и считают итоги уже в
    // памяти, по всей выборке. Страница здесь порезала бы итоги, поэтому у
    // этого журнала только период — форма ответа не меняется.
    describe('планируемые платежи', () => {
        it('период фильтрует, а форма ответа остаётся прежней', async () => {
            const { service, prisma } = makeService();

            const result: any = await service.getPlannedPayments(COMPANY, {
                from: '2026-06-01',
                to: '2026-06-30',
                page: '2',
                limit: '5',
            });

            expect(result).toHaveProperty('rows');
            expect(result).toHaveProperty('totals');
            const args = prisma.order.findMany.mock.calls[0][0];
            expect(args.where.createdAt.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'));
            expect(args.skip).toBeUndefined();
            expect(args.take).toBeUndefined();
        });
    });
});
