/**
 * Как рейс выглядит и что про него считается — в одном месте.
 *
 * Подписи статусов уже собраны в `vocabulary.ts`, а цвета к ним были
 * скопированы в шесть файлов и успели разойтись: «В пути» на четырёх
 * экранах бирюзовый, на двух синий; «Отменён» то красный, то серый, то
 * свой оттенок красного. Один и тот же статус выглядел по-разному в
 * зависимости от того, на каком экране человек его увидел.
 *
 * Здесь же живёт расчёт «рейс закрыт по деньгам»: он был написан внутри
 * страницы списка заявок на две тысячи строк, а нужен и в других местах.
 *
 * Правило то же, что и со словарём: цвета берутся отсюда, свои копии не
 * заводятся. За этим следит `scripts/check-vocabulary.js`.
 */

import { ORDER_STATUS_LABELS } from './vocabulary';

/**
 * Цвета статусов рейса — имена палитры Ant Design.
 *
 * «Отменён» серый, а не красный. Красным на экране рейсов горит
 * «Проблема» — то, что требует вмешательства прямо сейчас. Отменённый
 * рейс вмешательства не требует, он закончен, и кричать ему незачем.
 * Полоса прогресса у отменённого рейса и раньше рисовалась серой —
 * бирка рядом с ней была красной, и одна строка спорила сама с собой.
 */
export const ORDER_STATUS_COLORS: Record<string, string> = {
    DRAFT: 'default',
    PENDING: 'orange',
    ASSIGNED: 'blue',
    EN_ROUTE_PICKUP: 'gold',
    AT_PICKUP: 'lime',
    LOADING: 'purple',
    IN_TRANSIT: 'cyan',
    AT_DELIVERY: 'lime',
    UNLOADING: 'purple',
    COMPLETED: 'green',
    PROBLEM: 'red',
    CANCELLED: 'default',
};

/**
 * Грубый прогресс рейса по месту статуса в цепочке.
 * Точный процент по GPS — отдельная работа, здесь порядок этапов.
 */
export const ORDER_STATUS_PROGRESS: Record<string, number> = {
    DRAFT: 4, PENDING: 8, ASSIGNED: 18, EN_ROUTE_PICKUP: 30, AT_PICKUP: 42,
    LOADING: 52, IN_TRANSIT: 68, AT_DELIVERY: 82, UNLOADING: 92,
    COMPLETED: 100, PROBLEM: 50, CANCELLED: 100,
};

/** Цвет полосы прогресса: проблема — красная, завершён — зелёный, отменён — серый. */
export const progressColor = (status: string) =>
    status === 'PROBLEM' ? '#dc2626'
        : status === 'COMPLETED' ? '#16a34a'
            : status === 'CANCELLED' ? '#9ca3af' : '#1677ff';

/** Красный «горящего» долга — для названий контрагентов в таблицах. */
export const DEBT_RED = '#dc2626';

/** Две буквы для кружка вместо фотографии. */
export const nameInitials = (name?: string) => {
    if (!name) return '—';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '—';
};

/** Порядок этапов рейса — по нему строится список «куда можно перевести». */
const STATUS_CHAIN = [
    'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING',
    'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'COMPLETED',
];

const step = (status: string) => ({ value: status, label: ORDER_STATUS_LABELS[status] || status });

/**
 * Куда можно перевести рейс из текущего статуса.
 *
 * Этот список был написан дважды — в списке заявок и в карточке рейса, —
 * и в обеих копиях подписи разошлись со словарём: в выпадающем списке
 * стояло «Загружается» и «Разгружается», а на бирке рядом — «Погрузка» и
 * «Выгрузка». Человек выбирал одно слово и тут же видел другое. Теперь
 * подписи берутся из словаря, а не пишутся заново.
 */
export function getNextStatuses(status: string): { value: string; label: string }[] {
    const chain = STATUS_CHAIN.map(step);

    // Из «Проблемы» можно вернуться на любой этап: что именно случилось,
    // знает человек, а не программа.
    if (status === 'PROBLEM') return chain;

    // Завершённый и отменённый рейс переоткрываются на любой активный
    // этап, но не «Завершён» — это был бы переход в самого себя.
    if (status === 'COMPLETED' || status === 'CANCELLED') return chain.slice(0, -1);

    const index = STATUS_CHAIN.indexOf(status);
    if (index === -1) return [];
    // С любого активного этапа можно отметить «Проблему».
    return [...chain.slice(index + 1), { value: 'PROBLEM', label: `⚠ ${ORDER_STATUS_LABELS.PROBLEM}` }];
}

/** Минимум полей рейса, по которым считается расчёт с обеими сторонами. */
export interface OrderSettlement {
    customerPrice?: number | null;
    isCustomerPaid?: boolean | null;
    driverCost?: number | null;
    isDriverPaid?: boolean | null;
    subForwarderId?: string | null;
    subForwarderPrice?: number | null;
    isSubForwarderPaid?: boolean | null;
}

/** Заказчик с нами рассчитался. Нет ставки заказчика — нет и долга. */
export const isCustomerSettled = (order: OrderSettlement): boolean =>
    !order.customerPrice || Boolean(order.isCustomerPaid);

/**
 * Мы рассчитались с исполнителем.
 *
 * Исполнитель один из двух: суб-экспедитор, если рейс отдан ему, иначе
 * перевозчик. Смотреть надо на ту сумму, которая по этому рейсу реально
 * платится, — иначе рейс, отданный суб-экспедитору, считался бы закрытым
 * по пустой ставке водителя.
 */
export const isExecutorSettled = (order: OrderSettlement): boolean => {
    const cost = order.subForwarderId ? order.subForwarderPrice : order.driverCost;
    if (!cost) return true;
    return Boolean(order.subForwarderId ? order.isSubForwarderPaid : order.isDriverPaid);
};

/**
 * Рейс закрыт по деньгам: заказчик заплатил нам и мы заплатили исполнителю.
 * Завершённый, но неоплаченный рейс зелёным гореть не должен — иначе
 * задолженность теряется из виду ровно тогда, когда за ней надо идти.
 */
export const isOrderSettled = (order: OrderSettlement): boolean =>
    isCustomerSettled(order) && isExecutorSettled(order);
