'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Раскладка дашборда-конструктора.
 *
 * Основа — макет «LogiCore на shadcn Nova» (владелец, 07.10.2026), но ряды
 * не жёсткие, а «перетекают», как слова в тексте (просьба владельца от
 * 08.10.2026): блоки стоят по порядку, и ряд заканчивается там, где
 * следующий блок уже не влезает.
 *
 * - сузил блок за правый край — освободилось место, и первый блок ряда
 *   ниже поднимается в этот ряд (а за ним по цепочке подтягиваются и
 *   следующие);
 * - расширил — последний блок ряда, которому больше нет места, уходит в
 *   начало ряда ниже.
 *
 * Ширина — в колонках невидимой сетки на всю ширину поля (`COLS`). Сетка
 * общая для всех рядов, поэтому края блоков в разных рядах совпадают, а на
 * экране поуже всё сжимается пропорционально. Меньше своего минимума
 * (плашка 190, блок 250 точек) блок не сужается — на узком экране он просто
 * переносится раньше.
 *
 * Расстановка запоминается в этом браузере. На сервер она не уходит: это
 * личное удобство, а не доступ — что человеку вообще открыто, решает
 * руководитель в «Сотрудниках» (`lib/dashboard-blocks.ts`).
 */

/** Показатели — узкие плашки с числом. */
export const KPI_IDS = ['inWork', 'pending', 'problems', 'ordersMonth', 'revenue', 'receivables', 'payroll', 'tariff'] as const;
/** Блоки — карточки с содержимым. */
export const BLOCK_IDS = [
    'chart',
    'calendar',
    'paymentCalendar',
    'activity',
    'earnings',
    'pendingWork',
    'upcoming',
    'attention',
    'inTransit',
    'debtors',
    'drivers',
    'byStatus',
    'incomingInvoices',
    'paymentProofs',
    'events',
] as const;

export type KpiId = (typeof KPI_IDS)[number];
export type BlockId = (typeof BLOCK_IDS)[number];
export type WidgetId = KpiId | BlockId;

export const isKpi = (id: string): id is KpiId => (KPI_IDS as readonly string[]).includes(id);

/** Колонок в сетке. 60 делится на 2, 3, 4, 5, 6 и 12 — любые ровные доли. */
export const COLS = 60;
/** Минимальная ширина: плашка и блок уже этого не читаются. */
export const MIN_WIDTH = { tile: 190, block: 250 } as const;
/** Отступы по бокам каждого места в ряду (по 12 с каждой стороны). */
export const SLOT_PAD = 12;
/** Ширина свёрнутого блока — полоска с названием. */
export const COLLAPSED_W = 64;
/** Предельная высота ряда. */
export const MAX_ROW_H = 1600;
/** Высота ряда из одних показателей. */
export const KPI_ROW_H = 44;

export interface Row {
    /** Ключ ряда — по первому блоку: ряды не хранятся, а складываются заново. */
    id: string;
    items: WidgetId[];
    /** Сколько колонок занимает каждый (уже с учётом минимума и свёртки). */
    spans: number[];
    h: number;
}

export interface BoardState {
    /** Порядок блоков — по нему они и разливаются по рядам. */
    order: WidgetId[];
    /** Ширина в колонках. */
    w: Partial<Record<WidgetId, number>>;
    /** Высота. Высота ряда — по самому высокому в нём. */
    h: Partial<Record<WidgetId, number>>;
    collapsed: WidgetId[];
}

/** Куда поставить блок. «Своим рядом» — значит во всю ширину: ряд он займёт сам. */
export type Placement =
    | { kind: 'top' }
    | { kind: 'bottom' }
    | { kind: 'index'; index: number }
    | { kind: 'rowAbove' | 'rowBelow'; anchor: WidgetId }
    | { kind: 'before' | 'after'; anchor: WidgetId }
    | { kind: 'row'; anchor: WidgetId };

/** Расстановка по умолчанию — как в макете: показатели, графики, погрузки, деньги. */
export const DEFAULT_STATE: BoardState = {
    order: [
        'inWork', 'pending', 'problems', 'ordersMonth', 'revenue',
        'chart', 'calendar',
        'upcoming', 'attention',
        'activity', 'earnings', 'paymentCalendar', 'pendingWork',
    ],
    w: {
        inWork: 12, pending: 12, problems: 12, ordersMonth: 12, revenue: 12,
        chart: 42, calendar: 18,
        upcoming: 36, attention: 24,
        activity: 18, earnings: 14, paymentCalendar: 14, pendingWork: 14,
    },
    h: { chart: 400, calendar: 400, upcoming: 380, attention: 380, activity: 440, earnings: 440, paymentCalendar: 440, pendingWork: 440 },
    collapsed: [],
};

/** Ширина и высота нового блока, пока его не трогали. */
const defaultW = (id: WidgetId) => (isKpi(id) ? 12 : 30);
const defaultH = (id: WidgetId) => (isKpi(id) ? KPI_ROW_H : 380);

const STORAGE_KEY = 'lc_dashboard_layout_v2';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/** Наименьшая высота ряда: из одних показателей — плашка, иначе блок. */
export const minRowH = (items: WidgetId[]) => (items.every(isKpi) ? KPI_ROW_H : 240);

/** Сколько колонок нужно, чтобы вместить `px` точек вместе с отступами. */
const spanFor = (px: number, field: number) => Math.min(COLS, Math.ceil(((px + 2 * SLOT_PAD) / Math.max(field, 1)) * COLS));
export const minSpan = (id: WidgetId, field: number) => spanFor(isKpi(id) ? MIN_WIDTH.tile : MIN_WIDTH.block, field);
const collapsedSpan = (field: number) => spanFor(COLLAPSED_W, field);

/** Ширина блока в колонках прямо сейчас: заданная, но не меньше минимума. */
function spanOf(s: BoardState, id: WidgetId, field: number): number {
    if (!isKpi(id) && s.collapsed.includes(id)) return collapsedSpan(field);
    return clamp(s.w[id] ?? defaultW(id), minSpan(id, field), COLS);
}

/** Разлить блоки по рядам: ряд кончается там, где следующий уже не влезает. */
export function flow(s: BoardState, ids: WidgetId[], field: number): Row[] {
    const rows: Row[] = [];
    let items: WidgetId[] = [];
    let spans: number[] = [];
    let used = 0;
    const close = () => {
        if (!items.length) return;
        const open = items.filter((id) => isKpi(id) || !s.collapsed.includes(id));
        const h = open.length
            ? Math.max(...open.map((id) => (open.some((x) => !isKpi(x)) && isKpi(id) ? 0 : s.h[id] ?? defaultH(id))))
            : 200; // ряд из одних свёрнутых полосок — по высоте названия
        rows.push({ id: `${items[0]}-${rows.length}`, items, spans, h: clamp(h, minRowH(items), MAX_ROW_H) });
        items = []; spans = []; used = 0;
    };
    for (const id of ids) {
        const span = spanOf(s, id, field);
        if (items.length && used + span > COLS) close();
        items.push(id);
        spans.push(span);
        used += span;
    }
    close();
    return rows;
}

/** Поставить блок в порядок. Ряды тут же сложатся заново. */
function place(s: BoardState, rows: Row[], id: WidgetId, p: Placement): BoardState {
    const order = s.order.filter((x) => x !== id);
    const w = { ...s.w };
    const rowOf = (anchor: WidgetId) => rows.find((r) => r.items.includes(anchor));
    const at = (index: number) => [...order.slice(0, index), id, ...order.slice(index)];
    const before = (anchor: WidgetId | undefined) => (anchor ? order.indexOf(anchor) : order.length);
    const after = (anchor: WidgetId | undefined) => (anchor ? order.indexOf(anchor) + 1 : order.length);
    let next: WidgetId[];
    switch (p.kind) {
        case 'top': {
            // «Сверху, под показателями»: если первый ряд — одни показатели, то после него.
            const first = rows[0];
            const kpiRow = first && first.items.every(isKpi) && first.items.some((x) => x !== id);
            next = kpiRow ? at(after(first.items.filter((x) => x !== id).slice(-1)[0])) : at(0);
            w[id] = COLS;
            break;
        }
        case 'bottom':
            next = at(order.length);
            w[id] = COLS;
            break;
        case 'index': {
            const row = rows[p.index];
            next = at(row ? before(row.items.find((x) => x !== id)) : order.length);
            w[id] = COLS;
            break;
        }
        case 'rowAbove':
        case 'rowBelow': {
            const row = rowOf(p.anchor);
            const rest = row?.items.filter((x) => x !== id) ?? [];
            next = at(p.kind === 'rowAbove' ? before(rest[0]) : after(rest[rest.length - 1]));
            w[id] = COLS;
            break;
        }
        case 'before':
        case 'after':
            next = at(p.kind === 'before' ? before(p.anchor) : after(p.anchor));
            break;
        case 'row': {
            const rest = rowOf(p.anchor)?.items.filter((x) => x !== id) ?? [];
            next = at(after(rest[rest.length - 1]));
            break;
        }
    }
    return { ...s, order: next, w };
}

/** Сохранённая расстановка — только если она целая; иначе как было. */
function parse(raw: unknown): BoardState | null {
    const st = raw as BoardState;
    if (!st || !Array.isArray(st.order) || !Array.isArray(st.collapsed) || typeof st.w !== 'object' || typeof st.h !== 'object') return null;
    const all = [...BLOCK_IDS, ...KPI_IDS] as string[];
    if (st.order.some((id) => !all.includes(id)) || new Set(st.order).size !== st.order.length) return null;
    return {
        order: st.order,
        w: st.w ?? {},
        h: st.h ?? {},
        collapsed: st.collapsed.filter((id) => st.order.includes(id) && !isKpi(id)),
    };
}

function load(): BoardState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return (raw && parse(JSON.parse(raw))) || DEFAULT_STATE;
    } catch {
        return DEFAULT_STATE;
    }
}

/**
 * Состояние дашборда и действия над ним.
 *
 * `allowed` — что человеку вообще открыто. Закрытое в ряды не попадает,
 * даже если когда-то было сохранено в этом браузере: руководитель снял
 * галочку — блок исчез, и вернуть его кнопкой «Блоки» нельзя.
 */
export function useBoardLayout(allowed: Set<WidgetId>) {
    const [state, setState] = useState<BoardState>(DEFAULT_STATE);
    const [loaded, setLoaded] = useState(false);
    // Ширина поля — от неё зависят минимумы в колонках и то, где ряд кончится.
    const [field, setField] = useState(1680);

    // Из браузера — только после первой отрисовки: на сервере хранилища нет.
    useEffect(() => {
        setState(load());
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (!loaded) return;
        // С задержкой: пока тянут ширину или высоту, состояние меняется на
        // каждое движение мыши, и писать его каждый раз незачем.
        const t = window.setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch { /* приватное окно — расстановка не запомнится, и только */ }
        }, 300);
        return () => window.clearTimeout(t);
    }, [state, loaded]);

    const ids = useMemo(() => state.order.filter((id) => allowed.has(id)), [state.order, allowed]);
    const rows = useMemo(() => flow(state, ids, field), [state, ids, field]);
    const layout = rows.map((r) => r.items);
    const visible = ids;

    /** Влезет ли блок `id` в конец ряда `row`. */
    const fits = (row: WidgetId[], id: WidgetId) =>
        row.filter((x) => x !== id).reduce((sum, x) => sum + spanOf(state, x, field), 0) + spanOf(state, id, field) <= COLS;

    return {
        loaded,
        rows,
        layout,
        visible,
        field,
        setField: useCallback((w: number) => { if (w > 0) setField(w); }, []),
        fits,
        isVisible: (id: WidgetId) => visible.includes(id),
        isCollapsed: (id: WidgetId) => state.collapsed.includes(id),
        minSpan: (id: WidgetId) => minSpan(id, field),
        /** Новая ширина блока — ряды тут же сложатся заново. */
        setSpan: useCallback((id: WidgetId, span: number) => {
            setState((s) => (s.w[id] === span ? s : { ...s, w: { ...s.w, [id]: clamp(span, 1, COLS) } }));
        }, []),
        /** Поменять местами — вместе с размерами: места остаются те же. */
        swap: useCallback((a: WidgetId, b: WidgetId) => {
            if (a === b) return;
            setState((s) => ({
                ...s,
                order: s.order.map((x) => (x === a ? b : x === b ? a : x)),
                w: { ...s.w, [a]: s.w[b] ?? defaultW(b), [b]: s.w[a] ?? defaultW(a) },
                h: { ...s.h, [a]: s.h[b] ?? defaultH(b), [b]: s.h[a] ?? defaultH(a) },
            }));
        }, []),
        hide: useCallback((id: WidgetId) => {
            setState((s) => ({ ...s, order: s.order.filter((x) => x !== id), collapsed: s.collapsed.filter((x) => x !== id) }));
        }, []),
        show: useCallback((id: WidgetId, p: Placement = { kind: 'bottom' }) => {
            setState((s) => (s.order.includes(id) ? s : place(s, flow(s, s.order.filter((x) => allowed.has(x)), field), id, p)));
        }, [allowed, field]),
        move: useCallback((id: WidgetId, p: Placement) => {
            setState((s) => {
                if ('anchor' in p && p.anchor === id) return s;
                return place(s, flow(s, s.order.filter((x) => allowed.has(x)), field), id, p);
            });
        }, [allowed, field]),
        /** Высота ряда: задаётся блокам ряда (в смешанном ряду плашки тянутся сами). */
        setRowH: useCallback((items: WidgetId[], h: number) => {
            setState((s) => {
                const target = items.some((x) => !isKpi(x)) ? items.filter((x) => !isKpi(x)) : items;
                const v = clamp(h, minRowH(items), MAX_ROW_H);
                const next = { ...s.h };
                for (const x of target) next[x] = v;
                return { ...s, h: next };
            });
        }, []),
        setCollapsed: useCallback((id: WidgetId, on: boolean) => {
            setState((s) => (on === s.collapsed.includes(id) ? s : { ...s, collapsed: on ? [...s.collapsed, id] : s.collapsed.filter((x) => x !== id) }));
        }, []),
        toggleCollapsed: useCallback((id: WidgetId) => {
            setState((s) => ({ ...s, collapsed: s.collapsed.includes(id) ? s.collapsed.filter((x) => x !== id) : [...s.collapsed, id] }));
        }, []),
        reset: useCallback(() => setState(DEFAULT_STATE), []),
    };
}

export type BoardApi = ReturnType<typeof useBoardLayout>;
