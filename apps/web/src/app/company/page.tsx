'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dropdown, Checkbox, Empty, Spin } from 'antd';
import {
    FileTextOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    TruckOutlined,
    PlusOutlined,
    ArrowRightOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    DollarOutlined,
    TeamOutlined,
    BellOutlined,
    SettingOutlined,
    ExclamationCircleOutlined,
    WalletOutlined,
    SwapOutlined,
    ShopOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { STATUS_LABELS } from '@/components/ui/StatusPill';
import dayjs from 'dayjs';

// ==================== Типы ====================

interface ActivityBucket {
    created: number;
    completed: number;
    income: number;
    expense: number;
    activeCustomers: number;
    activeCarriers: number;
}

interface DashboardActivity {
    current: ActivityBucket;
    previous: ActivityBucket;
    inWorkNow: number;
    pendingNow: number;
    problemNow: number;
}

interface DebtTotals {
    unpaidTheyOweUs: number;
    unpaidWeOweThem: number;
    balance: number;
    totalCounterparties: number;
}

interface DebtCounterparty {
    counterparty: { id: string; name: string };
    ourRole: string;
    unpaidTheyOweUs: number;
    unpaidWeOweThem: number;
}

interface OrderEvent {
    orderId: string;
    orderNumber: string;
    status: string;
    changedAt: string;
}

// ==================== Помощники ====================

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

function greeting(): string {
    const h = new Date().getHours();
    if (h < 5) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
}

/** Стрелка сравнения с прошлым месяцем */
function Delta({ cur, prevVal, money }: { cur: number; prevVal: number; money?: boolean }) {
    const diff = cur - prevVal;
    if (diff === 0) {
        return <span style={{ fontSize: 11.5, color: 'var(--lc-text-ter)' }}>как в прошлом месяце</span>;
    }
    const up = diff > 0;
    return (
        <span style={{ fontSize: 11.5, fontWeight: 600, color: up ? '#16a34a' : '#dc2626' }}>
            {up ? <ArrowUpOutlined style={{ fontSize: 10 }} /> : <ArrowDownOutlined style={{ fontSize: 10 }} />}
            {' '}{up ? '+' : '−'}{money ? fmt(Math.abs(diff)) : Math.abs(diff)}
            <span style={{ color: 'var(--lc-text-ter)', fontWeight: 400 }}> · было {money ? fmt(prevVal) : prevVal}</span>
        </span>
    );
}

const BLOCKS_LS_KEY = 'lc_dashboard_hidden_blocks';
const ALL_BLOCKS = [
    { key: 'activity', label: 'Активность' },
    { key: 'debts', label: 'Задолженность' },
    { key: 'events', label: 'Уведомления' },
];

// ==================== Страница ====================

export default function CompanyDashboard() {
    const router = useRouter();
    const { user } = useAuthStore();
    const isManager = user?.role === 'LOGISTICIAN';

    const [activity, setActivity] = useState<DashboardActivity | null>(null);
    const [activityLoading, setActivityLoading] = useState(true);
    const [debtTotals, setDebtTotals] = useState<DebtTotals | null>(null);
    const [debtors, setDebtors] = useState<DebtCounterparty[]>([]);
    const [debtsAvailable, setDebtsAvailable] = useState(true);
    const [events, setEvents] = useState<OrderEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [payrollSummary, setPayrollSummary] = useState<{ total: number; hasScheme: boolean } | null>(null);

    // Скрытые блоки (настройка пользователя)
    const [hiddenBlocks, setHiddenBlocks] = useState<string[]>([]);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(BLOCKS_LS_KEY);
            if (raw) setHiddenBlocks(JSON.parse(raw));
        } catch { }
    }, []);
    const toggleBlock = (key: string) => {
        setHiddenBlocks(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            try { localStorage.setItem(BLOCKS_LS_KEY, JSON.stringify(next)); } catch { }
            return next;
        });
    };
    const show = (key: string) => !hiddenBlocks.includes(key);

    useEffect(() => {
        api.get('/company/dashboard-activity')
            .then(res => setActivity(res.data))
            .catch(() => { })
            .finally(() => setActivityLoading(false));

        // Задолженность — только для ролей с доступом к бухгалтерии; иначе тихо прячем блок
        api.get('/accounting/counterparty-report')
            .then(res => {
                setDebtTotals(res.data?.totals || null);
                setDebtors((res.data?.counterparties || []).filter((c: DebtCounterparty) => c.unpaidTheyOweUs > 0).slice(0, 3));
            })
            .catch(() => setDebtsAvailable(false));

        api.get('/company/orders/events', { params: { limit: 8 } })
            .then(res => setEvents(res.data || []))
            .catch(() => { })
            .finally(() => setEventsLoading(false));
    }, []);

    useEffect(() => {
        if (isManager) {
            api.get('/payroll/my/summary')
                .then(res => setPayrollSummary(res.data))
                .catch(() => { });
        }
    }, [isManager]);

    const cur = activity?.current;
    const prev = activity?.previous;

    // Плитки «Активности»: показываем только осмысленные для этой компании
    const activityTiles = useMemo(() => {
        if (!cur || !prev) return [];
        const tiles: any[] = [
            {
                label: 'Заявок за месяц', icon: <FileTextOutlined />, bg: '#e8f0fe', fg: '#1d4ed8',
                value: cur.created, delta: <Delta cur={cur.created} prevVal={prev.created} />,
            },
            {
                label: 'Завершено за месяц', icon: <CheckCircleOutlined />, bg: '#e7f8ef', fg: '#15803d',
                value: cur.completed, delta: <Delta cur={cur.completed} prevVal={prev.completed} />,
            },
        ];
        if (cur.income > 0 || prev.income > 0) {
            tiles.push({
                label: 'Доход за месяц, ₸', icon: <DollarOutlined />, bg: '#ecfdf5', fg: '#059669',
                value: fmt(cur.income), delta: <Delta cur={cur.income} prevVal={prev.income} money />,
            });
        }
        if (cur.expense > 0 || prev.expense > 0) {
            tiles.push({
                label: 'Расходы за месяц, ₸', icon: <WalletOutlined />, bg: '#fef2f2', fg: '#dc2626',
                value: fmt(cur.expense), delta: <Delta cur={cur.expense} prevVal={prev.expense} money />,
            });
        }
        if (cur.activeCustomers > 0 || prev.activeCustomers > 0) {
            tiles.push({
                label: 'Активные заказчики', icon: <ShopOutlined />, bg: '#eef2ff', fg: '#4f46e5',
                value: cur.activeCustomers, delta: <Delta cur={cur.activeCustomers} prevVal={prev.activeCustomers} />,
            });
        }
        if (cur.activeCarriers > 0 || prev.activeCarriers > 0) {
            tiles.push({
                label: 'Активные перевозчики', icon: <TeamOutlined />, bg: '#fdf4ff', fg: '#a21caf',
                value: cur.activeCarriers, delta: <Delta cur={cur.activeCarriers} prevVal={prev.activeCarriers} />,
            });
        }
        return tiles;
    }, [cur, prev]);

    const settingsMenu = (
        <div className="lc-card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--lc-text-ter)' }}>Блоки дашборда</span>
            {ALL_BLOCKS.map(b => (
                <Checkbox key={b.key} checked={show(b.key)} onChange={() => toggleBlock(b.key)}>
                    {b.label}
                </Checkbox>
            ))}
        </div>
    );

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">LogiCore — обзор</div>
                    <h1 className="lc2-title">{greeting()}{user?.firstName ? `, ${user.firstName}` : ''}</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        {dayjs().format('DD.MM.YYYY')} · сводка по компании за месяц
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button type="primary" icon={<PlusOutlined />} className="lc-cta lc-cta-shine" onClick={() => router.push('/company/orders/create')}>
                            Создать заявку
                        </Button>
                        <Dropdown dropdownRender={() => settingsMenu} trigger={['click']}>
                            <Button icon={<SettingOutlined />}>Настроить</Button>
                        </Dropdown>
                    </div>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}><TruckOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Сейчас в работе</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{activity?.inWorkNow ?? '—'}</div>
                            <div className="lc2-msub">активные перевозки</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#fff4e5', color: '#b45309' }}><ClockCircleOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Ожидают</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{activity?.pendingNow ?? '—'}</div>
                            <div className="lc2-msub">{(activity?.pendingNow || 0) > 0 ? 'требуют внимания' : 'всё назначено'}</div>
                        </div>
                    </div>
                    {(activity?.problemNow || 0) > 0 && (
                        <div className="lc2-metric lc2-metric-alert">
                            <div className="lc2-mic" style={{ background: '#fee2e2', color: '#dc2626' }}><ExclamationCircleOutlined /></div>
                            <div>
                                <div className="lc2-mlabel">Проблемы</div>
                                <div className="lc2-mvalue" style={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{activity?.problemNow}</div>
                                <div className="lc2-msub" style={{ color: '#dc2626' }}>требуют решения</div>
                            </div>
                        </div>
                    )}
                    {isManager && payrollSummary?.hasScheme && (
                        <div className="lc2-metric" style={{ cursor: 'pointer' }} onClick={() => router.push('/company/my-salary')}>
                            <div className="lc2-mic" style={{ background: '#fdf2f8', color: '#db2777' }}><DollarOutlined /></div>
                            <div>
                                <div className="lc2-mlabel">Заработано за месяц</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(payrollSummary.total)} ₸</div>
                                <div className="lc2-msub">перейти к деталям</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== АКТИВНОСТЬ ===== */}
            {show('activity') && (
                <div className="lc-card" style={{ padding: '18px 20px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--lc-text)', letterSpacing: '-0.01em' }}>Активность</div>
                            <div style={{ color: 'var(--lc-text-ter)', fontSize: 12, marginTop: 2 }}>
                                {new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} в сравнении с прошлым месяцем
                            </div>
                        </div>
                        <span className="lc-link" onClick={() => router.push('/company/orders')}>
                            Все заявки <ArrowRightOutlined style={{ fontSize: 11 }} />
                        </span>
                    </div>
                    {activityLoading ? (
                        <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
                    ) : activityTiles.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Пока нет данных за месяц" />
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 12,
                        }}>
                            {activityTiles.map((t, i) => (
                                <div key={i} style={{
                                    border: '1px solid var(--lc-border)',
                                    borderRadius: 14,
                                    padding: '14px 16px',
                                    display: 'flex',
                                    gap: 12,
                                    alignItems: 'flex-start',
                                    background: 'var(--lc-bg, transparent)',
                                }}>
                                    <div className="lc2-mic" style={{ background: t.bg, color: t.fg, flexShrink: 0 }}>{t.icon}</div>
                                    <div style={{ minWidth: 0 }}>
                                        <div className="lc2-mlabel">{t.label}</div>
                                        <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{t.value}</div>
                                        <div style={{ marginTop: 2 }}>{t.delta}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
                {/* ===== ЗАДОЛЖЕННОСТЬ ===== */}
                {show('debts') && debtsAvailable && (
                    <div className="lc-card" style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--lc-text)', letterSpacing: '-0.01em' }}>Задолженность</div>
                                <div style={{ color: 'var(--lc-text-ter)', fontSize: 12, marginTop: 2 }}>неоплаченные суммы по контрагентам</div>
                            </div>
                            <span className="lc-link" onClick={() => router.push('/company/accounting/counterparty-report')}>
                                Взаиморасчёты <ArrowRightOutlined style={{ fontSize: 11 }} />
                            </span>
                        </div>
                        {!debtTotals ? (
                            <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
                        ) : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                                    <div style={{ border: '1px solid var(--lc-border)', borderRadius: 12, padding: '10px 12px' }}>
                                        <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <ArrowUpOutlined style={{ color: '#16a34a', fontSize: 10 }} /> Нам должны
                                        </div>
                                        <div style={{ fontSize: 17, fontWeight: 800, color: '#16a34a', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
                                            {fmt(debtTotals.unpaidTheyOweUs)} ₸
                                        </div>
                                    </div>
                                    <div style={{ border: '1px solid var(--lc-border)', borderRadius: 12, padding: '10px 12px' }}>
                                        <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <ArrowDownOutlined style={{ color: '#dc2626', fontSize: 10 }} /> Мы должны
                                        </div>
                                        <div style={{ fontSize: 17, fontWeight: 800, color: '#dc2626', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
                                            {fmt(debtTotals.unpaidWeOweThem)} ₸
                                        </div>
                                    </div>
                                    <div style={{ border: '1px solid var(--lc-border)', borderRadius: 12, padding: '10px 12px' }}>
                                        <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <SwapOutlined style={{ color: '#1677ff', fontSize: 10 }} /> Баланс
                                        </div>
                                        <div style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 3, color: (debtTotals.unpaidTheyOweUs - debtTotals.unpaidWeOweThem) >= 0 ? '#16a34a' : '#dc2626' }}>
                                            {(debtTotals.unpaidTheyOweUs - debtTotals.unpaidWeOweThem) >= 0 ? '+' : ''}{fmt(debtTotals.unpaidTheyOweUs - debtTotals.unpaidWeOweThem)} ₸
                                        </div>
                                    </div>
                                </div>
                                {debtors.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--lc-text-ter)', marginBottom: 8 }}>
                                            Крупнейшие должники
                                        </div>
                                        {debtors.map((d, i) => (
                                            <div
                                                key={i}
                                                onClick={() => router.push('/company/accounting/counterparty-report')}
                                                style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                                                    borderBottom: i < debtors.length - 1 ? '1px solid var(--lc-border-soft, var(--lc-border))' : 'none',
                                                }}
                                            >
                                                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--lc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
                                                    {d.counterparty.name}
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                                    {fmt(d.unpaidTheyOweUs)} ₸
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ===== УВЕДОМЛЕНИЯ ===== */}
                {show('events') && (
                    <div className="lc-card" style={{ padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--lc-text)', letterSpacing: '-0.01em' }}>
                                    <BellOutlined style={{ marginRight: 6, color: '#1677ff' }} />Уведомления
                                </div>
                                <div style={{ color: 'var(--lc-text-ter)', fontSize: 12, marginTop: 2 }}>последние события по заявкам</div>
                            </div>
                        </div>
                        {eventsLoading ? (
                            <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
                        ) : events.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Пока тихо — событий нет" />
                        ) : (
                            <div>
                                {events.map((e, i) => (
                                    <div
                                        key={i}
                                        onClick={() => router.push(`/company/orders/${e.orderId}`)}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                                            padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                                            borderBottom: i < events.length - 1 ? '1px solid var(--lc-border-soft, var(--lc-border))' : 'none',
                                        }}
                                    >
                                        <span style={{ fontSize: 13, color: 'var(--lc-text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <span className="lc-ordernum" style={{ marginRight: 8 }}>{e.orderNumber}</span>
                                            {STATUS_LABELS[e.status] || e.status}
                                        </span>
                                        <span style={{ fontSize: 11.5, color: 'var(--lc-text-ter)', flexShrink: 0 }}>
                                            {dayjs(e.changedAt).format('DD.MM HH:mm')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
