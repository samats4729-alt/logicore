import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExchangeService, loadNumber, MAX_LOAD_PHOTOS } from './exchange.service';
import { exchangeEnabled, ExchangeEnabledGuard } from './exchange-enabled.guard';
import { kzTodayString } from '../common/utils/business-date';

const COMPANY = 'company-1';
const USER = 'user-1';

function row(overrides: Record<string, any> = {}) {
    return {
        id: 'load-1', seq: 7, status: 'OPEN',
        originCityId: null, originCityName: 'Шымкент', originAddress: null,
        destinationCityId: null, destinationCityName: 'Алматы', destinationAddress: null,
        loadingDate: new Date('2030-01-10T00:00:00Z'), loadingTime: null,
        bodyType: 'Тент', cargoDescription: 'Напитки', weightKg: 20000, volumeM3: null, requirements: null,
        price: 450000, cancelledAt: null, cancelReason: null, createdAt: new Date(),
        createdBy: { firstName: 'Алия', lastName: 'Менеджер' },
        photos: [],
        ...overrides,
    };
}

function build(overrides: Record<string, any> = {}) {
    const prisma: any = {
        city: { findUnique: jest.fn().mockResolvedValue(null) },
        exchangeLoad: {
            create: jest.fn(async (args: any) => row({ ...args.data })),
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(row()),
            groupBy: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        exchangeLoadPhoto: {
            create: jest.fn(async (args: any) => ({ id: 'p-1', fileName: args.data.fileName, mimeType: args.data.mimeType })),
            findFirst: jest.fn(),
            delete: jest.fn(),
        },
        order: { findMany: jest.fn().mockResolvedValue([]) },
        ...overrides,
    };
    const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn(), deleteFile: jest.fn() };
    return { service: new ExchangeService(prisma, s3), prisma, s3 };
}

const dto = (overrides: Record<string, any> = {}) => ({
    originCityName: ' г. Шымкент ',
    destinationCityName: 'Алматы',
    loadingDate: '2030-01-10',
    bodyType: 'Тент',
    cargoDescription: ' Напитки ',
    weightKg: 20000,
    price: 450000,
    ...overrides,
});

describe('Биржа: груз от компании', () => {
    it('номер груза — с буквой Б, чтобы не путать с номером заявки', () => {
        expect(loadNumber(7)).toBe('Б-0007');
        expect(loadNumber(12345)).toBe('Б-12345');
    });

    it('груз ставится от компании и человека, город запоминается ключом направления', async () => {
        const { service, prisma } = build();
        const load = await service.create(COMPANY, USER, dto());

        const data = prisma.exchangeLoad.create.mock.calls[0][0].data;
        expect(data.companyId).toBe(COMPANY);
        expect(data.createdById).toBe(USER);
        expect(data.originCityName).toBe('г. Шымкент');
        expect(data.originCityKey).toBe('шымкент');
        expect(data.cargoDescription).toBe('Напитки');
        expect(data.loadingDate.toISOString()).toBe('2030-01-10T00:00:00.000Z');
        expect(load.number).toBe('Б-0007');
        expect(load.createdByName).toBe('Менеджер Алия');
    });

    it('выдуманная ссылка на город не ломает сохранение — город остаётся текстом', async () => {
        const { service, prisma } = build();
        await service.create(COMPANY, USER, dto({ originCityId: 'нет-такого' }));
        expect(prisma.exchangeLoad.create.mock.calls[0][0].data.originCityId).toBeNull();
    });

    it('вчерашний день погрузки не принимается', async () => {
        const { service, prisma } = build();
        await expect(service.create(COMPANY, USER, dto({ loadingDate: '2020-01-01' })))
            .rejects.toThrow(/уже прошёл/);
        expect(prisma.exchangeLoad.create).not.toHaveBeenCalled();
    });

    it('сегодняшний день погрузки принимается', async () => {
        const { service } = build();
        await expect(service.create(COMPANY, USER, dto({ loadingDate: kzTodayString() }))).resolves.toBeDefined();
    });

    it('город из одних знаков препинания — не город', async () => {
        const { service } = build();
        await expect(service.create(COMPANY, USER, dto({ originCityName: ' . ' })))
            .rejects.toThrow(/откуда везти/);
    });
});

describe('Биржа: список и карточка', () => {
    it('компания видит только свои грузы, по умолчанию — те, что в работе', async () => {
        const { service, prisma } = build();
        await service.list(COMPANY);
        const where = prisma.exchangeLoad.findMany.mock.calls[0][0].where;
        expect(where.companyId).toBe(COMPANY);
        expect(where.status.in).toEqual(['OPEN', 'TAKEN', 'IN_TRANSIT']);
    });

    it('счётчики вкладок считаются по статусам', async () => {
        const { service } = build({
            exchangeLoad: {
                findMany: jest.fn().mockResolvedValue([]),
                groupBy: jest.fn().mockResolvedValue([
                    { status: 'OPEN', _count: { _all: 2 } },
                    { status: 'TAKEN', _count: { _all: 1 } },
                    { status: 'CANCELLED', _count: { _all: 4 } },
                ]),
            },
        });
        const { counts } = await service.list(COMPANY, 'all');
        expect(counts).toEqual({ active: 3, done: 0, cancelled: 4, all: 7 });
    });

    it('чужой груз — «не найден»', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValue(null);
        await expect(service.findOne(COMPANY, 'load-x')).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.exchangeLoad.findFirst.mock.calls[0][0].where).toEqual({ id: 'load-x', companyId: COMPANY });
    });
});

describe('Биржа: снять груз', () => {
    it('пока груз ищет машину — снимается с причиной', async () => {
        const { service, prisma } = build();
        await service.cancel(COMPANY, 'load-1', ' клиент отменил ');
        const args = prisma.exchangeLoad.updateMany.mock.calls[0][0];
        expect(args.where).toEqual({ id: 'load-1', companyId: COMPANY, status: 'OPEN' });
        expect(args.data.status).toBe('CANCELLED');
        expect(args.data.cancelReason).toBe('клиент отменил');
    });

    it('взятый водителем груз кнопкой не снимается', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValue(row({ status: 'TAKEN' }));
        await expect(service.cancel(COMPANY, 'load-1', 'передумали')).rejects.toThrow(/взял водитель/);
        expect(prisma.exchangeLoad.updateMany).not.toHaveBeenCalled();
    });

    it('водитель взял в ту же секунду — снятие не перезаписывает его', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.cancel(COMPANY, 'load-1', 'передумали')).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('Биржа: почём возили по направлению', () => {
    it('прошлые грузы биржи и свои рейсы по тому же направлению, медиана — без случайных выбросов', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findMany.mockResolvedValue([
            { seq: 1, loadingDate: new Date(), price: 400000, bodyType: 'Тент', weightKg: 20000, companyId: 'other' },
            { seq: 2, loadingDate: new Date(), price: 900000, bodyType: 'Реф', weightKg: 20000, companyId: COMPANY },
        ]);
        const point = (pointType: string, sequence: number, city: string) => ({ pointType, sequence, location: { city, cityRecord: null } });
        prisma.order.findMany.mockResolvedValue([
            { orderNumber: '001', createdAt: new Date(), driverCost: 420000, cargoType: 'Тент', cargoWeight: 19500,
                routePoints: [point('PICKUP', 1, 'Чимкент'), point('DELIVERY', 2, 'г. Алматы')] },
            { orderNumber: '002', createdAt: new Date(), driverCost: 100000, cargoType: 'Тент', cargoWeight: 1000,
                routePoints: [point('PICKUP', 1, 'Шымкент'), point('DELIVERY', 2, 'Тараз')] },
        ]);

        const res = await service.routePrices(COMPANY, { originCityName: 'Шымкент', destinationCityName: 'Алматы' });

        expect(res.exchange.map((r) => r.number)).toEqual(['Б-0001', 'Б-0002']);
        expect(res.exchange[1].own).toBe(true);
        // «Чимкент» — тот же Шымкент; рейс в Тараз — другое направление.
        expect(res.ownOrders.map((o) => o.orderNumber)).toEqual(['001']);
        expect(res.summary).toEqual({ count: 3, min: 400000, max: 900000, median: 420000 });
        // Снятые грузы — не цена рынка.
        expect(prisma.exchangeLoad.findMany.mock.calls[0][0].where.status).toEqual({ not: 'CANCELLED' });
        // Свои рейсы — только своей компании.
        expect(prisma.order.findMany.mock.calls[0][0].where.forwarderId).toBe(COMPANY);
    });

    it('нет истории — нет и сводки', async () => {
        const { service } = build();
        const res = await service.routePrices(COMPANY, { originCityName: 'Шымкент', destinationCityName: 'Алматы' });
        expect(res.summary).toBeNull();
    });
});

describe('Биржа: фото груза', () => {
    const image = (overrides: Record<string, any> = {}) => ({
        originalname: 'груз.jpg', mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), ...overrides,
    }) as any;

    it('фото ложится в хранилище и в карточку груза', async () => {
        const { service, prisma, s3 } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValue({ id: 'load-1', status: 'OPEN', _count: { photos: 0 } });
        await service.addPhoto(COMPANY, 'load-1', image());
        expect(s3.uploadFile.mock.calls[0][0]).toMatch(/^uploads\/exchange\/load-1\/.+\.jpg$/);
        expect(prisma.exchangeLoadPhoto.create).toHaveBeenCalled();
    });

    it('не фото — не принимается', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValue({ id: 'load-1', status: 'OPEN', _count: { photos: 0 } });
        await expect(service.addPhoto(COMPANY, 'load-1', image({ mimetype: 'application/pdf', originalname: 'a.pdf' })))
            .rejects.toThrow(/только фотографии/);
    });

    it(`больше ${MAX_LOAD_PHOTOS} фото — нельзя`, async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValue({ id: 'load-1', status: 'OPEN', _count: { photos: MAX_LOAD_PHOTOS } });
        await expect(service.addPhoto(COMPANY, 'load-1', image())).rejects.toThrow(/Не больше/);
    });

    it('чужое фото не отдаётся', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoadPhoto.findFirst.mockResolvedValue(null);
        await expect(service.photo(COMPANY, 'p-1')).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.exchangeLoadPhoto.findFirst.mock.calls[0][0].where).toEqual({ id: 'p-1', load: { companyId: COMPANY } });
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
