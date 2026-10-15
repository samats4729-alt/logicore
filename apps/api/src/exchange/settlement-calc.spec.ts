import { SettlementRates, actualPayout, fromDriverTotal, fuelEstimate, grossForNet, withDeductionLeft, withholdings } from './settlement-calc';

/** Ставки 2026 года из калькуляции шефа. */
const RATES: SettlementRates = {
    opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5,
    platformPct: 5, parkPct: 5,
    deductionMrp: 30, mrp: 4325,
};

/** Вычет за месяц целиком: 30 МРП. */
const FULL = 129750;

/** В тиыны — сверять суммы без дробей. */
const t = (v: number) => Math.round(v * 100);

describe('Расчёт рейса водителя парка', () => {
    it('400 000 на руки, топливо 120 000 — компании 508 437,93, как в пересчёте калькуляции шефа', () => {
        const s = fromDriverTotal(400000, 120000, RATES, FULL);
        expect(s).toMatchObject({
            driverTotal: 400000, fuel: 120000, workNet: 280000,
            gross: 337152.78, opv: 33715.28, vosms: 6743.06, ipn: 16694.44,
            so: 15171.88, parkCost: 352324.66,
            platformFee: 17616.23, parkFee: 18497.04,
            vat: 0, customerPrice: 508437.93,
            deductionApplied: true, deductionAmount: 129750,
        });
        // Водитель получает ровно «за работу»: удержания досчитаны сверху.
        expect(t(s.gross) - t(s.opv) - t(s.vosms) - t(s.ipn)).toBe(t(280000));
    });

    it('450 000 на руки, топливо 120 000 — 581 172,30', () => {
        expect(fromDriverTotal(450000, 120000, RATES, FULL).customerPrice).toBe(581172.3);
    });

    it('второй рейс в месяце — вычета нет, цена выше', () => {
        const s = fromDriverTotal(400000, 120000, RATES, 0);
        expect(s.deductionAmount).toBe(0);
        // Было 527 312,49: прежний счёт в дробях терял тиын на округлениях.
        expect(s.customerPrice).toBe(527312.5);
    });

    it('пример из задачи: 100 000 базой, топливо 27 000 — водителю 100 000, налоги и комиссии сверху', () => {
        const s = fromDriverTotal(100000, 27000, RATES, FULL);
        expect(s).toMatchObject({ driverTotal: 100000, workNet: 73000, ipn: 0, customerPrice: 122572.95 });
        // Доход меньше вычета — ИПН 0, но вычет потрачен только на свою часть.
        expect(s.deductionAmount).toBeLessThan(FULL);
        expect(t(s.deductionAmount)).toBe(t(s.gross) - t(s.opv) - t(s.vosms));
    });

    it('НДС: парк плательщик — ставка сверху на всю цену без НДС', () => {
        const noVat = fromDriverTotal(400000, 120000, RATES, FULL);
        const s = fromDriverTotal(400000, 120000, { ...RATES, vatPct: 16 }, FULL);
        expect(s.vat).toBe(81350.07);
        expect(t(s.customerPrice)).toBe(t(noVat.customerPrice) + t(s.vat));
        expect(noVat.vat).toBe(0);
    });

    it('всё сходится до тиына: части цены складываются ровно в цену', () => {
        for (const total of [100000, 123456.78, 400000, 999999.99]) {
            const s = fromDriverTotal(total, 27000, { ...RATES, vatPct: 16 }, FULL);
            expect(t(s.parkCost) + t(s.platformFee) + t(s.parkFee) + t(s.fuel) + t(s.vat)).toBe(t(s.customerPrice));
            expect(t(s.gross) - t(s.opv) - t(s.vosms) - t(s.ipn)).toBe(t(s.workNet));
        }
    });

    describe('вычет копится за месяц', () => {
        it('маленький первый рейс берёт часть вычета, остаток — второму', () => {
            const first = fromDriverTotal(100000, 27000, RATES, FULL);
            const second = fromDriverTotal(400000, 120000, RATES, FULL - first.deductionAmount);
            expect(t(first.deductionAmount) + t(second.deductionAmount)).toBe(t(FULL));
            expect(second.ipn).toBeGreaterThan(fromDriverTotal(400000, 120000, RATES, FULL).ipn);
            expect(second.ipn).toBeLessThan(fromDriverTotal(400000, 120000, RATES, 0).ipn);
        });

        it('вычет кончился — ИПН с полного дохода', () => {
            expect(fromDriverTotal(400000, 120000, RATES, 0)).toMatchObject({ deductionApplied: false, deductionAmount: 0 });
        });

        it('пока отклик ждал, вычет забрал другой рейс: цена компании и сумма водителю те же, разница — в доле парка', () => {
            const offered = fromDriverTotal(400000, 120000, RATES, FULL);
            const now = withDeductionLeft(offered, RATES, 0);
            expect(now.customerPrice).toBe(offered.customerPrice);
            expect(now.driverTotal).toBe(offered.driverTotal);
            expect(now.deductionAmount).toBe(0);
            expect(now.ipn).toBeGreaterThan(offered.ipn);
            expect(now.parkFee).toBeLessThan(offered.parkFee);
            expect(t(now.parkCost) + t(now.platformFee) + t(now.parkFee) + t(now.fuel) + t(now.vat)).toBe(t(now.customerPrice));
        });

        it('вычет не поменялся — расчёт отклика как был', () => {
            const offered = fromDriverTotal(400000, 120000, RATES, FULL);
            expect(withDeductionLeft(offered, RATES, FULL)).toBe(offered);
        });
    });

    it('сумма не больше топлива — понятный отказ', () => {
        expect(() => fromDriverTotal(100000, 120000, RATES, FULL)).toThrow(/больше топлива/);
    });

    it('маленький доход — меньше вычета: ИПН нет', () => {
        const gross = grossForNet(50000, RATES, FULL);
        expect(withholdings(gross, RATES, FULL)).toMatchObject({ ipn: 0, net: 50000 });
    });

    it('топливо по оценке: расстояние × ₸ за км', () => {
        expect(fuelEstimate(1215, 100)).toBe(121500);
        expect(fuelEstimate(null, 100)).toBe(0);
    });

    describe('по итогам рейса', () => {
        it('топливо ушло по плану — перечислить 280 000', () => {
            const p = actualPayout(400000, 120000, 120000, RATES, FULL);
            expect(p).toMatchObject({ toPay: 280000, workNet: 280000, gross: 337152.78 });
        });

        it('заправились на 100 000 — водителю 300 000, налоги больше', () => {
            const p = actualPayout(400000, 100000, 100000, RATES, FULL);
            expect(p.toPay).toBe(300000);
            expect(p.workNet).toBe(300000);
            expect(p.gross).toBeGreaterThan(337152.78);
        });

        it('перевели 120 000, а чеков на 100 000 — 20 000 без чека облагаются, перечислить 280 000', () => {
            const p = actualPayout(400000, 120000, 100000, RATES, FULL);
            expect(p.toPay).toBe(280000);
            expect(p.workNet).toBe(300000);
        });
    });
});
