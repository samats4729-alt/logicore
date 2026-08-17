import { BadRequestException } from '@nestjs/common';
import { PaymentDirection, Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { FinanceCalculatorService } from './finance-calculator.service';

/**
 * Валюта платежа.
 *
 * Три правила, каждое из которых иначе ломает сверку с банком:
 *   — доллары не кладутся на тенговый счёт;
 *   — валютный платёж без курса не принимается;
 *   — тенговый платёж работает ровно как раньше и курсов не спрашивает.
 */
describe('Валюта платежа', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);
    const COMPANY = 'c-1';

    const build = (options: { account?: any; rate?: any } = {}) => {
        const created: any[] = [];
        const tx = {
            payment: {
                create: jest.fn(async ({ data }: any) => {
                    created.push(data);
                    return { id: 'p-1', ...data, orderId: null };
                }),
            },
            order: { findUnique: jest.fn(), update: jest.fn() },
            orderChangeLog: { create: jest.fn() },
        };
        const prisma: any = {
            financeAccount: {
                findFirst: jest.fn().mockResolvedValue(
                    options.account === undefined
                        ? { id: 'acc-kzt', name: 'Расчетный счет', currency: 'KZT' }
                        : options.account,
                ),
            },
            financeCategory: { findFirst: jest.fn().mockResolvedValue(null) },
            order: { findUnique: jest.fn().mockResolvedValue(null) },
            $transaction: jest.fn(async (fn: any) => fn(tx)),
        };
        const currency = {
            toBase: jest.fn().mockResolvedValue(
                options.rate === undefined
                    ? { amount: D('480000'), rate: D('480'), rateDate: new Date('2026-08-03T00:00:00Z'), source: 'NBK' }
                    : options.rate,
            ),
        };
        const service = new PaymentsService(
            prisma,
            { checkPeriodNotClosed: jest.fn() } as any,
            { ensureCompanyFinanceSettings: jest.fn() } as any,
            { processOrderTrigger: jest.fn() } as any,
            { release: jest.fn(), reduce: jest.fn() } as any,
            currency as any,
            new FinanceCalculatorService(),
        );
        return { service, prisma, currency, created };
    };

    const payload = { direction: PaymentDirection.IN, amount: 1000, date: '2026-08-03' };

    it('валютный платёж запоминает курс и сумму в тенге', async () => {
        const { service, created } = build({
            account: { id: 'acc-usd', name: 'Валютный счёт', currency: 'USD' },
        });

        await service.createPayment(COMPANY, 'u-1', { ...payload, currency: 'USD', accountId: 'acc-usd' });

        expect(created[0].currency).toBe('USD');
        expect(Number(created[0].exchangeRate)).toBe(480);
        expect(Number(created[0].amountBase)).toBe(480000);
    });

    it('доллары на тенговый счёт не кладутся', async () => {
        // Иначе остаток по расчётному счёту перестанет сходиться с банком.
        const { service } = build();

        await expect(
            service.createPayment(COMPANY, 'u-1', { ...payload, currency: 'USD', accountId: 'acc-kzt' }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('в отказе названы обе валюты — счёта и платежа', async () => {
        const { service } = build();

        await expect(
            service.createPayment(COMPANY, 'u-1', { ...payload, currency: 'USD', accountId: 'acc-kzt' }),
        ).rejects.toThrow(/KZT.*USD|USD.*KZT/);
    });

    it('без курса валютный платёж не принимается вовсе', async () => {
        const { service, created } = build({
            account: { id: 'acc-usd', name: 'Валютный счёт', currency: 'USD' },
            rate: null,
        });

        await expect(
            service.createPayment(COMPANY, 'u-1', { ...payload, currency: 'USD', accountId: 'acc-usd' }),
        ).rejects.toThrow(/Курсы валют/);
        expect(created).toHaveLength(0);
    });

    it('валютный платёж без счёта не принимается', async () => {
        // Деньги должны куда-то лечь. Иначе они попадут на тенговый счёт по
        // умолчанию и растворятся в его остатке.
        const { service } = build({ account: null });

        await expect(
            service.createPayment(COMPANY, 'u-1', { ...payload, currency: 'USD' }),
        ).rejects.toThrow(/Счета и кассы/);
    });

    it('тенговый платёж курса не спрашивает и пишется как раньше', async () => {
        const { service, currency, created } = build();

        await service.createPayment(COMPANY, 'u-1', payload);

        expect(currency.toBase).not.toHaveBeenCalled();
        expect(created[0].currency).toBe('KZT');
        expect(Number(created[0].exchangeRate)).toBe(1);
        expect(Number(created[0].amountBase)).toBe(1000);
    });

    it('валюта не указана — берётся валюта счёта', async () => {
        // Бухгалтер выбрал валютный счёт: очевидно, что платёж в его валюте.
        const { service, created } = build({
            account: { id: 'acc-usd', name: 'Валютный счёт', currency: 'USD' },
        });

        await service.createPayment(COMPANY, 'u-1', { ...payload, accountId: 'acc-usd' });

        expect(created[0].currency).toBe('USD');
    });

    it('валютному платежу подбирается счёт в его валюте, а не тенговый по умолчанию', async () => {
        const { service, prisma } = build({
            account: { id: 'acc-usd', name: 'Валютный счёт', currency: 'USD' },
        });

        await service.createPayment(COMPANY, 'u-1', { ...payload, currency: 'USD' });

        const where = prisma.financeAccount.findFirst.mock.calls[0][0].where;
        expect(where.currency).toBe('USD');
    });
});
