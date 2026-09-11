import { CompanyService } from './company.service';
import { FinanceCalculatorService } from '../accounting/services/finance-calculator.service';
import { kzStartOfMonth, kzStartOfMonthShifted } from '../common/utils/business-date';

/**
 * Активность на дашборде: выручка и маржа за месяц.
 *
 * Владелец сверяет эту таблицу с «Реестром заявок», и расхождение между
 * ними — не мелочь, а повод не верить обеим. Поэтому деньги здесь считает
 * тот же калькулятор, что и в реестре, а не отдельная формула.
 *
 * Калькулятор берём настоящий, без заглушки: проверять надо именно числа.
 * Заглушка подтвердила бы только то, что мы её позвали.
 */

const КОМПАНИЯ = 'our-co';
const ЗАКАЗЧИК = 'customer-co';
const ПЕРЕВОЗЧИК = 'carrier-co';

/** Заявка в том виде, в каком её отдаёт выборка дашборда. */
function заявка(данные: Partial<Record<string, any>> = {}) {
    return {
        createdAt: new Date(kzStartOfMonth().getTime() + 86400_000),
        completedAt: null,
        status: 'IN_TRANSIT',
        customerCompanyId: ЗАКАЗЧИК,
        forwarderId: КОМПАНИЯ,
        partnerId: null,
        subForwarderId: null,
        customerPrice: 430_000,
        driverCost: 350_000,
        currency: 'KZT',
        driverCostCurrency: 'KZT',
        customerPriceBase: null,
        driverCostBase: null,
        subForwarderPrice: 0,
        subForwarderPriceCurrency: 'KZT',
        subForwarderPriceBase: null,
        vatRate: 0,
        hasVat: false,
        executorVatRate: 0,
        executorHasVat: false,
        isCustomerPaid: false,
        isDriverPaid: false,
        isSubForwarderPaid: false,
        payments: [],
        paymentShares: [],
        incomes: [],
        expenses: [],
        ...данные,
    };
}

function служба(заявки: any[]) {
    const prisma: any = {
        order: {
            findMany: jest.fn(async () => заявки),
            count: jest.fn(async () => 0),
        },
    };
    const service = new CompanyService(
        prisma, {} as any, {} as any, {} as any, {} as any, {} as any,
        new FinanceCalculatorService(),
    );
    return { service, prisma };
}

describe('Активность на дашборде', () => {
    it('выручка — это ставки заказчика, а затраты — ставки перевозчика', async () => {
        const { service } = служба([
            заявка({ customerPrice: 300_000, driverCost: 250_000 }),
            заявка({ customerPrice: 200_000, driverCost: 150_000 }),
        ]);

        const { current } = await service.getDashboardActivity(КОМПАНИЯ);

        expect(current.created).toBe(2);
        expect(current.revenue).toBe(500_000);
        expect(current.cost).toBe(400_000);
        expect(current.margin).toBe(100_000);
    });

    it('с НДС маржа меньше простой разницы — налог компании не принадлежит', async () => {
        // Ровно тот случай, на котором ломалась бы формула «выручка минус
        // затраты»: 430 000 − 350 000 = 80 000, а остаётся 68 965,52, потому
        // что НДС с обеих сторон проходит мимо компании в бюджет.
        const { service } = служба([
            заявка({
                customerPrice: 430_000, driverCost: 350_000,
                hasVat: true, vatRate: 16,
                executorHasVat: true, executorVatRate: 16,
            }),
        ]);

        const { current } = await service.getDashboardActivity(КОМПАНИЯ);

        expect(current.revenue).toBe(430_000);
        expect(current.cost).toBe(350_000);
        expect(current.margin).toBe(68_966);
        expect(current.margin).not.toBe(current.revenue - current.cost);
    });

    it('прошлый месяц считается отдельно от текущего', async () => {
        const прошлыйМесяц = new Date(kzStartOfMonthShifted(-1).getTime() + 86400_000);
        const { service } = служба([
            заявка({ customerPrice: 100_000, driverCost: 60_000 }),
            заявка({ createdAt: прошлыйМесяц, customerPrice: 500_000, driverCost: 300_000 }),
        ]);

        const { current, previous } = await service.getDashboardActivity(КОМПАНИЯ);

        expect(current.created).toBe(1);
        expect(current.revenue).toBe(100_000);
        expect(previous.created).toBe(1);
        expect(previous.revenue).toBe(500_000);
    });

    it('заявка постарше даёт «завершено», но не деньги месяца', async () => {
        // Такие заявки в выборку заходят намеренно — ради подсчёта
        // завершённых. Их суммы к месяцу отношения не имеют: выручка
        // признаётся в месяце, когда заявку создали.
        const давно = new Date(kzStartOfMonthShifted(-6));
        const { service } = служба([
            заявка({
                createdAt: давно,
                completedAt: new Date(kzStartOfMonth().getTime() + 3600_000),
                status: 'COMPLETED',
                customerPrice: 900_000, driverCost: 700_000,
            }),
        ]);

        const { current } = await service.getDashboardActivity(КОМПАНИЯ);

        expect(current.completed).toBe(1);
        expect(current.created).toBe(0);
        expect(current.revenue).toBe(0);
        expect(current.margin).toBe(0);
    });

    it('заказчики и перевозчики считаются по головам, а не по заявкам', async () => {
        const { service } = служба([
            заявка({ subForwarderId: ПЕРЕВОЗЧИК }),
            заявка({ subForwarderId: ПЕРЕВОЗЧИК }),
        ]);

        const { current } = await service.getDashboardActivity(КОМПАНИЯ);

        expect(current.created).toBe(2);
        expect(current.activeCustomers).toBe(1);
        expect(current.activeCarriers).toBe(1);
    });

    it('в выборку не просятся черновики, отмены и неподтверждённые ожидания', async () => {
        const { prisma, service } = служба([]);
        await service.getDashboardActivity(КОМПАНИЯ);

        const { where } = prisma.order.findMany.mock.calls[0][0];
        expect(where.status).toEqual({ notIn: ['DRAFT', 'CANCELLED'] });
        // Тот же отбор, что и в «Реестре заявок»: иначе «создано заявок»
        // считалось бы по одному набору, а выручка — по другому.
        expect(where.AND).toEqual(expect.arrayContaining([
            { OR: [{ isConfirmed: true }, { status: { not: 'PENDING' } }] },
        ]));
    });
});
