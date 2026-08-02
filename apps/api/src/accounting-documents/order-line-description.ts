/**
 * Расшифровка рейса в строке счёта.
 *
 * Просьба бухгалтера: в счёте не должно стоять «транспортные услуги
 * 230 000». В 1С строка выглядит так:
 *
 *   Транспортные услуги, маршрут: г Караганда — г Балхаш, водитель
 *   Джамбеков Д.Е., дата 20.07.2026, авт. ГАЗ, г/н 950AXM16,
 *   заявка №000000238
 *
 * По этой строке клиент понимает, за что платит, а бухгалтер — какой рейс
 * искать, если возник вопрос. Без неё в счёте на двадцать перевозок
 * двадцать одинаковых строк, и разобраться нельзя.
 *
 * Состав строки — НАСТРОЙКА КОМПАНИИ, а не общий порядок: одним нужен
 * прицеп, другим внешний номер клиента, третьим ничего кроме маршрута.
 * Платформа не пишется под одного заказчика.
 */

/** Что можно поставить в строку. Порядок в счёте — как в этом списке. */
export type LinePart =
    | 'route'      // маршрут: откуда — куда
    | 'driver'     // водитель, фамилия и инициалы
    | 'date'       // дата погрузки
    | 'vehicle'    // марка машины
    | 'plate'      // госномер
    | 'trailer'    // прицеп
    | 'orderNumber'// номер заявки в нашей системе
    | 'externalId';// номер клиента: ID, СТС и прочее

/** Набор по умолчанию: то, что назвала бухгалтер. */
export const DEFAULT_LINE_PARTS: LinePart[] = [
    'route', 'driver', 'date', 'vehicle', 'plate', 'orderNumber',
];

export interface OrderForLine {
    orderNumber?: string | null;
    assignedDriverName?: string | null;
    assignedDriverPlate?: string | null;
    assignedDriverTrailer?: string | null;
    vehicleModel?: string | null;
    externalNumber?: string | null;
    routePoints?: { pointType: string; sequence?: number; location?: { city?: string | null; name?: string | null } | null }[] | null;
    routeFrom?: string | null;
    routeTo?: string | null;
    loadingDate?: Date | string | null;
}

/**
 * Фамилия и инициалы: «Джамбеков Дмитрий Евгеньевич» → «Джамбеков Д.Е.».
 *
 * Именно так пишут в счетах и накладных. Полное имя занимает половину
 * строки и вытесняет то, ради чего строка нужна.
 */
export function shortenName(full: string | null | undefined): string | null {
    const parts = (full || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    const [last, ...rest] = parts;
    const initials = rest.map((w) => `${w[0].toUpperCase()}.`).join('');
    return initials ? `${last} ${initials}` : last;
}

/** Дата в том виде, в каком её читают в документах: 20.07.2026. */
function formatDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Маршрут: берём города точек погрузки и выгрузки. */
function routeOf(order: OrderForLine): string | null {
    if (order.routeFrom || order.routeTo) {
        const from = order.routeFrom?.trim();
        const to = order.routeTo?.trim();
        return from && to ? `${from} — ${to}` : from || to || null;
    }
    const points = [...(order.routePoints || [])]
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const label = (p: (typeof points)[number] | undefined) =>
        p?.location?.city?.trim() || p?.location?.name?.trim() || null;

    const from = label(points.find((p) => p.pointType === 'PICKUP') || points[0]);
    const to = label([...points].reverse().find((p) => p.pointType === 'DELIVERY') || points[points.length - 1]);
    if (!from && !to) return null;
    return from && to ? `${from} — ${to}` : (from || to) as string;
}

/**
 * Собрать строку счёта по рейсу.
 *
 * Чего здесь нет намеренно: пустых кусков. Если водитель ещё не назначен,
 * в строке не появится «водитель: не указан» — в счёте, который уходит
 * клиенту, такому не место. Отсутствующее просто опускается.
 */
export function buildOrderLineDescription(
    order: OrderForLine,
    options: { service?: string; parts?: LinePart[]; externalLabel?: string } = {},
): string {
    const service = options.service || 'Транспортные услуги';
    const parts = options.parts?.length ? options.parts : DEFAULT_LINE_PARTS;

    const chunks: string[] = [];
    for (const part of parts) {
        switch (part) {
            case 'route': {
                const r = routeOf(order);
                if (r) chunks.push(`маршрут: ${r}`);
                break;
            }
            case 'driver': {
                const d = shortenName(order.assignedDriverName);
                if (d) chunks.push(`водитель ${d}`);
                break;
            }
            case 'date': {
                const d = formatDate(order.loadingDate);
                if (d) chunks.push(`дата ${d}`);
                break;
            }
            case 'vehicle':
                if (order.vehicleModel?.trim()) chunks.push(`авт. ${order.vehicleModel.trim()}`);
                break;
            case 'plate':
                if (order.assignedDriverPlate?.trim()) chunks.push(`г/н ${order.assignedDriverPlate.trim()}`);
                break;
            case 'trailer':
                if (order.assignedDriverTrailer?.trim()) chunks.push(`п/п ${order.assignedDriverTrailer.trim()}`);
                break;
            case 'orderNumber':
                if (order.orderNumber?.trim()) chunks.push(`заявка №${order.orderNumber.trim()}`);
                break;
            case 'externalId':
                // Подпись берётся у контрагента: у одного это «ID», у
                // другого «СТС», у третьего свой номер заказа. Жёстко
                // писать «ID» значит подписать чужой номер чужим словом.
                if (order.externalNumber?.trim()) {
                    const label = options.externalLabel?.trim() || 'ID';
                    chunks.push(`${label} ${order.externalNumber.trim()}`);
                }
                break;
        }
    }

    return chunks.length ? `${service}, ${chunks.join(', ')}` : service;
}
