'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChartArea, ChartBar, ChartColumn, ChartLine, ChartPie, type LucideIcon } from 'lucide-react';
import { PALETTE, type ColorKey } from './charts';
import type { WidgetId } from './layout';

/**
 * Настройки блоков дашборда (владелец, 08.10.2026): вид графика, цвета,
 * что показывать. Открываются из «…» → «Настройки» или кнопкой в окне
 * «Открыть крупно». Только там, где они что-то меняют по делу: у блоков,
 * пришедших из прежних разделов, настроек нет.
 *
 * Своё название блоку сознательно не даётся (владелец, 08.10): оно было бы
 * только в одном браузере, и один блок у разных людей звался бы по-разному.
 *
 * Хранятся в браузере отдельно от расстановки: «Как было» в «Блоках»
 * возвращает места блоков, а выбранные цвета и виды графиков не трогает.
 */

export type SparkKind = 'line' | 'bars';
interface KpiSettings { color: ColorKey; spark: SparkKind }

export interface BlockSettingsMap {
    chart: { kind: 'bars' | 'lines' | 'areas'; series: ('revenue' | 'margin')[]; revenueColor: ColorKey; marginColor: ColorKey; weeks: '4' | '8' | '12'; values: boolean };
    byStatus: { kind: 'hbars' | 'vbars' | 'donut'; color: ColorKey | 'status'; completed: boolean };
    calendar: { only: 'all' | 'pending'; color: ColorKey };
    upcoming: { only: 'all' | 'pending'; columns: ('date' | 'status' | 'price')[]; limit: '5' | '10' | 'all' };
    attention: { kinds: ('problems' | 'overdueIn' | 'overdueOut' | 'pendingSoon' | 'noTtn')[] };
    inTransit: { columns: ('driver' | 'progress' | 'status')[]; color: ColorKey };
    debtors: { only: 'all' | 'overdue'; noInvoice: boolean };
    drivers: { lists: ('free' | 'trip')[]; plate: boolean };
    activity: { rows: ('activeCustomers' | 'activeCarriers' | 'created' | 'completed' | 'revenue' | 'cost' | 'margin')[]; amounts: 'auto' | 'full' | 'short' };
    events: { limit: '8' | '12' | '20' };
    inWork: KpiSettings;
    pending: KpiSettings;
    problems: KpiSettings;
    ordersMonth: KpiSettings & { compare: boolean };
    revenue: KpiSettings;
    tariff: { color: ColorKey };
}
export type SettingsId = keyof BlockSettingsMap;

/** Как было в макете — с этого блок начинает и к этому возвращает «Сбросить». */
export const DEFAULTS: { [K in SettingsId]: BlockSettingsMap[K] } = {
    chart: { kind: 'bars', series: ['revenue', 'margin'], revenueColor: 'graphite', marginColor: 'silver', weeks: '12', values: false },
    byStatus: { kind: 'hbars', color: 'graphite', completed: true },
    calendar: { only: 'all', color: 'graphite' },
    upcoming: { only: 'all', columns: ['date', 'status', 'price'], limit: 'all' },
    attention: { kinds: ['problems', 'overdueIn', 'overdueOut', 'pendingSoon', 'noTtn'] },
    inTransit: { columns: ['driver', 'progress', 'status'], color: 'graphite' },
    debtors: { only: 'all', noInvoice: true },
    drivers: { lists: ['free', 'trip'], plate: true },
    activity: { rows: ['activeCustomers', 'activeCarriers', 'created', 'completed', 'revenue', 'cost', 'margin'], amounts: 'auto' },
    events: { limit: '12' },
    inWork: { color: 'sky', spark: 'line' },
    pending: { color: 'amber', spark: 'bars' },
    problems: { color: 'red', spark: 'bars' },
    ordersMonth: { color: 'violet', spark: 'line', compare: true },
    revenue: { color: 'emerald', spark: 'line' },
    tariff: { color: 'sky' },
};

// ==================== Что настраивается — описание для окна настроек ====================

export interface Opt { value: string; label: string; icon?: LucideIcon }
type When = (s: Record<string, unknown>) => boolean;
export type Field =
    | { key: string; kind: 'segment'; label: string; options: Opt[]; when?: When }
    | { key: string; kind: 'color'; label: string; byStatus?: boolean; when?: When }
    | { key: string; kind: 'checks'; label: string; options: Opt[]; min: number; when?: When }
    | { key: string; kind: 'toggle'; label: string; hint?: string; when?: When };

const has = (key: string, v: string): When => (s) => Array.isArray(s[key]) && (s[key] as string[]).includes(v);

const KPI_FIELDS: Field[] = [
    { key: 'spark', kind: 'segment', label: 'Мини-график', options: [{ value: 'line', label: 'Линия', icon: ChartLine }, { value: 'bars', label: 'Столбики', icon: ChartColumn }] },
    { key: 'color', kind: 'color', label: 'Цвет графика' },
];

export const FIELDS: { [K in SettingsId]: Field[] } = {
    chart: [
        {
            key: 'kind', kind: 'segment', label: 'Вид графика', options: [
                { value: 'bars', label: 'Столбцы', icon: ChartColumn },
                { value: 'lines', label: 'Линии', icon: ChartLine },
                { value: 'areas', label: 'Области', icon: ChartArea },
            ],
        },
        { key: 'series', kind: 'checks', label: 'Что показывать', min: 1, options: [{ value: 'revenue', label: 'Выручка' }, { value: 'margin', label: 'Маржа' }] },
        { key: 'revenueColor', kind: 'color', label: 'Цвет выручки', when: has('series', 'revenue') },
        { key: 'marginColor', kind: 'color', label: 'Цвет маржи', when: has('series', 'margin') },
        { key: 'weeks', kind: 'segment', label: 'Сколько недель', options: [{ value: '4', label: '4' }, { value: '8', label: '8' }, { value: '12', label: '12' }] },
        { key: 'values', kind: 'toggle', label: 'Суммы на графике', hint: 'Над каждым столбцом или точкой, в миллионах' },
    ],
    byStatus: [
        {
            key: 'kind', kind: 'segment', label: 'Вид графика', options: [
                { value: 'hbars', label: 'Полосы', icon: ChartBar },
                { value: 'vbars', label: 'Столбцы', icon: ChartColumn },
                { value: 'donut', label: 'Кольцо', icon: ChartPie },
            ],
        },
        { key: 'color', kind: 'color', label: 'Цвет', byStatus: true },
        { key: 'completed', kind: 'toggle', label: 'Завершённые за месяц', hint: 'Сколько рейсов закрыто с начала месяца' },
    ],
    calendar: [
        { key: 'only', kind: 'segment', label: 'Что отмечать', options: [{ value: 'all', label: 'Все погрузки' }, { value: 'pending', label: 'Без исполнителя' }] },
        { key: 'color', kind: 'color', label: 'Цвет отметок' },
    ],
    upcoming: [
        { key: 'only', kind: 'segment', label: 'Какие заявки', options: [{ value: 'all', label: 'Все' }, { value: 'pending', label: 'Без исполнителя' }] },
        { key: 'columns', kind: 'checks', label: 'Колонки', min: 0, options: [{ value: 'date', label: 'Погрузка' }, { value: 'status', label: 'Статус' }, { value: 'price', label: 'Ставка' }] },
        { key: 'limit', kind: 'segment', label: 'Сколько строк', options: [{ value: '5', label: '5' }, { value: '10', label: '10' }, { value: 'all', label: 'Все' }] },
    ],
    attention: [
        {
            key: 'kinds', kind: 'checks', label: 'Что показывать', min: 1, options: [
                { value: 'problems', label: 'Проблемы в пути' },
                { value: 'overdueIn', label: 'Заказчики просрочили оплату' },
                { value: 'overdueOut', label: 'Мы просрочили оплату' },
                { value: 'pendingSoon', label: 'Заявки без исполнителя' },
                { value: 'noTtn', label: 'Рейсы без ТТН' },
            ],
        },
    ],
    inTransit: [
        { key: 'columns', kind: 'checks', label: 'Что показывать', min: 0, options: [{ value: 'driver', label: 'Водитель и машина' }, { value: 'progress', label: 'Ход рейса' }, { value: 'status', label: 'Статус' }] },
        { key: 'color', kind: 'color', label: 'Цвет хода рейса', when: has('columns', 'progress') },
    ],
    debtors: [
        { key: 'only', kind: 'segment', label: 'Кого показывать', options: [{ value: 'all', label: 'Всех' }, { value: 'overdue', label: 'С просрочкой' }] },
        { key: 'noInvoice', kind: 'toggle', label: 'Сделки без счёта', hint: 'Строка внизу: сколько денег ещё не выставлено' },
    ],
    drivers: [
        { key: 'lists', kind: 'checks', label: 'Списки', min: 0, options: [{ value: 'free', label: 'Свободны сейчас' }, { value: 'trip', label: 'В рейсе' }] },
        { key: 'plate', kind: 'toggle', label: 'Номер машины' },
    ],
    activity: [
        {
            key: 'rows', kind: 'checks', label: 'Строки', min: 1, options: [
                { value: 'activeCustomers', label: 'Активные заказчики' },
                { value: 'activeCarriers', label: 'Активные перевозчики' },
                { value: 'created', label: 'Создано заявок' },
                { value: 'completed', label: 'Завершено заявок' },
                { value: 'revenue', label: 'Выручка с заявок' },
                { value: 'cost', label: 'Затраты на перевозчиков' },
                { value: 'margin', label: 'Маржа с заявок' },
            ],
        },
        { key: 'amounts', kind: 'segment', label: 'Суммы', options: [{ value: 'auto', label: 'Как влезет' }, { value: 'full', label: 'Полностью' }, { value: 'short', label: 'Кратко' }] },
    ],
    events: [
        { key: 'limit', kind: 'segment', label: 'Сколько событий', options: [{ value: '8', label: '8' }, { value: '12', label: '12' }, { value: '20', label: '20' }] },
    ],
    inWork: KPI_FIELDS,
    pending: KPI_FIELDS,
    problems: KPI_FIELDS,
    ordersMonth: [
        ...KPI_FIELDS,
        { key: 'compare', kind: 'toggle', label: 'Прошлый период пунктиром', hint: 'Видно, обгоняете ли прошлый месяц', when: (s) => s.spark === 'line' },
    ],
    revenue: KPI_FIELDS,
    tariff: [{ key: 'color', kind: 'color', label: 'Цвет шкалы дней' }],
};

export const hasSettings = (id: WidgetId): id is SettingsId => id in DEFAULTS;

/**
 * Сохранённое — только то, что сейчас допустимо: значение из списка, цвет
 * из палитры. Иначе — как по умолчанию. Так старая запись в браузере не
 * сломает блок, когда список вариантов поменяется.
 */
export function settingsFor<K extends SettingsId>(id: K, raw: Record<string, unknown> | undefined): BlockSettingsMap[K] {
    const out: Record<string, unknown> = { ...DEFAULTS[id] };
    if (!raw) return out as BlockSettingsMap[K];
    const colors: string[] = PALETTE.map((p) => p.key);
    for (const f of FIELDS[id]) {
        const v = raw[f.key];
        if (f.kind === 'segment' && typeof v === 'string' && f.options.some((o) => o.value === v)) out[f.key] = v;
        else if (f.kind === 'color' && typeof v === 'string' && (colors.includes(v) || (f.byStatus && v === 'status'))) out[f.key] = v;
        else if (f.kind === 'toggle' && typeof v === 'boolean') out[f.key] = v;
        else if (f.kind === 'checks' && Array.isArray(v)) {
            const ok = f.options.map((o) => o.value).filter((x) => v.includes(x));
            if (ok.length >= f.min) out[f.key] = ok;
        }
    }
    return out as BlockSettingsMap[K];
}

// ==================== Хранилище ====================

export type Stored = Partial<Record<WidgetId, Record<string, unknown>>>;

const STORAGE_KEY = 'lc_dashboard_blocks_v1';

interface Store {
    all: Stored;
    set: (id: WidgetId, patch: Record<string, unknown>) => void;
    replace: (id: WidgetId, value: Record<string, unknown> | undefined) => void;
}

const SettingsCtx = createContext<Store>({ all: {}, set: () => undefined, replace: () => undefined });

export function BlockSettingsProvider({ children }: { children: React.ReactNode }) {
    const [all, setAll] = useState<Stored>({});
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) setAll(raw);
        } catch { /* испорченная запись — начинаем с чистого */ }
        setLoaded(true);
    }, []);
    useEffect(() => {
        if (!loaded) return;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* приватное окно — не запомнится */ }
    }, [all, loaded]);
    const set = useCallback((id: WidgetId, patch: Record<string, unknown>) => setAll((a) => ({ ...a, [id]: { ...a[id], ...patch } })), []);
    const replace = useCallback((id: WidgetId, value: Record<string, unknown> | undefined) => setAll((a) => {
        const next = { ...a };
        if (value && Object.keys(value).length) next[id] = value; else delete next[id];
        return next;
    }), []);
    const value = useMemo(() => ({ all, set, replace }), [all, set, replace]);
    return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export const useSettingsStore = () => useContext(SettingsCtx);

/** Настройки блока — с подставленными по умолчанию и проверенные. */
export function useBlockSettings<K extends SettingsId>(id: K): BlockSettingsMap[K] {
    const { all } = useContext(SettingsCtx);
    const raw = all[id];
    return useMemo(() => settingsFor(id, raw), [id, raw]);
}

// ==================== Блок открыт крупно ====================

/** Блок показан в окне «Открыть крупно»: можно показать подробности. */
export const BlockViewContext = createContext<{ expanded: boolean }>({ expanded: false });
export const useExpanded = () => useContext(BlockViewContext).expanded;

/** Открыть блок крупно — сразу с настройками или без. */
export type BlockDialogMode = 'view' | 'settings';
export const OpenBlockContext = createContext<(id: WidgetId, mode: BlockDialogMode) => void>(() => undefined);
export const useOpenBlock = () => useContext(OpenBlockContext);
