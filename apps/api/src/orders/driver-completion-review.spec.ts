import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

/**
 * Завершение рейса водителем ждёт проверки менеджером.
 *
 * Водитель закрывает рейс по своей ссылке и прикладывает фото накладной,
 * стоя на выгрузке. Нечитаемое фото можно переснять ровно пока он там:
 * уехал — возвращать некого. А в журнале такой рейс выглядел как любой
 * другой завершённый, и менеджер узнавал о нём, только открыв заявку.
 */
describe('Завершил водитель — ждёт проверки', () => {
    const РЕЙС = 'рейс-1';
    const НАША = 'наша-компания';

    const рейс = (сверху: any = {}) => ({
        id: РЕЙС,
        orderNumber: 'ЗК-2608',
        status: OrderStatus.AT_DELIVERY,
        driverId: 'водитель-1',
        customerCompanyId: 'заказчик',
        forwarderId: НАША,
        partnerId: null,
        subForwarderId: null,
        responsibleManager: null,
        responsibleManagerId: null,
        customerId: null,
        completedAt: null,
        driverCompletedAt: null,
        completionReviewedAt: null,
        ...сверху,
    });

    const сервис = (заявка: any) => {
        const prisma: any = {
            order: {
                findUnique: jest.fn().mockResolvedValue(заявка),
                findFirst: jest.fn().mockResolvedValue(заявка),
                update: jest.fn(({ data }: any) => Promise.resolve({ ...заявка, ...data })),
            },
            user: { findUnique: jest.fn().mockResolvedValue({ companyId: НАША }) },
            orderStatusHistory: { create: jest.fn() },
            orderChangeLog: { create: jest.fn() },
            // Вторая зарегистрированная сторона потребовала бы подтверждения
            // завершения — здесь проверяется путь без неё.
            company: { findMany: jest.fn().mockResolvedValue([]) },
        };
        // Завершение рейса дёргает смежные службы: флаги оплат, зарплату,
        // уведомления. Здесь проверяется пометка, поэтому они заглушены.
        const service = new OrdersService(
            prisma,
            {} as any,
            { syncOrderPaymentFlags: jest.fn() } as any,
            {} as any,
            { notifyCompany: jest.fn() } as any,
            { onOrderCompleted: jest.fn(), accrueForOrder: jest.fn() } as any,
            {} as any,
            {} as any,
        );
        // Карточка заявки собирается тяжёлым запросом со связями — здесь
        // проверяется правило, а не выборка.
        jest.spyOn(service, 'findById').mockResolvedValue(заявка);
        return { service, prisma };
    };

    describe('пометка ставится', () => {
        it('водитель закрыл рейс — рейс ждёт проверки', async () => {
            const { service, prisma } = сервис(рейс());

            await service.updateStatus(РЕЙС, OrderStatus.COMPLETED, 'Driver link', 'водитель-1', НАША, 'DRIVER');

            const data = prisma.order.update.mock.calls[0][0].data;
            expect(data.driverCompletedAt).toBeInstanceOf(Date);
            expect(data.completionReviewedAt).toBeNull();
        });

        it('менеджер закрыл рейс сам — метить нечего, он всё видел', async () => {
            const { service, prisma } = сервис(рейс());

            await service.updateStatus(РЕЙС, OrderStatus.COMPLETED, undefined, 'менеджер-1', НАША, 'LOGISTICIAN');

            const data = prisma.order.update.mock.calls[0][0].data;
            expect(data.driverCompletedAt).toBeUndefined();
        });

        it('рейс переоткрыли — прежняя проверка недействительна', async () => {
            const завершённый = рейс({
                status: OrderStatus.COMPLETED,
                driverCompletedAt: new Date('2026-08-21T10:00:00Z'),
                completionReviewedAt: new Date('2026-08-21T10:05:00Z'),
            });
            const { service, prisma } = сервис(завершённый);

            await service.updateStatus(РЕЙС, OrderStatus.IN_TRANSIT, undefined, 'менеджер-1', НАША, 'ADMIN');

            const data = prisma.order.update.mock.calls[0][0].data;
            expect(data.driverCompletedAt).toBeNull();
            expect(data.completionReviewedAt).toBeNull();
        });
    });

    describe('пометка снимается', () => {
        const завершён = () => рейс({
            status: OrderStatus.COMPLETED,
            completedAt: new Date(),
            driverCompletedAt: new Date('2026-08-21T10:00:00Z'),
        });

        it('менеджер своей компании снимает пометку и подписывается', async () => {
            const { service, prisma } = сервис(завершён());

            await service.markCompletionReviewed(РЕЙС, { id: 'менеджер-1', role: 'LOGISTICIAN', companyId: НАША });

            const data = prisma.order.update.mock.calls[0][0].data;
            expect(data.completionReviewedAt).toBeInstanceOf(Date);
            expect(data.completionReviewedById).toBe('менеджер-1');
        });

        it('чужой компании — отказ', async () => {
            const { service } = сервис(завершён());

            await expect(service.markCompletionReviewed(РЕЙС, {
                id: 'чужой', role: 'LOGISTICIAN', companyId: 'другая-компания',
            })).rejects.toThrow(ForbiddenException);
        });

        it('водитель сам себя не проверяет', async () => {
            const { service } = сервис(завершён());

            await expect(service.markCompletionReviewed(РЕЙС, {
                id: 'водитель-1', role: 'DRIVER', companyId: НАША,
            })).rejects.toThrow(ForbiddenException);
        });

        it('рейс закрыл не водитель — проверять нечего', async () => {
            const { service } = сервис(рейс({ status: OrderStatus.COMPLETED, completedAt: new Date() }));

            await expect(service.markCompletionReviewed(РЕЙС, {
                id: 'менеджер-1', role: 'LOGISTICIAN', companyId: НАША,
            })).rejects.toThrow(BadRequestException);
        });
    });
});
