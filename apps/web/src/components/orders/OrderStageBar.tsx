'use client';

import { Check } from 'lucide-react';
import { STATUS_CHAIN } from '@/lib/order-status';
import { ORDER_STATUS_LABELS } from '@/lib/vocabulary';
import { cn } from '@/lib/utils';

/**
 * Полоса этапов рейса — как в макете «LogiCore на shadcn Nova»
 * (владелец, 08.10.2026): назначен → едет на погрузку → … → завершён.
 *
 * Только показ: где рейс сейчас и что уже позади. Менять статус — кнопкой
 * «Изменить статус» в шапке, как и раньше.
 *
 * Пока исполнителя нет (ждёт), все этапы впереди. У отменённого рейса
 * полосы нет — этапов у него не будет. «Проблема» — не этап, а состояние:
 * полоса тогда показывает пройденное до неё без текущего шага.
 */
export function OrderStageBar({ status }: { status: string }) {
    if (status === 'CANCELLED' || status === 'DRAFT') return null;
    const current = STATUS_CHAIN.indexOf(status);
    const done = status === 'COMPLETED' ? STATUS_CHAIN.length : current;

    return (
        <ol
            aria-label="Этапы рейса"
            className="m-0 mb-4 grid list-none gap-2 rounded-2xl border border-solid border-border bg-card p-3 shadow-sm"
            style={{ gridTemplateColumns: `repeat(${STATUS_CHAIN.length}, minmax(0, 1fr))` }}
        >
            {STATUS_CHAIN.map((stage, i) => {
                const passed = i < done;
                const now = i === current && status !== 'COMPLETED';
                return (
                    <li key={stage} className="grid min-w-0 gap-1.5" aria-current={now ? 'step' : undefined}>
                        <span className={cn('h-1 rounded-full', passed || now ? 'bg-foreground' : 'bg-muted')} />
                        <span className={cn(
                            'flex min-w-0 items-center gap-1 truncate text-[12px]',
                            now ? 'font-semibold text-foreground' : passed ? 'text-foreground' : 'text-muted-foreground',
                        )}>
                            {passed
                                ? <Check className="size-3 shrink-0" />
                                : <span className={cn('size-2 shrink-0 rounded-full', now ? 'bg-foreground' : 'border border-solid border-muted-foreground/40')} />}
                            <span className="truncate">{ORDER_STATUS_LABELS[stage] || stage}</span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
