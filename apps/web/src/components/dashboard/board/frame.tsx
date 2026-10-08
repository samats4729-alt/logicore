'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowDownToLine,
    ArrowLeftRight,
    ArrowRight,
    ArrowUpToLine,
    ChevronDown,
    ChevronUp,
    ChevronsRight,
    Columns3,
    Ellipsis,
    EyeOff,
    GripVertical,
    Maximize2,
    Move,
    SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BoardSlotContext } from '../DashboardCard';
import { Delta } from './charts';
import { useDrag, useSize } from './dnd';
import type { Placement, WidgetId } from './layout';
import { hasSettings, useOpenBlock } from './settings';
import { useKpi, useMeta, type KpiId } from './widgets';
import styles from './board.module.css';

const ICON_BTN = 'size-7 rounded-md text-muted-foreground hover:text-foreground';

/**
 * «Переместить в…»: в конец любого ряда (если влезет) или новым рядом —
 * сверху или снизу. Тот же список — у «Добавить» в меню «Блоки».
 */
export function MovePicker({ rows, self, adding, onPick }: {
    rows: WidgetId[][];
    self?: WidgetId;
    adding?: WidgetId;
    onPick: (p: Placement) => void;
}) {
    const meta = useMeta();
    const drag = useDrag();
    const who = self ?? adding;
    const others = rows.map((row, i) => ({ row, i })).filter(({ row }) => !(self && row.includes(self)));
    const alone = self ? rows.findIndex((r) => r.length === 1 && r[0] === self) : -1;
    const canTop = rows.length > 0 && alone !== 0;
    const canBottom = alone !== rows.length - 1;
    return (
        <>
            {others.length > 0 && (
                <>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">В конец ряда</DropdownMenuLabel>
                    {others.map(({ row, i }) => {
                        const full = !!who && !drag.fits(row, who);
                        return (
                            <DropdownMenuItem key={row.join('+')} disabled={full} onSelect={() => onPick({ kind: 'row', anchor: row[0] })} className="text-[13px]">
                                <Columns3 className="size-4" />
                                <span className="min-w-0 flex-1 truncate">
                                    Ряд {i + 1}: {row.map((id) => meta(id).short ?? meta(id).title).join(', ')}
                                </span>
                                {full && <span className="text-xs text-muted-foreground">полон</span>}
                            </DropdownMenuItem>
                        );
                    })}
                    <DropdownMenuSeparator />
                </>
            )}
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Новым рядом</DropdownMenuLabel>
            {canTop && (
                <DropdownMenuItem onSelect={() => onPick({ kind: 'top' })} className="text-[13px]">
                    <ArrowUpToLine className="size-4" /> Сверху, под показателями
                </DropdownMenuItem>
            )}
            {canBottom && (
                <DropdownMenuItem onSelect={() => onPick({ kind: 'bottom' })} className="text-[13px]">
                    <ArrowDownToLine className="size-4" /> Снизу
                </DropdownMenuItem>
            )}
        </>
    );
}

/** Общая часть меню «…»: поменять местами, переместить, убрать. */
function WidgetMenuItems({ id, others, rows, onMove, onHide }: {
    id: WidgetId;
    others: WidgetId[];
    rows: WidgetId[][];
    onMove: (p: Placement) => void;
    onHide: () => void;
}) {
    const drag = useDrag();
    const meta = useMeta();
    return (
        <>
            {others.length > 0 && (
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-[13px]"><ArrowLeftRight className="mr-2 size-4" /> Поменять местами с…</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-80 w-60 overflow-auto">
                        {others.map((o) => (
                            <DropdownMenuItem key={o} onSelect={() => drag.swap(id, o)} className="text-[13px]">{meta(o).title}</DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            )}
            <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-[13px]"><Move className="mr-2 size-4" /> Переместить в…</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72">
                    <MovePicker rows={rows} self={id} onPick={onMove} />
                </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onHide} className="text-[13px]"><EyeOff className="size-4" /> Убрать с дашборда</DropdownMenuItem>
        </>
    );
}

/**
 * «Открыть крупно» (если кнопки в шапке нет) и «Настройки…» (если блоку
 * есть что настраивать) — верх меню «…».
 */
function OpenItems({ id, expand }: { id: WidgetId; expand: boolean }) {
    const open = useOpenBlock();
    const settings = hasSettings(id);
    if (!expand && !settings) return null;
    return (
        <>
            {expand && (
                <DropdownMenuItem onSelect={() => open(id, 'view')} className="text-[13px]">
                    <Maximize2 className="size-4" /> Открыть крупно
                </DropdownMenuItem>
            )}
            {settings && (
                <DropdownMenuItem onSelect={() => open(id, 'settings')} className="text-[13px]">
                    <SlidersHorizontal className="size-4" /> Настройки…
                </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
        </>
    );
}

/**
 * Блок: карточка с шапкой — ручка для перетаскивания, название, пояснение,
 * переход на полную страницу, «свернуть» и меню «…».
 */
export function BlockFrame({ id, collapsed, others, rows, onToggle, onHide, onMove, children }: {
    id: WidgetId;
    collapsed: boolean;
    others: WidgetId[];
    rows: WidgetId[][];
    onToggle: () => void;
    onHide: () => void;
    onMove: (p: Placement) => void;
    children: React.ReactNode;
}) {
    const router = useRouter();
    const drag = useDrag();
    const open = useOpenBlock();
    const meta = useMeta()(id);
    const head = useRef<HTMLDivElement>(null);
    const [box, size] = useSize<HTMLElement>();
    // Переход из шапки старой карточки («Журнал счетов →») — сюда, в шапку блока.
    const [slotAction, setSlotAction] = useState<{ label: string; onClick: () => void } | null>(null);
    const action = meta.action ? { label: meta.action.label, onClick: () => router.push(meta.action!.href) } : slotAction;
    const slot = useRef({ setAction: setSlotAction }).current;
    // Узкий блок: в шапке не хватает места — «Открыть крупно» уходит в меню «…».
    const narrow = size.w > 0 && size.w < (action ? 380 : 280);
    const expandInHead = !collapsed && !narrow;

    return (
        <div className="h-full" data-widget={id}>
            <section ref={box} aria-label={meta.title} className={cn(styles.card, '@container flex h-full flex-col overflow-hidden', drag.dragId === id && 'opacity-50')}>
                <div ref={head} className={cn('flex shrink-0 items-center gap-1.5 px-2', !collapsed && 'border-0 border-b border-solid border-border')} style={{ height: 44 }}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span
                                draggable
                                role="button"
                                tabIndex={0}
                                aria-label={`Перетащить блок «${meta.title}»`}
                                data-grip={id}
                                className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
                                onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', id);
                                    const card = head.current?.closest(`.${styles.card}`);
                                    if (card) e.dataTransfer.setDragImage(card, 24, 20);
                                    drag.setDragId(id);
                                }}
                                onDragEnd={() => { drag.setDragId(null); drag.setHover(null); }}
                            >
                                <GripVertical className="size-4" />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 text-xs">Потяните на другое место: блок встанет слева или справа от того, на что наведёте</TooltipContent>
                    </Tooltip>
                    <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <h2 className="m-0 truncate text-sm font-medium text-foreground">{meta.title}</h2>
                        {!collapsed && <span className="hidden truncate text-xs text-muted-foreground @2xl:inline">{meta.description}</span>}
                    </div>
                    {/* В узком блоке подпись ссылки съедала название самого блока
                        («Зара…», «Т..»). Там остаётся одна стрелка — подпись
                        видна во всплывающей подсказке и читается экранным
                        чтецом. Шире 384 точек всё как было. */}
                    {!collapsed && action && (
                        <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-md px-2 text-[13px] font-normal" onClick={action.onClick} aria-label={action.label} title={action.label}>
                            <span className="hidden @sm:inline">{action.label}</span> <ArrowRight className="size-3.5" />
                        </Button>
                    )}
                    {expandInHead && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className={ICON_BTN} onClick={() => open(id, 'view')} aria-label={`Открыть «${meta.title}» крупно`} data-expand={id}>
                                    <Maximize2 className="size-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Открыть крупно</TooltipContent>
                        </Tooltip>
                    )}
                    {/* Уже 320 точек «Свернуть» уходит в меню «…» (там оно есть всегда):
                        иначе на название блока не оставалось места. */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className={cn(ICON_BTN, !collapsed && 'hidden @xs:inline-flex')} onClick={onToggle} aria-label={collapsed ? 'Развернуть блок' : 'Свернуть блок'}>
                                {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{collapsed ? 'Развернуть' : 'Свернуть'}</TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className={ICON_BTN} aria-label="Действия с блоком">
                                <Ellipsis className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                            <OpenItems id={id} expand={!expandInHead} />
                            <DropdownMenuItem onSelect={onToggle} className="text-[13px]">
                                {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                                {collapsed ? 'Развернуть' : 'Свернуть'}
                            </DropdownMenuItem>
                            <WidgetMenuItems id={id} others={others} rows={rows} onMove={onMove} onHide={onHide} />
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                {!collapsed && (
                    <BoardSlotContext.Provider value={slot}>
                        <div className="flex min-h-0 flex-1 flex-col" data-block-body>{children}</div>
                    </BoardSlotContext.Provider>
                )}
            </section>
        </div>
    );
}

/** Свёрнутый вбок блок — узкая полоска с названием, как в макете. */
export function CollapsedStrip({ id, onExpand }: { id: WidgetId; onExpand: () => void }) {
    const drag = useDrag();
    const meta = useMeta()(id);
    const Icon = meta.icon;
    return (
        <div className="h-full" data-widget={id}>
            <div className={cn(styles.card, 'flex h-full flex-col items-center gap-2 py-2', drag.dragId === id && 'opacity-50')}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className={ICON_BTN} onClick={onExpand} aria-label={`Развернуть блок «${meta.title}»`}>
                            <ChevronsRight className="size-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">Развернуть «{meta.title}»</TooltipContent>
                </Tooltip>
                <Icon className="size-4 text-muted-foreground" />
                <span className="whitespace-nowrap text-xs font-medium text-muted-foreground [writing-mode:vertical-rl]">{meta.title}</span>
            </div>
        </div>
    );
}

export const TONE: Record<string, string> = { warn: 'text-amber-600 dark:text-amber-500', neg: 'text-red-600 dark:text-red-500' };

/**
 * Показатель. Вид — по высоте места (как в макете): в узком ряду одна
 * строка с мини-графиком, в ряду повыше — крупное число с подсказкой, в
 * высоком — ещё и график с разбивкой.
 */
export function KpiTile({ id, others, rows, onHide, onMove, onBuy }: {
    id: KpiId;
    others: WidgetId[];
    rows: WidgetId[][];
    onHide: () => void;
    onMove: (p: Placement) => void;
    onBuy?: () => void;
}) {
    const drag = useDrag();
    const meta = useMeta()(id);
    const k = useKpi(id, onBuy);
    const [ref, size] = useSize<HTMLDivElement>();
    const mode = size.h >= 150 ? 'large' : size.h >= 84 ? 'medium' : 'compact';
    const Icon = meta.icon;
    const iconCls = cn('size-4 shrink-0 text-muted-foreground', k.tone && TONE[k.tone]);
    const valueCls = k.tone ? TONE[k.tone] : '';
    const value = k.state === 'loading' ? <span className="inline-block h-4 w-8 animate-pulse rounded bg-muted align-middle" /> : k.value;

    return (
        <div
            ref={ref}
            data-widget={id}
            data-kpi={id}
            data-kpi-mode={mode}
            draggable
            className={cn('group/tile relative h-full min-w-0 cursor-grab active:cursor-grabbing', drag.dragId === id && 'opacity-50')}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); drag.setDragId(id); }}
            onDragEnd={() => { drag.setDragId(null); drag.setHover(null); }}
            title={k.hint}
        >
            <div className={cn(styles.card, '@container flex h-full flex-col overflow-hidden', k.urgent && styles.urgent, mode === 'compact' ? 'justify-center' : 'gap-2 py-3')}>
                {mode === 'compact' ? (
                    <div className="flex items-center gap-2.5 px-4">
                        <Icon className={iconCls} />
                        <span className="truncate text-[13px] text-muted-foreground">{meta.title}</span>
                        <span className={cn('shrink-0 text-base font-semibold tabular-nums tracking-tight', valueCls)}>{value}</span>
                        {k.mini && <span className="ml-1 hidden h-6 w-14 shrink-0 @[300px]:block">{k.mini}</span>}
                        {k.action ? (
                            <button type="button" className={cn(styles.tileAction, 'ml-auto')} onClick={k.action.onClick}>{k.action.label}</button>
                        ) : (
                            <span className="ml-auto hidden min-w-0 truncate text-xs text-muted-foreground @[430px]:block">{k.hint}</span>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2 px-4">
                            <Icon className={iconCls} />
                            <span className="truncate text-[13px] text-muted-foreground">{meta.title}</span>
                            {k.action && <button type="button" className={cn(styles.tileAction, 'ml-auto mr-7')} onClick={k.action.onClick}>{k.action.label}</button>}
                        </div>
                        <div className="px-4">
                            <div className="flex items-center gap-2">
                                <span className={cn('min-w-0 truncate text-2xl font-semibold tabular-nums tracking-tight', valueCls)}>{value}</span>
                                {k.delta && <Delta text={k.delta.text} tone={k.delta.tone} />}
                            </div>
                            {k.hint && <div className="mt-0.5 truncate text-xs text-muted-foreground">{k.hint}</div>}
                        </div>
                        {mode === 'large' && k.chart && <div className="mt-1 min-h-0 flex-1 px-3">{k.chart}</div>}
                    </>
                )}
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Действия с плиткой «${meta.title}»`}
                        className={cn(
                            styles.tileMenu,
                            'absolute right-1.5 size-7 rounded-md opacity-0 transition-opacity focus-visible:opacity-100 group-hover/tile:opacity-100 data-[state=open]:opacity-100',
                            mode === 'compact' ? 'top-1/2 -translate-y-1/2' : 'top-2',
                        )}
                    >
                        <Ellipsis className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    <OpenItems id={id} expand />
                    <WidgetMenuItems id={id} others={others} rows={rows} onMove={onMove} onHide={onHide} />
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
