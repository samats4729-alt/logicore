'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs, { Dayjs } from 'dayjs';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
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
    WithoutInvoice,
} from '@/lib/planned-payments';
import { MONTHS_GEN } from '@/lib/ru-date';
import Loader from '@/components/ui/Loader';
import DashboardCard from './DashboardCard';
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
export default function PaymentCalendarCard({ className }: { className?: string } = {}) {
    const router = useRouter();
    const [rows, setRows] = useState<PlannedRow[]>([]);
    /** Долг по сделкам, где счёта ещё нет: в сетку ему встать не на что. */
    const [withoutInvoice, setWithoutInvoice] = useState<WithoutInvoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
    const [selected, setSelected] = useState<Dayjs>(dayjs());

    useEffect(() => {
        let актуально = true;
        fetchPlannedPayments()
            .then(({ rows: полученные, withoutInvoice: без }) => {
                if (!актуально) return;
                setRows(полученные);
                setWithoutInvoice(без);
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

    /**
     * День под курсором. Наведение отвечает на вопрос «кому и за что» без
     * нажатия: точка говорит, что в этот день что-то есть, а окошко — что
     * именно. На телефоне наведения нет, и там остаётся нажатие: панель под
     * сеткой показывает то же самое.
     */
    const [подсказка, setПодсказка] = useState<{ day: Dayjs; колонка: number } | null>(null);

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
        <DashboardCard
            className={className}
            icon={<CalendarDays size={14} />}
            title="Платёжный календарь"
            link={{ label: 'Открыть', onClick: () => router.push('/company/accounting/calendar') }}
        >
            {loading ? (
                <DashboardCard.Center><Loader /></DashboardCard.Center>
            ) : (
                // Две части: месяц и то, что под ним, — платежи дня и
                // полосы о счетах вне календаря. В узкой карточке они
                // идут друг под другом, в широкой встают рядом (см.
                // `@container` в стилях): иначе месяц растягивался бы
                // на всю ширину, а платежи дня уезжали под сгиб.
                <div className={card.layout}>
                    <div className={card.monthBox}>
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
                                    // Обёртка нужна окошку наведения: оно
                                    // висит под своей датой, а не под сеткой.
                                    <div key={key} className={card.cellWrap}>
                                    <button
                                        type="button"
                                        onClick={() => { setSelected(день); if (чужой) setMonth(день.startOf('month')); }}
                                        onMouseEnter={() => bucket && setПодсказка({ day: день, колонка: weekdayIndex(день) })}
                                        onMouseLeave={() => setПодсказка((p) => (p && p.day.isSame(день, 'day') ? null : p))}
                                        onFocus={() => bucket && setПодсказка({ day: день, колонка: weekdayIndex(день) })}
                                        onBlur={() => setПодсказка((p) => (p && p.day.isSame(день, 'day') ? null : p))}
                                        /* В клетке стоит только число, и с
                                           экрана она читается как «18» — без
                                           единого намёка, что в этот день
                                           уходит полтора миллиона. Цветные
                                           точки незрячему не говорят ничего. */
                                        aria-label={bucket ? [
                                            `${день.date()} ${MONTHS_GEN[день.month()]}`,
                                            bucket.in > 0 ? `поступит ${moneyKzt(bucket.in)}` : null,
                                            bucket.out > 0 ? `платим ${moneyKzt(bucket.out)}` : null,
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
                                    {подсказка?.day.isSame(день, 'day') && (
                                        <DayHint
                                            date={день}
                                            bucket={bucket}
                                            колонка={подсказка.колонка}
                                        />
                                    )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className={card.side}>
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

                        {/*
                          * Долг, по которому счёта нет вовсе. Полоса выше — про
                          * счета без срока; эта про сделки, где счёт ещё не
                          * выставлен, и срок оплаты потому не начался.
                          *
                          * Без неё плитка показывает часть картины с видом
                          * полной: пустая неделя читается как «платить нечего»,
                          * хотя счёт просто не оформлен. Та же полоса стоит на
                          * странице календаря — разъедься они, дашборд и
                          * страница отвечали бы на один вопрос по-разному.
                          */}
                        {withoutInvoice && withoutInvoice.count > 0 && (
                            <button
                                type="button"
                                className={card.noDate}
                                onClick={() => router.push('/company/accounting/planned')}
                            >
                                <AlertCircle size={13} style={{ color: '#e67e22', flexShrink: 0 }} />
                                <span>
                                    Счёт не выставлен: {moneyKzt(withoutInvoice.totalIn + withoutInvoice.totalOut)}
                                    {' '}по&nbsp;{withoutInvoice.count}&nbsp;{сделокСловом(withoutInvoice.count)} — оформить
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </DashboardCard>
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

/** «сделке» / «сделкам» — в строке «по N …». */
function сделокСловом(count: number): string {
    const хвост = count % 100;
    const последняя = count % 10;
    if (хвост > 10 && хвост < 20) return 'сделкам';
    return последняя === 1 ? 'сделке' : 'сделкам';
}

/**
 * Окошко под курсором: кому и за что платим в этот день.
 *
 * Точка на дате отвечает только «что-то есть». Вопрос, который возникает
 * следом, — «кому и сколько», и ради него не должно приходиться нажимать:
 * человек ведёт курсор по неделе и читает.
 *
 * Прижимается к той стороне клетки, где есть место: у субботы и воскресенья
 * окно, выпущенное вправо, ушло бы за край карточки.
 */
function DayHint({
    date, bucket, колонка,
}: {
    date: Dayjs;
    bucket?: DayBucket;
    /** Номер дня недели с понедельника: по нему решаем, куда открывать. */
    колонка: number;
}) {
    if (!bucket || !bucket.items.length) return null;

    const влево = колонка >= 4;
    const строки = bucket.items.slice(0, 4);
    const скрыто = bucket.items.length - строки.length;

    return (
        <div
            className={`${card.hint} ${влево ? card.hintLeft : card.hintRight}`}
            role="tooltip"
        >
            <div className={card.hintHead}>
                <span>{date.format('D')} {MONTHS_GEN[date.month()]}</span>
                <span className={card.hintSums}>
                    {bucket.in > 0 && <span style={{ color: IN_HEX }}>+{shortMoney(bucket.in)}</span>}
                    {bucket.out > 0 && <span style={{ color: OUT_HEX }}>−{shortMoney(bucket.out)}</span>}
                </span>
            </div>

            {строки.map((row) => (
                <div key={row.documentId} className={card.hintRow}>
                    <span
                        className={card.dot}
                        style={{ background: row.direction === 'IN' ? IN_HEX : OUT_HEX, flexShrink: 0 }}
                    />
                    <span className={card.hintParty}>
                        {/* Кто платит или кому платим — первое, что нужно
                            прочитать. Номер счёта уточняет, но не он главный. */}
                        <b>{row.party || 'Контрагент не указан'}</b>
                        <span className={card.hintDoc}>
                            {/* Направление словом, а не значком: «платим» и
                                «поступит» читаются с одного взгляда, а точка
                                слева уже несёт цвет.
                                Номер рейса сервер отдаёт прочерком, когда
                                счёт ни к какому рейсу не привязан, — прочерк
                                посреди строки выглядит как потерянные данные. */}
                            {row.direction === 'IN' ? 'поступит' : 'платим'} · счёт {row.invoiceNumber}
                            {row.orderNumber && row.orderNumber !== '—' ? ` · ${row.orderNumber}` : ''}
                            {row.isOverdue ? ' · просрочено' : ''}
                        </span>
                    </span>
                    <span
                        className={card.hintAmount}
                        style={{ color: row.direction === 'IN' ? IN_HEX : OUT_HEX }}
                    >
                        {row.direction === 'IN' ? '+' : '−'}{moneyKzt(row.amount)}
                    </span>
                </div>
            ))}

            {скрыто > 0 && (
                <div className={card.hintMore}>и ещё {скрыто} {счётСловом(скрыто)} — нажмите на дату</div>
            )}
        </div>
    );
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
