import { PaymentDirection } from '@prisma/client';
import { FinanceCalculatorService } from './finance-calculator.service';

const FORWARDER = 'company-forwarder';
const CUSTOMER = 'company-customer';
const SUB = 'company-subforwarder';

type OrderInput = Parameters<FinanceCalculatorService['computeOrderFinance']>[0]['order'];

function baseOrder(overrides: Partial<OrderInput> = {}): OrderInput {
    return {
        customerPrice: 500000,
        driverCost: 400000,
        subForwarderPrice: null,
        customerCompanyId: CUSTOMER,
        forwarderId: FORWARDER,
        subForwarderId: null,
        partnerId: null,
        vatRate: 0,
        hasVat: false,
        executorVatRate: 0,
        executorHasVat: false,
        isCustomerPaid: false,
        isDriverPaid: false,
        isSubForwarderPaid: false,
        ...overrides,
    };
}

function compute(
    calc: FinanceCalculatorService,
    order: OrderInput,
    companyId: string,
    payments: Array<{ direction: PaymentDirection; amount: number; companyId: string }> = [],
    incomes: Array<{ category: string; amount: number; isDeleted?: boolean }> = [],
    expenses: Array<{ category: string; amount: number; isDeleted?: boolean }> = [],
) {
    return calc.computeOrderFinance({ order, payments, incomes, expenses, companyId });
}

describe('FinanceCalculatorService.computeOrderFinance', () => {
    let calc: FinanceCalculatorService;

    beforeEach(() => {
        calc = new FinanceCalculatorService();
    });

    describe('роль: экспедитор (своя перевозка, без НДС)', () => {
        it('выручка = цена заказчика, затраты = ставка водителя, маржа = разница', () => {
            const fin = compute(calc, baseOrder(), FORWARDER);

            expect(fin.revenue).toBe(500000);
            expect(fin.revenueNet).toBe(500000);
            expect(fin.revenueVat).toBe(0);
            expect(fin.executorCost).toBe(400000);
            expect(fin.executorCostNet).toBe(400000);
            expect(fin.executorCostVat).toBe(0);
            expect(fin.margin).toBe(100000);
            expect(fin.isCustomer).toBe(false);
        });

        it('без платежей долги равны полным суммам, флаги оплаты сняты', () => {
            const fin = compute(calc, baseOrder(), FORWARDER);

            expect(fin.customerDebt).toBe(500000);
            expect(fin.executorDebt).toBe(400000);
            expect(fin.isCustomerPaid).toBe(false);
            expect(fin.isExecutorPaid).toBe(false);
        });

        it('полная оплата с обеих сторон включает флаги и обнуляет долги', () => {
            const fin = compute(calc, baseOrder(), FORWARDER, [
                { direction: PaymentDirection.IN, amount: 500000, companyId: FORWARDER },
                { direction: PaymentDirection.OUT, amount: 400000, companyId: FORWARDER },
            ]);

            expect(fin.paidIn).toBe(500000);
            expect(fin.paidOut).toBe(400000);
            expect(fin.customerDebt).toBe(0);
            expect(fin.executorDebt).toBe(0);
            expect(fin.isCustomerPaid).toBe(true);
            expect(fin.isExecutorPaid).toBe(true);
        });

        it('переплата не даёт отрицательного долга', () => {
            const fin = compute(calc, baseOrder(), FORWARDER, [
                { direction: PaymentDirection.IN, amount: 600000, companyId: FORWARDER },
            ]);

            expect(fin.customerDebt).toBe(0);
        });

        it('частичная оплата оставляет остаток долга и не включает флаг', () => {
            const fin = compute(calc, baseOrder(), FORWARDER, [
                { direction: PaymentDirection.IN, amount: 300000, companyId: FORWARDER },
            ]);

            expect(fin.customerDebt).toBe(200000);
            expect(fin.isCustomerPaid).toBe(false);
        });

        it('ручной флаг isCustomerPaid из заявки учитывается даже без платежей', () => {
            const fin = compute(calc, baseOrder({ isCustomerPaid: true }), FORWARDER);

            expect(fin.isCustomerPaid).toBe(true);
            // Долг при этом считается по фактическим платежам
            expect(fin.customerDebt).toBe(500000);
        });
    });

    describe('НДС 12% (казахстанская ставка)', () => {
        it('выделяет НДС из выручки и из затрат исполнителя', () => {
            const fin = compute(
                calc,
                baseOrder({
                    customerPrice: 112000,
                    driverCost: 56000,
                    hasVat: true,
                    vatRate: 12,
                    executorHasVat: true,
                    executorVatRate: 12,
                }),
                FORWARDER,
            );

            expect(fin.revenue).toBe(112000);
            expect(fin.revenueNet).toBe(100000);
            expect(fin.revenueVat).toBe(12000);
            expect(fin.executorCost).toBe(56000);
            expect(fin.executorCostNet).toBe(50000);
            expect(fin.executorCostVat).toBe(6000);
            // Маржа считается по нетто
            expect(fin.margin).toBe(50000);
        });

        it('НДС только по выручке: затраты без НДС остаются брутто', () => {
            const fin = compute(
                calc,
                baseOrder({ customerPrice: 112000, hasVat: true, vatRate: 12 }),
                FORWARDER,
            );

            expect(fin.revenueNet).toBe(100000);
            expect(fin.executorCostNet).toBe(400000);
            expect(fin.margin).toBe(-300000);
        });

        it('hasVat = true, но ставка 0 — НДС не выделяется («Без НДС»)', () => {
            const fin = compute(
                calc,
                baseOrder({ customerPrice: 112000, hasVat: true, vatRate: 0 }),
                FORWARDER,
            );

            expect(fin.revenueNet).toBe(112000);
            expect(fin.revenueVat).toBe(0);
        });
    });

    describe('роль: экспедитор с субподрядчиком', () => {
        it('затраты исполнителя = цена субподрядчика, а не ставка водителя', () => {
            const fin = compute(
                calc,
                baseOrder({ subForwarderId: SUB, subForwarderPrice: 450000 }),
                FORWARDER,
            );

            expect(fin.executorCost).toBe(450000);
            expect(fin.margin).toBe(50000);
        });

        it('флаг оплаты исполнителя берётся из isSubForwarderPaid', () => {
            const fin = compute(
                calc,
                baseOrder({ subForwarderId: SUB, subForwarderPrice: 450000, isSubForwarderPaid: true }),
                FORWARDER,
            );

            expect(fin.isExecutorPaid).toBe(true);
        });
    });

    describe('роль: заказчик', () => {
        it('выручки нет, затраты = цена для заказчика', () => {
            const fin = compute(calc, baseOrder(), CUSTOMER);

            expect(fin.isCustomer).toBe(true);
            expect(fin.revenue).toBe(0);
            expect(fin.executorCost).toBe(500000);
        });

        it('НДС заказчика выделяется из его затрат по клиентским настройкам НДС', () => {
            const fin = compute(
                calc,
                baseOrder({ customerPrice: 112000, hasVat: true, vatRate: 12 }),
                CUSTOMER,
            );

            expect(fin.executorCostNet).toBe(100000);
            expect(fin.executorCostVat).toBe(12000);
        });

        it('платёж, проведённый обеими сторонами, не удваивается (берётся максимум)', () => {
            const fin = compute(calc, baseOrder(), CUSTOMER, [
                { direction: PaymentDirection.IN, amount: 500000, companyId: FORWARDER },
                { direction: PaymentDirection.OUT, amount: 500000, companyId: CUSTOMER },
            ]);

            expect(fin.paidIn).toBe(500000);
            expect(fin.paidOut).toBe(500000);
            expect(fin.isCustomerPaid).toBe(true);
            expect(fin.isExecutorPaid).toBe(true);
        });
    });

    describe('роль: субэкспедитор', () => {
        const subOrder = () =>
            baseOrder({ subForwarderId: SUB, subForwarderPrice: 450000 });

        it('выручка = цена субподряда, затрат нет', () => {
            const fin = compute(calc, subOrder(), SUB);

            expect(fin.revenue).toBe(450000);
            expect(fin.executorCost).toBe(0);
        });

        it('оплата от экспедитора (его OUT) засчитывается как наша входящая', () => {
            const fin = compute(calc, subOrder(), SUB, [
                { direction: PaymentDirection.OUT, amount: 450000, companyId: FORWARDER },
            ]);

            expect(fin.paidIn).toBe(450000);
            expect(fin.customerDebt).toBe(0);
            expect(fin.isCustomerPaid).toBe(true);
        });

        it('своя входящая и OUT экспедитора не суммируются (максимум)', () => {
            const fin = compute(calc, subOrder(), SUB, [
                { direction: PaymentDirection.IN, amount: 450000, companyId: SUB },
                { direction: PaymentDirection.OUT, amount: 450000, companyId: FORWARDER },
            ]);

            expect(fin.paidIn).toBe(450000);
        });

        it('isExecutorPaid для субэкспедитора всегда false', () => {
            const fin = compute(calc, subOrder(), SUB, [
                { direction: PaymentDirection.OUT, amount: 450000, companyId: FORWARDER },
            ]);

            expect(fin.isExecutorPaid).toBe(false);
        });
    });

    describe('доп. доходы и расходы в марже', () => {
        it('обычные категории включаются в маржу', () => {
            const fin = compute(
                calc,
                baseOrder(),
                FORWARDER,
                [],
                [{ category: 'storage', amount: 20000 }],
                [{ category: 'fuel', amount: 30000 }],
            );

            expect(fin.extraIncomes).toBe(20000);
            expect(fin.otherExpenses).toBe(30000);
            // 500000 - 400000 + 20000 - 30000
            expect(fin.margin).toBe(90000);
        });

        it('служебные категории (оплата заказа, предоплата, оплата водителю) исключаются', () => {
            const fin = compute(
                calc,
                baseOrder(),
                FORWARDER,
                [],
                [
                    { category: 'order_payment', amount: 500000 },
                    { category: 'prepayment', amount: 100000 },
                ],
                [{ category: 'driver_payment', amount: 400000 }],
            );

            expect(fin.extraIncomes).toBe(0);
            expect(fin.otherExpenses).toBe(0);
            expect(fin.margin).toBe(100000);
        });

        it('удалённые записи не учитываются', () => {
            const fin = compute(
                calc,
                baseOrder(),
                FORWARDER,
                [],
                [{ category: 'storage', amount: 20000, isDeleted: true }],
                [{ category: 'fuel', amount: 30000, isDeleted: true }],
            );

            expect(fin.extraIncomes).toBe(0);
            expect(fin.otherExpenses).toBe(0);
            expect(fin.margin).toBe(100000);
        });
    });

    describe('пустые значения', () => {
        it('заявка без цен даёт нули без NaN', () => {
            const fin = compute(
                calc,
                baseOrder({ customerPrice: null, driverCost: null }),
                FORWARDER,
            );

            expect(fin.revenue).toBe(0);
            expect(fin.executorCost).toBe(0);
            expect(fin.margin).toBe(0);
            expect(fin.customerDebt).toBe(0);
            expect(fin.executorDebt).toBe(0);
            // Нулевые суммы не считаются «оплаченными»
            expect(fin.isCustomerPaid).toBe(false);
            expect(fin.isExecutorPaid).toBe(false);
        });
    });
});
