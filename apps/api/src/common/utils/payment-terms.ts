/**
 * Условия оплаты: сколько дней отсрочки и от какого дня они идут.
 *
 * До этого срок оплаты жил в заявке свободной строкой — «15 дней», «по факту»,
 * «после оригиналов». Человек такую строку понимает, машина — нет, поэтому
 * плановая дата платежа в системе всегда пустовала, а в договор-заявку
 * печаталось «15 Календарных дней» независимо от того, о чём договорились.
 *
 * Здесь та же договорённость разложена на два ответа: **сколько** дней и
 * **от какого события**. Из них получается и человеческая строка для печатной
 * формы, и настоящая дата, до которой надо заплатить.
 */

/** От какого дня считается отсрочка. */
export type PaymentAnchor = 'UNLOAD' | 'INVOICE' | 'ORIGINALS';

/** Когда мы выставляем счёт заказчику. */
export type InvoiceTiming = 'AFTER_UNLOAD' | 'AFTER_ORIGINALS' | 'MONTHLY';

export const PAYMENT_ANCHORS: PaymentAnchor[] = ['UNLOAD', 'INVOICE', 'ORIGINALS'];
export const INVOICE_TIMINGS: InvoiceTiming[] = ['AFTER_UNLOAD', 'AFTER_ORIGINALS', 'MONTHLY'];

/** Как точка отсчёта звучит в договоре. */
const ANCHOR_IN_DOCUMENT: Record<PaymentAnchor, string> = {
    UNLOAD: 'с момента выгрузки',
    INVOICE: 'с даты выставления счёта',
    ORIGINALS: 'с момента получения оригиналов накладных',
};

/** Как точка отсчёта называется на экране — короче, чем в договоре. */
const ANCHOR_ON_SCREEN: Record<PaymentAnchor, string> = {
    UNLOAD: 'от выгрузки',
    INVOICE: 'от даты счёта',
    ORIGINALS: 'от получения оригиналов',
};

const TIMING_ON_SCREEN: Record<InvoiceTiming, string> = {
    AFTER_UNLOAD: 'по факту выгрузки',
    AFTER_ORIGINALS: 'после получения оригиналов',
    MONTHLY: 'раз в месяц одним счётом',
};

export const isPaymentAnchor = (value: unknown): value is PaymentAnchor =>
    typeof value === 'string' && (PAYMENT_ANCHORS as string[]).includes(value);

export const isInvoiceTiming = (value: unknown): value is InvoiceTiming =>
    typeof value === 'string' && (INVOICE_TIMINGS as string[]).includes(value);

export const anchorLabel = (anchor: unknown): string | null =>
    (isPaymentAnchor(anchor) ? ANCHOR_ON_SCREEN[anchor] : null);

export const invoiceTimingLabel = (timing: unknown): string | null =>
    (isInvoiceTiming(timing) ? TIMING_ON_SCREEN[timing] : null);

/** «календарный день» / «календарных дня» / «календарных дней». */
function calendarDays(days: number): string {
    const tail = days % 100;
    const last = days % 10;
    if (tail > 10 && tail < 20) return `${days} календарных дней`;
    if (last === 1) return `${days} календарный день`;
    if (last >= 2 && last <= 4) return `${days} календарных дня`;
    return `${days} календарных дней`;
}

/**
 * Условие оплаты для печатной формы.
 *
 * Пусто, когда договорённости нет: подставлять «15 дней» за стороны нельзя —
 * этот текст уходит в документ с печатью и подписью.
 */
export function paymentConditionText(
    days: number | null | undefined,
    anchor: unknown,
): string | null {
    if (days === null || days === undefined) return null;
    if (!Number.isFinite(days) || days < 0) return null;
    if (!isPaymentAnchor(anchor)) return null;
    if (days === 0) return `Оплата по факту ${ANCHOR_IN_DOCUMENT[anchor]}.`;
    return `Оплата в течение ${calendarDays(days)} ${ANCHOR_IN_DOCUMENT[anchor]}.`;
}

/** То же одной строкой для экрана: «15 дней от выгрузки». */
export function paymentTermsShort(
    days: number | null | undefined,
    anchor: unknown,
): string | null {
    if (days === null || days === undefined || !isPaymentAnchor(anchor)) return null;
    return `${days === 0 ? 'по факту' : `${days} дн.`} ${ANCHOR_ON_SCREEN[anchor]}`;
}

/**
 * Плановая дата платежа.
 *
 * Дата приходит без времени (`@db.Date`-колонки Prisma отдаёт полуночью UTC),
 * такой же и возвращается: срок оплаты — это день, а не момент.
 */
export function dueDateFrom(
    anchorDate: Date | string | null | undefined,
    days: number | null | undefined,
): Date | null {
    if (!anchorDate || days === null || days === undefined) return null;
    if (!Number.isFinite(days) || days < 0) return null;
    const from = anchorDate instanceof Date ? anchorDate : new Date(anchorDate);
    if (Number.isNaN(from.getTime())) return null;
    return new Date(Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate() + days,
    ));
}

/**
 * Условия расчётов с контрагентом заполнены полностью.
 *
 * «Полностью» — это когда известен налоговый статус и срок оплаты целиком:
 * дней без точки отсчёта не бывает, иначе непонятно, от чего их считать.
 * Пока условия неполные, расчёты по рейсу проверяет человек.
 */
export function termsAreComplete(terms: {
    vatPayer?: boolean | null;
    days?: number | null;
    anchor?: unknown;
}): boolean {
    if (terms.vatPayer === null || terms.vatPayer === undefined) return false;
    if (terms.days === null || terms.days === undefined) return false;
    return isPaymentAnchor(terms.anchor);
}
