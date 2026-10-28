'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { exchangeStatus, откликИзменён, ценаИзменена, type IncomingOffer } from '@/lib/exchange';
import { moneyShort } from '@/lib/money-format';
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
 * возвращении в окно. Без биржи не спрашиваем вовсе.
 */

const POLL_MS = 60_000;
const seenKey = (userId: string, companyId: string) => `lc_offers_seen:${userId}:${companyId}`;

type FeedState = {
    offers: IncomingOffer[];
    /** Список пришёл с сервера хотя бы раз — до этого пустой список ничего не значит. */
    loaded: boolean;
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
    loaded: false,
    seenAt: '',
    previousSeenAt: '',
    load: async () => {
        try {
            const s = await exchangeStatus();
            if (!s.enabled) { set({ offers: [], loaded: true }); return; }
            const { data } = await api.get<IncomingOffer[]>('/exchange/incoming-offers');
            set({ offers: data || [], seenAt: readSeen(), loaded: true });
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

/** Сколько висит уведомление об отклике: новость, ради которой человек ждёт, — не четыре секунды. */
const TOAST_MS = 15_000;

/** Отклик словами для всплывающего уведомления: кто, за сколько, куда. */
const откликКратко = (o: IncomingOffer) => `${o.name} · ${moneyShort(o.price)} · ${o.from} → ${o.to}`;

/**
 * Запустить опрос — один раз, в оболочке кабинета.
 *
 * Новый отклик — ещё и всплывающим уведомлением внизу экрана (владелец,
 * 29.10.2026: «есть только значок, а всплывающего уведомления нет»). При
 * входе в кабинет — одно общее про непросмотренные, дальше — про каждый
 * новый или изменённый отклик, с кнопкой «Открыть».
 */
export function useOffersFeedPolling() {
    const router = useRouter();
    const companyId = useAuthStore((s) => (s.user as { companyId?: string | null } | null)?.companyId ?? null);
    const offers = useOffersFeed((s) => s.offers);
    const loaded = useOffersFeed((s) => s.loaded);
    /** Отклики, о которых уже сказали: id → когда менялся. null — первый список ещё не пришёл. */
    const known = useRef<Map<string, string> | null>(null);

    // Сменили компанию — её отклики не «новые»: ждём первый список заново.
    useEffect(() => {
        known.current = null;
        useOffersFeed.setState({ offers: [], loaded: false });
    }, [companyId]);

    useEffect(() => {
        if (!loaded || !companyId) return;
        const now = new Map(offers.map((o) => [o.id, откликИзменён(o)]));
        if (!known.current) {
            known.current = now;
            const { seenAt } = useOffersFeed.getState();
            const unseen = offers.filter((o) => !seenAt || откликИзменён(o) > seenAt);
            const flag = `lc_offers_toasted:${companyId}`;
            let toasted = false;
            try { toasted = sessionStorage.getItem(flag) === '1'; sessionStorage.setItem(flag, '1'); } catch { /* приватное окно */ }
            if (unseen.length && !toasted) {
                toast(unseen.length === 1 ? `Новый отклик на заявку №${unseen[0].orderNumber}` : `Новые отклики на ваши заявки: ${unseen.length}`, {
                    description: unseen.length === 1 ? откликКратко(unseen[0]) : 'Откройте предложения, чтобы выбрать исполнителя',
                    duration: TOAST_MS,
                    action: {
                        label: 'Открыть',
                        onClick: () => router.push(unseen.length === 1 ? `/company/orders/${unseen[0].orderId}?tab=offers` : '/company/exchange?tab=offers'),
                    },
                });
            }
            return;
        }
        const fresh = offers.filter((o) => {
            const before = known.current?.get(o.id);
            return !before || откликИзменён(o) > before;
        });
        known.current = now;
        if (fresh.length > 3) {
            toast(`Новые отклики на ваши заявки: ${fresh.length}`, {
                description: 'Откройте предложения, чтобы выбрать исполнителя',
                duration: TOAST_MS,
                action: { label: 'Открыть', onClick: () => router.push('/company/exchange?tab=offers') },
            });
            return;
        }
        for (const o of fresh) {
            toast(ценаИзменена(o) ? `Отклик на заявку №${o.orderNumber}: новая цена` : `Новый отклик на заявку №${o.orderNumber}`, {
                description: откликКратко(o),
                duration: TOAST_MS,
                action: { label: 'Открыть', onClick: () => router.push(`/company/orders/${o.orderId}?tab=offers`) },
            });
        }
    }, [offers, loaded, companyId, router]);

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
