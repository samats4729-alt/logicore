'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { monthLabel } from '@/lib/ru-date';
import StatusPill, { STATUS_LABELS } from '@/components/ui/StatusPill';
import { Button } from '@/components/ui/button';
import { RevenueChart, StatusChart, colorOf } from './charts';
import { useSize } from './dnd';
import { useBoardData, type OrderBrief, type OrdersOverview } from './data';
import { useBlockSettings, useExpanded } from './settings';
import { agingOf, fmt, plural, short } from './widgets';

/**
 * Тела новых блоков дашборда — по коду макета «shadcn Nova», на живых
 * данных платформы. Рамку, шапку и меню блоку даёт `BlockFrame`.
 */

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** `YYYY-MM-DD` по календарю браузера — для клеток календаря. */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }).replace('.', '') : '—');

/** Пусто, загрузка, ошибка — посередине блока, словами. */
export function BlockNote({ children }: { children: React.ReactNode }) {
    return <div className="grid min-h-0 flex-1 place-items-center px-4 py-6 text-center text-[13px] text-muted-foreground">{children}</div>;
}

function Loading() {
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-7 animate-pulse rounded-md bg-muted" />)}
        </div>
    );
}

/** Общий исход загрузки: скелет, «не открыто», «не удалось». */
function useOrders() {
    const { orders } = useBoardData();
    const fallback = orders.loading && !orders.data ? <Loading />
        : orders.denied ? <BlockNote>Раздел «Заявки» вам не открыт</BlockNote>
            : orders.failed ? <BlockNote>Не удалось загрузить заявки. Обновите страницу.</BlockNote>
                : !orders.data ? <Loading /> : null;
    return { data: orders.data, fallback };
}

const Table = ({ children }: { children: React.ReactNode }) => (
    <div className="relative w-full overflow-x-auto">
        <table className="w-full caption-bottom border-collapse text-[13px]">{children}</table>
    </div>
);
const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <th className={cn('h-9 whitespace-nowrap border-0 border-b border-solid border-border px-2 text-left align-middle text-[12px] font-medium text-muted-foreground', className)}>{children}</th>
);
const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <td className={cn('whitespace-nowrap border-0 border-b border-solid border-border px-2 py-2 align-middle', className)}>{children}</td>
);

// ==================== Выручка и маржа по неделям ====================

/** «6–12 окт», «29 сен – 5 окт» — неделя словами для таблицы. */
function weekRange(weekStart: string) {
    const a = new Date(weekStart + 'T00:00:00');
    const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
    return a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`
        : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
}

const SERIES_NAME = { revenue: 'Выручка', margin: 'Маржа' } as const;

export function ChartBlock() {
    const { revenue } = useBoardData();
    const st = useBlockSettings('chart');
    const expanded = useExpanded();
    const weeks = useMemo(() => {
        let prevMonth = -1;
        return (revenue.data?.weeks ?? []).map((w) => {
            const d = new Date(w.weekStart + 'T00:00:00');
            const n = Math.floor((d.getDate() - 1) / 7) + 1;
            const label = d.getMonth() !== prevMonth ? `${n} нед. ${MONTHS_SHORT[d.getMonth()]}` : `${n} нед.`;
            prevMonth = d.getMonth();
            return { label, weekStart: w.weekStart, revenue: w.revenue, margin: w.margin };
        });
    }, [revenue.data]);
    const n = Number(st.weeks);
    const data = weeks.slice(-n);
    const colors = { revenue: colorOf(st.revenueColor), margin: colorOf(st.marginColor) };
    if (revenue.loading && !revenue.data) return <Loading />;
    if (revenue.denied) return <BlockNote>Этот блок вам не открыт — его выдаёт руководитель в «Сотрудниках»</BlockNote>;
    if (!revenue.data) return <BlockNote>Не удалось загрузить выручку. Обновите страницу.</BlockNote>;
    if (data.every((w) => !w.revenue)) return <BlockNote>За последние {n} {plural(n, 'неделю', 'недели', 'недель')} выручки нет</BlockNote>;
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="min-h-0 flex-1" style={expanded ? { minHeight: 240 } : undefined}>
                <RevenueChart data={data} kind={st.kind} series={st.series} colors={colors} values={st.values} />
            </div>
            <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
                {st.series.map((k) => (
                    <span key={k} className="flex items-center gap-1.5">
                        <i className="size-2 rounded-[2px]" style={{ background: colors[k] }} /> {SERIES_NAME[k]}, млн ₸
                    </span>
                ))}
            </div>
            {/* Открыли крупно — под графиком те же недели цифрами. */}
            {expanded && <WeeksTable data={data} />}
        </div>
    );
}

function WeeksTable({ data }: { data: { weekStart: string; revenue: number; margin: number }[] }) {
    const total = data.reduce((s, w) => ({ revenue: s.revenue + w.revenue, margin: s.margin + w.margin }), { revenue: 0, margin: 0 });
    const share = (m: number, r: number) => (r ? `${Math.round((m / r) * 100)}%` : '—');
    return (
        <div className="max-h-[42%] shrink-0 overflow-auto" data-weeks-table>
            <Table>
                <thead className="sticky top-0 z-[1] bg-card">
                    <tr>
                        <Th>Неделя</Th>
                        <Th className="text-right">Выручка, ₸</Th>
                        <Th className="text-right">Маржа, ₸</Th>
                        <Th className="text-right">Маржа, %</Th>
                    </tr>
                </thead>
                <tbody>
                    {[...data].reverse().map((w) => (
                        <tr key={w.weekStart} className="transition-colors hover:bg-muted/50">
                            <Td>{weekRange(w.weekStart)}</Td>
                            <Td className="text-right tabular-nums">{fmt(w.revenue)}</Td>
                            <Td className="text-right tabular-nums">{fmt(w.margin)}</Td>
                            <Td className="text-right tabular-nums text-muted-foreground">{share(w.margin, w.revenue)}</Td>
                        </tr>
                    ))}
                    <tr className="bg-muted/50 font-semibold">
                        <Td>Итого за {data.length} {plural(data.length, 'неделю', 'недели', 'недель')}</Td>
                        <Td className="text-right tabular-nums">{fmt(total.revenue)}</Td>
                        <Td className="text-right tabular-nums">{fmt(total.margin)}</Td>
                        <Td className="text-right tabular-nums">{share(total.margin, total.revenue)}</Td>
                    </tr>
                </tbody>
            </Table>
        </div>
    );
}

// ==================== Календарь месяца (общий для погрузок) ====================

interface CellInfo { date: Date; key: string; inMonth: boolean; selected: boolean; today: boolean; layout: 'col' | 'row' | 'compact'; big: boolean }

function monthGrid(month: Date): Date[] {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil((lead + days) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - lead + i));
}

const GAP = 4;

/**
 * Сетка месяца, которая сама выбирает вид по размеру блока (как в макете):
 * широкие клетки — число сверху и отметки снизу, средние — в строку,
 * узкие — компактно.
 */
function MonthCalendar({ month, onMonth, selected, onSelect, renderCell, extra }: {
    month: Date;
    onMonth: (d: Date) => void;
    selected: Date | null;
    onSelect: (d: Date) => void;
    renderCell: (c: CellInfo) => React.ReactNode;
    extra?: React.ReactNode;
}) {
    const cells = monthGrid(month);
    const weeks = cells.length / 7;
    const [ref, size] = useSize<HTMLDivElement>();
    const cw = (size.w - 24) / 7;
    const ch = (size.h - GAP * (weeks - 1)) / weeks;
    const layout: CellInfo['layout'] = cw >= 72 && ch >= 62 ? 'col' : cw >= 72 && ch >= 38 ? 'row' : 'compact';
    const big = layout === 'col';
    const todayKey = dayKey(new Date());
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <div className="whitespace-nowrap text-sm font-semibold">
                    {MONTHS[month.getMonth()]} <span className="font-normal text-muted-foreground">{month.getFullYear()}</span>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                    {extra}
                    <Button type="button" variant="ghost" size="icon" aria-label="Предыдущий месяц" className="size-7" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                        <ChevronLeft className="size-4" />
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-md px-2.5 text-[12px]" onClick={() => { const t = new Date(); onMonth(new Date(t.getFullYear(), t.getMonth(), 1)); }}>
                        Сегодня
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Следующий месяц" className="size-7" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground" style={{ columnGap: GAP }}>
                {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
            </div>
            <div ref={ref} className="grid min-h-0 flex-1 grid-cols-7" style={{ gap: GAP, gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
                {cells.map((d) => {
                    const key = dayKey(d);
                    const inMonth = d.getMonth() === month.getMonth();
                    const isSel = !!selected && dayKey(selected) === key;
                    const isToday = key === todayKey;
                    return (
                        <button
                            type="button"
                            key={key}
                            data-day={key}
                            onClick={() => onSelect(d)}
                            className={cn(
                                'relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-solid text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                                layout === 'col' && 'items-stretch border-border bg-card hover:bg-muted/50',
                                layout === 'row' && 'flex-row items-center justify-between border-border bg-card px-1.5 hover:bg-muted/50',
                                layout === 'compact' && 'items-center justify-center border-transparent bg-transparent hover:bg-muted',
                                !inMonth && 'opacity-40',
                                isSel && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
                            )}
                        >
                            <span className={cn(
                                'inline-flex shrink-0 items-center justify-center rounded-full text-[13px] tabular-nums',
                                big ? 'm-1.5 size-6' : 'size-6',
                                isToday && !isSel && 'bg-primary font-semibold text-primary-foreground',
                            )}>
                                {d.getDate()}
                            </span>
                            {renderCell({ date: d, key, inMonth, selected: isSel, today: isToday, layout, big })}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ==================== Календарь погрузок ====================

export function LoadingCalendarBlock() {
    const router = useRouter();
    const { orders } = useBoardData();
    const st = useBlockSettings('calendar');
    const dot = colorOf(st.color);
    // «Без исполнителя» — только те погрузки, на которые ещё никого не назначили.
    const pick = (list: OrderBrief[] | undefined) => (list ?? []).filter((o) => st.only === 'all' || o.status === 'PENDING');
    const now = new Date();
    const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
    const [selected, setSelected] = useState<Date | null>(now);
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    // Текущий месяц приходит вместе с остальным по заявкам; другой — своим запросом.
    const [other, setOther] = useState<OrdersOverview['calendar'] | null>(null);
    useEffect(() => {
        if (orders.data?.calendar.month === monthKey) { setOther(null); return; }
        let alive = true;
        api.get('/company/dashboard/orders', { params: { month: monthKey } })
            .then((r) => { if (alive) setOther(r.data.calendar); })
            .catch(() => { if (alive) setOther({ month: monthKey, days: {} }); });
        return () => { alive = false; };
    }, [monthKey, orders.data?.calendar.month]);
    const cal = orders.data?.calendar.month === monthKey ? orders.data.calendar : other;

    if (orders.loading && !orders.data) return <Loading />;
    if (orders.denied) return <BlockNote>Раздел «Заявки» вам не открыт</BlockNote>;

    const dayList = selected && cal ? pick(cal.days[dayKey(selected)]) : [];
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <MonthCalendar
                month={month}
                onMonth={setMonth}
                selected={selected}
                onSelect={setSelected}
                renderCell={({ key, selected: sel, layout, big }) => {
                    const n = pick(cal?.days[key]).length;
                    if (!n) return null;
                    const dots = Math.min(n, big ? 5 : 3);
                    return (
                        <span className={cn('flex items-center justify-center gap-[3px]', layout === 'col' && 'mb-2 mt-auto', layout === 'compact' && '-mt-0.5', layout === 'row' && 'pr-1')} title={`${n} ${plural(n, 'погрузка', 'погрузки', 'погрузок')}`}>
                            {Array.from({ length: dots }, (_, i) => (
                                <span key={i} className={cn('rounded-full', big ? 'size-1.5' : 'size-1', sel && 'bg-primary-foreground')} style={sel ? undefined : { background: dot }} />
                            ))}
                        </span>
                    );
                }}
            />
            {selected && dayList.length > 0 && (
                <div className="max-h-[40%] shrink-0 overflow-auto border-0 border-t border-solid border-border px-3 py-1.5">
                    <div className="py-1 text-[11px] font-medium text-muted-foreground">
                        {selected.getDate()} {MONTHS_GEN[selected.getMonth()]} — {dayList.length} {plural(dayList.length, 'погрузка', 'погрузки', 'погрузок')}
                    </div>
                    {dayList.map((o) => (
                        <button key={o.id} type="button" onClick={() => router.push(`/company/orders/${o.id}`)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-[12px] hover:bg-muted/50">
                            <b className="font-medium tabular-nums">{o.orderNumber}</b>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.from} → {o.to}</span>
                            <StatusPill status={o.status} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ==================== Ближайшие погрузки ====================

export function UpcomingBlock() {
    const router = useRouter();
    const { data, fallback } = useOrders();
    const st = useBlockSettings('upcoming');
    if (fallback) return fallback;
    const all = data!.upcoming.filter((o) => st.only === 'all' || o.status === 'PENDING');
    const rows = st.limit === 'all' ? all : all.slice(0, Number(st.limit));
    const col = (c: 'date' | 'status' | 'price') => st.columns.includes(c);
    if (!rows.length) {
        return (
            <BlockNote>
                {st.only === 'pending' ? 'Все ближайшие погрузки назначены — без исполнителя ничего нет' : 'Ближайших погрузок нет — все рейсы уже в пути или завершены'}
            </BlockNote>
        );
    }
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">
                <Table>
                    <thead className="sticky top-0 z-[1] bg-card">
                        <tr>
                            <Th>Заявка</Th>
                            <Th>Маршрут</Th>
                            {col('date') && <Th>Погрузка</Th>}
                            {col('status') && <Th>Статус</Th>}
                            {col('price') && <Th className="text-right">Ставка</Th>}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((o) => (
                            <tr key={o.id} className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => router.push(`/company/orders/${o.id}`)}>
                                <Td className="font-medium tabular-nums">{o.orderNumber}</Td>
                                <Td>{o.from} → {o.to}</Td>
                                {col('date') && <Td className="tabular-nums">{shortDate(o.loadingDate)}</Td>}
                                {col('status') && <Td><StatusPill status={o.status} /></Td>}
                                {col('price') && <Td className="text-right tabular-nums">{o.price != null ? `${fmt(o.price)} ₸` : '—'}</Td>}
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </div>
            {all.length > rows.length && (
                <Link href="/company/orders" className="shrink-0 border-0 border-t border-solid border-border px-4 py-2 text-xs text-muted-foreground no-underline hover:bg-muted/50 hover:text-foreground">
                    Ещё {all.length - rows.length} {plural(all.length - rows.length, 'заявка', 'заявки', 'заявок')} — в журнале заявок
                </Link>
            )}
        </div>
    );
}

// ==================== Требуют внимания ====================

type AttentionKind = 'problems' | 'overdueIn' | 'overdueOut' | 'pendingSoon' | 'noTtn';
interface AttentionItem { kind: AttentionKind; key: string; title: string; text: string; badge: string; tone: 'neg' | 'muted'; href: string }

/**
 * Что требует внимания — сначала то, что стоит денег.
 *
 * Только то, что платформа знает наверняка: проблемы в пути, просроченные
 * счета, заявки без исполнителя накануне погрузки, рейсы без накладной.
 * Сроков доверенностей и страховок в системе нет — их здесь и нет.
 */
export function AttentionBlock() {
    const { orders, planned } = useBoardData();
    const st = useBlockSettings('attention');
    let items: AttentionItem[] = [];
    const a = orders.data?.attention;
    for (const p of a?.problems ?? []) {
        const hours = Math.max(0, Math.round((Date.now() - new Date(p.since).getTime()) / 3_600_000));
        items.push({
            kind: 'problems',
            key: `p-${p.id}`,
            title: `${p.orderNumber}: проблема в пути`,
            text: [p.comment, hours < 24 ? `стоит ${hours} ч` : `с ${shortDate(p.since)}`].filter(Boolean).join(' · '),
            badge: 'Проблема',
            tone: 'neg',
            href: `/company/orders/${p.id}`,
        });
    }
    const overdueIn = (planned.data?.rows ?? []).filter((r) => r.direction === 'IN' && r.isOverdue);
    if (overdueIn.length) {
        const sum = overdueIn.reduce((s, r) => s + r.amount, 0);
        const top = [...overdueIn].sort((x, y) => y.amount - x.amount)[0];
        items.push({
            kind: 'overdueIn',
            key: 'overdue-in',
            title: `${overdueIn.length} ${plural(overdueIn.length, 'счёт просрочен', 'счёта просрочены', 'счетов просрочены')}`,
            text: `${top.party} — ${fmt(top.amount)} ₸${overdueIn.length > 1 ? ` · всего ${fmt(sum)} ₸` : ''}`,
            badge: 'Деньги',
            tone: 'muted',
            href: '/company/accounting/counterparty-report',
        });
    }
    const overdueOut = (planned.data?.rows ?? []).filter((r) => r.direction === 'OUT' && r.isOverdue);
    if (overdueOut.length) {
        const sum = overdueOut.reduce((s, r) => s + r.amount, 0);
        items.push({
            kind: 'overdueOut',
            key: 'overdue-out',
            title: `Мы просрочили ${overdueOut.length} ${plural(overdueOut.length, 'оплату', 'оплаты', 'оплат')}`,
            text: `перевозчикам и поставщикам — ${fmt(sum)} ₸`,
            badge: 'Деньги',
            tone: 'muted',
            href: '/company/accounting/calendar',
        });
    }
    if (a?.pendingSoon.length) {
        const first = a.pendingSoon[0];
        items.push({
            kind: 'pendingSoon',
            key: 'pending-soon',
            title: `${a.pendingSoon.length} ${plural(a.pendingSoon.length, 'заявка', 'заявки', 'заявок')} без исполнителя`,
            text: `погрузка сегодня или завтра · ${first.orderNumber}, ${first.from} → ${first.to}`,
            badge: 'Заявки',
            tone: 'muted',
            href: a.pendingSoon.length === 1 ? `/company/orders/${first.id}` : '/company/orders',
        });
    }
    if (a?.noTtn.length) {
        items.push({
            kind: 'noTtn',
            key: 'no-ttn',
            title: `Нет ТТН по ${a.noTtn.length} ${plural(a.noTtn.length, 'рейсу', 'рейсам', 'рейсам')}`,
            text: `завершены больше 2 дней назад · ${a.noTtn.slice(0, 3).map((o) => o.orderNumber).join(', ')}${a.noTtn.length > 3 ? '…' : ''}`,
            badge: 'Документы',
            tone: 'muted',
            href: a.noTtn.length === 1 ? `/company/orders/${a.noTtn[0].id}` : '/company/orders',
        });
    }

    // Что показывать — выбрано в настройках блока.
    items = items.filter((it) => st.kinds.includes(it.kind));
    if (orders.loading && !orders.data) return <Loading />;
    if (!items.length) {
        return <BlockNote>{orders.failed ? 'Не удалось загрузить. Обновите страницу.' : 'Всё в порядке: проблем, просрочек и хвостов нет'}</BlockNote>;
    }
    return (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-2 overflow-auto p-3">
            {items.map((it) => (
                <Link
                    key={it.key}
                    href={it.href}
                    className="flex items-start justify-between gap-3 rounded-md border border-solid border-border px-3 py-2 text-foreground no-underline transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                    <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{it.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{it.text}</div>
                    </div>
                    <span className={cn(
                        'shrink-0 rounded-full border border-solid px-2 py-0.5 text-[10.5px]',
                        it.tone === 'neg' ? 'border-transparent bg-red-500/10 text-red-600 dark:text-red-400' : 'border-border text-foreground',
                    )}>
                        {it.badge}
                    </span>
                </Link>
            ))}
        </div>
    );
}

// ==================== Сейчас в пути ====================

/** Сетка строки «В пути» на широком блоке — по тому, какие колонки включены. */
const TRANSIT_GRID = {
    both: '@lg:grid-cols-[84px_1fr_120px_auto]',
    progress: '@lg:grid-cols-[84px_1fr_120px]',
    status: '@lg:grid-cols-[84px_1fr_auto]',
    none: '',
} as const;

export function InTransitBlock() {
    const router = useRouter();
    const { data, fallback } = useOrders();
    const st = useBlockSettings('inTransit');
    if (fallback) return fallback;
    const rows = data!.inTransit;
    if (!rows.length) return <BlockNote>Сейчас в пути никого нет</BlockNote>;
    const col = (c: 'driver' | 'progress' | 'status') => st.columns.includes(c);
    const grid = TRANSIT_GRID[col('progress') && col('status') ? 'both' : col('progress') ? 'progress' : col('status') ? 'status' : 'none'];
    const bar = colorOf(st.color);
    return (
        <div className="grid min-h-0 flex-1 content-start overflow-auto px-3 pb-2">
            {rows.map((o) => (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => router.push(`/company/orders/${o.id}`)}
                    className={cn('grid grid-cols-[84px_1fr] items-center gap-3 border-0 border-b border-solid border-border py-2 text-left text-[13px] last:border-b-0 hover:bg-muted/50', grid)}
                >
                    <span className="font-medium tabular-nums">{o.orderNumber}</span>
                    <span className="min-w-0 truncate">
                        {o.from} → {o.to}
                        {col('driver') && <span className="block truncate text-[11px] text-muted-foreground">{[o.driver, o.plate].filter(Boolean).join(' · ') || 'водитель не указан'}</span>}
                    </span>
                    {col('progress') && (
                        <span className="hidden items-center gap-2 @lg:flex" title="Насколько пройден рейс — по этапу">
                            <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${o.progress}%`, background: bar }} />
                            </span>
                            <span className="text-[11px] tabular-nums text-muted-foreground">{o.progress}%</span>
                        </span>
                    )}
                    {col('status') && <span className="hidden @lg:block"><StatusPill status={o.status} /></span>}
                </button>
            ))}
        </div>
    );
}

// ==================== Должники ====================

export function DebtorsBlock() {
    const { planned } = useBoardData();
    const st = useBlockSettings('debtors');
    const list = useMemo(() => {
        const by = new Map<string, { party: string; sum: number; maxDays: number }>();
        const today = Date.now();
        for (const r of planned.data?.rows ?? []) {
            if (r.direction !== 'IN') continue;
            const e = by.get(r.party) ?? { party: r.party, sum: 0, maxDays: 0 };
            e.sum += r.amount;
            if (r.isOverdue && r.dueDate) e.maxDays = Math.max(e.maxDays, Math.floor((today - new Date(r.dueDate).getTime()) / 86_400_000));
            by.set(r.party, e);
        }
        return Array.from(by.values()).sort((a, b) => b.maxDays - a.maxDays || b.sum - a.sum);
    }, [planned.data]);
    if (planned.loading && !planned.data) return <Loading />;
    if (!planned.data) return <BlockNote>Должники видны с правом «Бухгалтерия»</BlockNote>;
    const aging = agingOf(planned.data.rows, planned.data.withoutInvoice?.totalIn ?? 0);
    const shown = st.only === 'overdue' ? list.filter((d) => d.maxDays > 0) : list;
    if (!list.length) return <BlockNote>Выставленных и неоплаченных счетов нет</BlockNote>;
    if (!shown.length) return <BlockNote>Просроченных долгов нет — все платят в срок</BlockNote>;
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 content-start overflow-auto px-3 pb-2">
                {shown.map((d) => (
                    <Link key={d.party} href="/company/accounting/counterparty-report" className="flex items-center justify-between gap-3 border-0 border-b border-solid border-border py-2 text-[13px] text-foreground no-underline last:border-b-0 hover:bg-muted/50 hover:text-foreground">
                        <div className="min-w-0">
                            <div className="truncate font-medium">{d.party}</div>
                            <div className="text-[11px] text-muted-foreground">{d.maxDays ? `просрочка ${d.maxDays} дн.` : 'в срок'}</div>
                        </div>
                        <span className={cn('shrink-0 tabular-nums', d.maxDays > 10 && 'font-medium text-red-600 dark:text-red-400')}>{fmt(d.sum)} ₸</span>
                    </Link>
                ))}
            </div>
            {st.noInvoice && aging.noInvoice > 0 && (
                <Link href="/company/accounting/invoices" className="mx-3 mb-3 rounded-md border border-solid border-border px-2.5 py-2 text-xs text-muted-foreground no-underline hover:bg-muted/50 hover:text-muted-foreground">
                    Счёт не выставлен: {fmt(aging.noInvoice)} ₸ по {planned.data.withoutInvoice?.count ?? 0} {plural(planned.data.withoutInvoice?.count ?? 0, 'сделке', 'сделкам', 'сделкам')} — оформить
                </Link>
            )}
        </div>
    );
}

// ==================== Водители сегодня ====================

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function DriversBlock() {
    const { drivers } = useBoardData();
    const st = useBlockSettings('drivers');
    if (drivers.loading && !drivers.data) return <Loading />;
    if (drivers.denied) return <BlockNote>Этот блок вам не открыт — его выдаёт руководитель в «Сотрудниках»</BlockNote>;
    if (!drivers.data) return <BlockNote>Не удалось загрузить водителей. Обновите страницу.</BlockNote>;
    const d = drivers.data;
    if (!d.drivers.length) return <BlockNote>Своих водителей пока нет — их заводят в «Кабинете» → «Водители»</BlockNote>;
    const free = d.drivers.filter((x) => x.state === 'free');
    const trip = d.drivers.filter((x) => x.state === 'trip');
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
                {([['Свободны', d.free, '#15803d'], ['В рейсе', d.trip, '#0369a1'], ['Не работают', d.off, '#9ca3af']] as const).map(([label, n, color]) => (
                    <div key={label} className="rounded-md border border-solid border-border px-2 py-2">
                        <div className="text-lg font-semibold tabular-nums">{n}</div>
                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
                            {label}
                        </div>
                    </div>
                ))}
            </div>
            {([['free', 'Свободны сейчас', free], ['trip', 'В рейсе', trip]] as const).filter(([k]) => st.lists.includes(k)).map(([, title, list]) => list.length > 0 && (
                <div key={title} className="grid gap-1.5">
                    <div className="text-xs font-medium text-muted-foreground">{title}</div>
                    {list.slice(0, 8).map((x) => (
                        <div key={x.id} className="flex items-center gap-2.5 text-[13px]">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">{initials(x.name)}</span>
                            <span className="min-w-0 flex-1 truncate">
                                {x.name}
                                {x.trip && <span className="block truncate text-[11px] text-muted-foreground">{x.trip.orderNumber} · {x.trip.from} → {x.trip.to}</span>}
                            </span>
                            {st.plate && <span className="text-[11px] tabular-nums text-muted-foreground">{x.plate}</span>}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

// ==================== Заявки по статусам ====================

const STATUS_ORDER = ['PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'PROBLEM', 'COMPLETED'];

export function ByStatusBlock() {
    const { data, fallback } = useOrders();
    const st = useBlockSettings('byStatus');
    const expanded = useExpanded();
    if (fallback) return fallback;
    const rows = STATUS_ORDER
        .filter((s) => st.completed || s !== 'COMPLETED')
        .map((s) => ({ key: s, s: s === 'COMPLETED' ? 'Завершено в месяце' : STATUS_LABELS[s] || s, n: data!.byStatus[s] ?? 0 }))
        .filter((r) => r.n > 0);
    if (!rows.length) return <BlockNote>Заявок в работе нет</BlockNote>;
    // Один цвет на всех или свой у каждого статуса; в кольце один цвет — оттенками.
    const fills = rows.map((r, i) => (st.color === 'status'
        ? { color: STATUS_DOT[r.key] ?? '#9ca3af', opacity: 1 }
        : { color: colorOf(st.color), opacity: st.kind === 'donut' ? Math.max(0.25, 1 - i * 0.11) : 1 }));
    const total = rows.reduce((s, r) => s + r.n, 0);
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <div className="min-h-0 flex-1" style={expanded ? { minHeight: 240 } : undefined}><StatusChart data={rows} kind={st.kind} fills={fills} /></div>
            {expanded && (
                <div className="max-h-[42%] shrink-0 overflow-auto">
                    <Table>
                        <thead className="sticky top-0 z-[1] bg-card">
                            <tr><Th>Этап</Th><Th className="text-right">Заявок</Th><Th className="text-right">Доля</Th></tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={r.key} className="transition-colors hover:bg-muted/50">
                                    <Td>
                                        <span className="flex items-center gap-2">
                                            <span className="size-2 shrink-0 rounded-[3px]" style={{ background: fills[i].color, opacity: fills[i].opacity }} />
                                            {r.s}
                                        </span>
                                    </Td>
                                    <Td className="text-right tabular-nums">{r.n}</Td>
                                    <Td className="text-right tabular-nums text-muted-foreground">{Math.round((r.n / total) * 100)}%</Td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </div>
            )}
        </div>
    );
}

// ==================== Активность ====================

const ACTIVITY_ROWS = [
    { label: 'Активные заказчики', key: 'activeCustomers' as const },
    { label: 'Активные перевозчики', key: 'activeCarriers' as const },
    { label: 'Создано заявок', key: 'created' as const },
    { label: 'Завершено заявок', key: 'completed' as const },
    { label: 'Выручка с заявок, ₸', key: 'revenue' as const, money: true },
    { label: 'Затраты на перевозчиков, ₸', key: 'cost' as const, money: true, neutral: true },
    { label: 'Маржа с заявок, ₸', key: 'margin' as const, money: true },
];

/**
 * Динамика — к тому же куску прошлого месяца («к 1–7 сентября»), а не ко
 * всему прошлому месяцу: седьмого числа минус был бы всегда.
 */
/** Сумма в ячейке: полностью, кратко («3,2 млн») или как влезет по ширине блока. */
function Money({ n, mode }: { n: number; mode: 'auto' | 'full' | 'short' }) {
    if (mode === 'full') return <>{fmt(n)}</>;
    if (mode === 'short') return <>{short(n)}</>;
    // В узком блоке сумма сокращается — «3,2 млн», иначе столбец обрезается.
    return <><span className="@xl:hidden">{short(n)}</span><span className="hidden @xl:inline">{fmt(n)}</span></>;
}

function Dynamics({ cur, base, money, neutral, mode }: { cur: number; base: number; money?: boolean; neutral?: boolean; mode: 'auto' | 'full' | 'short' }) {
    const diff = cur - base;
    if (diff === 0) return <span className="text-muted-foreground">без изменений</span>;
    const up = diff > 0;
    const Icon = up ? ArrowUp : ArrowDown;
    const p = base ? Math.round((Math.abs(diff) / Math.abs(base)) * 100) : null;
    return (
        <span className={cn('inline-flex items-center justify-end gap-0.5 tabular-nums', neutral ? 'text-muted-foreground' : up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            <Icon className="size-3" />
            {up ? '+' : '−'}
            {money ? <Money n={Math.abs(diff)} mode={mode} /> : Math.abs(diff)}
            {p != null && <span className="hidden text-[11px] opacity-70 @2xl:inline"> · {p}%</span>}
        </span>
    );
}

export function ActivityBlock() {
    const { activity } = useBoardData();
    const st = useBlockSettings('activity');
    if (activity.loading && !activity.data) return <Loading />;
    if (activity.denied) return <BlockNote>Этот блок вам не открыт — его выдаёт руководитель в «Сотрудниках»</BlockNote>;
    const a = activity.data;
    if (!a) return <BlockNote>Не удалось загрузить активность. Обновите страницу.</BlockNote>;
    const curName = monthLabel(a.months?.current) || 'Этот месяц';
    const prevName = monthLabel(a.months?.previous) || 'Прошлый месяц';
    const base = a.previousSame ?? a.previous;
    const sameEnd = a.previousSameEnd ? new Date(new Date(a.previousSameEnd).getTime() - 1) : null;
    const prevGen = a.months?.previous ? MONTHS_GEN[Number(a.months.previous.slice(5, 7)) - 1] : '';
    const dynLabel = a.previousSame && sameEnd ? `к 1–${sameEnd.getDate()} ${prevGen}` : 'Динамика';
    return (
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">
            <Table>
                <thead className="sticky top-0 z-[1] bg-card">
                    <tr>
                        <Th>Показатель</Th>
                        <Th className="text-right">Сегодня</Th>
                        <Th className="hidden text-right @xl:table-cell">{prevName}</Th>
                        <Th className="text-right">{curName}</Th>
                        {/* В узком блоке динамика прячется, как прошлый месяц в
                            среднем: иначе таблица шире блока и обрезает сам
                            месяц. В крупном виде блока видно всё. */}
                        <Th className="hidden text-right @sm:table-cell">
                            <span className="@xl:hidden">Изменение</span>
                            <span className="hidden @xl:inline">{dynLabel}</span>
                        </Th>
                    </tr>
                </thead>
                <tbody>
                    {ACTIVITY_ROWS.filter((r) => st.rows.includes(r.key)).map((r) => (
                        <tr key={r.key} className="transition-colors hover:bg-muted/50">
                            <Td className="whitespace-normal">{r.label}</Td>
                            <Td className="text-right tabular-nums">{r.money ? <Money n={a.today[r.key]} mode={st.amounts} /> : a.today[r.key]}</Td>
                            <Td className="hidden text-right tabular-nums text-muted-foreground @xl:table-cell">{r.money ? <Money n={a.previous[r.key]} mode={st.amounts === 'short' ? 'short' : 'full'} /> : a.previous[r.key]}</Td>
                            <Td className="text-right font-medium tabular-nums">{r.money ? <Money n={a.current[r.key]} mode={st.amounts} /> : a.current[r.key]}</Td>
                            <Td className="hidden text-right @sm:table-cell"><Dynamics cur={a.current[r.key]} base={base[r.key]} money={r.money} neutral={r.neutral} mode={st.amounts} /></Td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </div>
    );
}

// ==================== Последние события ====================

interface OrderEvent { orderId: string; orderNumber: string; status: string; changedAt: string }

const STATUS_DOT: Record<string, string> = {
    PENDING: '#b45309', ASSIGNED: '#1d4ed8', EN_ROUTE_PICKUP: '#0e7490', AT_PICKUP: '#4d7c0f', LOADING: '#7e22ce',
    IN_TRANSIT: '#0369a1', AT_DELIVERY: '#3f6212', UNLOADING: '#a21caf', COMPLETED: '#15803d', PROBLEM: '#dc2626', CANCELLED: '#b91c1c', DRAFT: '#5f6672',
};

export function EventsBlock() {
    const router = useRouter();
    const { limit } = useBlockSettings('events');
    const [events, setEvents] = useState<OrderEvent[] | null>(null);
    useEffect(() => {
        let alive = true;
        api.get('/company/orders/events', { params: { limit: Number(limit) } })
            .then((r) => { if (alive) setEvents(r.data || []); })
            .catch(() => { if (alive) setEvents([]); });
        return () => { alive = false; };
    }, [limit]);
    if (!events) return <Loading />;
    if (!events.length) return <BlockNote>Пока тихо — событий нет</BlockNote>;
    return (
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">
            {events.map((e, i) => (
                <button
                    key={`${e.orderId}-${i}`}
                    type="button"
                    onClick={() => router.push(`/company/orders/${e.orderId}`)}
                    className="flex w-full items-center justify-between gap-3 border-0 border-b border-solid border-border py-2 text-left text-[13px] last:border-b-0 hover:bg-muted/50"
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_DOT[e.status] ?? '#9ca3af' }} />
                        <b className="font-medium tabular-nums">{e.orderNumber}</b>
                        <span className="truncate text-muted-foreground">{STATUS_LABELS[e.status] || e.status}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {new Date(e.changedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')}
                    </span>
                </button>
            ))}
        </div>
    );
}

export type { OrderBrief };
