'use client';

import {
    Activity,
    Banknote,
    Bell,
    CalendarClock,
    CalendarDays,
    ChartColumn,
    ClipboardList,
    Clock,
    CreditCard,
    FileInput,
    ListChecks,
    Paperclip,
    TrendingUp,
    TriangleAlert,
    Truck,
    UsersRound,
    Wallet,
    type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { subscriptionView } from '@/lib/subscription-state';
import { AreaSpark, BarSpark, CHART_COLORS, DaysLeft, Parts, colorOf } from './charts';
import { PREV_LABEL, useBoardData, type Period } from './data';
import type { BlockId, KpiId, WidgetId } from './layout';
import { customTitle, hasSettings, settingsFor, useSettingsStore, type SparkKind } from './settings';

/**
 * Что за блоки и показатели есть на дашборде — по коду макета «shadcn Nova».
 *
 * `weight` — доля ширины ряда по умолчанию: «Выручка» и «Активность»
 * широкие, календарь и «Требуют внимания» — узкие.
 */
export interface WidgetMeta {
    title: string;
    /** Короткое имя — в списке «Переместить в… Ряд 2: …». */
    short?: string;
    description: string;
    icon: LucideIcon;
    weight: number;
    /** Переход на полную страницу — справа в шапке блока. */
    action?: { label: string; href: string };
}

const PERIOD_WORD: Record<Period, string> = { week: 'неделю', month: 'месяц', quarter: 'квартал' };

export function widgetMeta(id: WidgetId, period: Period = 'month'): WidgetMeta {
    return META[id](period);
}

/**
 * Название и пояснение блока — с учётом настроек: своё название, если
 * задано, и «Последние 8 недель», если у графика выбрано восемь.
 */
export function useMeta() {
    const { period } = useBoardData();
    const { all } = useSettingsStore();
    return useCallback((id: WidgetId): WidgetMeta => {
        const m = widgetMeta(id, period);
        let description = m.description;
        if (id === 'chart') {
            const w = Number(settingsFor('chart', all.chart).weeks);
            description = `Последние ${w} ${plural(w, 'неделя', 'недели', 'недель')}, ₸`;
        }
        const own = customTitle(all, id);
        return own ? { ...m, title: own, short: own, description } : { ...m, description };
    }, [period, all]);
}

const META: Record<WidgetId, (p: Period) => WidgetMeta> = {
    // ---------- показатели ----------
    inWork: () => ({ title: 'Сейчас в работе', description: 'Сколько рейсов едет прямо сейчас и на каком они этапе', icon: Truck, weight: 1 }),
    pending: () => ({ title: 'Ожидают', description: 'Заявки без исполнителя — их надо назначить', icon: Clock, weight: 1 }),
    problems: () => ({ title: 'Проблемы', description: 'Рейсы с проблемой, которые требуют решения', icon: TriangleAlert, weight: 1 }),
    ordersMonth: (p) => ({ title: `Заявок за ${PERIOD_WORD[p]}`, description: 'Создано с начала периода, к тому же дню прошлого', icon: ClipboardList, weight: 1 }),
    revenue: () => ({ title: 'Выручка', description: 'Выручка с заявок за период и рост к прошлому', icon: TrendingUp, weight: 1 }),
    receivables: () => ({ title: 'Дебиторка', description: 'Сколько вам должны и как давно', icon: Wallet, weight: 1 }),
    payroll: () => ({ title: 'Заработано за месяц', description: 'Оклад, процент и премии с начала месяца', icon: Banknote, weight: 1 }),
    tariff: () => ({ title: 'Тариф', description: 'До какого числа оплачена подписка и сколько осталось', icon: CreditCard, weight: 1 }),
    // ---------- блоки ----------
    chart: () => ({ title: 'Выручка и маржа по неделям', short: 'Выручка и маржа', description: 'Последние 12 недель, ₸', icon: ChartColumn, weight: 3 }),
    calendar: () => ({ title: 'Календарь погрузок', short: 'Календарь', description: 'Сколько погрузок в какой день', icon: CalendarDays, weight: 1 }),
    upcoming: () => ({ title: 'Ближайшие погрузки', description: 'Назначенные и ждущие исполнителя', icon: ListChecks, weight: 2, action: { label: 'Все заявки', href: '/company/orders' } }),
    attention: () => ({ title: 'Требуют внимания', description: 'Сначала — то, что стоит денег', icon: TriangleAlert, weight: 1 }),
    inTransit: () => ({ title: 'Сейчас в пути', description: 'Рейсы, которые едут прямо сейчас', icon: Truck, weight: 2, action: { label: 'Все заявки', href: '/company/orders' } }),
    debtors: () => ({ title: 'Должники', description: 'Кто и сколько должен, с просрочкой', icon: Wallet, weight: 1 }),
    drivers: () => ({ title: 'Водители сегодня', short: 'Водители', description: 'Кто свободен, кто в рейсе', icon: UsersRound, weight: 1 }),
    byStatus: () => ({ title: 'Заявки по статусам', description: 'Сколько рейсов на каждом этапе', icon: ChartColumn, weight: 2 }),
    paymentCalendar: () => ({ title: 'Платёжный календарь', description: 'Что приходит и что уходит', icon: CalendarClock, weight: 2 }),
    activity: () => ({ title: 'Активность', description: 'Сегодня, прошлый и этот месяц', icon: Activity, weight: 3, action: { label: 'Все заявки', href: '/company/orders' } }),
    earnings: () => ({ title: 'Заработок за месяц', description: 'Кто сколько заработал', icon: Banknote, weight: 2 }),
    pendingWork: () => ({ title: 'Требует оформления', description: 'Хвосты между рейсами и бухгалтерией', icon: ClipboardList, weight: 2 }),
    incomingInvoices: () => ({ title: 'Входящие счета', description: 'Что пришло и ещё не оплачено', icon: FileInput, weight: 2 }),
    paymentProofs: () => ({ title: 'Чеки от контрагентов', short: 'Чеки', description: 'Подтверждения оплаты на проверку', icon: Paperclip, weight: 2 }),
    events: () => ({ title: 'Последние события', short: 'События', description: 'Смена статусов по заявкам', icon: Bell, weight: 1 }),
};

// ==================== Показатели: что в плашке ====================

export interface KpiView {
    value: React.ReactNode;
    hint?: string;
    tone?: 'warn' | 'neg';
    urgent?: boolean;
    delta?: { text: string; tone: 'good' | 'bad' | 'flat' };
    /** Мини-график в узкой плашке. */
    mini?: React.ReactNode;
    /** Развёрнутый вид, когда плашку растянули в высокий ряд. */
    chart?: React.ReactNode;
    /** Кнопка в плашке («Продлить»). */
    action?: { label: string; onClick: () => void };
    /** Нет данных: идёт загрузка или не удалось. */
    state?: 'loading' | 'failed';
}

export const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
/** «29,7 млн», «850 тыс» — для чисел в узких местах. */
export function short(n: number): string {
    const a = Math.abs(n);
    if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} млн`;
    if (a >= 1_000) return `${Math.round(n / 1_000)} тыс`;
    return String(Math.round(n));
}
const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 100) : null);
/** «рейс / рейса / рейсов». */
export function plural(n: number, one: string, few: string, many: string) {
    const t = n % 100;
    const o = n % 10;
    if (t > 10 && t < 20) return many;
    if (o === 1) return one;
    if (o >= 2 && o <= 4) return few;
    return many;
}

/** Плашка: число, подсказка, рост и график — по живым данным. */
export function useKpi(id: KpiId, onBuy?: () => void): KpiView {
    const data = useBoardData();
    // Цвет и вид мини-графика — из настроек плашки.
    const raw = useSettingsStore().all[id];
    const look = useMemo(() => (hasSettings(id) ? settingsFor(id, raw) as Look : {}), [id, raw]);
    // Кнопка «Продлить» — через ссылку: её обработчик новый на каждой
    // отрисовке и не должен пересобирать график.
    const buy = useRef(onBuy);
    buy.current = onBuy;
    const { orders, revenue, planned, payroll, mySalary, billing, period } = data;
    // Тот же объект, пока данные те же: React тогда не перерисовывает
    // мини-график, когда дашборд перерисовывается из-за перетаскивания.
    return useMemo(
        () => kpiView(id, data, look, buy.current ? () => buy.current?.() : undefined),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [id, orders, revenue, planned, payroll, mySalary, billing, period, look, !!onBuy],
    );
}

/** Как нарисовать плашку: цвет и вид мини-графика из настроек. */
interface Look { color?: string; spark?: SparkKind; compare?: boolean }

/** Мини-график плашки: линия с заливкой или столбики — как выбрано в настройках. */
function spark(look: Look, fallback: string, data: number[], o: { mini?: boolean; label?: string; prev?: number[]; prevLabel?: string; format?: (v: number) => string } = {}) {
    const color = look.color ? colorOf(look.color) : fallback;
    if (look.spark === 'bars') return <BarSpark data={data} color={color} mini={o.mini} label={o.label} />;
    return <AreaSpark data={data} prev={o.prev} color={color} mini={o.mini} label={o.label} prevLabel={o.prevLabel} format={o.format} />;
}

function kpiView(id: KpiId, d: ReturnType<typeof useBoardData>, look: Look, onBuy?: () => void): KpiView {
    const { orders, revenue, planned, payroll, mySalary, billing, period } = d;
    const tint = (fallback: string) => (look.color ? colorOf(look.color) : fallback);
    const k = orders.data?.kpi;
    const s = orders.data?.series;
    const ordersState = orders.loading && !orders.data ? 'loading' : orders.failed || orders.denied ? 'failed' : undefined;

    switch (id) {
        case 'inWork': {
            if (!k || !s) return { value: '—', state: ordersState ?? 'loading' };
            const yesterday = s.inWork[s.inWork.length - 2] ?? k.inWork;
            const d = k.inWork - yesterday;
            return {
                value: k.inWork,
                hint: `${k.inWorkParts.inTransit} в пути · ${k.inWorkParts.atPoints} на точках · ${k.inWorkParts.toPickup} едут`,
                delta: { text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} ко вчера`, tone: 'flat' },
                mini: spark(look, CHART_COLORS.sky, s.inWork, { mini: true }),
                chart: (
                    <div className="flex h-full min-h-0 flex-col gap-2">
                        <div className="min-h-0 flex-1">{spark(look, CHART_COLORS.sky, s.inWork, { label: 'Рейсов в работе' })}</div>
                        <Parts parts={[
                            { label: 'В пути', value: k.inWorkParts.inTransit, color: tint(CHART_COLORS.sky) },
                            { label: 'На точках', value: k.inWorkParts.atPoints, color: CHART_COLORS.violet },
                            { label: 'Едут на погрузку', value: k.inWorkParts.toPickup, color: CHART_COLORS.slate },
                        ]} />
                    </div>
                ),
            };
        }
        case 'pending': {
            if (!k || !s) return { value: '—', state: ordersState ?? 'loading' };
            const d = k.pending - (s.pending[s.pending.length - 2] ?? k.pending);
            return {
                value: k.pending,
                hint: k.pendingSoon ? `${k.pendingSoon} — погрузка сегодня или завтра` : k.pending ? 'погрузка не скоро' : 'всё назначено',
                tone: k.pending > 0 ? 'warn' : undefined,
                delta: { text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} ко вчера`, tone: d > 0 ? 'bad' : d < 0 ? 'good' : 'flat' },
                mini: spark(look, CHART_COLORS.amber, s.pending, { mini: true }),
                chart: spark(look, CHART_COLORS.amber, s.pending, { label: 'Ждут исполнителя' }),
            };
        }
        case 'problems': {
            if (!k || !s) return { value: '—', state: ordersState ?? 'loading' };
            const d = k.problems - (s.problems[s.problems.length - 2] ?? k.problems);
            const first = orders.data?.attention.problems[0];
            return {
                value: k.problems,
                hint: first ? `${first.orderNumber}${first.comment ? ` — ${first.comment}` : ''}` : 'нет проблемных рейсов',
                tone: k.problems > 0 ? 'neg' : undefined,
                delta: { text: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)} ко вчера`, tone: d > 0 ? 'bad' : d < 0 ? 'good' : 'flat' },
                mini: spark(look, CHART_COLORS.red, s.problems, { mini: true }),
                chart: spark(look, CHART_COLORS.red, s.problems, { label: 'Проблемных рейсов' }),
            };
        }
        case 'ordersMonth': {
            if (!k || !s) return { value: '—', state: ordersState ?? 'loading' };
            const d = k.ordersPeriod - k.ordersPrevPeriod;
            const since = orders.data ? new Date(orders.data.period.start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
            return {
                value: k.ordersPeriod,
                hint: `с ${since}`,
                delta: { text: `${d >= 0 ? '+' : '−'}${Math.abs(d)} ${PREV_LABEL[period]}`, tone: d > 0 ? 'good' : d < 0 ? 'bad' : 'flat' },
                mini: spark(look, CHART_COLORS.violet, s.orders, { mini: true, prev: look.compare === false ? undefined : s.ordersPrev }),
                chart: spark(look, CHART_COLORS.violet, s.orders, { label: 'Этот период', prev: look.compare === false ? undefined : s.ordersPrev, prevLabel: 'Прошлый период' }),
            };
        }
        case 'revenue': {
            const r = revenue.data;
            if (!r) return { value: '—', state: revenue.loading ? 'loading' : 'failed' };
            const p = pct(r.current.revenue, r.previous.revenue);
            const weekly = r.weeks.map((w) => w.revenue);
            return {
                value: `${short(r.current.revenue)} ₸`,
                hint: `маржа ${short(r.current.margin)} ₸${p != null ? ` · ${p >= 0 ? '+' : '−'}${Math.abs(p)}% ${PREV_LABEL[period]}` : ''}`,
                delta: p != null ? { text: `${p >= 0 ? '+' : '−'}${Math.abs(p)}%`, tone: p > 0 ? 'good' : p < 0 ? 'bad' : 'flat' } : undefined,
                mini: spark(look, CHART_COLORS.emerald, weekly, { mini: true }),
                chart: spark(look, CHART_COLORS.emerald, weekly, { label: 'Выручка за неделю', format: (v) => `${fmt(v)} ₸` }),
            };
        }
        case 'receivables': {
            const pl = planned.data;
            if (!pl) return { value: '—', state: planned.loading ? 'loading' : 'failed' };
            const a = agingOf(pl.rows, pl.withoutInvoice?.totalIn ?? 0);
            const overdueCount = pl.rows.filter((r) => r.direction === 'IN' && r.isOverdue).length;
            return {
                value: `${short(a.total)} ₸`,
                hint: overdueCount ? `${overdueCount} ${plural(overdueCount, 'счёт просрочен', 'счёта просрочены', 'счетов просрочены')}` : 'просрочки нет',
                tone: a.overdue30 > 0 ? 'neg' : undefined,
                chart: (
                    <div className="flex h-full min-h-0 flex-col justify-end gap-3">
                        <Parts parts={[
                            { label: 'в срок', value: a.onTime, color: CHART_COLORS.emerald, text: short(a.onTime) },
                            { label: 'просрочка до 30 дн', value: a.overdue, color: CHART_COLORS.amber, text: short(a.overdue) },
                            { label: 'больше 30 дн', value: a.overdue30, color: CHART_COLORS.red, text: short(a.overdue30) },
                            { label: 'без счёта', value: a.noInvoice, color: CHART_COLORS.slate, text: short(a.noInvoice) },
                        ]} />
                    </div>
                ),
            };
        }
        case 'payroll': {
            if (payroll.data) {
                const t = payroll.data.totals;
                const n = payroll.data.report.filter((r) => r.total > 0).length;
                return {
                    value: `${fmt(t.total)} ₸`,
                    hint: `${n} ${plural(n, 'сотрудник', 'сотрудника', 'сотрудников')}`,
                    chart: (
                        <div className="flex h-full min-h-0 flex-col justify-end gap-3">
                            <Parts parts={[
                                { label: 'Оклад', value: t.salary, color: CHART_COLORS.slate, text: fmt(t.salary) },
                                { label: 'Процент', value: t.percentTotal, color: CHART_COLORS.emerald, text: fmt(t.percentTotal) },
                                { label: 'Премии', value: t.kpiTotal, color: CHART_COLORS.amber, text: fmt(t.kpiTotal) },
                            ]} />
                        </div>
                    ),
                };
            }
            if (mySalary.data) {
                return { value: `${fmt(mySalary.data.total)} ₸`, hint: mySalary.data.hasScheme ? 'ваш заработок с начала месяца' : 'схема оплаты не задана' };
            }
            return { value: '—', state: payroll.loading || mySalary.loading ? 'loading' : 'failed' };
        }
        case 'tariff': {
            const st = billing.data;
            if (!st) return { value: '—', state: billing.loading ? 'loading' : 'failed' };
            const v = subscriptionView(st);
            const left = (st as any).daysLeft as number | null | undefined;
            return {
                value: v.value,
                hint: v.sub,
                urgent: v.urgent,
                action: v.action && onBuy ? { label: v.action, onClick: onBuy } : undefined,
                chart: left != null && left >= 0 ? <DaysLeft left={left} total={Math.max(30, left)} color={tint(CHART_COLORS.sky)} /> : undefined,
            };
        }
    }
}

/**
 * Долг заказчиков по давности — из планируемых платежей, тех же, что у
 * журнала счетов и платёжного календаря: цифры на дашборде обязаны
 * совпадать с журналом.
 */
export function agingOf(rows: { direction: string; amount: number; dueDate: string | null; isOverdue: boolean }[], noInvoice: number) {
    const today = new Date();
    let onTime = 0, overdue = 0, overdue30 = 0;
    for (const r of rows) {
        if (r.direction !== 'IN') continue;
        if (!r.isOverdue) { onTime += r.amount; continue; }
        const days = r.dueDate ? Math.floor((today.getTime() - new Date(r.dueDate).getTime()) / 86_400_000) : 0;
        if (days > 30) overdue30 += r.amount;
        else overdue += r.amount;
    }
    return { onTime, overdue, overdue30, noInvoice, total: onTime + overdue + overdue30 + noInvoice };
}

export type { KpiId, BlockId };
