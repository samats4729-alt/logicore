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

describe('DriverService.reportProblem — проблема в пути с фото (задачи шефа, M2)', () => {
    const order = {
        id: 'order-1', orderNumber: 'LC-1', status: OrderStatus.IN_TRANSIT, driverId: 'driver-1',
        responsibleManagerId: 'manager-1', customerId: null, forwarderId: 'forwarder-1', partnerId: null, subForwarderId: null,
        routePoints: [], forwarder: { name: 'Forwarder', phone: null }, partner: null, responsibleManager: { companyId: 'forwarder-1' },
    };

    function build() {
        const prisma: any = {
            order: { findFirst: jest.fn().mockResolvedValue(order), update: jest.fn() },
            orderChangeLog: { create: jest.fn() },
            orderStatusHistory: { create: jest.fn() },
            document: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
        };
        const s3: any = { isS3Enabled: () => true, uploadFile: jest.fn() };
        const service = new DriverService(prisma, s3, {} as any);
        jest.spyOn(service, 'getByToken').mockResolvedValue({} as any);
        return { service, prisma, s3 };
    }

    it('с фото и комментарием: снимок — в документы рейса, запись — в историю, статус «Проблема»', async () => {
        const { service, prisma, s3 } = build();
        const file: any = { originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) };
        await service.reportProblem('token', ' пробили колесо ', file);
        expect(s3.uploadFile).toHaveBeenCalled();
        expect(prisma.document.create.mock.calls[0][0].data).toMatchObject({ type: 'OTHER', orderId: 'order-1', uploadedById: 'driver-1' });
        expect(prisma.order.update.mock.calls[0][0].data).toEqual({ status: OrderStatus.PROBLEM });
        expect(prisma.orderStatusHistory.create.mock.calls[0][0].data.comment)
            .toBe('Водитель: проблема в пути — пробили колесо (фото — во вкладке «Документы»)');
    });

    it('без фото — как раньше, только комментарий', async () => {
        const { service, prisma } = build();
        await service.reportProblem('token', 'закрыли трассу');
        expect(prisma.document.create).not.toHaveBeenCalled();
        expect(prisma.orderStatusHistory.create.mock.calls[0][0].data.comment).toBe('Водитель: проблема в пути — закрыли трассу');
    });

    it('рейс уже закрыт — отказ', async () => {
        const { service, prisma } = build();
        prisma.order.findFirst.mockResolvedValue({ ...order, status: OrderStatus.COMPLETED });
        await expect(service.reportProblem('token', 'x')).rejects.toThrow(/закрыта/);
    });
});
