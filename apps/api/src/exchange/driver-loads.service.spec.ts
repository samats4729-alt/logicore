import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExchangeDriverLoadsService } from './driver-loads.service';

function loadRow(overrides: Record<string, any> = {}) {
    return {
        id: 'load-1', seq: 3, status: 'OPEN',
        originCityName: 'Шымкент', originAddress: null, destinationCityName: 'Алматы', destinationAddress: null,
        loadingDate: new Date('2030-01-10T00:00:00Z'), loadingTime: null, bodyType: 'тент', cargoDescription: 'Напитки',
        weightKg: 20000, volumeM3: null, requirements: null, price: 420000,
        takenAt: null, loadedAt: null, deliveredAt: null, driverId: null,
        company: { name: 'ТОО Заказчик' }, photos: [{ id: 'p-1' }],
        createdBy: { firstName: 'Алия', lastName: 'Менеджер', phone: '+77010000000' },
        ...overrides,
    };
}

function build(driver: any = { id: 'd-1', status: 'APPROVED', kind: 'PARK', tripsCompleted: 0 }) {
    const prisma: any = {
        exchangeDriver: {
            findUnique: jest.fn().mockResolvedValue(driver),
            update: jest.fn(),
        },
        exchangeLoad: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(loadRow()),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        exchangeLoadDecline: { create: jest.fn() },
        exchangeLoadPhoto: { findFirst: jest.fn() },
        exchangeDriverDocument: { deleteMany: jest.fn() },
        session: { deleteMany: jest.fn() },
        user: { update: jest.fn() },
        $transaction: jest.fn(async (ops: any[]) => ops),
    };
    const s3: any = { isS3Enabled: () => true, deleteFile: jest.fn() };
    return { service: new ExchangeDriverLoadsService(prisma, s3), prisma };
}

describe('Биржа · водитель: допуск', () => {
    it('анкета на проверке — грузов не видно, и сказано почему', async () => {
        const { service } = build({ id: 'd-1', status: 'PENDING' });
        await expect(service.feed('u-1')).rejects.toThrow(/на проверке у парка/);
    });

    it('заблокированный грузов не видит', async () => {
        const { service } = build({ id: 'd-1', status: 'BLOCKED' });
        await expect(service.feed('u-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('Биржа · водитель: лента', () => {
    it('только грузы, которые ищут машину, с сегодняшнего дня, без тех, от которых отказался', async () => {
        const { service, prisma } = build();
        await service.feed('u-1', 'тент');
        const where = prisma.exchangeLoad.findMany.mock.calls[0][0].where;
        expect(where.status).toBe('OPEN');
        expect(where.loadingDate.gte).toBeInstanceOf(Date);
        expect(where.declines).toEqual({ none: { driverId: 'd-1' } });
        expect(where.bodyType).toBe('тент');
    });

    it('контакт отправителя — только тому, кто груз взял', async () => {
        const { service, prisma } = build();
        expect((await service.card('u-1', 'load-1')).contact).toBeNull();
        prisma.exchangeLoad.findFirst.mockResolvedValue(loadRow({ status: 'TAKEN', driverId: 'd-1' }));
        expect((await service.card('u-1', 'load-1')).contact).toEqual({ name: 'Алия Менеджер', phone: '+77010000000' });
    });

    it('чужой взятый груз не открывается', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValue(null);
        await expect(service.card('u-1', 'load-1')).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.exchangeLoad.findFirst.mock.calls[0][0].where.OR).toEqual([{ status: 'OPEN' }, { driverId: 'd-1' }]);
    });
});

describe('Биржа · водитель: «Беру»', () => {
    it('кто первый — тот везёт: груз берётся только если ещё ищет машину', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst
            .mockResolvedValueOnce(null) // активного рейса нет
            .mockResolvedValue(loadRow({ status: 'TAKEN', driverId: 'd-1' }));
        await service.take('u-1', 'load-1');
        const args = prisma.exchangeLoad.updateMany.mock.calls[0][0];
        expect(args.where).toMatchObject({ id: 'load-1', status: 'OPEN' });
        expect(args.data).toMatchObject({ status: 'TAKEN', driverId: 'd-1' });
    });

    it('опоздал — «уже взял другой водитель»', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValueOnce(null);
        prisma.exchangeLoad.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.take('u-1', 'load-1')).rejects.toThrow(/другой водитель/);
    });

    it('один рейс за раз — сначала довезти текущий', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValueOnce({ seq: 7 });
        await expect(service.take('u-1', 'load-1')).rejects.toThrow(/Б-0007/);
        expect(prisma.exchangeLoad.updateMany).not.toHaveBeenCalled();
    });
});

describe('Биржа · водитель: рейс', () => {
    it('в своих рейсах телефон отправителя открыт — звонить прямо с экрана рейса', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findMany.mockResolvedValue([loadRow({ status: 'TAKEN', driverId: 'd-1' })]);
        const [trip] = await service.trips('u-1');
        expect(prisma.exchangeLoad.findMany.mock.calls[0][0].where).toEqual({ driverId: 'd-1' });
        expect(trip.contact).toEqual({ name: 'Алия Менеджер', phone: '+77010000000' });
        expect(trip).not.toHaveProperty('createdBy');
    });

    it('«Погрузился» — только из «взят», «Доставил» — только из «в пути»', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValue(loadRow({ status: 'IN_TRANSIT', driverId: 'd-1' }));
        await service.advance('u-1', 'load-1', 'IN_TRANSIT');
        expect(prisma.exchangeLoad.updateMany.mock.calls[0][0].where).toMatchObject({ status: 'TAKEN', driverId: 'd-1' });
        await service.advance('u-1', 'load-1', 'DELIVERED');
        expect(prisma.exchangeLoad.updateMany.mock.calls[1][0].where).toMatchObject({ status: 'IN_TRANSIT' });
    });

    it('довёз — счётчик рейсов растёт', async () => {
        const { service, prisma } = build();
        prisma.exchangeLoad.findFirst.mockResolvedValue(loadRow({ status: 'DELIVERED', driverId: 'd-1' }));
        await service.advance('u-1', 'load-1', 'DELIVERED');
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data).toEqual({ tripsCompleted: { increment: 1 } });
    });

    it('сняться можно только до погрузки, и отказ записывается', async () => {
        const { service, prisma } = build();
        await service.release('u-1', 'load-1', 'сломалась машина');
        expect(prisma.exchangeLoad.updateMany.mock.calls[0][0].where).toMatchObject({ status: 'TAKEN', driverId: 'd-1' });
        expect(prisma.exchangeLoadDecline.create.mock.calls[0][0].data).toMatchObject({ afterTaking: true, reason: 'сломалась машина' });

        prisma.exchangeLoad.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.release('u-1', 'load-1', 'передумал')).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('Биржа · водитель: удалить аккаунт', () => {
    it('личные данные стираются, вход закрывается', async () => {
        const { service, prisma } = build();
        prisma.exchangeDriver.findUnique.mockResolvedValue({ id: 'd-1', documents: [{ id: 'doc-1', fileKey: 'uploads/x.jpg' }] });
        prisma.exchangeLoad.findFirst.mockResolvedValue(null);
        await service.deleteAccount('u-1');
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data).toMatchObject({ iin: null, phone: null, lastName: null });
        expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ isActive: false, googleId: null, email: null });
    });

    it('с грузом в пути аккаунт не удалить', async () => {
        const { service, prisma } = build();
        prisma.exchangeDriver.findUnique.mockResolvedValue({ id: 'd-1', documents: [] });
        prisma.exchangeLoad.findFirst.mockResolvedValue({ seq: 3 });
        await expect(service.deleteAccount('u-1')).rejects.toThrow(/довезите/);
    });
});
