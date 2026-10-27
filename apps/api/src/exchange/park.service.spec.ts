import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExchangeParkService, newInviteCode } from './park.service';

function build(isPark = true) {
    const prisma: any = {
        company: {
            findUnique: jest.fn().mockResolvedValue({ isPark, parkInviteCode: 'ABC234' }),
            findFirst: jest.fn().mockResolvedValue({ name: 'Парк А' }),
            update: jest.fn(),
        },
        exchangeDriver: { count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(5) },
        order: {
            count: jest.fn().mockResolvedValue(1),
            aggregate: jest.fn().mockResolvedValue({ _count: 3, _sum: { driverCost: 1200000 } }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        driverPayout: { findMany: jest.fn().mockResolvedValue([{ net: 300000, toPay: null }]) },
    };
    const drivers: any = {
        assertPark: jest.fn(async () => { if (!isPark) throw new ForbiddenException('Ваша компания не парк биржи'); }),
    };
    return { service: new ExchangeParkService(prisma, drivers), prisma };
}

describe('Кабинет парка', () => {
    it('обзор: ждут проверки, работают, в рейсе, за месяц — и код приглашения', async () => {
        const { service } = build();
        expect(await service.overview('park-1')).toEqual({
            pendingDrivers: 2, approvedDrivers: 5, activeTrips: 1, monthTrips: 3, monthSum: 1200000, inviteCode: 'ABC234',
            pendingPayouts: { count: 1, net: 300000 },
        });
    });

    it('рейсы парка — заявки, где парк перевозчик; цены заказчика в выборке нет', async () => {
        const { service, prisma } = build();
        await service.trips('park-1', 'done');
        const args = prisma.order.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ partnerId: 'park-1', status: { in: ['COMPLETED'] } });
        expect(JSON.stringify(args.select)).not.toMatch(/customerPrice/);
    });

    it('по каждому рейсу видно, были ли чеки на топливо и сколько ждут решения', async () => {
        const { service, prisma } = build();
        const trip = (id: string, receipts: { status: string }[]) => ({
            id, orderNumber: id, status: 'COMPLETED', driverCost: 400000, createdAt: new Date(), completedAt: new Date(),
            assignedDriverName: 'Рулев', assignedDriverPlate: null, exchangeSettlement: null,
            exchangeFuelReceipts: receipts, responsibles: [], forwarder: null, subForwarder: null, customerCompany: null, routePoints: [],
        });
        prisma.order.findMany.mockResolvedValue([trip('o-none', []), trip('o-two', [{ status: 'ACCEPTED' }, { status: 'PENDING' }])]);
        const rows = await service.trips('park-1', 'done');
        expect(rows.map((r) => [r.id, r.fuelReceipts, r.fuelReceiptsPending])).toEqual([['o-none', 0, 0], ['o-two', 2, 1]]);
        // Отклонённые чеки — не в счёт: их и не выбираем.
        expect(prisma.order.findMany.mock.calls[0][0].select.exchangeFuelReceipts.where).toEqual({ status: { not: 'REJECTED' } });
    });

    it('в рейсе видно, кто его ведёт от парка, — чужой ответственный не показывается', async () => {
        const { service, prisma } = build();
        prisma.order.findMany.mockResolvedValue([{
            id: 'o-1', orderNumber: 'o-1', status: 'IN_TRANSIT', driverCost: 400000, createdAt: new Date(), completedAt: null,
            assignedDriverName: 'Рулев', assignedDriverPlate: null, exchangeSettlement: null, exchangeFuelReceipts: [],
            responsibles: [
                { companyId: 'fwd', user: { id: 'u-fwd', firstName: 'Ерлан', lastName: 'Экспедиторов' } },
                { companyId: 'park-1', user: { id: 'u-park', firstName: 'Алия', lastName: 'Паркова' } },
            ],
            forwarder: null, subForwarder: null, customerCompany: null, routePoints: [],
        }]);
        const [row] = await service.trips('park-1', 'active');
        expect(row.responsible).toEqual({ id: 'u-park', name: 'Паркова Алия' });
    });

    it('не парк — кабинета парка нет', async () => {
        const { service } = build(false);
        await expect(service.overview('company-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('код: шесть знаков без похожих букв и цифр', () => {
        for (let i = 0; i < 50; i += 1) expect(newInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    });

    it('совпал с кодом другого парка — берём новый', async () => {
        const { service, prisma } = build();
        prisma.company.update.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({});
        const code = await service.regenerateCode('park-1');
        expect(code).toMatch(/^[A-Z0-9]{6}$/);
        expect(prisma.company.update).toHaveBeenCalledTimes(2);
    });

    it('страница приглашения: чужой или старый код — «не найдено»', async () => {
        const { service, prisma } = build();
        expect(await service.inviteInfo(' abc234 ')).toEqual({ parkName: 'Парк А', code: 'ABC234' });
        prisma.company.findFirst.mockResolvedValue(null);
        await expect(service.inviteInfo('ZZZZZZ')).rejects.toBeInstanceOf(NotFoundException);
    });
});
