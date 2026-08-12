/**
 * Условия расчётов: как они называются на экране.
 *
 * Те же значения, что на сервере (`common/utils/payment-terms.ts`). Здесь
 * только подписи и сборка человеческих строк — считать даты платежей экран
 * не должен, их присылает сервер вместе с заявкой.
 */

export type PaymentAnchor = 'UNLOAD' | 'INVOICE' | 'ORIGINALS';
export type InvoiceTiming = 'AFTER_UNLOAD' | 'AFTER_ORIGINALS' | 'MONTHLY';

/** От какого дня считается отсрочка. */
export const PAYMENT_ANCHORS: { value: PaymentAnchor; label: string; hint: string }[] = [
    { value: 'UNLOAD', label: 'От выгрузки', hint: 'считаем со дня, когда груз сдали' },
    { value: 'ORIGINALS', label: 'От получения оригиналов', hint: 'со дня, когда пришли оригиналы накладных' },
    { value: 'INVOICE', label: 'От даты счёта', hint: 'со дня, когда выставили счёт' },
];

/** Когда мы выставляем счёт заказчику. */
export const INVOICE_TIMINGS: { value: InvoiceTiming; label: string }[] = [
    { value: 'AFTER_UNLOAD', label: 'По факту выгрузки' },
    { value: 'AFTER_ORIGINALS', label: 'После получения оригиналов' },
    { value: 'MONTHLY', label: 'Раз в месяц одним счётом' },
];

const ANCHOR_SHORT: Record<string, string> = {
    UNLOAD: 'от выгрузки',
    ORIGINALS: 'от получения оригиналов',
    INVOICE: 'от даты счёта',
};

export const anchorLabel = (anchor?: string | null): string | null =>
    (anchor ? ANCHOR_SHORT[anchor] ?? null : null);

export const invoiceTimingLabel = (timing?: string | null): string | null =>
    INVOICE_TIMINGS.find((t) => t.value === timing)?.label ?? null;

/**
 * Срок оплаты одной строкой: «15 дней от получения оригиналов».
 *
 * Пусто, когда договорённости нет. Ничего не придумываем: пустое место на
 * экране — это вопрос бухгалтеру, а выдуманный срок — спор с контрагентом.
 */
export function paymentTermsLabel(
    days?: number | null,
    anchor?: string | null,
): string | null {
    if (days === null || days === undefined) return null;
    const from = anchorLabel(anchor);
    if (!from) return null;
    return `${days === 0 ? 'по факту' : `${days} дн.`} ${from}`;
}

/** Одна сторона расчётов — как её отдаёт сервер. */
export interface SettlementSide {
    companyId: string | null;
    name: string | null;
    vatPayer: boolean | null;
    vatRate: number | null;
    days: number | null;
    from: string | null;
    /** Плановая дата платежа, когда день отсчёта уже известен. */
    dueDate: string | null;
    /** Чего ждём, чтобы её посчитать: «выгрузки», «оригиналов накладных». */
    dueDependsOn: string | null;
}

export interface OrderSettlements {
    confirmed: boolean;
    confirmedAt: string | null;
    confirmedByName: string | null;
    /** CARDS — из карточек контрагентов, PERSON — человеком, LEGACY — до правила. */
    source: 'CARDS' | 'PERSON' | 'LEGACY' | null;
    missing: string[];
    customer: SettlementSide;
    carrier: SettlementSide;
    invoiceTiming: string | null;
}

/** НДС стороны словами: «с НДС 16%», «без НДС» или «не выяснено». */
export function vatLabel(payer?: boolean | null, rate?: number | null): string {
    if (payer === null || payer === undefined) return 'не выяснено';
    if (!payer) return 'без НДС';
    return rate ? `с НДС ${rate}%` : 'с НДС';
}
