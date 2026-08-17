import { BadRequestException } from '@nestjs/common';
import { PaymentDirection } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { FinanceCalculatorService } from './finance-calculator.service';
import { D } from '../../common/utils/money';

/**
 * Один платёж — несколько заявок.
 *
 * Так платят заказчики: приходит перевод на одиннадцать миллионов, и в нём
 * сидят двадцать шесть рейсов. Платёж умел ссылаться ровно на одну заявку,
 * поэтому бухгалтер либо заводила двадцать шесть платежей — и выписка
 * банка переставала сходиться со списком построчно, — либо записывала один
 * и потом не могла ответить, какие именно рейсы им закрыты.
 *
 * Здесь проверяется, что доли действительно закрывают долг по своим
 * заявкам и что ошибиться на этом нельзя: сумма долей не может превышать
 * сам перевод, чужие заявки не проходят, а «и целиком, и долями» —
 * запрещённое сочетание, иначе одна заявка окажется оплачена дважды.
 */
describe('Платёж, разнесённый по заявкам', () => {
    const COMPANY = 'мы';

    /**
     * `knownOrders` — сколько из перечисленных заявок база признала своими.
     * По умолчанию все: чужую подсовывает отдельный тест.
     */
    const build = (options: { knownOrders?: number } = {}) => {
        const created: any[] = [];
        const shares: any[] = [];
        const syncedOrders: string[] = [];

        const tx: any = {
            payment: {
                create: jest.fn(async ({ data }: any) => {
                    created.push(data);
                    return { id: 'п-1', ...data, order: null };
                }),
                findMany: jest.fn().mockResolvedValue([]),
            },
            paymentOrderShare: {
                createMany: jest.fn(async ({ data }: any) => {
                    shares.push(...data);
                    return { count: data.length };
                }),
                findMany: jest.fn(async ({ where }: any) => {
                    syncedOrders.push(where.orderId);
                    return [];
                }),
            },
            order: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'р-1',
                    customerPrice: D(100_000),
                    customerPriceBase: D(100_000),
                    currency: 'KZT',
                    driverCost: null,
                    subForwarderId: null,
                    subForwarderPrice: null,
                    isCustomerPaid: false,
                    forwarderId: COMPANY,
                    partnerId: null,
                    customerCompanyId: 'заказчик',
                    responsibleManager: { companyId: COMPANY },
                }),
                update: jest.fn().mockResolvedValue({}),
            },
            orderChangeLog: { create: jest.fn().mockResolvedValue({}) },
        };

        const prisma: any = {
            order: {
                findUnique: jest.fn().mockResolvedValue(null),
                count: jest.fn(async ({ where }: any) => options.knownOrders ?? where.id.in.length),
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
        return { service, prisma, tx, created, shares, syncedOrders };
    };

    const payment = (overrides: Record<string, unknown> = {}) => ({
        direction: PaymentDirection.IN,
        amount: 300_000,
        date: '2026-08-17',
        counterpartyId: 'заказчик',
        ...overrides,
    });

    it('доли записываются, а сам платёж не привязан к одной заявке', async () => {
        // Иначе перевод «за всё сразу» висел бы на первом попавшемся рейсе.
        const { service, created, shares } = build();

        await service.createPayment(COMPANY, 'пользователь', payment({
            orderShares: [
                { orderId: 'р-1', amount: 100_000 },
                { orderId: 'р-2', amount: 200_000 },
            ],
        }) as any);

        expect(created[0].orderId).toBeNull();
        expect(shares).toHaveLength(2);
        expect(shares.map((share) => share.orderId).sort()).toEqual(['р-1', 'р-2']);
        expect(Number(shares[0].amount)).toBe(100_000);
    });

    it('каждая разнесённая заявка пересчитывается', async () => {
        // Флаг «оплачено» сохранён у заявки, и сам он не обновится.
        const { service, syncedOrders } = build();

        await service.createPayment(COMPANY, 'пользователь', payment({
            orderShares: [
                { orderId: 'р-1', amount: 100_000 },
                { orderId: 'р-2', amount: 200_000 },
            ],
        }) as any);

        expect(syncedOrders).toEqual(expect.arrayContaining(['р-1', 'р-2']));
    });

    it('разнесено больше платежа — отказ с цифрой', async () => {
        const { service } = build();

        await expect(service.createPayment(COMPANY, 'пользователь', payment({
            amount: 250_000,
            orderShares: [
                { orderId: 'р-1', amount: 100_000 },
                { orderId: 'р-2', amount: 200_000 },
            ],
        }) as any)).rejects.toThrow('больше самого платежа');
    });

    it('разнесено меньше платежа — остаток остаётся авансом', async () => {
        // Заказчик платит с запасом, и это нормально: лишнее не привязано
        // ни к какому рейсу и ждёт следующих.
        const { service, shares } = build();

        await service.createPayment(COMPANY, 'пользователь', payment({
            amount: 300_000,
            orderShares: [{ orderId: 'р-1', amount: 100_000 }],
        }) as any);

        expect(shares).toHaveLength(1);
    });

    it('одна заявка дважды — отказ', async () => {
        const { service } = build();

        await expect(service.createPayment(COMPANY, 'пользователь', payment({
            orderShares: [
                { orderId: 'р-1', amount: 100_000 },
                { orderId: 'р-1', amount: 50_000 },
            ],
        }) as any)).rejects.toThrow('дважды');
    });

    it('и целиком, и долями — так нельзя', async () => {
        // Иначе указанная заявка оплачена дважды: и всем платежом, и долей.
        const { service } = build();

        await expect(service.createPayment(COMPANY, 'пользователь', payment({
            orderId: 'р-1',
            orderShares: [{ orderId: 'р-2', amount: 100_000 }],
        }) as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('чужая заявка в разнесение не проходит', async () => {
        // Проверка идёт до записи денег: платёж не должен появиться вовсе.
        const { service, prisma } = build({ knownOrders: 1 });

        await expect(service.createPayment(COMPANY, 'пользователь', payment({
            orderShares: [
                { orderId: 'р-1', amount: 100_000 },
                { orderId: 'чужая', amount: 200_000 },
            ],
        }) as any)).rejects.toThrow('чужие');
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('нулевые доли отбрасываются, а не пишутся пустыми строками', async () => {
        const { service, shares, created } = build();

        await service.createPayment(COMPANY, 'пользователь', payment({
            orderShares: [
                { orderId: 'р-1', amount: 300_000 },
                { orderId: 'р-2', amount: 0 },
            ],
        }) as any);

        expect(shares).toHaveLength(1);
        expect(created[0].orderId).toBeNull();
    });
});
