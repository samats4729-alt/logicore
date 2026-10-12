/**
 * Расчёт рейса водителя парка (решение владельца 12.10.2026, по калькуляции шефа).
 *
 * Водитель называет сумму «на руки» вместе с топливом: «дайте 400 тысяч и
 * всё» — налоги и отчёты его не касаются. Парк досчитывает сверху то, что
 * обязан заплатить за него по ГПХ, и комиссии — получается цена для компании:
 *
 *  1. топливо — оценка по расстоянию (настройка парка «₸ за км»); водителю
 *     его оплачивают по ходу рейса, по чекам на БИН парка, и оно налогами
 *     не облагается;
 *  2. за работу на руки = сумма водителя − топливо;
 *  3. начисление по ГПХ — такое, чтобы после удержания ОПВ, ВОСМС и ИПН у
 *     водителя осталось ровно «за работу на руки» (ИПН — с дохода за вычетом
 *     ОПВ, ВОСМС и стандартного вычета, если он положен в этом месяце);
 *  4. СО — парк платит от себя: от начисления за вычетом ОПВ;
 *  5. расход парка = начисление + СО;
 *  6. комиссия LogiCore — % от расхода парка, затем комиссия парка — % от
 *     суммы с комиссией LogiCore (как в калькуляции шефа);
 *  7. цена для компании = расход парка + обе комиссии + топливо.
 *
 * Пример шефа: 400 000 на руки, топливо 120 000 → компании 508 437,93.
 *
 * Пределы взносов (ОПВ, ВОСМС, СО от МЗП) не применяются: на суммах рейсов
 * фуры они не достигаются. Ставки задаёт парк со своим бухгалтером.
 */
export interface SettlementRates {
    opvPct: number;
    vosmsPct: number;
    ipnPct: number;
    soPct: number;
    /** Комиссия LogiCore, %. */
    platformPct: number;
    /** Комиссия парка, %. */
    parkPct: number;
    /** Стандартный вычет по ИПН: сколько МРП и сам МРП, ₸. */
    deductionMrp: number;
    mrp: number;
}

export interface Settlement {
    /** На руки вместе с топливом. */
    driverTotal: number;
    fuel: number;
    /** За работу на руки. */
    workNet: number;
    gross: number;
    opv: number;
    vosms: number;
    ipn: number;
    so: number;
    parkCost: number;
    platformFee: number;
    parkFee: number;
    customerPrice: number;
    deductionApplied: boolean;
    deductionAmount: number;
}

/** До тиынов: 1 234,565 → 1 234,57. */
export function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

const pct = (v: number) => v / 100;

/** Удержания из начисления: что останется на руки. */
export function withholdings(gross: number, r: SettlementRates, deduction: number) {
    const opv = money(gross * pct(r.opvPct));
    const vosms = money(gross * pct(r.vosmsPct));
    const ipn = money(Math.max(0, gross - opv - vosms - deduction) * pct(r.ipnPct));
    return { opv, vosms, ipn, net: money(gross - opv - vosms - ipn) };
}

/**
 * Начисление, после удержаний из которого на руки остаётся ровно `net`.
 * Зависимость кусочно-линейная (пока доход не превысил вычет, ИПН нет),
 * поэтому считаем формулой и добиваем округление до тиына.
 */
export function grossForNet(net: number, r: SettlementRates, deduction: number): number {
    if (net <= 0) return 0;
    const k = 1 - pct(r.opvPct) - pct(r.vosmsPct);
    let gross = net / k;
    if (k * gross > deduction) gross = (net - pct(r.ipnPct) * deduction) / (k * (1 - pct(r.ipnPct)));
    gross = money(gross);
    for (let i = 0; i < 20; i++) {
        const diff = money(net - withholdings(gross, r, deduction).net);
        if (diff === 0) break;
        gross = money(gross + (diff > 0 ? 0.01 : -0.01));
    }
    return gross;
}

function deductionOf(r: SettlementRates, applied: boolean): number {
    return applied ? money(r.deductionMrp * r.mrp) : 0;
}

function socialOf(gross: number, opv: number, r: SettlementRates): number {
    return money(Math.max(0, gross - opv) * pct(r.soPct));
}

/** Сколько всего стоит рейс, если водителю на руки `workNet` за работу. */
function costs(workNet: number, fuel: number, r: SettlementRates, deductionApplied: boolean): Settlement {
    const deduction = deductionOf(r, deductionApplied);
    const gross = grossForNet(workNet, r, deduction);
    const w = withholdings(gross, r, deduction);
    const so = socialOf(gross, w.opv, r);
    const parkCost = money(gross + so);
    const platformFee = money(parkCost * pct(r.platformPct));
    const parkFee = money((parkCost + platformFee) * pct(r.parkPct));
    return {
        driverTotal: money(workNet + fuel),
        fuel: money(fuel),
        workNet: money(workNet),
        gross,
        opv: w.opv,
        vosms: w.vosms,
        ipn: w.ipn,
        so,
        parkCost,
        platformFee,
        parkFee,
        customerPrice: money(parkCost + platformFee + parkFee + fuel),
        deductionApplied,
        deductionAmount: deduction,
    };
}

/** Водитель назвал сумму на руки вместе с топливом → цена для компании. */
export function fromDriverTotal(driverTotal: number, fuel: number, r: SettlementRates, deductionApplied: boolean): Settlement {
    if (driverTotal <= fuel) {
        throw new RangeError(`Сумма должна быть больше топлива по расчёту — ${Math.round(fuel).toLocaleString('ru-RU')} ₸`);
    }
    return costs(driverTotal - fuel, fuel, r, deductionApplied);
}

/**
 * Компания назвала цену → сколько водитель получит на руки. Цена для
 * компании остаётся ровно её цифрой: копейки округления — в комиссии парка.
 */
export function fromCustomerPrice(customerPrice: number, fuel: number, r: SettlementRates, deductionApplied: boolean): Settlement {
    if (customerPrice <= fuel) {
        throw new RangeError(`Цена должна быть больше топлива по расчёту — ${Math.round(fuel).toLocaleString('ru-RU')} ₸`);
    }
    const parkCost = (customerPrice - fuel) / ((1 + pct(r.platformPct)) * (1 + pct(r.parkPct)));
    const gross = money(parkCost / (1 + (1 - pct(r.opvPct)) * pct(r.soPct)));
    const deduction = deductionOf(r, deductionApplied);
    // На руки — без тиынов вниз: водителю обещаем целые тенге.
    const workNet = Math.floor(withholdings(gross, r, deduction).net);
    const s = costs(workNet, fuel, r, deductionApplied);
    const parkFee = money(customerPrice - s.parkCost - s.platformFee - s.fuel);
    return { ...s, parkFee, customerPrice: money(customerPrice) };
}

/** Топливо по оценке: расстояние × ₸ за км, целыми тенге. */
export function fuelEstimate(distanceKm: number | null | undefined, fuelPerKm: number): number {
    if (!distanceKm || distanceKm <= 0 || fuelPerKm <= 0) return 0;
    return Math.round(distanceKm * fuelPerKm);
}

/**
 * По итогам рейса: сколько ушло на топливо на самом деле.
 *
 * Итог водителю — как договорились. Налоги — с оплаты за работу, а она
 * «итог минус топливо по чекам»: деньги на топливо без чека на БИН парка —
 * это выплата водителю, и с неё налог есть. Перечислить в конце — итог минус
 * всё, что парк уже дал на топливо (оплатил на заправке или перевёл).
 */
export function actualPayout(
    driverTotal: number,
    fuelIssued: number,
    fuelReceipts: number,
    r: SettlementRates,
    deductionApplied: boolean,
) {
    const receipts = Math.min(Math.max(0, fuelReceipts), driverTotal);
    const workNet = money(driverTotal - receipts);
    const deduction = deductionOf(r, deductionApplied);
    const gross = grossForNet(workNet, r, deduction);
    const w = withholdings(gross, r, deduction);
    return {
        driverTotal: money(driverTotal),
        fuelIssued: money(fuelIssued),
        fuelReceipts: money(receipts),
        workNet,
        gross,
        opv: w.opv,
        vosms: w.vosms,
        ipn: w.ipn,
        so: socialOf(gross, w.opv, r),
        toPay: money(driverTotal - fuelIssued),
    };
}
