'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs, { Dayjs } from 'dayjs';
import { AlertCircle, ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
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
    shortMoney,
    WEEKDAYS_SHORT,
    weekdayIndex,
} from '@/lib/planned-payments';
import { MONTHS_GEN } from '@/lib/ru-date';
import Loader from '@/components/ui/Loader';
import styles from '@/components/nova/nova.module.css';
import card from './payment-calendar-card.module.css';

/**
 * Платёжный календарь на дашборде — месяцем целиком.
 *
 * Полная страница календаря есть, но заходить на неё надо специально, а
 * вопрос «что на этой неделе приходит и уходит» возникает каждый день при
 * открытии кабинета. Здесь тот же календарь, ужатый до плитки: месяц, точки
 * прихода и расхода на датах, платежи выбранного дня под сеткой.
 *
 * Суммы в клетках не пишутся намеренно — в клетке 28 точек они превращаются
 * в кашу. Точка отвечает на вопрос «есть ли что-то в этот день», а сколько
 * именно — видно по нажатию.
 *
 * Данные и правила общие со страницей календаря (`lib/planned-payments`):
 * иначе один и тот же день показывал бы здесь и там разное.
 */
export default function PaymentCalendarCard() {
    const router = useRouter();
    const [rows, setRows] = useState<PlannedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
    const [selected, setSelected] = useState<Dayjs>(dayjs());

    useEffect(() => {
        let актуально = true;
        fetchPlannedPayments()
            .then(({ rows: полученные }) => {
                if (!актуально) return;
                setRows(полученные);
                // Открываем день, где есть платежи: пустая панель при заходе —
                // потраченная впустую половина плитки.
                const день = firstDayToShow(полученные);
                if (день) { setSelected(день); setMonth(день.startOf('month')); }
            })
            // Молча: плитка на дашборде не повод для всплывающего сообщения,
            // а календарь открывается отдельной страницей.
            .catch(() => { })
            .finally(() => { if (актуально) setLoading(false); });
        return () => { актуально = false; };
    }, []);

    const byDay = useMemo(() => groupByDay(rows), [rows]);
    const grid = useMemo(() => monthGrid(month), [month]);
    const noDate = useMemo(() => rows.filter((row) => !row.dueDate), [rows]);

    const monthTotals = useMemo(() => {
        let приход = 0;
        let расход = 0;
        byDay.forEach((день, key) => {
            if (dayjs(key).isSame(month, 'month')) { приход += день.in; расход += день.out; }
        });
        return { in: приход, out: расход };
    }, [byDay, month]);

    const today = dayjs();
    const selectedDay = byDay.get(selected.format('YYYY-MM-DD'));

    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                <CalendarDays size={14} />
                <h2 className={styles.cardTitle}>Платёжный календарь</h2>
                <button
                    type="button"
                    className={card.openLink}
                    onClick={() => router.push('/company/accounting/calendar')}
                >
                    Открыть <ArrowRight size={12} />
                </button>
            </div>

            <div className={styles.cardBody}>
                {loading ? (
                    <div className={card.empty}><Loader /></div>
                ) : (
                    <>
                        <div className={card.head}>
                            <span className={card.month}>
                                {MONTHS[month.month()]} <span className={card.monthYear}>{month.year()}</span>
                            </span>
                            <div className={card.nav}>
                                {(monthTotals.in > 0 || monthTotals.out > 0) && (
                                    <span style={{
                                        display: 'flex', gap: 6, marginRight: 4,
                                        fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        {monthTotals.in > 0 && <span style={{ color: IN_HEX }}>+{shortMoney(monthTotals.in)}</span>}
                                        {monthTotals.out > 0 && <span style={{ color: OUT_HEX }}>−{shortMoney(monthTotals.out)}</span>}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className={card.navBtn}
                                    aria-label="Предыдущий месяц"
                                    onClick={() => setMonth((m) => m.subtract(1, 'month'))}
                                >
                                    <ChevronLeft size={13} />
                                </button>
                                <button
                                    type="button"
                                    className={card.today}
                                    onClick={() => { setMonth(dayjs().startOf('month')); setSelected(dayjs()); }}
                                >
                                    Сегодня
                                </button>
                                <button
                                    type="button"
                                    className={card.navBtn}
                                    aria-label="Следующий месяц"
                                    onClick={() => setMonth((m) => m.add(1, 'month'))}
                                >
                                    <ChevronRight size={13} />
                                </button>
                            </div>
                        </div>

                        <div className={card.weekdays}>
                            {WEEKDAYS_SHORT.map((день) => (
                                <div key={день} className={card.weekday}>{день}</div>
                            ))}
                        </div>

                        <div className={card.grid}>
                            {grid.map((день) => {
                                const key = день.format('YYYY-MM-DD');
                                const bucket = byDay.get(key);
                                const чужой = !день.isSame(month, 'month');
                                const выбран = день.isSame(selected, 'day');
                                return (
                                    <button
                                        type="button"
                                        key={key}
                                        onClick={() => { setSelected(день); if (чужой) setMonth(день.startOf('month')); }}
                                        title={bucket ? [
                                            bucket.in > 0 ? `придёт ${moneyKzt(bucket.in)}` : null,
                                            bucket.out > 0 ? `уйдёт ${moneyKzt(bucket.out)}` : null,
                                        ].filter(Boolean).join(', ') : undefined}
                                        className={[
                                            card.cell,
                                            чужой ? card.other : '',
                                            выбран ? card.selected : '',
                                            !выбран && !чужой && bucket?.overdue ? card.overdue : '',
                                            !выбран && день.isSame(today, 'day') ? card.todayCell : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        <span>{день.date()}</span>
                                        <span className={card.dots}>
                                            {bucket && bucket.in > 0 && (
                                                <span
                                                    className={card.dot}
                                                    style={{ background: выбран ? '#fff' : IN_HEX }}
                                                />
                                            )}
                                            {bucket && bucket.out > 0 && (
                                                <span
                                                    className={card.dot}
                                                    style={{ background: выбран ? 'rgba(255,255,255,.65)' : OUT_HEX }}
                                                />
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <DayPanel day={selectedDay} date={selected} router={router} />

                        {noDate.length > 0 && (
                            <button
                                type="button"
                                className={card.noDate}
                                onClick={() => router.push('/company/accounting/planned')}
                            >
                                <AlertCircle size={13} style={{ color: '#e67e22', flexShrink: 0 }} />
                                <span>
                                    {noDate.length}&nbsp;{счётСловом(noDate.length)} без срока оплаты — в календарь не попадают
                                </span>
                            </button>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

/** «счёт» / «счёта» / «счетов» — иначе плитка читается как машинный вывод. */
function счётСловом(count: number): string {
    const хвост = count % 100;
    const последняя = count % 10;
    if (хвост > 10 && хвост < 20) return 'счетов';
    if (последняя === 1) return 'счёт';
    if (последняя >= 2 && последняя <= 4) return 'счёта';
    return 'счетов';
}

/** Платежи выбранного дня: за чем именно человек ткнул в дату. */
function DayPanel({
    day, date, router,
}: {
    day?: DayBucket;
    date: Dayjs;
    router: ReturnType<typeof useRouter>;
}) {
    return (
        <div className={card.day}>
            <div className={card.dayHead}>
                <span className={card.dayDate}>
                    {date.date()} {MONTHS_GEN[date.month()]}
                    {date.isSame(dayjs(), 'day')
                        ? ', сегодня'
                        : `, ${WEEKDAYS_SHORT[weekdayIndex(date)].toLowerCase()}`}
                </span>
                {day && (
                    <span className={card.daySums}>
                        {day.in > 0 && <span style={{ color: IN_HEX }}>+{shortMoney(day.in)}</span>}
                        {day.out > 0 && <span style={{ color: OUT_HEX }}>−{shortMoney(day.out)}</span>}
                    </span>
                )}
            </div>

            {!day ? (
                <div className={card.empty}>В этот день платежей нет</div>
            ) : (
                <div className={card.rows}>
                    {day.items.map((row, i) => (
                        <button
                            type="button"
                            key={`${row.documentId}_${i}`}
                            className={card.row}
                            onClick={() => row.orderId && router.push(`/company/orders/${row.orderId}`)}
                        >
                            <span
                                className={card.dot}
                                style={{ background: row.direction === 'IN' ? IN_HEX : OUT_HEX, flexShrink: 0 }}
                            />
                            <span className={card.rowBody}>
                                <span className={card.rowParty}>{row.party}</span>
                                <span className={card.rowInvoice}>
                                    {row.invoiceNumber}
                                    {row.isOverdue && ' · просрочен'}
                                </span>
                            </span>
                            <b
                                className={card.rowSum}
                                style={{ color: row.direction === 'IN' ? IN_HEX : OUT_HEX }}
                            >
                                {row.direction === 'IN' ? '+' : '−'}{shortMoney(row.amount)}
                            </b>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
