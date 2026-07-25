import { NotFoundException } from '@nestjs/common';
import { MIN_GPS_RETENTION_DAYS, TrackingService } from './tracking.service';

describe('TrackingService company scoping', () => {
    describe('getOrderTrack', () => {
        it('refuses a track for an order the company cannot see', async () => {
            const prisma = {
                order: { findFirst: jest.fn().mockResolvedValue(null) },
                gpsPoint: { findMany: jest.fn() },
            };
            const service = new TrackingService(prisma as any);

            await expect(service.getOrderTrack('чужая-заявка', 'company-1')).rejects.toBeInstanceOf(
                NotFoundException,
            );
            // Главное: до выборки точек дело не доходит вовсе.
            expect(prisma.gpsPoint.findMany).not.toHaveBeenCalled();
        });

        it('checks order visibility against every role the company can hold', async () => {
            const prisma = {
                order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1' }) },
                gpsPoint: { findMany: jest.fn().mockResolvedValue([]) },
            };
            const service = new TrackingService(prisma as any);

            await service.getOrderTrack('order-1', 'company-1');

            expect(prisma.order.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        id: 'order-1',
                        OR: [
                            { customerCompanyId: 'company-1' },
                            { forwarderId: 'company-1' },
                            { partnerId: 'company-1' },
                            { subForwarderId: 'company-1' },
                            { responsibleManager: { companyId: 'company-1' } },
                        ],
                    }),
                }),
            );
        });

        it('caps the number of returned points', async () => {
            const prisma = {
                order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1' }) },
                gpsPoint: { findMany: jest.fn().mockResolvedValue([]) },
            };
            const service = new TrackingService(prisma as any);

            await service.getOrderTrack('order-1', 'company-1');

            const [args] = prisma.gpsPoint.findMany.mock.calls[0];
            expect(args.take).toBeGreaterThan(0);
        });

        // Платформенный админ ходит без companyId — ограничение к нему не применяется.
        it('does not scope the lookup for a platform admin', async () => {
            const prisma = {
                order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1' }) },
                gpsPoint: { findMany: jest.fn().mockResolvedValue([]) },
            };
            const service = new TrackingService(prisma as any);

            await service.getOrderTrack('order-1', undefined);

            expect(prisma.order.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: 'order-1' } }),
            );
        });
    });

    describe('getDriverLastPosition', () => {
        it('only returns a position tied to the caller company', async () => {
            const prisma = { gpsPoint: { findFirst: jest.fn().mockResolvedValue(null) } };
            const service = new TrackingService(prisma as any);

            await service.getDriverLastPosition('driver-1', 'company-1');

            const [args] = prisma.gpsPoint.findFirst.mock.calls[0];
            expect(args.where).toEqual({
                driverId: 'driver-1',
                OR: [
                    { driver: { companyId: 'company-1' } },
                    {
                        order: {
                            OR: [
                                { customerCompanyId: 'company-1' },
                                { forwarderId: 'company-1' },
                                { partnerId: 'company-1' },
                                { subForwarderId: 'company-1' },
                                { responsibleManager: { companyId: 'company-1' } },
                            ],
                        },
                    },
                ],
            });
        });

        it('does not scope the lookup for a platform admin', async () => {
            const prisma = { gpsPoint: { findFirst: jest.fn().mockResolvedValue(null) } };
            const service = new TrackingService(prisma as any);

            await service.getDriverLastPosition('driver-1', undefined);

            const [args] = prisma.gpsPoint.findFirst.mock.calls[0];
            expect(args.where).toEqual({ driverId: 'driver-1' });
        });
    });
});

describe('TrackingService.purgeGpsPointsOlderThan', () => {
    // Один неполный пакет означает, что старых точек больше не осталось.
    function buildPrisma(batchSizes: number[]) {
        let call = 0;
        return {
            gpsPoint: {
                findMany: jest.fn().mockImplementation(async () => {
                    const size = batchSizes[call] ?? 0;
                    call += 1;
                    return Array.from({ length: size }, (_, i) => ({ id: `point-${call}-${i}` }));
                }),
                deleteMany: jest.fn().mockImplementation(async ({ where }: any) => ({
                    count: where.id.in.length,
                })),
            },
        };
    }

    it('stops as soon as a partial batch comes back', async () => {
        const prisma = buildPrisma([5000, 120]);
        const service = new TrackingService(prisma as any);

        const result = await service.purgeGpsPointsOlderThan(90);

        expect(result).toEqual({ deleted: 5120, hasMore: false });
        expect(prisma.gpsPoint.findMany).toHaveBeenCalledTimes(2);
    });

    it('does nothing when there is nothing old enough', async () => {
        const prisma = buildPrisma([0]);
        const service = new TrackingService(prisma as any);

        const result = await service.purgeGpsPointsOlderThan(90);

        expect(result).toEqual({ deleted: 0, hasMore: false });
        expect(prisma.gpsPoint.deleteMany).not.toHaveBeenCalled();
    });

    it('reports hasMore instead of running unbounded', async () => {
        const prisma = buildPrisma(Array(50).fill(5000));
        const service = new TrackingService(prisma as any);

        const result = await service.purgeGpsPointsOlderThan(90);

        expect(result.hasMore).toBe(true);
        // Один вызов не должен пытаться удалить всё разом.
        expect(prisma.gpsPoint.findMany.mock.calls.length).toBeLessThan(50);
    });

    it('never deletes newer than the retention floor, even if asked to', async () => {
        const prisma = buildPrisma([0]);
        const service = new TrackingService(prisma as any);

        await service.purgeGpsPointsOlderThan(1);

        const [args] = prisma.gpsPoint.findMany.mock.calls[0];
        const cutoff: Date = args.where.recordedAt.lt;
        const requestedCutoff = Date.now() - 1 * 24 * 60 * 60 * 1000;

        expect(cutoff.getTime()).toBeLessThan(requestedCutoff);
        // Отсечка не ближе, чем нижняя граница хранения (с запасом на время теста).
        expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(
            MIN_GPS_RETENTION_DAYS * 24 * 60 * 60 * 1000 - 5000,
        );
    });
});
