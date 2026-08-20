import { ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * Кто может править заявку.
 *
 * Правило было про людей: создатель заявки или назначенный менеджер. От
 * этого владелец компании, бухгалтер и любой логист, кроме одного,
 * получали «У вас нет прав на редактирование этой заявки» на собственном
 * рейсе. Уехал в отпуск тот, кто заводил, — и рейс не поправить.
 *
 * Воспроизведено на стенде: администратор компании нажал карандаш в
 * журнале и получил 403 по заявке своей же фирмы.
 *
 * Теперь стороной считается та же четвёрка, что и во всей выдаче заявок:
 * заказчик, экспедитор, партнёр, субподрядчик. Водитель не в счёт — он
 * меняет статус и прикладывает накладную, а условия сделки не его.
 */
describe('Права на правку заявки', () => {
    const РЕЙС = {
        id: 'р-1',
        orderNumber: 'ЗК-2608',
        customerId: 'кто-то-другой',
        responsibleManagerId: 'кто-то-другой',
        customerCompanyId: 'заказчик',
        forwarderId: 'наша',
        partnerId: null,
        subForwarderId: 'перевозчик',
        customerCompany: { isExternal: true },
        responsibleManager: { companyId: 'наша' },
        completedAt: null,
        createdAt: new Date('2026-08-01'),
        routePoints: [],
    };

    const build = () => {
        const prisma: any = {
            order: {
                findUnique: jest.fn().mockResolvedValue(РЕЙС),
                update: jest.fn().mockResolvedValue({ ...РЕЙС }),
                findFirst: jest.fn().mockResolvedValue(null),
            },
            orderChangeLog: { create: jest.fn().mockResolvedValue({}) },
            $transaction: jest.fn(async (fn: any) => (typeof fn === 'function' ? fn(prisma) : fn)),
        };
        const service = new OrdersService(
            prisma,
            { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any,
            {} as any,
            { checkPeriodNotClosed: jest.fn() } as any,
            { notifyOrderUpdated: jest.fn() } as any,
            {} as any,
            { rateOn: jest.fn().mockResolvedValue(null) } as any,
            {} as any,
        );
        return { service, prisma };
    };

    const правка = (user: any) =>
        build().service.update('р-1', { cargoDescription: 'Напитки' } as any, user);

    it('экспедитор правит свой рейс, даже если заводил не он', async () => {
        await expect(правка({ id: 'я', role: 'COMPANY_ADMIN', companyId: 'наша' }))
            .resolves.toBeDefined();
    });

    it('бухгалтер той же компании — тоже', async () => {
        await expect(правка({ id: 'я', role: 'ACCOUNTANT', companyId: 'наша' }))
            .resolves.toBeDefined();
    });

    it('заказчик по этому рейсу — тоже сторона', async () => {
        await expect(правка({ id: 'я', role: 'COMPANY_ADMIN', companyId: 'заказчик' }))
            .resolves.toBeDefined();
    });

    it('субподрядчик — тоже', async () => {
        await expect(правка({ id: 'я', role: 'COMPANY_ADMIN', companyId: 'перевозчик' }))
            .resolves.toBeDefined();
    });

    it('чужая компания не правит', async () => {
        await expect(правка({ id: 'я', role: 'COMPANY_ADMIN', companyId: 'посторонняя' }))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('водителю условия сделки править нельзя', async () => {
        // Даже своей компании: он меняет статус и прикладывает накладную.
        await expect(правка({ id: 'я', role: 'DRIVER', companyId: 'наша' }))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('создатель правит и без компании — как было', async () => {
        await expect(правка({ id: 'кто-то-другой', role: 'LOGISTICIAN', companyId: undefined }))
            .resolves.toBeDefined();
    });
});
