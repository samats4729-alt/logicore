import { BadRequestException } from '@nestjs/common';
import { PaymentDirection, PaymentMethod, Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

const COMPANY = 'company-1';
const PAYMENT = 'payment-1';

const sourcePayment = (overrides: Record<string, unknown> = {}) => ({
    id: PAYMENT,
    companyId: COMPANY,
    orderId: 'order-1',
    counterpartyId: 'company-2',
    direction: PaymentDirection.IN,
    amount: new Prisma.Decimal('100000.00'),
    date: new Date('2026-07-10T00:00:00.000Z'),
    method: PaymentMethod.BANK,
    accountId: 'acc-1',
    refundOfId: null,
    isDeleted: false,
    refunds: [],
    ...overrides,
});

function buildService(payment: any) {
    const created: any[] = [];
    const tx = {
        payment: {
            create: jest.fn(async ({ data }: any) => {
                created.push(data);
                return { id: 'refund-1', ...data, order: { orderNumber: 'AB-1' } };
            }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        order: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
        orderChangeLog: { create: jest.fn() },
    };
    const prisma: any = {
        payment: { findFirst: jest.fn().mockResolvedValue(payment) },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const periodClosing = { checkPeriodNotClosed: jest.fn().mockResolvedValue(undefined) };
    const allocations = { reduce: jest.fn().mockResolvedValue({ documents: 1 }), release: jest.fn() };

    const service = new PaymentsService(
        prisma,
        periodClosing as any,
        { ensureCompanyFinanceSettings: jest.fn() } as any,
        { recalcForPayment: jest.fn() } as any,
        allocations as any,
    );
    // Пересчёт флагов заявки проверяется отдельно в payments.service.spec
    (service as any).syncOrderPaymentFlagsWithin = jest.fn().mockResolvedValue(false);
    (service as any).runCustomerPaidTrigger = jest.fn().mockResolvedValue(undefined);

    return { service, prisma, tx, periodClosing, allocations, created };
}

/**
 * T-20: вернуть деньги можно было только удалив платёж — история стиралась,
 * а акт сверки показывал, будто платежа и не было. Возврат должен быть
 * отдельной операцией со ссылкой на исходный платёж.
 */
describe('PaymentsService — возврат платежа', () => {
    it('создаёт обратный платёж со ссылкой на исходный', async () => {
        const { service, created } = buildService(sourcePayment());

        await service.refundPayment(COMPANY, PAYMENT, 'user-1', { amount: 40000 });

        expect(created).toHaveLength(1);
        expect(created[0]).toMatchObject({
            refundOfId: PAYMENT,
            direction: PaymentDirection.OUT,
            orderId: 'order-1',
            counterpartyId: 'company-2',
            accountId: 'acc-1',
        });
        expect(created[0].amount.toFixed(2)).toBe('40000.00');
    });

    it('без суммы возвращает весь остаток платежа', async () => {
        const { service, created } = buildService(sourcePayment({
            refunds: [{ amount: new Prisma.Decimal('30000.00') }],
        }));

        await service.refundPayment(COMPANY, PAYMENT, 'user-1', {});

        expect(created[0].amount.toFixed(2)).toBe('70000.00');
    });

    it('уменьшает разнесение исходного платежа по счетам', async () => {
        const { service, allocations } = buildService(sourcePayment());

        await service.refundPayment(COMPANY, PAYMENT, 'user-1', { amount: 25000 });

        // Иначе счёт остался бы «оплаченным» деньгами, которые уже вернули
        expect(allocations.reduce).toHaveBeenCalledTimes(1);
        const [paymentId, amount] = allocations.reduce.mock.calls[0];
        expect(paymentId).toBe(PAYMENT);
        expect(amount.toFixed(2)).toBe('25000.00');
    });

    it('не даёт вернуть больше остатка', async () => {
        const { service } = buildService(sourcePayment({
            refunds: [{ amount: new Prisma.Decimal('90000.00') }],
        }));

        await expect(service.refundPayment(COMPANY, PAYMENT, 'user-1', { amount: 20000 }))
            .rejects.toThrow('не более 10000.00');
    });

    it('не даёт вернуть уже полностью возвращённый платёж', async () => {
        const { service } = buildService(sourcePayment({
            refunds: [{ amount: new Prisma.Decimal('100000.00') }],
        }));

        await expect(service.refundPayment(COMPANY, PAYMENT, 'user-1', {}))
            .rejects.toThrow('уже возвращён полностью');
    });

    it('не даёт вернуть сам возврат', async () => {
        const { service } = buildService(sourcePayment({ refundOfId: 'payment-0' }));

        await expect(service.refundPayment(COMPANY, PAYMENT, 'user-1', { amount: 100 }))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('проверяет закрытый период по дате возврата, а не исходного платежа', async () => {
        const { service, periodClosing } = buildService(sourcePayment());

        await service.refundPayment(COMPANY, PAYMENT, 'user-1', {
            amount: 1000,
            date: '2026-08-01',
        });

        const checkedDate = periodClosing.checkPeriodNotClosed.mock.calls[0][1];
        expect(new Date(checkedDate).toISOString().slice(0, 10)).toBe('2026-08-01');
    });

    it('возврат идёт в обратную сторону от исходного платежа', async () => {
        const { service, created } = buildService(sourcePayment({
            direction: PaymentDirection.OUT,
        }));

        await service.refundPayment(COMPANY, PAYMENT, 'user-1', { amount: 5000 });

        expect(created[0].direction).toBe(PaymentDirection.IN);
    });

    // Ошибка при реализации: запрет сначала попал в updatePayment вместо
    // deletePayment — шаблон поиска совпал раньше по файлу. Оба места
    // закреплены тестом, чтобы «нельзя удалить» не оказалось «нельзя
    // изменить» и наоборот.
    describe('защита исходного платежа', () => {
        const buildWithRefunds = () => {
            const payment = {
                id: PAYMENT,
                companyId: COMPANY,
                orderId: null,
                direction: PaymentDirection.IN,
                amount: new Prisma.Decimal('100000.00'),
                date: new Date('2026-07-10T00:00:00.000Z'),
                isDeleted: false,
                refunds: [{ id: 'refund-1' }],
            };
            const prisma: any = {
                payment: {
                    findFirst: jest.fn().mockResolvedValue(payment),
                    update: jest.fn(),
                },
                order: { findUnique: jest.fn().mockResolvedValue(null) },
                $transaction: jest.fn(async (fn: any) => fn({
                    payment: { update: jest.fn(async () => ({ id: PAYMENT, orderId: null })) },
                    orderChangeLog: { create: jest.fn() },
                })),
            };
            const service = new PaymentsService(
                prisma,
                { checkPeriodNotClosed: jest.fn() } as any,
                { ensureCompanyFinanceSettings: jest.fn() } as any,
                { recalcForPayment: jest.fn() } as any,
                { reduce: jest.fn(), release: jest.fn() } as any,
            );
            return { service, prisma };
        };

        it('удалить платёж с возвратом нельзя', async () => {
            const { service, prisma } = buildWithRefunds();

            await expect(service.deletePayment(COMPANY, PAYMENT, 'user-1'))
                .rejects.toThrow('Нельзя удалить платёж');
            expect(prisma.payment.update).not.toHaveBeenCalled();
        });

        it('изменить сумму платежа с возвратом нельзя', async () => {
            const { service } = buildWithRefunds();

            await expect(service.updatePayment(COMPANY, PAYMENT, 'user-1', { amount: 10 }))
                .rejects.toThrow('Нельзя изменить сумму платежа');
        });

        it('правка примечания при этом разрешена', async () => {
            const { service } = buildWithRefunds();

            // Возврат считается от суммы — примечание на него не влияет
            await expect(service.updatePayment(COMPANY, PAYMENT, 'user-1', { note: 'уточнение' }))
                .resolves.toBeDefined();
        });
    });
});
