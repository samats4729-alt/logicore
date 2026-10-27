import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExchangeDriverVehiclesService } from './driver-vehicles.service';

/** Транспорт водителя биржи: тягачи и прицепы, основной (R4). */
describe('транспорт водителя', () => {
    function setup(opts: { kind?: 'PARK' | 'IP'; status?: string; trips?: number; vehicle?: any; trailers?: number; blocked?: boolean } = {}) {
        const driver = {
            id: 'd1', userId: 'u1', kind: opts.kind ?? 'PARK', status: opts.status ?? 'APPROVED',
            vehiclePlate: '123ABC02', vehicleModel: 'MAN TGX', vehicleBodyType: 'тент', vehicleCapacityKg: 20000, vehicleRegNumber: 'AB123', vehicleIsOwn: true,
        };
        const prisma: any = {
            exchangeDriver: { findUnique: jest.fn().mockResolvedValue(driver), update: jest.fn((a: any) => a) },
            order: { count: jest.fn().mockResolvedValue(opts.trips ?? 0) },
            exchangeBlocklist: { findFirst: jest.fn().mockResolvedValue(opts.blocked ? { id: 'b' } : null) },
            exchangeDriverVehicle: {
                updateMany: jest.fn((a: any) => a),
                upsert: jest.fn((a: any) => a),
                update: jest.fn((a: any) => a),
                create: jest.fn().mockResolvedValue({}),
                delete: jest.fn().mockResolvedValue({}),
                count: jest.fn().mockResolvedValue(opts.trailers ?? 0),
                findFirst: jest.fn().mockResolvedValue(opts.vehicle ?? null),
                findMany: jest.fn().mockResolvedValue([]),
            },
            $transaction: jest.fn(async (ops: any[]) => ops),
        };
        return { service: new ExchangeDriverVehiclesService(prisma), prisma };
    }

    it('основной тягач — машина из анкеты: запись подтягивается к ней', async () => {
        const { service, prisma } = setup();
        await service.list('u1');
        const upsert = prisma.exchangeDriverVehicle.upsert.mock.calls[0][0];
        expect(upsert.where).toEqual({ driverId_kind_plate: { driverId: 'd1', kind: 'TRACTOR', plate: '123ABC02' } });
        expect(upsert.update).toEqual(expect.objectContaining({ model: 'MAN TGX', isMain: true }));
    });

    it('первый прицеп — сразу основной; номер приводится к виду; повтор — «уже есть»', async () => {
        const { service, prisma } = setup();
        await service.add('u1', { kind: 'TRAILER', plate: ' 45 abc-02 ', bodyType: 'реф' });
        expect(prisma.exchangeDriverVehicle.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ kind: 'TRAILER', plate: '45ABC02', isMain: true }));

        const dup = setup({ trailers: 1 });
        dup.prisma.exchangeDriverVehicle.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
        await expect(dup.service.add('u1', { kind: 'TRAILER', plate: '45ABC02' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('машину из чёрного списка биржи не добавить', async () => {
        const { service } = setup({ blocked: true });
        await expect(service.add('u1', { kind: 'TRACTOR', plate: '777KZ01' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('прицеп становится основным сразу, анкету не трогает', async () => {
        const { service, prisma } = setup({ vehicle: { id: 'v2', kind: 'TRAILER', plate: '45ABC02', isMain: false } });
        const r = await service.makeMain('u1', 'v2');
        expect(r.needsReview).toBe(false);
        expect(prisma.exchangeDriver.update).not.toHaveBeenCalled();
    });

    it('водитель парка меняет тягач — машина в анкете новая, договор заново, анкета на проверку', async () => {
        const { service, prisma } = setup({ vehicle: { id: 'v3', kind: 'TRACTOR', plate: '999XYZ02', model: 'Volvo FH', bodyType: 'тент', capacityKg: 22000, regNumber: 'CD456', isOwn: false, isMain: false } });
        const r = await service.makeMain('u1', 'v3');
        expect(r.needsReview).toBe(true);
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data).toEqual(expect.objectContaining({
            vehiclePlate: '999XYZ02', vehicleModel: 'Volvo FH', vehicleIsOwn: false,
            contractSignedAt: null, status: 'DRAFT',
        }));
    });

    it('водитель с ИП меняет тягач сразу — без проверки', async () => {
        const { service, prisma } = setup({ kind: 'IP', vehicle: { id: 'v3', kind: 'TRACTOR', plate: '999XYZ02', isMain: false } });
        const r = await service.makeMain('u1', 'v3');
        expect(r.needsReview).toBe(false);
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ vehiclePlate: '999XYZ02' }));
        expect(prisma.exchangeDriver.update.mock.calls[0][0].data.status).toBeUndefined();
    });

    it('во время рейса тягач не меняют; основной тягач не убрать', async () => {
        const trip = setup({ trips: 1, vehicle: { id: 'v3', kind: 'TRACTOR', plate: '999XYZ02', isMain: false } });
        await expect(trip.service.makeMain('u1', 'v3')).rejects.toThrow(/довезите текущий груз/);
        const main = setup({ vehicle: { id: 'v1', kind: 'TRACTOR', plate: '123ABC02', isMain: true } });
        await expect(main.service.remove('u1', 'v1')).rejects.toBeInstanceOf(BadRequestException);
    });
});
