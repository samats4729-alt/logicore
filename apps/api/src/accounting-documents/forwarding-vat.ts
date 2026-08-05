import { Prisma } from '@prisma/client';

/**
 * НДС с вознаграждения экспедитора.
 *
 * Обычная схема: НДС считается со всей суммы счёта. Для экспедитора это
 * неверно. По договору транспортной экспедиции клиент возмещает нам расходы
 * на перевозку и сверх них платит вознаграждение — так написано и в нашем
 * собственном договоре («расходы, понесённые Экспедитором в интересах
 * Заказчика на перевозку груза, и вознаграждение Экспедитора»). Облагаемый
 * оборот экспедитора — только вознаграждение; стоимость привлечённого
 * перевозчика проходит через нас и нашим оборотом не является.
 *
 * Разница в деньгах большая. Рейс: клиенту 670 000, перевозчику 537 348.
 *   — обычная схема: НДС = 670 000 × 16/116 = 92 413,79
 *   — экспедиторская: НДС = 132 652 × 16/116 = 18 296,83
 * Семьдесят четыре тысячи разницы на одном рейсе. Именно поэтому схема
 * включается осознанно и по решению бухгалтера, а не «по умолчанию»: ошибка
 * стоит дорого в обе стороны.
 *
 * Итог счёта при этом НЕ меняется — клиент платит ту же сумму. Меняется
 * только то, какая её часть облагается налогом и как счёт выглядит: вместо
 * одной строки получаются две.
 *
 * Здесь только арифметика, без базы.
 */

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const D = (value: Prisma.Decimal | string | number) =>
    value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);

export interface ForwardingSplitInput {
    /** Сколько платит клиент по этому рейсу — итог не меняется. */
    customerAmount: Prisma.Decimal | string | number;
    /** Сколько из этого уходит перевозчику — проходная часть. */
    carrierCost: Prisma.Decimal | string | number | null | undefined;
    /** Ставка НДС на вознаграждение, %. */
    vatRate: Prisma.Decimal | string | number;
}

export interface ForwardingSplit {
    /** Возмещение расходов на перевозку — без НДС. */
    passThrough: Prisma.Decimal;
    /** Вознаграждение экспедитора — с него берётся НДС. */
    remuneration: Prisma.Decimal;
    /** Сам НДС, уже включённый в вознаграждение. */
    vat: Prisma.Decimal;
    /** Итог счёта: совпадает с суммой клиента. */
    total: Prisma.Decimal;
}

/** Почему разбить счёт по экспедиторской схеме нельзя. */
export class ForwardingSplitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ForwardingSplitError';
    }
}

/**
 * Разбить сумму рейса на возмещение и вознаграждение.
 *
 * НДС считается «в том числе»: вознаграждение — это то, что клиент платит
 * сверх расходов, и налог сидит внутри него. Начислять НДС сверху значило бы
 * изменить итог счёта, о котором договорились.
 */
export function splitForwardingAmount(input: ForwardingSplitInput): ForwardingSplit {
    const customerAmount = money(D(input.customerAmount));
    const carrierCost = money(D(input.carrierCost ?? 0));
    const vatRate = D(input.vatRate);

    if (customerAmount.lte(ZERO)) {
        throw new ForwardingSplitError('Сумма по рейсу не заполнена — разделить нечего');
    }
    if (carrierCost.lt(ZERO)) {
        throw new ForwardingSplitError('Стоимость перевозчика не может быть отрицательной');
    }
    if (carrierCost.gte(customerAmount)) {
        // Вознаграждения нет: мы отдаём перевозчику столько же или больше,
        // чем берём с клиента. Молча выставить нулевое вознаграждение нельзя —
        // это либо ошибка в ставках, либо рейс в убыток, и решать должен
        // человек, а не расчёт.
        throw new ForwardingSplitError(
            `Ставка перевозчика (${carrierCost.toFixed(2)}) не меньше суммы клиента (${customerAmount.toFixed(2)}) — вознаграждения нет, разделить счёт не получится`,
        );
    }

    const remuneration = money(customerAmount.minus(carrierCost));
    const vat = vatRate.gt(ZERO)
        ? money(remuneration.mul(vatRate).div(HUNDRED.plus(vatRate)))
        : ZERO;

    return {
        passThrough: carrierCost,
        remuneration,
        vat,
        // Итог собираем из частей, а не берём исходную сумму: если части
        // вдруг разойдутся с суммой из-за округления, это должно быть видно
        // здесь, а не всплыть в счёте у клиента.
        total: money(carrierCost.plus(remuneration)),
    };
}

/** Названия строк счёта по экспедиторской схеме. */
export const FORWARDING_LINE_NAMES = {
    passThrough: 'Возмещение расходов на перевозку',
    remuneration: 'Вознаграждение экспедитора',
} as const;
