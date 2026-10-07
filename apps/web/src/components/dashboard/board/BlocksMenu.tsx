'use client';

import { ChevronDown, LayoutGrid, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useBoardData } from './data';
import { MovePicker } from './frame';
import { BLOCK_IDS, KPI_IDS, type Placement, type WidgetId } from './layout';
import { widgetMeta } from './widgets';

/**
 * «Блоки»: что показывать на дашборде. Показатели и блоки ставятся куда
 * угодно — в ряд с другими или новым рядом; уже стоящие убираются одной
 * кнопкой. Список — только из того, что человеку открыто.
 */
export default function BlocksMenu({ rows, allowed, onShow, onHide, onReset }: {
    rows: WidgetId[][];
    allowed: Set<WidgetId>;
    onShow: (id: WidgetId, p: Placement) => void;
    onHide: (id: WidgetId) => void;
    onReset: () => void;
}) {
    const { period } = useBoardData();
    const onBoard = rows.flat();
    const kpis = KPI_IDS.filter((id) => allowed.has(id));
    const blocks = BLOCK_IDS.filter((id) => allowed.has(id));

    const item = (id: WidgetId) => {
        const meta = widgetMeta(id, period);
        const Icon = meta.icon;
        const shown = onBoard.includes(id);
        return (
            <div key={id} data-lib-item={id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-solid border-border bg-muted/40">
                    <Icon className="size-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{meta.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{meta.description}</span>
                </span>
                {shown ? (
                    <Button variant="ghost" size="sm" className="h-7 rounded-md px-2.5 text-[13px] font-normal" onClick={() => onHide(id)} aria-label={`Убрать «${meta.title}»`}>
                        Убрать
                    </Button>
                ) : (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 gap-1 rounded-md px-2.5 text-[13px] font-normal" aria-label={`Добавить «${meta.title}»`}>
                                <Plus className="size-3.5" /> Добавить <ChevronDown className="size-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-72">
                            <MovePicker rows={rows} adding={id} onPick={(p) => onShow(id, p)} />
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        );
    };

    const section = (title: string, ids: readonly WidgetId[]) => (
        <div>
            <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 bg-popover px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>{title}</span>
                <span className="font-normal normal-case tracking-normal">{ids.filter((id) => onBoard.includes(id)).length} из {ids.length} на дашборде</span>
            </div>
            {ids.map(item)}
        </div>
    );

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg px-3 text-[13px] font-normal">
                    <LayoutGrid className="size-4" /> Блоки
                    <span className="ml-0.5 rounded-md bg-secondary px-1.5 text-[11px] tabular-nums text-secondary-foreground">{onBoard.length}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[460px] max-w-[calc(100vw-32px)] gap-0 p-0">
                <div className="px-4 py-3">
                    <div className="text-sm font-medium">Что показывать на дашборде</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        И показатели, и блоки ставятся куда угодно: в ряд с другими (сколько влезет по ширине экрана) или новым рядом сверху
                        либо снизу. Уже стоящие переносятся через «…» или перетаскиванием: блок встанет слева или справа от того, на что навели.
                    </p>
                </div>
                <div className="h-px bg-border" />
                <div className="max-h-[520px] overflow-auto pb-1">
                    {kpis.length > 0 && section('Показатели', kpis)}
                    {blocks.length > 0 && section('Блоки', blocks)}
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">Расстановка запоминается в этом браузере</span>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 rounded-md px-2.5 text-[13px] font-normal" onClick={onReset}>
                        <RotateCcw className="size-3.5" /> Как было
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
