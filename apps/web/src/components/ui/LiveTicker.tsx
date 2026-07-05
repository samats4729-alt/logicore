'use client';

import { STATUS_LABELS, STATUS_PILL } from './StatusPill';

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
