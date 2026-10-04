import dayjs from 'dayjs';
import { api } from '@/lib/api';

/** Груз на бирже — как его отдаёт сервер. */
export interface ExchangeLoad {
    id: string;
    number: string;
    status: 'OPEN' | 'TAKEN' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
    originCityId: string | null;
    originCityName: string;
    originAddress: string | null;
    destinationCityId: string | null;
    destinationCityName: string;
    destinationAddress: string | null;
    loadingDate: string;
    loadingTime: string | null;
    bodyType: string;
    cargoDescription: string;
    weightKg: number | null;
    volumeM3: number | null;
    requirements: string | null;
    price: number;
    cancelledAt: string | null;
    cancelReason: string | null;
    createdAt: string;
    createdByName: string | null;
    photos: { id: string; fileName: string; mimeType: string }[];
}

export type ExchangeFilter = 'active' | 'done' | 'cancelled' | 'all';

export interface ExchangeList {
    loads: ExchangeLoad[];
    counts: Record<ExchangeFilter, number>;
}

/** Прошлая перевозка по направлению — биржа или свой рейс. */
export interface PastPrice {
    number?: string;
    orderNumber?: string;
    date: string;
    price: number;
    bodyType: string | null;
    weightKg: number | null;
    own?: boolean;
}

export interface RoutePrices {
    exchange: PastPrice[];
    ownOrders: PastPrice[];
    summary: { count: number; min: number; max: number; median: number } | null;
}

/** Вес на экране — тоннами: «20 т», «1,5 т». Хранится в килограммах. */
export function тонн(kg: number | null | undefined): string | null {
    if (kg == null) return null;
    const t = kg / 1000;
    return `${t.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} т`;
}

const МЕСЯЦЫ = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * «12 окт, с 9 до 12» — день погрузки и время словами. Месяц пишем сами:
 * русской локали у dayjs в проекте нет, и `MMM` давал «Oct».
 */
export function когдаПогрузка(load: Pick<ExchangeLoad, 'loadingDate' | 'loadingTime'>): string {
    const d = dayjs(load.loadingDate.slice(0, 10));
    const day = `${d.date()} ${МЕСЯЦЫ[d.month()]}`;
    return load.loadingTime ? `${day}, ${load.loadingTime}` : day;
}

/** Строка груза: «Напитки · 20 т · 86 м³ · тент». */
export function грузКратко(load: Pick<ExchangeLoad, 'cargoDescription' | 'weightKg' | 'volumeM3' | 'bodyType'>): string {
    return [
        load.cargoDescription,
        тонн(load.weightKg),
        load.volumeM3 ? `${load.volumeM3} м³` : null,
        load.bodyType,
    ].filter(Boolean).join(' · ');
}

/**
 * Что ответил сервер — словами. Проверка полей приходит списком
 * («Укажите, откуда везти», «Выберите тип кузова»), его показываем целиком.
 */
export function ответСервера(error: any, fallback: string): string {
    const message = error?.response?.data?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string' && message) return message;
    return fallback;
}

/**
 * Включена ли биржа на сервере. Спрашиваем один раз за сессию: вкладка в
 * меню не должна мигать при каждом переходе.
 */
let enabledRequest: Promise<boolean> | null = null;
export function exchangeEnabled(): Promise<boolean> {
    if (!enabledRequest) {
        enabledRequest = api.get('/exchange/status')
            .then((r) => !!r.data?.enabled)
            .catch(() => {
                enabledRequest = null;
                return false;
            });
    }
    return enabledRequest;
}
