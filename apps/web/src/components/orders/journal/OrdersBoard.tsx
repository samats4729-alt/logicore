'use client';

import dayjs from 'dayjs';
import { ArrowRight } from 'lucide-react';
import StatusPill from '@/components/ui/StatusPill';
import { shortenCompanyName } from '@/lib/company-helper';
import { cn } from '@/lib/utils';
import type { JournalOrder as Order } from './types';

/**
 * «Доска» — второй вид журнала из макета: колонки по этапам рейса, заявки
 * карточками. Видно, где сколько машин и что застряло.
 *
 * Колонки — как в макете; проблема едет вместе с «В пути» и выделяется
 * плашкой на карточке.
 */
const LANES = [
    { title: 'Ждут исполнителя', statuses: ['PENDING', 'DRAFT'] },
    { title: 'Назначены', statuses: ['ASSIGNED', 'EN_ROUTE_PICKUP'] },
    { title: 'Погрузка', statuses: ['AT_PICKUP', 'LOADING'] },
    { title: 'В пути', statuses: ['IN_TRANSIT', 'PROBLEM'] },
    { title: 'Выгрузка', statuses: ['AT_DELIVERY', 'UNLOADING'] },
    { title: 'Завершены', statuses: ['COMPLETED'] },
] as const;

export function OrdersBoard({ rows, loading, extractCity, onPreview, height }: {
    rows: Order[];
    loading?: boolean;
    extractCity: (order: Order, type: 'pickup' | 'delivery') => string;
    onPreview: (order: Order) => void;
    height?: number;
}) {
    return (
        <div className="min-w-0 overflow-x-auto pb-1" style={height ? { height } : undefined} data-orders-board>
            <div className="grid h-full min-w-[1200px] grid-cols-6 gap-3">
                {LANES.map((lane) => {
                    const list = rows.filter((o) => (lane.statuses as readonly string[]).includes(o.status));
                    return (
                        <section key={lane.title} aria-label={lane.title} className="flex min-h-0 flex-col rounded-lg border border-solid border-border bg-muted/40">
                            <div className="flex items-center justify-between px-3 py-2">
                                <span className="text-xs font-medium">{lane.title}</span>
                                <span className="rounded-md bg-secondary px-1.5 text-[11px] tabular-nums text-secondary-foreground">{list.length}</span>
                            </div>
                            <div className="grid min-h-0 flex-1 content-start gap-2 overflow-auto px-2 pb-2">
                                {loading && !rows.length && [0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-md bg-muted" />)}
                                {list.map((o) => {
                                    const pickup = (o.routePoints?.find((p) => p.pointType === 'PICKUP') as any)?.expectedDate;
                                    const cargo = [o.natureOfCargo, o.cargoType].filter(Boolean).join(' · ') || o.cargoDescription;
                                    return (
                                        <button
                                            key={o.id}
                                            type="button"
                                            data-board-card={o.id}
                                            onClick={() => onPreview(o)}
                                            className={cn(
                                                'cursor-pointer rounded-md border border-solid border-border bg-card p-2.5 text-left text-[12.5px] text-foreground shadow-sm [font-family:inherit] transition-colors hover:bg-accent',
                                                o.status === 'PROBLEM' && 'border-red-300 dark:border-red-900',
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium tabular-nums">{o.orderNumber}</span>
                                                <span className="text-[11px] tabular-nums text-muted-foreground">{pickup ? dayjs(pickup).format('DD.MM') : ''}</span>
                                            </div>
                                            <div className="mt-1 flex min-w-0 items-center gap-1 font-medium">
                                                <span className="truncate">{extractCity(o, 'pickup') || '?'}</span>
                                                <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                                                <span className="truncate">{extractCity(o, 'delivery') || '?'}</span>
                                            </div>
                                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{shortenCompanyName(o.customerCompany?.name || '') || '—'}</div>
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                {o.status === 'PROBLEM'
                                                    ? <StatusPill status={o.status} />
                                                    : <span className="min-w-0 truncate text-[11px] text-muted-foreground">{cargo || ''}</span>}
                                                <span className="shrink-0 text-[11px] font-medium tabular-nums">{o.customerPrice ? `${o.customerPrice.toLocaleString('ru-RU')} ₸` : ''}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                                {!loading && list.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Пусто</div>}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
