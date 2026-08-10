'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DatePicker } from 'antd';
import {
    ArrowDownLeft,
    ArrowLeftRight,
    ArrowUpRight,
    Boxes,
    CalendarDays,
    ChevronRight,
    Clock,
    FileCheck2,
    FilePen,
    Flag,
    Inbox,
    Layers,
    PackageMinus,
    PackagePlus,
    Plus,
    ReceiptText,
    Scale,
    Search,
    Users,
    Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { BETA_LABEL, betaStateOf } from '@/lib/beta-sections';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { toast } from 'sonner';
import styles from './finance-hub.module.css';
dayjs.extend(quarterOfYear);

const { RangePicker } = DatePicker;

interface DashboardSummary {
    revenue: number;
    margin: number;
    marginPercentage: number;
    debtorSum: number;
    creditorSum: number;
    cashBalance: number;
    unpaidOrdersCount: number;
}

interface Link {
    label: string;
    href: string;
    show: boolean;
    /** Короткая подпись под названием — она печатается в списке. */
    desc?: string;
    /** Полное объяснение: уходит в подсказку при наведении. */
    full?: string;
    icon: LucideIcon;
}

interface Group {
    title: string;
    icon: LucideIcon;
    links: Link[];
}

/**
 * Разряды — неразрывным пробелом, минус — настоящий (U+2212).
 *
 * С обычным пробелом длинное число переносится на вторую строку и ломает
 * высоту плитки; с дефисом вместо минуса «−620 000» читается как перенос.
 */
function formatAmount(value: number, compact: boolean): string {
    const abs = Math.abs(value);
    const sign = value < 0 ? '−' : '';

    if (compact && abs >= 1_000_000_000) {
        const v = abs / 1_000_000_000;
        return `${sign}${v.toFixed(v < 10 ? 2 : 1).replace('.', ',')} млрд ₸`;
    }
    if (compact && abs >= 1_000_000) {
        const v = abs / 1_000_000;
        return `${sign}${v.toFixed(v < 100 ? 1 : 0).replace('.', ',')} млн ₸`;
    }
    return `${sign}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(abs)} ₸`;
}

/** Точная сумма до тенге — в подсказке при наведении. */
function exactAmount(value: number): string {
    const sign = value < 0 ? '−' : '';
    return `${sign}${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.abs(value))} ₸`;
}

type PeriodKey = 'today' | 'month' | 'quarter' | 'year';

const PERIODS: { key: PeriodKey; label: string; range: () => [dayjs.Dayjs, dayjs.Dayjs] }[] = [
    { key: 'today', label: 'Сегодня', range: () => [dayjs().startOf('day'), dayjs().endOf('day')] },
    { key: 'month', label: 'Месяц', range: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
    { key: 'quarter', label: 'Квартал', range: () => [dayjs().startOf('quarter'), dayjs().endOf('quarter')] },
    { key: 'year', label: 'Год', range: () => [dayjs().startOf('year'), dayjs().endOf('year')] },
];

export default function FinanceHubPage() {
    const router = useRouter();
    const { user } = useAuthStore();

    const isAdmin = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    const hasPerm = (perm: string) => isAdmin || (user?.permissions || []).includes(perm);
    const acc = hasPerm('accounting');

    const [loading, setLoading] = useState(acc);
    const [period, setPeriod] = useState<PeriodKey | null>('month');
    const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (!acc) return;
        const fetchSummary = async () => {
            setLoading(true);
            try {
                const params: any = {};
                if (dates && dates[0] && dates[1]) {
                    params.startDate = dates[0].startOf('day').toISOString();
                    params.endDate = dates[1].endOf('day').toISOString();
                }
                const res = await api.get('/accounting/dashboard-summary', { params });
                setSummary(res.data);
            } catch (err: any) {
                toast.error('Не удалось загрузить сводные показатели');
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, [dates, acc]);

    // Здесь только ежедневная работа. Отчёты уехали в свой раздел,
    // справочники — в «Кабинет»: их заводят один раз и больше не трогают,
    // а стояли они вровень со счетами и оплатами.
    const groups: Group[] = [
        {
            title: 'Документы',
            icon: ReceiptText,
            links: [
                // Не справочник, а очередь работы: контрагент прислал счёт, и
                // по нему нужно решение. Поэтому первым пунктом.
                { label: 'Входящие документы', href: '/company/accounting/incoming', show: acc, icon: Inbox, desc: 'Прислали счёт — принять или отклонить', full: 'Счета и акты, присланные контрагентами прямо на платформе: принять или отклонить' },
                { label: 'Счета', href: '/company/accounting/invoices', show: acc, icon: ReceiptText, desc: 'Покупателям и от поставщиков', full: 'Счета покупателям и от поставщиков — создание и журнал' },
                { label: 'Акты выполненных работ', href: '/company/accounting/acts', show: acc, icon: FileCheck2, desc: 'Журнал актов по заявкам', full: 'Журнал актов по заявкам: открыть, проверить, распечатать' },
                { label: 'Доверенности и договоры-заявки', href: '/company/accounting/transport-documents', show: acc, icon: FilePen, desc: 'Печать документов по рейсам', full: 'Документы по рейсам за период: найти и распечатать, не открывая заявку' },
            ],
        },
        {
            title: 'Платежи',
            icon: Wallet,
            links: [
                { label: 'Приход денег', href: '/company/accounting/cash-in', show: acc, icon: ArrowDownLeft, desc: 'Заказчик оплатил — записать', full: 'Журнал поступлений: создать документ, выбрать статью, счёт, контрагента, заявку' },
                { label: 'Расход денег', href: '/company/accounting/cash-out', show: acc, icon: ArrowUpRight, desc: 'Оплатили перевозчику или за топливо', full: 'Журнал расходов: создать документ, выбрать статью, счёт, контрагента, заявку' },
                { label: 'Все операции', href: '/company/accounting/operations', show: acc, icon: ArrowLeftRight, desc: 'Вся история денег в одном месте', full: 'Вся история денег в одном месте: приходы и расходы' },
                { label: 'Платёжный календарь', href: '/company/accounting/calendar', show: acc, icon: CalendarDays, desc: 'Что и когда движется по деньгам', full: 'Приходы и оплаты по дням — что и когда движется по деньгам' },
                { label: 'Планируемые платежи', href: '/company/accounting/planned', show: acc, icon: Clock, desc: 'Что предстоит заплатить и получить', full: 'Что предстоит: кто должен нам и кому должны мы — с плановой датой' },
            ],
        },
        {
            title: 'Долги и остатки',
            icon: Scale,
            links: [
                { label: 'Взаиморасчёты', href: '/company/accounting/counterparty-report', show: acc, icon: Scale, desc: 'Кто кому должен, просрочка, сверка', full: 'Кто кому должен — по каждому контрагенту, с просрочкой и актом сверки' },
                { label: 'Остатки по кассам', href: '/company/accounting/balances', show: acc, icon: Wallet, desc: 'Сколько денег на счетах и в кассах', full: 'Сколько денег сейчас на счетах и в кассах' },
                { label: 'Ввод начальных остатков', href: '/company/accounting/opening-balances', show: acc, icon: Flag, desc: 'Стартовые суммы при запуске учёта', full: 'Стартовые суммы на счетах и долги контрагентов при запуске учёта' },
            ],
        },
        {
            // Не «ТМЦ и склад»: склад — это очередь на погрузку, а здесь то,
            // что компания покупает для себя, — масло, шины, запчасти.
            title: 'Материалы',
            icon: Boxes,
            links: [
                { label: 'Поступление материалов', href: '/company/inventory/receipts', show: acc, icon: PackagePlus, desc: 'Купили масло, шины, запчасти', full: 'Приход материалов от поставщика: что, сколько и почём' },
                { label: 'Списание материалов', href: '/company/inventory/writeoffs', show: acc, icon: PackageMinus, desc: 'Залили в машину, поставили на ремонт', full: 'Списание материалов со статьёй затрат — попадает в прибыль по средней цене покупки' },
                { label: 'Остатки материалов', href: '/company/inventory/balances', show: acc, icon: Layers, desc: 'Сколько ещё осталось', full: 'Сколько и чего сейчас на складах' },
                { label: 'Перемещение материалов', href: '/company/inventory/transfers', show: acc, icon: ArrowLeftRight, desc: 'Между складами, если их несколько', full: 'Перемещение материалов между складами' },
            ],
        },
        {
            title: 'Зарплата',
            icon: Users,
            links: [
                { label: 'Зарплата', href: '/company/payroll', show: acc && isAdmin, icon: Users, desc: 'Начисления и выплаты сотрудникам' },
                { label: 'Моя зарплата', href: '/company/my-salary', show: user?.role === 'LOGISTICIAN', icon: Users, desc: 'Ваши начисления' },
            ],
        },
    ];

    /**
     * Поиск по разделу. Сорок ссылок глазами не просматривают — ищут словом.
     * Фильтруются названия и подписи; пустые группы пропадают.
     */
    const visibleGroups = useMemo(() => {
        const q = query.trim().toLowerCase();
        return groups
            .map((g) => ({
                ...g,
                links: g.links.filter((l) => l.show && (
                    !q
                    || l.label.toLowerCase().includes(q)
                    || (l.desc || '').toLowerCase().includes(q)
                    || g.title.toLowerCase().includes(q)
                )),
            }))
            .filter((g) => g.links.length > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, acc, isAdmin, user?.role]);

    /**
     * Сокращать суммы или нет — решается один раз на всю строку, по самой
     * большой. Иначе рядом встанут «980 500 000 ₸» и «1,20 млрд ₸», и плитки
     * станет невозможно сравнить взглядом при разнице в проценты.
     */
    const compact = useMemo(() => {
        if (!summary) return false;
        const biggest = Math.max(
            Math.abs(summary.revenue || 0),
            Math.abs(summary.margin || 0),
            Math.abs(summary.cashBalance || 0),
            Math.abs(summary.debtorSum || 0),
            Math.abs(summary.creditorSum || 0),
        );
        return biggest >= 1_000_000_000;
    }, [summary]);

    const applyPeriod = (p: typeof PERIODS[number]) => {
        setPeriod(p.key);
        setDates(p.range());
    };

    const quickActions: { label: string; href: string; icon: LucideIcon; primary?: boolean }[] = [
        { label: 'Выставить счёт', href: '/company/accounting/invoices/create', icon: Plus, primary: true },
        { label: 'Приход денег', href: '/company/accounting/cash-in', icon: ArrowDownLeft },
        { label: 'Расход денег', href: '/company/accounting/cash-out', icon: ArrowUpRight },
        { label: 'Акт выполненных работ', href: '/company/accounting/acts', icon: FileCheck2 },
        { label: 'Платёжный календарь', href: '/company/accounting/calendar', icon: CalendarDays },
    ];

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Деньги · Каждый день</div>
                    <h1 className={styles.title}>Деньги и документы компании</h1>
                    <p className={styles.subtitle}>
                        Счета, оплаты и долги. Отчёты — в своём разделе, справочники — в «Кабинете».
                    </p>
                </div>
                {acc && (
                    <div className={styles.periodRow}>
                        <div className={styles.pills}>
                            {PERIODS.map((p) => (
                                <button
                                    key={p.key}
                                    type="button"
                                    className={`${styles.pill} ${period === p.key ? styles.pillActive : ''}`}
                                    onClick={() => applyPeriod(p)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        {/* Логика выбора дат прежняя — меняется только вид. */}
                        <RangePicker
                            value={dates}
                            onChange={(val) => { setDates(val as any); setPeriod(null); }}
                            allowClear
                            format="DD.MM.YYYY"
                        />
                    </div>
                )}
            </div>

            {acc && summary && !loading && (
                <div className={styles.kpis}>
                    <Kpi
                        label="Выручка"
                        value={formatAmount(summary.revenue || 0, compact)}
                        title={exactAmount(summary.revenue || 0)}
                        sub="за период"
                    />
                    <Kpi
                        label="Маржа"
                        value={formatAmount(summary.margin || 0, compact)}
                        title={exactAmount(summary.margin || 0)}
                        sub={(summary.margin || 0) < 0 ? 'убыток за период' : 'заработок за период'}
                        negative={(summary.margin || 0) < 0}
                        chip={summary.marginPercentage != null
                            ? `${(summary.marginPercentage || 0) < 0 ? '−' : ''}${Math.abs(summary.marginPercentage).toString().replace('.', ',')}%`
                            : undefined}
                        chipTone={(summary.margin || 0) < 0 ? 'neg' : undefined}
                    />
                    <Kpi
                        label="Баланс"
                        value={formatAmount(summary.cashBalance || 0, compact)}
                        title={exactAmount(summary.cashBalance || 0)}
                        sub="касса и счета"
                    />
                    <Kpi
                        label="Дебиторка"
                        value={formatAmount(summary.debtorSum || 0, compact)}
                        title={exactAmount(summary.debtorSum || 0)}
                        sub="ждём от заказчиков"
                    />
                    <Kpi
                        label="Кредиторка"
                        value={formatAmount(summary.creditorSum || 0, compact)}
                        title={exactAmount(summary.creditorSum || 0)}
                        sub="должны перевозчикам"
                    />
                    <Kpi
                        label="Рейсы с долгом"
                        value={String(summary.unpaidOrdersCount ?? 0)}
                        sub="заявок не оплачено"
                        chip={(summary.unpaidOrdersCount ?? 0) > 0 ? 'долг' : undefined}
                        chipTone="warn"
                    />
                </div>
            )}

            <div className={styles.toolbar}>
                <div className={styles.actions}>
                    {acc && quickActions.map((a) => (
                        <button
                            key={a.href + a.label}
                            type="button"
                            className={`${styles.action} ${a.primary ? styles.actionPrimary : ''}`}
                            onClick={() => router.push(a.href)}
                        >
                            <a.icon size={15} />
                            {a.label}
                        </button>
                    ))}
                </div>
                <div className={styles.search}>
                    <Search size={15} className={styles.searchIcon} />
                    <input
                        className={styles.searchInput}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск по разделу…"
                        aria-label="Поиск по разделу"
                    />
                    <span className={styles.searchKey}>⌘K</span>
                </div>
            </div>

            {visibleGroups.length === 0 ? (
                <div className={styles.empty}>
                    {query.trim() ? 'Ничего не нашлось. Попробуйте другое слово' : 'Разделы недоступны'}
                </div>
            ) : (
                <div className={styles.grid}>
                    {visibleGroups.map((group) => (
                        <section key={group.title} className={styles.group}>
                            <div className={styles.groupHead}>
                                <group.icon size={15} />
                                <h2 className={styles.groupTitle}>{group.title}</h2>
                                <span className={styles.groupCount}>{group.links.length}</span>
                            </div>
                            <div className={styles.groupBody}>
                                {group.links.map((link) => {
                                    const beta = betaStateOf(link.href);
                                    const closed = beta === 'closed';
                                    return (
                                        <button
                                            key={link.href + link.label}
                                            type="button"
                                            className={`${styles.item}${closed ? ' lc-item-closed' : ''}`}
                                            title={closed ? 'Раздел пока закрыт' : (link.full || link.desc)}
                                            disabled={closed}
                                            onClick={() => { if (!closed) router.push(link.href); }}
                                        >
                                            <span className={styles.itemIcon}>
                                                <link.icon size={16} />
                                            </span>
                                            <span className={styles.itemText}>
                                                <span className={styles.itemLabel}>
                                                    {link.label}
                                                    {beta && <span className="lc-beta-tag">{BETA_LABEL}</span>}
                                                </span>
                                                {link.desc && <span className={styles.itemDesc}>{link.desc}</span>}
                                            </span>
                                            <ChevronRight size={14} className={styles.chevron} />
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}

function Kpi({ label, value, sub, title, chip, chipTone, negative }: {
    label: string;
    value: string;
    sub: string;
    title?: string;
    chip?: string;
    chipTone?: 'neg' | 'warn';
    negative?: boolean;
}) {
    const chipClass = chipTone === 'neg' ? styles.chipNeg : chipTone === 'warn' ? styles.chipWarn : '';
    return (
        <div className={styles.kpi}>
            <div className={styles.kpiHead}>
                <span className={styles.kpiLabel}>{label}</span>
                {chip && <span className={`${styles.chip} ${chipClass}`}>{chip}</span>}
            </div>
            <div className={`${styles.kpiValue} ${negative ? styles.kpiValueNeg : ''}`} title={title}>
                {value}
            </div>
            <div className={styles.kpiSub}>{sub}</div>
        </div>
    );
}
