import { Prisma } from '@prisma/client';
import { D, ZERO, roundMoney } from '../common/utils/money';

/**
 * Переоценка валютных остатков на конец месяца.
 *
 * Курсовая разница возникает не только когда деньги пришли. Пока долларовый
 * счёт просто лежит, а долг клиента просто не оплачен, курс всё равно
 * движется — и на конец месяца тысяча долларов стоит уже других тенге.
 * Эта разница обязана попасть в отчёт того месяца, а не ждать оплаты:
 * иначе баланс на 31 число покажет вчерашние тенге за сегодняшние доллары.
 *
 * Правило одно на все три случая:
 *
 *     было в тенге  →  стало в тенге  →  разница
 *
 * «Стало» — это остаток в валюте по курсу на дату переоценки. «Было» —
 * учётная стоимость того же остатка: сколько тенге за ним числится сейчас.
 * Откуда берётся «было», зависит от того, что переоцениваем, и это главная
 * тонкость: у счёта это движения денег, у долга — курс, по которому его
 * записали, а после первой переоценки — курс самой последней переоценки.
 * Иначе вторая переоценка посчитала бы ту же разницу второй раз.
 *
 * Здесь только арифметика, без базы.
 */

/** Что переоцениваем. */
export type RevaluationKind =
    /** Остаток на валютном счёте или в валютной кассе. */
    | 'ACCOUNT'
    /** Неоплаченный долг клиента по нашему счёту. */
    | 'RECEIVABLE'
    /** Наш неоплаченный долг перевозчику по его счёту. */
    | 'PAYABLE';

export interface RevaluationInput {
    kind: RevaluationKind;
    currency: string;
    /** Остаток в валюте на дату переоценки. */
    amount: Prisma.Decimal | string | number;
    /** Учётная стоимость этого остатка в тенге до переоценки. */
    baseBefore: Prisma.Decimal | string | number;
    /** Курс валюты на дату переоценки. */
    rate: Prisma.Decimal | string | number;
}

export interface RevaluationLine {
    /** Остаток в тенге после переоценки. */
    baseAfter: Prisma.Decimal;
    /** Разница: «+» — тенговая стоимость остатка выросла. */
    diff: Prisma.Decimal;
    /** Что это для компании: заработали на курсе или потеряли. */
    outcome: 'GAIN' | 'LOSS' | 'NONE';
}

/**
 * Переоценка одного остатка.
 *
 * Знак разницы читается по-разному в зависимости от того, что переоценили.
 * Доллары на нашем счёте подорожали — мы богаче. Долг клиента подорожал —
 * мы тоже богаче, нам должны больше тенге. А вот наш долг перевозчику
 * подорожал — мы беднее: отдавать придётся больше тенге. Число одно, смысл
 * противоположный, и показывать голую разницу без этого нельзя.
 */
export function revalue(input: RevaluationInput): RevaluationLine {
    const amount = D(input.amount);
    const baseBefore = roundMoney(D(input.baseBefore));
    const baseAfter = roundMoney(amount.times(D(input.rate)));

    const raw = roundMoney(baseAfter.minus(baseBefore));
    // Decimal умеет хранить «минус ноль» — в отчёте это выглядело бы
    // как «−0,00 ₸».
    const diff = raw.isZero() ? ZERO : raw;

    if (diff.isZero()) return { baseAfter, diff: ZERO, outcome: 'NONE' };

    // Долг перед поставщиком — единственный случай, где рост тенговой
    // стоимости остатка означает потерю.
    const good = input.kind === 'PAYABLE' ? diff.lt(ZERO) : diff.gt(ZERO);
    return { baseAfter, diff, outcome: good ? 'GAIN' : 'LOSS' };
}

/**
 * Учётная стоимость непогашенного долга.
 *
 * Долг записан по курсу документа. Но если по нему уже проходила
 * переоценка, числится он по курсу последней переоценки — с неё и надо
 * считать следующую разницу, иначе одни и те же тенге попадут в отчёт
 * дважды.
 */
export function debtBaseBefore(
    remaining: Prisma.Decimal | string | number,
    documentRate: Prisma.Decimal | string | number | null | undefined,
    lastRevaluationRate?: Prisma.Decimal | string | number | null,
): Prisma.Decimal | null {
    const rate = lastRevaluationRate ?? documentRate;
    if (rate === null || rate === undefined || D(rate).lte(ZERO)) return null;
    return roundMoney(D(remaining).times(D(rate)));
}

/**
 * Учётная стоимость остатка на валютном счёте.
 *
 * Считается от последней переоценки: её сумма в тенге плюс всё, что прошло
 * по счёту после неё (каждое движение — по своему курсу на день платежа).
 * Первый раз считать не от чего, поэтому точкой отсчёта служит начальный
 * остаток счёта по курсу на дату его ввода.
 */
export function accountBaseBefore(input: {
    /** Тенговая стоимость остатка на дату прошлой переоценки. */
    previousBase: Prisma.Decimal | string | number | null;
    /** Начальный остаток счёта в тенге, если переоценок ещё не было. */
    openingBase: Prisma.Decimal | string | number | null;
    /** Сумма движений в тенге после точки отсчёта: приход минус расход. */
    movementsBase: Prisma.Decimal | string | number;
}): Prisma.Decimal | null {
    const start = input.previousBase ?? input.openingBase;
    if (start === null || start === undefined) return null;
    return roundMoney(D(start).plus(D(input.movementsBase)));
}
