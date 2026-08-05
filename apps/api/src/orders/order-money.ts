import { Prisma } from '@prisma/client';

/**
 * Суммы заявки в учётной валюте компании.
 *
 * У рейса две цены и, вообще говоря, две валюты: клиент платит нам в своей,
 * перевозчику мы платим в своей. Пока обе тенге, «120 минус 100» — это
 * маржа. Как только валюты разошлись, вычитать одно из другого нельзя:
 * получится число без смысла. Поэтому рядом с исходными суммами хранится
 * их пересчёт в учётную валюту, и маржа считается только по нему.
 *
 * Курс берётся на дату погрузки — день, когда услуга фактически оказана.
 * Если даты погрузки ещё нет (заявка только заводится), берётся сегодняшний
 * день: это честнее, чем оставить сумму без пересчёта вовсе. При правке
 * заявки пересчёт повторяется — вместе с самими суммами.
 *
 * Здесь нет ни базы, ни сети: курс приходит колбэком. Так это можно
 * проверить на настоящих числах, а не на подделке всей Prisma.
 */

export interface OrderMoneyInput {
    customerPrice?: Prisma.Decimal | number | null;
    driverCost?: Prisma.Decimal | number | null;
    subForwarderPrice?: Prisma.Decimal | number | null;
    /** Валюта тарифа клиента. */
    currency?: string | null;
    /** Валюта тарифа перевозчика. */
    driverCostCurrency?: string | null;
    /**
     * Валюта ставки суб-экспедитора. Не указана — тарифом считается валюта
     * клиента: так было всегда, пока валюта у заявки была одна.
     */
    subForwarderPriceCurrency?: string | null;
    /** Дата погрузки, если известна. */
    loadingDate?: Date | string | null;
}

export interface OrderMoneyResult {
    customerPriceBase: Prisma.Decimal | null;
    driverCostBase: Prisma.Decimal | null;
    subForwarderPriceBase: Prisma.Decimal | null;
    currencyRateDate: Date | null;
    /** Валюты, по которым курса не нашлось: суммы остались без пересчёта. */
    missingRates: string[];
}

/** Курс валюты к учётной на дату: сколько учётных за одну единицу. */
export type RateLookup = (code: string, date: Date) => Promise<Prisma.Decimal | null>;

const asDecimal = (value: Prisma.Decimal | number | null | undefined) =>
    value === null || value === undefined
        ? null
        : (value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value));

/** Дата без времени: курс объявляется на день. */
function day(value: Date | string | null | undefined, fallback: Date): Date {
    if (!value) return fallback;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function resolveOrderMoney(
    input: OrderMoneyInput,
    baseCurrency: string,
    rateOn: RateLookup,
    now: Date = new Date(),
): Promise<OrderMoneyResult> {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rateDate = day(input.loadingDate, today);

    const customerCurrency = (input.currency || baseCurrency).toUpperCase();
    const carrierCurrency = (input.driverCostCurrency || baseCurrency).toUpperCase();
    // Ставка суб-экспедитора раньше не имела своей валюты и молча следовала
    // за валютой заявки. Стоило поменять валюту заявки — и ставка перевозчика
    // становилась «столько же, но в долларах», хотя её никто не трогал.
    const subForwarderCurrency = (input.subForwarderPriceCurrency || input.currency || baseCurrency).toUpperCase();

    const missingRates: string[] = [];

    const convert = async (
        amount: Prisma.Decimal | null,
        code: string,
    ): Promise<Prisma.Decimal | null> => {
        if (amount === null) return null;
        if (code === baseCurrency) return amount.toDecimalPlaces(2);
        const rate = await rateOn(code, rateDate);
        if (!rate) {
            // Без курса пересчёта нет. Подставить саму сумму нельзя: это
            // означало бы «доллар равен тенге», и в отчёте такое не видно.
            if (!missingRates.includes(code)) missingRates.push(code);
            return null;
        }
        return amount.times(rate).toDecimalPlaces(2);
    };

    const customerPrice = asDecimal(input.customerPrice);
    const driverCost = asDecimal(input.driverCost);
    const subForwarderPrice = asDecimal(input.subForwarderPrice);

    return {
        customerPriceBase: await convert(customerPrice, customerCurrency),
        driverCostBase: await convert(driverCost, carrierCurrency),
        subForwarderPriceBase: await convert(subForwarderPrice, subForwarderCurrency),
        currencyRateDate: customerPrice !== null || driverCost !== null || subForwarderPrice !== null
            ? rateDate
            : null,
        missingRates,
    };
}

/**
 * Маржа рейса в учётной валюте.
 *
 * Считается только по пересчитанным суммам. Если хотя бы одной из них нет
 * (не нашлось курса), маржи нет тоже — вместо неё `null`. Ноль здесь был бы
 * ложью: «заработали ноль» и «не знаем, сколько заработали» — разные вещи.
 */
export function orderMarginBase(
    customerPriceBase: Prisma.Decimal | number | null | undefined,
    driverCostBase: Prisma.Decimal | number | null | undefined,
): Prisma.Decimal | null {
    const income = asDecimal(customerPriceBase);
    const cost = asDecimal(driverCostBase);
    if (income === null) return null;
    return income.minus(cost ?? new Prisma.Decimal(0)).toDecimalPlaces(2);
}
