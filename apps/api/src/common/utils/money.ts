import { Prisma } from '@prisma/client';

/**
 * Денежные суммы хранятся в базе как DECIMAL(18,2) и приходят из Prisma
 * объектами Prisma.Decimal — точными, без погрешности двоичной плавающей
 * точки. Складывать и умножать их нужно методами Decimal, а не операторами
 * JavaScript: `0.1 + 0.2` в числах даёт 0.30000000000000004, и на сотнях
 * платежей это выливается в расхождение копеек в акте сверки.
 *
 * Правило работы с деньгами в API:
 *   1. из базы приходит Decimal;
 *   2. все вычисления — в Decimal (D, sumOf, методы .plus/.minus/.times);
 *   3. наружу (HTTP-ответ, PDF, Excel) отдаём число через toNum — ровно один
 *      раз, на самой границе. Контракт с вебом от этого не меняется.
 */

export type Money = Prisma.Decimal;

export const ZERO: Prisma.Decimal = new Prisma.Decimal(0);

/** Денежные суммы округляются до тиына (2 знака). */
const MONEY_SCALE = 2;

/**
 * Приводит к Decimal что угодно из того, что встречается в кодовой базе:
 * Decimal из Prisma, число из DTO, строку из запроса. `null`/`undefined`
 * означают «нет значения» и дают 0 — так же, как раньше работали выражения
 * вида `order.customerPrice || 0`.
 */
export function D(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
    if (value === null || value === undefined || value === '') return ZERO;
    if (value instanceof Prisma.Decimal) return value;
    const decimal = new Prisma.Decimal(value);
    return decimal.isNaN() ? ZERO : decimal;
}

/** То же, но сохраняет отсутствие значения — для необязательных полей. */
export function DOrNull(
    value: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal | null {
    if (value === null || value === undefined || value === '') return null;
    return D(value);
}

/** Точная сумма по списку. Заменяет `reduce((s, x) => s + x.amount, 0)`. */
export function sumOf<T>(
    items: readonly T[],
    pick: (item: T) => Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal {
    return items.reduce<Prisma.Decimal>((total, item) => total.plus(D(pick(item))), ZERO);
}

/**
 * Граница наружу: Decimal -> число, округлённое до тиына. Дальше это значение
 * уходит в JSON, PDF или Excel и больше в вычислениях не участвует.
 */
export function toNum(value: Prisma.Decimal | number | null | undefined): number {
    return D(value).toDecimalPlaces(MONEY_SCALE).toNumber();
}

/** Граница наружу с сохранением `null` — для необязательных сумм. */
export function toNumOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    return toNum(value);
}

/**
 * Неоплаченный остаток: `начислено − оплачено`, но не меньше нуля.
 * Заменяет `Math.max(a - b, 0)` — переплата не должна давать отрицательный долг.
 */
export function positiveRest(
    owed: Prisma.Decimal | number | null | undefined,
    paid: Prisma.Decimal | number | null | undefined,
): Prisma.Decimal {
    const rest = D(owed).minus(D(paid));
    return rest.gt(0) ? rest : ZERO;
}

/** Округление до тиына, остаётся в Decimal. */
export function roundMoney(value: Prisma.Decimal | number | null | undefined): Prisma.Decimal {
    return D(value).toDecimalPlaces(MONEY_SCALE);
}

/**
 * Округление до тиына для значений, которые уже являются числами
 * (промежуточные расчёты, данные из DTO, суммы из внешних источников).
 * Для величин, пришедших из базы, используйте Decimal-путь выше.
 */
export function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Сравнение порогов оплаты для числовых величин. Оставлено для расчётов,
 * которые ведутся в числах; для Decimal используйте `.gte()` — он точен
 * и обходного пути не требует.
 */
export function moneyGte(a: number, b: number): boolean {
    return money(a) >= money(b);
}
