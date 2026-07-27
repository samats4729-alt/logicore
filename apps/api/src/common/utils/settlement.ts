/**
 * Кто кому платит по конкретному рейсу.
 *
 * Это граница доступа для публичных страниц, а не расчёт сумм. Контрагент
 * без учётной записи действует только в свою сторону: выставить счёт может
 * там, где деньги идут ему, а прислать чек — там, где платит он. Всё
 * остальное, включая чужие сделки, сюда не попадает.
 *
 * Правила повторяют разбор сторон в отчёте по взаиморасчётам
 * (`financial-reports.service.ts`): экспедитором считается `forwarderId`,
 * а если его нет — `partnerId`.
 */

export interface SettlementOrderSides {
    customerCompanyId: string | null;
    forwarderId: string | null;
    partnerId: string | null;
    subForwarderId: string | null;
}

const forwarderOf = (order: SettlementOrderSides) => order.forwarderId || order.partnerId;

/**
 * Контрагент — исполнитель на нашем рейсе, платим ему мы.
 *
 * Либо он субподрядчик, а рейс наш, либо он экспедитор, а заказчик — мы.
 */
export function counterpartyIsExecutor(
    order: SettlementOrderSides,
    companyId: string,
    counterpartyId: string,
): boolean {
    const forwarder = forwarderOf(order);

    const theyAreOurSubcontractor =
        order.subForwarderId === counterpartyId && forwarder === companyId;
    const theyCarryForUs =
        forwarder === counterpartyId && order.customerCompanyId === companyId;

    return theyAreOurSubcontractor || theyCarryForUs;
}

/**
 * Контрагент — плательщик по нашему рейсу, деньги идут нам.
 *
 * Либо он заказчик, а везём мы, либо он экспедитор, а субподрядчик — мы.
 */
export function counterpartyIsPayer(
    order: SettlementOrderSides,
    companyId: string,
    counterpartyId: string,
): boolean {
    const forwarder = forwarderOf(order);

    const theyOrderedFromUs =
        order.customerCompanyId === counterpartyId && forwarder === companyId;
    const weCarryForThem =
        forwarder === counterpartyId && order.subForwarderId === companyId;

    return theyOrderedFromUs || weCarryForThem;
}
