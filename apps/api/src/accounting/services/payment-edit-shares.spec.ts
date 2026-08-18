import { PaymentDirection } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { FinanceCalculatorService } from './finance-calculator.service';
import { D } from '../../common/utils/money';

/**
 * Правка платежа, разнесённого по нескольким заявкам.
 *
 * Доли живут отдельными записями, и правка самого платежа их не трогала.
 * От этого перевод на шестьсот тысяч, разнесённый на две заявки по триста,
 * можно было исправить на один тенге — доли оставались прежними. В отчёте
 * по каждой заявке продолжала висеть оплата, которой нет: один тенге
 * закрывал шестьсот тысяч долга.
 *
 * Тем же путём ставился `orderId` на платёж с долями — сочетание, которое
 * при создании запрещено, потому что заявка оказывается оплачена дважды: и
 * целиком платежом, и своей долей.
 *
 * Проверено на стенде до починки: платёж 600 000 → 1 ₸, доли по 300 000 на
 * месте, в открытых заявках «оплачено 300 000» по каждой.
 */
describe('Правка платежа с разнесением по заявкам', () => {
    const МЫ = 'экспедитор';
    const ЗАКАЗЧИК = 'заказчик';

    const build = (over: Record<string, unknown> = {}) => {
        const tx: any = {
            payment: {
                update: jest.fn(async ({ data }: any) => ({
                    id: 'п-1', direction: PaymentDirection.IN, amount: D(600_000),
                    orderId: null, ...data, order: null,
                })),
                findMany: jest.fn().mockResolvedValue([]),
            },
            paymentOrderShare: { findMany: jest.fn().mockResolvedValue([]) },
            order: {
                findUnique: jest.fn().mockResolvedValue({
                    id: 'р-1', customerPrice: D(480_000), customerPriceBase: D(480_000),
                    currency: 'KZT', driverCost: null, subForwarderId: null,
                    subForwarderPrice: null, isCustomerPaid: false,
                    forwarderId: МЫ, partnerId: null, customerCompanyId: ЗАКАЗЧИК,
                    responsibleManager: { companyId: МЫ },
                }),
                update: jest.fn().mockResolvedValue({}),
            },
            orderChangeLog: { create: jest.fn().mockResolvedValue({}) },
        };

        const prisma: any = {
            payment: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'п-1',
                    companyId: МЫ,
                    direction: PaymentDirection.IN,
                    amount: D(600_000),
                    amountBase: D(600_000),
                    currency: 'KZT',
                    date: new Date('2026-08-18'),
                    orderId: null,
                    counterpartyId: ЗАКАЗЧИК,
                    accountId: 'сч-1',
                    refundOfId: null,
                    refunds: [],
                    orderShares: [
                        { orderId: 'р-1', amount: D(300_000) },
                        { orderId: 'р-2', amount: D(300_000) },
                    ],
                    ...over,
                }),
            },
            order: {
                findMany: jest.fn().mockResolvedValue([{
                    orderNumber: '2601',
                    customerCompanyId: ЗАКАЗЧИК,
                    forwarderId: МЫ,
                    partnerId: null,
                    subForwarderId: null,
                }]),
            },
            $transaction: jest.fn(async (fn: any) => fn(tx)),
        };

        const service = new PaymentsService(
            prisma,
            { checkPeriodNotClosed: jest.fn() } as any,
            { ensureCompanyFinanceSettings: jest.fn() } as any,
            { processOrderTrigger: jest.fn() } as any,
            { release: jest.fn(), reduce: jest.fn() } as any,
            { toBase: jest.fn().mockResolvedValue(null) } as any,
            new FinanceCalculatorService(),
        );
        return { service, prisma, tx };
    };

    it('сумму нельзя опустить ниже того, что уже разнесено', async () => {
        const { service, prisma } = build();

        await expect(service.updatePayment(МЫ, 'п-1', 'бухгалтер', { amount: 1 }))
            .rejects.toThrow('разнесён по заявкам на 600000.00 ₸');
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('в отказе названы обе цифры — было и станет', async () => {
        // Бухгалтер должна увидеть, на сколько именно не сходится, а не
        // «нельзя»: иначе следующий шаг — угадывать.
        const { service } = build();

        await expect(service.updatePayment(МЫ, 'п-1', 'бухгалтер', { amount: 500_000 }))
            .rejects.toThrow(/600000\.00[\s\S]*500000\.00/);
    });

    it('увеличить сумму можно — разнесённое от этого не пострадает', async () => {
        const { service, tx } = build();

        await service.updatePayment(МЫ, 'п-1', 'бухгалтер', { amount: 700_000 });

        expect(tx.payment.update).toHaveBeenCalled();
    });

    it('ровно на сумму долей — тоже можно', async () => {
        const { service, tx } = build();

        await service.updatePayment(МЫ, 'п-1', 'бухгалтер', { amount: 600_000 });

        expect(tx.payment.update).toHaveBeenCalled();
    });

    it('разнесённый платёж нельзя привязать ещё и целиком к заявке', async () => {
        // Иначе она оплачена дважды: и всем платежом, и своей долей.
        const { service } = build();

        await expect(service.updatePayment(МЫ, 'п-1', 'бухгалтер', { orderId: 'р-3' }))
            .rejects.toThrow('оплачена дважды');
    });

    it('у платежа без долей сумма правится свободно', async () => {
        const { service, tx } = build({ orderShares: [] });

        await service.updatePayment(МЫ, 'п-1', 'бухгалтер', { amount: 1 });

        expect(tx.payment.update).toHaveBeenCalled();
    });

    it('сумма в тенге пересчитывается вместе с самой суммой', async () => {
        // Иначе отчёты остаются на прежней цифре: они считают по ней.
        const { service, tx } = build({ orderShares: [] });

        await service.updatePayment(МЫ, 'п-1', 'бухгалтер', { amount: 250_000 });

        expect(tx.payment.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ amountBase: expect.anything() }),
            }),
        );
        const { data } = tx.payment.update.mock.calls[0][0];
        expect(Number(data.amountBase)).toBe(250_000);
    });
});
