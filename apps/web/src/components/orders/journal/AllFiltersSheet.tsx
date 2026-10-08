'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FacetFilter, type FacetOption } from './FacetFilter';
import styles from './AllFiltersSheet.module.css';

/** Одно условие отбора: значение и как его поменять. */
export interface FilterField { value?: string; set: (v: string | undefined) => void; options: FacetOption[] }

const plural = (n: number, one: string, few: string, many: string) => {
    const t = n % 100, o = n % 10;
    return t > 10 && t < 20 ? many : o === 1 ? one : o >= 2 && o <= 4 ? few : many;
};

/**
 * «Все фильтры» — панель справа, как в макете.
 *
 * Условия те же, что были в раскрывающейся полосе журнала, и считаются
 * так же: панель только собирает их в одно место. Отбор применяется
 * сразу, кнопка внизу говорит, сколько заявок осталось, и закрывает
 * панель.
 */
export function AllFiltersSheet({
    open, onOpenChange, isArchive, fields, period, sum, onReset, shown,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isArchive: boolean;
    fields: {
        company: FilterField;
        forwarder: FilterField;
        expeditor: FilterField;
        driver: FilterField;
        status: FilterField;
        from: FilterField;
        to: FilterField;
    };
    period: {
        field: 'pickup' | 'created';
        setField: (f: 'pickup' | 'created') => void;
        from: dayjs.Dayjs | null;
        to: dayjs.Dayjs | null;
        setFrom: (d: dayjs.Dayjs | null) => void;
        setTo: (d: dayjs.Dayjs | null) => void;
    };
    sum: { min?: number; max?: number; setMin: (v: number | undefined) => void; setMax: (v: number | undefined) => void };
    onReset: () => void;
    /** Сколько заявок видно с этими условиями. */
    shown: number;
}) {
    const field = (title: string, f: FilterField) => (
        <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
            <FacetFilter title={title} options={f.options} value={f.value} onChange={f.set} variant="field" />
        </div>
    );
    const date = (d: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : '');
    const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogPortal>
                <DialogOverlay className={cn('bg-black/15', styles.overlay)} />
                <DialogPrimitive.Content
                    data-filters-sheet
                    className={cn(styles.panel, 'fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[calc(100vw-24px)] flex-col bg-card text-card-foreground outline-none')}
                >
                    <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
                        <div>
                            <DialogTitle className="m-0 text-base font-semibold tracking-normal">Все фильтры</DialogTitle>
                            <DialogDescription className="m-0 mt-0.5 text-[13px]">Отбор применяется сразу, поверх поиска.</DialogDescription>
                        </div>
                        <DialogPrimitive.Close asChild>
                            <Button variant="ghost" size="icon" className="-mr-1.5 size-8 rounded-lg text-muted-foreground hover:text-foreground" aria-label="Закрыть">
                                <X className="size-4" />
                            </Button>
                        </DialogPrimitive.Close>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
                        <div className="grid gap-4">
                            {field(isArchive ? 'Контрагент' : 'Заказчик', fields.company)}
                            {!isArchive && field('Исполнитель', fields.forwarder)}
                            {!isArchive && field('Экспедитор', fields.expeditor)}
                            {field('Водитель', fields.driver)}
                            {!isArchive && field('Статус', fields.status)}
                            <div className="grid grid-cols-2 gap-3">
                                {field('Откуда', fields.from)}
                                {field('Куда', fields.to)}
                            </div>

                            <div className="h-px bg-border" />

                            {/* Какую дату считать — рядом, а не решено за человека:
                                бухгалтер закрывает месяц по погрузке, логист ищет
                                свежие заявки по дате заведения. */}
                            <div className="grid gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Период</span>
                                <div role="radiogroup" aria-label="По какой дате отбирать" className="flex rounded-lg bg-muted p-0.5">
                                    {([['pickup', 'По погрузке'], ['created', 'По заведению']] as const).map(([v, label]) => (
                                        <button
                                            key={v}
                                            type="button"
                                            role="radio"
                                            aria-checked={period.field === v}
                                            onClick={() => period.setField(v)}
                                            className={cn(
                                                'h-7 flex-1 cursor-pointer rounded-md text-[13px] [font-family:inherit] transition-colors',
                                                period.field === v ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="grid gap-1 text-xs text-muted-foreground">
                                        с
                                        <Input type="date" aria-label="Дата с" value={date(period.from)} onChange={(e) => period.setFrom(e.target.value ? dayjs(e.target.value) : null)} className="h-8 rounded-lg text-[13px] text-foreground md:text-[13px]" />
                                    </label>
                                    <label className="grid gap-1 text-xs text-muted-foreground">
                                        по
                                        <Input type="date" aria-label="Дата по" value={date(period.to)} onChange={(e) => period.setTo(e.target.value ? dayjs(e.target.value) : null)} className="h-8 rounded-lg text-[13px] text-foreground md:text-[13px]" />
                                    </label>
                                </div>
                            </div>

                            <div className="h-px bg-border" />

                            <div className="grid gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Ставка заказчика, ₸</span>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input type="number" inputMode="numeric" min={0} placeholder="от" aria-label="Сумма от" value={sum.min ?? ''} onChange={(e) => sum.setMin(num(e.target.value))} className="h-8 rounded-lg text-[13px] tabular-nums md:text-[13px]" />
                                    <Input type="number" inputMode="numeric" min={0} placeholder="до" aria-label="Сумма до" value={sum.max ?? ''} onChange={(e) => sum.setMax(num(e.target.value))} className="h-8 rounded-lg text-[13px] tabular-nums md:text-[13px]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border-0 border-t border-solid border-border px-5 py-4">
                        <Button variant="outline" size="sm" className="h-9 rounded-lg text-[13px] font-normal" onClick={onReset}>Сбросить</Button>
                        <Button size="sm" className="h-9 rounded-lg text-[13px]" onClick={() => onOpenChange(false)}>
                            Показать {shown} {plural(shown, 'заявку', 'заявки', 'заявок')}
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
