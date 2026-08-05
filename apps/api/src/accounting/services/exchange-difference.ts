import { Prisma } from '@prisma/client';
import { D, ZERO, roundMoney } from '../../common/utils/money';

/**
 * Курсовая разница при погашении счёта платежом.
 *
 * Задача, из-за которой всё это существует. Счёт выставили на 1 000 USD,
 * когда доллар стоил 473 ₸ — в учёте записали выручку 473 000 ₸. Деньги
 * пришли через месяц, доллар стал 480 ₸ — на счёт легло 480 000 ₸. Долг
 * закрыт полностью: клиент должен был тысячу долларов и прислал тысячу
 * долларов. Но в тенге пришло на 7 000 больше, чем записали выручкой.
 *
 * Эти 7 000 ₸ — не выручка и не ошибка. Это курсовая разница, и она обязана
 * стоять отдельной строкой. Если её размазать по выручке, отчёт разойдётся
 * с банком; если выбросить — не сойдётся баланс. Бухгалтер ищет именно её,
 * когда «деньги пришли, а суммы не совпадают».
 *
 * Здесь только арифметика, без базы: правило одно на все случаи, и его
 * должно быть видно целиком в одном месте.
 */

/** Учётная валюта: к ней приводится всё, что попадает в отчёты. */
const BASE_CURRENCY = 'KZT';

export interface SettlementInput {
    /** Часть платежа, которая идёт на этот счёт, — в валюте платежа. */
    part: Prisma.Decimal | string | number;
    paymentCurrency: string;
    /** Курс валюты платежа на дату платежа. Для тенге не нужен. */
    paymentRate?: Prisma.Decimal | string | number | null;
    documentCurrency: string;
    /** Курс, зафиксированный в счёте при проведении. Для тенге не нужен. */
    documentRate?: Prisma.Decimal | string | number | null;
    /**
     * Курс валюты счёта на дату платежа. Нужен только когда платёж пришёл
     * в другой валюте: тенге, которыми гасят долларовый счёт, превращаются
     * в доллары по курсу дня оплаты, а не по курсу счёта.
     */
    documentCurrencyRateOnPaymentDate?: Prisma.Decimal | string | number | null;
}

export interface Settlement {
    /** Сколько долга погашено — в валюте счёта. */
    closed: Prisma.Decimal;
    /** Сколько денег ушло на это погашение — в учётной валюте. */
    amountBase: Prisma.Decimal;
    /** Курсовая разница в учётной валюте: «+» — денег больше, чем записали. */
    exchangeDiff: Prisma.Decimal;
}

/** Чего не хватило, чтобы посчитать. Текст показывается пользователю. */
export class MissingRateError extends Error {
    constructor(public readonly currency: string, message: string) {
        super(message);
        this.name = 'MissingRateError';
    }
}

/**
 * Курс валюты. Тенге к тенге всегда один — за ним не ходим никуда, иначе
 * обычная тенговая оплата зависела бы от наличия справочника курсов.
 */
function rateOf(
    currency: string,
    rate: Prisma.Decimal | string | number | null | undefined,
    what: string,
): Prisma.Decimal {
    if ((currency || BASE_CURRENCY).toUpperCase() === BASE_CURRENCY) return D(1);
    if (rate === null || rate === undefined || D(rate).lte(ZERO)) {
        throw new MissingRateError(currency, what);
    }
    return D(rate);
}

/**
 * Погашение части счёта одним платежом.
 *
 * Правило одно и то же для всех случаев:
 *   1. Деньги платежа переводим в тенге по курсу дня оплаты.
 *   2. Считаем, сколько долга это закрывает — в валюте счёта.
 *   3. Разница между пришедшими тенге и тем, во сколько тенге этот долг
 *      был записан в счёте, и есть курсовая разница.
 *
 * Когда валюты платежа и счёта совпадают, шаг 2 — это просто сама сумма
 * платежа: тысяча долларов закрывает тысячу долларов долга, без пересчётов
 * туда-обратно. Иначе на копейках оставался бы незакрытый хвост долга.
 */
export function settleAllocation(input: SettlementInput): Settlement {
    const part = roundMoney(D(input.part));
    const paymentCurrency = (input.paymentCurrency || BASE_CURRENCY).toUpperCase();
    const documentCurrency = (input.documentCurrency || BASE_CURRENCY).toUpperCase();

    const paymentRate = rateOf(
        paymentCurrency,
        input.paymentRate,
        `Нет курса ${paymentCurrency} на дату платежа`,
    );
    const documentRate = rateOf(
        documentCurrency,
        input.documentRate,
        `В счёте нет курса ${documentCurrency}`,
    );

    const amountBase = roundMoney(part.times(paymentRate));

    let closed: Prisma.Decimal;
    if (paymentCurrency === documentCurrency) {
        closed = part;
    } else {
        const onPaymentDate = rateOf(
            documentCurrency,
            input.documentCurrencyRateOnPaymentDate,
            `Нет курса ${documentCurrency} на дату платежа`,
        );
        closed = roundMoney(amountBase.div(onPaymentDate));
    }

    // Округление до копейки нужно приводить к обычному нулю: Decimal умеет
    // хранить «минус ноль», и в карточке появлялось бы «−0,00 ₸».
    const diff = roundMoney(amountBase.minus(closed.times(documentRate)));

    return {
        closed,
        amountBase,
        exchangeDiff: diff.isZero() ? ZERO : diff,
    };
}

/**
 * Сумма платежа в учётной валюте.
 *
 * Тенговый платёж — сам себе пересчёт. Валютный берётся по курсу, который
 * записан в нём самом. Если курса нет, платёж НЕ берётся как есть: тысяча
 * долларов, посчитанная тысячей тенге, — ошибка, которую в отчёте не видно.
 * Такой платёж не участвует в тенговых суммах вовсе.
 */
export function paymentInBase(payment: {
    amount: Prisma.Decimal | string | number;
    currency?: string | null;
    amountBase?: Prisma.Decimal | string | number | null;
}): Prisma.Decimal {
    const currency = (payment.currency || BASE_CURRENCY).toUpperCase();
    if (currency === BASE_CURRENCY) return D(payment.amount);
    if (payment.amountBase !== null && payment.amountBase !== undefined) return D(payment.amountBase);
    return ZERO;
}

/** Чем обернулась курсовая разница для компании. */
export type ExchangeOutcome = 'GAIN' | 'LOSS' | 'NONE';

/**
 * Знак курсовой разницы зависит от того, кому мы выставили счёт.
 *
 * По нашему счёту (OUTGOING) лишние тенге — доход: получили больше, чем
 * записали выручкой. По счёту поставщика (INCOMING) те же лишние тенге —
 * расход: отдали больше, чем записали затратой. Число одно, смысл обратный,
 * поэтому в отчёте нельзя показывать голую разницу без направления.
 */
export function exchangeOutcome(
    diff: Prisma.Decimal | string | number,
    direction: 'OUTGOING' | 'INCOMING',
): { outcome: ExchangeOutcome; amount: Prisma.Decimal } {
    const value = roundMoney(D(diff));
    if (value.isZero()) return { outcome: 'NONE', amount: ZERO };
    const signed = direction === 'OUTGOING' ? value : value.negated();
    return { outcome: signed.gt(ZERO) ? 'GAIN' : 'LOSS', amount: signed };
}
