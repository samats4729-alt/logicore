import { SettlementRates, actualPayout, fromCustomerPrice, fromDriverTotal, fuelEstimate, grossForNet, withholdings } from './settlement-calc';

/** Ставки 2026 года из калькуляции шефа. */
const RATES: SettlementRates = {
    opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5,
    platformPct: 5, parkPct: 5,
    deductionMrp: 30, mrp: 4325,
};

describe('Расчёт рейса водителя парка', () => {
    it('400 000 на руки, топливо 120 000 — компании 508 437,93, как в пересчёте калькуляции шефа', () => {
        const s = fromDriverTotal(400000, 120000, RATES, true);
        expect(s).toMatchObject({
            driverTotal: 400000, fuel: 120000, workNet: 280000,
            gross: 337152.78, opv: 33715.28, vosms: 6743.06, ipn: 16694.44,
            so: 15171.88, parkCost: 352324.66,
            platformFee: 17616.23, parkFee: 18497.04,
            customerPrice: 508437.93,
            deductionApplied: true, deductionAmount: 129750,
        });
        // Водитель получает ровно «за работу»: удержания досчитаны сверху.
        expect(s.gross - s.opv - s.vosms - s.ipn).toBeCloseTo(280000, 2);
    });

    it('450 000 на руки, топливо 120 000 — 581 172,30', () => {
        expect(fromDriverTotal(450000, 120000, RATES, true).customerPrice).toBe(581172.3);
    });

    it('второй рейс в месяце — вычета нет, цена выше', () => {
        const s = fromDriverTotal(400000, 120000, RATES, false);
        expect(s.deductionAmount).toBe(0);
        expect(s.customerPrice).toBe(527312.49);
    });

    it('обратно: компания выставила 508 437,93 — водителю на руки 400 000; цена компании не меняется ни на тиын', () => {
        const s = fromCustomerPrice(508437.93, 120000, RATES, true);
        expect(s.driverTotal).toBe(400000);
        expect(s.customerPrice).toBe(508437.93);
        expect(s.parkCost + s.platformFee + s.parkFee + s.fuel).toBeCloseTo(508437.93, 2);
    });

    it('обратно: круглая цена компании — на руки целыми тенге вниз', () => {
        const s = fromCustomerPrice(500000, 120000, RATES, true);
        expect(Number.isInteger(s.driverTotal)).toBe(true);
        expect(s.customerPrice).toBe(500000);
        expect(fromDriverTotal(s.driverTotal, 120000, RATES, true).customerPrice).toBeLessThanOrEqual(500000);
    });

    it('сумма не больше топлива — понятный отказ', () => {
        expect(() => fromDriverTotal(100000, 120000, RATES, true)).toThrow(/больше топлива/);
    });

    it('маленький доход — меньше вычета: ИПН нет', () => {
        const gross = grossForNet(50000, RATES, 129750);
        expect(withholdings(gross, RATES, 129750)).toMatchObject({ ipn: 0, net: 50000 });
    });

    it('топливо по оценке: расстояние × ₸ за км', () => {
        expect(fuelEstimate(1215, 100)).toBe(121500);
        expect(fuelEstimate(null, 100)).toBe(0);
    });

    describe('по итогам рейса', () => {
        it('топливо ушло по плану — перечислить 280 000', () => {
            const p = actualPayout(400000, 120000, 120000, RATES, true);
            expect(p).toMatchObject({ toPay: 280000, workNet: 280000, gross: 337152.78 });
        });

        it('заправились на 100 000 — водителю 300 000, налоги больше', () => {
            const p = actualPayout(400000, 100000, 100000, RATES, true);
            expect(p.toPay).toBe(300000);
            expect(p.workNet).toBe(300000);
            expect(p.gross).toBeGreaterThan(337152.78);
        });

        it('перевели 120 000, а чеков на 100 000 — 20 000 без чека облагаются, перечислить 280 000', () => {
            const p = actualPayout(400000, 120000, 100000, RATES, true);
            expect(p.toPay).toBe(280000);
            expect(p.workNet).toBe(300000);
        });
    });
});
