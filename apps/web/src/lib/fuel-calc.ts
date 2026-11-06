/**
 * Калькулятор ГСМ и налогов для обычных компаний (владелец, 06.11.2026): те же
 * правила, что расчёт водителя без ИП у парка (`settlement-calc` на сервере,
 * схема 4), только без комиссии и НДС. Ничего не сохраняет и не отправляет.
 *
 *  - на руки = (общая сумма − ГСМ) минус 10 %, целыми тенге;
 *  - начисление по ГПХ — такое, чтобы после ОПВ, ОСМС и СО осталось ровно «на руки»;
 *  - ИПН не удерживается: его платит компания;
 *  - себестоимость = ГСМ + начисление + ИПН.
 *
 * Ставки и пределы 2026 года, один рейс в месяце: месячные пределы и годовой
 * порог ИПН не копятся.
 */

const OPV = 10;
const VOSMS = 2;
const SO = 5;
const IPN = 10;

/** 7 МЗП, 20 МЗП и вычет 30 МРП на 2026 год, ₸. */
const SO_BASE_CAP = 595000;
const VOSMS_BASE_CAP = 1700000;
export const DEDUCTION_2026 = 129750;

/** Сколько остаётся от начисления после ОПВ, ОСМС и СО без пределов: 0,835. */
const KEEP = 1 - (OPV + VOSMS + (SO * (100 - OPV)) / 100) / 100;

export interface FuelCalcInput {
    total: number;
    km: number;
    /** Расход, л на 100 км. */
    consumption: number;
    /** Цена литра, ₸. */
    price: number;
    deduction: boolean;
}

export interface FuelCalcResult {
    liters: number;
    fuel: number;
    /** Общая сумма минус ГСМ. */
    rest: number;
    onHand: number;
    /** Начислено по ГПХ. */
    gross: number;
    opv: number;
    vosms: number;
    so: number;
    /** За счёт компании. */
    ipn: number;
    deductionUsed: number;
    taxes: number;
    /** ГСМ, начисление и ИПН. */
    cost: number;
    soCapped: boolean;
    vosmsCapped: boolean;
}

/** Доля в целых тенге. Проценты целые, поэтому половинки округляются вверх без ошибки дробей. */
const pct = (v: number, p: number) => Math.round((v * p) / 100);

function withheld(gross: number) {
    const opv = pct(gross, OPV);
    const vosms = pct(Math.min(gross, VOSMS_BASE_CAP), VOSMS);
    const so = pct(Math.min(Math.max(0, gross - opv), SO_BASE_CAP), SO);
    return { opv, vosms, so, net: gross - opv - vosms - so };
}

/** Начисление под сумму на руки: формула, а где она не сходится до тенге — из-за пределов или округления — поиском. */
function grossFor(net: number): number {
    const guess = Math.round(net / KEEP);
    if (withheld(guess).net === net) return guess;
    let lo = net;
    let hi = net * 2;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (withheld(mid).net < net) lo = mid;
        else hi = mid;
    }
    for (let g = hi - 5; g <= hi + 5; g++) {
        if (withheld(g).net === net) return g;
    }
    return hi;
}

/** Топливо по километражу, целыми тенге. */
export function fuelOf(km: number, consumption: number, price: number): number {
    return Math.round(((km * consumption) / 100) * price);
}

/** Топливо не меньше суммы — `null`: считать нечего, экран объясняет. */
export function calculateFuel(input: FuelCalcInput): FuelCalcResult | null {
    const fuel = fuelOf(input.km, input.consumption, input.price);
    const rest = input.total - fuel;
    if (!(rest > 0)) return null;
    const onHand = pct(rest, 100 - OPV);
    const gross = grossFor(onHand);
    const w = withheld(gross);
    const deductionUsed = input.deduction ? Math.min(DEDUCTION_2026, onHand) : 0;
    const ipn = pct(onHand - deductionUsed, IPN);
    return {
        liters: (input.km * input.consumption) / 100,
        fuel, rest, onHand, gross,
        opv: w.opv, vosms: w.vosms, so: w.so, ipn, deductionUsed,
        taxes: w.opv + w.vosms + w.so + ipn,
        cost: fuel + gross + ipn,
        soCapped: gross - w.opv > SO_BASE_CAP,
        vosmsCapped: gross > VOSMS_BASE_CAP,
    };
}
