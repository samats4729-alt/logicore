import { NotFoundException } from '@nestjs/common';
import { TrackingService } from './tracking.service';

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
