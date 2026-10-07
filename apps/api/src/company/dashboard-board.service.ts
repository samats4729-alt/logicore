import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { managerOrdersFilter } from '../common/manager-orders';
import { ZERO, toNum } from '../common/utils/money';
import { KZ_UTC_OFFSET_MINUTES, kzStartOfMonth, kzStartOfToday, kzToday } from '../common/utils/business-date';
import {
    FinanceCalculatorService,
    ORDER_FINANCE_RELATIONS_SELECT,
    ORDER_FINANCE_SELECT,
    orderFinancePayments,
} from '../accounting/services/finance-calculator.service';

/**
 * Расчёты для блоков дашборда-конструктора (макет «LogiCore на shadcn Nova»,
 * владелец, 07.10.2026).
 *
 * Здесь только то, чего сервер раньше не считал: история показателей по дням
 * для мини-графиков, выручка по неделям, ближайшие погрузки, рейсы в пути,
 * заявки по этапам, календарь погрузок, «требуют внимания» и водители.
 *
 * Правила те же, что у остального кабинета:
 * - заявка «наша», если компания в ней участвует (заказчик, экспедитор,
 *   перевозчик, субэкспедитор) — как в «Активности»;
 * - менеджеру, которому руководитель оставил «только свои», — только свои
 *   (`managerOrdersFilter`, тот же отбор, что у журнала заявок);
 * - деньги считает общий калькулятор — тот же, что «Реестр заявок»
 *   и «Активность». Своя формула означала бы вторую правду.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const KZ_OFFSET_MS = KZ_UTC_OFFSET_MINUTES * 60 * 1000;

/** Рейс в работе: назначен и ещё не завершён. Тот же набор, что в «Активности». */
export const IN_WORK: OrderStatus[] = ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'];
/** «На точках» — машина стоит на погрузке или выгрузке. */
const AT_POINTS: OrderStatus[] = ['AT_PICKUP', 'LOADING', 'AT_DELIVERY', 'UNLOADING'];
/** «Едут на погрузку» — назначены и ещё не забрали груз. */
const TO_PICKUP: OrderStatus[] = ['ASSIGNED', 'EN_ROUTE_PICKUP'];
/** Сейчас в пути — машина с грузом или у точки. */
const MOVING: OrderStatus[] = ['AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'];

/**
 * Насколько пройден рейс — по этапу, а не по карте: GPS есть не у всех, а
 * этап известен всегда. Шкала та же, что в макете.
 */
const ЭТАП_ПРОЦЕНТ: Partial<Record<OrderStatus, number>> = {
    ASSIGNED: 5, EN_ROUTE_PICKUP: 20, AT_PICKUP: 42, LOADING: 52, IN_TRANSIT: 68, AT_DELIVERY: 82, UNLOADING: 92,
};

/** Сколько дней в мини-графике показателя. */
const SERIES_DAYS = 14;
/** Сколько недель в графике выручки. */
const REVENUE_WEEKS = 12;
/** Через сколько дней после завершения отсутствие накладной — уже хвост. */
const TTN_GRACE_DAYS = 2;

export type DashboardPeriod = 'week' | 'month' | 'quarter';

export function parsePeriod(value: unknown): DashboardPeriod {
    return value === 'week' || value === 'quarter' ? value : 'month';
}

/** Начало суток по Казахстану для даты `YYYY-MM-DD` (как его видит человек). */
function kzDayStart(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month, day) - KZ_OFFSET_MS);
}

/**
 * Начало текущего периода и того же по длине куска прошлого периода.
 *
 * «К тому же дню прошлого месяца», а не ко всему прошлому месяцу: седьмого
 * числа сравнивать неделю работы с полным месяцем бессмысленно — минус
 * будет всегда.
 */
export function periodBounds(period: DashboardPeriod, at: Date = new Date()) {
    const today = kzToday(at); // полночь по Казахстану, записанная как UTC
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    const d = today.getUTCDate();
    let start: Date;
    let prevStart: Date;
    if (period === 'week') {
        const weekday = (today.getUTCDay() + 6) % 7; // понедельник — 0
        start = kzDayStart(y, m, d - weekday);
        prevStart = new Date(start.getTime() - 7 * DAY_MS);
    } else if (period === 'quarter') {
        const q = Math.floor(m / 3) * 3;
        start = kzDayStart(y, q, 1);
        prevStart = kzDayStart(y, q - 3, 1);
    } else {
        start = kzDayStart(y, m, 1);
        prevStart = kzDayStart(y, m - 1, 1);
    }
    const elapsed = at.getTime() - start.getTime();
    const prevEnd = new Date(Math.min(prevStart.getTime() + elapsed, start.getTime()));
    return { start, prevStart, prevEnd, end: at };
}

/** Понедельник недели, в которую попадает момент, — по Казахстану. */
function kzWeekStart(at: Date): Date {
    const day = kzToday(at);
    const weekday = (day.getUTCDay() + 6) % 7;
    return kzDayStart(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() - weekday);
}

/** `YYYY-MM-DD` по Казахстану. */
function kzDateKey(at: Date): string {
    return kzToday(at).toISOString().slice(0, 10);
}

type Requester = { companyId: string; userId?: string | null; role?: UserRole | string | null };

@Injectable()
export class DashboardBoardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly financeCalculator: FinanceCalculatorService,
    ) { }

    /** Заявки, которые этот человек видит в журнале: участие компании и, у менеджера, «только свои». */
    private async scope(req: Requester): Promise<Prisma.OrderWhereInput> {
        const { companyId } = req;
        const участие: Prisma.OrderWhereInput = {
            OR: [
                { customerCompanyId: companyId },
                { forwarderId: companyId },
                { partnerId: companyId },
                { subForwarderId: companyId },
            ],
        };
        const свои = await managerOrdersFilter(this.prisma, { companyId, role: req.role, userId: req.userId });
        return свои ? { AND: [участие, свои] } : участие;
    }

    // ==================== Заявки ====================

    /**
     * Всё, что дашборд показывает по заявкам, одним ответом: показатели с
     * историей по дням, ближайшие погрузки, рейсы в пути, заявки по этапам,
     * календарь погрузок и то, что требует внимания.
     *
     * Одним ответом, а не шестью: все блоки читают одни и те же заявки, и
     * шесть запросов шесть раз прошли бы по одной таблице.
     */
    async ordersOverview(req: Requester, opts: { period: DashboardPeriod; month?: string }) {
        const where = await this.scope(req);
        const now = new Date();
        const todayStart = kzStartOfToday(now);
        const tomorrowEnd = new Date(todayStart.getTime() + 2 * DAY_MS);

        // Месяц календаря погрузок: тот, что листает человек, или текущий.
        const monthMatch = /^(\d{4})-(\d{2})$/.exec(opts.month ?? '');
        const calStart = monthMatch
            ? kzDayStart(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1)
            : kzStartOfMonth(now);
        const calEnd = kzDayStart(
            new Date(calStart.getTime() + KZ_OFFSET_MS).getUTCFullYear(),
            new Date(calStart.getTime() + KZ_OFFSET_MS).getUTCMonth() + 1,
            1,
        );

        const { start, prevStart, prevEnd } = periodBounds(opts.period, now);
        const seriesStart = new Date(todayStart.getTime() - (SERIES_DAYS - 1) * DAY_MS);
        const historyFrom = new Date(Math.min(seriesStart.getTime(), prevStart.getTime()));

        const pointSelect = {
            orderBy: { sequence: 'asc' as const },
            select: {
                pointType: true,
                expectedDate: true,
                location: { select: { city: true, address: true, cityRecord: { select: { name: true } } } },
            },
        };
        const orderSelect = {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
            customerPrice: true,
            assignedDriverName: true,
            assignedDriverPlate: true,
            driver: { select: { firstName: true, lastName: true } },
            routePoints: pointSelect,
        };

        const [active, created, history, completedNoTtn, loadingsInMonth, completedCount] = await Promise.all([
            // Всё, что сейчас в работе, ждёт исполнителя или с проблемой.
            this.prisma.order.findMany({
                where: { AND: [where, { status: { in: [...IN_WORK, 'PENDING', 'PROBLEM'] } }] },
                select: { ...orderSelect, isConfirmed: true, updatedAt: true },
                orderBy: { createdAt: 'desc' },
                take: 500,
            }),
            // Созданные за этот и прошлый период — для «Заявок за период».
            this.prisma.order.findMany({
                where: {
                    AND: [
                        where,
                        { createdAt: { gte: prevStart } },
                        { status: { notIn: ['DRAFT', 'CANCELLED'] } },
                        { OR: [{ isConfirmed: true }, { status: { not: 'PENDING' } }] },
                    ],
                },
                select: { createdAt: true },
            }),
            // Смены статуса за окно мини-графиков — из них восстанавливается,
            // сколько было в работе, в ожидании и с проблемой в каждый день.
            this.prisma.orderStatusHistory.findMany({
                where: { changedAt: { gte: historyFrom }, order: where },
                select: { orderId: true, status: true, changedAt: true },
                orderBy: { changedAt: 'asc' },
            }),
            // Завершены больше двух дней назад, а накладной в документах нет.
            this.prisma.order.findMany({
                where: {
                    AND: [
                        where,
                        { status: 'COMPLETED' },
                        { completedAt: { lt: new Date(todayStart.getTime() - TTN_GRACE_DAYS * DAY_MS), gte: new Date(todayStart.getTime() - 60 * DAY_MS) } },
                        { documents: { none: { type: 'TTN' } } },
                    ],
                },
                select: { id: true, orderNumber: true, completedAt: true },
                orderBy: { completedAt: 'asc' },
                take: 50,
            }),
            // Погрузки месяца календаря.
            this.prisma.order.findMany({
                where: {
                    AND: [
                        where,
                        { status: { notIn: ['DRAFT', 'CANCELLED'] } },
                        { routePoints: { some: { pointType: 'PICKUP', expectedDate: { gte: calStart, lt: calEnd } } } },
                    ],
                },
                select: orderSelect,
                take: 500,
            }),
            this.prisma.order.count({
                where: { AND: [where, { status: 'COMPLETED' }, { completedAt: { gte: kzStartOfMonth(now) } }] },
            }),
        ]);

        const route = (o: { routePoints: any[] }) => {
            const city = (p: any) => p?.location?.cityRecord?.name || p?.location?.city || p?.location?.address || '—';
            const pts = o.routePoints;
            return { from: city(pts[0]), to: city(pts[pts.length - 1]) };
        };
        const pickupDate = (o: { routePoints: any[] }) =>
            o.routePoints.find((p: any) => p.pointType === 'PICKUP' && p.expectedDate)?.expectedDate ?? null;
        const driverOf = (o: any) =>
            o.assignedDriverName || [o.driver?.lastName, o.driver?.firstName].filter(Boolean).join(' ') || null;

        // ---------- показатели сейчас ----------
        const inWork = active.filter((o) => IN_WORK.includes(o.status));
        const pending = active.filter((o) => o.status === 'PENDING');
        const problems = active.filter((o) => o.status === 'PROBLEM');
        const pendingSoon = pending.filter((o) => {
            const d = pickupDate(o);
            return d && d < tomorrowEnd;
        });

        // ---------- история по дням ----------
        // Статус заявки на конец каждого дня: последний переход до этого
        // момента. Переходов внутри окна нет — заявка весь срок стояла в
        // том статусе, что сейчас (если уже существовала).
        const byOrder = new Map<string, { status: OrderStatus; changedAt: Date }[]>();
        for (const h of history) {
            const list = byOrder.get(h.orderId) ?? [];
            list.push(h);
            byOrder.set(h.orderId, list);
        }
        const tracked = new Map<string, { status: OrderStatus; createdAt: Date }>();
        for (const o of active) tracked.set(o.id, { status: o.status, createdAt: o.createdAt });
        // Заявки, которые были в работе внутри окна, а сейчас уже завершены:
        // их нет среди активных, но в прошлых днях они считались.
        const missing = Array.from(byOrder.keys()).filter((id) => !tracked.has(id));
        if (missing.length) {
            const rest = await this.prisma.order.findMany({
                where: { id: { in: missing } },
                select: { id: true, status: true, createdAt: true },
            });
            for (const o of rest) tracked.set(o.id, { status: o.status, createdAt: o.createdAt });
        }
        const statusAt = (id: string, at: Date): OrderStatus | null => {
            const o = tracked.get(id);
            if (!o || o.createdAt > at) return null;
            const changes = byOrder.get(id);
            if (!changes?.length) return o.status;
            let current: OrderStatus | null = null;
            for (const c of changes) {
                if (c.changedAt <= at) current = c.status;
                else break;
            }
            // До первого перехода в окне заявка была в статусе, из которого
            // её перевели. Его в истории окна нет — считаем, что этот же:
            // ошибка возможна только в первый день, и она в пользу «как сейчас».
            return current ?? changes[0].status;
        };
        const series = { inWork: [] as number[], pending: [] as number[], problems: [] as number[] };
        for (let i = 0; i < SERIES_DAYS; i++) {
            const at = i === SERIES_DAYS - 1 ? now : new Date(seriesStart.getTime() + (i + 1) * DAY_MS - 1);
            let w = 0, p = 0, pr = 0;
            for (const id of tracked.keys()) {
                const s = statusAt(id, at);
                if (!s) continue;
                if (IN_WORK.includes(s)) w++;
                else if (s === 'PENDING') p++;
                else if (s === 'PROBLEM') pr++;
            }
            series.inWork.push(w);
            series.pending.push(p);
            series.problems.push(pr);
        }
        // Сегодняшняя точка — ровно то, что в плашке.
        series.inWork[SERIES_DAYS - 1] = inWork.length;
        series.pending[SERIES_DAYS - 1] = pending.length;
        series.problems[SERIES_DAYS - 1] = problems.length;

        // ---------- заявки за период ----------
        const days = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / DAY_MS));
        const cumulative = (from: Date, to: Date) => {
            const out: number[] = new Array(days).fill(0);
            for (const o of created) {
                if (o.createdAt < from || o.createdAt >= to) continue;
                const idx = Math.min(days - 1, Math.floor((o.createdAt.getTime() - from.getTime()) / DAY_MS));
                out[idx]++;
            }
            for (let i = 1; i < out.length; i++) out[i] += out[i - 1];
            return out;
        };
        const ordersSeries = cumulative(start, now);
        const ordersPrevSeries = cumulative(prevStart, prevEnd);

        // ---------- блоки ----------
        const upcoming = active
            .filter((o) => (TO_PICKUP.includes(o.status) || o.status === 'PENDING'))
            .map((o) => ({ o, d: pickupDate(o) }))
            .filter((x) => !x.d || x.d >= todayStart)
            .sort((a, b) => (a.d?.getTime() ?? Infinity) - (b.d?.getTime() ?? Infinity))
            .slice(0, 15)
            .map(({ o, d }) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                ...route(o),
                loadingDate: d,
                status: o.status,
                price: o.customerPrice == null ? null : Math.round(toNum(o.customerPrice)),
            }));

        const inTransit = active
            .filter((o) => MOVING.includes(o.status))
            .slice(0, 30)
            .map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                ...route(o),
                driver: driverOf(o),
                plate: o.assignedDriverPlate || null,
                status: o.status,
                progress: ЭТАП_ПРОЦЕНТ[o.status] ?? 50,
            }));

        const byStatus: Record<string, number> = {};
        for (const o of active) {
            if (o.status === 'PENDING' && !o.isConfirmed) continue;
            byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
        }
        if (completedCount) byStatus.COMPLETED = completedCount;

        const calendar: Record<string, { id: string; orderNumber: string; from: string; to: string; status: OrderStatus }[]> = {};
        for (const o of loadingsInMonth) {
            const d = o.routePoints.find((p: any) => p.pointType === 'PICKUP' && p.expectedDate && p.expectedDate >= calStart && p.expectedDate < calEnd)?.expectedDate;
            if (!d) continue;
            const key = kzDateKey(d);
            (calendar[key] ??= []).push({ id: o.id, orderNumber: o.orderNumber, ...route(o), status: o.status });
        }

        // Последний переход в «Проблему» — с какого момента стоит и что написали.
        const problemSince = await this.prisma.orderStatusHistory.findMany({
            where: { orderId: { in: problems.map((o) => o.id) }, status: 'PROBLEM' },
            select: { orderId: true, changedAt: true, comment: true },
            orderBy: { changedAt: 'desc' },
        });
        const sinceOf = new Map<string, { changedAt: Date; comment: string | null }>();
        for (const h of problemSince) if (!sinceOf.has(h.orderId)) sinceOf.set(h.orderId, h);

        return {
            kpi: {
                inWork: inWork.length,
                inWorkParts: {
                    inTransit: inWork.filter((o) => o.status === 'IN_TRANSIT').length,
                    atPoints: inWork.filter((o) => AT_POINTS.includes(o.status)).length,
                    toPickup: inWork.filter((o) => TO_PICKUP.includes(o.status)).length,
                },
                pending: pending.length,
                pendingSoon: pendingSoon.length,
                problems: problems.length,
                ordersPeriod: ordersSeries[ordersSeries.length - 1] ?? 0,
                ordersPrevPeriod: ordersPrevSeries[ordersPrevSeries.length - 1] ?? 0,
            },
            series: {
                days: SERIES_DAYS,
                ...series,
                orders: ordersSeries,
                ordersPrev: ordersPrevSeries,
            },
            period: { name: opts.period, start, prevStart },
            upcoming,
            inTransit,
            byStatus,
            calendar: { month: kzDateKey(new Date(calStart.getTime() + DAY_MS / 2)).slice(0, 7), days: calendar },
            attention: {
                problems: problems.map((o) => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    ...route(o),
                    since: sinceOf.get(o.id)?.changedAt ?? o.updatedAt,
                    comment: sinceOf.get(o.id)?.comment ?? null,
                })),
                pendingSoon: pendingSoon.map((o) => ({ id: o.id, orderNumber: o.orderNumber, ...route(o), loadingDate: pickupDate(o) })),
                noTtn: completedNoTtn.map((o) => ({ id: o.id, orderNumber: o.orderNumber, completedAt: o.completedAt })),
            },
        };
    }

    // ==================== Деньги ====================

    /**
     * Выручка и маржа: за период (к тому же куску прошлого) и по неделям.
     *
     * Заявка относится к неделе и периоду по дате создания — так же, как в
     * «Активности»: иначе две таблицы на одном экране разошлись бы.
     */
    async revenue(req: Requester, opts: { period: DashboardPeriod }) {
        const { companyId } = req;
        const where = await this.scope(req);
        const now = new Date();
        const { start, prevStart, prevEnd } = periodBounds(opts.period, now);
        const weeksFrom = new Date(kzWeekStart(now).getTime() - (REVENUE_WEEKS - 1) * 7 * DAY_MS);
        const from = new Date(Math.min(weeksFrom.getTime(), prevStart.getTime()));

        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    where,
                    { OR: [{ isConfirmed: true }, { status: { not: 'PENDING' } }] },
                    { createdAt: { gte: from } },
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            select: {
                ...ORDER_FINANCE_SELECT,
                ...ORDER_FINANCE_RELATIONS_SELECT,
                createdAt: true,
            },
        });

        const weeks = Array.from({ length: REVENUE_WEEKS }, (_, i) => ({
            weekStart: new Date(weeksFrom.getTime() + i * 7 * DAY_MS),
            revenue: ZERO,
            margin: ZERO,
        }));
        let cur = { revenue: ZERO, margin: ZERO, cost: ZERO };
        let prev = { revenue: ZERO, margin: ZERO, cost: ZERO };

        for (const o of orders) {
            const fin = this.financeCalculator.computeOrderFinance({
                order: o as any,
                payments: orderFinancePayments(o as any),
                incomes: (o as any).incomes,
                expenses: (o as any).expenses,
                companyId,
            });
            const at = new Date(o.createdAt);
            if (at >= weeksFrom) {
                const idx = Math.min(REVENUE_WEEKS - 1, Math.floor((at.getTime() - weeksFrom.getTime()) / (7 * DAY_MS)));
                weeks[idx].revenue = weeks[idx].revenue.plus(fin.revenue);
                weeks[idx].margin = weeks[idx].margin.plus(fin.margin);
            }
            if (at >= start) {
                cur = { revenue: cur.revenue.plus(fin.revenue), margin: cur.margin.plus(fin.margin), cost: cur.cost.plus(fin.executorCost) };
            } else if (at >= prevStart && at < prevEnd) {
                prev = { revenue: prev.revenue.plus(fin.revenue), margin: prev.margin.plus(fin.margin), cost: prev.cost.plus(fin.executorCost) };
            }
        }

        const r = (v: any) => Math.round(toNum(v));
        return {
            period: { name: opts.period, start, prevStart },
            current: { revenue: r(cur.revenue), margin: r(cur.margin), cost: r(cur.cost) },
            previous: { revenue: r(prev.revenue), margin: r(prev.margin), cost: r(prev.cost) },
            weeks: weeks.map((w) => ({ weekStart: kzDateKey(w.weekStart), revenue: r(w.revenue), margin: r(w.margin) })),
        };
    }

    // ==================== Водители ====================

    /**
     * Свои водители сегодня: штатные и нештатные, которых завела компания.
     *
     * «В рейсе» — назначен на рейс в работе, «свободен» — активен и без рейса,
     * «не работает» — отключён в «Водителях».
     */
    async driversToday(req: Requester) {
        const { companyId } = req;
        const drivers = await this.prisma.user.findMany({
            where: {
                role: UserRole.DRIVER,
                OR: [{ companyId }, { companyId: null, baseCompanyId: companyId }],
            },
            select: { id: true, firstName: true, lastName: true, isActive: true, vehiclePlate: true, phone: true },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });
        const busy = drivers.length
            ? await this.prisma.order.findMany({
                where: { driverId: { in: drivers.map((d) => d.id) }, status: { in: IN_WORK } },
                select: {
                    id: true, orderNumber: true, status: true, driverId: true, assignedDriverPlate: true,
                    routePoints: {
                        orderBy: { sequence: 'asc' },
                        select: { location: { select: { city: true, address: true, cityRecord: { select: { name: true } } } } },
                    },
                },
            })
            : [];
        const tripOf = new Map(busy.map((o) => [o.driverId as string, o]));
        const city = (p: any) => p?.location?.cityRecord?.name || p?.location?.city || p?.location?.address || '—';

        const list = drivers.map((d) => {
            const trip = tripOf.get(d.id);
            const name = [d.lastName, d.firstName].filter(Boolean).join(' ') || 'Без имени';
            return {
                id: d.id,
                name,
                plate: trip?.assignedDriverPlate || d.vehiclePlate || null,
                state: !d.isActive ? 'off' : trip ? 'trip' : 'free',
                trip: trip
                    ? { id: trip.id, orderNumber: trip.orderNumber, status: trip.status, from: city(trip.routePoints[0]), to: city(trip.routePoints[trip.routePoints.length - 1]) }
                    : null,
            };
        });
        return {
            free: list.filter((d) => d.state === 'free').length,
            trip: list.filter((d) => d.state === 'trip').length,
            off: list.filter((d) => d.state === 'off').length,
            drivers: list,
        };
    }
}
