/**
 * Сколько водитель парка получит за рейс — и что удержано.
 *
 * Порядок, как его считает бухгалтер по договору ГПХ:
 *  1. комиссия парка — процент от суммы за рейс;
 *  2. с остатка (доход водителя) — ОПВ и ВОСМС;
 *  3. подоходный налог — с дохода за вычетом ОПВ и ВОСМС;
 *  4. на руки — доход минус ОПВ, ВОСМС и ИПН.
 * Социальные отчисления (СО) парк платит сверху — от дохода за вычетом ОПВ;
 * из выплаты они не удерживаются, считаются для сведения бухгалтеру.
 *
 * Ставки задаёт парк со своим бухгалтером: закон меняется, и система их
 * не придумывает. Вычеты (например, стандартный по ИПН) здесь не
 * применяются — их учтёт бухгалтер в 1С, если положены.
 */
export interface PayoutRates {
    commissionPct: number;
    opvPct: number;
    vosmsPct: number;
    ipnPct: number;
    soPct: number;
}

export interface PayoutAmounts {
    gross: number;
    commission: number;
    opv: number;
    vosms: number;
    ipn: number;
    net: number;
    so: number;
}

/** До тиынов: 1 234,565 → 1 234,57. */
function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcPayout(gross: number, r: PayoutRates): PayoutAmounts {
    const commission = money(gross * r.commissionPct / 100);
    const income = money(gross - commission);
    const opv = money(income * r.opvPct / 100);
    const vosms = money(income * r.vosmsPct / 100);
    const ipn = money(Math.max(0, income - opv - vosms) * r.ipnPct / 100);
    const net = money(income - opv - vosms - ipn);
    const so = money(Math.max(0, income - opv) * r.soPct / 100);
    return { gross: money(gross), commission, opv, vosms, ipn, net, so };
}

/** Сумма строк — итог выплаты. */
export function sumPayouts(items: PayoutAmounts[]): PayoutAmounts {
    const total = { gross: 0, commission: 0, opv: 0, vosms: 0, ipn: 0, net: 0, so: 0 };
    for (const i of items) {
        (Object.keys(total) as (keyof PayoutAmounts)[]).forEach((k) => { total[k] = money(total[k] + i[k]); });
    }
    return total;
}

/** IBAN Казахстана: KZ, две цифры контроля и 16 знаков — всего 20. Пробелы не в счёт. */
export function normalizeIban(raw: string): string | null {
    const iban = raw.replace(/\s/g, '').toUpperCase();
    return /^KZ\d{2}[A-Z0-9]{16}$/.test(iban) ? iban : null;
}
