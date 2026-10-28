'use client';

import { useEffect } from 'react';
import dayjs from 'dayjs';
import type { ParkOffer } from '@/lib/exchange';
import { useParkOffersFeed } from '@/lib/park-offers-feed';

const STATUS: Record<ParkOffer['status'], string> = {
    ACTIVE: 'ждёт решения',
    ACCEPTED: 'водитель выбран',
    REJECTED: 'выбран другой',
    WITHDRAWN: 'отозван',
};

/** Сколько откликов водителей изменилось после последнего открытия колокольчика — для точки на нём. */
export function useNewParkOffers(lastSeen: string | null): number {
    return useParkOffersFeed((s) => s.offers.filter((o) => !lastSeen || o.updatedAt > lastSeen).length);
}

/**
 * Отклики водителей парка в колокольчике (владелец, 29.10.2026): кто
 * откликнулся, на какую заявку и что решила компания. Только у парка.
 */
export function ParkOffersBellSection({ onNavigate }: { onNavigate: (href: string) => void }) {
    const offers = useParkOffersFeed((s) => s.offers);
    const seenAt = useParkOffersFeed((s) => s.seenAt);
    // Колокольчик открыли — отклики просмотрены (точка на нём гаснет до следующего).
    useEffect(() => () => useParkOffersFeed.getState().markSeen(), []);
    if (!offers.length) return null;
    const waiting = offers.filter((o) => o.status === 'ACTIVE').length;

    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '6px 8px 4px' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--nova-fg-3)', textTransform: 'uppercase' }}>
                    Отклики водителей{waiting > 0 ? ` · ждут решения ${waiting}` : ''}
                </span>
                <button
                    type="button"
                    onClick={() => onNavigate('/company/park/trips?status=offers')}
                    style={{ fontSize: 12, color: 'var(--nova-fg-2)', background: 'none', border: 0, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                    Все отклики
                </button>
            </div>
            {offers.slice(0, 5).map((o) => {
                const fresh = !seenAt || o.updatedAt > seenAt;
                return (
                    <div
                        key={o.id}
                        onClick={() => onNavigate(o.status === 'ACCEPTED' ? '/company/park/trips' : '/company/park/trips?status=offers')}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', borderRadius: 8, transition: 'background 0.12s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--nova-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        <i style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: fresh ? 'var(--nova-accent)' : 'transparent' }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <b style={{ fontWeight: 600 }}>{o.driverName}</b> — заявка №{o.orderNumber}
                            </span>
                            <span style={{ display: 'block', fontSize: 12, color: 'var(--nova-fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {STATUS[o.status]} · {o.from} → {o.to}
                            </span>
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--nova-fg-3)', whiteSpace: 'nowrap' }}>
                            {dayjs(o.updatedAt).format('DD.MM HH:mm')}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
