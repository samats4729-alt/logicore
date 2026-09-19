import { Prisma } from '@prisma/client';
import { FinancialReportsService } from './financial-reports.service';
import { FinanceCalculatorService } from './finance-calculator.service';
import { ownOrdersWhere } from '../../common/manager-orders';

/**
 * Плитки над «Деньгами»: выручка, маржа, дебиторка, кредиторка, баланс и
 * «рейсы с долгом».
 *
 * Списки под ними уже сужены до своих сделок, а плитки считались по всей
 * компании — и у менеджера с пятью рейсами над ними стояло «8 заявок не
 * оплачено». Число само по себе выдаёт, сколько сделок он не видит, а рядом
 * стоит чужая выручка.
 *
 * Отдельная история — «Баланс: касса и счета». Это остаток компании: туда
 * входят аренда, налоги и начальные остатки счетов, к рейсам не привязанные.
 * Сузить его нельзя — только не показывать.
 */

const КОМПАНИЯ = 'company-1';
const Я = 'user-1';
const D = (v: string | number) => new Prisma.Decimal(v);

const рейс = (id: string, цена: number) => ({
    id,
    orderNumber: id,
    createdAt: new Date('2026-07-01'),
    status: 'COMPLETED',
    customerPrice: D(цена),
    subForwarderPrice: null,
    driverCost: null,
    customerCompanyId: 'cp-1',
    customerCompany: { id: 'cp-1', name: 'ТОО «Заказчик»' },
    forwarderId: КОМПАНИЯ,
    forwarder: { id: КОМПАНИЯ, name: 'Мы' },
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
});

function makeService(ordersScope: string | null) {
    const prisma: any = {
        user: { findUnique: jest.fn(async () => ({ ordersScope })) },
        company: { findUnique: jest.fn(async () => ({ managersSeeOwnOrdersOnly: true })) },
        order: { findMany: jest.fn(async () => [рейс('ЗК-001', 100000), рейс('ЗК-002', 200000)]) },
        payment: { findMany: jest.fn(async () => []) },
        income: { findMany: jest.fn(async () => []) },
        expense: { findMany: jest.fn(async () => []) },
        financeAccount: { findMany: jest.fn(async () => [{ openingBalance: D(500000) }]) },
        counterpartyOpeningBalance: { findMany: jest.fn(async () => []) },
    };
    const service = new FinancialReportsService(
        prisma, {} as any, {} as any,
        new FinanceCalculatorService() as any,
        {} as any, {} as any, {} as any, {} as any,
        { differencesForPeriod: async () => ({ gain: 0, loss: 0, net: 0, rows: [] }) } as any,
    );
    return { service, prisma };
}

describe('Плитки над «Деньгами» считаются по тем же рейсам, что в списках', () => {
    it('менеджеру «только свои» — отбор рейсов сужен', async () => {
        const { service, prisma } = makeService('OWN');

        await service.getDashboardSummary(КОМПАНИЯ, {}, { userId: Я, role: 'LOGISTICIAN' });

        const { where } = prisma.order.findMany.mock.calls[0][0];
        expect(where.AND).toEqual(expect.arrayContaining([ownOrdersWhere(КОМПАНИЯ, Я)]));
    });

    it('остаток кассы компании ему не показывается вовсе', async () => {
        // Не ноль и не часть суммы: и то и другое прочли бы как остаток
        // компании. `null` — это «здесь нечего показывать».
        const { service, prisma } = makeService('OWN');

        const итог = await service.getDashboardSummary(КОМПАНИЯ, {}, { userId: Я, role: 'LOGISTICIAN' });

        expect(итог.cashBalance).toBeNull();
        expect(prisma.payment.findMany).not.toHaveBeenCalled();
        expect(prisma.financeAccount.findMany).not.toHaveBeenCalled();
    });

    it('выручка и долги при этом считаются — по своим рейсам', async () => {
        const { service } = makeService('OWN');

        const итог = await service.getDashboardSummary(КОМПАНИЯ, {}, { userId: Я, role: 'LOGISTICIAN' });

        expect(итог.revenue).toBe(300000);
        expect(итог.unpaidOrdersCount).toBe(2);
    });

    it('кому открыты все заявки — считаем как раньше, с кассой', async () => {
        const { service, prisma } = makeService('ALL');

        const итог = await service.getDashboardSummary(КОМПАНИЯ, {}, { userId: Я, role: 'LOGISTICIAN' });

        const { where } = prisma.order.findMany.mock.calls[0][0];
        expect(where.AND).not.toEqual(expect.arrayContaining([ownOrdersWhere(КОМПАНИЯ, Я)]));
        expect(итог.cashBalance).toBe(500000);
    });

    it('бухгалтеру и администратору — вся компания', async () => {
        const { service, prisma } = makeService('OWN');

        const итог = await service.getDashboardSummary(КОМПАНИЯ, {}, { userId: 'user-2', role: 'ACCOUNTANT' });

        expect(итог.cashBalance).toBe(500000);
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('без человека — тоже вся компания: так ходят внутренние вызовы', async () => {
        const { service } = makeService('OWN');

        const итог = await service.getDashboardSummary(КОМПАНИЯ, {});

        expect(итог.cashBalance).toBe(500000);
    });
});
