'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { ORDER_STATUS_LABELS } from '@/lib/vocabulary';
import { STATUS_PILL } from '@/components/ui/StatusPill';
import { cn } from '@/lib/utils';

/**
 * История рейса: кто что сделал и когда.
 *
 * Раньше на этой вкладке были только смены статуса, и даже они — без автора.
 * Вопрос «кто вложил этот документ» ответа не имел нигде. Теперь смены
 * статуса и действия людей идут одной лентой, сверху свежее.
 *
 * Плотно намеренно: строка на событие. История — то, что просматривают
 * глазами сверху вниз в поисках одной записи, и разгонять её карточками
 * значит заставлять человека листать.
 */

type Entry =
    | {
        kind: 'STATUS';
        at: string;
        status: string;
        comment?: string | null;
        userName?: string | null;
    }
    | {
        kind: 'ACTION';
        at: string;
        action: string;
        entity: string;
        label?: string | null;
        details?: any;
        userName?: string | null;
        userRole?: string | null;
    };

/** Человеческая подпись действия: что именно сделали. */
function actionTitle(entry: Extract<Entry, { kind: 'ACTION' }>): string {
    const { action, entity, label } = entry;

    if (entity === 'document') return `Вложен документ · ${label || 'файл'}`;
    if (entity === 'order_document') return `Сформирован документ · ${label || ''}`.trim();
    if (entity === 'order') {
        if (action === 'CREATE') return 'Заявка создана';
        if (action === 'UPDATE') return 'Заявка изменена';
        if (action === 'STATUS') return 'Статус изменён';
        if (action === 'DELETE') return 'Заявка удалена';
    }
    return label || `${entity} · ${action}`;
}

/** Денежные правки показываем прямо в строке — это самый частый предмет спора. */
function actionDetails(entry: Extract<Entry, { kind: 'ACTION' }>): string | null {
    const d = entry.details;
    if (!d || typeof d !== 'object') return null;

    const money: string[] = [];
    if (d.customerPrice != null) money.push(`заказчику ${Number(d.customerPrice).toLocaleString('ru-RU')} ₸`);
    if (d.driverCost != null) money.push(`исполнителю ${Number(d.driverCost).toLocaleString('ru-RU')} ₸`);
    if (d.subForwarderPrice != null) money.push(`перевозчику ${Number(d.subForwarderPrice).toLocaleString('ru-RU')} ₸`);
    if (money.length) return money.join(' · ');

    if (typeof d.comment === 'string' && d.comment) return d.comment;
    return null;
}

export default function OrderHistory({ orderId }: { orderId: string }) {
    const [items, setItems] = useState<Entry[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        api.get(`/orders/${orderId}/history`)
            .then((res) => { if (alive) setItems(res.data || []); })
            // Молча пустой экран здесь недопустим: пустая история и не
            // загрузившаяся история выглядят одинаково, а значат разное.
            .catch((e) => {
                if (alive) setError(e.response?.data?.message || 'Не удалось загрузить историю');
            });
        return () => { alive = false; };
    }, [orderId]);

    if (error) {
        return (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-[13px] text-destructive">
                {error}
            </div>
        );
    }

    if (items === null) {
        return <div className="p-4 text-[13px] text-muted-foreground">Загружаем историю…</div>;
    }

    if (!items.length) {
        return <div className="p-4 text-[13px] text-muted-foreground">По этому рейсу пока ничего не происходило.</div>;
    }

    return (
        <div className="divide-y divide-border">
            {items.map((entry, i) => {
                const time = dayjs(entry.at);
                const isStatus = entry.kind === 'STATUS';
                const pill = isStatus ? STATUS_PILL[entry.status] : null;

                return (
                    <div key={i} className="flex items-baseline gap-3 py-2 text-[13px]">
                        <span className="w-[104px] shrink-0 tabular-nums text-muted-foreground">
                            {time.format('DD.MM.YY HH:mm')}
                        </span>

                        <span className="min-w-0 flex-1">
                            {isStatus ? (
                                <span
                                    className="mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                                    style={pill ? { background: pill.bg, color: pill.fg } : undefined}
                                >
                                    {ORDER_STATUS_LABELS[entry.status] || entry.status}
                                </span>
                            ) : (
                                <span className="text-foreground">{actionTitle(entry)}</span>
                            )}

                            {(() => {
                                const extra = isStatus ? entry.comment : actionDetails(entry);
                                return extra ? (
                                    <span className="text-muted-foreground"> — {extra}</span>
                                ) : null;
                            })()}
                        </span>

                        <span className={cn('shrink-0 text-right text-muted-foreground', !entry.userName && 'italic')}>
                            {entry.userName || 'система'}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
