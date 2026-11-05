/**
 * Калькулятор ГСМ для обычных компаний (шеф, 03.11.2026): логист говорит водителю
 * общую сумму, сколько из неё на руки, на сколько заправиться и сколько удержит
 * ОПВ. Больше ничего: всю схему видит только парк на своём экране, поэтому и
 * остальных налогов в этом коде нет. Ничего не сохраняет и не отправляет.
 */

/** Доля ОПВ, %. На руки — целыми тенге, ОПВ — остаток, чтобы сумма сходилась. */
const OPV_PCT = 10;

export interface FuelCalcInput {
    total: number;
    km: number;
    /** Расход, л на 100 км. */
    consumption: number;
    /** Цена литра, ₸. */
    price: number;
}

export interface FuelCalcResult {
    liters: number;
    fuel: number;
    opv: number;
    onHand: number;
}

/** Топливо по километражу, целыми тенге. */
export function fuelOf(km: number, consumption: number, price: number): number {
    return Math.round(((km * consumption) / 100) * price);
}

/** Топливо не меньше суммы — `null`: считать нечего, экран объясняет. */
export function calculateFuel(input: FuelCalcInput): FuelCalcResult | null {
    const fuel = fuelOf(input.km, input.consumption, input.price);
    const diff = input.total - fuel;
    if (!(diff > 0)) return null;
    const onHand = Math.round((diff * (100 - OPV_PCT)) / 100);
    return { liters: (input.km * input.consumption) / 100, fuel, opv: diff - onHand, onHand };
}
