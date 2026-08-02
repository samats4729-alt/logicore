import { buildOrderLineDescription, LinePart, OrderForLine } from './order-line-description';

/**
 * Подготовить строки счёта по выбранным рейсам.
 *
 * Просьба бухгалтера: «у Кока-Колы я не выгружаю по одной перевозке, они
 * просят несколько — пять, иногда двадцать». Раньше в счёт попадал один
 * рейс, и добавить второй было нельзя.
 *
 * Здесь из выбранных заявок собирается готовый набор строк: название
 * услуги, расшифровка рейса и сумма. Дальше бухгалтер правит их как
 * обычно — суммы она всё равно меняет («я делю счёт на два»), и запрещать
 * это нельзя.
 */

export interface PreparedLine {
    orderId: string;
    /** Название услуги — то, что стоит в графе «Наименование». */
    name: string;
    /** Расшифровка: маршрут, водитель, дата, машина, номер заявки. */
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    /** Дата услуги — по ней документ попадает в нужный период. */
    serviceDate: Date | null;
}

export interface OrderForInvoice extends OrderForLine {
    id: string;
    /** Сколько выставляем клиенту. */
    customerPrice?: unknown;
    /** Почём нашли машину — нужно для экспедиторской схемы. */
    driverCost?: unknown;
}

/** Приводим сумму к числу: в базе это Decimal, в JSON — строка. */
function toAmount(value: unknown): number {
    if (value == null) return 0;
    const n = Number(value as any);
    return Number.isFinite(n) ? n : 0;
}

export function prepareLinesFromOrders(
    orders: OrderForInvoice[],
    options: {
        service?: string;
        parts?: LinePart[];
        externalLabel?: string;
        /**
         * Чей это счёт. `OUTGOING` — мы выставляем клиенту, сумма его
         * тариф. `INCOMING` — счёт нам от перевозчика, и сумма там его,
         * а не наша. Перепутать значит заплатить перевозчику собственный
         * тариф вместе с наценкой.
         */
        direction?: 'OUTGOING' | 'INCOMING';
    } = {},
): PreparedLine[] {
    return orders.map((order) => ({
        orderId: order.id,
        name: options.service || 'Транспортные услуги',
        description: buildOrderLineDescription(order, options),
        // Перевозка — одна услуга, а не количество тонн или километров:
        // именно так это выглядит в счетах, которые принимает бухгалтерия.
        quantity: 1,
        unit: 'усл',
        unitPrice: options.direction === 'INCOMING'
            ? toAmount(order.driverCost)
            : toAmount(order.customerPrice),
        serviceDate: order.loadingDate ? new Date(order.loadingDate as any) : null,
    }));
}

/**
 * Экспедиторское вознаграждение по рейсу — разница между нашим тарифом и
 * тарифом перевозчика.
 *
 * Со слов владельца: «клиент платит 120, поехал за 100, значит в графе
 * экспедиторские услуги будет 20 000, и эти 20 тысяч уже облагаются
 * 16 процентами, а транспортные услуги как таковые не облагаются».
 *
 * Отрицательной разницы быть не должно: если перевозчику ушло больше, чем
 * взяли с клиента, это убыток по рейсу, а не вознаграждение со знаком
 * минус. В счёт такая строка не попадает — иначе она уменьшит налог на
 * пустом месте.
 */
export function forwardingFee(order: OrderForInvoice): number {
    const revenue = toAmount(order.customerPrice);
    const cost = toAmount(order.driverCost);
    const fee = revenue - cost;
    return fee > 0 ? fee : 0;
}
