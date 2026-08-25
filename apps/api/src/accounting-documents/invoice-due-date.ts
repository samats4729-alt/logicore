import { asCalendarDay, dueDateFrom, isPaymentAnchor, PaymentAnchor } from '../common/utils/payment-terms';

/**
 * Срок оплаты счёта — из отсрочки, о которой договорились в рейсе.
 *
 * Отсрочка живёт в карточке контрагента, оттуда снимком попадает в рейс, а
 * дальше обрывалась: счёт выставляли — графа «Срок оплаты» оставалась
 * пустой. Заполнить её было некому, потому что счёт создаётся четырьмя
 * разными путями (форма выставления, кнопка в карточке рейса, акт на
 * основании счёта, счёт от контрагента по ссылке), и ни один из них дату не
 * считал. Последствие видно не в счёте, а в платёжном календаре: счёт без
 * срока в него не попадает вовсе, и «когда нам заплатят» снова живёт в
 * голове у бухгалтера.
 *
 * Здесь только правило, без базы, — чтобы его можно было проверить на всех
 * углах, а не только на том, что попался.
 */

/** Условия одного рейса глазами той стороны, которой выставлен счёт. */
export interface OrderPaymentTerms {
    /** Для сообщений человеку: по какому рейсу не хватает данных. */
    orderNumber?: string | null;
    /** Сколько дней отсрочки. `0` — оплата по факту. */
    days: number | null;
    /** От какого события: UNLOAD | INVOICE | ORIGINALS. */
    from: string | null;
    /** День выгрузки по маршруту. */
    unloadAt?: Date | string | null;
    /** День, когда оригиналы накладных дошли до этой стороны. */
    originalsAt?: Date | string | null;
}

export interface InvoiceDueDate {
    /** Срок оплаты. `null` — посчитать нельзя, и это честнее выдуманной даты. */
    dueDate: Date | null;
    /**
     * Почему даты нет — словами для экрана.
     *
     * Пустая графа без объяснения и была исходной жалобой: человек видит
     * пустоту и не знает, это поломка или так и надо.
     */
    dependsOn: string | null;
}

/** Чего ждём, когда событие отсчёта ещё не наступило. */
const WAITING_FOR: Record<PaymentAnchor, string> = {
    UNLOAD: 'в рейсе не проставлена дата выгрузки',
    ORIGINALS: 'ждём оригиналы накладных',
    INVOICE: 'у счёта нет даты',
};

/**
 * Срок оплаты счёта по рейсам, которые в него вошли.
 *
 * Когда рейсов несколько, берётся **самая поздняя** дата. Счёт один, срок
 * оплаты у него тоже один, и он не вправе требовать деньги раньше, чем
 * договорились по каждому из рейсов: по одному отсрочка десять дней, по
 * другому тридцать — платить обязаны через тридцать.
 *
 * Если хотя бы по одному рейсу дату посчитать нельзя, счёт остаётся без
 * срока целиком. Поставить дату по остальным значило бы потребовать оплату
 * раньше срока по тому рейсу, который не посчитался, — а спор с
 * контрагентом дороже, чем пустая графа, которую бухгалтер заполнит руками.
 *
 * @param invoiceDate дата самого счёта — от неё идёт отсрочка «от даты счёта»
 */
export function invoiceDueDate(
    invoiceDate: Date | string | null | undefined,
    orders: OrderPaymentTerms[],
): InvoiceDueDate {
    if (!orders.length) return { dueDate: null, dependsOn: null };

    const invoiceDay = asCalendarDay(invoiceDate);
    let latest: Date | null = null;

    for (const order of orders) {
        if (order.days === null || order.days === undefined || !isPaymentAnchor(order.from)) {
            // Условий нет вовсе — старые рейсы, заведённые до того, как
            // отсрочку стали хранить числом. Ждать тут нечего, заполнять
            // придётся руками.
            return { dueDate: null, dependsOn: 'в рейсе не задана отсрочка' };
        }

        const anchor = order.from === 'INVOICE'
            ? invoiceDay
            : order.from === 'UNLOAD'
                ? asCalendarDay(order.unloadAt)
                : asCalendarDay(order.originalsAt);

        const due = dueDateFrom(anchor, order.days);
        if (!due) return { dueDate: null, dependsOn: WAITING_FOR[order.from] };

        if (!latest || due.getTime() > latest.getTime()) latest = due;
    }

    return { dueDate: latest, dependsOn: null };
}
