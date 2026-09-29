import { Prisma } from '@prisma/client';
import { PayrollService } from './payroll.service';
import { toNum } from '../common/utils/money';
import { FinanceCalculatorService } from '../accounting/services/finance-calculator.service';
import { kzCurrentMonth } from '../common/utils/business-date';

const COMPANY = 'company-1';
const MANAGER = 'manager-1';
const CREATOR = 'creator-1';
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
            findMany: jest.fn().mockResolvedValue([]),
            update: jest.fn(),
        },
        payrollKpiRule: {
            findMany: jest.fn(),
        },
        closedPeriod: {
            findUnique: jest.fn(),
        },
        // Сотрудник заведён в компании с начала 2026 года и работает.
        user: {
            findUnique: jest.fn().mockResolvedValue({
                isActive: true, companyId: COMPANY, createdAt: new Date('2026-01-10T00:00:00Z'),
            }),
        },
        userCompanyRelation: { findUnique: jest.fn() },
        payment: { findMany: jest.fn() },
        // Доли общих платежей: расчёт маржи спрашивает про них наравне
        // с обычными платежами по заявке.
        paymentOrderShare: { findMany: jest.fn().mockResolvedValue([]) },
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
        expect(toNum(data.baseAmount)).toBe(500000);
        expect(toNum(data.amount)).toBe(25000); // 5% от 500 000
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
        expect(toNum(data.baseAmount)).toBe(100000); // маржа: 500 000 - 400 000
        expect(toNum(data.amount)).toBe(10000); // 10% от маржи
    });

    it('повторное срабатывание триггера обновляет сумму начисления, а не создаёт дубль', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder());
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());
        // Уже есть начисление от предыдущего расчёта (заявку пересчитали — маржа изменилась)
        prisma.payrollAccrual.findUnique.mockResolvedValue({ id: 'acc-1', amount: 10000, baseAmount: 200000 });

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.update).toHaveBeenCalledTimes(1);

        const { where, data } = prisma.payrollAccrual.update.mock.calls[0][0];
        expect(where).toEqual({ id: 'acc-1' });
        expect(toNum(data.amount)).toBe(25000); // 5% от 500 000
        expect(toNum(data.baseAmount)).toBe(500000);
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
        prisma.payrollAccrual.findMany.mockResolvedValue([
            { id: 'acc-1', companyId: COMPANY, periodMonth: '2026-06', amount: 25000, schemeSnapshot: { foo: 'bar' } },
        ]);

        await service.processOrderTrigger(ORDER, 'STATUS:CANCELLED');

        expect(prisma.payrollAccrual.findMany).toHaveBeenCalledWith({ where: { orderId: ORDER, kind: 'PERCENT' } });
        expect(prisma.payrollAccrual.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'acc-1' },
                data: expect.objectContaining({ amount: 0 }),
            }),
        );
        expect(prisma.payrollAccrual.update.mock.calls[0][0].data.schemeSnapshot._reversedReason).toBe('order_cancelled');
        // Отмена — не обычный статус-триггер схемы, до поиска схемы дело не доходит
        expect(prisma.order.findUnique).not.toHaveBeenCalled();
        expect(prisma.payrollScheme.findFirst).not.toHaveBeenCalled();
    });

    it('отмена заявки без начисления ничего не делает', async () => {
        prisma.payrollAccrual.findMany.mockResolvedValue([]);

        await service.processOrderTrigger(ORDER, 'STATUS:CANCELLED');

        expect(prisma.payrollAccrual.update).not.toHaveBeenCalled();
    });

    it('отмена в закрытом периоде начисление не трогает', async () => {
        prisma.payrollAccrual.findMany.mockResolvedValue([
            { id: 'acc-1', companyId: COMPANY, periodMonth: '2026-06', amount: 25000, schemeSnapshot: {} },
        ]);
        prisma.closedPeriod.findUnique.mockResolvedValue({ id: 'closed-1' });

        await service.processOrderTrigger(ORDER, 'STATUS:CANCELLED');

        expect(prisma.payrollAccrual.update).not.toHaveBeenCalled();
    });
});

describe('PayrollService — процент получает ответственный из карточки рейса', () => {
    let prisma: ReturnType<typeof makePrismaMock>;
    let service: PayrollService;

    beforeEach(() => {
        prisma = makePrismaMock();
        service = new PayrollService(prisma as any, new FinanceCalculatorService());
    });

    it('заявку завёл один, ответственный — другой: процент ответственному', async () => {
        // Помощник вбил заявку на менеджера. Раньше процент уходил помощнику.
        prisma.order.findUnique.mockResolvedValue(makeOrder({
            responsibleManagerId: CREATOR,
            responsibleManager: { id: CREATOR, companyId: COMPANY },
            responsibles: [{ companyId: COMPANY, userId: MANAGER }],
        }));
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollScheme.findFirst).toHaveBeenCalledWith({
            where: { companyId: COMPANY, userId: MANAGER, isActive: true },
        });
        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
        const data = prisma.payrollAccrual.create.mock.calls[0][0].data;
        expect(data.userId).toBe(MANAGER);
        expect(data.companyId).toBe(COMPANY);
    });

    it('процент по схеме той компании, где человек ответственный, а не его домашней', async () => {
        // Менеджер числится в компании A, а рейс ведёт от организации B.
        prisma.order.findUnique.mockResolvedValue(makeOrder({
            responsibleManager: { id: MANAGER, companyId: 'company-A' },
            responsibles: [{ companyId: 'company-B', userId: MANAGER }],
        }));
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollScheme.findFirst.mock.calls[0][0].where.companyId).toBe('company-B');
        expect(prisma.payrollAccrual.create.mock.calls[0][0].data.companyId).toBe('company-B');
    });

    it('у каждой компании-участника свой ответственный и своя схема', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder({
            responsibles: [
                { companyId: COMPANY, userId: MANAGER },
                { companyId: 'company-customer', userId: 'customer-manager' },
            ],
        }));
        prisma.payrollScheme.findFirst
            .mockResolvedValueOnce(percentScheme())          // наш менеджер — персональная
            .mockResolvedValueOnce(null)                     // у заказчика персональной нет
            .mockResolvedValueOnce(null);                    // и общей нет

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
        expect(prisma.payrollAccrual.create.mock.calls[0][0].data.userId).toBe(MANAGER);
    });

    it('если процент раньше достался другому в этой компании — у него сторнируется', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder({
            responsibles: [{ companyId: COMPANY, userId: MANAGER }],
        }));
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());
        prisma.payrollAccrual.findMany.mockResolvedValue([
            { id: 'old', companyId: COMPANY, userId: CREATOR, periodMonth: '2026-06', amount: 25000, schemeSnapshot: {} },
        ]);

        await service.processOrderTrigger(ORDER, 'COMPLETED');

        expect(prisma.payrollAccrual.findMany).toHaveBeenCalledWith({
            where: { orderId: ORDER, companyId: COMPANY, kind: 'PERCENT', userId: { not: MANAGER } },
        });
        const reversal = prisma.payrollAccrual.update.mock.calls.find((c: any) => c[0].where.id === 'old');
        expect(reversal[0].data.amount).toBe(0);
        expect(reversal[0].data.schemeSnapshot._reversedReason).toBe('responsible_changed');
    });

    it('рейс передали после завершения — процент переходит новому ответственному', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder({
            status: 'COMPLETED',
            responsibles: [{ companyId: COMPANY, userId: MANAGER }],
        }));
        prisma.payrollAccrual.findMany
            .mockResolvedValueOnce([
                { id: 'old', companyId: COMPANY, userId: CREATOR, periodMonth: '2026-06', amount: 25000, schemeSnapshot: {} },
            ])
            .mockResolvedValueOnce([
                { id: 'old', companyId: COMPANY, userId: CREATOR, periodMonth: '2026-06', amount: 25000, schemeSnapshot: {} },
            ]);
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());

        await service.onResponsibleChanged(ORDER, COMPANY);

        expect(prisma.payrollAccrual.create.mock.calls[0][0].data.userId).toBe(MANAGER);
        expect(toNum(prisma.payrollAccrual.create.mock.calls[0][0].data.amount)).toBe(25000);
        const reversal = prisma.payrollAccrual.update.mock.calls.find((c: any) => c[0].where.id === 'old');
        expect(reversal[0].data.amount).toBe(0);
    });

    it('рейс передали до завершения — начислять пока нечего', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder({
            status: 'IN_TRANSIT',
            responsibles: [{ companyId: COMPANY, userId: MANAGER }],
        }));
        prisma.payrollAccrual.findMany.mockResolvedValue([]);

        await service.onResponsibleChanged(ORDER, COMPANY);

        expect(prisma.payrollScheme.findFirst).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.update).not.toHaveBeenCalled();
    });

    it('оплату сняли — процент «за оплату» снимается', async () => {
        prisma.payrollAccrual.findMany.mockResolvedValue([
            { id: 'paid', companyId: COMPANY, periodMonth: '2026-06', amount: 25000, schemeSnapshot: { accrualStatus: 'CUSTOMER_PAID' } },
            { id: 'done', companyId: COMPANY, periodMonth: '2026-06', amount: 10000, schemeSnapshot: { accrualStatus: 'COMPLETED' } },
        ]);
        prisma.order.findUnique.mockResolvedValue({ isCustomerPaid: false });

        await service.revokeUnpaidPercent(ORDER);

        // Процент за завершение рейса оплата не касается.
        expect(prisma.payrollAccrual.update).toHaveBeenCalledTimes(1);
        const { where, data } = prisma.payrollAccrual.update.mock.calls[0][0];
        expect(where).toEqual({ id: 'paid' });
        expect(data.amount).toBe(0);
        expect(data.schemeSnapshot._reversedReason).toBe('payment_cancelled');
    });

    it('заявка по-прежнему оплачена — процент остаётся', async () => {
        prisma.payrollAccrual.findMany.mockResolvedValue([
            { id: 'paid', companyId: COMPANY, periodMonth: '2026-06', amount: 25000, schemeSnapshot: { accrualStatus: 'CUSTOMER_PAID' } },
        ]);
        prisma.order.findUnique.mockResolvedValue({ isCustomerPaid: true });

        await service.revokeUnpaidPercent(ORDER);

        expect(prisma.payrollAccrual.update).not.toHaveBeenCalled();
    });

    it('процента за оплату нет — заявку даже не читаем', async () => {
        prisma.payrollAccrual.findMany.mockResolvedValue([]);

        await service.revokeUnpaidPercent(ORDER);

        expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('заказчик оплатил снова — процент возвращается в текущий месяц', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder({ responsibles: [{ companyId: COMPANY, userId: MANAGER }] }));
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme({ accrualStatus: 'CUSTOMER_PAID' }));
        // Снятый в июне процент; июнь уже закрыт — сумма в нём ноль и такой останется.
        prisma.payrollAccrual.findUnique.mockResolvedValue({
            id: 'acc-1', companyId: COMPANY, periodMonth: '2026-06', amount: 0, baseAmount: 500000,
        });
        prisma.closedPeriod.findUnique.mockResolvedValue({ id: 'closed-june' });

        await service.processOrderTrigger(ORDER, 'CUSTOMER_PAID');

        const { where, data } = prisma.payrollAccrual.update.mock.calls[0][0];
        expect(where).toEqual({ id: 'acc-1' });
        expect(toNum(data.amount)).toBe(25000);
        expect(data.periodMonth).toBe(kzCurrentMonth());
    });

    it('повторный расчёт в закрытом периоде сумму не меняет', async () => {
        prisma.order.findUnique.mockResolvedValue(makeOrder({ responsibles: [{ companyId: COMPANY, userId: MANAGER }] }));
        prisma.payrollScheme.findFirst.mockResolvedValueOnce(percentScheme());
        prisma.payrollAccrual.findUnique.mockResolvedValue({
            id: 'acc-1', companyId: COMPANY, periodMonth: '2026-06', amount: 10000, baseAmount: 200000,
        });
        prisma.closedPeriod.findUnique.mockResolvedValue({ id: 'closed-1' });

        await service.processOrderTrigger(ORDER, 'COMPLETED');

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

    it('оклад только с месяца, когда человек пришёл в компанию', async () => {
        // Принят 15 августа — отчёт «с июня» не должен давать ему оклад за июнь и июль.
        prisma.user.findUnique.mockResolvedValue({
            isActive: true, companyId: COMPANY, createdAt: new Date('2026-08-15T06:00:00Z'),
        });
        prisma.payrollScheme.findFirst.mockResolvedValue(percentScheme({ type: 'FIXED', fixedAmount: 300000 }));

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, ['2026-06', '2026-07', '2026-08']);

        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
        expect(prisma.payrollAccrual.create.mock.calls[0][0].data.periodMonth).toBe('2026-08');
    });

    it('в другой организации — с даты, когда человека туда добавили', async () => {
        prisma.user.findUnique.mockResolvedValue({
            isActive: true, companyId: 'home-company', createdAt: new Date('2025-01-01T00:00:00Z'),
        });
        prisma.userCompanyRelation.findUnique.mockResolvedValue({ createdAt: new Date('2026-07-03T00:00:00Z') });
        prisma.payrollScheme.findFirst.mockResolvedValue(percentScheme({ type: 'FIXED', fixedAmount: 300000 }));

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, ['2026-06', '2026-07']);

        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
        expect(prisma.payrollAccrual.create.mock.calls[0][0].data.periodMonth).toBe('2026-07');
    });

    it('удалённому сотруднику новых начислений нет', async () => {
        prisma.user.findUnique.mockResolvedValue({
            isActive: false, companyId: COMPANY, createdAt: new Date('2026-01-01T00:00:00Z'),
        });

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollScheme.findFirst).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });

    it('человеку не из этой компании ничего не начисляется', async () => {
        prisma.user.findUnique.mockResolvedValue({
            isActive: true, companyId: 'other', createdAt: new Date('2026-01-01T00:00:00Z'),
        });
        prisma.userCompanyRelation.findUnique.mockResolvedValue(null);

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });

    it('бонус начисляется и без схемы оклада или процента', async () => {
        prisma.payrollScheme.findFirst.mockResolvedValue(null);
        prisma.payrollKpiRule.findMany.mockResolvedValue([
            { id: 'kpi-1', metric: 'COMPLETED_ORDERS_MONTH', threshold: 10, bonusAmount: 50000, isActive: true },
        ]);
        prisma.order.count.mockResolvedValue(10);

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollAccrual.create).toHaveBeenCalledTimes(1);
        expect(prisma.payrollAccrual.create.mock.calls[0][0].data.kind).toBe('KPI');
    });

    it('рейсы для бонуса — те, что человек вёл в этой компании, по месяцу Казахстана', async () => {
        prisma.payrollScheme.findFirst.mockResolvedValue(null);
        prisma.payrollKpiRule.findMany.mockResolvedValue([
            { id: 'kpi-1', metric: 'COMPLETED_ORDERS_MONTH', threshold: 1, bonusAmount: 50000, isActive: true },
        ]);
        prisma.order.count.mockResolvedValue(0);

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        const where = prisma.order.count.mock.calls[0][0].where;
        expect(where.AND[0].OR[0]).toEqual({ responsibles: { some: { companyId: COMPANY, userId: MANAGER } } });
        // Июнь по Алматы начинается 31 мая в 19:00 UTC.
        expect(where.AND[1].completedAt.gte.toISOString()).toBe('2026-05-31T19:00:00.000Z');
        expect(where.AND[1].completedAt.lt.toISOString()).toBe('2026-06-30T19:00:00.000Z');
    });

    it('норма перестала выполняться — бонус снимается', async () => {
        prisma.payrollScheme.findFirst.mockResolvedValue(null);
        prisma.payrollKpiRule.findMany.mockResolvedValue([
            { id: 'kpi-1', metric: 'COMPLETED_ORDERS_MONTH', threshold: 10, bonusAmount: 50000, isActive: true },
        ]);
        prisma.order.count.mockResolvedValue(9); // один рейс отменили
        prisma.payrollAccrual.findFirst.mockResolvedValue({ id: 'kpi-acc', amount: new Prisma.Decimal(50000) });

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollAccrual.update).toHaveBeenCalledTimes(1);
        const { where, data } = prisma.payrollAccrual.update.mock.calls[0][0];
        expect(where).toEqual({ id: 'kpi-acc' });
        expect(data.amount).toBe(0);
        expect(data.schemeSnapshot._reversedReason).toBe('threshold_not_met');
    });

    it('оклад убрали из схемы — в текущем месяце он обнуляется', async () => {
        const current = kzCurrentMonth();
        prisma.payrollScheme.findFirst.mockResolvedValue(percentScheme({ type: 'PERCENT', fixedAmount: 0 }));
        prisma.payrollAccrual.findFirst.mockResolvedValueOnce({ id: 'sal', amount: new Prisma.Decimal(300000) });

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [current]);

        expect(prisma.payrollAccrual.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'sal' }, data: expect.objectContaining({ amount: 0 }) }),
        );
    });

    it('та же сумма оклада — запись не переписывается', async () => {
        // Суммы из базы приходят объектами Decimal: сравнение `!==` считало
        // их разными всегда и переписывало оклад при каждом открытии отчёта.
        prisma.payrollScheme.findFirst.mockResolvedValue(
            percentScheme({ type: 'FIXED', fixedAmount: new Prisma.Decimal(300000) }),
        );
        prisma.payrollAccrual.findFirst.mockResolvedValueOnce({ id: 'sal', amount: new Prisma.Decimal(300000) });

        await service.ensureMonthlyAccruals(COMPANY, MANAGER, [MONTH]);

        expect(prisma.payrollAccrual.update).not.toHaveBeenCalled();
        expect(prisma.payrollAccrual.create).not.toHaveBeenCalled();
    });
});
