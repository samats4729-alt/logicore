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

function cityOf(order: any, type: 'pickup' | 'delivery'): string {
    const pts = order?.routePoints || [];
    let loc: any;
    if (type === 'pickup') {
        loc = pts.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP')?.location;
    } else {
        const dels = pts.filter((p: any) => p.pointType === 'DELIVERY');
        loc = dels.length ? dels[dels.length - 1].location : undefined;
    }
    if (loc?.city) return loc.city;
    if (loc?.address) {
        const m = loc.address.match(/г\.\s*([^,]+)/);
        if (m?.[1]) return m[1].trim();
    }
    return loc?.name || '';
}

/** Собирает элементы тикера из списка заявок (v1; живые события — этап 5 плана) */
export function buildOrderTickerItems(orders: any[], limit = 10): TickerItem[] {
    return (orders || []).slice(0, limit).map((o: any) => {
        const from = cityOf(o, 'pickup');
        const to = cityOf(o, 'delivery');
        return {
            num: o.orderNumber,
            text: `${STATUS_LABELS[o.status] || o.status}${from && to ? ` · ${from} → ${to}` : ''}`,
            color: (STATUS_PILL[o.status] || STATUS_PILL.DRAFT).fg,
        };
    });
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
                // эндпоинт не готов или нет данных — молча
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

/** Простой тикер (без хука) — принимает готовые TickerItem[] */
export default function LiveTicker({ items }: { items: TickerItem[] }) {
    if (!items || items.length === 0) return null;
    return (
        <div className="lc2-ticker" aria-hidden="true">
            <div className="lc2-ticker-track">
                {[...items, ...items].map((t, i) => (
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