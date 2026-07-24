import { PayrollService } from './payroll.service';
import { FinanceCalculatorService } from '../accounting/services/finance-calculator.service';

const COMPANY = 'company-1';
const MANAGER = 'manager-1';
const ORDER = 'order-1';

function makePrismaMock() {
    return {
        order: {
            findUnique: jest.fn(),
            count: jest.fn(),
        },
        payrollScheme: {
            findFirst: jest.fn(),
        },
        payrollAccrual: {
            create: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        payrollKpiRule: {
            findMany: jest.fn(),
        },
        closedPeriod: {
            findUnique: jest.fn(),
        },
        payment: { findMany: jest.fn() },
        income: { findMany: jest.fn() },
        expense: { findMany: jest.fn() },
    };
}

function makeOrder(overrides: Record<string, any> = {}) {
    return {
        id: ORDER,
        customerPrice: 500000,
        driverCost: 400000,
        subForwarderPrice: null,
        customerCompanyId: 'company-customer',
        forwarderId: COMPANY,
        subForwarderId: null,
        partnerId: null,
        vatRate: 0,
        hasVat: false,
        executorVatRate: 0,
        executorHasVat: false,
        responsibleManagerId: MANAGER,
        responsibleManager: { id: MANAGER, companyId: COMPANY },
        ...overrides,
    };
}

const percentScheme = (overrides: Record<string, any> = {}) => ({
    id: 'scheme-1',
    type: 'PERCENT',
    isActive: true,
    accrualStatus: 'COMPLETED',
    percentBase: 'ORDER_AMOUNT',
    percentValue: 5,
    fixedAmount: 0,
    ...overrides,
});

describe('PayrollService.processOrderTrigger — процент менеджера по статусу-триггеру', () => {
    let prisma: ReturnType<typeof makePrismaMock>;
    let service: PayrollService;

    beforeEach(() => {
        prisma = makePrismaMock();
        service = new PayrollService(prisma as any, new FinanceCalculatorService());
    });

    it('начисляет процент от суммы заказа при совпадении триггера', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
        const data = prisma.payrollAccrual.create.mock.calls[0][0].data;
        expect(data.kind).toBe('PERCENT');
        expect(data.userId).toBe(MANAGER);
        expect(data.orderId).toBe(ORDER);
        expect(data.baseAmount).toBe(500000);
        expect(data.amount).toBe(25000); // 5% от 500 000
    });

    it('понимает триггер в формате STATUS:<статус>', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());

        await service.processOrderTrigger(ORDER, 'STATUS:COMPLETED');

        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
    });

    it('не начисляет при несовпадении статуса-триггера', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst
            .mockResolvedValueOnce(percentScheme({ accrualStatus: 'DELIVERED' }))
            .mockResolvedValueOnce(null);

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });

    it('не начисляет процент при схеме FIXED (только оклад)', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme({ type: 'FIXED' }));

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });

    it('не начисляет, если у заявки нет ответственного менеджера', async () => {
        prisma.order.findUnique.mockResolvedValue(
            makeOrder({ responsibleManagerId: null, responsibleManager: null }),
        );

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollScheme.findFirst).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });

    it('при отсутствии персональной схемы берёт общую схему компании', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst
            .mockResolvedValueOnce(null) // персональной нет
            .mockResolvedValueOnce(percentScheme()); // общая

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollScheme.findFirst).toHaveBeenCalledTimes(2);
        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
    });

    it('процент от маржи: база считается калькулятором финансов', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(
            percentScheme({ percentBase: 'MARGIN', percentValue: 10 }),
        );
        prisma.payment.findMany.mockResolvedValue([]);
        prisma.income.findMany.mockResolvedValue([]);
        prisma.expense.findMany.mockResolvedValue([]);

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        const data = prisma.payrollAccrual.create.mock.calls[0][0].data;
        expect(data.baseAmount).toBe(100000); // маржа: 500 000 - 400 000
        expect(data.amount).toBe(10000); // 10% от маржи
    });

    it('повторное срабатывание триггера обновляет сумму начисления, а не создаёт дубль', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());
        // Уже есть начисление от предыдущего расчёта (заявку пересчитали — маржа изменилась)
        prisma.payrollAccrual.findUnique.mockResolvedValue({ id: 'acc-1', amount: 10000, baseAmount: 200000 });

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'acc-1' },
                data: expect.objectContaining({ amount: 25000, baseAmount: 500000 }), // 5% от 500 000
            }),
        );
    });

    it('повторное срабатывание с той же суммой ничего не перезаписывает', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());
        prisma.payrollAccrual.findUnique.mockResolvedValue({ id: 'acc-1', amount: 25000, baseAmount: 500000 });

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.update).not.toHaveBeenCalled();
    });

    it('отмена заявки сторнирует ранее начисленный процент (обнуляет, не удаляет)', async () => {
        prisma.payrollAccrual.findFirst.mockResolvedValue({ id: 'acc-1', amount: 25000, schemeSnapshot: { foo: 'bar' } });

        await service.processOrderTrigger(ORDER, 'STATUS:CANCELLED');

        expect(prisma.payrollAccrual.findFirst).toHaveBeenCalledWith({ where: { orderId: ORDER, kind: 'PERCENT' } });
        expect(prisma.payrollAccrual.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'acc-1' },
                data: expect.objectContaining({ amount: 0 }),
            }),
        );
        // Отмена — не обычный статус-триггер схемы, до поиска схемы дело не доходит
        expect(prisma.order.findUnique).not.toHaveBeenCalled();
        expect(prisma.payrollScheme.findFirst).not.toHaveBeenCalled();
    });

    it('отмена заявки без начисления ничего не делает', async () => {
        prisma.payrollAccrual.findFirst.mockResolvedValue(null);

        await service.processOrderTrigger(ORDER, 'STATUS:CANCELLED');

        expect(prisma.payrollAccrual.update).not.toHaveBeenCalled();
    });
});

describe('PayrollService.ensureMonthlyAccruals — оклады и KPI-бонусы за месяц', () => {
    let prisma: ReturnType<typeof makePrismaMock>;
    let service: PayrollService;
    const MONTH = '2026-06';

    beforeEach(() => {
        prisma = makePrismaMock();
        service = new PayrollService(prisma as any, new FinanceCalculatorService());
        prisma.closedPeriod.findUnique.mockResolvedValue(null);
        prisma.payrollKpiRule.findMany.mockResolvedValue([]);
        prisma.payrollAccrual.findFirst.mockResolvedValue(null);
    });

    it('создаёт начисление оклада для схемы FIXED', async () => {
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(
            percentScheme({ type: 'FIXED', fixedAmount: 300000 }),
        );

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
        const data = prisma.payrollAccrual.create.mock.calls[0][0].data;
        expect(data.kind).toBe('SALARY');
        expect(data.amount).toBe(300000);
        expect(data.periodMonth).toBe(MONTH);
    });

    it('обновляет оклад, если сумма в схеме изменилась', async () => {
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(
            percentScheme({ type: 'FIXED', fixedAmount: 350000 }),
        );
        prisma.payrollAccrual.findFirst.mockResolvedValueOnce({ id: 'acc-1', amount: 300000 });

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'acc-1' },
                data: expect.objectContaining({ amount: 350000 }),
            }),
        );
    });

    it('не трогает начисления в закрытом периоде', async () => {
        prisma.closedPeriod.findUnique.mockResolvedValue({ id: 'closed-1' });

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollScheme.findFirst).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });

    it('игнорирует будущие месяцы', async () => {
        await service.ensureMonthlyAccruals(COMPANY, MANAGER, ['2999-01']);

        expect(prisma.closedPeriod.findUnique).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });

    it('начисляет KPI-бонус при достижении порога завершённых заявок', async () => {
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());
        prisma.payrollKpiRule.findMany.mockResolvedValue([
            { id: 'kpi-1', metric: 'COMPLETED_ORDERS_MONTH', threshold: 10, bonusAmount: 50000, isActive: true },
        ]);
        prisma.order.count.mockResolvedValue(12);

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
        const data = prisma.payrollAccrual.create.mock.calls[0][0].data;
        expect(data.kind).toBe('KPI');
        expect(data.amount).toBe(50000);
        expect(data.kpiRuleId).toBe('kpi-1');
    });

    it('не начисляет KPI-бонус, если порог не достигнут', async () => {
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());
        prisma.payrollKpiRule.findMany.mockResolvedValue([
            { id: 'kpi-1', metric: 'COMPLETED_ORDERS_MONTH', threshold: 10, bonusAmount: 50000, isActive: true },
        ]);
        prisma.order.count.mockResolvedValue(9);

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });
});
