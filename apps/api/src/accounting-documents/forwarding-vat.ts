import { forwardingFee, OrderForInvoice } from './prepare-lines-from-orders';

/**
 * Экспедиторская схема НДС.
 *
 * Со слов владельца: «экспедиторские услуги — это разница суммы между
 * нашим тарифом и тарифом перевозчика. Клиент платит 120, поехал за 100 —
 * в графе экспедиторские услуги будет 20 000, и эти 20 тысяч уже по 16
 * процентам считаются. А транспортные услуги как таковые не облагаются».
 *
 * Так работает посредническая схема: экспедитор перевыставляет перевозку
 * как есть, а его собственный оборот — только вознаграждение. Налог
 * начисляется на него, а не на всю сумму рейса.
 *
 * ЭТО РЕЖИМ КОМПАНИИ, А НЕ ПРАВИЛО ПЛАТФОРМЫ. У кого-то весь оборот с
 * НДС, кто-то не плательщик, кто-то работает по обычной схеме. Поэтому
 * расчёт лежит отдельно и включается осознанно.
 *
 * Здесь только арифметика, без записи в базу: её проще всего сверить с
 * бухгалтером на живом счёте, что и надо сделать до включения режима.
 */

export interface ForwardingLine {
    /** Что везли — строка с расшифровкой рейса. */
    description: string;
    /** Сколько выставляем клиенту за перевозку. */
    transportAmount: number;
    /** Вознаграждение: разница между нашим тарифом и тарифом перевозчика. */
    feeAmount: number;
}

export interface ForwardingTotals {
    /** Перевозка — идёт без НДС. */
    transportTotal: number;
    /** Вознаграждение — облагается. */
    feeTotal: number;
    /** Налог с вознаграждения. */
    vatAmount: number;
    /** Всего к оплате. */
    total: number;
    vatRate: number;
}

/** Округление до тиына: в счёте не бывает долей копейки. */
function money(value: number): number {
    return Math.round(value * 100) / 100;
}

export function forwardingLines(orders: OrderForInvoice[], descriptions: string[]): ForwardingLine[] {
    return orders.map((order, i) => ({
        description: descriptions[i] ?? '',
        transportAmount: money(Number(order.customerPrice ?? 0) - forwardingFee(order)),
        feeAmount: money(forwardingFee(order)),
    }));
}

/**
 * Итоги счёта по экспедиторской схеме.
 *
 * Что важно и легко сделать неправильно: НДС считается ОТ вознаграждения
 * сверху, а не выделяется из него. Клиент платит тариф плюс налог с
 * разницы — если налог выделять внутри, экспедитор недополучит его из
 * собственного вознаграждения.
 */
export function forwardingTotals(lines: ForwardingLine[], vatRate: number): ForwardingTotals {
    const transportTotal = money(lines.reduce((s, l) => s + l.transportAmount, 0));
    const feeTotal = money(lines.reduce((s, l) => s + l.feeAmount, 0));
    const vatAmount = money((feeTotal * vatRate) / 100);

    return {
        transportTotal,
        feeTotal,
        vatAmount,
        total: money(transportTotal + feeTotal + vatAmount),
        vatRate,
    };
}
