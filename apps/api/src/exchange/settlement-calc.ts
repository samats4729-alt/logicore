/**
 * Расчёт рейса водителя парка (решение владельца 12.10.2026, по калькуляции шефа;
 * дополнено 15.10.2026 по задаче «автоматический расчёт выплат водителям без ИП»).
 *
 * Компания выставляет на бирже базу — сколько водитель получит на руки
 * вместе с топливом; водитель откликается тоже суммой на руки. Налоги,
 * взносы, комиссии и НДС парк досчитывает сверху — получается цена для
 * компании (владелец 15.10: «сверху прибавляется»):
 *
 *  1. топливо — оценка по расстоянию (настройка парка «₸ за км»); водителю
 *     его оплачивают по ходу рейса, по чекам на БИН парка, и оно налогами
 *     не облагается;
 *  2. за работу на руки = сумма водителя − топливо;
 *  3. начисление по ГПХ — такое, чтобы после удержания ОПВ, ВОСМС и ИПН у
 *     водителя осталось ровно «за работу на руки» (обратный расчёт: налог
 *     не считается дважды). ИПН — с дохода за вычетом ОПВ, ВОСМС и того,
 *     что осталось от месячного вычета (он копится по рейсам месяца);
 *  4. СО — парк платит от себя: от начисления за вычетом ОПВ;
 *  5. расход парка = начисление + СО;
 *  6. комиссия LogiCore — % от расхода парка, затем комиссия парка — % от
 *     суммы с комиссией LogiCore (как в калькуляции шефа);
 *  7. цена без НДС = расход парка + обе комиссии + топливо;
 *  8. НДС — только если парк плательщик НДС (ставка из его настроек).
 *
 * Пример шефа: 400 000 на руки, топливо 120 000 → компании 508 437,93 (без НДС).
 *
 * Деньги считаются в целых тиынах: каждая доля округляется до тиына один
 * раз, суммы складываются без погрешности дробей.
 *
 * Пределы взносов (ОПВ, ВОСМС, СО от МЗП) не применяются — открытый вопрос
 * бухгалтеру парка, см. docs/tasks/boss-voice-tasks.md. Ставки задаёт парк.
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
    /** Стандартный вычет по ИПН в месяц: сколько МРП и сам МРП, ₸. */
    deductionMrp: number;
    mrp: number;
    /** НДС, %; 0 или нет — парк не плательщик НДС (так у расчётов до 15.10.2026). */
    vatPct?: number;
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
    /** НДС сверху; 0 — парк не плательщик НДС. */
    vat: number;
    /** Цена для компании, с НДС, если он есть. */
    customerPrice: number;
    /** Этот рейс воспользовался месячным вычетом. */
    deductionApplied: boolean;
    /** Сколько вычета ушло на этот рейс, ₸ (не больше остатка за месяц). */
    deductionAmount: number;
}

/** До тиынов: 1 234,565 → 1 234,57. */
export function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** ₸ → тиыны и обратно. */
const toT = (tenge: number) => Math.round((tenge + Number.EPSILON) * 100);
const fromT = (tiyn: number) => tiyn / 100;

/**
 * Доля суммы в тиынах: процент хранится с точностью до сотых (10 → 1000,
 * 2,5 → 250), умножение — целых чисел, округление до тиына одно.
 */
function share(tiyn: number, pct: number | undefined): number {
    const bp = Math.round((pct ?? 0) * 100);
    return Math.round((tiyn * bp) / 10000);
}

/** Месячный вычет по ИПН целиком, ₸ (2026: 30 × 4 325 = 129 750). */
export function monthlyDeduction(r: SettlementRates): number {
    return money(r.deductionMrp * r.mrp);
}

interface WithholdingsT { opv: number; vosms: number; ipn: number; net: number; used: number }

/** Удержания из начисления (всё в тиынах): что останется на руки и сколько вычета ушло. */
function withholdingsT(gross: number, r: SettlementRates, deduction: number): WithholdingsT {
    const opv = share(gross, r.opvPct);
    const vosms = share(gross, r.vosmsPct);
    const base = Math.max(0, gross - opv - vosms);
    const used = Math.min(Math.max(0, deduction), base);
    const ipn = share(base - used, r.ipnPct);
    return { opv, vosms, ipn, net: gross - opv - vosms - ipn, used };
}

/** Удержания из начисления: что останется на руки. Суммы — в ₸. */
export function withholdings(gross: number, r: SettlementRates, deduction: number) {
    const w = withholdingsT(toT(gross), r, toT(deduction));
    return { opv: fromT(w.opv), vosms: fromT(w.vosms), ipn: fromT(w.ipn), net: fromT(w.net), deductionUsed: fromT(w.used) };
}

/**
 * Начисление (в тиынах), после удержаний из которого на руки остаётся ровно
 * `net`. Зависимость кусочно-линейная (пока доход не превысил вычет, ИПН нет):
 * прикидываем формулой и ищем точное попадание рядом, по тиыну.
 */
function grossForNetT(net: number, r: SettlementRates, deduction: number): number {
    if (net <= 0) return 0;
    const k = 1 - (r.opvPct + r.vosmsPct) / 100;
    const ipn = r.ipnPct / 100;
    let guess = net / k;
    if (k * guess > deduction) guess = (net - ipn * deduction) / (k * (1 - ipn));
    const start = Math.max(0, Math.floor(guess) - 50);
    let firstAbove = -1;
    for (let g = start; g <= start + 100; g++) {
        const got = withholdingsT(g, r, deduction).net;
        if (got === net) return g;
        if (got > net && firstAbove < 0) firstAbove = g;
    }
    // Ровно в тиын не попасть (округления долей) — водителю тиын больше, не меньше.
    return firstAbove >= 0 ? firstAbove : Math.ceil(guess);
}

/** Начисление в ₸, после удержаний из которого на руки остаётся ровно `net`. */
export function grossForNet(net: number, r: SettlementRates, deduction: number): number {
    return fromT(grossForNetT(toT(net), r, toT(deduction)));
}

/** Сколько всего стоит рейс, если водителю на руки `workNet` за работу (всё в тиынах). */
function costsT(workNet: number, fuel: number, r: SettlementRates, deduction: number): Settlement {
    const gross = grossForNetT(workNet, r, deduction);
    const w = withholdingsT(gross, r, deduction);
    const so = share(Math.max(0, gross - w.opv), r.soPct);
    const parkCost = gross + so;
    const platformFee = share(parkCost, r.platformPct);
    const parkFee = share(parkCost + platformFee, r.parkPct);
    const priceNoVat = parkCost + platformFee + parkFee + fuel;
    const vat = share(priceNoVat, r.vatPct);
    return {
        driverTotal: fromT(workNet + fuel),
        fuel: fromT(fuel),
        workNet: fromT(workNet),
        gross: fromT(gross),
        opv: fromT(w.opv),
        vosms: fromT(w.vosms),
        ipn: fromT(w.ipn),
        so: fromT(so),
        parkCost: fromT(parkCost),
        platformFee: fromT(platformFee),
        parkFee: fromT(parkFee),
        vat: fromT(vat),
        customerPrice: fromT(priceNoVat + vat),
        deductionApplied: w.used > 0,
        deductionAmount: fromT(w.used),
    };
}

/**
 * Водитель (или компания базой на бирже) назвал сумму на руки вместе с
 * топливом → цена для компании. `deductionLeft` — сколько месячного вычета
 * у водителя ещё не израсходовано другими рейсами этого месяца, ₸.
 */
export function fromDriverTotal(driverTotal: number, fuel: number, r: SettlementRates, deductionLeft: number): Settlement {
    if (driverTotal <= fuel) {
        throw new RangeError(`Сумма должна быть больше топлива по расчёту — ${Math.round(fuel).toLocaleString('ru-RU')} ₸`);
    }
    return costsT(toT(driverTotal) - toT(fuel), toT(fuel), r, toT(deductionLeft));
}

/**
 * Расчёт отклика при выборе исполнителя — с вычетом, который остался у
 * водителя на сейчас. Пока отклик ждал, у водителя мог случиться другой рейс
 * в этом месяце и забрать вычет. Компания соглашалась на цену из отклика —
 * она не меняется; водителю на руки — тоже. Разница налога ложится на долю
 * парка, как и разница топлива (решение владельца 12.10.2026).
 */
export function withDeductionLeft(s: Settlement, r: SettlementRates, deductionLeft: number): Settlement {
    const fresh = costsT(toT(s.workNet), toT(s.fuel), r, toT(deductionLeft));
    if (fresh.deductionAmount === s.deductionAmount) return s;
    const priceNoVat = toT(s.customerPrice) - toT(s.vat);
    const parkFee = priceNoVat - toT(fresh.parkCost) - toT(fresh.platformFee) - toT(fresh.fuel);
    return { ...fresh, parkFee: fromT(parkFee), vat: s.vat, customerPrice: s.customerPrice };
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
 * `deduction` — вычет, закреплённый за рейсом при выборе исполнителя, ₸.
 */
export function actualPayout(
    driverTotal: number,
    fuelIssued: number,
    fuelReceipts: number,
    r: SettlementRates,
    deduction: number,
) {
    const totalT = toT(driverTotal);
    const receipts = Math.min(Math.max(0, toT(fuelReceipts)), totalT);
    const workNet = totalT - receipts;
    const dedT = toT(deduction);
    const gross = grossForNetT(workNet, r, dedT);
    const w = withholdingsT(gross, r, dedT);
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
