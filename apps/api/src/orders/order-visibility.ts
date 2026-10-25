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
    carrierOriginalsAt?: unknown;
    driverPaymentDate?: unknown;
    driverPaymentCondition?: unknown;
    driverPaymentForm?: unknown;
};

export type OrderSides = {
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

/**
 * Компания в этой заявке — только исполнитель: перевозчик (парк) или
 * субподрядчик, но не экспедитор и не заказчик. Ей своя ставка, а сколько
 * заказчик платит экспедитору — не её сведения (задачи шефа, P10: «парк не
 * видит, сколько заказчик платит экспедитору»).
 */
export function isExecutorOnly(order: OrderSides, companyId?: string | null): boolean {
    if (!companyId) return false;
    return (order.partnerId === companyId || order.subForwarderId === companyId)
        && order.forwarderId !== companyId
        && order.customerCompanyId !== companyId;
}

/** Поля сделки экспедитора с заказчиком: цена, оплата, условия. */
type CustomerSideFields = {
    customerPrice?: unknown;
    customerPriceBase?: unknown;
    isCustomerPaid?: unknown;
    customerPaidAt?: unknown;
    customerPaymentDays?: unknown;
    customerPaymentFrom?: unknown;
    customerPaymentDate?: unknown;
    customerPaymentCondition?: unknown;
    hasVat?: unknown;
    vatRate?: unknown;
};

/**
 * Компания везёт рейс как перевозчик (`partnerId`), а ведёт его экспедитор:
 * парк с биржи или фирма, которой рейс передали.
 */
export function isPartnerExecutor(order: OrderSides, companyId?: string | null): boolean {
    return !!companyId && order.partnerId === companyId
        && !!order.forwarderId && order.forwarderId !== companyId
        && order.customerCompanyId !== companyId;
}

/**
 * Заявка глазами перевозчика: его заказчик — экспедитор, выручка — его
 * ставка (`driverCost`), НДС и отсрочка — его условия.
 *
 * Бухгалтерия считала перевозчика хозяином рейса (`partnerId` — «если нет
 * экспедитора»), и парк в реестре, журнале доходов, на дашборде и даже в
 * акте выполненных работ видел цену, которую экспедитору платит его
 * заказчик, — чужую сделку, да ещё как свою выручку (владелец, 25.10.2026:
 * парк видит свои расчёты по перевозке, а не сделку экспедитора).
 *
 * Возвращается копия: строку из базы дальше могут считать по-прежнему.
 * Остальным компаниям заявка отдаётся как есть.
 */
export function asExecutorSees<T>(order: T, companyId?: string | null): T {
    const o = order as any;
    if (!isPartnerExecutor(o, companyId)) return order;
    const view: any = { ...o };
    const take = (to: string, from: string) => { if (from in o) view[to] = o[from]; };
    take('customerPrice', 'driverCost');
    take('customerPriceBase', 'driverCostBase');
    take('currency', 'driverCostCurrency');
    take('hasVat', 'executorHasVat');
    take('vatRate', 'executorVatRate');
    take('customerPaymentDays', 'carrierPaymentDays');
    take('customerPaymentFrom', 'carrierPaymentFrom');
    take('customerPaymentDate', 'driverPaymentDate');
    take('customerPaymentCondition', 'driverPaymentCondition');
    take('customerPaymentForm', 'driverPaymentForm');
    take('isCustomerPaid', 'isDriverPaid');
    take('customerPaidAt', 'driverPaidAt');
    // Заказчик перевозчика — экспедитор; сам перевозчик — хозяин своей стороны.
    view.customerCompanyId = o.forwarderId;
    // Нет в выборке экспедитора — не оставляем на его месте заказчика
    // экспедитора: это чужой клиент, а не контрагент перевозчика.
    if ('customerCompany' in o || 'forwarder' in o) view.customerCompany = o.forwarder ?? null;
    if ('partner' in o) view.forwarder = o.partner;
    view.forwarderId = companyId;
    view.partnerId = null;
    if ('partner' in o) view.partner = null;
    if ('customer' in o) view.customer = null;
    if ('customerId' in o) view.customerId = null;
    for (const key of ['driverCost', 'driverCostBase', 'executorVatRate', 'carrierPaymentDays', 'carrierPaymentFrom', 'driverPaymentDate', 'driverPaymentCondition', 'driverPaymentForm', 'driverPaidAt']) {
        if (key in o) view[key] = null;
    }
    if ('executorHasVat' in o) view.executorHasVat = false;
    if ('isDriverPaid' in o) view.isDriverPaid = false;
    return view;
}

/** Убрать из заявки сделку экспедитора с заказчиком — для исполнителя. */
export function hideCustomerSide<T extends CustomerSideFields>(order: T): T {
    const masked = order as any;
    masked.customerPrice = null;
    masked.customerPriceBase = null;
    masked.isCustomerPaid = false;
    masked.customerPaidAt = null;
    masked.customerPaymentDays = null;
    masked.customerPaymentFrom = null;
    masked.customerPaymentDate = null;
    masked.customerPaymentCondition = null;
    masked.hasVat = null;
    masked.vatRate = null;
    return order;
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
    // Не только id, но и сама связь: карточка её теперь запрашивает, чтобы
    // показывать имя перевозчика вместо кода. Гасить один id было бы
    // достаточно ровно до первой выборки с `include` — так и случилось в
    // выгрузке, где имя субподрядчика уехало заказчику отдельной колонкой.
    masked.subForwarder = null;
    masked.executorHasVat = null;
    masked.executorVatRate = null;
    masked.carrierPaymentDays = null;
    masked.carrierPaymentFrom = null;
    // Когда оригиналы пришли к нам от перевозчика — часть той же
    // договорённости: по этой дате видно, когда мы платим ему.
    masked.carrierOriginalsAt = null;
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
export function isOrderOwner(order: OrderSides, companyId?: string | null): boolean {
    if (!companyId) return false;
    return (order.forwarderId || order.partnerId) === companyId;
}

/**
 * История заявки: записи, где названы деньги исполнителя или он сам.
 *
 * Карточку и выгрузку правило денег закрывало, а историю — нет. Выбирая
 * исполнителя с биржи, система пишет «выбран перевозчик такой-то за
 * столько-то», и эта строка уезжала заказчику вместе с карточкой — та же
 * маржа экспедитора, только словами (владелец, 25.10.2026: заказчик видит
 * стоимость перевозки, а не ставку исполнителя и не сумму водителю).
 */
const ON_HAND_NOTE = /\s*—\s*водителю на руки .*$/;
const EXCHANGE_DRIVER = /^С биржи выбран водитель (.+?) \((?:через парк |свой ИП\))/;

/** Запись без сумм и без названия исполнителя — для заказчика и водителя. */
export function neutralHistoryComment(comment: string | null | undefined): string | null | undefined {
    if (!comment) return comment;
    // `\b` в JS — граница латинского слова, на кириллице он не срабатывает.
    if (/^С биржи выбран перевозчик(?:\s|$)/.test(comment)) return 'С биржи выбран перевозчик';
    const driver = comment.match(EXCHANGE_DRIVER);
    if (driver) return `С биржи выбран водитель ${driver[1]}`;
    if (/^Заявка переназначена на партнера(?:\s|$)/.test(comment)) return 'Заявка передана перевозчику';
    return comment.replace(ON_HAND_NOTE, '');
}

/**
 * Сколько водителю парка на руки, знает только парк: это его расчёт с
 * водителем. Экспедитору, который выбирал водителя, — нет (владелец,
 * 25.10.2026). Такие приписки писались в историю до этого правила.
 */
export function withoutOnHand(comment: string | null | undefined): string | null | undefined {
    return comment ? comment.replace(ON_HAND_NOTE, '') : comment;
}

/** Комментарий записи истории глазами этой компании (или водителя). */
export function historyCommentFor(
    comment: string | null | undefined,
    order: OrderSides,
    viewer: { companyId?: string | null; driver?: boolean },
): string | null | undefined {
    if (viewer.driver || isCustomerOnly(order, viewer.companyId)) return neutralHistoryComment(comment);
    if (!viewer.companyId || order.partnerId !== viewer.companyId) return withoutOnHand(comment);
    return comment;
}

function maskStatusHistory(order: any, viewer: { companyId?: string | null; driver?: boolean }) {
    if (!Array.isArray(order.statusHistory)) return;
    order.statusHistory = order.statusHistory.map((entry: any) => ({
        ...entry,
        comment: historyCommentFor(entry.comment, order, viewer),
    }));
}

/** Применить правила видимости к заявке, уезжающей контрагенту. */
export function maskForCustomer<T extends ExecutorCostFields & OrderSides & SettlementFields>(
    order: T,
    companyId?: string | null,
): T {
    // История — до того, как скроем стороны: правило смотрит, кто есть кто.
    maskStatusHistory(order, { companyId });
    if (isCustomerOnly(order, companyId)) hideExecutorCost(order);
    if (isExecutorOnly(order, companyId)) hideCustomerSide(order as T & CustomerSideFields);

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

/**
 * Полное правило для водителя — и в списке рейсов, и в карточке.
 *
 * В списке цену заказчика убирали, а в карточке нет: она отдавала и её, и
 * ставку перевозчика, то есть весь заработок компании на этом рейсе.
 * Водитель — самая слабая учётная запись из тех, у кого есть вход: он
 * часто наёмный и меняется чаще всех.
 *
 * Ставка субподрядчика скрыта наравне с ценой заказчика. Кто бы ни возил —
 * наш водитель или водитель нанятой фирмы, — разница между этой ставкой и
 * его собственной оплатой есть чей-то заработок, и это не его сведения.
 * Своя оплата (`driverCost`) остаётся: за неё он и работает.
 *
 * Но только когда это и правда его оплата. Если рейс везёт перевозчик —
 * парк или фирма (`partnerId`), — `driverCost` есть ставка этой фирмы у
 * экспедитора, а водителю платит уже она. Водителю парка — только сумма на
 * руки, и её он видит в своём расчёте (владелец, 25.10.2026).
 */
export function maskForDriver<T extends ExecutorCostFields & { customerPrice?: unknown }>(
    order: T,
): T {
    const masked = order as any;
    maskStatusHistory(masked, { driver: true });
    if (masked.partnerId) {
        masked.driverCost = null;
        masked.driverCostBase = null;
        masked.isDriverPaid = false;
        masked.driverPaidAt = null;
        masked.driverPaymentDate = null;
        masked.driverPaymentCondition = null;
        masked.driverPaymentForm = null;
    }
    hideCustomerPrice(order as any);
    masked.subForwarderPrice = null;
    masked.subForwarderId = null;
    masked.subForwarder = null;
    masked.partner = null;
    masked.partnerId = null;
    masked.isSubForwarderPaid = false;
    masked.subForwarderPaidAt = null;
    // Условия расчётов сторон — та же чувствительность, что и суммы.
    masked.hasVat = null;
    masked.vatRate = null;
    masked.executorHasVat = null;
    masked.executorVatRate = null;
    masked.customerPaymentDays = null;
    masked.customerPaymentFrom = null;
    masked.carrierPaymentDays = null;
    masked.carrierPaymentFrom = null;
    return order;
}
