'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DatePicker } from 'antd';
import {
    ArrowDownLeft,
    ArrowLeftRight,
    ArrowUpRight,
    Banknote,
    Boxes,
    Building2,
    Calculator,
    CalendarDays,
    ChartColumn,
    ChartPie,
    ChevronRight,
    Clock,
    Coins,
    CreditCard,
    FileCheck2,
    FilePen,
    Flag,
    Hash,
    Inbox,
    Landmark,
    Layers,
    ListChecks,
    PackageMinus,
    PackagePlus,
    Plus,
    ReceiptText,
    RefreshCw,
    Scale,
    Search,
    Settings2,
    Table2,
    Tags,
    TrendingUp,
    Truck,
    Users,
    Wallet,
    Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
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

    const groups: Group[] = [
        {
            title: 'Документы',
            icon: ReceiptText,
            links: [
                { label: 'Счета', href: '/company/accounting/invoices', show: acc, icon: ReceiptText, desc: 'Покупателям и от поставщиков', full: 'Счета покупателям и от поставщиков — создание и журнал' },
                { label: 'Акты выполненных работ', href: '/company/accounting/acts', show: acc, icon: FileCheck2, desc: 'Журнал актов по заявкам', full: 'Журнал актов по заявкам: открыть, проверить, распечатать' },
                { label: 'Доверенности и договоры-заявки', href: '/company/accounting/transport-documents', show: acc, icon: FilePen, desc: 'Печать документов по рейсам', full: 'Документы по рейсам за период: найти и распечатать, не открывая заявку' },
                // Не справочник, а очередь работы: контрагент прислал счёт, и
                // по нему нужно решение. В справочниках это никто не найдёт.
                { label: 'Входящие документы', href: '/company/accounting/incoming', show: acc, icon: Inbox, desc: 'Принять или отклонить', full: 'Счета и акты, присланные контрагентами прямо на платформе: принять или отклонить' },
            ],
        },
        {
            title: 'Деньги',
            icon: Wallet,
            links: [
                { label: 'Платёжный календарь', href: '/company/accounting/calendar', show: acc, icon: CalendarDays, desc: 'Что и когда движется по деньгам', full: 'Приходы и оплаты по дням — что и когда движется по деньгам' },
                { label: 'Планируемые платежи', href: '/company/accounting/planned', show: acc, icon: Clock, desc: 'Кто должен нам и кому должны мы', full: 'Что предстоит: кто должен нам и кому должны мы — с плановой датой' },
                { label: 'Поступление денежных средств', href: '/company/accounting/cash-in', show: acc, icon: ArrowDownLeft, desc: 'Журнал приходов', full: 'Журнал поступлений: создать документ, выбрать статью, счёт, контрагента, заявку' },
                { label: 'Расход денежных средств', href: '/company/accounting/cash-out', show: acc, icon: ArrowUpRight, desc: 'Журнал расходов', full: 'Журнал расходов: создать документ, выбрать статью, счёт, контрагента, заявку' },
                { label: 'Все операции', href: '/company/accounting/operations', show: acc, icon: ArrowLeftRight, desc: 'Вся история денег в одном месте', full: 'Вся история денег в одном месте: приходы и расходы' },
                { label: 'Остатки по кассам', href: '/company/accounting/balances', show: acc, icon: Wallet, desc: 'Сколько денег на счетах и в кассах', full: 'Сколько денег сейчас на счетах и в кассах' },
                { label: 'Движение денежных средств', href: '/company/accounting/cashflow', show: acc, icon: TrendingUp, desc: 'Куда пришли и ушли живые деньги', full: 'Куда пришли и ушли живые деньги за период' },
                { label: 'Расходы по статьям', href: '/company/accounting/expenses-by-category', show: acc, icon: ChartPie, desc: 'Структура затрат за период', full: 'Все расходы за период, сгруппированные по статьям, с долей каждой' },
                { label: 'Ввод начальных остатков', href: '/company/accounting/opening-balances', show: acc, icon: Flag, desc: 'Стартовые суммы при запуске учёта', full: 'Стартовые суммы на счетах и долги контрагентов при запуске учёта' },
            ],
        },
        {
            title: 'Задолженность',
            icon: Scale,
            links: [
                { label: 'Взаиморасчёты', href: '/company/accounting/counterparty-report', show: acc, icon: Scale, desc: 'Кто кому должен, просрочка, сверка', full: 'Кто кому должен — по каждому контрагенту, с просрочкой и актом сверки' },
                { label: 'Реестр заявок', href: '/company/accounting/registry', show: acc, icon: Table2, desc: 'Доход, себестоимость, маржа, оплаты', full: 'Деньги по каждой заявке: доход, себестоимость, маржа, оплаты' },
            ],
        },
        {
            title: 'Прибыль',
            icon: ChartColumn,
            links: [
                { label: 'Отчёт по прибыли', href: '/company/accounting/pnl', show: acc, icon: ChartColumn, desc: 'Доход − себестоимость − расходы', full: 'Заработок: доход − себестоимость − расходы' },
                { label: 'Прибыль по перевозчику', href: '/company/accounting/carrier-profit', show: acc, icon: Truck, desc: 'Заработок на каждом перевозчике', full: 'Сколько заработано на каждом перевозчике: выручка − оплата перевозчику' },
                { label: 'Все отчёты', href: '/company/reports', show: acc, icon: ListChecks, desc: 'Сводки, аналитика, экспорт' },
            ],
        },
        {
            title: 'ТМЦ и склад',
            icon: Boxes,
            links: [
                { label: 'Ведомость по остаткам', href: '/company/inventory/balances', show: acc, icon: Layers, desc: 'Что и сколько сейчас на складах', full: 'Сколько и чего сейчас на складах' },
                { label: 'Поступление товаров', href: '/company/inventory/receipts', show: acc, icon: PackagePlus, desc: 'Приход ТМЦ от поставщика', full: 'Приход ТМЦ на склад от поставщика' },
                { label: 'Перемещение товаров', href: '/company/inventory/transfers', show: acc, icon: ArrowLeftRight, desc: 'Между складами', full: 'Перемещение ТМЦ между складами' },
                { label: 'Списание материалов', href: '/company/inventory/writeoffs', show: acc, icon: PackageMinus, desc: 'Расход, износ, недостача', full: 'Списание ТМЦ со склада: расход, износ, недостача' },
                { label: 'Номенклатура', href: '/company/inventory/nomenclature', show: acc, icon: Boxes, desc: 'Справочник товаров и материалов' },
                { label: 'Склады', href: '/company/inventory/warehouses', show: acc, icon: Warehouse, desc: 'Места хранения ТМЦ' },
            ],
        },
        {
            title: 'Зарплата и инструменты',
            icon: Users,
            links: [
                { label: 'Зарплата', href: '/company/payroll', show: acc && isAdmin, icon: Users, desc: 'Начисления и выплаты сотрудникам' },
                { label: 'Моя зарплата', href: '/company/my-salary', show: user?.role === 'LOGISTICIAN', icon: Users, desc: 'Ваши начисления' },
                { label: 'Калькулятор', href: '/company/calculator', show: true, icon: Calculator, desc: 'Быстрый расчёт стоимости перевозки' },
            ],
        },
        {
            title: 'Справочники',
            icon: Settings2,
            links: [
                { label: 'Статьи доходов и расходов', href: '/company/accounting/settings?tab=categories', show: acc, icon: Tags, desc: 'Для платежей и отчётов', full: 'Статьи движения денег и затрат для платежей и отчётов' },
                { label: 'Наименование услуг', href: '/company/accounting/settings?tab=services', show: acc, icon: ListChecks, desc: 'Формулировки для счетов и актов', full: 'Формулировки услуг для счетов и актов' },
                { label: 'Условия оплаты', href: '/company/accounting/payment-conditions', show: acc, icon: Clock, desc: 'Предоплата, по факту, отсрочка', full: 'Условия оплаты для заявок: предоплата, по факту, отсрочка' },
                { label: 'Формы оплаты', href: '/company/accounting/payment-forms', show: acc, icon: CreditCard, desc: 'Безнал, наличные, карта', full: 'Формы оплаты для заявок: безнал, наличные, карта' },
                { label: 'Формы собственности', href: '/company/accounting/ownership-types', show: acc, icon: Building2, desc: 'ТОО, ИП, АО', full: 'Организационно-правовые формы контрагентов: ТОО, ИП, АО' },
                { label: 'Банки', href: '/company/accounting/banks', show: acc, icon: Landmark, desc: 'Справочник банков и БИК', full: 'Справочник банков и БИК для реквизитов' },
                { label: 'Курсы валют', href: '/company/accounting/currencies', show: acc, icon: Coins, desc: 'Курсы Нацбанка РК по дням', full: 'Официальные курсы Нацбанка РК по дням, курс вручную для валют без официального' },
                { label: 'Переоценка валют', href: '/company/accounting/revaluation', show: acc, icon: RefreshCw, desc: 'Курсовая разница на конец месяца', full: 'Курсовая разница по валютным остаткам и неоплаченным долгам на конец месяца' },
                { label: 'Нумерация счетов', href: '/company/accounting/document-numbering', show: acc, icon: Hash, desc: 'Префикс, следующий номер', full: 'Свой префикс, следующий номер и количество цифр — формата «АВ-00010002»' },
                { label: 'Нумерация заявок', href: '/company/accounting/order-numbering', show: acc, icon: Hash, desc: 'Формат номера как в 1С', full: 'Формат номера как в 1С и стартовый номер' },
                { label: 'Счета и кассы', href: '/company/accounting/settings?tab=accounts', show: acc, icon: Banknote, desc: 'Ваши расчётные счета и кассы' },
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
                    <div className={styles.eyebrow}>Финансы · Обзор</div>
                    <h1 className={styles.title}>Учёт и финансы компании</h1>
                    <p className={styles.subtitle}>
                        Деньги, документы и долги компании — в одном месте
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
                                {group.links.map((link) => (
                                    <button
                                        key={link.href + link.label}
                                        type="button"
                                        className={styles.item}
                                        title={link.full || link.desc}
                                        onClick={() => router.push(link.href)}
                                    >
                                        <span className={styles.itemIcon}>
                                            <link.icon size={16} />
                                        </span>
                                        <span className={styles.itemText}>
                                            <span className={styles.itemLabel}>{link.label}</span>
                                            {link.desc && <span className={styles.itemDesc}>{link.desc}</span>}
                                        </span>
                                        <ChevronRight size={14} className={styles.chevron} />
                                    </button>
                                ))}
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
