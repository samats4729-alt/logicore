/**
 * Кто какие деньги по рейсу видит.
 *
 * У экспедитора две цены на одном рейсе: сколько платит заказчик и сколько
 * он сам платит перевозчику. Разница между ними — его заработок, и это
 * самое чувствительное число в компании. Заказчик, увидевший его, приходит
 * на следующие переговоры с готовым требованием скидки.
 *
 * В карточке рейса это скрывалось, а в списке заявок — нет: заказчик
 * открывал свой список и видел обе цены строкой. Поэтому правило вынесено
 * сюда, в одно место, и применяется везде, где заявка уезжает клиенту.
 */

/** Поля, из которых складывается себестоимость исполнителя. */
type ExecutorCostFields = {
    driverCost?: unknown;
    subForwarderPrice?: unknown;
    subForwarderId?: unknown;
    isDriverPaid?: unknown;
    driverPaidAt?: unknown;
    isSubForwarderPaid?: unknown;
    subForwarderPaidAt?: unknown;
    partner?: unknown;
    partnerId?: unknown;
    // Условия расчётов с исполнителем — та же чувствительность, что и сумма.
    // Отсрочка и НДС перевозчика — часть нашей договорённости с ним, и
    // заказчику по ним видно, как устроена наша сторона сделки.
    executorHasVat?: unknown;
    executorVatRate?: unknown;
    carrierPaymentDays?: unknown;
    carrierPaymentFrom?: unknown;
    driverPaymentDate?: unknown;
    driverPaymentCondition?: unknown;
    driverPaymentForm?: unknown;
};

type OrderSides = {
    customerCompanyId?: string | null;
    forwarderId?: string | null;
    subForwarderId?: string | null;
    partnerId?: string | null;
};

/**
 * Компания в этой заявке — только заказчик и никак не исполнитель.
 *
 * Оговорка про исполнителя обязательна: одна и та же компания бывает по
 * рейсу и заказчиком, и экспедитором. Спрятать от неё её же себестоимость
 * значило бы спрятать рейс от того, кто его везёт.
 */
export function isCustomerOnly(order: OrderSides, companyId?: string | null): boolean {
    if (!companyId) return false;
    return order.customerCompanyId === companyId
        && order.forwarderId !== companyId
        && order.partnerId !== companyId
        && order.subForwarderId !== companyId;
}

/** Убрать из заявки себестоимость исполнителя — на месте, как отдаёт Prisma. */
export function hideExecutorCost<T extends ExecutorCostFields>(order: T): T {
    const masked = order as any;
    masked.driverCost = null;
    masked.subForwarderPrice = null;
    masked.subForwarderId = null;
    masked.isDriverPaid = false;
    masked.driverPaidAt = null;
    masked.isSubForwarderPaid = false;
    masked.subForwarderPaidAt = null;
    masked.partner = null;
    masked.executorHasVat = null;
    masked.executorVatRate = null;
    masked.carrierPaymentDays = null;
    masked.carrierPaymentFrom = null;
    masked.driverPaymentDate = null;
    masked.driverPaymentCondition = null;
    masked.driverPaymentForm = null;
    return order;
}

/**
 * Налоговая часть, которую видно контрагенту только после проверки.
 *
 * Заявка появляется у контрагента на платформе сразу — он должен знать, что
 * везёт и куда. А НДС и срок оплаты до проверки бухгалтером — это ещё не
 * условия, а значения по умолчанию: «без НДС» и пустой срок. Показать их
 * контрагенту значит сказать ему неправду и потом переигрывать.
 */
type SettlementFields = {
    hasVat?: unknown;
    vatRate?: unknown;
    executorHasVat?: unknown;
    executorVatRate?: unknown;
    customerPaymentDays?: unknown;
    customerPaymentFrom?: unknown;
    carrierPaymentDays?: unknown;
    carrierPaymentFrom?: unknown;
    customerPaymentDate?: unknown;
    driverPaymentDate?: unknown;
    customerPaymentCondition?: unknown;
    driverPaymentCondition?: unknown;
    settlementsConfirmedAt?: unknown;
};

export function hideUnconfirmedSettlements<T extends SettlementFields>(order: T): T {
    const masked = order as any;
    masked.hasVat = null;
    masked.vatRate = null;
    masked.executorHasVat = null;
    masked.executorVatRate = null;
    masked.customerPaymentDays = null;
    masked.customerPaymentFrom = null;
    masked.carrierPaymentDays = null;
    masked.carrierPaymentFrom = null;
    masked.customerPaymentDate = null;
    masked.driverPaymentDate = null;
    masked.customerPaymentCondition = null;
    masked.driverPaymentCondition = null;
    // Отдельным признаком, чтобы на экране контрагента вместо цифр стояло
    // «условия расчётов уточняются», а не пустота без объяснения.
    masked.settlementsPending = true;
    return order;
}

/**
 * Заявка ведётся этой компанией — она хозяин рейса и его расчётов.
 *
 * Хозяин определяется так же, как в отчёте по взаиморасчётам: экспедитор —
 * `forwarderId`, а если его нет — `partnerId`. Остальные участники видят
 * рейс со своей стороны и чужую кухню видеть не должны.
 */
function isOrderOwner(order: OrderSides, companyId?: string | null): boolean {
    if (!companyId) return false;
    return (order.forwarderId || order.partnerId) === companyId;
}

/** Применить правила видимости к заявке, уезжающей контрагенту. */
export function maskForCustomer<T extends ExecutorCostFields & OrderSides & SettlementFields>(
    order: T,
    companyId?: string | null,
): T {
    if (isCustomerOnly(order, companyId)) hideExecutorCost(order);

    // Налоговую часть скрываем у всех участников, кроме хозяина рейса, пока
    // её не проверил бухгалтер: до проверки там значения по умолчанию, а не
    // условия сделки.
    if (companyId && !isOrderOwner(order, companyId) && !order.settlementsConfirmedAt) {
        hideUnconfirmedSettlements(order);
    }
    return order;
}

/**
 * Что видит водитель: свою оплату, но не цену заказчика.
 *
 * Водителю платит перевозчик или экспедитор, и сколько при этом платит
 * грузовладелец — не его сведения. Раньше список рейсов водителя отдавал
 * обе суммы.
 */
export function hideCustomerPrice<T extends { customerPrice?: unknown }>(order: T): T {
    (order as any).customerPrice = null;
    return order;
}
