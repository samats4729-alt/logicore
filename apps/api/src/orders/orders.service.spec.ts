import { ForbiddenException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService.takeOrder', () => {
    const makeService = (tx: any) => {
        const prisma = {
            $transaction: jest.fn((callback: (client: any) => unknown) => callback(tx)),
        };
        return new OrdersService(
            prisma as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        );
    };

    it('claims a pending exchange order with one conditional update', async () => {
        const claimedOrder = {
            id: 'order-1',
            status: OrderStatus.PENDING,
            forwarderId: 'company-1',
        };
        const tx = {
            order: {
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
                findUniqueOrThrow: jest.fn().mockResolvedValue(claimedOrder),
            },
            orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        };
        const service = makeService(tx);

        await expect(service.takeOrder('order-1', 'company-1')).resolves.toEqual(claimedOrder);
        expect(tx.order.updateMany).toHaveBeenCalledWith({
            where: {
                id: 'order-1',
                forwarderId: null,
                status: OrderStatus.PENDING,
            },
            data: { forwarderId: 'company-1', isConfirmed: true },
        });
        expect(tx.orderStatusHistory.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a concurrent loser without overwriting the winner', async () => {
        const tx = {
            order: {
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                findUnique: jest.fn().mockResolvedValue({
                    id: 'order-1',
                    status: OrderStatus.PENDING,
                    forwarderId: 'winning-company',
                }),
            },
            orderStatusHistory: { create: jest.fn() },
        };
        const service = makeService(tx);

        await expect(service.takeOrder('order-1', 'losing-company')).rejects.toBeInstanceOf(ForbiddenException);
        expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
    });
});

describe('OrdersService.reportProblem — только участник заявки', () => {
    const makeService = (order: any) => {
        const prisma: any = { order: { findUnique: jest.fn().mockResolvedValue(order), findFirst: jest.fn().mockResolvedValue(order) } };
        const service = new OrdersService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
        jest.spyOn(service as any, 'findById').mockResolvedValue(order);
        return service;
    };
    const order = { id: 'order-1', status: OrderStatus.IN_TRANSIT, driverId: 'driver-1', customerCompanyId: 'c-1', forwarderId: 'f-1', partnerId: null, responsibleManager: null };

    it('чужой водитель не может пометить заявку проблемой', async () => {
        await expect(makeService(order).reportProblem('order-1', 'сломался', 'driver-2', undefined, 'DRIVER'))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('логист чужой компании — тоже нет', async () => {
        await expect(makeService(order).reportProblem('order-1', 'сломался', 'user-x', 'other-company', 'LOGISTICIAN'))
            .rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe('OrdersService.findDriverOrders', () => {
    it('водитель видит название заказчика, а цену заказчика — нет', async () => {
        const prisma = {
            order: {
                findMany: jest.fn().mockResolvedValue([{
                    id: 'order-1',
                    customerPrice: 500000,
                    driverCost: 380000,
                    customerCompany: { id: 'company-1', name: 'ТОО «Ромашка»' },
                    routePoints: [],
                }]),
            },
        };
        const service = new OrdersService(
            prisma as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        );

        const [order] = await service.findDriverOrders('driver-1');

        expect(prisma.order.findMany.mock.calls[0][0].include.customerCompany).toEqual({ select: { id: true, name: true } });
        expect((order as any).customerCompany).toEqual({ id: 'company-1', name: 'ТОО «Ромашка»' });
        expect((order as any).customerPrice).toBeNull();
    });
});

describe('OrdersService.findDriverOrders — рейс с проблемой', () => {
    it('после «Проблемы» рейс остаётся у водителя текущим', async () => {
        const prisma = { order: { findMany: jest.fn().mockResolvedValue([]) } };
        const service = new OrdersService(
            prisma as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        );

        await service.findDriverOrders('driver-1');

        const statuses = prisma.order.findMany.mock.calls[0][0].where.status.in;
        expect(statuses).toContain(OrderStatus.PROBLEM);
        expect(statuses).not.toContain(OrderStatus.COMPLETED);
    });
});
