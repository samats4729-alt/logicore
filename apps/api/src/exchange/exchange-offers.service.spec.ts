import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExchangeOffersService } from './exchange-offers.service';
import { ExchangeSettlementService } from './settlement.service';

const OUR = 'company-ours';
const CARRIER = 'company-carrier';

function openOrder(overrides: Record<string, any> = {}) {
    return {
        id: 'order-1', orderNumber: '3K-2607', exchangePrice: 450000, status: 'PENDING',
        customerCompanyId: 'client-1', forwarderId: OUR, subForwarderId: null,
        ...overrides,
    };
}

function driverRow(overrides: Record<string, any> = {}) {
    return {
        id: 'd-1', userId: 'u-driver', kind: 'IP', status: 'APPROVED',
        lastName: 'Сериков', firstName: 'Серик', middleName: null, phone: '+77011234567',
        ipName: 'ИП Сериков', vehiclePlate: '123ABC02', vehicleBodyType: 'тент', vehicleCapacityKg: 20000,
        tripsCompleted: 3, createdAt: new Date(), parkCompanyId: null, park: null,
        ...overrides,
    };
}

function offerRow(overrides: Record<string, any> = {}) {
    return {
        id: 'offer-1', orderId: 'order-1', status: 'ACTIVE', price: 420000, agreed: false, readyDate: null, comment: null,
        createdAt: new Date(), updatedAt: new Date(), decidedAt: null,
        driver: driverRow(), company: null,
        ...overrides,
    };
}

function build() {
    const tx: any = {
        order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        exchangeOffer: { update: jest.fn(), updateMany: jest.fn() },
        orderStatusHistory: { create: jest.fn() },
        exchangeTripSettlement: { upsert: jest.fn() },
    };
    const prisma: any = {
        order: {
            findFirst: jest.fn().mockResolvedValue(openOrder()),
            // Маршрут для расчёта водителю парка: 1 200 км, погрузка в октябре 2026.
            findUnique: jest.fn().mockResolvedValue({
                id: 'order-1', exchangeDistanceKm: 1200,
                routePoints: [{ pointType: 'PICKUP', expectedDate: new Date('2026-10-20T03:00:00Z'), location: { latitude: null, longitude: null, cityRecord: null } }],
            }),
        },
        parkPayoutRates: { findUnique: jest.fn().mockResolvedValue(null) },
        platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        exchangeTripSettlement: { findMany: jest.fn().mockResolvedValue([]) },
        company: { findUnique: jest.fn().mockResolvedValue({ isPark: false }) },
        exchangeDriver: { findUnique: jest.fn().mockResolvedValue({ id: 'd-1' }) },
        exchangeOffer: {
            upsert: jest.fn(async (args: any) => ({ id: 'offer-1', updatedAt: new Date(), ...args.create })),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            findFirst: jest.fn().mockResolvedValue(offerRow()),
            findMany: jest.fn().mockResolvedValue([]),
            findUnique: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const drivers: any = { approvedDriver: jest.fn().mockResolvedValue({ id: 'd-1', status: 'APPROVED', kind: 'IP' }) };
    return { service: new ExchangeOffersService(prisma, drivers, new ExchangeSettlementService(prisma)), prisma, tx, drivers };
}

describe('Биржа: отклик', () => {
    it('«согласен» — цена компании; своя — какая названа', async () => {
        const { service, prisma } = build();
        const agreed = await service.offerAsDriver('u-driver', 'order-1', { agree: true, readyDate: '2099-01-10' });
        expect(agreed.price).toBe(450000);
        expect(agreed.agreed).toBe(true);
        const own = await service.offerAsDriver('u-driver', 'order-1', { price: 400000, comment: ' подам утром ' });
        expect(own.price).toBe(400000);
        expect(prisma.exchangeOffer.upsert.mock.calls[1][0].create.comment).toBe('подам утром');
    });

    it('повторный отклик обновляет прежний — один отклик от водителя на заявку', async () => {
        const { service, prisma } = build();
        await service.offerAsDriver('u-driver', 'order-1', { agree: true });
        expect(prisma.exchangeOffer.upsert.mock.calls[0][0].where).toEqual({ orderId_driverId: { orderId: 'order-1', driverId: 'd-1' } });
    });

    it('у договорной заявки «согласен» нельзя, своя цена обязательна', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue(openOrder({ exchangePrice: null }));
        await expect(service.offerAsDriver('u-driver', 'order-1', { agree: true })).rejects.toThrow(/договорная/);
        await expect(service.offerAsDriver('u-driver', 'order-1', {})).rejects.toThrow(/свою цену/);
    });

    it('снятая заявка — откликнуться нельзя', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue(null);
        await expect(service.offerAsCompany(CARRIER, 'user-c', 'order-1', { agree: true })).rejects.toThrow(/снята с биржи/);
    });

    it('компания не откликается на свою заявку; парк сам не откликается', async () => {
        const { service, prisma } = build();
        await expect(service.offerAsCompany(OUR, 'user-1', 'order-1', { agree: true })).rejects.toThrow(/ваша заявка/);
        prisma.company.findUnique.mockResolvedValue({ isPark: true });
        await expect(service.offerAsCompany(CARRIER, 'user-c', 'order-1', { agree: true })).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('Биржа: выбор исполнителя', () => {
    it('перевозчик — становится суб-экспедитором со своей ценой, как при передаче рейса', async () => {
        const { service, prisma, tx } = build();
        prisma.exchangeOffer.findFirst.mockResolvedValue(offerRow({ driver: null, company: { id: CARRIER, name: 'ТОО Перевозчик', bin: '1', phone: null } }));
        await service.accept(OUR, 'user-1', 'order-1', 'offer-1');
        const data = tx.order.updateMany.mock.calls[0][0].data;
        expect(data).toMatchObject({ subForwarderId: CARRIER, subForwarderPrice: 420000, isConfirmed: true });
        expect(data.exchangeClosedAt).toBeInstanceOf(Date);
    });

    it('водитель с ИП — водитель рейса, перевозчика-компании нет', async () => {
        const { service, tx } = build();
        await service.accept(OUR, 'user-1', 'order-1', 'offer-1');
        const data = tx.order.updateMany.mock.calls[0][0].data;
        expect(data).toMatchObject({ driverId: 'u-driver', partnerId: null, driverCost: 420000, status: 'ASSIGNED', assignedDriverPlate: '123ABC02' });
    });

    it('водитель без ИП — водитель рейса, а перевозчик по документам — его парк', async () => {
        const { service, prisma, tx } = build();
        prisma.exchangeOffer.findFirst.mockResolvedValue(offerRow({ driver: driverRow({ kind: 'PARK', parkCompanyId: 'park-1', park: { id: 'park-1', name: 'Парк А' } }) }));
        await service.accept(OUR, 'user-1', 'order-1', 'offer-1');
        expect(tx.order.updateMany.mock.calls[0][0].data).toMatchObject({ driverId: 'u-driver', partnerId: 'park-1' });
    });

    it('остальным откликам — «выбрали другого»; выбранный — принят', async () => {
        const { service, tx } = build();
        await service.accept(OUR, 'user-1', 'order-1', 'offer-1');
        expect(tx.exchangeOffer.update.mock.calls[0][0].data.status).toBe('ACCEPTED');
        expect(tx.exchangeOffer.updateMany.mock.calls[0][0]).toMatchObject({
            where: { orderId: 'order-1', status: 'ACTIVE', id: { not: 'offer-1' } },
            data: { status: 'REJECTED' },
        });
    });

    it('двое выбирают разом — второму отказ, исполнитель один', async () => {
        const { service, tx } = build();
        tx.order.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.accept(OUR, 'user-1', 'order-1', 'offer-1')).rejects.toThrow(/уже появился исполнитель/);
    });

    it('выбирает только компания, выставившая заявку; отозванный отклик не выбрать', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue(openOrder({ forwarderId: 'someone-else', customerCompanyId: OUR }));
        await expect(service.accept(OUR, 'user-1', 'order-1', 'offer-1')).rejects.toBeInstanceOf(ForbiddenException);

        const other = build();
        other.prisma.exchangeOffer.findFirst.mockResolvedValue(offerRow({ status: 'WITHDRAWN' }));
        await expect(other.service.accept(OUR, 'user-1', 'order-1', 'offer-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('водителя, которого успели заблокировать, не выбрать', async () => {
        const { service, prisma } = build();
        prisma.exchangeOffer.findFirst.mockResolvedValue(offerRow({ driver: driverRow({ status: 'BLOCKED' }) }));
        await expect(service.accept(OUR, 'user-1', 'order-1', 'offer-1')).rejects.toThrow(/не допущен/);
    });
});

describe('Биржа: отклик водителя парка — сумма на руки (12.10.2026)', () => {
    const PARK_DRIVER = { id: 'd-1', status: 'APPROVED', kind: 'PARK', parkCompanyId: 'park-1' };

    it('своя сумма на руки — компании уходит полная цена с налогами, топливом и комиссиями', async () => {
        const { service, prisma, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        const own = await service.offerAsDriver('u-driver', 'order-1', { price: 400000 });
        // Водитель видит свою сумму…
        expect(own.price).toBe(400000);
        // …а в отклике для компании — 508 437,93 и весь расчёт.
        const saved = prisma.exchangeOffer.upsert.mock.calls[0][0].create;
        expect(saved.price).toBe(508437.93);
        expect(saved.driverTotal).toBe(400000);
        expect(saved.calc).toMatchObject({ fuel: 120000, workNet: 280000, deductionApplied: true, taxMonth: '2026-10' });
    });

    it('«согласен» на цену компании — на руки считается от неё', async () => {
        const { service, prisma, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        prisma.order.findFirst.mockResolvedValue(openOrder({ exchangePrice: 508437.93 }));
        const agreed = await service.offerAsDriver('u-driver', 'order-1', { agree: true });
        expect(agreed.price).toBe(400000);
        expect(prisma.exchangeOffer.upsert.mock.calls[0][0].create.price).toBe(508437.93);
    });

    it('сумма меньше топлива по расчёту — понятный отказ', async () => {
        const { service, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        await expect(service.offerAsDriver('u-driver', 'order-1', { price: 90000 })).rejects.toThrow(/больше топлива/);
    });

    it('компания выбрала водителя парка — расчёт рейса фиксируется, компании — её цена', async () => {
        const { service, prisma, tx, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        await service.offerAsDriver('u-driver', 'order-1', { price: 400000 });
        const saved = prisma.exchangeOffer.upsert.mock.calls[0][0].create;
        prisma.exchangeOffer.findFirst.mockResolvedValue(offerRow({
            price: saved.price, driverTotal: saved.driverTotal, calc: saved.calc,
            driver: driverRow({ kind: 'PARK', parkCompanyId: 'park-1', park: { id: 'park-1', name: 'Парк А' } }),
        }));
        await service.accept(OUR, 'u-manager', 'order-1', 'offer-1');
        expect(tx.order.updateMany.mock.calls[0][0].data).toMatchObject({ driverCost: 508437.93, partnerId: 'park-1' });
        expect(tx.exchangeTripSettlement.upsert.mock.calls[0][0].create).toMatchObject({
            orderId: 'order-1', driverId: 'd-1', parkCompanyId: 'park-1', driverTotal: 400000, customerPrice: 508437.93, taxMonth: '2026-10',
        });
    });
});
