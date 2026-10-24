import { ForbiddenException } from '@nestjs/common';
import { ExchangeDriverLoadsService } from './driver-loads.service';
import { PUBLISHER_HAS_ACCESS } from './exchange-access';
import { ExchangeSettlementService } from './settlement.service';

function boardRow(overrides: Record<string, any> = {}) {
    return {
        id: 'order-1', orderNumber: '7A-0042',
        cargoDescription: 'Напитки', cargoWeight: 20000, cargoVolume: null, cargoType: 'Тент', natureOfCargo: null,
        palletCount: null, loadingTypes: [], packagingTypes: [], tempMin: null, tempMax: null, adr: null, adrClass: null,
        requirements: null, exchangePrice: 400000, exchangeNote: null, exchangePublishedAt: new Date(), exchangeDistanceKm: 1200,
        forwarder: { name: 'ТОО Экспедитор' }, customerCompany: null, subForwarder: null, subForwarderId: null, forwarderId: 'fwd',
        routePoints: [
            { pointType: 'PICKUP', sequence: 1, expectedDate: new Date('2099-01-10T03:00:00Z'), location: { city: 'Шымкент', region: null, cityRecord: null } },
            { pointType: 'DELIVERY', sequence: 2, expectedDate: null, location: { city: 'Алматы', region: null, cityRecord: null } },
        ],
        ...overrides,
    };
}

function build(driver: any = { id: 'd-1', status: 'APPROVED', kind: 'PARK', tripsCompleted: 0, parkCompanyId: 'park-1', park: { exchangeAccess: true } }) {
    const prisma: any = {
        exchangeDriver: {
            findUnique: jest.fn().mockResolvedValue(driver),
            update: jest.fn(),
        },
        order: {
            findMany: jest.fn().mockResolvedValue([boardRow()]),
            findFirst: jest.fn().mockResolvedValue(boardRow()),
        },
        exchangeDriverDocument: { deleteMany: jest.fn() },
        session: { deleteMany: jest.fn() },
        user: { update: jest.fn() },
        // Ставки парка как в калькуляции шефа (5 % парка), вычет в месяце ещё не брали.
        parkPayoutRates: { findUnique: jest.fn().mockResolvedValue({
            commissionPct: 10, opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, fuelPerKm: 100,
            applyDeduction: true, deductionMrp: 30, mrp: 4325, vatPayer: false, vatPct: 16, ratesConfirmedAt: null,
            fuelConsumption: 30, fuelPriceSummer: 350, fuelPriceWinter: null, fuelSeason: 'SUMMER', ipnHighPct: 15, ipnThresholdMrp: 8500,
        }) },
        platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        exchangeTripSettlement: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const s3: any = { isS3Enabled: () => true, deleteFile: jest.fn() };
    return { service: new ExchangeDriverLoadsService(prisma, s3, new ExchangeSettlementService(prisma)), prisma };
}

describe('Биржа · водитель: допуск', () => {
    it('анкета на проверке — заявок не видно, и сказано почему', async () => {
        const { service } = build({ id: 'd-1', status: 'PENDING' });
        await expect(service.feed('u-1')).rejects.toThrow(/на проверке у парка/);
    });

    it('заблокированный заявок не видит', async () => {
        const { service } = build({ id: 'd-1', status: 'BLOCKED' });
        await expect(service.feed('u-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('биржа на проверке: водитель парка без доступа заявок не видит', async () => {
        const { service } = build({ id: 'd-1', status: 'APPROVED', kind: 'PARK', park: { exchangeAccess: false } });
        await expect(service.feed('u-1')).rejects.toThrow(/тестовом режиме/);
    });

    it('биржа на проверке: водитель со своим ИП (без парка) — тоже нет', async () => {
        const { service } = build({ id: 'd-1', status: 'APPROVED', kind: 'IP', park: null });
        await expect(service.feed('u-1')).rejects.toThrow(/тестовом режиме/);
    });

    it('лента — только заявки компаний, которым открыта биржа', async () => {
        const { service, prisma } = build();
        await service.feed('u-1');
        expect(prisma.order.findMany.mock.calls[0][0].where.AND).toEqual([PUBLISHER_HAS_ACCESS]);
    });
});

describe('Биржа · водитель: лента', () => {
    it('только заявки на бирже без исполнителя, с городами и суммой водителю на руки', async () => {
        const { service, prisma } = build();
        const feed = await service.feed('u-1');
        expect(prisma.order.findMany.mock.calls[0][0].where).toMatchObject({ exchangeClosedAt: null, driverId: null, partnerId: null });
        // Схема шефа: 400 000 − топливо 126 000 (1 200 км × 30 л × 350 ₸) = 274 000 за работу,
        // минус ОПВ 27 400 — на руки 246 600. Без заявления на вычет ИПН со всего.
        // Схема шефа: 400 000 − топливо 126 000 − ОПВ 27 400 = 246 600 на руки.
        expect(feed[0]).toMatchObject({ from: 'Шымкент', to: 'Алматы', price: 246600, orderNumber: '7A-0042' });
    });

    it('водителю — только сумма на руки: ни суммы за рейс, ни топлива, ни налогов (Q14)', async () => {
        const { service, prisma } = build();
        prisma.parkPayoutRates.findUnique.mockResolvedValue({ ...{
            commissionPct: 10, opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, fuelPerKm: 100,
            applyDeduction: true, deductionMrp: 30, mrp: 4325, vatPayer: false, vatPct: 16, ratesConfirmedAt: null,
            fuelConsumption: 30, fuelPriceSummer: 350, fuelPriceWinter: null, fuelSeason: 'SUMMER', ipnHighPct: 15, ipnThresholdMrp: 8500,
        }, vatPayer: true });
        const [load] = await service.feed('u-1');
        const card = await service.card('u-1', 'order-1');
        expect(load.price).toBe(246600);
        for (const v of [load, card]) {
            expect(v).not.toHaveProperty('breakdown');
            expect(v).not.toHaveProperty('fuelEstimate');
            // 400 000 — сумма за рейс, 126 000 — топливо, 27 400 — ОПВ,
            // 564 591,72 — цена для компании с НДС: ничего из этого в ответе нет.
            const json = JSON.stringify(v);
            for (const hidden of ['customerPrice', 'commission', 'parkFee', 'platformFee', 'opv', 'vosms', 'ipn', '"so"', 'vat', 'fuel', '400000', '126000', '27400', '564591']) {
                expect(json).not.toContain(hidden);
            }
        }
    });

    it('договорная цена — суммы на руки нет', async () => {
        const { service, prisma } = build();
        prisma.order.findMany.mockResolvedValue([boardRow({ exchangePrice: null })]);
        expect((await service.feed('u-1'))[0].price).toBeNull();
    });

    it('«мой кузов» — без учёта регистра', async () => {
        const { service, prisma } = build();
        prisma.order.findMany.mockResolvedValue([boardRow(), boardRow({ id: 'order-2', cargoType: 'Рефрижератор' })]);
        expect((await service.feed('u-1', 'тент')).map((v) => v.id)).toEqual(['order-1']);
    });

    it('снятая заявка — так и сказано', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue(null);
        await expect(service.card('u-1', 'order-1')).rejects.toThrow(/снята с биржи/);
    });
});

describe('Биржа · водитель: удалить аккаунт', () => {
    it('личные данные стираются, вход закрывается', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue(null);
        prisma.exchangeDriver.findUnique.mockResolvedValue({ id: 'd-1', documents: [{ id: 'doc-1', fileKey: 'uploads/x.jpg' }] });
        await service.deleteAccount('u-1');
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data).toMatchObject({ iin: null, phone: null, lastName: null });
        expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ isActive: false, googleId: null, email: null });
    });

    it('с грузом в пути аккаунт не удалить', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue({ orderNumber: '7A-0042' });
        await expect(service.deleteAccount('u-1')).rejects.toThrow(/довезите груз по заявке 7A-0042/);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });
});
