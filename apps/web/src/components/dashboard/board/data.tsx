'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { fetchPlannedPayments, type PlannedRow, type PlannedTotals, type WithoutInvoice } from '@/lib/planned-payments';
import type { BillingStatus } from '@/lib/subscription-state';
import type { WidgetId } from './layout';

/**
 * Данные дашборда — одним местом на все блоки.
 *
 * Многие блоки читают одно и то же: «Сейчас в работе», «Ближайшие погрузки»
 * и «Требуют внимания» — один ответ сервера по заявкам; плашка «Выручка» и
 * график по неделям — один ответ по деньгам. Грузить каждому своё значило
 * бы ходить на сервер по одному и тому же по три раза.
 *
 * Грузим только то, что нужно блокам на экране: убрал «Должников» —
 * планируемые платежи не запрашиваются вовсе.
 */

export type Period = 'week' | 'month' | 'quarter';

export const PERIOD_LABEL: Record<Period, string> = { week: 'Эта неделя', month: 'Этот месяц', quarter: 'Квартал' };
/** Как назвать прошлый период в подписи «к …». */
export const PREV_LABEL: Record<Period, string> = { week: 'к прошлой неделе', month: 'к прошлому месяцу', quarter: 'к прошлому кварталу' };

export interface OrderBrief {
    id: string;
    orderNumber: string;
    from: string;
    to: string;
    status: string;
}

export interface OrdersOverview {
    kpi: {
        inWork: number;
        inWorkParts: { inTransit: number; atPoints: number; toPickup: number };
        pending: number;
        pendingSoon: number;
        problems: number;
        ordersPeriod: number;
        ordersPrevPeriod: number;
    };
    series: { days: number; inWork: number[]; pending: number[]; problems: number[]; orders: number[]; ordersPrev: number[] };
    period: { name: Period; start: string; prevStart: string };
    upcoming: (OrderBrief & { loadingDate: string | null; price: number | null })[];
    inTransit: (OrderBrief & { driver: string | null; plate: string | null; progress: number })[];
    byStatus: Record<string, number>;
    calendar: { month: string; days: Record<string, OrderBrief[]> };
    attention: {
        problems: (OrderBrief & { since: string; comment: string | null })[];
        pendingSoon: (Omit<OrderBrief, 'status'> & { loadingDate: string | null })[];
        noTtn: { id: string; orderNumber: string; completedAt: string }[];
    };
}

export interface RevenueOverview {
    period: { name: Period; start: string; prevStart: string };
    current: { revenue: number; margin: number; cost: number };
    previous: { revenue: number; margin: number; cost: number };
    weeks: { weekStart: string; revenue: number; margin: number }[];
}

export interface ActivityBucket {
    created: number;
    completed: number;
    revenue: number;
    cost: number;
    margin: number;
    activeCustomers: number;
    activeCarriers: number;
}

export interface DashboardActivity {
    today: ActivityBucket;
    current: ActivityBucket;
    previous: ActivityBucket;
    previousSame?: ActivityBucket;
    previousSameEnd?: string;
    months?: { current: string; previous: string };
}

export interface DriversToday {
    free: number;
    trip: number;
    off: number;
    drivers: { id: string; name: string; plate: string | null; state: 'free' | 'trip' | 'off'; trip: OrderBrief | null }[];
}

export interface PayrollReport {
    report: { userId: string; name: string; role: string; salary: number; percentTotal: number; kpiTotal: number; total: number; ordersCount: number }[];
    totals: { salary: number; percentTotal: number; kpiTotal: number; total: number };
}

export interface Planned {
    rows: PlannedRow[];
    totals: PlannedTotals | null;
    withoutInvoice: WithoutInvoice | null;
}

/** Ответ загрузки: данные, ошибка или «вам не открыто». */
export interface Loaded<T> {
    data: T | null;
    loading: boolean;
    denied: boolean;
    failed: boolean;
}

const idle = <T,>(): Loaded<T> => ({ data: null, loading: false, denied: false, failed: false });

function useLoad<T>(enabled: boolean, key: string, fetcher: () => Promise<T>): Loaded<T> {
    const [st, setSt] = useState<Loaded<T>>(idle<T>());
    useEffect(() => {
        if (!enabled) return;
        let alive = true;
        setSt((s) => ({ ...s, loading: true, failed: false }));
        fetcher()
            .then((data) => { if (alive) setSt({ data, loading: false, denied: false, failed: false }); })
            .catch((e: any) => {
                if (!alive) return;
                const status = e?.response?.status;
                setSt({ data: null, loading: false, denied: status === 403, failed: status !== 403 });
            });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, key]);
    return st;
}

interface BoardData {
    period: Period;
    setPeriod: (p: Period) => void;
    orders: Loaded<OrdersOverview>;
    revenue: Loaded<RevenueOverview>;
    activity: Loaded<DashboardActivity>;
    drivers: Loaded<DriversToday>;
    payroll: Loaded<PayrollReport>;
    mySalary: Loaded<{ total: number; hasScheme: boolean }>;
    planned: Loaded<Planned>;
    billing: Loaded<BillingStatus>;
    reloadBilling: () => void;
}

const Ctx = createContext<BoardData | null>(null);

export function useBoardData(): BoardData {
    const v = useContext(Ctx);
    if (!v) throw new Error('useBoardData вне BoardDataProvider');
    return v;
}

/** Каким данным какие блоки нужны. */
const NEEDS: Record<string, WidgetId[]> = {
    orders: ['inWork', 'pending', 'problems', 'ordersMonth', 'upcoming', 'inTransit', 'byStatus', 'calendar', 'attention'],
    revenue: ['revenue', 'chart'],
    activity: ['activity'],
    drivers: ['drivers'],
    payroll: ['payroll'],
    planned: ['receivables', 'debtors', 'attention'],
    billing: ['tariff'],
};

export function BoardDataProvider({ visible, canPlanned, payrollCompany, children }: {
    visible: WidgetId[];
    /** Планируемые платежи открыты (право «Бухгалтерия»). */
    canPlanned: boolean;
    /** Заработок всей компании открыт (блок «Заработок сотрудников»), иначе — свой. */
    payrollCompany: boolean;
    children: React.ReactNode;
}) {
    const [period, setPeriod] = useState<Period>('month');
    const [billingKey, setBillingKey] = useState(0);
    const need = (k: keyof typeof NEEDS) => NEEDS[k].some((id) => visible.includes(id));

    const orders = useLoad<OrdersOverview>(need('orders'), `orders:${period}`, () =>
        api.get('/company/dashboard/orders', { params: { period } }).then((r) => r.data));
    const revenue = useLoad<RevenueOverview>(need('revenue'), `revenue:${period}`, () =>
        api.get('/company/dashboard/revenue', { params: { period } }).then((r) => r.data));
    const activity = useLoad<DashboardActivity>(need('activity'), 'activity', () =>
        api.get('/company/dashboard-activity').then((r) => r.data));
    const drivers = useLoad<DriversToday>(need('drivers'), 'drivers', () =>
        api.get('/company/dashboard/drivers').then((r) => r.data));
    const payroll = useLoad<PayrollReport>(need('payroll') && payrollCompany, 'payroll', () =>
        api.get('/payroll/report').then((r) => r.data));
    const mySalary = useLoad<{ total: number; hasScheme: boolean }>(need('payroll') && !payrollCompany, 'my-salary', () =>
        api.get('/payroll/my/summary').then((r) => r.data));
    const planned = useLoad<Planned>(need('planned') && canPlanned, 'planned', () => fetchPlannedPayments());
    const billing = useLoad<BillingStatus>(need('billing'), `billing:${billingKey}`, () =>
        api.get('/billing/status').then((r) => r.data));

    const value = useMemo<BoardData>(() => ({
        period, setPeriod, orders, revenue, activity, drivers, payroll, mySalary, planned, billing,
        reloadBilling: () => setBillingKey((k) => k + 1),
    }), [period, orders, revenue, activity, drivers, payroll, mySalary, planned, billing]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
