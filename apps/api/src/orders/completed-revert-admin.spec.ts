import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

/**
 * Завершённую заявку двух зарегистрированных компаний сами стороны не
 * отменят — нужно согласие другой. Администратор платформы отменяет без
 * согласования (владелец, 28.10.2026: «через админку»).
 */
describe('Отмена завершённой заявки', () => {
    const заявка = {
        id: 'o1', orderNumber: 'LC-1', status: OrderStatus.COMPLETED, driverId: null,
        customerCompanyId: null, forwarderId: 'экспедитор', partnerId: 'парк', subForwarderId: null,
        responsibleManager: null, responsibleManagerId: null, customerId: null, completedAt: new Date(),
    };
    // Любая смежная служба — заглушка: проверяется только правило.
    const stub = () => new Proxy({}, { get: () => jest.fn() }) as any;

    const сервис = () => {
        const prisma: any = {
            order: {
                findUnique: jest.fn().mockResolvedValue(заявка),
                findFirst: jest.fn().mockResolvedValue(заявка),
                update: jest.fn(({ data }: any) => Promise.resolve({ ...заявка, ...data })),
            },
            user: { findUnique: jest.fn().mockResolvedValue({ companyId: 'экспедитор' }) },
            orderStatusHistory: { create: jest.fn() },
            orderChangeLog: { create: jest.fn() },
            // Обе стороны зарегистрированы в LogiCore.
            company: { findMany: jest.fn().mockResolvedValue([{ id: 'экспедитор' }, { id: 'парк' }]) },
        };
        return { service: new OrdersService(prisma, stub(), stub(), stub(), stub(), stub(), stub(), stub()), prisma };
    };

    it('экспедитор сам — нет: нужно согласие парка', async () => {
        const { service, prisma } = сервис();
        await expect(service.updateStatus('o1', OrderStatus.CANCELLED, 'ошибка', 'u1', 'экспедитор', 'COMPANY_ADMIN'))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('администратор платформы — отменяет без согласования', async () => {
        const { service, prisma } = сервис();
        await service.updateStatus('o1', OrderStatus.CANCELLED, 'по просьбе экспедитора', 'admin', undefined, 'ADMIN');
        expect(prisma.order.update.mock.calls[0][0].data).toMatchObject({ status: OrderStatus.CANCELLED });
    });
});
