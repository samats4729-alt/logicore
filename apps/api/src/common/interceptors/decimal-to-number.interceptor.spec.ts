import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { of } from 'rxjs';
import { DecimalToNumberInterceptor } from './decimal-to-number.interceptor';

/**
 * Без этого перехватчика Prisma.Decimal сериализуется в JSON строкой, и веб
 * получил бы "1000" вместо 1000. Компилятор такую утечку не ловит, поэтому
 * поведение зафиксировано тестом.
 */
describe('DecimalToNumberInterceptor', () => {
    const interceptor = new DecimalToNumberInterceptor();
    const context = {} as ExecutionContext;

    async function pass(payload: unknown): Promise<any> {
        const handler: CallHandler = { handle: () => of(payload) };
        return new Promise((resolve) => {
            interceptor.intercept(context, handler).subscribe(resolve);
        });
    }

    it('без обработки Decimal ушёл бы в JSON строкой', () => {
        expect(JSON.stringify({ amount: new Prisma.Decimal('1000.50') })).toBe('{"amount":"1000.5"}');
    });

    it('превращает Decimal в число', async () => {
        const result = await pass({ amount: new Prisma.Decimal('1000.50') });

        expect(result.amount).toBe(1000.5);
        expect(JSON.stringify(result)).toBe('{"amount":1000.5}');
    });

    it('обрабатывает вложенность и массивы — как в списке расходов', async () => {
        const result = await pass({
            rows: [
                { id: 'e1', amount: new Prisma.Decimal('100'), order: { price: new Prisma.Decimal('250.25') } },
                { id: 'e2', amount: new Prisma.Decimal('0.01') },
            ],
            totals: { sum: new Prisma.Decimal('100.01') },
        });

        expect(result.rows[0].amount).toBe(100);
        expect(result.rows[0].order.price).toBe(250.25);
        expect(result.rows[1].amount).toBe(0.01);
        expect(result.totals.sum).toBe(100.01);
    });

    it('не трогает остальные типы', async () => {
        const date = new Date('2026-07-25T00:00:00.000Z');
        const result = await pass({
            name: 'Расход',
            count: 5,
            isDeleted: false,
            note: null,
            missing: undefined,
            date,
        });

        expect(result).toEqual({
            name: 'Расход',
            count: 5,
            isDeleted: false,
            note: null,
            missing: undefined,
            date,
        });
        expect(result.date).toBeInstanceOf(Date);
    });

    it('выдерживает циклическую ссылку', async () => {
        const node: any = { amount: new Prisma.Decimal('7') };
        node.self = node;

        await expect(pass(node)).resolves.toBeDefined();
    });

    it('пропускает пустой ответ', async () => {
        await expect(pass(null)).resolves.toBeNull();
        await expect(pass(undefined)).resolves.toBeUndefined();
    });
});
