import { fuelChangeText } from './fuel-history';

/** История цен на топливо (задачи шефа, Q15): что поменялось — словами. */
describe('История цен на топливо', () => {
    const base = { fuelConsumption: 30, fuelPriceSummer: 350, fuelPriceWinter: null as number | null, fuelSeason: 'SUMMER', fuelPerKm: 105 };

    it('поменяли летнюю цену и расход — обе перемены в одной записи', () => {
        expect(fuelChangeText(base, { ...base, fuelPriceSummer: 370, fuelConsumption: 32 }))
            .toBe('летом 350 ₸/л → 370 ₸/л, расход 30 → 32 л/100 км');
    });

    it('впервые задали зимнюю цену', () => {
        expect(fuelChangeText(base, { ...base, fuelPriceWinter: 410 })).toBe('зимой как летом → 410 ₸/л');
    });

    it('топливо не трогали (меняли только налоги) — в историю топлива не пишем', () => {
        expect(fuelChangeText(base, { ...base })).toBe('');
    });
});
