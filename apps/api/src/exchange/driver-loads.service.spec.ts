import { ForbiddenException } from '@nestjs/common';
import { ExchangeDriverLoadsService } from './driver-loads.service';

function boardRow(overrides: Record<string, any> = {}) {
    return {
        id: 'order-1', orderNumber: '7A-0042',
        cargoDescription: 'Напитки', cargoWeight: 20000, cargoVolume: null, cargoType: 'Тент', natureOfCargo: null,
        palletCount: null, loadingTypes: [], packagingTypes: [], tempMin: null, tempMax: null, adr: null, adrClass: null,
        requirements: null, exchangePrice: 420000, exchangeNote: null, exchangePublishedAt: new Date(),
        forwarder: { name: 'ТОО Экспедитор' }, customerCompany: null, subForwarder: null, subForwarderId: null, forwarderId: 'fwd',
        routePoints: [
            { pointType: 'PICKUP', sequence: 1, expectedDate: new Date('2099-01-10T03:00:00Z'), location: { city: 'Шымкент', region: null, cityRecord: null } },
            { pointType: 'DELIVERY', sequence: 2, expectedDate: null, location: { city: 'Алматы', region: null, cityRecord: null } },
        ],
        ...overrides,
    };
}

function build(driver: any = { id: 'd-1', status: 'APPROVED', kind: 'PARK', tripsCompleted: 0 }) {
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
        $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const s3: any = { isS3Enabled: () => true, deleteFile: jest.fn() };
    return { service: new ExchangeDriverLoadsService(prisma, s3), prisma };
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
});

describe('Биржа · водитель: лента', () => {
    it('только заявки на бирже без исполнителя, с городами и ценой', async () => {
        const { service, prisma } = build();
        const feed = await service.feed('u-1');
        expect(prisma.order.findMany.mock.calls[0][0].where).toMatchObject({ exchangeClosedAt: null, driverId: null, partnerId: null });
        expect(feed[0]).toMatchObject({ from: 'Шымкент', to: 'Алматы', price: 420000, orderNumber: '7A-0042' });
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
