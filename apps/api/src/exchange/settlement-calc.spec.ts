import { SettlementRates, TaxPosition, actualPayout, fromBase, fromOnHand, fuelEstimate, fuelPerKmOf, payoutOf, withPosition } from './settlement-calc';

/** Ставки 2026 года по схеме шефа: комиссия 10 % (в ней 5 % LogiCore), ИПН 10 % / 15 % выше 8 500 МРП. */
const RATES: SettlementRates = {
    opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5,
    platformPct: 5, parkPct: 10,
    deductionMrp: 30, mrp: 4325,
    ipnHighPct: 15, ipnThresholdMrp: 8500,
};

/** Водитель написал заявление, вычет в месяце целый, доходов в году ещё нет. */
const WITH_DEDUCTION: TaxPosition = { deductionLeft: 129750, yearIpnBase: 0 };
const NO_DEDUCTION: TaxPosition = { deductionLeft: 0, yearIpnBase: 0 };

/** В тиыны — сверять суммы без дробей. */
const t = (v: number) => Math.round(v * 100);

describe('Расчёт водителя без ИП — схема шефа (16.10.2026)', () => {
    it('100 000, топливо 27 000, с вычетом: водителю 65 700, заказчику 115 219,50', () => {
        const s = fromBase(100000, 27000, RATES, WITH_DEDUCTION);
        expect(s).toMatchObject({
            base: 100000, fuel: 27000, gross: 73000,
            opv: 7300, workNet: 65700, driverTotal: 65700,
            vosms: 1460, so: 3285, ipn: 0,
            parkCost: 104745, commission: 10474.5, platformFee: 5237.25, parkFee: 5237.25,
            vat: 0, customerPrice: 115219.5,
            deductionApplied: true, deductionAmount: 65700,
        });
    });

    it('без заявления на вычет: ИПН 6 570 с 73 000 − ОПВ, заказчику 122 446,50', () => {
        const s = fromBase(100000, 27000, RATES, NO_DEDUCTION);
        expect(s).toMatchObject({ ipn: 6570, ipnBase: 65700, workNet: 65700, customerPrice: 122446.5, deductionApplied: false });
    });

    it('ОСМС и СО не уменьшают облагаемый ИПН доход — их платит парк, у водителя не удерживаются', () => {
        const s = fromBase(100000, 27000, RATES, NO_DEDUCTION);
        expect(s.ipnBase).toBe(s.gross - s.opv);
    });

    it('НДС 16 %: 133 654,62 с вычетом', () => {
        const s = fromBase(100000, 27000, { ...RATES, vatPct: 16 }, WITH_DEDUCTION);
        expect(s.vat).toBe(18435.12);
        expect(s.customerPrice).toBe(133654.62);
    });

    it('все части складываются в цену до тиына; парку остаётся его половина комиссии', () => {
        for (const base of [100000, 123456.78, 450000, 2800000]) {
            const s = fromBase(base, 27000, { ...RATES, vatPct: 16 }, NO_DEDUCTION);
            expect(t(s.fuel) + t(s.workNet) + t(s.opv) + t(s.vosms) + t(s.so) + t(s.ipn)).toBe(t(s.parkCost));
            expect(t(s.parkCost) + t(s.platformFee) + t(s.parkFee) + t(s.vat)).toBe(t(s.customerPrice));
        }
    });

    it('водитель предложил 65 700 на руки — та же сделка, что 100 000 от заказчика', () => {
        const s = fromOnHand(65700, 27000, RATES, WITH_DEDUCTION);
        expect(s).toMatchObject({ base: 100000, gross: 73000, workNet: 65700, customerPrice: 115219.5 });
    });

    it('сумма не больше топлива — понятный отказ', () => {
        expect(() => fromBase(20000, 27000, RATES, NO_DEDUCTION)).toThrow(/больше топлива/);
    });

    describe('прогрессивный ИПН', () => {
        const threshold = 8500 * 4325;

        it('годовой доход уже выше порога — 15 %', () => {
            const s = fromBase(100000, 27000, RATES, { deductionLeft: 0, yearIpnBase: threshold });
            expect(s.ipn).toBe(9855);
        });

        it('рейс переходит порог — до порога 10 %, сверх — 15 %', () => {
            const s = fromBase(100000, 27000, RATES, { deductionLeft: 0, yearIpnBase: threshold - 10000 });
            expect(s.ipn).toBe(1000 + 8355);
        });

        it('повышенная ставка не задана — шкала плоская', () => {
            const s = fromBase(100000, 27000, { ...RATES, ipnHighPct: undefined }, { deductionLeft: 0, yearIpnBase: threshold * 2 });
            expect(s.ipn).toBe(6570);
        });
    });

    describe('вычет копится за месяц', () => {
        it('маленький рейс берёт часть вычета, остаток — следующему', () => {
            const first = fromBase(100000, 27000, RATES, WITH_DEDUCTION);
            const second = fromBase(300000, 27000, RATES, { deductionLeft: 129750 - first.deductionAmount, yearIpnBase: first.ipnBase });
            expect(t(first.deductionAmount) + t(second.deductionAmount)).toBe(t(129750));
        });

        it('пока отклик ждал, вычет ушёл на другой рейс: цена заказчика и сумма водителю те же, разница — в доле парка', () => {
            const offered = fromBase(100000, 27000, RATES, WITH_DEDUCTION);
            const now = withPosition(offered, RATES, NO_DEDUCTION);
            expect(now).toMatchObject({ customerPrice: 115219.5, workNet: 65700, ipn: 6570, deductionAmount: 0 });
            expect(now.parkFee).toBe(5237.25 - 6570);
            expect(now.platformFee).toBe(5237.25);
            expect(t(now.parkCost) + t(now.platformFee) + t(now.parkFee) + t(now.vat)).toBe(t(now.customerPrice));
        });

        it('ничего не поменялось — расчёт отклика как был', () => {
            const offered = fromBase(100000, 27000, RATES, WITH_DEDUCTION);
            expect(withPosition(offered, RATES, WITH_DEDUCTION)).toBe(offered);
        });
    });

    describe('топливо', () => {
        it('расход 30 л на 100 км × 350 ₸ = 105 ₸ за км; зимой — по зимней цене', () => {
            expect(fuelPerKmOf(30, 350, 400, 'SUMMER')).toBe(105);
            expect(fuelPerKmOf(30, 350, 400, 'WINTER')).toBe(120);
            expect(fuelPerKmOf(30, 350, null, 'WINTER')).toBe(105);
        });

        it('по расстоянию — целыми тенге', () => {
            expect(fuelEstimate(1215, 105)).toBe(127575);
            expect(fuelEstimate(null, 105)).toBe(0);
        });

        it('выплата: на руки как договорились; дали на топливо без чека — вычитается; заправился за свои — возвращается', () => {
            expect(payoutOf(65700, 27000, 27000).toPay).toBe(65700);
            expect(payoutOf(65700, 27000, 25000).toPay).toBe(63700);
            expect(payoutOf(65700, 20000, 27000).toPay).toBe(72700);
        });
    });
});

describe('Прежняя схема (рейсы до 16.10.2026) — выплата', () => {
    const OLD: SettlementRates = { opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, platformPct: 5, parkPct: 5, deductionMrp: 30, mrp: 4325 };

    it('топливо ушло по плану — перечислить 280 000', () => {
        expect(actualPayout(400000, 120000, 120000, OLD, 129750)).toMatchObject({ toPay: 280000, workNet: 280000, gross: 337152.78 });
    });

    it('перевели 120 000, а чеков на 100 000 — облагается 300 000, перечислить 280 000', () => {
        const p = actualPayout(400000, 120000, 100000, OLD, 129750);
        expect(p.toPay).toBe(280000);
        expect(p.workNet).toBe(300000);
    });
});
