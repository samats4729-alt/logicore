import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExchangeService } from './exchange.service';
import { EXCHANGE_ORDER_SELECT, exchangeView, managerOf, notPast } from './exchange-orders';
import { exchangeEnabled, ExchangeEnabledGuard } from './exchange-enabled.guard';

const OUR = 'company-ours';
const OTHER = 'company-other';
const USER = 'user-1';

/** Заявка, как её отдаёт выборка состояния биржи. */
function order(overrides: Record<string, any> = {}) {
    return {
        id: 'order-1', orderNumber: '3K-2607', status: 'PENDING',
        customerCompanyId: 'client-1', forwarderId: OUR, subForwarderId: null,
        partnerId: null, driverId: null, assignedDriverName: null,
        driverCost: 400000,
        exchangePublishedAt: null, exchangePrice: null, exchangeNote: null,
        exchangeClosedAt: null, exchangeCloseReason: null,
        _count: { exchangeOffers: 0 },
        routePoints: [{ pointType: 'PICKUP', location: { city: 'Шымкент', cityRecord: null } }, { pointType: 'DELIVERY', location: { city: 'Алматы', cityRecord: null } }],
        ...overrides,
    };
}

/** Заявка, как её отдаёт выборка биржи (то, что видят другие). */
function boardRow(overrides: Record<string, any> = {}) {
    return {
        id: 'order-2', orderNumber: '7A-0042',
        cargoDescription: 'Напитки', cargoWeight: 20000, cargoVolume: 82, cargoType: 'Тент', natureOfCargo: null,
        palletCount: 33, loadingTypes: ['задняя'], packagingTypes: [], tempMin: null, tempMax: null, adr: null, adrClass: null,
        requirements: null, exchangePrice: 450000, exchangeNote: 'Ремни 10 шт', exchangePublishedAt: new Date(),
        forwarder: { name: 'ТОО Экспедитор' }, customerCompany: { name: 'ТОО Клиент' }, subForwarder: null,
        subForwarderId: null, forwarderId: OTHER,
        routePoints: [
            { pointType: 'PICKUP', sequence: 1, expectedDate: new Date('2030-01-10T03:00:00Z'), location: { city: 'Шымкент', region: null, cityRecord: null } },
            { pointType: 'DELIVERY', sequence: 2, expectedDate: new Date('2030-01-12T03:00:00Z'), location: { city: 'алматы', region: null, cityRecord: { name: 'Алматы' } } },
        ],
        ...overrides,
    };
}

function build(state = order()) {
    const prisma: any = {
        order: {
            findFirst: jest.fn().mockResolvedValue(state),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            update: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        exchangeOffer: { updateMany: jest.fn() },
        $transaction: jest.fn(async (ops: any[]) => ops),
    };
    return { service: new ExchangeService(prisma), prisma };
}

describe('Биржа: кто выставляет заявку', () => {
    it('выставляет компания, которая ищет исполнителя: суб-экспедитор, иначе экспедитор, иначе заказчик', () => {
        expect(managerOf({ subForwarderId: 'sub', forwarderId: 'fwd', customerCompanyId: 'cli' })).toBe('sub');
        expect(managerOf({ forwarderId: 'fwd', customerCompanyId: 'cli' })).toBe('fwd');
        expect(managerOf({ customerCompanyId: 'cli' })).toBe('cli');
    });

    it('свободную заявку экспедитор выставляет — с ценой и примечанием', async () => {
        const { service, prisma } = build();
        const after = order({ exchangePublishedAt: new Date(), exchangePrice: 450000, exchangeNote: 'Ремни' });
        prisma.order.findFirst.mockResolvedValueOnce(order()).mockResolvedValueOnce(after);
        const state = await service.publish(OUR, USER, 'order-1', { price: 450000, note: ' Ремни ' });
        const call = prisma.order.updateMany.mock.calls[0][0];
        expect(call.where).toMatchObject({ id: 'order-1', partnerId: null, driverId: null, assignedDriverName: null });
        expect(call.data).toMatchObject({ exchangePrice: 450000, exchangeNote: 'Ремни', exchangePublishedById: USER, exchangeClosedAt: null });
        expect(state.onExchange).toBe(true);
    });

    it('заказчик, у которого рейс ведёт экспедитор, выставить не может', async () => {
        const { service } = build(order({ customerCompanyId: OUR, forwarderId: OTHER }));
        await expect(service.publish(OUR, USER, 'order-1', { price: 1 })).rejects.toThrow(/только компания, которая ищет исполнителя/);
    });

    it('с исполнителем или в работе — не выставить, и сказано почему', async () => {
        await expect(build(order({ driverId: 'd-1' })).service.publish(OUR, USER, 'order-1', { price: 1 }))
            .rejects.toThrow(/уже есть исполнитель/);
        await expect(build(order({ partnerId: 'carrier' })).service.publish(OUR, USER, 'order-1', { price: 1 }))
            .rejects.toThrow(/уже есть исполнитель/);
        await expect(build(order({ status: 'IN_TRANSIT' })).service.publish(OUR, USER, 'order-1', { price: 1 }))
            .rejects.toThrow(/в работе или закрыта/);
    });

    it('без погрузки и выгрузки — не выставить', async () => {
        const { service } = build(order({ routePoints: [{ pointType: 'PICKUP', location: { city: 'Шымкент', cityRecord: null } }] }));
        await expect(service.publish(OUR, USER, 'order-1', { price: 1 })).rejects.toThrow(/погрузку и выгрузку/);
    });

    it('исполнителя назначили, пока открыта форма, — заявка на биржу не уходит', async () => {
        const { service, prisma } = build();
        prisma.order.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.publish(OUR, USER, 'order-1', { price: 1 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('чужая заявка — «не найдена»', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue(null);
        await expect(service.state(OUR, 'order-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('снять — с причиной; снятую второй раз не снять', async () => {
        const published = order({ exchangePublishedAt: new Date() });
        const { service, prisma } = build(published);
        await service.unpublish(OUR, 'order-1', ' Нашли машину сами ');
        expect(prisma.order.update.mock.calls[0][0].data).toMatchObject({ exchangeCloseReason: 'Нашли машину сами' });
        // Ждущим откликам — «не актуально».
        expect(prisma.exchangeOffer.updateMany.mock.calls[0][0]).toMatchObject({ where: { orderId: 'order-1', status: 'ACTIVE' }, data: { status: 'REJECTED' } });

        const closed = build(order({ exchangePublishedAt: new Date(), exchangeClosedAt: new Date() }));
        await expect(closed.service.unpublish(OUR, 'order-1', 'ещё раз')).rejects.toThrow(/уже не на бирже/);
    });

    it('назначили исполнителя обычным порядком — заявка уже не числится на бирже', async () => {
        const { service } = build(order({ exchangePublishedAt: new Date(), driverId: 'd-1', status: 'ASSIGNED' }));
        const state = await service.state(OUR, 'order-1');
        expect(state.onExchange).toBe(false);
    });
});

describe('Биржа: что видят другие', () => {
    it('свои заявки на бирже не показываются', async () => {
        const { service, prisma } = build();
        await service.board(OUR);
        const where = prisma.order.findMany.mock.calls[0][0].where;
        // Пустое поле — тоже «не своя»: иначе заявка без суб-экспедитора пропадала с биржи.
        expect(where.AND).toEqual([
            { OR: [{ customerCompanyId: null }, { customerCompanyId: { not: OUR } }] },
            { OR: [{ forwarderId: null }, { forwarderId: { not: OUR } }] },
            { OR: [{ subForwarderId: null }, { subForwarderId: { not: OUR } }] },
        ]);
        expect(where).toMatchObject({ exchangeClosedAt: null, driverId: null, partnerId: null });
    });

    it('видны города, даты, груз и цена — без адресов, заказчика и денег экспедитора', () => {
        const view = exchangeView(boardRow() as any);
        expect(view).toMatchObject({ from: 'Шымкент', to: 'Алматы', price: 450000, note: 'Ремни 10 шт', companyName: 'ТОО Экспедитор' });
        const text = JSON.stringify(view);
        expect(text).not.toMatch(/ТОО Клиент|customerPrice|driverCost|address/);
        // В выборке биржи нет ни адресов, ни цен заказчика — лишнее не запросится.
        const select = JSON.stringify(EXCHANGE_ORDER_SELECT);
        expect(select).not.toMatch(/address|customerPrice|driverCost|"name":true,"address"/);
    });

    it('погрузка в прошлом — не показываем; без даты — показываем', () => {
        const now = new Date('2030-01-11T06:00:00Z');
        expect(notPast(boardRow() as any, now)).toBe(false);
        expect(notPast(boardRow({ routePoints: [{ pointType: 'PICKUP', sequence: 1, expectedDate: null, location: { city: 'Шымкент', region: null, cityRecord: null } }] }) as any, now)).toBe(true);
    });

    it('фильтр «откуда» и «кузов» — без учёта регистра', async () => {
        const { service, prisma } = build();
        prisma.order.findMany.mockResolvedValue([boardRow(), boardRow({ id: 'order-3', cargoType: 'Реф' })]);
        expect((await service.board(OUR, { from: 'шым', bodyType: 'тент' })).map((v) => v.id)).toEqual(['order-2']);
        expect(await service.board(OUR, { to: 'Астана' })).toEqual([]);
    });

    it('снятая или занятая заявка — «уже снята с биржи»', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue(null);
        await expect(service.card(OUR, 'order-2')).rejects.toThrow(/снята с биржи/);
    });
});

describe('Биржа: выключатель', () => {
    const saved = process.env.EXCHANGE_ENABLED;
    afterEach(() => { process.env.EXCHANGE_ENABLED = saved; });

    it('без EXCHANGE_ENABLED=true биржи нет — адреса отвечают «не найдено»', () => {
        delete process.env.EXCHANGE_ENABLED;
        expect(exchangeEnabled()).toBe(false);
        expect(() => new ExchangeEnabledGuard().canActivate()).toThrow(NotFoundException);
    });

    it('включена — пропускает', () => {
        process.env.EXCHANGE_ENABLED = 'true';
        expect(new ExchangeEnabledGuard().canActivate()).toBe(true);
    });
});
