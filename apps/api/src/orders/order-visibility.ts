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
    return order;
}

/** Применить правило к заявке, если компания в ней только заказчик. */
export function maskForCustomer<T extends ExecutorCostFields & OrderSides>(
    order: T,
    companyId?: string | null,
): T {
    return isCustomerOnly(order, companyId) ? hideExecutorCost(order) : order;
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
