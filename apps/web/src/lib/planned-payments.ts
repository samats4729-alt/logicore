import dayjs, { Dayjs } from 'dayjs';
import { api } from './api';

/**
 * Платёжный календарь: данные и правила, общие для всех, кто их показывает.
 *
 * Показывают их двое — отдельная страница календаря и плитка на дашборде.
 * Правила у них обязаны быть одни: и группировка по дням, и цвета прихода с
 * расходом, и сокращение сумм. Разъедься они — на дашборде и на странице
 * один и тот же день покажет разное, и человек не поймёт, какому верить.
 */

/**
 * Строка приходит из `/accounting/planned-payments`. Обязательство создаёт
 * выставленный счёт, а не поля заявки, поэтому в строке есть и номер счёта,
 * и рейсы, к которым он привязан (их может быть несколько).
 */
export interface PlannedRow {
    documentId: string;
    invoiceNumber: string;
    orderId: string | null;
    orderNumber: string;
    direction: 'IN' | 'OUT';
    party: string;
    amount: number;
    dueDate: string | null;
    /**
     * Просрочку считает сервер — по календарю Казахстана, а не по часовому
     * поясу браузера.
     */
    isOverdue: boolean;
}

export interface PlannedTotals {
    totalIn: number;
    totalOut: number;
    overdueIn: number;
    overdueOut: number;
}

/**
 * Долг, по которому счёт ещё не выставлен.
 *
 * Пока счёта нет, срок оплаты не начался, и в календаре такому долгу негде
 * встать. Но существовать он не перестаёт: без этого блока и журнал, и
 * календарь показывают только часть картины, а выглядят как вся.
 */
export interface WithoutInvoice {
    count: number;
    totalIn: number;
    totalOut: number;
    items: { orderId: string; orderNumber: string; party: string | null; amountIn: number; amountOut: number }[];
}

/**
 * Весь долг стороны: что уже оформлено счетами и что ещё нет.
 *
 * Считает сервер, здесь только складывается: выставлено плюс неоформленное.
 * Своей формулы тут нет намеренно — «сколько нам должны» обязано совпадать с
 * тем, что показывают реестр и планируемые платежи.
 */
export interface DebtPicture {
    /** Выставлено счетами и не оплачено. */
    invoiced: number;
    /** Долг по сделкам, где счёта ещё нет. */
    notInvoiced: number;
    /** Сколько таких сделок. */
    notInvoicedCount: number;
    /** Просрочено из выставленного. */
    overdue: number;
    /** Всё вместе — то, что обычно называют дебиторкой или кредиторкой. */
    total: number;
}

/** Сторона долга: нам должны или должны мы. */
export type DebtSide = 'IN' | 'OUT';

export function debtPicture(
    totals: PlannedTotals | null,
    withoutInvoice: WithoutInvoice | null,
    side: DebtSide,
): DebtPicture {
    const invoiced = (side === 'IN' ? totals?.totalIn : totals?.totalOut) ?? 0;
    const notInvoiced = (side === 'IN' ? withoutInvoice?.totalIn : withoutInvoice?.totalOut) ?? 0;
    const overdue = (side === 'IN' ? totals?.overdueIn : totals?.overdueOut) ?? 0;
    return {
        invoiced,
        notInvoiced,
        // Сделки считаются по обеим сторонам сразу: в одной и той же сделке
        // может не хватать и счёта заказчику, и счёта от перевозчика.
        notInvoicedCount: withoutInvoice?.count ?? 0,
        overdue,
        total: invoiced + notInvoiced,
    };
}

/** Один день календаря: сколько придёт, сколько уйдёт и чем именно. */
export interface DayBucket {
    in: number;
    out: number;
    items: PlannedRow[];
    overdue: boolean;
}

/**
 * Приход и расход — единственные два цвета в календаре.
 *
 * Тема платформы чёрно-белая, и это осознанное исключение: деньги, которые
 * придут, и деньги, которые уйдут, различаются с одного взгляда.
 */
export const IN_HEX = '#16a34a';
export const OUT_HEX = '#dc2626';

export const WEEKDAYS_SHORT = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
export const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** Порядковый номер дня недели с понедельника: у dayjs неделя с воскресенья. */
export const weekdayIndex = (date: Dayjs) => (date.day() + 6) % 7;

/** Полная сумма — там, где есть место. */
export const moneyKzt = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₸`;

/** Сокращённая — в клетке календаря и в заголовке месяца. */
export function shortMoney(value: number): string {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1).replace('.', ',')} млн`;
    }
    if (value >= 1_000) return `${Math.round(value / 1_000)} тыс`;
    return String(Math.round(value));
}

export async function fetchPlannedPayments(companyId?: string): Promise<{
    rows: PlannedRow[];
    totals: PlannedTotals | null;
    withoutInvoice: WithoutInvoice | null;
}> {
    const res = await api.get('/accounting/planned-payments', {
        // Организация журнала: в холдинге их несколько, и итоги обязаны
        // считаться по той же, по которой отобран список.
        params: companyId ? { companyId } : undefined,
    });
    return {
        rows: res.data?.rows || [],
        totals: res.data?.totals || null,
        withoutInvoice: res.data?.withoutInvoice || null,
    };
}

/**
 * Разложить платежи по дням.
 *
 * Счета без срока оплаты в календарь не попадают — им негде встать. Это не
 * недосмотр, а причина, по которой срок теперь подставляется в счёт сам:
 * без даты обязательство существует, но его не видно.
 */
export function groupByDay(rows: PlannedRow[]): Map<string, DayBucket> {
    const byDay = new Map<string, DayBucket>();
    for (const row of rows) {
        if (!row.dueDate) continue;
        const key = dayjs(row.dueDate).format('YYYY-MM-DD');
        const bucket = byDay.get(key) || { in: 0, out: 0, items: [], overdue: false };
        if (row.direction === 'IN') bucket.in += row.amount; else bucket.out += row.amount;
        bucket.items.push(row);
        bucket.overdue = bucket.overdue || row.isOverdue;
        byDay.set(key, bucket);
    }
    return byDay;
}

/**
 * Сетка месяца: шесть недель с понедельника.
 *
 * Именно шесть, а не сколько получится: иначе при перелистывании высота
 * прыгает и вместе с ней уезжает всё, что стоит ниже.
 */
export function monthGrid(month: Dayjs): Dayjs[] {
    const first = month.startOf('month');
    const start = first.subtract(weekdayIndex(first), 'day');
    return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'));
}

/**
 * День, который стоит открыть при первом заходе.
 *
 * Если на сегодня платежей нет — ближайший, где они есть. Пустая панель при
 * открытии — потраченный впустую экран, а приходят сюда именно с вопросом
 * «когда ближайшая оплата».
 */
export function firstDayToShow(rows: PlannedRow[]): Dayjs | null {
    const dated = rows.filter((row) => row.dueDate).map((row) => dayjs(row.dueDate as string));
    if (!dated.length) return null;

    const today = dayjs();
    if (dated.some((date) => date.isSame(today, 'day'))) return today;

    const ahead = dated.filter((date) => !date.isBefore(today, 'day'))
        .sort((a, b) => a.valueOf() - b.valueOf())[0];
    return ahead ?? dated.sort((a, b) => b.valueOf() - a.valueOf())[0];
}
