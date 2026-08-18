import { BadRequestException } from '@nestjs/common';
import { PaymentDirection } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { FinanceCalculatorService } from './finance-calculator.service';
import { D } from '../../common/utils/money';

/**
 * Сторона платежа: кому платим и кто платит нам.
 *
 * Из жалобы бухгалтера. Она открыла рейс, записала оплату перевозчику — и
 * оплаты не увидела: у перевозчика по-прежнему «Не оплачено». Причина
 * оказалась в одной строчке формы: кнопка «Зарегистрировать платёж» была
 * одна и всегда открывала «Поступление» с заказчиком. Контрагента и сумму
 * бухгалтер поменяла, направление осталось прежним — и триста тысяч
 * перевозчику записались как деньги, пришедшие от него.
 *
 * Ошибка тихая: строка в списке есть, сумма верная, контрагент верный.
 * Сверх того долг заказчика закрывался суммой, которой он не платил.
 *
 * Здесь проверяется, что такую запись не принимают вовсе, а уже сделанную
 * можно развернуть, не удаляя.
 */
describe('Направление платежа и сторона контрагента', () => {
    const МЫ = 'экспедитор';
    const ЗАКАЗЧИК = 'кока-кола';
    const ПЕРЕВОЗЧИК = 'ип-лемешко';

    const рейс = {
        id: 'р-1',
        orderNumber: '2608',
        customerCompanyId: ЗАКАЗЧИК,
        forwarderId: МЫ,
        partnerId: null,
        subForwarderId: ПЕРЕВОЗЧИК,
    };

    const build = (payment?: Record<string, unknown>) => {
        const tx: any = {
            payment: {
                create: jest.fn(async ({ data }: any) => ({ id: 'п-1', ...data, order: null })),
                update: jest.fn(async ({ data }: any) => ({
                    id: 'п-1', direction: PaymentDirection.OUT, amount: D(240_000),
                    orderId: 'р-1', ...data, order: { orderNumber: '2608' },
                })),
                findMany: jest.fn().mockResolvedValue([]),
            },
            paymentOrderShare: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            order: {
                findUnique: jest.fn().mockResolvedValue({
                    ...рейс,
                    customerPrice: D(300_000),
                    customerPriceBase: D(300_000),
                    currency: 'KZT',
                    driverCost: null,
                    subForwarderPrice: D(240_000),
                    isCustomerPaid: false,
                    responsibleManager: { companyId: МЫ },
                }),
                update: jest.fn().mockResolvedValue({}),
            },
            orderChangeLog: { create: jest.fn().mockResolvedValue({}) },
        };

        const prisma: any = {
            order: {
                findUnique: jest.fn().mockResolvedValue(рейс),
                findMany: jest.fn().mockResolvedValue([рейс]),
                count: jest.fn(async ({ where }: any) => where.id.in.length),
            },
            payment: {
                findFirst: jest.fn().mockResolvedValue(payment ?? {
                    id: 'п-1',
                    companyId: МЫ,
                    direction: PaymentDirection.IN,
                    amount: D(240_000),
                    date: new Date('2026-08-17'),
                    orderId: 'р-1',
                    counterpartyId: ПЕРЕВОЗЧИК,
                    accountId: 'сч-1',
                    refundOfId: null,
                    refunds: [],
                    // Разнесения по заявкам здесь нет: тесты про доли лежат
                    // в payment-edit-shares.
                    orderShares: [],
                }),
            },
            financeAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'сч-1', currency: 'KZT' }) },
            financeCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'ст-1' }) },
            $transaction: jest.fn(async (fn: any) => fn(tx)),
        };

        const service = new PaymentsService(
            prisma,
            { checkPeriodNotClosed: jest.fn() } as any,
            { ensureCompanyFinanceSettings: jest.fn() } as any,
            { processOrderTrigger: jest.fn() } as any,
            { release: jest.fn(), reduce: jest.fn() } as any,
            { rateOn: jest.fn().mockResolvedValue(null) } as any,
            new FinanceCalculatorService(),
        );
        return { service, prisma, tx };
    };

    const оплата = (over: Record<string, unknown> = {}) => ({
        orderId: 'р-1',
        direction: PaymentDirection.OUT,
        amount: 240_000,
        date: '2026-08-17',
        counterpartyId: ПЕРЕВОЗЧИК,
        ...over,
    });

    it('оплату перевозчику нельзя записать поступлением', async () => {
        const { service, prisma } = build();

        await expect(service.createPayment(МЫ, 'бухгалтер', оплата({
            direction: PaymentDirection.IN,
        }) as any)).rejects.toThrow('исполнитель');
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('в отказе назван номер рейса и что делать', async () => {
        // Сообщение читает человек посреди работы: без номера заявки он не
        // поймёт, какую из двадцати открытых строк смотреть.
        const { service } = build();

        await expect(service.createPayment(МЫ, 'бухгалтер', оплата({
            direction: PaymentDirection.IN,
        }) as any)).rejects.toThrow(/№2608[\s\S]*Расход/);
    });

    it('деньги от заказчика нельзя записать расходом', async () => {
        const { service } = build();

        await expect(service.createPayment(МЫ, 'бухгалтер', оплата({
            direction: PaymentDirection.OUT,
            counterpartyId: ЗАКАЗЧИК,
        }) as any)).rejects.toThrow('плательщик');
    });

    it('правильная сторона проходит', async () => {
        const { service, tx } = build();

        await service.createPayment(МЫ, 'бухгалтер', оплата() as any);

        expect(tx.payment.create).toHaveBeenCalled();
    });

    it('сторона проверяется и у платежа, разнесённого по нескольким рейсам', async () => {
        // Один перевод на двадцать рейсов — обычное дело, и ошибиться
        // стороной там ровно так же легко.
        const { service } = build();

        await expect(service.createPayment(МЫ, 'бухгалтер', {
            direction: PaymentDirection.IN,
            amount: 240_000,
            date: '2026-08-17',
            counterpartyId: ПЕРЕВОЗЧИК,
            orderShares: [{ orderId: 'р-1', amount: 240_000 }],
        } as any)).rejects.toThrow('исполнитель');
    });

    it('записанный не в ту сторону платёж разворачивается правкой', async () => {
        // Иначе исправить можно только удалив строку и заведя заново — с
        // потерей даты проводки, примечания и связи с выпиской.
        const { service, tx } = build();

        await service.updatePayment(МЫ, 'п-1', 'бухгалтер', {
            direction: PaymentDirection.OUT,
        });

        expect(tx.payment.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ direction: PaymentDirection.OUT }) }),
        );
    });

    it('правкой нельзя развернуть платёж в заведомо неверную сторону', async () => {
        const { service } = build({
            id: 'п-1', companyId: МЫ, direction: PaymentDirection.OUT,
            amount: D(240_000), date: new Date('2026-08-17'), orderId: 'р-1',
            counterpartyId: ПЕРЕВОЗЧИК, refundOfId: null, refunds: [], orderShares: [],
        });

        await expect(service.updatePayment(МЫ, 'п-1', 'бухгалтер', {
            direction: PaymentDirection.IN,
        })).rejects.toThrow('исполнитель');
    });

    it('у возврата направление не переставляется', async () => {
        // Возврат идёт против исходного платежа по своей природе: развернув
        // его, получим два платежа в одну сторону.
        const { service } = build({
            id: 'в-1', companyId: МЫ, direction: PaymentDirection.OUT,
            amount: D(50_000), date: new Date('2026-08-17'), orderId: 'р-1',
            counterpartyId: ЗАКАЗЧИК, refundOfId: 'п-0', refunds: [], orderShares: [],
        });

        await expect(service.updatePayment(МЫ, 'в-1', 'бухгалтер', {
            direction: PaymentDirection.IN,
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('платёж с оформленным возвратом не разворачивается', async () => {
        const { service } = build({
            id: 'п-1', companyId: МЫ, direction: PaymentDirection.OUT,
            amount: D(240_000), date: new Date('2026-08-17'), orderId: 'р-1',
            counterpartyId: ПЕРЕВОЗЧИК, refundOfId: null, refunds: [{ id: 'в-1' }], orderShares: [],
        });

        await expect(service.updatePayment(МЫ, 'п-1', 'бухгалтер', {
            direction: PaymentDirection.IN,
        })).rejects.toThrow('возврат');
    });

    it('платёж без заявки не проверяется на сторону', async () => {
        // Аванс и прочие деньги «вообще» к рейсу не привязаны, и сторон у
        // них нет: запрещать там нечего.
        const { service, tx } = build();

        await service.createPayment(МЫ, 'бухгалтер', {
            direction: PaymentDirection.IN,
            amount: 100_000,
            date: '2026-08-17',
            counterpartyId: ПЕРЕВОЗЧИК,
        } as any);

        expect(tx.payment.create).toHaveBeenCalled();
    });
});
