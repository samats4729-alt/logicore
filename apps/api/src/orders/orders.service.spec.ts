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
