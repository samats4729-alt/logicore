'use client';

import { useState, useEffect, useMemo } from 'react';
import { message } from 'antd';
import { useRouter } from 'next/navigation';
import dayjs, { Dayjs } from 'dayjs';
import {
    ArrowLeft, ArrowDownLeft, ArrowUpRight, List, ChevronLeft, ChevronRight,
    AlertCircle, CalendarDays,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Строка приходит из `/accounting/planned-payments`. Обязательство создаёт
 * выставленный счёт, а не поля заявки, поэтому в строке есть и номер счёта,
 * и рейсы, к которым он привязан (их может быть несколько).
 */
interface PlannedRow {
    documentId: string;
    invoiceNumber: string;
    orderId: string | null;
    orderNumber: string;
    direction: 'IN' | 'OUT';
    party: string;
    amount: number;
    dueDate: string | null;
    /** Просрочку считает сервер — по календарю Казахстана, а не по часовому
     *  поясу браузера. */
    isOverdue: boolean;
}

interface PlannedTotals {
    totalIn: number;
    totalOut: number;
    overdueIn: number;
    overdueOut: number;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** Деньги приходящие и уходящие: единственные два цвета на экране. */
const IN_TEXT = 'text-[#16a34a]';
const OUT_TEXT = 'text-[#dc2626]';

export default function PaymentCalendarPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<PlannedRow[]>([]);
    const [totals, setTotals] = useState<PlannedTotals | null>(null);
    const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
    const [selected, setSelected] = useState<Dayjs>(dayjs());

    useEffect(() => { fetchPlanned(); }, []);

    const fetchPlanned = async () => {
        setLoading(true);
        try {
            const res = await api.get('/accounting/planned-payments');
            setRows(res.data?.rows || []);
            setTotals(res.data?.totals || null);
        } catch {
            message.error('Не удалось загрузить платёжный календарь');
        } finally {
            setLoading(false);
        }
    };

    const money = (v: number) => v.toLocaleString('ru-RU') + ' ₸';
    const short = (v: number) => {
        if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1).replace('.', ',') + ' млн';
        if (v >= 1_000) return Math.round(v / 1_000) + ' тыс';
        return String(v);
    };

    // Группировка по дню — платежи без плановой даты в календарь не попадают
    const byDay = useMemo(() => {
        const m = new Map<string, { in: number; out: number; items: PlannedRow[]; overdue: boolean }>();
        for (const r of rows) {
            if (!r.dueDate) continue;
            const key = dayjs(r.dueDate).format('YYYY-MM-DD');
            const cur = m.get(key) || { in: 0, out: 0, items: [], overdue: false };
            if (r.direction === 'IN') cur.in += r.amount; else cur.out += r.amount;
            cur.items.push(r);
            cur.overdue = cur.overdue || r.isOverdue;
            m.set(key, cur);
        }
        return m;
    }, [rows]);

    /**
     * Если на сегодня платежей нет, открываем ближайший день, где они есть:
     * пустая панель при первом заходе — потраченный впустую экран, а человек
     * приходит сюда именно за вопросом «когда ближайшая оплата».
     */
    useEffect(() => {
        if (!rows.length) return;
        const today = dayjs().format('YYYY-MM-DD');
        if (rows.some(r => r.dueDate && dayjs(r.dueDate).format('YYYY-MM-DD') === today)) return;
        const upcoming = rows
            .filter(r => r.dueDate)
            .map(r => dayjs(r.dueDate as string))
            .filter(d => !d.isBefore(dayjs(), 'day'))
            .sort((a, b) => a.valueOf() - b.valueOf())[0];
        const target = upcoming ?? rows
            .filter(r => r.dueDate)
            .map(r => dayjs(r.dueDate as string))
            .sort((a, b) => b.valueOf() - a.valueOf())[0];
        if (target) { setSelected(target); setMonth(target.startOf('month')); }
    }, [rows]);

    const noDate = useMemo(() => rows.filter(r => !r.dueDate), [rows]);
    // Итоги берём с сервера: он же считает просрочку и знает про счета,
    // которые в текущую выборку не попали.
    const totalIn = totals?.totalIn ?? rows.filter(r => r.direction === 'IN').reduce((s, r) => s + r.amount, 0);
    const totalOut = totals?.totalOut ?? rows.filter(r => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0);

    const selectedKey = selected.format('YYYY-MM-DD');
    const selectedDay = byDay.get(selectedKey);

    // Итоги месяца, который сейчас открыт в сетке
    const monthTotals = useMemo(() => {
        let mIn = 0, mOut = 0;
        // Array.from вместо перебора Map напрямую: цель сборки ниже es2015
        Array.from(byDay.entries()).forEach(([key, day]) => {
            if (dayjs(key).isSame(month, 'month')) { mIn += day.in; mOut += day.out; }
        });
        return { in: mIn, out: mOut };
    }, [byDay, month]);

    /**
     * Сетка месяца: шесть недель с понедельника, чтобы высота не прыгала
     * при переключении месяцев. Дни соседних месяцев показываем приглушённо —
     * без них последняя неделя выглядит обрубленной.
     */
    const grid = useMemo(() => {
        const first = month.startOf('month');
        const offset = (first.day() + 6) % 7; // неделя начинается с понедельника
        const start = first.subtract(offset, 'day');
        return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'));
    }, [month]);

    const today = dayjs();

    return (
        <div className="mx-auto max-w-[1180px] px-6 py-5">
            {/* Шапка в одну строку: куда вернуться, что за экран и две суммы */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shadow-soft"
                        onClick={() => router.push('/company/finance')}
                        aria-label="Назад в финансы"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Финансы · Планирование
                        </div>
                        <h1 className="text-xl font-semibold tracking-tight text-foreground">
                            Платёжный календарь
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2.5 rounded-xl bg-card px-3 py-2 shadow-soft">
                        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg bg-[#16a34a]/10', IN_TEXT)}>
                            <ArrowDownLeft className="h-3.5 w-3.5" />
                        </span>
                        <span className="leading-tight">
                            <span className="block text-[11px] text-muted-foreground">Нам должны</span>
                            <b className={cn('block text-sm font-semibold tabular-nums', IN_TEXT)}>{money(totalIn)}</b>
                        </span>
                    </div>
                    <div className="flex items-center gap-2.5 rounded-xl bg-card px-3 py-2 shadow-soft">
                        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg bg-[#dc2626]/10', OUT_TEXT)}>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </span>
                        <span className="leading-tight">
                            <span className="block text-[11px] text-muted-foreground">Мы должны</span>
                            <b className={cn('block text-sm font-semibold tabular-nums', OUT_TEXT)}>{money(totalOut)}</b>
                        </span>
                    </div>
                    <Button variant="outline" size="sm" className="h-[46px] shadow-soft" onClick={() => router.push('/company/accounting/planned')}>
                        <List className="mr-1.5 h-3.5 w-3.5" /> Списком
                    </Button>
                </div>
            </div>

            {noDate.length > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-card px-3.5 py-2.5 text-[13px] shadow-soft">
                    <AlertCircle className="h-4 w-4 shrink-0 text-[#e67e22]" />
                    <span className="text-muted-foreground">
                        {noDate.length}&nbsp;{noDate.length === 1 ? 'платёж' : 'платежей'} без плановой даты — в календарь не попадают.{' '}
                        <button className="border-0 bg-transparent p-0 font-[inherit] font-medium text-primary hover:underline" onClick={() => router.push('/company/accounting/planned')}>
                            Открыть списком
                        </button>
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_356px]">
                {/* ============ Сетка месяца ============ */}
                <div className="rounded-2xl bg-card p-4 shadow-soft">
                    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-lg font-semibold tracking-tight text-foreground">
                                {MONTHS[month.month()]}
                            </span>
                            <span className="text-lg font-normal text-muted-foreground">{month.year()}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            {(monthTotals.in > 0 || monthTotals.out > 0) && (
                                <div className="flex items-center gap-2.5 text-[12.5px] tabular-nums">
                                    {monthTotals.in > 0 && <span className={cn('font-semibold', IN_TEXT)}>+{short(monthTotals.in)}</span>}
                                    {monthTotals.out > 0 && <span className={cn('font-semibold', OUT_TEXT)}>−{short(monthTotals.out)}</span>}
                                </div>
                            )}
                            <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(m => m.subtract(1, 'month'))} aria-label="Предыдущий месяц">
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => { setMonth(dayjs().startOf('month')); setSelected(dayjs()); }}>
                                    Сегодня
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth(m => m.add(1, 'month'))} aria-label="Следующий месяц">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="mb-1.5 grid grid-cols-7 gap-1.5">
                        {WEEKDAYS.map((d, i) => (
                            <div
                                key={d}
                                className={cn(
                                    'rounded-lg py-1.5 text-center text-[11px] font-medium uppercase tracking-wide',
                                    // Текущий день недели подсвечен — так в сетке
                                    // сразу видно вертикаль сегодняшнего дня
                                    i === (today.day() + 6) % 7
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground',
                                )}
                            >
                                {d}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1.5">
                        {grid.map((d) => {
                            const key = d.format('YYYY-MM-DD');
                            const day = byDay.get(key);
                            const isOther = !d.isSame(month, 'month');
                            const isSelected = d.isSame(selected, 'day');
                            const isToday = d.isSame(today, 'day');
                            const overdue = !!day?.overdue;
                            return (
                                <button
                                    key={key}
                                    onClick={() => { setSelected(d); if (isOther) setMonth(d.startOf('month')); }}
                                    className={cn(
                                        'relative flex h-[54px] flex-col items-center justify-start gap-0.5 rounded-xl px-1 pt-1.5',
                                        'border-0 font-[inherit] text-[13px] transition-colors',
                                        isSelected
                                            ? 'bg-foreground text-background'
                                            : day
                                                ? 'bg-muted hover:bg-accent'
                                                : 'bg-muted/45 hover:bg-muted',
                                        isOther && !isSelected && 'text-muted-foreground/45',
                                        isToday && !isSelected && 'ring-1 ring-inset ring-foreground/25',
                                    )}
                                >
                                    <span className={cn('tabular-nums', (isToday || day) && !isOther && 'font-semibold')}>
                                        {d.date()}
                                    </span>
                                    {day && (
                                        <span className="flex flex-col items-center gap-px leading-none">
                                            {day.in > 0 && (
                                                <span className={cn('text-[10.5px] font-semibold tabular-nums', isSelected ? 'text-background' : IN_TEXT)}>
                                                    +{short(day.in)}
                                                </span>
                                            )}
                                            {day.out > 0 && (
                                                <span className={cn('text-[10.5px] font-semibold tabular-nums', isSelected ? 'text-background/80' : OUT_TEXT)}>
                                                    −{short(day.out)}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                    {overdue && (
                                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#dc2626]" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ============ Платежи выбранного дня ============ */}
                <div className="rounded-2xl bg-card p-4 shadow-soft">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                {selected.isSame(today, 'day') ? 'Сегодня' : 'Выбранный день'}
                            </div>
                            <div className="text-[15px] font-semibold tracking-tight text-foreground">
                                {selected.date()} {MONTHS[selected.month()].toLowerCase()} {selected.year()}
                            </div>
                        </div>
                        {selectedDay && (
                            <div className="text-right text-[12.5px] tabular-nums leading-tight">
                                {selectedDay.in > 0 && <div className={cn('font-semibold', IN_TEXT)}>+{money(selectedDay.in)}</div>}
                                {selectedDay.out > 0 && <div className={cn('font-semibold', OUT_TEXT)}>−{money(selectedDay.out)}</div>}
                            </div>
                        )}
                    </div>

                    {selectedDay ? (
                        <div className="flex flex-col gap-1.5">
                            {selectedDay.items.map((r, i) => (
                                <button
                                    key={`${r.orderId}_${r.direction}_${i}`}
                                    onClick={() => r.orderId && router.push(`/company/orders/${r.orderId}`)}
                                    className="flex items-center gap-3 rounded-xl border border-solid border-border/70 bg-transparent px-3 py-2.5 text-left font-[inherit] transition-colors hover:bg-accent"
                                >
                                    <span
                                        className={cn(
                                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                                            r.direction === 'IN' ? cn('bg-[#16a34a]/10', IN_TEXT) : cn('bg-[#dc2626]/10', OUT_TEXT),
                                        )}
                                    >
                                        {r.direction === 'IN' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                                    </span>
                                    <span className="min-w-0 flex-1 leading-tight">
                                        <span className="block truncate text-[13px] font-medium text-foreground">{r.party}</span>
                                        <span className="block truncate text-[11.5px] text-muted-foreground">
                                            счёт {r.invoiceNumber}
                                            {r.orderNumber && r.orderNumber !== '—' && ` · рейс ${r.orderNumber}`}
                                        </span>
                                    </span>
                                    <b className={cn('shrink-0 text-[13px] font-semibold tabular-nums', r.direction === 'IN' ? IN_TEXT : OUT_TEXT)}>
                                        {r.direction === 'IN' ? '+' : '−'}{money(r.amount)}
                                    </b>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-10 text-center">
                            <CalendarDays className="h-7 w-7 text-muted-foreground/45" strokeWidth={1.5} />
                            <span className="text-[12.5px] text-muted-foreground">
                                {loading ? 'Загружаем платежи…' : 'На этот день платежей нет'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
