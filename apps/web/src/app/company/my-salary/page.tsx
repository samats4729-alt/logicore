'use client';

import { useEffect, useState } from 'react';
import { DatePicker, Table } from 'antd';
import { Banknote, CalendarDays, Route, Star } from 'lucide-react';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import Link from 'next/link';
import Loader from '@/components/ui/Loader';
import styles from '@/components/nova/nova.module.css';

const { RangePicker } = DatePicker;

/**
 * Что человеку начислили — его собственный экран.
 *
 * Сервер отдаёт только свои начисления: чужую зарплату отсюда не видно ни
 * при каких правах. Разбивка на три части — оклад, проценты по рейсам,
 * бонусы — та же, что у руководителя в разделе «Зарплата и мотивация»,
 * чтобы разговор о деньгах шёл по одним и тем же числам.
 */

interface Accrual {
    id: string;
    kind: 'SALARY' | 'PERCENT' | 'KPI';
    amount: number;
    periodMonth: string;
    baseAmount?: number | null;
    percentValue?: number | null;
    percentBase?: string | null;
    schemeSnapshot?: any;
    createdAt: string;
    order?: {
        id: string;
        orderNumber: string;
        date: string;
    } | null;
}

const MONTHS = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

/** «2026-08» → «август 2026». Месяц по-русски: `dayjs` без локали пишет
 *  его по-английски, и в ведомости появлялось «August 2026». */
function monthLabel(periodMonth: string) {
    const [year, month] = periodMonth.split('-');
    const name = MONTHS[Number(month) - 1];
    return name ? `${name} ${year}` : periodMonth;
}

const fmt = (v: number) => v.toLocaleString('ru-RU');

export default function MySalaryPage() {
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{
        accruals: Accrual[];
        totals: { salary: number; percentTotal: number; kpiTotal: number; total: number };
    }>({ accruals: [], totals: { salary: 0, percentTotal: 0, kpiTotal: 0, total: 0 } });

    const loadData = async (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
        setLoading(true);
        try {
            const from = start.format('YYYY-MM');
            const to = end.format('YYYY-MM');
            const res = await api.get(`/payroll/my?from=${from}&to=${to}`);
            setData(res.data);
        } catch (err) {
            console.error('Failed to load salary details', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (dates[0] && dates[1]) {
            loadData(dates[0], dates[1]);
        }
    }, [dates]);

    const percentAccruals = data.accruals.filter(a => a.kind === 'PERCENT');
    const salaryAccruals = data.accruals.filter(a => a.kind === 'SALARY');
    const kpiAccruals = data.accruals.filter(a => a.kind === 'KPI');

    const columns = [
        {
            title: 'Рейс',
            key: 'order',
            render: (_: any, r: Accrual) => r.order ? (
                <Link href={`/company/orders/${r.order.id}`} className="lc-ordernum" style={{ fontSize: 13 }}>
                    {r.order.orderNumber}
                </Link>
            ) : '—',
        },
        {
            title: 'Завершён',
            key: 'date',
            render: (_: any, r: Accrual) => r.order?.date
                ? <span style={{ fontSize: 12 }}>{dayjs(r.order.date).format('DD.MM.YYYY, HH:mm')}</span>
                : '—',
        },
        {
            title: 'Считали от',
            dataIndex: 'baseAmount',
            key: 'base',
            align: 'right' as const,
            render: (v: number | null, r: Accrual) => {
                if (v === null || v === undefined) return '—';
                return (
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                        {fmt(v)} ₸
                        <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>
                            {r.percentBase === 'MARGIN' ? ' · маржа' : ' · сумма рейса'}
                        </span>
                    </span>
                );
            },
        },
        {
            title: 'Ставка',
            dataIndex: 'percentValue',
            key: 'rate',
            align: 'center' as const,
            render: (v: number | null) => v !== null && v !== undefined ? `${v}%` : '—',
        },
        {
            title: 'Начислено',
            dataIndex: 'amount',
            key: 'amount',
            align: 'right' as const,
            render: (v: number) => (
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(v)} ₸</span>
            ),
        },
    ];

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Деньги · Мои начисления</div>
                    <h1 className={styles.title}>Моя зарплата</h1>
                    <p className={styles.subtitle}>
                        Сколько начислено вам: оклад, проценты с рейсов и бонусы. Чужих начислений
                        здесь нет.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <RangePicker
                        picker="month"
                        value={dates}
                        onChange={(val) => {
                            if (val && val[0] && val[1]) setDates([val[0], val[1]]);
                        }}
                        allowClear={false}
                        placeholder={['Начало', 'Конец']}
                    />
                </div>
            </div>

            {loading ? (
                <Loader size="large" full />
            ) : (
                <>
                    {/* Начислено — зелёным: это единственное место, где цвет
                        разрешён поверх чёрно-белой темы. */}
                    <div className={styles.tiles}>
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Всего за период</span></div>
                            <div className={`${styles.tileValue} ${styles.valuePos}`}>{fmt(data.totals.total)} ₸</div>
                        </div>
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Оклад</span></div>
                            <div className={styles.tileValue}>{fmt(data.totals.salary)} ₸</div>
                        </div>
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Проценты с рейсов</span></div>
                            <div className={styles.tileValue}>{fmt(data.totals.percentTotal)} ₸</div>
                        </div>
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Бонусы</span></div>
                            <div className={styles.tileValue}>{fmt(data.totals.kpiTotal)} ₸</div>
                        </div>
                    </div>

                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <Route size={14} />
                            <h2 className={styles.cardTitle}>Проценты по рейсам</h2>
                            <span className={styles.cardCount}>{percentAccruals.length}</span>
                        </div>
                        {percentAccruals.length === 0 ? (
                            <div className={styles.empty}>
                                За выбранные месяцы процентов нет. Они начисляются, когда рейс
                                доходит до статуса, заданного в вашей схеме.
                            </div>
                        ) : (
                            <Table
                                columns={columns}
                                dataSource={percentAccruals}
                                rowKey="id"
                                size="small"
                                pagination={percentAccruals.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
                            />
                        )}
                    </section>

                    <div className={styles.duo} style={{ marginTop: 14 }}>
                        <section className={styles.card}>
                            <div className={styles.cardHead}>
                                <CalendarDays size={14} />
                                <h2 className={styles.cardTitle}>Оклад по месяцам</h2>
                                <span className={styles.cardCount}>{salaryAccruals.length}</span>
                            </div>
                            <div className={styles.cardBody}>
                                {salaryAccruals.length === 0 ? (
                                    <div className={styles.empty}>Оклад за этот период не начислялся.</div>
                                ) : (
                                    <div className={styles.list}>
                                        {salaryAccruals.map(s => (
                                            <div key={s.id} className={styles.item}>
                                                <span className={styles.itemIcon}><Banknote size={14} /></span>
                                                <span className={styles.itemText}>
                                                    <span className={styles.itemLabel}>{monthLabel(s.periodMonth)}</span>
                                                </span>
                                                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(s.amount)} ₸</b>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className={styles.card}>
                            <div className={styles.cardHead}>
                                <Star size={14} />
                                <h2 className={styles.cardTitle}>Бонусы за месяц</h2>
                                <span className={styles.cardCount}>{kpiAccruals.length}</span>
                            </div>
                            <div className={styles.cardBody}>
                                {kpiAccruals.length === 0 ? (
                                    <div className={styles.empty}>
                                        Бонусов не было. Бонус приходит, когда за месяц закрыто не
                                        меньше рейсов, чем задано в правиле.
                                    </div>
                                ) : (
                                    <div className={styles.list}>
                                        {kpiAccruals.map(k => {
                                            const snap = k.schemeSnapshot as any;
                                            return (
                                                <div key={k.id} className={styles.item}>
                                                    <span className={styles.itemIcon}><Star size={14} /></span>
                                                    <span className={styles.itemText}>
                                                        <span className={styles.itemLabel}>{monthLabel(k.periodMonth)}</span>
                                                        <span className={styles.itemDesc}>
                                                            норма — {snap?.threshold || 0} рейсов за месяц
                                                        </span>
                                                    </span>
                                                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(k.amount)} ₸</b>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}
