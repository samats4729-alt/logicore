/**
 * История цен на топливо парка (задачи шефа, Q15): что поменялось — словами,
 * и что сохранить в журнале действий.
 */
export type FuelRates = { fuelConsumption: number; fuelPriceSummer: number; fuelPriceWinter: number | null; fuelSeason: string; fuelPerKm: number };

/** Что из топлива сохранить в истории. */
export function fuelView(r: FuelRates) {
    return {
        consumption: r.fuelConsumption, priceSummer: r.fuelPriceSummer, priceWinter: r.fuelPriceWinter,
        season: r.fuelSeason, perKm: r.fuelPerKm,
    };
}

/** Что поменялось в топливе — словами для истории; ничего — пустая строка. */
export function fuelChangeText(before: FuelRates, after: FuelRates): string {
    const tg = (v: number | null) => (v == null ? 'как летом' : `${v.toLocaleString('ru-RU')} ₸/л`);
    const parts: string[] = [];
    if (before.fuelPriceSummer !== after.fuelPriceSummer) parts.push(`летом ${tg(before.fuelPriceSummer)} → ${tg(after.fuelPriceSummer)}`);
    if (before.fuelPriceWinter !== after.fuelPriceWinter) parts.push(`зимой ${tg(before.fuelPriceWinter)} → ${tg(after.fuelPriceWinter)}`);
    if (before.fuelConsumption !== after.fuelConsumption) parts.push(`расход ${before.fuelConsumption} → ${after.fuelConsumption} л/100 км`);
    return parts.join(', ');
}
