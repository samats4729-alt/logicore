import { OrderStatus } from '@prisma/client';
import { DriverService } from './driver.service';

describe('DriverService.advanceStatus', () => {
    const order = {
        id: 'order-1',
        orderNumber: 'LC-1',
        status: OrderStatus.AT_DELIVERY,
        driverId: 'driver-1',
        forwarderId: 'forwarder-1',
        partnerId: null,
        subForwarderId: null,
        assignedDriverName: 'Driver',
        assignedDriverPlate: 'A001AA',
        cargoDescription: null,
        cargoWeight: null,
        cargoVolume: null,
        palletCount: null,
        requirements: null,
        routePoints: [],
        forwarder: { name: 'Forwarder', phone: null },
        partner: null,
        responsibleManager: { companyId: 'forwarder-1' },
    };

    it('routes completion through OrdersService with the executor company context', async () => {
        const prisma = {
            order: {
                findFirst: jest.fn().mockResolvedValue(order),
                update: jest.fn(),
            },
            orderChangeLog: { create: jest.fn().mockResolvedValue({}) },
            document: { count: jest.fn().mockResolvedValue(0) },
        };
        const ordersService = { updateStatus: jest.fn().mockResolvedValue({}) };
        const service = new DriverService(
            prisma as any,
            {} as any,
            ordersService as any,
        );

        await service.advanceStatus('secret-token', OrderStatus.COMPLETED);

        expect(ordersService.updateStatus).toHaveBeenCalledWith(
            order.id,
            OrderStatus.COMPLETED,
            expect.stringContaining('Driver link'),
            order.driverId,
            order.forwarderId,
            'DRIVER',
        );
        expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('uses the sub-forwarder as initiator for an external named driver', async () => {
        const externalOrder = {
            ...order,
            driverId: null,
            subForwarderId: 'sub-forwarder-1',
        };
        const prisma = {
            order: { findFirst: jest.fn().mockResolvedValue(externalOrder) },
            orderChangeLog: { create: jest.fn() },
            document: { count: jest.fn().mockResolvedValue(0) },
        };
        const ordersService = { updateStatus: jest.fn().mockResolvedValue({}) };
        const service = new DriverService(
            prisma as any,
            {} as any,
            ordersService as any,
        );

        await service.advanceStatus('secret-token', OrderStatus.COMPLETED);

        expect(ordersService.updateStatus).toHaveBeenCalledWith(
            externalOrder.id,
            OrderStatus.COMPLETED,
            expect.any(String),
            undefined,
            externalOrder.subForwarderId,
            undefined,
        );
    });
});
