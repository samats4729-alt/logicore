import { BadRequestException } from '@nestjs/common';
import { PaymentDirection, Prisma } from '@prisma/client';
import { PaymentAllocationService } from './payment-allocation.service';

/**
 * Курсовая разница при разнесении платежа на счёт.
 *
 * Здесь проверяется не арифметика (она в exchange-difference.spec), а то,
 * что посчитанное действительно попадает в базу и что долг закрывается в
 * валюте счёта. Если разнесение запишет сумму платежа вместо суммы долга,
 * долларовый счёт после оплаты будет должен ещё 479 000 долларов.
 */
describe('Разнесение платежа в валюте', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);
    const COMPANY = 'c-1';

    const build = (options: { document?: any; payment?: any; rateOnPaymentDate?: any } = {}) => {
        const rows: any[] = [];
        const updates: Record<string, any> = {};

        const document = {
            id: 'doc-1',
            number: 'СЧ-1',
            total: D('1000'),
            amountPaid: D('0'),
            counterpartyId: 'cp-1',
            direction: 'OUTGOING',
            currency: 'USD',
            // Курс, зафиксированный при проведении счёта.
            exchangeRate: D('473'),
            ...(options.document ?? {}),
        };

        const tx: any = {
            accountingPaymentAllocation: {
                findMany: jest.fn(async () => []),
                deleteMany: jest.fn(async () => ({ count: 0 })),
                create: jest.fn(async ({ data }: any) => { rows.push(data); return data; }),
                aggregate: jest.fn(async () => ({
                    _sum: { amount: rows.reduce((s, r) => s.plus(r.amount), D(0)) },
                })),
            },
            accountingDocument: {
                findUnique: jest.fn(async () => document),
                update: jest.fn(async ({ where, data }: any) => { updates[where.id] = data; return data; }),
            },
        };

        const prisma: any = {
            payment: {
                findFirst: jest.fn().mockResolvedValue({
                    id: 'pay-1',
                    amount: D('1000'),
                    direction: PaymentDirection.IN,
                    counterpartyId: 'cp-1',
                    currency: 'USD',
                    exchangeRate: D('480'),
                    date: new Date('2026-08-03'),
                    ...(options.payment ?? {}),
                }),
            },
            accountingDocument: { findMany: jest.fn(async () => [document]) },
            $transaction: jest.fn(async (fn: any) => fn(tx)),
        };

        const currency = {
            rateOn: jest.fn().mockResolvedValue(
                options.rateOnPaymentDate === undefined
                    ? { rate: D('480'), rateDate: new Date('2026-08-03'), source: 'NBK' }
                    : options.rateOnPaymentDate,
            ),
        };

        return {
            service: new PaymentAllocationService(prisma, currency as any),
            rows, updates, currency,
        };
    };

    it('долларовый счёт закрывается долларами, а разница ложится отдельно', async () => {
        const { service, rows, updates } = build();

        await service.apply(COMPANY, 'u-1', 'pay-1', [{ documentId: 'doc-1', amount: '1000' }]);

        expect(Number(rows[0].amount)).toBe(1000);
        expect(Number(rows[0].amountBase)).toBe(480000);
        expect(Number(rows[0].exchangeDiff)).toBe(7000);
        // Долг закрыт целиком: клиент был должен тысячу долларов и прислал
        // тысячу долларов.
        expect(Number(updates['doc-1'].balanceDue)).toBe(0);
    });

    it('тенгами гасят долларовый счёт по курсу дня оплаты', async () => {
        const { service, rows, updates } = build({
            payment: { currency: 'KZT', exchangeRate: D('1'), amount: D('480000') },
        });

        await service.apply(COMPANY, 'u-1', 'pay-1', [{ documentId: 'doc-1', amount: '480000' }]);

        // В счёте гасится 1 000 USD, а не 480 000 «долларов».
        expect(Number(rows[0].amount)).toBe(1000);
        expect(Number(rows[0].exchangeDiff)).toBe(7000);
        expect(Number(updates['doc-1'].balanceDue)).toBe(0);
    });

    it('без курса валюты счёта на дату платежа разнести нельзя', async () => {
        const { service } = build({
            payment: { currency: 'KZT', exchangeRate: D('1'), amount: D('480000') },
            rateOnPaymentDate: null,
        });

        await expect(
            service.apply(COMPANY, 'u-1', 'pay-1', [{ documentId: 'doc-1', amount: '480000' }]),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('в отказе сказано, куда идти за курсом', async () => {
        const { service } = build({
            payment: { currency: 'KZT', exchangeRate: D('1'), amount: D('480000') },
            rateOnPaymentDate: null,
        });

        await expect(
            service.apply(COMPANY, 'u-1', 'pay-1', [{ documentId: 'doc-1', amount: '480000' }]),
        ).rejects.toThrow(/Курсы валют/);
    });

    it('тенговый платёж по тенговому счёту курсов не спрашивает', async () => {
        // Обычная оплата не должна зависеть от справочника курсов.
        const { service, rows, currency } = build({
            document: { currency: 'KZT', exchangeRate: D('1'), total: D('230000') },
            payment: { currency: 'KZT', exchangeRate: D('1'), amount: D('230000') },
        });

        await service.apply(COMPANY, 'u-1', 'pay-1', [{ documentId: 'doc-1', amount: '230000' }]);

        expect(currency.rateOn).not.toHaveBeenCalled();
        expect(Number(rows[0].amount)).toBe(230000);
        expect(Number(rows[0].exchangeDiff)).toBe(0);
    });

    it('курс валюты счёта берётся на дату платежа, а не на сегодня', async () => {
        const { service, currency } = build({
            payment: { currency: 'KZT', exchangeRate: D('1'), amount: D('480000') },
        });

        await service.apply(COMPANY, 'u-1', 'pay-1', [{ documentId: 'doc-1', amount: '480000' }]);

        const [code, date] = currency.rateOn.mock.calls[0];
        expect(code).toBe('USD');
        expect(new Date(date).toISOString().slice(0, 10)).toBe('2026-08-03');
    });

    it('частичная оплата оставляет остаток долга в валюте счёта', async () => {
        const { service, rows, updates } = build();

        await service.apply(COMPANY, 'u-1', 'pay-1', [{ documentId: 'doc-1', amount: '400' }]);

        expect(Number(rows[0].amount)).toBe(400);
        // Долг остался долларовым: 600 USD, а не «600 по вчерашнему курсу».
        expect(Number(updates['doc-1'].balanceDue)).toBe(600);
        expect(Number(rows[0].exchangeDiff)).toBe(2800);
    });
});
