'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dayjs, { Dayjs } from 'dayjs';
import {
    ArrowLeft, ArrowDownLeft, ArrowUpRight, List, ChevronLeft, ChevronRight,
    AlertCircle, CalendarDays, FileText, Clock,
} from 'lucide-react';
import { MONTHS_GEN } from '@/lib/ru-date';
import { cn } from '@/lib/utils';
import {
    DayBucket,
    fetchPlannedPayments,
    firstDayToShow,
    groupByDay,
    IN_HEX,
    MONTHS,
    monthGrid,
    moneyKzt,
    OUT_HEX,
    PlannedRow,
    PlannedTotals,
    shortMoney,
    WEEKDAYS_SHORT,
    weekdayIndex,
} from '@/lib/planned-payments';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

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
            const { rows: полученные, totals: итоги } = await fetchPlannedPayments();
            setRows(полученные);
            setTotals(итоги);
        } catch {
            toast.error('Не удалось загрузить платёжный календарь');
        } finally {
            setLoading(false);
        }
    };

    // Правила показа денег общие с плиткой на дашборде: разъедься они —
    // один и тот же день показывал бы там и тут разное.
    const money = moneyKzt;
    const short = shortMoney;

    // Группировка по дню — счета без срока оплаты в календарь не попадают
    const byDay = useMemo(() => groupByDay(rows), [rows]);

    /**
     * Если на сегодня платежей нет, открываем ближайший день, где они есть:
     * пустая панель при первом заходе — потраченный впустую экран, а человек
     * приходит сюда именно за вопросом «когда ближайшая оплата».
     */
    useEffect(() => {
        if (!rows.length) return;
        const день = firstDayToShow(rows);
        if (день) { setSelected(день); setMonth(день.startOf('month')); }
    }, [rows]);

    const noDate = useMemo(() => rows.filter(r => !r.dueDate), [rows]);
    const totalIn = totals?.totalIn ?? rows.filter(r => r.direction === 'IN').reduce((s, r) => s + r.amount, 0);
    const totalOut = totals?.totalOut ?? rows.filter(r => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0);
    const overdueTotal = (totals?.overdueIn ?? 0) + (totals?.overdueOut ?? 0);

    const selectedDay = byDay.get(selected.format('YYYY-MM-DD'));

    // Итоги месяца, который сейчас открыт в сетке
    const monthTotals = useMemo(() => {
        let mIn = 0, mOut = 0;
        Array.from(byDay.entries()).forEach(([key, day]) => {
            if (dayjs(key).isSame(month, 'month')) { mIn += day.in; mOut += day.out; }
        });
        return { in: mIn, out: mOut };
    }, [byDay, month]);

    /**
     * Сетка месяца: шесть недель с понедельника, чтобы высота не прыгала
     * при перелистывании. Дни соседних месяцев показываем приглушённо —
     * без них последняя неделя выглядит обрубленной.
     */
    const grid = useMemo(() => monthGrid(month), [month]);

    /** Ближайшие платежи вперёд от сегодня — левая половина нижней полосы. */
    const upcoming = useMemo(() => rows
        .filter(r => r.dueDate && !dayjs(r.dueDate).isBefore(dayjs(), 'day'))
        .sort((a, b) => dayjs(a.dueDate as string).valueOf() - dayjs(b.dueDate as string).valueOf())
        .slice(0, 5), [rows]);

    const overdueRows = useMemo(() => rows.filter(r => r.isOverdue).slice(0, 5), [rows]);

    const today = dayjs();
    const todayIdx = (today.day() + 6) % 7;

    return (
        // Высота шапки кабинета 60 точек — вычитаем её, чтобы страница
        // заняла ровно остаток экрана и серый фон не выглядывал снизу.
        <div className="flex h-[calc(100vh-60px)] w-full flex-col gap-3 p-4">
            {/* ============ Шапка ============ */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={() => router.push('/company/finance')}
                        aria-label="Назад в финансы"
                        className="flex h-8 w-8 items-center justify-center rounded-[10px] border-0 bg-card text-muted-foreground shadow-soft transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                            Финансы · Планирование
                        </div>
                        <h1 className="text-[19px] font-semibold leading-tight tracking-tight text-foreground">
                            Платёжный календарь
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Money label="Нам должны" value={money(totalIn)} tone="in" />
                    <Money label="Мы должны" value={money(totalOut)} tone="out" />
                    {overdueTotal > 0 && <Money label="Просрочено" value={money(overdueTotal)} tone="out" alert />}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-[42px] rounded-[10px] border-0 bg-card px-3.5 shadow-soft"
                        onClick={() => router.push('/company/accounting/planned')}
                    >
                        <List className="mr-1.5 h-3.5 w-3.5" /> Списком
                    </Button>
                </div>
            </div>

            {/* Три колонки: лист с месяцем и днём, справа сводки. При полной
                ширине в две колонки клетки растягивались в полосы — третья
                колонка забирает лишнее и держит клетку близкой к квадрату. */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_396px]">
            <div className="flex min-h-0 flex-col rounded-[24px] bg-card p-3 shadow-soft">
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_336px]">
                    {/* ---- Месяц ---- */}
                    <section className="flex min-h-0 flex-col rounded-2xl border border-solid border-border/70 p-4">
                        <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[19px] font-semibold tracking-tight text-foreground">
                                    {MONTHS[month.month()]}
                                </span>
                                <span className="text-[19px] text-muted-foreground">{month.year()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {(monthTotals.in > 0 || monthTotals.out > 0) && (
                                    <span className="mr-1 hidden items-center gap-2 text-[12px] font-semibold tabular-nums sm:flex">
                                        {monthTotals.in > 0 && <span style={{ color: IN_HEX }}>+{short(monthTotals.in)}</span>}
                                        {monthTotals.out > 0 && <span style={{ color: OUT_HEX }}>−{short(monthTotals.out)}</span>}
                                    </span>
                                )}
                                <div className="flex items-center gap-1 rounded-[10px] border border-solid border-border/70 p-0.5">
                                    <NavBtn onClick={() => setMonth(m => m.subtract(1, 'month'))} label="Предыдущий месяц">
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                    </NavBtn>
                                    <button
                                        onClick={() => { setMonth(dayjs().startOf('month')); setSelected(dayjs()); }}
                                        className="h-7 rounded-lg border-0 bg-transparent px-2.5 font-[inherit] text-[12.5px] font-medium text-foreground hover:bg-accent"
                                    >
                                        Сегодня
                                    </button>
                                    <NavBtn onClick={() => setMonth(m => m.add(1, 'month'))} label="Следующий месяц">
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </NavBtn>
                                </div>
                            </div>
                        </header>

                        <div className="mb-1.5 grid shrink-0 grid-cols-7 gap-1.5">
                            {WEEKDAYS_SHORT.map((d, i) => (
                                <div
                                    key={d}
                                    className={cn(
                                        'rounded-lg py-1.5 text-center text-[10.5px] font-medium tracking-[0.06em]',
                                        // Столбец сегодняшнего дня подсвечен — так в сетке
                                        // видно вертикаль текущей даты
                                        i === todayIdx ? 'bg-secondary text-foreground' : 'bg-muted/60 text-muted-foreground',
                                    )}
                                >
                                    {d}
                                </div>
                            ))}
                        </div>

                        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5">
                            {grid.map((d) => {
                                const key = d.format('YYYY-MM-DD');
                                const day = byDay.get(key);
                                const isOther = !d.isSame(month, 'month');
                                const isSelected = d.isSame(selected, 'day');
                                const isToday = d.isSame(today, 'day');
                                return (
                                    <button
                                        key={key}
                                        onClick={() => { setSelected(d); if (isOther) setMonth(d.startOf('month')); }}
                                        title={day ? [
                                            day.in > 0 ? `придёт ${money(day.in)}` : null,
                                            day.out > 0 ? `уйдёт ${money(day.out)}` : null,
                                        ].filter(Boolean).join(', ') : undefined}
                                        className={cn(
                                            'relative flex h-full min-h-[52px] flex-col items-center justify-center gap-1.5 rounded-[14px]',
                                            'border-0 font-[inherit] text-[13.5px] transition-colors',
                                            isSelected
                                                ? 'bg-foreground text-background'
                                                : isOther
                                                    ? 'bg-muted/35 text-muted-foreground/40'
                                                    : 'bg-muted/70 text-foreground hover:bg-secondary',
                                            // Просрочку показываем тихой подложкой, а не
                                            // красным числом: восемь красных чисел в сетке
                                            // кричат громче, чем стоит эта информация.
                                            day?.overdue && !isSelected && !isOther && 'bg-[#dc2626]/[0.07]',
                                            isToday && !isSelected && 'ring-1 ring-inset ring-foreground/30',
                                        )}
                                    >
                                        {/* Клетка тянется по высоте колонки, поэтому в ней
                                            снова есть место для сумм. Раньше они не влезали
                                            в 52 точки и превращались в кашу; в высокой
                                            клетке пустота выглядит хуже, чем цифры. Точку
                                            при этом убираем — знак и цвет суммы уже
                                            говорят направление. */}
                                        <span className={cn('tabular-nums leading-none', day && !isOther && 'font-semibold')}>
                                            {d.date()}
                                        </span>
                                        {day && (
                                            <span className="flex flex-col items-center gap-0.5 leading-none">
                                                {day.in > 0 && (
                                                    <span
                                                        className="text-[11px] font-semibold tabular-nums"
                                                        style={{ color: isSelected ? '#fff' : IN_HEX }}
                                                    >
                                                        +{short(day.in)}
                                                    </span>
                                                )}
                                                {day.out > 0 && (
                                                    <span
                                                        className="text-[11px] font-semibold tabular-nums"
                                                        style={{ color: isSelected ? 'rgba(255,255,255,.7)' : OUT_HEX }}
                                                    >
                                                        −{short(day.out)}
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* ---- Платежи выбранного дня ---- */}
                    <section className="flex min-h-0 flex-col rounded-2xl border border-solid border-border/70 p-4">
                        <header className="mb-3 flex items-start justify-between gap-2">
                            <div>
                                <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                    {selected.isSame(today, 'day') ? 'Сегодня' : WEEKDAYS[(selected.day() + 6) % 7]}
                                </div>
                                <div className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">
                                    {selected.date()} {MONTHS_GEN[selected.month()]} {selected.year()}
                                </div>
                            </div>
                            {selectedDay && (
                                <div className="text-right text-[12.5px] font-semibold tabular-nums leading-tight">
                                    {selectedDay.in > 0 && <div style={{ color: IN_HEX }}>+{money(selectedDay.in)}</div>}
                                    {selectedDay.out > 0 && <div style={{ color: OUT_HEX }}>−{money(selectedDay.out)}</div>}
                                </div>
                            )}
                        </header>

                        {selectedDay ? (
                            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                                {selectedDay.items.map((r, i) => (
                                    <PaymentRow key={`${r.documentId}_${i}`} row={r} money={money} router={router} />
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                                <CalendarDays className="h-7 w-7 text-muted-foreground/40" strokeWidth={1.5} />
                                <span className="text-[12.5px] text-muted-foreground">
                                    {loading ? 'Загружаем платежи…' : 'На этот день платежей нет'}
                                </span>
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {/* ============ Правая колонка: ближайшее и хвосты ============ */}
            {/* Сетка по умолчанию растягивает ряды поровну — от этого у
                верхней карточки с двумя строками пустовала нижняя половина.
                Тянется только нижняя: в ней строк заведомо больше. */}
            <div className="grid min-h-0 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-1 xl:grid-rows-[auto_minmax(0,1fr)]">
                <Panel title="Ближайшие платежи" hint="Впереди платежей нет">
                    {upcoming.map((r, i) => (
                        <PaymentRow key={`up_${r.documentId}_${i}`} row={r} money={money} router={router} withDate />
                    ))}
                </Panel>

                <Panel title={overdueRows.length ? 'Просрочено' : 'Требуют внимания'} hint="Всё в порядке">
                    {overdueRows.map((r, i) => (
                        <PaymentRow key={`ov_${r.documentId}_${i}`} row={r} money={money} router={router} withDate />
                    ))}
                    {noDate.length > 0 && (
                        <button
                            key="nodate"
                            onClick={() => router.push('/company/accounting/planned')}
                            className="flex items-center gap-2.5 rounded-xl border border-solid border-border/70 bg-transparent px-3 py-2.5 text-left font-[inherit] transition-colors hover:bg-accent"
                        >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e67e22]/10 text-[#e67e22]">
                                <AlertCircle className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1 leading-tight">
                                <span className="block text-[13px] font-medium text-foreground">
                                    {noDate.length}&nbsp;{noDate.length === 1 ? 'счёт' : 'счетов'} без срока оплаты
                                </span>
                                <span className="block text-[11.5px] text-muted-foreground">
                                    в календарь не попадают — проставьте срок
                                </span>
                            </span>
                        </button>
                    )}
                </Panel>
            </div>
            </div>
        </div>
    );
}

/* ============================ Части экрана ============================ */

/** Сумма в шапке: подпись, значок направления и само число. */
function Money({ label, value, tone, alert }: { label: string; value: string; tone: 'in' | 'out'; alert?: boolean }) {
    const hex = tone === 'in' ? IN_HEX : OUT_HEX;
    return (
        <div className="flex items-center gap-2.5 rounded-[10px] bg-card px-3 py-2 shadow-soft">
            <span
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: `${hex}1a`, color: hex }}
            >
                {alert ? <Clock className="h-3.5 w-3.5" />
                    : tone === 'in' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
            </span>
            <span className="leading-tight">
                <span className="block text-[10.5px] text-muted-foreground">{label}</span>
                <b className="block text-[13.5px] font-semibold tabular-nums" style={{ color: hex }}>{value}</b>
            </span>
        </div>
    );
}

function NavBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            className="flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
            {children}
        </button>
    );
}

/** Панель нижней полосы: тот же двойной корпус, что и у календаря. */
function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
    const items = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean);
    return (
        <div className="flex flex-col rounded-2xl bg-card p-4 shadow-soft">
            <div className="mb-2.5 text-[13.5px] font-semibold tracking-tight text-foreground">{title}</div>
            {items.length === 0 ? (
                <div className="py-5 text-center text-[12.5px] text-muted-foreground">{hint}</div>
            ) : (
                <div className="flex flex-col gap-1.5">{items}</div>
            )}
        </div>
    );
}

/**
 * Строка платежа: слева направление, потом контрагент и счёт, справа сумма.
 * С датой — когда строка стоит вне календаря и день сам себя не объясняет.
 */
function PaymentRow({
    row, money, router, withDate,
}: {
    row: PlannedRow;
    money: (v: number) => string;
    router: ReturnType<typeof useRouter>;
    withDate?: boolean;
}) {
    const hex = row.direction === 'IN' ? IN_HEX : OUT_HEX;
    const due = row.dueDate ? dayjs(row.dueDate) : null;
    return (
        <button
            onClick={() => row.orderId && router.push(`/company/orders/${row.orderId}`)}
            className="flex items-center gap-3 rounded-xl border border-solid border-border/70 bg-transparent px-3 py-2.5 text-left font-[inherit] transition-colors hover:bg-accent"
        >
            {/* Блок даты слева, как в образце: число крупно, день недели под
                ним. В списке вне календаря это единственная опора взгляда. */}
            {withDate && due ? (
                <span className="flex w-9 shrink-0 flex-col items-center leading-none">
                    <b className="text-[17px] font-semibold tabular-nums text-foreground">{due.date()}</b>
                    <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {WEEKDAYS_SHORT[(due.day() + 6) % 7]}
                    </span>
                </span>
            ) : (
                <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${hex}1a`, color: hex }}
                >
                    {row.direction === 'IN' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
            )}

            <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13.5px] font-semibold text-foreground">{row.party}</span>
                <span className="mt-1 flex items-center gap-1.5">
                    <span
                        className="rounded-md px-1.5 py-px text-[10.5px] font-medium"
                        style={{ background: `${hex}1a`, color: hex }}
                    >
                        {row.direction === 'IN' ? 'придёт' : 'уйдёт'}
                    </span>
                    {row.isOverdue && (
                        <span
                            className="rounded-md px-1.5 py-px text-[10.5px] font-medium"
                            style={{ background: `${OUT_HEX}1a`, color: OUT_HEX }}
                        >
                            просрочен
                        </span>
                    )}
                    <span className="hidden min-w-0 items-center gap-1 truncate text-[11.5px] text-muted-foreground sm:flex">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{row.invoiceNumber}</span>
                    </span>
                </span>
            </span>

            <b className="shrink-0 text-[13.5px] font-semibold tabular-nums" style={{ color: hex }}>
                {row.direction === 'IN' ? '+' : '−'}{money(row.amount)}
            </b>
        </button>
    );
}
