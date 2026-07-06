'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABELS, STATUS_PILL } from './StatusPill';

// --- Типы ---
export interface TickerItem {
    num: string;
    text: string;
    color: string;
}

interface OrderEvent {
    orderId: string;
    orderNumber: string;
    status: string;
    changedAt: string;
}

/** Преобразует события с бэкенда в элементы тикера */
export function buildEventTickerItems(events: OrderEvent[]): TickerItem[] {
    return (events || []).map((e) => ({
        num: e.orderNumber,
        text: `${STATUS_LABELS[e.status] || e.status}`,
        color: (STATUS_PILL[e.status] || STATUS_PILL.DRAFT).fg,
    }));
}

/** Хук: опрашивает GET /company/orders/events раз в 60 секунд */
export function useOrderEvents(pollMs = 60000): { items: TickerItem[]; loading: boolean } {
    const [items, setItems] = useState<TickerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        let timer: ReturnType<typeof setTimeout>;

        const fetchEvents = async () => {
            try {
                const res = await api.get('/company/orders/events', { params: { limit: 15 } });
                if (mountedRef.current) {
                    setItems(buildEventTickerItems(res.data));
                    setLoading(false);
                }
            } catch {
                if (mountedRef.current) setLoading(false);
            }
        };

        fetchEvents();
        timer = setInterval(fetchEvents, pollMs);

        return () => {
            mountedRef.current = false;
            clearInterval(timer);
        };
    }, [pollMs]);

    return { items, loading };
}

/** Тикер v2 — автономно опрашивает бэкенд, не требуя списка заявок */
export function LiveEventTicker({ fallback = [] }: { fallback?: TickerItem[] }) {
    const { items } = useOrderEvents(60000);
    const shown = items.length > 0 ? items : fallback;
    if (shown.length === 0) return null;
    return (
        <div className="lc2-ticker" aria-hidden="true">
            <div className="lc2-ticker-track">
                {[...shown, ...shown].map((t, i) => (
                    <span className="lc2-tick" key={i}>
                        <i style={{ background: t.color }} />
                        <b>{t.num}</b>
                        <span>{t.text}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}
