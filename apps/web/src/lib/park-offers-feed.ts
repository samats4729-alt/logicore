'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { exchangeStatus, день, type ParkOffer } from '@/lib/exchange';
import { moneyShort } from '@/lib/money-format';
import { useAuthStore } from '@/store/auth';

/**
 * Отклики водителей парка — для колокольчика и всплывающих уведомлений
 * (владелец, 29.10.2026: «не приходят уведомления, что водитель откликнулся
 * на заявку»).
 *
 * Парк узнаёт сразу: водитель откликнулся, его выбрали (рейс появился в
 * «Рейсах водителей») или выбрали другого. Опрос — раз в минуту и при
 * возвращении в окно, только у парка. «Просмотрено» — отметка в браузере,
 * как у откликов заказчика (`offers-feed.ts`).
 */

const POLL_MS = 60_000;
/** Сколько висит уведомление: новость, ради которой ждут, — не четыре секунды. */
const TOAST_MS = 15_000;
const OFFERS_PAGE = '/company/park/trips?status=offers';
const seenKey = (userId: string, companyId: string) => `lc_park_offers_seen:${userId}:${companyId}`;

type ParkFeedState = {
    offers: ParkOffer[];
    loaded: boolean;
    seenAt: string;
    load: () => Promise<void>;
    markSeen: () => void;
};

function whoKey(): string | null {
    const user = useAuthStore.getState().user as { id?: string; companyId?: string | null } | null;
    return user?.id && user.companyId ? seenKey(user.id, user.companyId) : null;
}

export const useParkOffersFeed = create<ParkFeedState>((set) => ({
    offers: [],
    loaded: false,
    seenAt: '',
    load: async () => {
        try {
            const s = await exchangeStatus();
            if (!s.enabled || !s.isPark) { set({ offers: [], loaded: true }); return; }
            const { data } = await api.get<ParkOffer[]>('/exchange/park/offers');
            const key = whoKey();
            let seenAt = '';
            try { seenAt = (key && localStorage.getItem(key)) || ''; } catch { /* приватное окно */ }
            set({ offers: data || [], loaded: true, seenAt });
        } catch {
            /* нет связи — покажем, что было; следующий опрос через минуту */
        }
    },
    markSeen: () => {
        const now = new Date().toISOString();
        const key = whoKey();
        try { if (key) localStorage.setItem(key, now); } catch { /* приватное окно */ }
        set({ seenAt: now });
    },
}));

/** Что случилось с откликом — заголовком уведомления. */
function событие(o: ParkOffer, before?: ParkOffer): string | null {
    if (!before) return o.status === 'ACTIVE' ? `${o.driverName} откликнулся на заявку №${o.orderNumber}` : null;
    if (before.status === o.status) return null;
    if (o.status === 'ACCEPTED') return `${o.driverName} выбран на заявку №${o.orderNumber}`;
    if (o.status === 'REJECTED') return `Заявка №${o.orderNumber}: выбран другой исполнитель`;
    return null;
}

const подробно = (o: ParkOffer) => `${o.from} → ${o.to} · погрузка ${день(o.loadingDate)} · ${moneyShort(o.price)}`;

/** Запустить опрос — один раз, в оболочке кабинета; у не-парка ничего не делает. */
export function useParkOffersPolling() {
    const router = useRouter();
    const companyId = useAuthStore((s) => (s.user as { companyId?: string | null } | null)?.companyId ?? null);
    const offers = useParkOffersFeed((s) => s.offers);
    const loaded = useParkOffersFeed((s) => s.loaded);
    const known = useRef<Map<string, ParkOffer> | null>(null);

    useEffect(() => {
        known.current = null;
        useParkOffersFeed.setState({ offers: [], loaded: false });
        if (!companyId) return;
        const load = () => useParkOffersFeed.getState().load();
        load();
        const timer = setInterval(load, POLL_MS);
        const onFocus = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onFocus);
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onFocus);
            window.removeEventListener('focus', onFocus);
        };
    }, [companyId]);

    useEffect(() => {
        if (!loaded || !companyId) return;
        const now = new Map(offers.map((o) => [o.id, o]));
        if (!known.current) {
            known.current = now;
            // При входе — одно общее про то, что пришло без нас.
            const { seenAt } = useParkOffersFeed.getState();
            const unseen = offers.filter((o) => o.status === 'ACTIVE' && (!seenAt || o.updatedAt > seenAt));
            const flag = `lc_park_offers_toasted:${companyId}`;
            let toasted = false;
            try { toasted = sessionStorage.getItem(flag) === '1'; sessionStorage.setItem(flag, '1'); } catch { /* приватное окно */ }
            if (unseen.length && !toasted) {
                toast(`Водители откликнулись на заявки: ${unseen.length}`, {
                    description: 'Отклики — в «Рейсах водителей»',
                    duration: TOAST_MS,
                    action: { label: 'Открыть', onClick: () => router.push(OFFERS_PAGE) },
                });
            }
            return;
        }
        const events = offers
            .map((o) => ({ o, title: событие(o, known.current?.get(o.id)) }))
            .filter((e): e is { o: ParkOffer; title: string } => !!e.title);
        known.current = now;
        for (const { o, title } of events.slice(0, 3)) {
            toast(title, {
                description: o.status === 'ACCEPTED' ? 'Рейс появился в «Рейсах водителей»' : подробно(o),
                duration: TOAST_MS,
                action: { label: 'Открыть', onClick: () => router.push(o.status === 'ACCEPTED' ? '/company/park/trips' : OFFERS_PAGE) },
            });
        }
    }, [offers, loaded, companyId, router]);
}
