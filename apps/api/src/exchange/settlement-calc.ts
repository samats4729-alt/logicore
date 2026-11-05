/**
 * Расчёт рейса водителя парка без ИП (владелец, 04.11.2026, файл
 * «raschet_almaty_astana_gph_komissiya_nds»; схема 4).
 *
 * ОПВ, ОСМС и СО удерживаются из начисления по ГПХ, ИПН — за счёт парка:
 *
 *  1. остаток = ставка за рейс − топливо. Топливо — по расчёту: км × расход на
 *     100 км × цена литра. Его оплачивает парк; перерасход и экономия — на
 *     парке, сумму водителю они не меняют;
 *  2. на руки = остаток минус доля ОПВ, целыми тенге;
 *  3. начисление по ГПХ — такое, чтобы после ОПВ, ОСМС и СО осталось ровно «на
 *     руки». Пределы взносов учтены: формула из файла их не видит и на больших
 *     суммах давала бы водителю больше оговорённого;
 *  4. ОПВ 10 % от начисления;
 *  5. ОСМС 2 % от начисления (база не выше 20 МЗП в месяц);
 *  6. СО 5 % от начисления минус ОПВ (база не выше 7 МЗП в месяц). Нижнего
 *     предела нет: для ГПХ его отменили с 2026 года;
 *  7. ИПН от начисления минус ОПВ, ОСМС, СО и базовый вычет, если водитель
 *     написал заявление. Не удерживается: это расход парка. Шкала прогрессивная:
 *     выше порога годового дохода — повышенная ставка;
 *  8. себестоимость = топливо + начисление + ИПН → плюс 10 % комиссии (в них
 *     доля LogiCore — 5 %) → плюс НДС, если парк его плательщик.
 *
 * Ставка 500 000, топливо 130 000 → на руки 333 000, начислено 398 802, ОПВ
 * 39 880, ОСМС 7 976, СО 17 946, ИПН 33 300, себестоимость 562 102, комиссия
 * 56 210, НДС 16 % 98 930, заказчику 717 242.
 *
 * Налоги, комиссия и НДС — целыми тенге, как в файле. Деньги считаются в целых
 * тиынах.
 *
 * Ниже — прежние схемы, по ним досчитываются уже поданные отклики и рейсы:
 * схема 3 (03.11.2026: на руки = ставка − топливо, все налоги удержаны из
 * начисления), схема 2 (16.10.2026: у водителя только ОПВ, остальное парк платит
 * сам) и схема 1 (12.10.2026, `actualPayout`).
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
    /** МЗП, ₸, и пределы базы взносов в месяц, в МЗП. Нет — без предела (снимки ставок прежних рейсов). */
    mzp?: number;
    soCapMzp?: number;
    vosmsCapMzp?: number;
}

/** МЗП 2026 года и пределы взносов. Меняются законом раз в год — тогда и здесь. */
export const SOCIAL_LIMITS = { mzp: 85000, soCapMzp: 7, vosmsCapMzp: 20 };

/** Что у водителя уже было в этом парке до этого рейса. */
export interface TaxPosition {
    /** Сколько базового вычета осталось в месяце рейса, ₸ (0 — без заявления или всё ушло). */
    deductionLeft: number;
    /** Облагаемый ИПН доход с начала года, ₸ — для прогрессивной шкалы. */
    yearIpnBase: number;
    /** База СО и ОСМС по другим рейсам месяца, ₸: предел взносов — на месяц у одного парка. */
    monthSoBase?: number;
    monthVosmsBase?: number;
}

export interface Settlement {
    /** 4 — ИПН за счёт парка (04.11.2026); 3 — все налоги удержаны (03.11.2026); 2 — у водителя только ОПВ (16.10.2026). */
    scheme: 2 | 3 | 4;
    /** Ставка за рейс. Схема 4: топливо + на руки до доли ОПВ; схема 3: топливо + на руки; схема 2: топливо + оплата за работу. */
    base: number;
    fuel: number;
    /** Начислено по ГПХ — доход водителя. */
    gross: number;
    /** ОПВ. */
    opv: number;
    /** На руки водителю. */
    workNet: number;
    /** То же, что workNet: «на руки» — так поле называется в отклике и рейсе. */
    driverTotal: number;
    /** Схема 4: ОСМС и СО удержаны, ИПН за счёт парка; схема 3: все удержаны; схема 2: все за счёт парка. */
    vosms: number;
    so: number;
    ipn: number;
    /** Облагаемый ИПН доход рейса (копится за год). */
    ipnBase: number;
    /** Себестоимость рейса: топливо, начисление и ИПН (схема 3: без ИПН; схема 2: топливо, оплата и налоги парка). */
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

/** Доля суммы в тиынах, округлённая до целого тенге: налоги платятся целыми. */
function shareTenge(tiyn: number, pct: number | undefined): number {
    const bp = Math.round((pct ?? 0) * 100);
    return Math.round((tiyn * bp) / 1000000) * 100;
}

/** Сколько базы взноса осталось в месяце, в тиынах: нет предела — вся. */
function capped(amount: number, capMzp: number | undefined, mzp: number | undefined, used: number | undefined): number {
    if (!capMzp || !mzp) return amount;
    return Math.min(amount, Math.max(0, toT(capMzp * mzp) - toT(used ?? 0)));
}

/** ОПВ, ОСМС и СО с начисления и что после них остаётся, всё в тиынах. */
function contributionsT(gross: number, r: SettlementRates, pos: TaxPosition) {
    const opv = shareTenge(gross, r.opvPct);
    const vosms = shareTenge(capped(gross, r.vosmsCapMzp, r.mzp, pos.monthVosmsBase), r.vosmsPct);
    const so = shareTenge(capped(Math.max(0, gross - opv), r.soCapMzp, r.mzp, pos.monthSoBase), r.soPct);
    return { opv, vosms, so, rest: Math.max(0, gross - opv - vosms - so) };
}

/** ИПН с остатка после взносов: вычет, если есть, и шкала года (всё в тиынах). */
function ipnAfterT(rest: number, r: SettlementRates, pos: TaxPosition) {
    const used = Math.min(Math.max(0, toT(pos.deductionLeft)), rest);
    const ipnBase = rest - used;
    return { used, ipnBase, ipn: Math.round(ipnOf(ipnBase, r, toT(pos.yearIpnBase)) / 100) * 100 };
}

/** Налоги с начисления, когда удержаны все четыре (схема 3), всё в тиынах. */
function withheldT(gross: number, r: SettlementRates, pos: TaxPosition) {
    const c = contributionsT(gross, r, pos);
    const i = ipnAfterT(c.rest, r, pos);
    return { ...c, ...i, total: c.opv + c.vosms + c.so + i.ipn };
}

/**
 * Наименьшее начисление, после вычетов из которого остаётся ровно net.
 *
 * Налоги — целые тенге, поэтому начисление отличается от «на руки» на целое
 * число тенге: перебираем только такие суммы. С каждым шагом «на руки» растёт
 * не больше чем на тенге, поэтому нужная сумма не перескакивается; налоги чуть
 * скачут от округления — от найденного места смотрим соседние.
 */
function grossForNetT(net: number, netOf: (gross: number) => number): number {
    if (net <= 0) return 0;
    let lo = net;
    let step = Math.max(100, Math.ceil(net / 100) * 100);
    let hi = net + step;
    for (let i = 0; netOf(hi) < net; i++) {
        if (i > 40) throw new RangeError('Налоги в настройках парка не оставляют водителю ничего — проверьте ставки');
        step *= 2;
        hi = net + step;
    }
    while (hi - lo > 100) {
        const mid = lo + Math.floor((hi - lo) / 200) * 100;
        if (netOf(mid) < net) lo = mid;
        else hi = mid;
    }
    for (let g = Math.max(net, hi - 500); g <= hi + 500; g += 100) {
        if (netOf(g) === net) return g;
    }
    return hi;
}

/**
 * Начисление под сумму на руки (схема 4): формула файла, а где она не сходится
 * до тенге — из-за пределов взносов или округления — поиском.
 */
function grossForOnHandT(net: number, r: SettlementRates, pos: TaxPosition): number {
    const netOf = (g: number) => contributionsT(g, r, pos).rest;
    const keep = 1 - (r.opvPct + r.vosmsPct + (r.soPct * (100 - r.opvPct)) / 100) / 100;
    const guess = keep > 0 ? Math.round(net / 100 / keep) * 100 : 0;
    return guess > 0 && netOf(guess) === net ? guess : grossForNetT(net, netOf);
}

/** Ставка за рейс из суммы на руки: топливо и остаток, из которого вычли долю ОПВ. */
function baseOfT(net: number, fuel: number, r: SettlementRates): number {
    return fuel + (r.opvPct < 100 ? Math.round(net / (100 - r.opvPct)) * 100 : net);
}

/** Полный расчёт от начисления (схема 4, в тиынах). Ставка не задана — из суммы на руки. */
function fromGrossT(gross: number, fuel: number, r: SettlementRates, pos: TaxPosition, base?: number): Settlement {
    const c = contributionsT(gross, r, pos);
    const i = ipnAfterT(c.rest, r, pos);
    const subtotal = fuel + gross + i.ipn;
    const commission = shareTenge(subtotal, r.parkPct);
    const platformFee = Math.min(share(subtotal, r.platformPct), commission);
    const priceNoVat = subtotal + commission;
    const vat = shareTenge(priceNoVat, r.vatPct);
    return {
        scheme: 4,
        base: fromT(base ?? baseOfT(c.rest, fuel, r)),
        fuel: fromT(fuel),
        gross: fromT(gross),
        opv: fromT(c.opv),
        workNet: fromT(c.rest),
        driverTotal: fromT(c.rest),
        vosms: fromT(c.vosms),
        so: fromT(c.so),
        ipn: fromT(i.ipn),
        ipnBase: fromT(i.ipnBase),
        parkCost: fromT(subtotal),
        commission: fromT(commission),
        platformFee: fromT(platformFee),
        parkFee: fromT(commission - platformFee),
        vat: fromT(vat),
        customerPrice: fromT(priceNoVat + vat),
        deductionApplied: i.used > 0,
        deductionAmount: fromT(i.used),
    };
}

/** Схема 3 (03.11.2026) — от начисления, в тиынах: для откликов, поданных до 04.11.2026. */
function allWithheldT(gross: number, fuel: number, r: SettlementRates, pos: TaxPosition): Settlement {
    const w = withheldT(gross, r, pos);
    const net = gross - w.total;
    const subtotal = fuel + gross;
    const commission = share(subtotal, r.parkPct);
    const platformFee = Math.min(share(subtotal, r.platformPct), commission);
    const priceNoVat = subtotal + commission;
    const vat = share(priceNoVat, r.vatPct);
    return {
        scheme: 3,
        base: fromT(fuel + net),
        fuel: fromT(fuel),
        gross: fromT(gross),
        opv: fromT(w.opv),
        workNet: fromT(net),
        driverTotal: fromT(net),
        vosms: fromT(w.vosms),
        so: fromT(w.so),
        ipn: fromT(w.ipn),
        ipnBase: fromT(w.ipnBase),
        parkCost: fromT(subtotal),
        commission: fromT(commission),
        platformFee: fromT(platformFee),
        parkFee: fromT(commission - platformFee),
        vat: fromT(vat),
        customerPrice: fromT(priceNoVat + vat),
        deductionApplied: w.used > 0,
        deductionAmount: fromT(w.used),
    };
}

/** Схема 2 (16.10.2026) — от оплаты за работу, в тиынах: для откликов, поданных до 03.11.2026. */
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

/** Заказчик выставил ставку за рейс → всё остальное: на руки — ставка минус топливо и доля ОПВ. */
export function fromBase(base: number, fuel: number, r: SettlementRates, pos: TaxPosition): Settlement {
    if (base <= fuel) {
        throw new RangeError(`Сумма должна быть больше топлива по расчёту — ${Math.round(fuel).toLocaleString('ru-RU')} ₸`);
    }
    const net = shareTenge(toT(base) - toT(fuel), 100 - r.opvPct);
    return fromGrossT(grossForOnHandT(net, r, pos), toT(fuel), r, pos, toT(base));
}

/**
 * Цена для заказчика уже есть → сколько из неё топливо, водителю, налоги и
 * комиссия. Это своя заявка парка: логист договорился с заказчиком о сумме,
 * а водитель парка везёт без ИП (владелец, 29.10.2026: «все расчёты без ИП
 * должны быть в заявке»).
 *
 * Обратный ход `fromBase`: наибольшее начисление в целых тенге, при котором
 * цена не выше заданной. Остаток от округления — доле парка, чтобы строки
 * расчёта сходились с ценой заявки до тиына.
 */
export function fromCustomerPrice(price: number, fuel: number, r: SettlementRates, pos: TaxPosition): Settlement {
    const total = toT(price);
    const fuelT = toT(fuel);
    if (total <= 0 || toT(fromGrossT(0, fuelT, r, pos).customerPrice) > total) {
        throw new RangeError(`Цена для заказчика меньше топлива с комиссией — топливо по расчёту ${Math.round(fuel).toLocaleString('ru-RU')} ₸`);
    }
    let lo = 0;
    let hi = Math.floor(total / 100);
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (toT(fromGrossT(mid * 100, fuelT, r, pos).customerPrice) <= total) lo = mid;
        else hi = mid - 1;
    }
    const s = fromGrossT(lo * 100, fuelT, r, pos);
    const rest = total - toT(s.customerPrice);
    if (!rest) return s;
    return {
        ...s,
        commission: fromT(toT(s.commission) + rest),
        parkFee: fromT(toT(s.parkFee) + rest),
        customerPrice: fromT(total),
    };
}

/** Водитель назвал, сколько хочет на руки (без топлива — его оплачивает парк) → начисление под эту сумму. */
export function fromOnHand(onHand: number, fuel: number, r: SettlementRates, pos: TaxPosition): Settlement {
    if (onHand <= 0) throw new RangeError('Укажите, сколько хотите получить на руки');
    return fromGrossT(grossForOnHandT(toT(onHand), r, pos), toT(fuel), r, pos);
}

/**
 * Расчёт отклика на момент выбора исполнителя: вычет и годовой доход — как у
 * водителя сейчас (пока отклик ждал, мог пройти другой его рейс). Компания
 * соглашалась на цену из отклика — она не меняется; водителю на руки — тоже.
 * Разница налога ложится на долю парка.
 */
export function withPosition(s: Settlement, r: SettlementRates, pos: TaxPosition): Settlement {
    const fresh = s.scheme === 4
        ? fromGrossT(grossForOnHandT(toT(s.driverTotal), r, pos), toT(s.fuel), r, pos, toT(s.base))
        : s.scheme === 3
            ? allWithheldT(grossForNetT(toT(s.driverTotal), (g) => g - withheldT(g, r, pos).total), toT(s.fuel), r, pos)
            : costsT(toT(s.gross), toT(s.fuel), r, pos);
    if (fresh.gross === s.gross && fresh.ipn === s.ipn && fresh.deductionAmount === s.deductionAmount) return s;
    const priceNoVat = toT(s.customerPrice) - toT(s.vat);
    // Доля LogiCore — от согласованной цены, как в отклике; разница налога — только у парка.
    const parkFee = priceNoVat - toT(fresh.parkCost) - toT(s.platformFee);
    return { ...fresh, commission: fromT(parkFee + toT(s.platformFee)), platformFee: s.platformFee, parkFee: fromT(parkFee), vat: s.vat, customerPrice: s.customerPrice };
}

/**
 * Сколько перечислить водителю по итогам рейса (схемы 2, 3 и 4). На руки — как
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

/** Литры на маршрут по расходу на 100 км, целыми; нет расстояния — нет и литров. */
export function litersFor(distanceKm: number | null | undefined, consumptionPer100: number): number | null {
    if (!distanceKm || distanceKm <= 0 || !(consumptionPer100 > 0)) return null;
    return Math.round((distanceKm * consumptionPer100) / 100);
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
