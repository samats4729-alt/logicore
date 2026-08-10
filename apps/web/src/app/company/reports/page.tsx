'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Table, Statistic, Row, Col, Button, DatePicker, Tag, Alert, Divider } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
    ChartColumn,
    ChartPie,
    ChevronRight,
    Circle,
    CircleDot,
    FileSpreadsheet,
    Printer,
    RefreshCw,
    Scale,
    Table2,
    TrendingUp,
    Truck,
    Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from '@/components/nova/nova.module.css';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';

const { RangePicker } = DatePicker;

type ReportType = 'pnl' | 'counterparties' | 'profitability' | 'drivers' | 'summary';

/**
 * Готовые отчёты в один клик.
 *
 * Три вопроса, которые владелец задаёт чаще всего: сколько заработали за
 * месяц, какие рейсы вытягивают прибыль, и кто кому сколько должен.
 * Без пресетов каждый из них — это выбрать вкладку и вручную выставить
 * период, и границы периода каждый раз получаются разные.
 */
const PRESETS: {
    key: string;
    title: string;
    hint: string;
    report: ReportType;
    range: () => [dayjs.Dayjs, dayjs.Dayjs];
}[] = [
    {
        key: 'month-pnl',
        title: 'Итоги месяца',
        hint: 'доходы и расходы за текущий месяц',
        report: 'pnl',
        range: () => [dayjs().startOf('month'), dayjs().endOf('day')],
    },
    {
        key: 'quarter-profit',
        title: 'Рентабельность за квартал',
        hint: 'какие рейсы приносят прибыль',
        report: 'profitability',
        range: () => [dayjs().subtract(3, 'month').startOf('day'), dayjs().endOf('day')],
    },
    {
        key: 'year-counterparties',
        title: 'Расчёты за год',
        hint: 'кто кому сколько должен',
        report: 'counterparties',
        range: () => [dayjs().startOf('year'), dayjs().endOf('day')],
    },
];

/**
 * Отчёты бухгалтерии — ссылками отсюда.
 *
 * Они живут отдельными страницами и раньше открывались только из «Финансов»:
 * человек, пришедший «за отчётами», половины из них не находил.
 */
const MORE_REPORTS: { title: string; hint: string; href: string; icon: LucideIcon }[] = [
    { title: 'Отчёт по прибыли', hint: 'доход − себестоимость − расходы', href: '/company/accounting/pnl', icon: ChartColumn },
    { title: 'Прибыль по перевозчику', hint: 'заработок на каждом перевозчике', href: '/company/accounting/carrier-profit', icon: Truck },
    { title: 'Реестр заявок', hint: 'деньги по каждой заявке', href: '/company/accounting/registry', icon: Table2 },
    { title: 'Движение денежных средств', hint: 'куда пришли и ушли живые деньги', href: '/company/accounting/cashflow', icon: TrendingUp },
    { title: 'Расходы по статьям', hint: 'структура затрат за период', href: '/company/accounting/expenses-by-category', icon: ChartPie },
    { title: 'Взаиморасчёты', hint: 'кто кому должен и с какой просрочкой', href: '/company/accounting/counterparty-report', icon: Scale },
];

/**
 * Вкладки отчётов. «P&L» заменено на «Прибыль и убытки»: весь текст
 * интерфейса на русском, а сокращение читают только бухгалтеры.
 */
const TAB_LABELS: [ReportType, string][] = [
    ['pnl', 'Прибыль и убытки'],
    ['counterparties', 'Контрагенты'],
    ['profitability', 'Рентабельность'],
    ['drivers', 'Водители'],
    ['summary', 'Сводка'],
];

/** «2026-07» → «Июль 2026». Месяц по-русски и с большой буквы. */
const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function monthLabel(key: string): string {
    const [year, month] = key.split('-');
    return `${RU_MONTHS[Number(month) - 1] || month} ${year}`;
}

/** Колонки для выгрузки: те же поля, что в таблице на экране. */
const EXPORT_COLUMNS: Record<Exclude<ReportType, 'summary'>, { key: string; title: string; numeric?: boolean }[]> = {
    pnl: [
        { key: 'month', title: 'Период' },
        { key: 'income', title: 'Доходы, ₸', numeric: true },
        { key: 'expense', title: 'Расходы, ₸', numeric: true },
        { key: 'margin', title: 'Маржа, ₸', numeric: true },
    ],
    counterparties: [
        { key: 'name', title: 'Контрагент' },
        { key: 'income', title: 'Поступления, ₸', numeric: true },
        { key: 'expense', title: 'Выплаты, ₸', numeric: true },
        { key: 'balance', title: 'Сальдо, ₸', numeric: true },
    ],
    profitability: [
        { key: 'orderNumber', title: 'Заявка' },
        { key: 'route', title: 'Маршрут' },
        { key: 'revenue', title: 'Ставка, ₸', numeric: true },
        { key: 'cost', title: 'Затраты, ₸', numeric: true },
        { key: 'margin', title: 'Маржа, ₸', numeric: true },
        { key: 'pct', title: 'Маржинальность, %', numeric: true },
    ],
    drivers: [
        { key: 'name', title: 'Водитель' },
        { key: 'vehicle', title: 'Транспорт' },
        { key: 'orders', title: 'Рейсов', numeric: true },
        { key: 'completed', title: 'Завершено', numeric: true },
        { key: 'revenue', title: 'Выручка, ₸', numeric: true },
        { key: 'margin', title: 'Маржа, ₸', numeric: true },
    ],
};

const REPORT_TITLES: Record<ReportType, string> = {
    pnl: 'Прибыли и убытки',
    counterparties: 'Расчёты с контрагентами',
    profitability: 'Рентабельность рейсов',
    drivers: 'Отчёт по водителям',
    summary: 'Сводка',
};

interface DriverReportEntry {
    id: string;
    name: string;
    vehicle: string;
    orders: number;
    completed: number;
    revenue: number;
    margin: number;
}

export default function ReportsPage() {
    const router = useRouter();

    const [reportType, setReportType] = useState<ReportType>('pnl');
    const [activePreset, setActivePreset] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
        dayjs().subtract(90, 'day'), dayjs(),
    ]);

    const [orders, setOrders] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<DriverReportEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);

        const results = await Promise.allSettled([
            api.get('/company/orders'),
            api.get('/accounting/payments'),
            api.get('/users/drivers'),
        ]);

        // Process orders
        if (results[0].status === 'fulfilled') {
            const rawData = results[0].value.data;
            const ordersList = Array.isArray(rawData) ? rawData : (rawData?.data || []);
            setOrders(ordersList);
        } else {
            setOrders([]);
            setError(prev => prev ? `${prev}; Не удалось загрузить заявки` : 'Не удалось загрузить заявки');
        }

        // Process payments
        if (results[1].status === 'fulfilled') {
            setPayments(results[1].value.data || []);
        } else {
            setPayments([]);
            setError(prev => prev ? `${prev}; Не удалось загрузить платежи` : 'Не удалось загрузить платежи');
        }

        // Process drivers
        if (results[2].status === 'fulfilled') {
            const driverList = results[2].value.data || [];
            setDrivers(driverList.map((d: any) => ({
                id: d.id,
                name: `${d.lastName} ${d.firstName}`,
                vehicle: d.vehiclePlate || '—',
                orders: 0,
                completed: 0,
                revenue: 0,
                margin: 0,
            })));
        } else {
            setDrivers([]);
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const fmt = (n: number) => n.toLocaleString('ru-RU');

    // Filter by dates
    const filteredPayments = useMemo(() => payments.filter(p => {
        if (!dateRange) return true;
        const d = dayjs(p.date);
        return d.isAfter(dateRange[0].startOf('day')) && d.isBefore(dateRange[1].endOf('day'));
    }), [payments, dateRange]);

    const filteredOrders = useMemo(() => orders.filter(o => {
        if (!dateRange) return true;
        const d = dayjs(o.createdAt);
        return d.isAfter(dateRange[0].startOf('day')) && d.isBefore(dateRange[1].endOf('day'));
    }), [orders, dateRange]);

    // KPI Summary
    const totalIncome = filteredPayments.filter(p => p.direction === 'IN').reduce((s, p) => s + p.amount, 0);
    const totalExpense = filteredPayments.filter(p => p.direction === 'OUT').reduce((s, p) => s + p.amount, 0);

    // Unique counterparties
    const uniqueCounterparties = useMemo(() => {
        const names = new Set<string>();
        filteredPayments.forEach(p => {
            const name = p.counterparty?.name;
            if (name) names.add(name);
        });
        return names.size;
    }, [filteredPayments]);

    // P&L by months
    const pnlData = useMemo(() => {
        const map = new Map<string, { income: number; expense: number }>();
        // Ключ месяца — «2026-07», а не «Jul 2026»: по нему же идёт порядок
        // строк. С английским названием сортировка была алфавитной, и апрель
        // вставал перед январём. Группировка та же, суммы не меняются.
        filteredPayments.forEach(p => {
            const key = dayjs(p.date).format('YYYY-MM');
            const e = map.get(key) || { income: 0, expense: 0 };
            if (p.direction === 'IN') e.income += p.amount;
            else e.expense += p.amount;
            map.set(key, e);
        });
        return Array.from(map.entries())
            .map(([key, val]) => ({ key, month: monthLabel(key), ...val, margin: val.income - val.expense }))
            .sort((a, b) => a.key.localeCompare(b.key));
    }, [filteredPayments]);

    // Counterparties Report
    const cpData = useMemo(() => {
        const map = new Map<string, { income: number; expense: number; count: number }>();
        filteredPayments.forEach(p => {
            const name = p.counterparty?.name || 'Без названия';
            const e = map.get(name) || { income: 0, expense: 0, count: 0 };
            if (p.direction === 'IN') e.income += p.amount;
            else e.expense += p.amount;
            e.count++;
            map.set(name, e);
        });
        return Array.from(map.entries())
            .map(([name, val]) => ({ key: name, name, ...val, balance: val.income - val.expense }));
    }, [filteredPayments]);

    // Order Profitability Report
    const profitData = useMemo(() => filteredOrders
        .filter(o => o.status !== 'CANCELLED')
        .map(o => {
            const rev = o.customerPrice || 0;
            const cost = o.executorCost ?? o.subForwarderPrice ?? o.driverCost ?? 0;
            const route = o.routePoints?.map((p: any) => p.location?.city || p.location?.name).filter(Boolean).join(' → ') || '—';
            return {
                key: o.id,
                orderNumber: o.orderNumber,
                route,
                revenue: rev,
                cost: cost,
                margin: rev - cost,
                pct: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0,
            };
        }), [filteredOrders]);

    // Drivers Report
    const driverData = useMemo(() => {
        const map = new Map<string, DriverReportEntry>();
        drivers.forEach(d => map.set(d.id, { ...d, orders: 0, completed: 0, revenue: 0, margin: 0 }));

        filteredOrders.forEach(o => {
            const dId = o.driverId || o.driver?.id;
            if (!dId) return;

            if (!map.has(dId)) {
                map.set(dId, {
                    id: dId,
                    name: o.assignedDriverName || (o.driver ? `${o.driver.lastName} ${o.driver.firstName}` : 'Неизвестный'),
                    vehicle: o.assignedDriverPlate || o.driver?.vehiclePlate || '—',
                    orders: 0, completed: 0, revenue: 0, margin: 0,
                });
            }

            const e = map.get(dId)!;
            e.orders++;
            const rev = o.customerPrice || 0;
            const cost = o.executorCost ?? o.subForwarderPrice ?? o.driverCost ?? 0;
            e.revenue += rev;
            e.margin += (rev - cost);
            if (o.status === 'COMPLETED') e.completed++;
        });

        return Array.from(map.values()).filter(d => d.orders > 0);
    }, [filteredOrders, drivers]);

    /** Данные активной вкладки — то, что сейчас видно в таблице. */
    const currentRows = useMemo((): Record<string, unknown>[] => {
        if (reportType === 'pnl') return pnlData;
        if (reportType === 'counterparties') return cpData;
        if (reportType === 'profitability') return profitData;
        if (reportType === 'drivers') return driverData as unknown as Record<string, unknown>[];
        return [];
    }, [reportType, pnlData, cpData, profitData, driverData]);

    const applyPreset = (preset: typeof PRESETS[number]) => {
        setReportType(preset.report);
        setDateRange(preset.range());
        setActivePreset(preset.key);
    };

    /**
     * Выгрузка в Excel.
     *
     * Строки уходят на сервер как есть: отчёты считаются здесь, на экране,
     * и пересчитывать их заново на сервере — значит завести вторую версию
     * тех же цифр. Шапку (организацию, период, дату) добавляет сервер.
     */
    const handleExport = async () => {
        if (reportType === 'summary') {
            toast.info('Сводка не выгружается — выберите отчёт с таблицей');
            return;
        }
        if (currentRows.length === 0) {
            toast.warning('За выбранный период нет данных для выгрузки');
            return;
        }

        setExporting(true);
        try {
            const columns = EXPORT_COLUMNS[reportType];
            const totals = columns.reduce<Record<string, number>>((acc, column) => {
                if (!column.numeric || column.key === 'pct') return acc;
                acc[column.key] = currentRows.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0);
                return acc;
            }, {});

            const res = await api.post('/reports/export', {
                title: REPORT_TITLES[reportType],
                periodFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
                periodTo: dateRange?.[1]?.format('YYYY-MM-DD'),
                columns,
                rows: currentRows,
                totals,
            }, { responseType: 'blob' });

            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${REPORT_TITLES[reportType]}_${dayjs().format('YYYY-MM-DD')}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
            toast.success('Отчёт выгружен');
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось выгрузить отчёт');
        } finally {
            setExporting(false);
        }
    };

    if (loading && orders.length === 0 && payments.length === 0) {
        return (
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                    <Loader size="large" tip="Загрузка данных..." />
                </div>
            </div>
        );
    }

    const profitability = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

    return (
        <div className={`${styles.page} ${styles.pageWide}`}>
            {error && (
                <Alert
                    type="warning"
                    message="Часть данных не загружена"
                    description={error}
                    action={<Button size="small" icon={<ReloadOutlined />} onClick={fetchAll}>Повторить</Button>}
                    style={{ marginBottom: 16 }}
                    closable
                />
            )}

            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Отчёты · Итоги</div>
                    <h1 className={styles.title}>Отчёты компании</h1>
                    <p className={styles.subtitle}>
                        Сколько заработали, кто кому должен и куда ушли деньги — за любой период.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <RangePicker
                        value={dateRange as any}
                        onChange={(d) => { setDateRange(d as any); setActivePreset(null); }}
                        format="DD.MM.YYYY"
                        allowClear={false}
                    />
                    <button type="button" className={styles.action} disabled={loading} onClick={fetchAll}>
                        <RefreshCw size={15} />
                        Обновить
                    </button>
                    <button type="button" className={styles.action} onClick={() => window.print()}>
                        <Printer size={15} />
                        Печать
                    </button>
                    <button
                        type="button"
                        className={`${styles.action} ${styles.actionPrimary}`}
                        disabled={exporting || reportType === 'summary'}
                        onClick={handleExport}
                    >
                        <FileSpreadsheet size={15} />
                        Выгрузить в Excel
                    </button>
                </div>
            </div>

            {/* Приход зелёным, расход красным — единственное место, где цвет
                разрешён поверх чёрно-белой темы. */}
            <div className={styles.tiles}>
                <div className={styles.tile}>
                    <div className={styles.tileHead}><span className={styles.tileLabel}>Доходы</span></div>
                    <div className={`${styles.tileValue} ${styles.valuePos}`}>{fmt(totalIncome)} ₸</div>
                    <div className={styles.tileSub}>за период</div>
                </div>
                <div className={styles.tile}>
                    <div className={styles.tileHead}><span className={styles.tileLabel}>Расходы</span></div>
                    <div className={`${styles.tileValue} ${styles.valueNeg}`}>{fmt(totalExpense)} ₸</div>
                    <div className={styles.tileSub}>за период</div>
                </div>
                <div className={styles.tile}>
                    <div className={styles.tileHead}>
                        <span className={styles.tileLabel}>Маржа</span>
                        <span className={`${styles.chip} ${totalIncome >= totalExpense ? '' : styles.chipNeg}`}>
                            {profitability}%
                        </span>
                    </div>
                    <div className={`${styles.tileValue} ${totalIncome >= totalExpense ? styles.valuePos : styles.valueNeg}`}>
                        {totalIncome >= totalExpense ? '+' : ''}{fmt(totalIncome - totalExpense)} ₸
                    </div>
                    <div className={styles.tileSub}>рентабельность за период</div>
                </div>
                <div className={styles.tile}>
                    <div className={styles.tileHead}><span className={styles.tileLabel}>Контрагенты</span></div>
                    <div className={styles.tileValue}>{uniqueCounterparties}</div>
                    <div className={styles.tileSub}>активных за период</div>
                </div>
            </div>

            {/* Слева — сводки в один клик, справа — отчёты бухгалтерии.
                Раньше вторые жили в «Финансах», и половина аналитики
                оказывалась в разделе ежедневной работы. */}
            <div className={styles.duo} style={{ marginBottom: 14 }}>
                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <Zap size={15} />
                        <h2 className={styles.cardTitle}>Готовые сводки</h2>
                        <span className={styles.cardCount}>{PRESETS.length}</span>
                    </div>
                    <div className={styles.list}>
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.key}
                                type="button"
                                className={styles.item}
                                onClick={() => applyPreset(preset)}
                            >
                                <span className={styles.itemIcon}>
                                    {activePreset === preset.key ? <CircleDot size={16} /> : <Circle size={16} />}
                                </span>
                                <span className={styles.itemText}>
                                    <span className={styles.itemLabel}>{preset.title}</span>
                                    <span className={styles.itemDesc}>{preset.hint}</span>
                                </span>
                                <ChevronRight size={14} className={styles.chevron} />
                            </button>
                        ))}
                    </div>
                </section>

                <section className={styles.card}>
                    <div className={styles.cardHead}>
                        <ChartColumn size={15} />
                        <h2 className={styles.cardTitle}>Отчёты бухгалтерии</h2>
                        <span className={styles.cardCount}>{MORE_REPORTS.length}</span>
                    </div>
                    <div className={styles.list}>
                        {MORE_REPORTS.map((item) => (
                            <button
                                key={item.href}
                                type="button"
                                className={styles.item}
                                onClick={() => router.push(item.href)}
                            >
                                <span className={styles.itemIcon}><item.icon size={16} /></span>
                                <span className={styles.itemText}>
                                    <span className={styles.itemLabel}>{item.title}</span>
                                    <span className={styles.itemDesc}>{item.hint}</span>
                                </span>
                                <ChevronRight size={14} className={styles.chevron} />
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            <div className={styles.card}>
                <div className={styles.cardHead}>
                    <div className={styles.pills}>
                        {TAB_LABELS.map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                className={`${styles.pill} ${reportType === key ? styles.pillActive : ''}`}
                                onClick={() => { setReportType(key); setActivePreset(null); }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={styles.cardBody}>

                {reportType === 'pnl' && (
                    <Table 
                        columns={[
                            { title: 'Период', dataIndex: 'month', key: 'month', render: (v: string) => <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span> },
                            { title: 'Доходы', dataIndex: 'income', key: 'inc', align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Расходы', dataIndex: 'expense', key: 'exp', align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Маржа', dataIndex: 'margin', key: 'margin', align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{v >= 0 ? '+' : ''}{fmt(v)} ₸</span> },
                        ]} 
                        dataSource={pnlData} 
                        size="small" 
                        pagination={{ pageSize: 50 }} 
                    />
                )}

                {reportType === 'counterparties' && (
                    <Table 
                        columns={[
                            { title: 'Контрагент', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span> },
                            { title: 'Поступления', dataIndex: 'income', key: 'inc', align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>+{fmt(v)} ₸</span> },
                            { title: 'Выплаты', dataIndex: 'expense', key: 'exp', align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13 }}>-{fmt(v)} ₸</span> },
                            { title: 'Сальдо', dataIndex: 'balance', key: 'bal', align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{v >= 0 ? '+' : ''}{fmt(v)} ₸</span> },
                        ]} 
                        dataSource={cpData} 
                        size="small" 
                        pagination={{ pageSize: 50 }} 
                    />
                )}

                {reportType === 'profitability' && (
                    <Table 
                        columns={[
                            { title: 'Заявка', dataIndex: 'orderNumber', key: 'num', render: (v: string) => <span style={{ fontWeight: 700, color: '#1677ff', fontSize: 13 }}>{v}</span> },
                            { title: 'Маршрут', dataIndex: 'route', key: 'route', ellipsis: true, render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span> },
                            { title: 'Ставка', dataIndex: 'revenue', key: 'rev', align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Затраты', dataIndex: 'cost', key: 'cost', align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Маржа', dataIndex: 'margin', key: 'margin', align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{v >= 0 ? '+' : ''}{fmt(v)} ₸</span> },
                            { title: '%', dataIndex: 'pct', key: 'pct', width: 70, align: 'center' as const, render: (v: number) => <Tag color={v >= 0 ? 'green' : 'red'} style={{ fontSize: 11 }}>{v}%</Tag> },
                        ]} 
                        dataSource={profitData} 
                        size="small" 
                        pagination={{ pageSize: 50 }} 
                    />
                )}

                {reportType === 'drivers' && (
                    <Table 
                        columns={[
                            { title: 'Водитель', dataIndex: 'name', key: 'name', render: (v: string) => <span style={{ fontSize: 13, fontWeight: 500 }}>{v}</span> },
                            { title: 'ТС', dataIndex: 'vehicle', key: 'vehicle', render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span> },
                            { title: 'Рейсов', dataIndex: 'orders', key: 'orders', align: 'center' as const, render: (v: number) => <span style={{ fontSize: 13 }}>{v}</span> },
                            { title: 'Завершено', dataIndex: 'completed', key: 'completed', align: 'center' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{v}</span> },
                            { title: 'Выручка', dataIndex: 'revenue', key: 'rev', align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Маржа', dataIndex: 'margin', key: 'margin', align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{v >= 0 ? '+' : ''}{fmt(v)} ₸</span> },
                        ]} 
                        dataSource={driverData} 
                        size="small" 
                        pagination={{ pageSize: 50 }} 
                    />
                )}

                {reportType === 'summary' && (
                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={8}>
                            <div className="lc-card" style={{ padding: 20 }}>
                                <h4 style={{ fontWeight: 600, fontSize: 14, margin: '0 0 12px' }}>Заявки</h4>
                                <Row gutter={[8, 8]}>
                                    <Col span={12}><Statistic title="Всего" value={filteredOrders.length} valueStyle={{ fontSize: 16 }} /></Col>
                                    <Col span={12}><Statistic title="Завершено" value={filteredOrders.filter(o => o.status === 'COMPLETED').length} valueStyle={{ color: '#52c41a', fontSize: 16 }} /></Col>
                                    <Col span={12}><Statistic title="В работе" value={filteredOrders.filter(o => ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'].includes(o.status)).length} valueStyle={{ color: '#1677ff', fontSize: 16 }} /></Col>
                                    <Col span={12}><Statistic title="Отменено" value={filteredOrders.filter(o => o.status === 'CANCELLED').length} valueStyle={{ color: '#ff4d4f', fontSize: 16 }} /></Col>
                                </Row>
                            </div>
                        </Col>
                        <Col xs={24} md={8}>
                            <div className="lc-card" style={{ padding: 20 }}>
                                <h4 style={{ fontWeight: 600, fontSize: 14, margin: '0 0 12px' }}>Финансы</h4>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ color: 'var(--lc-text-ter)', fontSize: 13 }}>Выручка</span><span style={{ fontWeight: 600, color: '#52c41a', fontSize: 13 }}>{fmt(totalIncome)} ₸</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ color: 'var(--lc-text-ter)', fontSize: 13 }}>Затраты</span><span style={{ fontWeight: 600, color: '#ff4d4f', fontSize: 13 }}>{fmt(totalExpense)} ₸</span></div>
                                <Divider style={{ margin: '12px 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>Маржа</span>
                                    <span style={{ fontWeight: 600, color: totalIncome >= totalExpense ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{totalIncome >= totalExpense ? '+' : ''}{fmt(totalIncome - totalExpense)} ₸</span>
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} md={8}>
                            <div className="lc-card" style={{ padding: 20 }}>
                                <h4 style={{ fontWeight: 600, fontSize: 14, margin: '0 0 12px' }}>Автопарк</h4>
                                <Statistic title="Всего водителей" value={drivers.length} valueStyle={{ fontSize: 16 }} />
                                <div style={{ marginTop: 12 }}>
                                    <Statistic title="Контрагентов" value={uniqueCounterparties} valueStyle={{ fontSize: 16 }} />
                                </div>
                            </div>
                        </Col>
                    </Row>
                )}
                </div>
            </div>
        </div>
    );
}
