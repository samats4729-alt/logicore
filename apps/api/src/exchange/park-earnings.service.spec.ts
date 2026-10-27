import { ExchangeParkEarningsService } from './park-earnings.service';

/**
 * Сколько LogiCore заработала на парке (Q19, владелец 25.10.2026): по
 * довезённым рейсам — доля, записанная в рейсе; рейсы в работе — отдельно;
 * заработок платформы — доля плюс оплаченная подписка.
 */
describe('Заработок LogiCore по паркам', () => {
    const trip = (status: string, customerPrice: number, platformFee: number, vat = 0) => ({
        parkCompanyId: 'парк', customerPrice, vat, platformFee, createdAt: new Date('2026-10-20T10:00:00Z'),
        order: { status },
    });

    function build() {
        const prisma: any = {
            company: { findMany: jest.fn().mockResolvedValue([{ id: 'парк', name: 'ТОО «Парк»', bin: '1' }, { id: 'пусто', name: 'ТОО «Пусто»', bin: '2' }]) },
            exchangeTripSettlement: {
                findMany: jest.fn().mockResolvedValue([
                    trip('COMPLETED', 115219.5, 5237.25),
                    trip('COMPLETED', 133654.62, 5237.25, 18435.12),
                    trip('IN_TRANSIT', 100000, 4545.45),
                    trip('CANCELLED', 90000, 4000),
                ]),
            },
            subscriptionPayment: { groupBy: jest.fn().mockResolvedValue([{ companyId: 'парк', _sum: { amount: 30000 } }]) },
            subscriptionRequest: { groupBy: jest.fn().mockResolvedValue([{ companyId: 'парк', _sum: { amount: 15000 } }]) },
        };
        return { service: new ExchangeParkEarningsService(prisma), prisma };
    }

    it('доля — по довезённым рейсам; в работе — отдельно; отменённые не в счёт', async () => {
        const { service } = build();
        const { rows } = await service.summary();
        const park = rows.find((r) => r.parkId === 'парк')!;
        expect(park).toMatchObject({
            tripsCompleted: 2, tripsInWork: 1,
            turnover: 248874.12, turnoverVat: 18435.12,
            commission: 10474.5, commissionInWork: 4545.45,
            subscriptionPaid: 45000, platformTotal: 55474.5,
        });
    });

    it('парк без рейсов — в списке с нулями, а не пропадает', async () => {
        const { service } = build();
        const { rows, totals } = await service.summary();
        expect(rows.find((r) => r.parkId === 'пусто')).toMatchObject({ tripsCompleted: 0, commission: 0, platformTotal: 0 });
        expect(totals.platformTotal).toBe(55474.5);
    });

    it('период — по дню расчёта рейса и дню оплаты подписки', async () => {
        const { service, prisma } = build();
        await service.summary({ from: '2026-10-01', to: '2026-10-31' });
        const where = prisma.exchangeTripSettlement.findMany.mock.calls[0][0].where;
        expect(where.createdAt.gte.toISOString()).toBe('2026-09-30T19:00:00.000Z');
        expect(where.createdAt.lt.toISOString()).toBe('2026-10-31T19:00:00.000Z');
        expect(prisma.subscriptionPayment.groupBy.mock.calls[0][0].where.paidAt).toEqual(where.createdAt);
    });
});
