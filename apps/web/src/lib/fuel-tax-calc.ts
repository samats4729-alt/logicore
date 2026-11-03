/**
 * Калькулятор ГСМ и налогов для обычных компаний (шеф, 03.11.2026): общая сумма
 * минус ГСМ по километражу, налоги, сумма водителю и цена, которую можно назвать
 * заказчику. Только прикидка на экране: ничего не сохраняет и не отправляет.
 *
 * Налоги — по тем же правилам, что расчёт водителя у парка (`settlement-calc`
 * на сервере): целыми тенге, СО — после ОПВ, ИПН — после ОПВ, ОСМС, СО и вычета.
 * Цифры парка считает сервер по его ставкам; здесь ставки 2026 года и один рейс
 * в месяце, поэтому месячные пределы и годовой порог ИПН не копятся.
 */

const OPV = 0.1;
const VOSMS = 0.02;
const SO = 0.05;
const IPN = 0.1;
const VAT = 0.16;

/** 7 МЗП, 20 МЗП и вычет 30 МРП на 2026 год, ₸. */
const SO_BASE_CAP = 595000;
const VOSMS_BASE_CAP = 1700000;
export const DEDUCTION_2026 = 129750;

/** Налоги из разницы — или разница целиком водителю, а налоги сверху. */
export type FuelTaxMode = 'out' | 'top';

export interface FuelTaxInput {
    total: number;
    km: number;
    /** Расход, л на 100 км. */
    consumption: number;
    /** Цена литра, ₸. */
    price: number;
    mode: FuelTaxMode;
    deduction: boolean;
    /** Свой процент сверху, %. */
    percent: number;
    vat: boolean;
}

export interface FuelTaxResult {
    liters: number;
    fuel: number;
    /** Общая сумма минус ГСМ. */
    diff: number;
    /** Начислено: из разницы — сама разница, сверху — поднято под неё. */
    gross: number;
    opv: number;
    vosms: number;
    so: number;
    ipn: number;
    deductionUsed: number;
    taxes: number;
    onHand: number;
    /** ГСМ, налоги и водителю. */
    cost: number;
    /** Свой процент, ₸. */
    cut: number;
    vatSum: number;
    customerPrice: number;
    soCapped: boolean;
    vosmsCapped: boolean;
}

const toTiyn = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function taxesOf(gross: number, deduction: boolean) {
    const opv = Math.round(gross * OPV);
    const vosms = Math.round(Math.min(gross, VOSMS_BASE_CAP) * VOSMS);
    const so = Math.round(Math.min(Math.max(0, gross - opv), SO_BASE_CAP) * SO);
    const rest = Math.max(0, gross - opv - vosms - so);
    const deductionUsed = deduction ? Math.min(DEDUCTION_2026, rest) : 0;
    const ipn = Math.round((rest - deductionUsed) * IPN);
    return { opv, vosms, so, ipn, deductionUsed, taxes: opv + vosms + so + ipn };
}

/** Наименьшее начисление, после налогов с которого остаётся ровно net. */
function grossForNet(net: number, deduction: boolean): number {
    let lo = net;
    let hi = net * 2 + 100;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (mid - taxesOf(mid, deduction).taxes < net) lo = mid;
        else hi = mid;
    }
    // Налоги чуть скачут от округления — смотрим соседние суммы.
    for (let g = Math.max(net, hi - 5); g <= hi + 5; g++) {
        if (g - taxesOf(g, deduction).taxes === net) return g;
    }
    return hi;
}

/** Топливо больше суммы или суммы нет — `null`: считать нечего, экран объясняет. */
export function calculateFuelTax(input: FuelTaxInput): FuelTaxResult | null {
    const liters = (input.km * input.consumption) / 100;
    const fuel = Math.round(liters * input.price);
    const diff = input.total - fuel;
    if (!(diff > 0)) return null;
    const gross = input.mode === 'top' ? grossForNet(diff, input.deduction) : diff;
    const t = taxesOf(gross, input.deduction);
    // Из разницы себестоимость и есть общая сумма; сверху — она больше на налоги.
    const cost = fuel + gross;
    const cut = toTiyn(cost * Math.max(0, input.percent) / 100);
    const noVat = toTiyn(cost + cut);
    const vatSum = input.vat ? toTiyn(noVat * VAT) : 0;
    return {
        liters, fuel, diff, gross, ...t, onHand: gross - t.taxes, cost, cut, vatSum,
        customerPrice: toTiyn(noVat + vatSum),
        soCapped: gross - t.opv > SO_BASE_CAP,
        vosmsCapped: gross > VOSMS_BASE_CAP,
    };
}

/** Только топливо — чтобы сказать, почему сумма не сходится. */
export function fuelOf(km: number, consumption: number, price: number): number {
    return Math.round(((km * consumption) / 100) * price);
}
