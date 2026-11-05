import { SOCIAL_LIMITS, Settlement, SettlementRates, TaxPosition, actualPayout, fromBase, fromCustomerPrice, fromOnHand, fuelEstimate, fuelPerKmOf, payoutOf, withPosition } from './settlement-calc';

/** Ставки 2026 года: комиссия 10 % (в ней 5 % LogiCore), ИПН 10 % / 15 % выше 8 500 МРП, пределы взносов. */
const RATES: SettlementRates = {
    opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5,
    platformPct: 5, parkPct: 10,
    deductionMrp: 30, mrp: 4325,
    ipnHighPct: 15, ipnThresholdMrp: 8500,
    ...SOCIAL_LIMITS,
};
const WITH_VAT: SettlementRates = { ...RATES, vatPct: 16 };

/** Водитель написал заявление, вычет в месяце целый, доходов в году ещё нет. */
const WITH_DEDUCTION: TaxPosition = { deductionLeft: 129750, yearIpnBase: 0 };
const NO_DEDUCTION: TaxPosition = { deductionLeft: 0, yearIpnBase: 0 };

/** В тиыны — сверять суммы без дробей. */
const t = (v: number) => Math.round(v * 100);

/** Начисление минус ОПВ, ОСМС и СО — ровно на руки; топливо, начисление и ИПН — себестоимость. */
const expectConsistent = (s: Settlement) => {
    expect(t(s.gross) - t(s.opv) - t(s.vosms) - t(s.so)).toBe(t(s.driverTotal));
    expect(t(s.parkCost)).toBe(t(s.fuel) + t(s.gross) + t(s.ipn));
    expect(t(s.platformFee) + t(s.parkFee)).toBe(t(s.commission));
    expect(t(s.parkCost) + t(s.commission) + t(s.vat)).toBe(t(s.customerPrice));
};

describe('Расчёт водителя без ИП — ИПН за счёт парка (владелец, 04.11.2026)', () => {
    describe('файл Алматы — Астана: ставка 500 000, топливо 130 000', () => {
        const FILE = {
            scheme: 4, base: 500000, fuel: 130000, gross: 398802,
            opv: 39880, vosms: 7976, so: 17946, ipn: 33300, ipnBase: 333000,
            workNet: 333000, driverTotal: 333000,
            parkCost: 562102, commission: 56210, platformFee: 28105.1, parkFee: 28104.9,
            vat: 98930, customerPrice: 717242,
            deductionApplied: false, deductionAmount: 0,
        };

        it('от ставки — все строки как в файле', () => {
            expect(fromBase(500000, 130000, WITH_VAT, NO_DEDUCTION)).toEqual(FILE);
        });

        it('от суммы на руки — та же сделка', () => {
            expect(fromOnHand(333000, 130000, WITH_VAT, NO_DEDUCTION)).toEqual(FILE);
        });

        it('от цены для заказчика — та же сделка', () => {
            expect(fromCustomerPrice(717242, 130000, WITH_VAT, NO_DEDUCTION)).toEqual(FILE);
        });

        it('формулы файла на других суммах дают то же самое', () => {
            const round = (v: number) => Math.round(v + Number.EPSILON);
            // Выше 700 000 начинается предел СО, а файл его не видит.
            for (let base = 150000; base < 700000; base += 13579) {
                const net = round((base - 130000) * 0.9);
                const gross = round(net / 0.835);
                const opv = round(gross * 0.1);
                const so = round((gross - opv) * 0.05);
                const vosms = round(gross * 0.02);
                // Файл сам себя проверяет: иногда округление уводит на тенге, тогда важнее точная сумма на руки.
                if (gross - opv - so - vosms !== net) continue;
                const ipn = round(net * 0.1);
                const cost = 130000 + gross + ipn;
                const noVat = cost + round(cost * 0.1);
                expect(fromBase(base, 130000, WITH_VAT, NO_DEDUCTION)).toMatchObject({
                    driverTotal: net, gross, opv, so, vosms, ipn, parkCost: cost, customerPrice: noVat + round(noVat * 0.16),
                });
            }
        });
    });

    describe('водитель получает ровно оговорённое', () => {
        it('на любой сумме, и там, где формула файла ошибалась', () => {
            // 300 000 в файле давало 300 001; 50 000 — 48 870; 600 000 — 605 561.
            for (const net of [1000, 50000, 70975, 80000, 100000, 300000, 300001, 410872.5, 496825, 497000, 500000, 600000, 800000, 1000000, 2500000]) {
                const s = fromOnHand(net, 27000, WITH_VAT, NO_DEDUCTION);
                expect(s.driverTotal).toBe(net);
                expectConsistent(s);
            }
        });

        it('подряд по всему диапазону сумм', () => {
            for (let net = 20000; net < 2000000; net += 997) {
                expect(fromOnHand(net, 0, RATES, NO_DEDUCTION).driverTotal).toBe(net);
            }
        });

        it('налоги, комиссия и НДС — целыми тенге', () => {
            const s = fromOnHand(300000, 0, WITH_VAT, NO_DEDUCTION);
            for (const sum of [s.opv, s.vosms, s.so, s.ipn, s.commission, s.vat]) expect(Number.isInteger(sum)).toBe(true);
        });

        it('от ставки: на руки — остаток после топлива минус доля ОПВ', () => {
            expect(fromBase(750000, 293475, RATES, NO_DEDUCTION).driverTotal).toBe(410873);
        });

        it('сумма не больше топлива — понятный отказ', () => {
            expect(() => fromBase(20000, 27000, RATES, NO_DEDUCTION)).toThrow(/больше топлива/);
        });

        it('ставки, при которых водителю ничего не остаётся, — понятный отказ, а не зависание', () => {
            expect(() => fromOnHand(100000, 0, { ...RATES, opvPct: 100 }, NO_DEDUCTION)).toThrow(RangeError);
        });
    });

    describe('пределы взносов', () => {
        it('СО — не выше 5 % от 7 МЗП, начисление это учитывает', () => {
            for (const net of [600000, 800000, 1000000]) {
                const s = fromOnHand(net, 0, RATES, NO_DEDUCTION);
                expect(s.so).toBe(29750);
                expect(s.driverTotal).toBe(net);
            }
        });

        it('ОСМС — не выше 2 % от 20 МЗП', () => {
            expect(fromOnHand(2000000, 0, RATES, NO_DEDUCTION).vosms).toBe(34000);
        });

        it('нижнего предела СО нет: для ГПХ отменён с 2026 года', () => {
            const s = fromOnHand(50000, 0, RATES, NO_DEDUCTION);
            expect(s.so).toBe(Math.round((s.gross - s.opv) * 0.05));
            expect(s.so).toBeLessThan(4250);
        });

        it('предел — на месяц: другие рейсы месяца его съедают', () => {
            const part = fromOnHand(600000, 0, RATES, { ...NO_DEDUCTION, monthSoBase: 500000 });
            expect(part.so).toBe(4750);
            expect(part.driverTotal).toBe(600000);
            const spent = fromOnHand(600000, 0, RATES, { ...NO_DEDUCTION, monthSoBase: 595000, monthVosmsBase: 1700000 });
            expect(spent).toMatchObject({ so: 0, vosms: 0, driverTotal: 600000 });
        });
    });

    describe('прогрессивный ИПН', () => {
        const threshold = 8500 * 4325;

        it('годовой доход уже выше порога — 15 %, на руки те же', () => {
            const s = fromOnHand(300000, 0, RATES, { deductionLeft: 0, yearIpnBase: threshold });
            expect(s.ipn).toBe(Math.round(s.ipnBase * 0.15));
            expect(s.driverTotal).toBe(300000);
        });

        it('рейс переходит порог — до порога 10 %, сверх — 15 %', () => {
            const s = fromOnHand(300000, 0, RATES, { deductionLeft: 0, yearIpnBase: threshold - 10000 });
            expect(s.ipn).toBe(Math.round(1000 + (s.ipnBase - 10000) * 0.15));
        });

        it('повышенная ставка не задана — шкала плоская', () => {
            const s = fromOnHand(300000, 0, { ...RATES, ipnHighPct: undefined }, { deductionLeft: 0, yearIpnBase: threshold * 2 });
            expect(s.ipn).toBe(Math.round(s.ipnBase * 0.1));
        });
    });

    describe('вычет копится за месяц', () => {
        it('уменьшает ИПН парка, а не сумму водителю и не начисление', () => {
            const without = fromOnHand(456525, 0, RATES, NO_DEDUCTION);
            const withIt = fromOnHand(456525, 0, RATES, WITH_DEDUCTION);
            expect(withIt).toMatchObject({ driverTotal: 456525, gross: without.gross, deductionApplied: true, deductionAmount: 129750 });
            expect(withIt.ipn).toBeLessThan(without.ipn);
            expect(withIt.customerPrice).toBeLessThan(without.customerPrice);
            expectConsistent(withIt);
        });

        it('маленький рейс берёт часть вычета, ИПН нет, остаток — следующему', () => {
            const first = fromBase(100000, 27000, RATES, WITH_DEDUCTION);
            expect(first).toMatchObject({ driverTotal: 65700, ipn: 0, ipnBase: 0 });
            expect(first.deductionAmount).toBeLessThan(129750);
            const second = fromBase(300000, 27000, RATES, { deductionLeft: 129750 - first.deductionAmount, yearIpnBase: first.ipnBase });
            expect(t(first.deductionAmount) + t(second.deductionAmount)).toBe(t(129750));
        });

        it('пока отклик ждал, вычет ушёл на другой рейс: цена заказчика и сумма водителю те же, разница — в доле парка', () => {
            const offered = fromOnHand(456525, 293475, WITH_VAT, WITH_DEDUCTION);
            const now = withPosition(offered, WITH_VAT, NO_DEDUCTION);
            expect(now).toMatchObject({ scheme: 4, base: offered.base, customerPrice: offered.customerPrice, driverTotal: 456525, gross: offered.gross, platformFee: offered.platformFee, vat: offered.vat, deductionAmount: 0 });
            expect(now.ipn).toBeGreaterThan(offered.ipn);
            expect(now.parkFee).toBeLessThan(offered.parkFee);
            expect(t(now.parkCost) + t(now.platformFee) + t(now.parkFee) + t(now.vat)).toBe(t(now.customerPrice));
        });

        it('ничего не поменялось — расчёт отклика как был', () => {
            const offered = fromOnHand(456525, 293475, WITH_VAT, WITH_DEDUCTION);
            expect(withPosition(offered, WITH_VAT, WITH_DEDUCTION)).toBe(offered);
        });
    });

    describe('от цены для заказчика — своя заявка парка', () => {
        it('цена прежняя — на руки выходит из неё: 1 047 291,52 → 406 354', () => {
            const s = fromCustomerPrice(1047291.52, 293475, WITH_VAT, NO_DEDUCTION);
            expect(s).toMatchObject({ gross: 486651, opv: 48665, vosms: 9733, so: 21899, ipn: 40635, driverTotal: 406354, customerPrice: 1047291.52 });
        });

        it('строки сходятся с ценой до тиына — и с НДС, и без', () => {
            for (const r of [RATES, WITH_VAT]) {
                for (const price of [150000, 400000, 87654.32]) {
                    const s = fromCustomerPrice(price, 12000, r, NO_DEDUCTION);
                    expect(t(s.customerPrice)).toBe(t(price));
                    expect(t(s.fuel) + t(s.gross) + t(s.ipn) + t(s.commission) + t(s.vat)).toBe(t(price));
                    expect(t(s.platformFee) + t(s.parkFee)).toBe(t(s.commission));
                    expect(t(s.gross) - t(s.opv) - t(s.vosms) - t(s.so)).toBe(t(s.driverTotal));
                }
            }
        });

        it('цена не покрывает топливо — понятный отказ', () => {
            expect(() => fromCustomerPrice(20000, 27000, RATES, NO_DEDUCTION)).toThrow(RangeError);
            expect(() => fromCustomerPrice(29000, 27000, RATES, NO_DEDUCTION)).toThrow(/топлив/);
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

describe('Схема 3 (отклики, поданные 03.11.2026): все налоги удержаны из начисления', () => {
    const OFFERED: Settlement = {
        scheme: 3, base: 750000, fuel: 293475, gross: 607486,
        opv: 60749, vosms: 12150, so: 27337, ipn: 50725, ipnBase: 507250,
        workNet: 456525, driverTotal: 456525,
        parkCost: 900961, commission: 90096.1, platformFee: 45048.05, parkFee: 45048.05,
        vat: 158569.14, customerPrice: 1149626.24,
        deductionApplied: false, deductionAmount: 0,
    };

    it('ничего не поменялось — расчёт отклика как был', () => {
        expect(withPosition(OFFERED, WITH_VAT, NO_DEDUCTION)).toBe(OFFERED);
    });

    it('появился вычет: считается по схеме 3, на руки и цена те же, разница — в доле парка', () => {
        const now = withPosition(OFFERED, WITH_VAT, WITH_DEDUCTION);
        expect(now).toMatchObject({ scheme: 3, driverTotal: 456525, customerPrice: 1149626.24, deductionAmount: 129750 });
        expect(now.gross).toBeLessThan(OFFERED.gross);
        expect(now.parkFee).toBeGreaterThan(OFFERED.parkFee);
    });
});

describe('Схема 2 (отклики, поданные до 03.11.2026): у водителя только ОПВ', () => {
    const OFFERED: Settlement = {
        scheme: 2, base: 100000, fuel: 27000, gross: 73000, opv: 7300, workNet: 65700, driverTotal: 65700,
        vosms: 1460, so: 3285, ipn: 0, ipnBase: 0, parkCost: 104745,
        commission: 10474.5, platformFee: 5237.25, parkFee: 5237.25, vat: 0, customerPrice: 115219.5,
        deductionApplied: true, deductionAmount: 65700,
    };
    const OLD_RATES: SettlementRates = { opvPct: 10, vosmsPct: 2, ipnPct: 10, soPct: 5, platformPct: 5, parkPct: 10, deductionMrp: 30, mrp: 4325 };

    it('пока отклик ждал, вычет ушёл на другой рейс: считается по старой схеме, цена та же, разница — в доле парка', () => {
        const now = withPosition(OFFERED, OLD_RATES, NO_DEDUCTION);
        expect(now).toMatchObject({ scheme: 2, customerPrice: 115219.5, workNet: 65700, gross: 73000, ipn: 6570, deductionAmount: 0 });
        expect(now.parkFee).toBe(5237.25 - 6570);
        expect(now.platformFee).toBe(5237.25);
    });

    it('ничего не поменялось — расчёт отклика как был', () => {
        expect(withPosition(OFFERED, OLD_RATES, { deductionLeft: 129750, yearIpnBase: 0 })).toBe(OFFERED);
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
