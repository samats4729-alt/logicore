'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dropdown, Checkbox } from 'antd';
import { Activity, ArrowDown, ArrowRight, ArrowUp, Bell, Plus, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { STATUS_LABELS } from '@/components/ui/StatusPill';
import PendingWorkCard from '@/components/dashboard/PendingWorkCard';
import PaymentProofsCard from '@/components/dashboard/PaymentProofsCard';
import PaymentCalendarCard from '@/components/dashboard/PaymentCalendarCard';
import SubscriptionCard from '@/components/dashboard/SubscriptionCard';
import EmployeeEarningsCard from '@/components/dashboard/EmployeeEarningsCard';
import dayjs from 'dayjs';
import styles from '@/components/nova/nova.module.css';
import dash from './dashboard.module.css';
import Loader from '@/components/ui/Loader';

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
    today: ActivityBucket;
    current: ActivityBucket;
    previous: ActivityBucket;
    inWorkNow: number;
    pendingNow: number;
    problemNow: number;
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
        return <span className={dash.muted}>без изменений</span>;
    }
    const up = diff > 0;
    return (
        <span className={`${dash.delta} ${up ? styles.valuePos : styles.valueNeg}`}>
            {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {up ? '+' : '−'}{money ? fmt(Math.abs(diff)) : Math.abs(diff)}
        </span>
    );
}

const BLOCKS_LS_KEY = 'lc_dashboard_hidden_blocks';
const ALL_BLOCKS = [
    { key: 'activity', label: 'Активность' },
    { key: 'earnings', label: 'Заработок сотрудников' },
    { key: 'paymentCalendar', label: 'Платёжный календарь' },
    { key: 'pendingWork', label: 'Требует оформления' },
    { key: 'events', label: 'Уведомления' },
];

// ==================== Страница ====================

export default function CompanyDashboard() {
    const router = useRouter();
    const { user } = useAuthStore();
    const isManager = user?.role === 'LOGISTICIAN';
    // Полный дашборд (активность, задолженность) — только администратору компании
    const isOwner = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    // Очередь чеков от контрагентов — работа бухгалтера, и решение по чеку
    // сервер разрешает принимать именно ему. Пока карточка висела только на
    // дашборде владельца, тот, чья это работа, очереди не видел вовсе.
    const seesPaymentProofs = isOwner || user?.role === 'ACCOUNTANT';

    const [activity, setActivity] = useState<DashboardActivity | null>(null);
    const [activityLoading, setActivityLoading] = useState(true);
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

    // Личные показатели сотрудника (не-администратора)
    const [myStats, setMyStats] = useState<{ total: number; pending: number; inWork: number; completed: number } | null>(null);

    useEffect(() => {
        if (!user) return;

        api.get('/company/orders/events', { params: { limit: 8 } })
            .then(res => setEvents(res.data || []))
            .catch(() => { })
            .finally(() => setEventsLoading(false));

        // Свой заработок смотрит кто угодно, у кого есть схема, — в том
        // числе владелец: он тоже может вести рейсы и получать процент.
        api.get('/payroll/my/summary')
            .then(res => setPayrollSummary(res.data))
            .catch(() => { });

        if (isOwner) {
            api.get('/company/dashboard-activity')
                .then(res => setActivity(res.data))
                .catch(() => { })
                .finally(() => setActivityLoading(false));
        } else {
            // Сотрудник: только его заявки и его заработок
            const mine = isManager ? '&mine=true' : '';
            api.get(`/company/orders?limit=100${mine}`)
                .then(res => {
                    const raw = res.data;
                    const list: any[] = Array.isArray(raw) ? raw : (raw?.data || []);
                    setMyStats({
                        total: Array.isArray(raw) ? raw.length : (raw?.total || list.length),
                        pending: list.filter(o => o.status === 'PENDING').length,
                        inWork: list.filter(o => ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'].includes(o.status)).length,
                        completed: list.filter(o => o.status === 'COMPLETED').length,
                    });
                })
                .catch(() => { });

            setActivityLoading(false);
        }
    }, [user, isOwner, isManager]);

    const cur = activity?.current;
    const prev = activity?.previous;
    const tdy = activity?.today;

    // Строки таблицы «Активности»: Сегодня / Этот месяц / Прошлый месяц / Динамика
    const activityRows = useMemo(() => {
        if (!cur || !prev || !tdy) return [];
        // Значки из строк убраны: шесть цветных пятен в столбце подписей
        // спорили с числами, ради которых в таблицу и смотрят.
        const rows = [
            { label: 'Создано заявок', key: 'created' as const },
            { label: 'Завершено заявок', key: 'completed' as const },
            { label: 'Доход, ₸', key: 'income' as const, money: true },
            { label: 'Расходы, ₸', key: 'expense' as const, money: true },
            { label: 'Активные заказчики', key: 'activeCustomers' as const },
            { label: 'Активные перевозчики', key: 'activeCarriers' as const },
        ];
        return rows.map(r => ({
            ...r,
            today: tdy[r.key],
            current: cur[r.key],
            previous: prev[r.key],
        }));
    }, [cur, prev, tdy]);

    const settingsMenu = (
        <div className={styles.card} style={{ padding: '10px 14px', margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className={styles.tileLabel}>Блоки дашборда</span>
            {ALL_BLOCKS.map(b => (
                <Checkbox key={b.key} checked={show(b.key)} onChange={() => toggleBlock(b.key)}>
                    {b.label}
                </Checkbox>
            ))}
        </div>
    );

    /** Плитка показателя: одинаковая для владельца и сотрудника. */
    const Tile = ({ label, value, sub, tone, onClick }: {
        label: string;
        value: React.ReactNode;
        sub?: string;
        tone?: 'neg' | 'warn';
        onClick?: () => void;
    }) => (
        <div
            className={`${styles.tile} ${onClick ? styles.tileClickable : ''}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
        >
            <div className={styles.tileHead}>
                <span className={styles.tileLabel}>{label}</span>
            </div>
            <div className={`${styles.tileValue} ${tone === 'neg' ? styles.valueNeg : tone === 'warn' ? styles.valueWarn : ''}`}>
                {value}
            </div>
            {sub && <div className={styles.tileSub}>{sub}</div>}
        </div>
    );

    return (
        <div className={`${styles.page} ${styles.pageWide}`}>
            {/* ===== ШАПКА ===== */}
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>LogiCore · обзор</div>
                    <h1 className={styles.title}>{greeting()}{user?.firstName ? `, ${user.firstName}` : ''}</h1>
                    <p className={styles.subtitle}>
                        {dayjs().format('DD.MM.YYYY')} · {isOwner ? 'сводка по компании за месяц' : isManager ? 'ваши заявки и заработок' : 'ваша сводка'}
                    </p>
                </div>
                <div className={styles.heroActions}>
                    {(isOwner || isManager) && (
                        <button type="button" className={`${styles.action} ${styles.actionPrimary}`} onClick={() => router.push('/company/orders/create')}>
                            <Plus size={14} /> Создать заявку
                        </button>
                    )}
                    {isOwner && (
                        <Dropdown dropdownRender={() => settingsMenu} trigger={['click']}>
                            <button type="button" className={styles.action}>
                                <Settings size={14} /> Настроить
                            </button>
                        </Dropdown>
                    )}
                </div>
            </div>

            {/* ===== ПОКАЗАТЕЛИ =====
                При неудачной загрузке в плитках прочерк, а не ноль: ноль
                читается как факт о работе компании, хотя это отсутствие
                ответа. */}
            <div className={styles.tiles}>
                {isOwner ? (
                    <>
                        <Tile label="Сейчас в работе" value={activity?.inWorkNow ?? '—'} sub="активные перевозки" />
                        <Tile
                            label="Ожидают"
                            value={activity?.pendingNow ?? '—'}
                            sub={(activity?.pendingNow || 0) > 0 ? 'требуют внимания' : 'всё назначено'}
                            tone={(activity?.pendingNow || 0) > 0 ? 'warn' : undefined}
                        />
                        <Tile
                            label="Проблемы"
                            value={activity?.problemNow ?? '—'}
                            sub={(activity?.problemNow || 0) > 0 ? 'требуют решения' : 'нет проблемных рейсов'}
                            tone={(activity?.problemNow || 0) > 0 ? 'neg' : undefined}
                        />
                        <Tile label="Заявок за месяц" value={cur?.created ?? '—'} sub="создано с начала месяца" />
                        {payrollSummary?.hasScheme && (
                            <Tile
                                label="Заработано за месяц"
                                value={`${fmt(payrollSummary.total)} ₸`}
                                sub="перейти к деталям"
                                onClick={() => router.push('/company/my-salary')}
                            />
                        )}
                    </>
                ) : (
                    <>
                        <Tile label={isManager ? 'Мои заявки' : 'Заявки'} value={myStats?.total ?? '—'} sub="за всё время" />
                        <Tile label="В работе" value={myStats?.inWork ?? '—'} sub="активные перевозки" />
                        <Tile
                            label="Ожидают"
                            value={myStats?.pending ?? '—'}
                            sub={(myStats?.pending || 0) > 0 ? 'требуют внимания' : 'всё назначено'}
                            tone={(myStats?.pending || 0) > 0 ? 'warn' : undefined}
                        />
                        {payrollSummary?.hasScheme && (
                            <Tile
                                label="Заработано за месяц"
                                value={`${fmt(payrollSummary.total)} ₸`}
                                sub="перейти к деталям"
                                onClick={() => router.push('/company/my-salary')}
                            />
                        )}
                    </>
                )}
            </div>

            {/* ===== ТАРИФ =====
                Только руководителю: платит он, и запрос на счёт сервер
                принимает тоже от него. */}
            {isOwner && <SubscriptionCard />}

            {/* ===== АКТИВНОСТЬ (только администратор компании) ===== */}
            {isOwner && show('activity') && (
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <Activity size={14} />
                        <h2 className={styles.cardTitle}>Активность</h2>
                        <button type="button" className={dash.headLink} onClick={() => router.push('/company/orders')}>
                            Все заявки <ArrowRight size={12} />
                        </button>
                    </div>

                    {activityLoading ? (
                        <div className={styles.empty}><Loader /></div>
                    ) : activityRows.length === 0 ? (
                        <div className={styles.empty}>Пока нет данных за месяц</div>
                    ) : (
                        <div className={dash.tableWrap}>
                            <table className={dash.table}>
                                <thead>
                                    <tr>
                                        <th>Показатель</th>
                                        <th className={dash.right}>Сегодня</th>
                                        <th className={dash.right}>Этот месяц</th>
                                        <th className={dash.right}>Прошлый месяц</th>
                                        <th className={dash.right}>Динамика</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activityRows.map(r => (
                                        <tr key={r.key}>
                                            <td>{r.label}</td>
                                            <td className={dash.right}>{r.money ? fmt(r.today) : r.today}</td>
                                            <td className={`${dash.right} ${dash.strong}`}>{r.money ? fmt(r.current) : r.current}</td>
                                            <td className={`${dash.right} ${dash.muted}`}>{r.money ? fmt(r.previous) : r.previous}</td>
                                            <td className={dash.right}><Delta cur={r.current} prevVal={r.previous} money={r.money} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            <div className={dash.cards}>
                {/* ===== ТРЕБУЕТ ОФОРМЛЕНИЯ (только администратор компании) ===== */}
                {isOwner && show('pendingWork') && <PendingWorkCard />}
                {seesPaymentProofs && <PaymentProofsCard />}

                {/* ===== ПЛАТЁЖНЫЙ КАЛЕНДАРЬ =====
                    Кому видны деньги, тот и видит календарь: те же роли, что
                    и у задолженности с очередью чеков. Менеджеру суммы по
                    контрагентам не показываются нигде, и здесь тоже не место. */}
                {seesPaymentProofs && show('paymentCalendar') && <PaymentCalendarCard />}

                {/* ===== ЗАРАБОТОК СОТРУДНИКОВ (администратор компании) =====

                    Здесь была задолженность. Она осталась целой страницей во
                    «Взаиморасчётах» и плиткой в платёжном календаре, а на
                    дашборде повторялась третий раз. Сколько компания должна
                    своим — оклад, процент и премии — не было видно нигде,
                    кроме страницы зарплат, куда заходят раз в месяц. */}
                {isOwner && show('earnings') && <EmployeeEarningsCard />}

                {/* ===== УВЕДОМЛЕНИЯ (видят все сотрудники) ===== */}
                {(isOwner ? show('events') : true) && (
                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <Bell size={14} />
                            <h2 className={styles.cardTitle}>Последние события</h2>
                        </div>

                        {eventsLoading ? (
                            <div className={styles.empty}><Loader /></div>
                        ) : events.length === 0 ? (
                            <div className={styles.empty}>Пока тихо — событий нет</div>
                        ) : (
                            <div className={styles.cardBody}>
                                {events.map((e, i) => (
                                    <button
                                        type="button"
                                        key={i}
                                        className={dash.row}
                                        onClick={() => router.push(`/company/orders/${e.orderId}`)}
                                    >
                                        <span className={dash.rowName}>
                                            <b className={dash.num}>{e.orderNumber}</b>
                                            {STATUS_LABELS[e.status] || e.status}
                                        </span>
                                        <span className={`${dash.rowValue} ${dash.muted}`}>{dayjs(e.changedAt).format('DD.MM HH:mm')}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
