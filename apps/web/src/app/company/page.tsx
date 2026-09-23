'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowDown, ArrowUp, Bell, Plus, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { STATUS_LABELS } from '@/components/ui/StatusPill';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import DashboardCard from '@/components/dashboard/DashboardCard';
import PendingWorkCard from '@/components/dashboard/PendingWorkCard';
import PaymentProofsCard from '@/components/dashboard/PaymentProofsCard';
import PaymentCalendarCard from '@/components/dashboard/PaymentCalendarCard';
import IncomingInvoicesCard from '@/components/dashboard/IncomingInvoicesCard';
import SubscriptionCard from '@/components/dashboard/SubscriptionCard';
import EmployeeEarningsCard from '@/components/dashboard/EmployeeEarningsCard';
import dayjs from 'dayjs';
import styles from '@/components/nova/nova.module.css';
import dash from './dashboard.module.css';
import Loader from '@/components/ui/Loader';
import { monthLabel } from '@/lib/ru-date';
import { НАЗВАНИЯ_БЛОКОВ, видимыеБлоки } from '@/lib/dashboard-blocks';

// ==================== Типы ====================

interface ActivityBucket {
    created: number;
    completed: number;
    /** Оборот: сколько выставлено заказчикам по заявкам месяца. */
    revenue: number;
    /** Сколько из этого уходит перевозчикам. */
    cost: number;
    /** Что остаётся компании — считает сервер, а не вычитание на глаз. */
    margin: number;
    activeCustomers: number;
    activeCarriers: number;
}

interface DashboardActivity {
    today: ActivityBucket;
    current: ActivityBucket;
    previous: ActivityBucket;
    /** Какими месяцами подписать колонки — считает сервер, «2026-09». */
    months?: { current: string; previous: string };
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

/**
 * Стрелка сравнения с прошлым месяцем.
 *
 * `neutral` — для строк, где рост сам по себе ни хорош, ни плох. Затраты на
 * перевозчиков растут вместе с выручкой, и это обычное дело: зелёный на них
 * читается как похвала, красный — как тревога, а верно ни то, ни другое.
 * Судить надо по марже, у неё цвет и остаётся.
 */
function Delta({ cur, prevVal, money, neutral }: {
    cur: number;
    prevVal: number;
    money?: boolean;
    neutral?: boolean;
}) {
    const diff = cur - prevVal;
    if (diff === 0) {
        return <span className={dash.muted}>без изменений</span>;
    }
    const up = diff > 0;
    const тон = neutral ? dash.muted : up ? styles.valuePos : styles.valueNeg;
    return (
        <span className={`${dash.delta} ${тон}`}>
            {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {up ? '+' : '−'}{money ? fmt(Math.abs(diff)) : Math.abs(diff)}
        </span>
    );
}

const BLOCKS_LS_KEY = 'lc_dashboard_hidden_blocks';
/**
 * Что можно свернуть кнопкой «Настроить». Подписи — из общего словаря
 * блоков: раньше здесь был свой список, и лента событий называлась в нём
 * «Уведомлениями», а на самом дашборде — «Последними событиями».
 */
const ALL_BLOCKS = (['activity', 'earnings', 'paymentCalendar', 'pendingWork', 'incomingInvoices', 'events'] as const)
    .map(key => ({ key, label: НАЗВАНИЯ_БЛОКОВ[key] }));

// ==================== Страница ====================

export default function CompanyDashboard() {
    const router = useRouter();
    const { user } = useAuthStore();
    const isManager = user?.role === 'LOGISTICIAN';
    // Полный дашборд (активность, задолженность) — только администратору компании
    const isOwner = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    /**
     * Что этому человеку открыто на дашборде.
     *
     * Набор задаёт руководитель в «Сотрудниках»; пока он его не трогал,
     * работает прежнее правило по роли. Раньше блоки были прибиты к роли
     * намертво, и под каждый случай — «финансовому отделу нужна активность»,
     * «старшему менеджеру сводка по всем заявкам» — пришлось бы заводить
     * новую роль.
     */
    const открыто = useMemo(() => new Set<string>(видимыеБлоки(user ?? {})), [user]);

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
    /**
     * Блок на экране: и открыт руководителем, и не свёрнут самим человеком.
     *
     * Два разных решения, и путать их нельзя: одно про доступ, второе про
     * личное удобство. Свернул себе блок — это его дело; не открыли блок —
     * его не вернёт никакая кнопка «Настроить».
     */
    const блок = (ключ: string) => открыто.has(ключ) && show(ключ);

    // Личные показатели сотрудника (не-администратора)
    const [myStats, setMyStats] = useState<{ total: number; pending: number; inWork: number; completed: number } | null>(null);
    /** Сервер отказал в заявках: раздел человеку не открыт, плитки не его. */
    const [statsDenied, setStatsDenied] = useState(false);

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

        // Сводку по компании грузим тем, кому открыт блок «Активность», а не
        // по роли: иначе выданная галочка показывала бы пустую таблицу.
        if (открыто.has('activity')) {
            api.get('/company/dashboard-activity')
                .then(res => setActivity(res.data))
                .catch(() => { })
                .finally(() => setActivityLoading(false));
        } else {
            setActivityLoading(false);
        }

        // Личные плитки — своя, отдельная загрузка.
        //
        // Раньше она стояла в «иначе» от сводки компании, и это было верно,
        // пока сводку видел один владелец. Как только блок «Активность» стало
        // можно выдать менеджеру, его собственные заявки перестали грузиться
        // вовсе: вместо чисел в плитках встали прочерки. Два разных вопроса —
        // «открыта ли сводка компании» и «чьи плитки на экране» — и решаются
        // они порознь.
        if (!isOwner) {
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
                // Отказ — это не сбой загрузки, а «раздел вам не открыт»: у
                // бухгалтера без права «Заявки» сервер отвечает отказом
                // всегда, и три прочерка над дашбордом означали бы поломку
                // там, где её нет. Плитки в этом случае не показываем.
                .catch((e: any) => { if (e?.response?.status === 403) setStatsDenied(true); });
        }
    }, [user, isOwner, isManager, открыто]);

    const cur = activity?.current;
    const prev = activity?.previous;
    const tdy = activity?.today;

    // Колонки подписаны настоящими месяцами — «Август», «Сентябрь», — а не
    // «этот» и «прошлый». Владелец сверяет таблицу с бумагами за конкретный
    // месяц, и лишний шаг «а какой сейчас месяц» тут ни к чему.
    //
    // Пока данные не пришли, подписи остаются прежними: подставлять месяц
    // по часам браузера нельзя — он в своём поясе, и первого числа ночью
    // подпись разошлась бы с числами под ней.
    const этотМесяц = monthLabel(activity?.months?.current) || 'Этот месяц';
    const прошлыйМесяц = monthLabel(activity?.months?.previous) || 'Прошлый месяц';

    // Строки таблицы «Активности»: Сегодня / Этот месяц / Прошлый месяц / Динамика
    const activityRows = useMemo(() => {
        if (!cur || !prev || !tdy) return [];
        // Значки из строк убраны: шесть цветных пятен в столбце подписей
        // спорили с числами, ради которых в таблицу и смотрят.
        // Порядок строк — как читают отчёт: сколько заказчиков, сколько
        // перевозок, сколько денег пришло, сколько из них ушло и что
        // осталось. Раньше здесь стояли «Доход» и «Расходы» без третьей
        // строки, и главное число — что компания на этом заработала —
        // приходилось считать в уме.
        const rows = [
            { label: 'Активные заказчики', key: 'activeCustomers' as const },
            { label: 'Активные перевозчики', key: 'activeCarriers' as const },
            { label: 'Создано заявок', key: 'created' as const },
            { label: 'Завершено заявок', key: 'completed' as const },
            { label: 'Выручка с заявок, ₸', key: 'revenue' as const, money: true },
            { label: 'Затраты на перевозчиков, ₸', key: 'cost' as const, money: true, neutral: true },
            { label: 'Маржа с заявок, ₸', key: 'margin' as const, money: true },
        ];
        return rows.map(r => ({
            ...r,
            today: tdy[r.key],
            current: cur[r.key],
            previous: prev[r.key],
        }));
    }, [cur, prev, tdy]);

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
                        <Popover>
                            <PopoverTrigger asChild>
                                <button type="button" className={styles.action}>
                                    <Settings size={14} /> Настроить
                                </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className={dash.settings}>
                                <div className={dash.settingsTitle}>Блоки дашборда</div>
                                {ALL_BLOCKS.map(b => (
                                    <label key={b.key} className={dash.settingsItem}>
                                        {/* Квадрат, а не круг: круглая галочка читается
                                            как «выбрать одно из», а здесь можно снять любые. */}
                                        <Checkbox
                                            className="rounded-[4px]"
                                            checked={show(b.key)}
                                            onCheckedChange={() => toggleBlock(b.key)}
                                        />
                                        {b.label}
                                    </label>
                                ))}
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
            </div>

            {/* ===== ПОКАЗАТЕЛИ =====
                При неудачной загрузке в плитках прочерк, а не ноль: ноль
                читается как факт о работе компании, хотя это отсутствие
                ответа.

                Тариф — последней плиткой этого же ряда. Раньше он стоял
                отдельной полосой во всю ширину с одной строкой текста и
                делил дашборд на лишний этаж. */}
            <div className={dash.tiles}>
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
                        {/* Только руководителю: платит он, и запрос на счёт
                            сервер принимает тоже от него. */}
                        <SubscriptionCard />
                    </>
                ) : (
                    <>
                        {!statsDenied && (
                            <>
                                <Tile label={isManager ? 'Мои заявки' : 'Заявки'} value={myStats?.total ?? '—'} sub="за всё время" />
                                <Tile label="В работе" value={myStats?.inWork ?? '—'} sub="активные перевозки" />
                                <Tile
                                    label="Ожидают"
                                    value={myStats?.pending ?? '—'}
                                    sub={(myStats?.pending || 0) > 0 ? 'требуют внимания' : 'всё назначено'}
                                    tone={(myStats?.pending || 0) > 0 ? 'warn' : undefined}
                                />
                            </>
                        )}
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

            {/* ===== БЛОКИ =====
                Порядок здесь — это и есть раскладка: сетка кладёт блоки по
                третям слева направо (см. `.board`; на планшете часть блоков
                переставлена там же).

                Первый ряд — итоги месяца: «Активность» на две трети и рядом
                заработок сотрудников, по высоте они почти равны. Второй —
                работа с деньгами: хвосты оформления, входящие счета, чеки и
                календарь. События — в конце: лента выглядит уместно любой
                ширины, и если последний ряд окажется неполным, растянется
                именно она. */}
            <div className={dash.board}>
                {блок('activity') && (
                    <DashboardCard
                        className={dash.wide}
                        icon={<Activity size={14} />}
                        title="Активность"
                        link={{ label: 'Все заявки', onClick: () => router.push('/company/orders') }}
                        flush
                    >
                        {activityLoading ? (
                            <DashboardCard.Center><Loader /></DashboardCard.Center>
                        ) : activityRows.length === 0 ? (
                            <DashboardCard.Center>Пока нет данных за месяц</DashboardCard.Center>
                        ) : (
                            <div className={dash.activityWrap}>
                                <table className={dash.table}>
                                    <thead>
                                        <tr>
                                            <th>Показатель</th>
                                            <th className={dash.right}>Сегодня</th>
                                            <th className={dash.right}>{прошлыйМесяц}</th>
                                            <th className={dash.right}>{этотМесяц}</th>
                                            <th className={dash.right}>Динамика</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activityRows.map(r => (
                                            <tr key={r.key}>
                                                <td>{r.label}</td>
                                                {/* `data-label` — подпись столбца для узкой
                                                    карточки: там шапки таблицы нет, и число
                                                    подписывается само. */}
                                                <td className={dash.right} data-label="Сегодня">{r.money ? fmt(r.today) : r.today}</td>
                                                <td className={`${dash.right} ${dash.muted}`} data-label={прошлыйМесяц}>{r.money ? fmt(r.previous) : r.previous}</td>
                                                <td className={`${dash.right} ${dash.strong}`}>{r.money ? fmt(r.current) : r.current}</td>
                                                <td className={dash.right}><Delta cur={r.current} prevVal={r.previous} money={r.money} neutral={(r as { neutral?: boolean }).neutral} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </DashboardCard>
                )}

                {/* ===== ЗАРАБОТОК СОТРУДНИКОВ =====

                    Здесь была задолженность. Она осталась целой страницей во
                    «Взаиморасчётах» и плиткой в платёжном календаре, а на
                    дашборде повторялась третий раз. Сколько компания должна
                    своим — оклад, процент и премии — не было видно нигде,
                    кроме страницы зарплат, куда заходят раз в месяц. */}
                {блок('earnings') && <EmployeeEarningsCard className={dash.earnings} />}

                {/* ===== ТРЕБУЕТ ОФОРМЛЕНИЯ =====
                    Рейсы без акта, акты без счёта, просроченные счета — и
                    ссылка в журнал счетов. Список сужается так же, как заявки:
                    менеджеру «только свои» — его хвосты, не чужие. */}
                {блок('pendingWork') && <PendingWorkCard />}

                {/* ===== ВХОДЯЩИЕ СЧЕТА =====
                    Пока счёт лежал только в «Счета → Входящие», о нём узнавали
                    случайно — и находили бумагу недельной давности с истёкшим
                    сроком оплаты. */}
                {блок('incomingInvoices') && <IncomingInvoicesCard />}
                {блок('paymentProofs') && <PaymentProofsCard />}

                {/* ===== ПЛАТЁЖНЫЙ КАЛЕНДАРЬ =====
                    Кому открыт блок, тот и видит календарь. Суммы в нём
                    считаются по тем же рейсам, что человеку и так видны: у
                    менеджера «только свои» — по его сделкам. */}
                {блок('paymentCalendar') && <PaymentCalendarCard className={dash.calendar} />}

                {/* ===== УВЕДОМЛЕНИЯ ===== */}
                {блок('events') && (
                    <DashboardCard className={dash.eventsCard} icon={<Bell size={14} />} title="Последние события">
                        {eventsLoading ? (
                            <DashboardCard.Center><Loader /></DashboardCard.Center>
                        ) : events.length === 0 ? (
                            <DashboardCard.Center>Пока тихо — событий нет</DashboardCard.Center>
                        ) : (
                            <div className={dash.events}>
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
                    </DashboardCard>
                )}
            </div>
        </div>
    );
}
