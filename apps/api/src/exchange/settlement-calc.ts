/**
 * Расчёт рейса водителя парка без ИП — схема шефа (16.10.2026, с ответами налоговиков).
 *
 * Заказчик выставляет на бирже сумму сделки (пример — 100 000). Дальше:
 *
 *  1. топливо — по расчёту: км × расход на 100 км × цена литра (лето/зима из
 *     настроек парка). Его оплачивает парк; перерасход и экономия — на парке,
 *     сумму водителю они не меняют;
 *  2. оплата водителю за работу = сумма − топливо (73 000);
 *  3. ОПВ 10 % удерживается из неё — водителю на руки остаётся остальное (65 700);
 *  4. ОСМС 2 % — платит парк, от оплаты за работу;
 *  5. СО 5 % — платит парк, от оплаты за работу за вычетом ОПВ;
 *  6. ИПН — платит парк. Облагается оплата за работу минус то, что удержано
 *     у водителя (только ОПВ — налоговики: «вычитать можно только удержанное»),
 *     минус базовый вычет, если водитель написал заявление (копится за месяц).
 *     Шкала прогрессивная: выше порога годового дохода — повышенная ставка;
 *  7. сумма + ОСМС + СО + ИПН → плюс 10 % комиссии со всей суммы (в них
 *     доля LogiCore — 5 %, половина) → плюс НДС, если парк его плательщик.
 *
 * 100 000, топливо 27 000, с вычетом, без НДС → водителю 65 700, заказчику 115 219,50.
 *
 * Деньги считаются в целых тиынах: каждая доля округляется до тиына один раз.
 * Пределы взносов (от МЗП) не применяются — открытый вопрос бухгалтеру парка.
 *
 * Ниже — прежняя схема 12.10.2026 (`actualPayout`): по ней досчитываются
 * выплаты рейсов, зафиксированных до 16.10.
 */
export interface SettlementRates {
    opvPct: number;
    vosmsPct: number;
    ipnPct: number;
    soPct: number;
    /** Доля LogiCore, % от суммы с налогами — входит в комиссию парка. */
    platformPct: number;
    /** Комиссия парка вместе с долей LogiCore, % от суммы с налогами. */
    parkPct: number;
    /** Базовый вычет по ИПН в месяц: сколько МРП и сам МРП, ₸. */
    deductionMrp: number;
    mrp: number;
    /** НДС, %; 0 или нет — парк не плательщик НДС. */
    vatPct?: number;
    /** Повышенная ставка ИПН выше порога годового дохода; нет — шкала плоская. */
    ipnHighPct?: number;
    /** Порог годового облагаемого дохода, МРП. */
    ipnThresholdMrp?: number;
}

/** Что у водителя уже было в этом парке до этого рейса. */
export interface TaxPosition {
    /** Сколько базового вычета осталось в месяце рейса, ₸ (0 — без заявления или всё ушло). */
    deductionLeft: number;
    /** Облагаемый ИПН доход с начала года, ₸ — для прогрессивной шкалы. */
    yearIpnBase: number;
}

export interface Settlement {
    scheme: 2;
    /** Сумма сделки до налогов и комиссии: топливо + оплата за работу. */
    base: number;
    fuel: number;
    /** Оплата водителю за работу (доход по ГПХ). */
    gross: number;
    /** ОПВ — удерживается у водителя. */
    opv: number;
    /** На руки водителю: оплата за работу минус ОПВ. */
    workNet: number;
    /** То же, что workNet: «на руки» — так поле называется в отклике и рейсе. */
    driverTotal: number;
    /** За счёт парка. */
    vosms: number;
    so: number;
    ipn: number;
    /** Облагаемый ИПН доход рейса (копится за год). */
    ipnBase: number;
    /** Сколько парк отдаёт по рейсу: топливо, водителю, в бюджет. */
    parkCost: number;
    /** 10 % со всей суммы: доля LogiCore + доля парка. */
    commission: number;
    platformFee: number;
    parkFee: number;
    vat: number;
    customerPrice: number;
    deductionApplied: boolean;
    deductionAmount: number;
}

/** До тиынов: 1 234,565 → 1 234,57. */
export function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** ₸ → тиыны и обратно. */
const toT = (tenge: number) => Math.round(((tenge ?? 0) + Number.EPSILON) * 100);
const fromT = (tiyn: number) => tiyn / 100;

/**
 * Доля суммы в тиынах: процент хранится с точностью до сотых (10 → 1000,
 * 2,5 → 250), умножение — целых чисел, округление до тиына одно.
 */
function share(tiyn: number, pct: number | undefined): number {
    const bp = Math.round((pct ?? 0) * 100);
    return Math.round((tiyn * bp) / 10000);
}

/** Базовый вычет в месяц целиком, ₸ (2026: 30 × 4 325 = 129 750). */
export function monthlyDeduction(r: SettlementRates): number {
    return money(r.deductionMrp * r.mrp);
}

/** ИПН по шкале: до порога года — обычная ставка, выше — повышенная (всё в тиынах). */
function ipnOf(taxable: number, r: SettlementRates, yearBase: number): number {
    const high = r.ipnHighPct ?? r.ipnPct;
    if (!r.ipnThresholdMrp || high === r.ipnPct) return share(taxable, r.ipnPct);
    const room = Math.max(0, toT(r.ipnThresholdMrp * r.mrp) - yearBase);
    const low = Math.min(taxable, room);
    return share(low, r.ipnPct) + share(taxable - low, high);
}

/** Полный расчёт от оплаты за работу (в тиынах). */
function costsT(gross: number, fuel: number, r: SettlementRates, pos: TaxPosition): Settlement {
    const opv = share(gross, r.opvPct);
    const workNet = gross - opv;
    const vosms = share(gross, r.vosmsPct);
    const so = share(Math.max(0, gross - opv), r.soPct);
    const used = Math.min(Math.max(0, toT(pos.deductionLeft)), Math.max(0, gross - opv));
    const ipnBase = Math.max(0, gross - opv - used);
    const ipn = ipnOf(ipnBase, r, toT(pos.yearIpnBase));
    const base = fuel + gross;
    const subtotal = base + vosms + so + ipn;
    const commission = share(subtotal, r.parkPct);
    const platformFee = Math.min(share(subtotal, r.platformPct), commission);
    const priceNoVat = subtotal + commission;
    const vat = share(priceNoVat, r.vatPct);
    return {
        scheme: 2,
        base: fromT(base),
        fuel: fromT(fuel),
        gross: fromT(gross),
        opv: fromT(opv),
        workNet: fromT(workNet),
        driverTotal: fromT(workNet),
        vosms: fromT(vosms),
        so: fromT(so),
        ipn: fromT(ipn),
        ipnBase: fromT(ipnBase),
        parkCost: fromT(subtotal),
        commission: fromT(commission),
        platformFee: fromT(platformFee),
        parkFee: fromT(commission - platformFee),
        vat: fromT(vat),
        customerPrice: fromT(priceNoVat + vat),
        deductionApplied: used > 0,
        deductionAmount: fromT(used),
    };
}

/** Заказчик выставил сумму сделки → всё остальное. */
export function fromBase(base: number, fuel: number, r: SettlementRates, pos: TaxPosition): Settlement {
    if (base <= fuel) {
        throw new RangeError(`Сумма должна быть больше топлива по расчёту — ${Math.round(fuel).toLocaleString('ru-RU')} ₸`);
    }
    return costsT(toT(base) - toT(fuel), toT(fuel), r, pos);
}

/**
 * Водитель назвал, сколько хочет на руки (без топлива — его оплачивает парк) →
 * оплата за работу такая, чтобы после ОПВ осталось ровно это.
 */
export function fromOnHand(onHand: number, fuel: number, r: SettlementRates, pos: TaxPosition): Settlement {
    if (onHand <= 0) throw new RangeError('Укажите, сколько хотите получить на руки');
    const net = toT(onHand);
    const guess = Math.floor(net / (1 - r.opvPct / 100));
    let found = -1;
    for (let g = Math.max(0, guess - 50); g <= guess + 50; g++) {
        const got = g - share(g, r.opvPct);
        if (got === net) { found = g; break; }
        if (got > net && found < 0) found = g;
    }
    return costsT(found >= 0 ? found : Math.ceil(net / (1 - r.opvPct / 100)), toT(fuel), r, pos);
}

/**
 * Расчёт отклика на момент выбора исполнителя: вычет и годовой доход — как у
 * водителя сейчас (пока отклик ждал, мог пройти другой его рейс). Компания
 * соглашалась на цену из отклика — она не меняется; водителю на руки — тоже.
 * Разница налога ложится на долю парка.
 */
export function withPosition(s: Settlement, r: SettlementRates, pos: TaxPosition): Settlement {
    const fresh = costsT(toT(s.gross), toT(s.fuel), r, pos);
    if (fresh.ipn === s.ipn && fresh.deductionAmount === s.deductionAmount) return s;
    const priceNoVat = toT(s.customerPrice) - toT(s.vat);
    // Доля LogiCore — от согласованной цены, как в отклике; разница налога — только у парка.
    const parkFee = priceNoVat - toT(fresh.parkCost) - toT(s.platformFee);
    return { ...fresh, commission: fromT(parkFee + toT(s.platformFee)), platformFee: s.platformFee, parkFee: fromT(parkFee), vat: s.vat, customerPrice: s.customerPrice };
}

/**
 * Сколько перечислить водителю по итогам рейса (схема 2). На руки — как
 * договорились; топливо — забота парка: деньги, выданные водителю на
 * топливо, засчитываются чеками; не хватает чеков — эта разница из выплаты
 * вычитается, чеков больше выданного — водитель заправлялся за свои, парк
 * их возвращает.
 */
export function payoutOf(onHand: number, fuelIssuedToDriver: number, fuelReceipts: number) {
    return {
        onHand: money(onHand),
        fuelIssued: money(fuelIssuedToDriver),
        fuelReceipts: money(fuelReceipts),
        toPay: fromT(toT(onHand) + toT(fuelReceipts) - toT(fuelIssuedToDriver)),
    };
}

/** Топливо по оценке: расстояние × ₸ за км, целыми тенге. */
export function fuelEstimate(distanceKm: number | null | undefined, fuelPerKm: number): number {
    if (!distanceKm || distanceKm <= 0 || fuelPerKm <= 0) return 0;
    return Math.round(distanceKm * fuelPerKm);
}

/** Топливо на 1 км, ₸: расход на 100 км × цена литра сезона. */
export function fuelPerKmOf(consumptionPer100: number, priceSummer: number, priceWinter: number | null, season: string): number {
    const price = season === 'WINTER' && priceWinter ? priceWinter : priceSummer;
    return money((consumptionPer100 / 100) * price);
}

// ==================== прежняя схема (12.10.2026) ====================

/** Удержания по прежней схеме: ОПВ, ВОСМС и ИПН — из начисления (в тиынах). */
function legacyWithholdingsT(gross: number, r: SettlementRates, deduction: number) {
    const opv = share(gross, r.opvPct);
    const vosms = share(gross, r.vosmsPct);
    const base = Math.max(0, gross - opv - vosms);
    const used = Math.min(Math.max(0, deduction), base);
    const ipn = share(base - used, r.ipnPct);
    return { opv, vosms, ipn, net: gross - opv - vosms - ipn };
}

function legacyGrossForNetT(net: number, r: SettlementRates, deduction: number): number {
    if (net <= 0) return 0;
    const k = 1 - (r.opvPct + r.vosmsPct) / 100;
    const ipn = r.ipnPct / 100;
    let guess = net / k;
    if (k * guess > deduction) guess = (net - ipn * deduction) / (k * (1 - ipn));
    const start = Math.max(0, Math.floor(guess) - 50);
    let firstAbove = -1;
    for (let g = start; g <= start + 100; g++) {
        const got = legacyWithholdingsT(g, r, deduction).net;
        if (got === net) return g;
        if (got > net && firstAbove < 0) firstAbove = g;
    }
    return firstAbove >= 0 ? firstAbove : Math.ceil(guess);
}

/**
 * Выплата рейса по прежней схеме (зафиксирован до 16.10.2026): итог водителю с
 * топливом как договорились; налоги — с итога минус чеки, досчитаны сверху;
 * перечислить — итог минус всё, что дали на топливо.
 */
export function actualPayout(driverTotal: number, fuelIssued: number, fuelReceipts: number, r: SettlementRates, deduction: number) {
    const totalT = toT(driverTotal);
    const receipts = Math.min(Math.max(0, toT(fuelReceipts)), totalT);
    const workNet = totalT - receipts;
    const dedT = toT(deduction);
    const gross = legacyGrossForNetT(workNet, r, dedT);
    const w = legacyWithholdingsT(gross, r, dedT);
    return {
        driverTotal: fromT(totalT),
        fuelIssued: fromT(toT(fuelIssued)),
        fuelReceipts: fromT(receipts),
        workNet: fromT(workNet),
        gross: fromT(gross),
        opv: fromT(w.opv),
        vosms: fromT(w.vosms),
        ipn: fromT(w.ipn),
        so: fromT(share(Math.max(0, gross - w.opv), r.soPct)),
        toPay: fromT(totalT - toT(fuelIssued)),
    };
}
