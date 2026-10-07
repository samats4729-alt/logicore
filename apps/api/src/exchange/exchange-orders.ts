import { OrderStatus, Prisma } from '@prisma/client';
import { kzStartOfToday } from '../common/utils/business-date';

/**
 * Заявка на бирже — что из неё видят перевозчики и водители.
 *
 * Только то, что нужно, чтобы решить «повезу или нет»: города маршрута,
 * даты, груз, кузов, цена и примечание компании. Адресов и названий точек
 * нет: по ним видно клиента экспедитора, и перевозчик мог бы договориться с
 * ним напрямую в обход. Адреса откроются тому, кого компания выберет.
 * Заказчика, его цены и денег экспедитора здесь нет вовсе — выборка задана
 * поимённо, лишнее в ответ не попадёт.
 */
export const EXCHANGE_ORDER_SELECT = {
    id: true,
    orderNumber: true,
    cargoDescription: true,
    cargoWeight: true,
    cargoVolume: true,
    cargoType: true,
    natureOfCargo: true,
    palletCount: true,
    loadingTypes: true,
    packagingTypes: true,
    tempMin: true,
    tempMax: true,
    adr: true,
    adrClass: true,
    requirements: true,
    exchangePrice: true,
    exchangeNote: true,
    exchangePublishedAt: true,
    forwarder: { select: { name: true } },
    customerCompany: { select: { name: true } },
    subForwarder: { select: { name: true } },
    subForwarderId: true,
    forwarderId: true,
    routePoints: {
        select: {
            pointType: true,
            sequence: true,
            expectedDate: true,
            location: { select: { city: true, region: true, cityRecord: { select: { name: true } } } },
        },
        orderBy: { sequence: 'asc' as const },
    },
} satisfies Prisma.OrderSelect;

export type ExchangeOrderRow = Prisma.OrderGetPayload<{ select: typeof EXCHANGE_ORDER_SELECT }>;

/** Пока исполнителя нет, заявка может быть на бирже. */
export const FREE_STATUSES: OrderStatus[] = [OrderStatus.DRAFT, OrderStatus.PENDING];

/**
 * Условие «заявка сейчас на бирже»: выставлена, не снята и всё ещё без
 * исполнителя. Последнее важно: назначили водителя обычным порядком — и
 * заявка пропадает с биржи сама, без отдельной отметки.
 */
export const ON_EXCHANGE: Prisma.OrderWhereInput = {
    exchangePublishedAt: { not: null },
    exchangeClosedAt: null,
    status: { in: FREE_STATUSES },
    driverId: null,
    partnerId: null,
    assignedDriverName: null,
};

/**
 * Компания, которая ведёт исполнение заявки: суб-экспедитор, если рейс ему
 * передали, иначе экспедитор, иначе сам заказчик. Именно она ищет, кто
 * повезёт, — ей и выставлять заявку на биржу.
 */
export function managerOf(order: { subForwarderId?: string | null; forwarderId?: string | null; customerCompanyId?: string | null }): string | null {
    return order.subForwarderId || order.forwarderId || order.customerCompanyId || null;
}

/** Город точки: из справочника, иначе как записали. */
function cityOf(p: ExchangeOrderRow['routePoints'][number]): string {
    return p.location.cityRecord?.name || p.location.city || '—';
}

/** День первой погрузки — по нему лента сортируется и отсекает прошедшее. */
export function firstLoadingDate(row: Pick<ExchangeOrderRow, 'routePoints'>): Date | null {
    const pickup = row.routePoints.find((p) => p.pointType !== 'DELIVERY' && p.expectedDate);
    return pickup?.expectedDate ?? null;
}

/** Погрузка не в прошлом: без даты — тоже показываем, договорятся по телефону. */
export function notPast(row: Pick<ExchangeOrderRow, 'routePoints'>, now = new Date()): boolean {
    const date = firstLoadingDate(row);
    return !date || date >= kzStartOfToday(now);
}

/** Заявка на бирже в том виде, в каком её видят другие. */
export function exchangeView(row: ExchangeOrderRow) {
    const points = row.routePoints.map((p) => ({
        type: p.pointType,
        city: cityOf(p),
        region: p.location.region ?? null,
        date: p.expectedDate,
    }));
    const pickups = points.filter((p) => p.type !== 'DELIVERY');
    const deliveries = points.filter((p) => p.type === 'DELIVERY');
    return {
        id: row.id,
        orderNumber: row.orderNumber,
        companyName: row.subForwarder?.name || row.forwarder?.name || row.customerCompany?.name || null,
        from: pickups[0]?.city ?? points[0]?.city ?? '—',
        to: deliveries[deliveries.length - 1]?.city ?? points[points.length - 1]?.city ?? '—',
        loadingDate: firstLoadingDate(row),
        points,
        cargoDescription: row.cargoDescription,
        weightKg: row.cargoWeight != null ? Math.round(row.cargoWeight) : null,
        volumeM3: row.cargoVolume,
        bodyType: row.cargoType,
        natureOfCargo: row.natureOfCargo,
        palletCount: row.palletCount,
        loadingTypes: row.loadingTypes,
        packagingTypes: row.packagingTypes,
        tempMin: row.tempMin,
        tempMax: row.tempMax,
        adr: row.adr,
        adrClass: row.adrClass,
        requirements: row.requirements,
        price: row.exchangePrice != null ? Number(row.exchangePrice) : null,
        note: row.exchangeNote,
        publishedAt: row.exchangePublishedAt,
    };
}

export type ExchangeOrderView = ReturnType<typeof exchangeView>;

/** Ближайшая погрузка сверху; без даты — в конце. */
export function byLoadingDate(a: ExchangeOrderView, b: ExchangeOrderView): number {
    const da = a.loadingDate ? new Date(a.loadingDate).getTime() : Infinity;
    const db = b.loadingDate ? new Date(b.loadingDate).getTime() : Infinity;
    return da - db;
}

/** Подходит ли заявка под фильтр «откуда / куда / кузов» — без учёта регистра. */
export function matches(view: ExchangeOrderView, filter: { from?: string; to?: string; bodyType?: string }): boolean {
    const has = (value: string | null | undefined, needle?: string) =>
        !needle || (value ?? '').toLowerCase().includes(needle.trim().toLowerCase());
    return has(view.from, filter.from) && has(view.to, filter.to) && has(view.bodyType, filter.bodyType);
}
