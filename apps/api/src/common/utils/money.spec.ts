import { Prisma } from '@prisma/client';
import { D, DOrNull, money, moneyGte, sumOf, toNum, toNumOrNull } from './money';

describe('money — округление денежных сумм до тиына (2 знака)', () => {
    it('устраняет ошибку плавающей точки при сложении', () => {
        expect(money(0.1 + 0.2)).toBe(0.3);
        expect(money(1000.1 + 2000.2)).toBe(3000.3);
    });

    it('корректно выделяет нетто из суммы с НДС 12%', () => {
        expect(money(112000 / 1.12)).toBe(100000);
        expect(money(112000 - 112000 / 1.12)).toBe(12000);
    });

    it('округляет половину тиына вверх (банковское поведение не используется)', () => {
        expect(money(10.005)).toBe(10.01);
        expect(money(0.125)).toBe(0.13);
    });

    it('не искажает целые и уже округлённые значения', () => {
        expect(money(500000)).toBe(500000);
        expect(money(99.99)).toBe(99.99);
        expect(money(0)).toBe(0);
    });
});

describe('moneyGte — сравнение порогов оплаты без ложных недоплат', () => {
    it('считает сумму нескольких платежей равной цели, даже с погрешностью плавающей точки', () => {
        // Пять платежей по 19.99 логически дают ровно 99.95, но IEEE754 даёт 99.94999999999999
        const paidIn = 19.99 + 19.99 + 19.99 + 19.99 + 19.99;
        expect(paidIn >= 99.95).toBe(false); // обычное сравнение ложно считает недоплатой
        expect(moneyGte(paidIn, 99.95)).toBe(true); // round-safe — не ломается
    });

    it('корректно отличает реальную недоплату от погрешности', () => {
        expect(moneyGte(99.98, 100)).toBe(false);
        expect(moneyGte(100, 100)).toBe(true);
        expect(moneyGte(100.01, 100)).toBe(true);
    });
});

describe('Decimal-помощники — точные деньги', () => {
    it('складывает без погрешности плавающей точки', () => {
        // В числах 0.1 + 0.2 даёт 0.30000000000000004
        const rows = [{ amount: 0.1 }, { amount: 0.2 }];
        expect(sumOf(rows, (r) => r.amount).equals(new Prisma.Decimal('0.3'))).toBe(true);
    });

    it('пять платежей по 19.99 дают ровно 99.95, а не меньше', () => {
        const rows = Array(5).fill({ amount: '19.99' });
        const total = sumOf(rows, (r) => r.amount);

        expect(total.toString()).toBe('99.95');
        // Именно этот случай раньше требовал обходного moneyGte
        expect(total.gte(new Prisma.Decimal('99.95'))).toBe(true);
    });

    it('отличает реальную недоплату от погрешности', () => {
        expect(D('99.98').gte(D(100))).toBe(false);
        expect(D('100.00').gte(D(100))).toBe(true);
    });

    it('трактует отсутствие значения как ноль', () => {
        expect(D(null).toString()).toBe('0');
        expect(D(undefined).toString()).toBe('0');
        expect(DOrNull(null)).toBeNull();
    });

    it('на границе отдаёт число, округлённое до тиына', () => {
        expect(toNum(new Prisma.Decimal('1234.567'))).toBe(1234.57);
        expect(toNum(null)).toBe(0);
        expect(toNumOrNull(null)).toBeNull();
    });

    it('суммирует тысячу сумм по 0.01 в ровно 10', () => {
        const rows = Array(1000).fill({ amount: '0.01' });
        expect(sumOf(rows, (r) => r.amount).toString()).toBe('10');
    });
});
