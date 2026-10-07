'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SubscriptionBuyModal from '@/components/billing/SubscriptionBuyModal';
import EmployeeEarningsCard from '@/components/dashboard/EmployeeEarningsCard';
import IncomingInvoicesCard from '@/components/dashboard/IncomingInvoicesCard';
import PaymentCalendarCard from '@/components/dashboard/PaymentCalendarCard';
import PaymentProofsCard from '@/components/dashboard/PaymentProofsCard';
import PendingWorkCard from '@/components/dashboard/PendingWorkCard';
import { subscriptionView } from '@/lib/subscription-state';
import { cn } from '@/lib/utils';
import BlocksMenu from './BlocksMenu';
import {
    ActivityBlock,
    AttentionBlock,
    ByStatusBlock,
    ChartBlock,
    DebtorsBlock,
    DriversBlock,
    EventsBlock,
    InTransitBlock,
    LoadingCalendarBlock,
    UpcomingBlock,
} from './blocks';
import { PERIOD_LABEL, useBoardData, type Period } from './data';
import { DragContext, DropArea, DropGap, DropMarker, RowHeightHandle, useDrag, useSize, type Hover } from './dnd';
import { BlockFrame, CollapsedStrip, KpiTile } from './frame';
import {
    COLS,
    KPI_ROW_H,
    MAX_ROW_H,
    SLOT_PAD,
    isKpi,
    minRowH,
    type BoardApi,
    type Placement,
    type ResizeStart,
    type Row,
    type WidgetId,
} from './layout';
import { widgetMeta } from './widgets';

/**
 * Тело блока по его имени.
 *
 * Обёрнуто в `memo`: когда тянут высоту ряда или ширину соседа, дашборд
 * перерисовывается на каждое движение мыши, и без этого вместе с ним
 * заново рисовались все графики и таблицы — отсюда «лаги». Своими данными
 * тело обновляется само (через `useBoardData`), размером — само следит.
 */
const BlockBody = memo(function BlockBody({ id }: { id: WidgetId }) {
    switch (id) {
        case 'chart': return <ChartBlock />;
        case 'calendar': return <LoadingCalendarBlock />;
        case 'upcoming': return <UpcomingBlock />;
        case 'attention': return <AttentionBlock />;
        case 'inTransit': return <InTransitBlock />;
        case 'debtors': return <DebtorsBlock />;
        case 'drivers': return <DriversBlock />;
        case 'byStatus': return <ByStatusBlock />;
        case 'activity': return <ActivityBlock />;
        case 'events': return <EventsBlock />;
        // Блоки, которые были в платформе и до конструктора: их логика
        // (согласовать счёт, принять чек) — прежняя, меняется только рамка.
        case 'earnings': return <EmployeeEarningsCard />;
        case 'pendingWork': return <PendingWorkCard />;
        case 'paymentCalendar': return <PaymentCalendarCard />;
        case 'incomingInvoices': return <IncomingInvoicesCard />;
        case 'paymentProofs': return <PaymentProofsCard />;
        default: return null;
    }
});

/**
 * Ряд дашборда — во всю ширину поля. Каждый блок занимает свою долю
 * (`span` из `COLS`); доли дробные, поэтому ряд — строка, а не сетка.
 */
function BoardRow({ row, index, board, onHide, onBuy }: {
    row: Row;
    index: number;
    board: BoardApi;
    onHide: (id: WidgetId) => void;
    onBuy: () => void;
}) {
    const others = (id: WidgetId) => board.visible.filter((x) => x !== id);
    const { hover } = useDrag();
    const edge = hover?.kind === 'block' && (hover.zone === 'above' || hover.zone === 'below') && row.items.includes(hover.anchor) ? hover : null;
    return (
        <div data-row={row.id} className="relative flex" style={{ height: row.h }}>
            {row.items.map((id, i) => (
                <Slot
                    key={id}
                    id={id}
                    span={row.spans[i]}
                    handle={handleFor(board, row, index, i)}
                    board={board}
                    others={others(id)}
                    onHide={onHide}
                    onBuy={onBuy}
                />
            ))}
            {edge && (
                <DropMarker ok className={cn('left-3 right-3 h-[3px]', edge.zone === 'above' ? '-top-3 -translate-y-1/2' : '-bottom-3 translate-y-1/2')} />
            )}
        </div>
    );
}

/**
 * Какая ручка у правого края блока.
 *
 * - Последний в ряду — край ряда: ряд ужимается целиком, снизу поднимаются блоки.
 * - В середине — граница с соседом справа: меняются только эти двое.
 *   Свёрнутые полоски по ширине не меняются, поэтому сосед — первый
 *   развёрнутый правее; нет такого — ручка работает как край ряда.
 */
type Handle = { kind: 'edge'; row: number } | { kind: 'divider'; partner: WidgetId } | null;

function handleFor(board: BoardApi, row: Row, rowIndex: number, i: number): Handle {
    const id = row.items[i];
    const strip = (x: WidgetId) => !isKpi(x) && board.isCollapsed(x);
    if (i === row.items.length - 1) return { kind: 'edge', row: rowIndex };
    if (strip(id)) return null;
    const partner = row.items.slice(i + 1).find((x) => !strip(x));
    return partner ? { kind: 'divider', partner } : { kind: 'edge', row: rowIndex };
}

/**
 * Правый край блока — за него тянут ширину (владелец, 08.10.2026).
 *
 * Граница между блоками меняет только двух соседей. Край ряда ужимает весь
 * ряд пропорционально, и в освободившееся место поднимаются блоки из ряда
 * ниже; потянул обратно — их выталкивает вниз. Отпустил — ряд снова до края.
 */
function WidthHandle({ id, handle, board }: { id: WidgetId; handle: NonNullable<Handle>; board: BoardApi }) {
    const drag = useRef<{ x: number; col: number; start: ResizeStart; handle: NonNullable<Handle> } | null>(null);
    // С клавиатуры: шаги копятся от одного снимка, ряд выравнивается, когда ручку отпустили.
    const keys = useRef<{ d: number; start: ResizeStart } | null>(null);
    const [active, setActive] = useState(false);
    const title = widgetMeta(id).title;
    const apply = (g: { start: ResizeStart; handle: NonNullable<Handle> }, d: number) => {
        if (g.handle.kind === 'divider') board.resizeDivider(g.start, id, g.handle.partner, d);
        else board.resizeEdge(g.start, g.handle.row, d);
    };
    const end = () => {
        if (!drag.current) return;
        drag.current = null;
        setActive(false);
        board.resizeEnd();
    };
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={handle.kind === 'edge' ? `Ширина ряда — край «${title}»` : `Граница «${title}» и «${widgetMeta(handle.partner).title}»`}
            tabIndex={0}
            data-slot="width-handle"
            data-handle-for={id}
            data-handle-kind={handle.kind}
            data-active={active || undefined}
            className="group/handle absolute -right-1.5 bottom-0 top-0 z-20 flex w-3 cursor-col-resize touch-none select-none items-center justify-center outline-none"
            onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, col: board.field / COLS, start: board.resizeStart(), handle };
                setActive(true);
            }}
            onPointerMove={(e) => {
                const g = drag.current;
                if (g) apply(g, (e.clientX - g.x) / g.col);
            }}
            onPointerUp={end}
            onPointerCancel={end}
            onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault();
                const k = keys.current ?? (keys.current = { d: 0, start: board.resizeStart() });
                k.d += (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 6 : 2);
                apply({ start: k.start, handle }, k.d);
            }}
            onBlur={() => {
                if (!keys.current) return;
                keys.current = null;
                board.resizeEnd();
            }}
        >
            <div className="h-5 w-[3px] rounded-full bg-muted-foreground/35 transition-colors group-hover/handle:bg-muted-foreground/70 group-focus-visible/handle:bg-ring group-data-[active]/handle:bg-primary" />
        </div>
    );
}

function Slot({ id, span, handle, board, others, onHide, onBuy }: {
    id: WidgetId;
    span: number;
    handle: Handle;
    board: BoardApi;
    others: WidgetId[];
    onHide: (id: WidgetId) => void;
    onBuy: () => void;
}) {
    const kpi = isKpi(id);
    const collapsed = !kpi && board.isCollapsed(id);
    return (
        <div className="relative h-full min-h-0 min-w-0 shrink-0 grow-0" style={{ width: `${(span / COLS) * 100}%` }}>
            <DropArea id={id}>
                {kpi ? (
                    <KpiTile id={id} others={others} rows={board.layout} onHide={() => onHide(id)} onMove={(p) => board.move(id, p)} onBuy={onBuy} />
                ) : collapsed ? (
                    <CollapsedStrip id={id} onExpand={() => board.setCollapsed(id, false)} />
                ) : (
                    <BlockFrame
                        id={id}
                        collapsed={false}
                        others={others}
                        rows={board.layout}
                        onToggle={() => board.toggleCollapsed(id)}
                        onHide={() => onHide(id)}
                        onMove={(p) => board.move(id, p)}
                    >
                        <BlockBody id={id} />
                    </BlockFrame>
                )}
            </DropArea>
            {handle && <WidthHandle id={id} handle={handle} board={board} />}
        </div>
    );
}

/** Уже этого поле дашборда — режим телефона. */
const NARROW_FIELD = 640;

/**
 * Дашборд на телефоне: ряды из макета разворачиваются в столбик —
 * показатели по два в ряд, блоки во всю ширину, высота — как у ряда, но не
 * выше половины экрана. Тянуть ширину на телефоне нечего, а переставлять
 * и убирать — по-прежнему через «…».
 */
function NarrowBoard({ board, onHide, onBuy }: { board: BoardApi; onHide: (id: WidgetId) => void; onBuy: () => void }) {
    const others = (id: WidgetId) => board.visible.filter((x) => x !== id);
    return (
        <div className="flex flex-col gap-3" style={{ paddingInline: SLOT_PAD }}>
            {board.rows.map((row) => {
                const kpis = row.items.filter(isKpi);
                const blocks = row.items.filter((id) => !isKpi(id));
                return (
                    <div key={row.id} className="flex flex-col gap-3">
                        {kpis.length > 0 && (
                            <div className="grid grid-cols-2 gap-3">
                                {kpis.map((id, i) => (
                                    // Одна в последней строке — во всю ширину, без дыры справа.
                                    <div key={id} style={{ height: KPI_ROW_H }} className={kpis.length % 2 === 1 && i === kpis.length - 1 ? 'col-span-2' : undefined}>
                                        <KpiTile id={id} others={others(id)} rows={board.layout} onHide={() => onHide(id)} onMove={(p) => board.move(id, p)} onBuy={onBuy} />
                                    </div>
                                ))}
                            </div>
                        )}
                        {blocks.map((id) => {
                            const collapsed = board.isCollapsed(id);
                            return (
                                <div key={id} style={{ height: collapsed ? 44 : Math.min(Math.max(row.h, 320), 520) }}>
                                    <BlockFrame
                                        id={id}
                                        collapsed={collapsed}
                                        others={others(id)}
                                        rows={board.layout}
                                        onToggle={() => board.toggleCollapsed(id)}
                                        onHide={() => onHide(id)}
                                        onMove={(p) => board.move(id, p)}
                                    >
                                        <BlockBody id={id} />
                                    </BlockFrame>
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

/** «Среда, 8 октября». */
function todayTitle() {
    const s = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «обновлено только что», «обновлено 5 минут назад». */
function useUpdatedAgo(stamp: number) {
    const [, tick] = useState(0);
    useEffect(() => {
        const t = window.setInterval(() => tick((n) => n + 1), 30_000);
        return () => window.clearInterval(t);
    }, []);
    const min = Math.floor((Date.now() - stamp) / 60_000);
    if (min < 1) return 'обновлено только что';
    const t = min % 100, o = min % 10;
    const word = t > 10 && t < 20 ? 'минут' : o === 1 ? 'минуту' : o >= 2 && o <= 4 ? 'минуты' : 'минут';
    return `обновлено ${min} ${word} назад`;
}

/**
 * Дашборд-конструктор — по коду макета «LogiCore на shadcn Nova»
 * (владелец, 07.10.2026). Ряды блоков и показателей: переставляются,
 * тянутся по ширине и высоте, сворачиваются, убираются и возвращаются.
 */
export default function Board({ board, allowed, actions }: {
    board: BoardApi;
    allowed: Set<WidgetId>;
    /** Кнопки справа в шапке («Создать заявку»). */
    actions?: React.ReactNode;
}) {
    const { period, setPeriod, billing, reloadBilling } = useBoardData();
    const [dragId, setDragId] = useState<WidgetId | null>(null);
    const [hover, setHover] = useState<Hover | null>(null);
    const [fieldRef, fieldSize] = useSize<HTMLDivElement>();
    const [buyOpen, setBuyOpen] = useState(false);
    const [stamp] = useState(() => Date.now());
    const updated = useUpdatedAgo(stamp);
    // Телефон: рядом ничего не помещается — блоки друг под другом.
    const narrow = fieldSize.w > 0 && fieldSize.w < NARROW_FIELD;
    // Ширина поля нужна раскладке: от неё минимумы в колонках и где кончится ряд.
    const { setField } = board;
    useLayoutEffect(() => setField(fieldSize.w), [fieldSize.w, setField]);

    const layout = board.layout;
    // Встать можно куда угодно: не влезет в ряд — ряды сами перестроятся.
    const canDrop = () => true;
    const toPlacement = (h: Hover, dragged: WidgetId): Placement | null => {
        if (h.kind === 'block') {
            return h.zone === 'left' ? { kind: 'before', anchor: h.anchor }
                : h.zone === 'right' ? { kind: 'after', anchor: h.anchor }
                    : h.zone === 'above' ? { kind: 'rowAbove', anchor: h.anchor }
                        : { kind: 'rowBelow', anchor: h.anchor };
        }
        if (h.index <= 0) return { kind: 'top' };
        if (h.index >= layout.length) return { kind: 'bottom' };
        const anchor = layout[h.index - 1].find((x) => x !== dragged);
        return anchor ? { kind: 'rowBelow', anchor } : null;
    };
    const dragValue = useMemo(() => ({
        dragId,
        setDragId,
        hover,
        setHover,
        canDrop,
        fits: board.fits,
        swap: board.swap,
        drop: () => {
            const d = dragId;
            const h = hover;
            setDragId(null);
            setHover(null);
            if (!d || !h || (h.kind === 'block' && !h.ok)) return;
            const p = toPlacement(h, d);
            if (p) board.move(d, p);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [dragId, hover, layout, board.swap, board.move, board.fits]);

    /** Убрать — с кнопкой «Вернуть» туда же, где стоял. */
    const hide = (id: WidgetId) => {
        // Вернуть — на то же место в порядке: перед тем, кто шёл следом.
        const i = board.visible.indexOf(id);
        const next = board.visible[i + 1];
        const prev = board.visible[i - 1];
        const back: Placement = next ? { kind: 'before', anchor: next } : prev ? { kind: 'after', anchor: prev } : { kind: 'bottom' };
        board.hide(id);
        toast(`${isKpi(id) ? 'Показатель' : 'Блок'} «${widgetMeta(id, period).title}» убран`, {
            action: { label: 'Вернуть', onClick: () => board.show(id, back) },
        });
    };

    const sub = billing.data ? subscriptionView(billing.data) : null;
    const rowCollapsed = (r: Row) => r.items.every((id) => !isKpi(id) && board.isCollapsed(id));

    return (
        <DragContext.Provider value={dragValue}>
            <div className="flex min-h-[calc(100svh-48px)] flex-col px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground">Дашборд</h1>
                        <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">{todayTitle()} · {updated}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <BlocksMenu rows={layout} allowed={allowed} onShow={board.show} onHide={hide} onReset={board.reset} />
                        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                            <SelectTrigger className="h-8 w-40 rounded-lg text-[13px] text-foreground" aria-label="Период для показателей">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                                    <SelectItem key={p} value={p} className="text-xs">{PERIOD_LABEL[p]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {actions}
                    </div>
                </div>

                <div ref={fieldRef} style={{ marginInline: -SLOT_PAD }} data-dashboard-field>
                    <DropGap index={0} height={12} />
                    {board.loaded && narrow && <NarrowBoard board={board} onHide={hide} onBuy={() => setBuyOpen(true)} />}
                    {board.loaded && !narrow && board.rows.map((row, i) => (
                        <div key={row.id}>
                            <BoardRow row={row} index={i} board={board} onHide={hide} onBuy={() => setBuyOpen(true)} />
                            <DropGap index={i + 1} height={24}>
                                <RowHeightHandle
                                    height={row.h}
                                    min={minRowH(row.items)}
                                    max={MAX_ROW_H}
                                    onResize={(h) => board.setRowH(row.items, h)}
                                    label={`Высота ряда ${i + 1}`}
                                    size={24}
                                    disabled={rowCollapsed(row)}
                                />
                            </DropGap>
                        </div>
                    ))}
                    {board.loaded && board.rows.length === 0 && (
                        <div style={{ paddingInline: SLOT_PAD }}>
                            <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
                                <LayoutGrid className="size-6 text-muted-foreground" />
                                <div>
                                    <div className="text-sm font-medium">На дашборде не осталось блоков</div>
                                    <div className="text-xs text-muted-foreground">Включите нужные в списке «Блоки» сверху или вернитесь к прежней расстановке</div>
                                </div>
                                <Button variant="outline" size="sm" onClick={board.reset}>Вернуть как было</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {billing.data && sub && (
                <SubscriptionBuyModal
                    open={buyOpen}
                    pricePerUser={sub.pricePerUser}
                    users={sub.users}
                    cardPayment={billing.data.cardPayment}
                    onClose={() => setBuyOpen(false)}
                    onSent={reloadBilling}
                />
            )}
        </DragContext.Provider>
    );
}
