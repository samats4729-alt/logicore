'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { SLOT_PAD, type WidgetId } from './layout';

/**
 * Перетаскивание блоков — как в макете: обычное перетаскивание браузера.
 *
 * Над блоком цель выбирается по месту курсора: левая половина — встать
 * слева, правая — справа, у верхнего или нижнего края высокого блока —
 * новым рядом над ним или под ним. Между рядами — щели: бросил туда —
 * блок встал отдельным рядом.
 */

export type Hover =
    | { kind: 'block'; anchor: WidgetId; zone: 'left' | 'right' | 'above' | 'below'; ok: boolean }
    | { kind: 'gap'; index: number };

interface DragCtx {
    dragId: WidgetId | null;
    setDragId: (id: WidgetId | null) => void;
    hover: Hover | null;
    setHover: (h: Hover | null) => void;
    canDrop: (anchor: WidgetId, zone: 'left' | 'right' | 'above' | 'below') => boolean;
    drop: () => void;
    swap: (a: WidgetId, b: WidgetId) => void;
    /** Влезет ли блок в конец ряда. */
    fits: (row: WidgetId[], id: WidgetId) => boolean;
}

const noop = () => undefined;
export const DragContext = createContext<DragCtx>({
    dragId: null, setDragId: noop, hover: null, setHover: noop, canDrop: () => false, drop: noop, swap: noop, fits: () => true,
});
export const useDrag = () => useContext(DragContext);

const same = (a: Hover | null, b: Hover | null) =>
    a === b
    || (!!a && !!b && a.kind === b.kind
        && (a.kind === 'gap'
            ? a.index === (b as Extract<Hover, { kind: 'gap' }>).index
            : a.anchor === (b as Extract<Hover, { kind: 'block' }>).anchor
                && a.zone === (b as Extract<Hover, { kind: 'block' }>).zone
                && a.ok === (b as Extract<Hover, { kind: 'block' }>).ok));

/** Полоска «встанет сюда»: тёмная — можно, красная — ряд полон. */
export function DropMarker({ ok, className }: { ok: boolean; className?: string }) {
    return (
        <span
            aria-hidden
            className={cn('pointer-events-none absolute z-30 rounded-full', className)}
            style={{
                background: ok ? 'hsl(var(--primary))' : '#ef4444',
                boxShadow: `0 0 0 4px ${ok ? 'hsl(var(--primary) / 0.2)' : 'rgb(239 68 68 / 0.2)'}`,
            }}
        />
    );
}

/** Место блока в ряду: принимает брошенный блок слева, справа, сверху или снизу. */
export function DropArea({ id, children }: { id: WidgetId; children: React.ReactNode }) {
    const d = useDrag();
    const mine = d.hover?.kind === 'block' && d.hover.anchor === id ? d.hover : null;
    return (
        <div
            data-drop-area={id}
            className="relative h-full"
            style={{ paddingInline: SLOT_PAD }}
            onDragOver={(e) => {
                if (!d.dragId || d.dragId === id) return;
                const r = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width;
                const y = (e.clientY - r.top) / r.height;
                const tall = r.height >= 160;
                const zone = tall && y < 0.14 ? 'above' : tall && y > 0.86 ? 'below' : x < 0.5 ? 'left' : 'right';
                const h: Hover = { kind: 'block', anchor: id, zone, ok: d.canDrop(id, zone) };
                e.preventDefault();
                e.dataTransfer.dropEffect = h.ok ? 'move' : 'none';
                if (!same(d.hover, h)) d.setHover(h);
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node) && d.hover?.kind === 'block' && d.hover.anchor === id) d.setHover(null);
            }}
            onDrop={(e) => { e.preventDefault(); d.drop(); }}
        >
            {children}
            {mine && (mine.zone === 'left' || mine.zone === 'right') && (
                <DropMarker
                    ok={mine.ok}
                    className={cn('bottom-0 top-0 w-[3px]', mine.zone === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2')}
                />
            )}
        </div>
    );
}

/** Щель между рядами: бросил сюда — блок встал отдельным рядом. */
export function DropGap({ index, height, children }: { index: number; height: number; children?: React.ReactNode }) {
    const d = useDrag();
    const on = d.hover?.kind === 'gap' && d.hover.index === index;
    return (
        <div
            data-drop-gap={index}
            className="relative"
            style={{ height }}
            onDragOver={(e) => {
                if (!d.dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const h: Hover = { kind: 'gap', index };
                if (!same(d.hover, h)) d.setHover(h);
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node) && d.hover?.kind === 'gap' && d.hover.index === index) d.setHover(null);
            }}
            onDrop={(e) => { e.preventDefault(); d.drop(); }}
        >
            {children}
            {on && <DropMarker ok className="left-3 right-3 top-1/2 h-[3px] -translate-y-1/2" />}
        </div>
    );
}

/**
 * Ручка высоты ряда: тянут мышкой или стрелками с клавиатуры (Shift — шаг
 * крупнее). У края окна страница сама подкручивается, чтобы ряд можно было
 * вытянуть ниже видимого.
 */
export function RowHeightHandle({ height, min, max, onResize, label, disabled, size }: {
    height: number;
    min: number;
    max: number;
    onResize: (h: number) => void;
    label: string;
    disabled?: boolean;
    size: number;
}) {
    const [active, setActive] = useState(false);
    const drag = useRef<{ startY: number; startH: number; startClientY: number; lastClientY: number } | null>(null);
    const latest = useRef({ min, max, onResize });
    latest.current = { min, max, onResize };

    const apply = () => {
        const g = drag.current;
        if (!g) return;
        const delta = g.lastClientY + window.scrollY - g.startY;
        latest.current.onResize(Math.min(latest.current.max, Math.max(latest.current.min, g.startH + delta)));
    };

    useEffect(() => {
        if (!active) return;
        const t = window.setInterval(() => {
            const g = drag.current;
            if (!g) return;
            const below = g.lastClientY - (window.innerHeight - 72);
            const above = 72 - g.lastClientY;
            if (below > 0 && g.lastClientY - g.startClientY > 8) {
                const before = window.scrollY;
                window.scrollBy(0, Math.min(14, Math.max(2, below / 6)));
                if (window.scrollY !== before) apply();
            } else if (above > 0 && g.startClientY - g.lastClientY > 8 && window.scrollY > 0) {
                window.scrollBy(0, -Math.min(14, Math.max(2, above / 6)));
                apply();
            }
        }, 16);
        return () => window.clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    if (disabled) return <div style={{ height: size }} aria-hidden />;
    return (
        <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={label}
            aria-valuenow={height}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            data-slot="row-handle"
            data-active={active || undefined}
            style={{ height: size }}
            className="group/handle relative z-10 flex shrink-0 cursor-row-resize touch-none select-none items-center justify-center outline-none"
            onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { startY: e.clientY + window.scrollY, startH: height, startClientY: e.clientY, lastClientY: e.clientY };
                setActive(true);
            }}
            onPointerMove={(e) => {
                if (!drag.current) return;
                drag.current.lastClientY = e.clientY;
                apply();
            }}
            onPointerUp={() => { drag.current = null; setActive(false); }}
            onPointerCancel={() => { drag.current = null; setActive(false); }}
            onKeyDown={(e) => {
                const step = e.shiftKey ? 96 : 24;
                if (e.key === 'ArrowDown') { e.preventDefault(); onResize(Math.min(max, height + step)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); onResize(Math.max(min, height - step)); }
            }}
        >
            <div className="h-[3px] w-5 rounded-full bg-muted-foreground/35 transition-colors group-hover/handle:bg-muted-foreground/70 group-focus-visible/handle:bg-ring group-data-[active]/handle:bg-primary" />
        </div>
    );
}

/** Размер элемента — по нему блоки выбирают вид (как календарь в макете). */
export function useSize<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, size] as const;
}
