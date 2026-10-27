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
        // Ставки как в калькуляции шефа (5 % парка).
        parkPayoutRates: { findUnique: jest.fn().mockResolvedValue({
            commissionPct: 10, opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, fuelPerKm: 100,
            applyDeduction: true, deductionMrp: 30, mrp: 4325, vatPayer: false, vatPct: 16, ratesConfirmedAt: null,
            fuelConsumption: 30, fuelPriceSummer: 350, fuelPriceWinter: null, fuelSeason: 'SUMMER', ipnHighPct: 15, ipnThresholdMrp: 8500,
        }) },
        platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        exchangeTripSettlement: { findMany: jest.fn().mockResolvedValue([]) },
        company: { findUnique: jest.fn().mockResolvedValue({ isPark: false }) },
        // Водитель написал заявление на базовый вычет.
        exchangeDriver: { findUnique: jest.fn().mockResolvedValue({ id: 'd-1', deductionRequested: true }) },
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

    it('компания не откликается на свою заявку; парк откликается, как любой перевозчик (15.10.2026)', async () => {
        const { service, prisma } = build();
        await expect(service.offerAsCompany(OUR, 'user-1', 'order-1', { agree: true })).rejects.toThrow(/ваша заявка/);
        prisma.company.findUnique.mockResolvedValue({ isPark: true });
        await expect(service.offerAsCompany(CARRIER, 'user-c', 'order-1', { agree: true })).resolves.toBeDefined();
    });

    it('компания видит у водителя запасные номера и почту для документов (Q6)', async () => {
        const { service, prisma } = build();
        prisma.exchangeOffer.findMany.mockResolvedValue([offerRow({
            driver: driverRow({ extraPhones: ['+998901234567'], docsEmail: 'buh@serik.kz', docsContact: 'Айгуль' }),
        })]);
        const [offer] = await service.offersForOrder(OUR, 'order-1');
        expect(offer.driver).toEqual(expect.objectContaining({ extraPhones: ['+998901234567'], docsEmail: 'buh@serik.kz', docsContact: 'Айгуль' }));
        expect(prisma.exchangeOffer.findMany.mock.calls[0][0].select.driver.select).toEqual(
            expect.objectContaining({ extraPhones: true, docsEmail: true, docsContact: true }),
        );
    });

    it('в чёрном списке компании, выставившей заявку, — отклик не принимается (F5/S2)', async () => {
        const { service, prisma } = build();
        prisma.companyBlocklist = { findFirst: jest.fn().mockResolvedValue({ kind: 'BIN_IIN', value: '123456789012', name: null, reason: 'не платит' }) };
        prisma.company.findUnique.mockResolvedValue({ isPark: false, bin: '123456789012', phone: null });
        await expect(service.offerAsCompany(CARRIER, 'user-c', 'order-1', { agree: true })).rejects.toThrow(/не принимает ваши отклики/);
        // Ищем в списке той, кто выставил заявку, — у нас это экспедитор.
        expect(prisma.companyBlocklist.findFirst.mock.calls[0][0].where.companyId).toBe(OUR);

        prisma.exchangeDriver.findUnique.mockResolvedValue({ id: 'd-1', iin: null, phone: '+77011234567', vehiclePlate: null, park: null });
        await expect(service.offerAsDriver('u-driver', 'order-1', { agree: true })).rejects.toThrow(/не принимает ваши отклики/);
        expect(prisma.exchangeOffer.upsert).not.toHaveBeenCalled();
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

describe('Биржа: отклик водителя парка — схема шефа (16.10.2026)', () => {
    const PARK_DRIVER = { id: 'd-1', status: 'APPROVED', kind: 'PARK', parkCompanyId: 'park-1' };
    const PARK_OFFER = (saved: any) => offerRow({
        price: saved.price, driverTotal: saved.driverTotal, calc: saved.calc,
        driver: driverRow({ kind: 'PARK', parkCompanyId: 'park-1', park: { id: 'park-1', name: 'Парк А' } }),
    });

    it('своя сумма на руки (без топлива) — компании уходит цена с топливом, налогами парка и 10 %', async () => {
        const { service, prisma, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        const own = await service.offerAsDriver('u-driver', 'order-1', { price: 400000 });
        expect(own.price).toBe(400000);
        const saved = prisma.exchangeOffer.upsert.mock.calls[0][0].create;
        // 400 000 на руки → за работу 444 444,44 (ОПВ 44 444,44); топливо 126 000; ИПН с вычетом.
        expect(saved.price).toBe(688994.16);
        expect(saved.driverTotal).toBe(400000);
        expect(saved.calc).toMatchObject({ scheme: 2, fuel: 126000, gross: 444444.44, opv: 44444.44, ipn: 27025, deductionApplied: true, taxMonth: '2026-10' });
    });

    it('«согласен» на цену компании — на руки = её сумма минус топливо и ОПВ', async () => {
        const { service, prisma, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        prisma.order.findFirst.mockResolvedValue(openOrder({ exchangePrice: 400000 }));
        const agreed = await service.offerAsDriver('u-driver', 'order-1', { agree: true });
        expect(agreed.price).toBe(246600);
        expect(prisma.exchangeOffer.upsert.mock.calls[0][0].create.price).toBe(472444.5);
    });

    it('цена компании не покрывает топливо — согласиться нельзя, понятный отказ', async () => {
        const { service, prisma, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        prisma.order.findFirst.mockResolvedValue(openOrder({ exchangePrice: 100000 }));
        await expect(service.offerAsDriver('u-driver', 'order-1', { agree: true })).rejects.toThrow(/не покрывает топливо/);
    });

    it('без заявления на вычет — ИПН со всего', async () => {
        const { service, prisma, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        prisma.exchangeDriver.findUnique.mockResolvedValue({ id: 'd-1', deductionRequested: false });
        await service.offerAsDriver('u-driver', 'order-1', { price: 400000 });
        expect(prisma.exchangeOffer.upsert.mock.calls[0][0].create.calc).toMatchObject({ ipn: 40000, deductionApplied: false });
    });

    it('компания выбрала водителя парка — расчёт рейса фиксируется по схеме шефа, компании — её цена', async () => {
        const { service, prisma, tx, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        await service.offerAsDriver('u-driver', 'order-1', { price: 400000 });
        prisma.exchangeOffer.findFirst.mockResolvedValue(PARK_OFFER(prisma.exchangeOffer.upsert.mock.calls[0][0].create));
        await service.accept(OUR, 'u-manager', 'order-1', 'offer-1');
        expect(tx.order.updateMany.mock.calls[0][0].data).toMatchObject({ driverCost: 688994.16, partnerId: 'park-1' });
        expect(tx.exchangeTripSettlement.upsert.mock.calls[0][0].create).toMatchObject({
            orderId: 'order-1', driverId: 'd-1', parkCompanyId: 'park-1', scheme: 2, base: 570444.44,
            driverTotal: 400000, workNet: 400000, customerPrice: 688994.16, taxMonth: '2026-10',
            deductionAmount: 129750, ipnBase: 270250, vat: 0, preliminary: true,
        });
    });

    it('пока отклик ждал, другой рейс месяца забрал вычет — цена компании и сумма водителю те же, разница — у парка', async () => {
        const { service, prisma, tx, drivers } = build();
        drivers.approvedDriver.mockResolvedValue(PARK_DRIVER);
        await service.offerAsDriver('u-driver', 'order-1', { price: 400000 });
        const saved = prisma.exchangeOffer.upsert.mock.calls[0][0].create;
        prisma.exchangeOffer.findFirst.mockResolvedValue(PARK_OFFER(saved));
        prisma.exchangeTripSettlement.findMany.mockResolvedValue([{
            taxMonth: '2026-10', orderId: 'order-other', deductionAmount: 129750, deductionApplied: true, ipnBase: 0,
            order: { driverId: 'u-1' }, driver: { userId: 'u-1' },
        }]);
        await service.accept(OUR, 'u-manager', 'order-1', 'offer-1');
        const fixed = tx.exchangeTripSettlement.upsert.mock.calls[0][0].create;
        expect(fixed).toMatchObject({ customerPrice: 688994.16, driverTotal: 400000, deductionApplied: false, deductionAmount: 0, ipn: 40000 });
        expect(fixed.parkFee).toBe(18342.91);
    });
});
