'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Раскладка дашборда-конструктора.
 *
 * Основа — макет «LogiCore на shadcn Nova» (владелец, 07.10.2026). Блоки
 * стоят по порядку и разливаются по рядам; каждый ряд всегда во всю
 * ширину — без пустоты справа и «выступов».
 *
 * Как тянется ширина (владелец, 08.10.2026):
 *
 * - **граница между блоками в середине ряда** — меняет только двух соседей:
 *   один шире, другой уже. Никто между рядами не перескакивает;
 * - **правый край ряда** (край последнего блока) — тянешь влево: ужимаются
 *   все блоки ряда пропорционально, и как только в освободившееся место
 *   влезает блок из ряда ниже, он поднимается; тянешь обратно вправо —
 *   блоки ряда растут и выталкивают его обратно вниз. Отпустил — ряд
 *   заполняется до края.
 *
 * Ширина — в долях невидимой сетки на всю ширину поля (`COLS`). Меньше
 * своего минимума (плашка 190, блок 250 точек) блок не сужается.
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

/** Ширина ряда в условных колонках. Доли могут быть дробными. */
export const COLS = 120;
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

const EPS = 1e-6;

export interface Row {
    /** Ключ ряда — по первому блоку: ряды не хранятся, а складываются заново. */
    id: string;
    items: WidgetId[];
    /** Ширина каждого в колонках (уже с учётом минимума и свёртки). */
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
        inWork: 24, pending: 24, problems: 24, ordersMonth: 24, revenue: 24,
        chart: 84, calendar: 36,
        upcoming: 72, attention: 48,
        activity: 36, earnings: 28, paymentCalendar: 28, pendingWork: 28,
    },
    h: { chart: 400, calendar: 400, upcoming: 380, attention: 380, activity: 440, earnings: 440, paymentCalendar: 440, pendingWork: 440 },
    collapsed: [],
};

/** Ширина и высота нового блока, пока его не трогали. */
const defaultW = (id: WidgetId) => (isKpi(id) ? 24 : 60);
const defaultH = (id: WidgetId) => (isKpi(id) ? KPI_ROW_H : 380);

const STORAGE_KEY = 'lc_dashboard_layout_v5';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Наименьшая высота ряда: из одних показателей — плашка, иначе блок. */
export const minRowH = (items: WidgetId[]) => (items.every(isKpi) ? KPI_ROW_H : 240);

/** Сколько колонок нужно, чтобы вместить `px` точек вместе с отступами. */
const spanFor = (px: number, field: number) => Math.min(COLS, ((px + 2 * SLOT_PAD) / Math.max(field, 1)) * COLS);
export const minSpan = (id: WidgetId, field: number) => spanFor(isKpi(id) ? MIN_WIDTH.tile : MIN_WIDTH.block, field);
const collapsedSpan = (field: number) => spanFor(COLLAPSED_W, field);
const isStrip = (s: BoardState, id: WidgetId) => !isKpi(id) && s.collapsed.includes(id);

/** Ширина блока в колонках прямо сейчас: заданная, но не меньше минимума. */
function spanOf(s: BoardState, id: WidgetId, field: number): number {
    if (isStrip(s, id)) return collapsedSpan(field);
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
        const open = items.filter((id) => !isStrip(s, id));
        const mixed = open.some((x) => !isKpi(x));
        const h = open.length
            // В ряду с блоками плашки тянутся до их высоты сами.
            ? Math.max(...open.map((id) => (mixed && isKpi(id) ? 0 : s.h[id] ?? defaultH(id))))
            : 200; // ряд из одних свёрнутых полосок — по высоте названия
        rows.push({ id: `${items[0]}-${rows.length}`, items, spans, h: clamp(h, minRowH(items), MAX_ROW_H) });
        items = []; spans = []; used = 0;
    };
    for (const id of ids) {
        const span = spanOf(s, id, field);
        if (items.length && used + span > COLS + EPS) close();
        items.push(id);
        spans.push(span);
        used += span;
    }
    close();
    return rows;
}

/**
 * Ужать или растянуть набор блоков до общей ширины `total` — каждого
 * пропорционально, но не меньше его минимума. Свёрнутые полоски не
 * меняются.
 */
function scaleTo(s: BoardState, ids: WidgetId[], spans: number[], total: number, field: number): number[] {
    const out = [...spans];
    const fixed = ids.map((id) => isStrip(s, id));
    let free = ids.map((_, i) => !fixed[i]);
    for (let guard = 0; guard < ids.length + 1; guard++) {
        const fixedSum = out.reduce((a, v, i) => a + (free[i] ? 0 : v), 0);
        const freeSum = spans.reduce((a, v, i) => a + (free[i] ? v : 0), 0);
        if (freeSum <= EPS) break;
        const k = (total - fixedSum) / freeSum;
        let hit = false;
        for (let i = 0; i < ids.length; i++) {
            if (!free[i]) continue;
            const v = spans[i] * k;
            const min = minSpan(ids[i], field);
            if (v < min - EPS) { out[i] = min; free = free.map((f, j) => (j === i ? false : f)); hit = true; }
            else out[i] = v;
        }
        if (!hit) break;
    }
    return out;
}

/**
 * Каждый ряд — во всю ширину: недостающее делится между блоками ряда
 * пропорционально. Это только показ, в расстановку не записывается: иначе
 * на узком окне раскладка «запомнила» бы узкие ширины и осталась бы такой
 * и на широком. Ряд `live` — тот, чей край сейчас тянут: он идёт за мышкой.
 */
function fillRows(s: BoardState, rows: Row[], field: number, live: number | null): Row[] {
    return rows.map((row, i) => {
        if (i === live) return row;
        const sum = row.spans.reduce((a, b) => a + b, 0);
        return sum >= COLS - EPS ? row : { ...row, spans: scaleTo(s, row.items, row.spans, COLS, field) };
    });
}

/** Поставить блок в порядок. До края ряды дотягиваются при показе (`fillRows`). */
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

/** Снимок на начало растягивания: всё считается от него, поэтому движение обратимо. */
export interface ResizeStart {
    state: BoardState;
    rows: Row[];
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
    const [field, setFieldState] = useState(1680);
    const fieldRef = useRef(field);
    fieldRef.current = field;
    // Ряд, чей край тянут прямо сейчас.
    const [live, setLiveState] = useState<number | null>(null);
    const liveRef = useRef<number | null>(null);
    const setLive = (r: number | null) => { liveRef.current = r; setLiveState(r); };
    const allowedRef = useRef(allowed);
    allowedRef.current = allowed;
    const idsOf = (s: BoardState) => s.order.filter((x) => allowedRef.current.has(x));

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
    const rows = useMemo(() => fillRows(state, flow(state, ids, field), field, live), [state, ids, field, live]);
    const layout = rows.map((r) => r.items);
    const visible = ids;

    /** Влезет ли блок `id` в конец ряда `row`. */
    const fits = (row: WidgetId[], id: WidgetId) =>
        row.filter((x) => x !== id).reduce((sum, x) => sum + minSpan(x, field), 0) + minSpan(id, field) <= COLS + EPS;

    return {
        loaded,
        rows,
        layout,
        visible,
        field,
        setField: useCallback((w: number) => { if (w > 0) setFieldState(w); }, []),
        fits,
        isVisible: (id: WidgetId) => visible.includes(id),
        isCollapsed: (id: WidgetId) => state.collapsed.includes(id),
        minSpan: (id: WidgetId) => minSpan(id, field),

        /** Снимок для растягивания: расстановка и ряды — как они на экране. */
        resizeStart: (): ResizeStart => ({ state, rows }),

        /**
         * Граница между соседями `a` и `b` сдвинута на `d` колонок: `a` шире
         * на `d`, `b` уже на `d`. Остальные не трогаются.
         */
        resizeDivider: useCallback((start: ResizeStart, a: WidgetId, b: WidgetId, d: number) => {
            const f = fieldRef.current;
            const s0 = start.state;
            const row = start.rows.find((r) => r.items.includes(a));
            if (!row || !row.items.includes(b)) return;
            // Ширины ряда — как на экране, иначе блоки отскочат от мышки.
            const w = { ...s0.w };
            row.items.forEach((x, i) => { if (!isStrip(s0, x)) w[x] = row.spans[i]; });
            const a0 = row.spans[row.items.indexOf(a)];
            const b0 = row.spans[row.items.indexOf(b)];
            const dd = clamp(d, Math.min(0, minSpan(a, f) - a0), Math.max(0, b0 - minSpan(b, f)));
            w[a] = a0 + dd;
            w[b] = b0 - dd;
            setState({ ...s0, w });
        }, []),

        /**
         * Правый край ряда `rowIndex` сдвинут на `d` колонок (влево — меньше нуля).
         *
         * Блоки ряда ужимаются пропорционально, и как только в освободившееся
         * место влезает блок из ряда ниже, он поднимается; поднявшиеся делят
         * свободное место. Потянул обратно вправо — блоки ряда растут и
         * выталкивают поднявшихся вниз.
         *
         * Всё считается от снимка начала: туда и обратно — исходная
         * расстановка. Правее края поля ряд не растёт — дальше некуда.
         */
        resizeEdge: useCallback((start: ResizeStart, rowIndex: number, d: number) => {
            const f = fieldRef.current;
            const s0 = start.state;
            const row = start.rows[rowIndex];
            if (!row) return;
            if (liveRef.current !== rowIndex) setLive(rowIndex);
            const need = (id: WidgetId) => (isStrip(s0, id) ? collapsedSpan(f) : minSpan(id, f));
            const sumMins = row.items.reduce((a, id) => a + need(id), 0);
            const total = clamp(COLS + d, Math.min(sumMins, COLS), COLS);
            const w = { ...s0.w };
            const put = (ids: WidgetId[], spans: number[]) => ids.forEach((id, i) => { if (!isStrip(s0, id)) w[id] = spans[i]; });
            put(row.items, scaleTo(s0, row.items, row.spans, total, f));

            const below = start.rows[rowIndex + 1];
            if (below) {
                // Освободилось место — поднимаем блоки ряда ниже, пока влезают.
                let free = COLS - total;
                let n = 0;
                while (n < below.items.length && need(below.items[n]) <= free + EPS) free -= need(below.items[n++]);
                // Ряд ниже — с ширинами как на экране, а поднявшиеся делят свободное место.
                put(below.items, below.spans);
                if (n) {
                    const up = below.items.slice(0, n);
                    put(up, scaleTo(s0, up, below.spans.slice(0, n), COLS - total, f));
                    // Оставшиеся внизу заполняют свой ряд до края.
                    const rest = below.items.slice(n);
                    if (rest.length) put(rest, scaleTo(s0, rest, below.spans.slice(n), COLS, f));
                }
            }
            setState({ ...s0, w });
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []),

        /** Отпустили — ряд, который тянули, и ряд под ним снова до края, так и запоминаются. */
        resizeEnd: useCallback(() => {
            const r = liveRef.current;
            if (r === null) return;
            setLive(null);
            setState((s) => {
                const f = fieldRef.current;
                const w = { ...s.w };
                for (const row of flow(s, idsOf(s), f).slice(r, r + 2)) {
                    scaleTo(s, row.items, row.spans, COLS, f).forEach((v, i) => { if (!isStrip(s, row.items[i])) w[row.items[i]] = v; });
                }
                return { ...s, w };
            });
            // eslint-disable-next-line react-hooks/exhaustive-deps
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
            setState((s) => (s.order.includes(id) ? s : place(s, flow(s, idsOf(s), fieldRef.current), id, p)));
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []),
        move: useCallback((id: WidgetId, p: Placement) => {
            setState((s) => {
                if ('anchor' in p && p.anchor === id) return s;
                return place(s, flow(s, idsOf(s), fieldRef.current), id, p);
            });
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []),
        /** Высота ряда: задаётся блокам ряда (в смешанном ряду плашки тянутся сами). */
        setRowH: useCallback((items: WidgetId[], h: number) => {
            setState((s) => {
                const target = items.some((x) => !isKpi(x)) ? items.filter((x) => !isKpi(x)) : items;
                const v = clamp(Math.round(h), minRowH(items), MAX_ROW_H);
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
