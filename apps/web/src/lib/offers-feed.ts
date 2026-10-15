'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { exchangeStatus, откликИзменён, type IncomingOffer } from '@/lib/exchange';
import { useAuthStore } from '@/store/auth';

/**
 * Новые отклики на свои заявки на бирже — один счётчик на весь кабинет
 * (владелец, 15.10.2026: «я в отчётах или на дашборде — у „Заявок“ должен
 * быть значок с цифрой, внутри у „Биржи“ тоже, а там подсвечены сами
 * предложения»).
 *
 * «Новые» — пришедшие после того, как человек последний раз открыл
 * «Предложения» или колокольчик. Отметка живёт в браузере: сервер о
 * «прочитано» не знает, да ему и незачем. Опрос — раз в минуту и сразу при
 * возвращении в окно. Без биржи и у парка не спрашиваем вовсе.
 */

const POLL_MS = 60_000;
const seenKey = (userId: string, companyId: string) => `lc_offers_seen:${userId}:${companyId}`;

type FeedState = {
    offers: IncomingOffer[];
    /** Когда человек последний раз смотрел предложения (ISO). Пусто — ещё ни разу. */
    seenAt: string;
    /** Отметка, которая была до последнего просмотра, — по ней подсвечиваем новые на экране. */
    previousSeenAt: string;
    load: () => Promise<void>;
    markSeen: () => void;
};

function whoKey(): string | null {
    const user = useAuthStore.getState().user as { id?: string; companyId?: string | null } | null;
    return user?.id && user.companyId ? seenKey(user.id, user.companyId) : null;
}

function readSeen(): string {
    const key = whoKey();
    if (!key) return '';
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

export const useOffersFeed = create<FeedState>((set, get) => ({
    offers: [],
    seenAt: '',
    previousSeenAt: '',
    load: async () => {
        try {
            const s = await exchangeStatus();
            if (!s.enabled || s.isPark) { set({ offers: [] }); return; }
            const { data } = await api.get<IncomingOffer[]>('/exchange/incoming-offers');
            set({ offers: data || [], seenAt: readSeen() });
        } catch {
            /* нет связи — покажем, что было; следующий опрос через минуту */
        }
    },
    markSeen: () => {
        const now = new Date().toISOString();
        const key = whoKey();
        try { if (key) localStorage.setItem(key, now); } catch { /* приватное окно — переживём */ }
        set({ previousSeenAt: get().seenAt, seenAt: now });
    },
}));

/**
 * Сколько новых откликов. Новый — пришёл или изменился (водитель поменял цену)
 * после последнего просмотра. До первого просмотра новыми считаются все ждущие решения.
 */
export function useNewOffersCount(): number {
    return useOffersFeed((s) => s.offers.filter((o) => !s.seenAt || откликИзменён(o) > s.seenAt).length);
}

/** Запустить опрос — один раз, в оболочке кабинета. */
export function useOffersFeedPolling() {
    const companyId = useAuthStore((s) => (s.user as { companyId?: string | null } | null)?.companyId ?? null);
    useEffect(() => {
        if (!companyId) return;
        const load = () => useOffersFeed.getState().load();
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
}
