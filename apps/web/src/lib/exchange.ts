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
    takenAt: string | null;
    loadedAt: string | null;
    deliveredAt: string | null;
    /** Кто везёт — как только водитель нажал «Беру». */
    driver: {
        lastName: string | null;
        firstName: string | null;
        middleName: string | null;
        phone: string | null;
        kind: 'IP' | 'PARK' | null;
        vehiclePlate: string | null;
        vehicleBodyType: string | null;
        park: { name: string } | null;
    } | null;
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

export interface ExchangeStatus {
    /** Биржа включена на сервере. */
    enabled: boolean;
    /** Компания — парк: у неё есть раздел «Водители биржи». */
    isPark: boolean;
}

/**
 * Включена ли биржа и парк ли компания. Спрашиваем один раз за сессию:
 * вкладка в меню не должна мигать при каждом переходе.
 */
let statusRequest: Promise<ExchangeStatus> | null = null;
export function exchangeStatus(): Promise<ExchangeStatus> {
    if (!statusRequest) {
        statusRequest = api.get('/exchange/status')
            .then((r) => ({ enabled: !!r.data?.enabled, isPark: !!r.data?.isPark }))
            .catch(() => {
                statusRequest = null;
                return { enabled: false, isPark: false };
            });
    }
    return statusRequest;
}

export function exchangeEnabled(): Promise<boolean> {
    return exchangeStatus().then((s) => s.enabled);
}

// ==================== водители биржи ====================

export type DriverDocumentKind =
    'ID_FRONT' | 'ID_BACK' | 'SELFIE_WITH_ID' | 'LICENSE' | 'VEHICLE_REGISTRATION' | 'POWER_OF_ATTORNEY' | 'IP_CERTIFICATE';

/** Подписи фото — те же слова, что видит водитель в приложении. */
export const DRIVER_DOCUMENT_TITLES: Record<DriverDocumentKind, string> = {
    ID_FRONT: 'Удостоверение — лицевая сторона',
    ID_BACK: 'Удостоверение — обратная сторона',
    SELFIE_WITH_ID: 'Фото с удостоверением в руке',
    LICENSE: 'Водительское удостоверение',
    VEHICLE_REGISTRATION: 'Техпаспорт',
    POWER_OF_ATTORNEY: 'Доверенность от владельца машины',
    IP_CERTIFICATE: 'Документ о регистрации ИП',
};

export interface ExchangeDriver {
    id: string;
    kind: 'IP' | 'PARK' | null;
    status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
    park: { id: string; name: string } | null;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    iin: string | null;
    phone: string | null;
    email: string | null;
    ipName: string | null;
    ipIin: string | null;
    vehiclePlate: string | null;
    vehicleBodyType: string | null;
    vehicleCapacityKg: number | null;
    vehicleIsOwn: boolean;
    contractSignedAt: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectReason: string | null;
    blockedAt: string | null;
    blockedReason: string | null;
    tripsCompleted: number;
    createdAt: string;
    documents: { id: string; kind: DriverDocumentKind; fileName: string; mimeType: string; createdAt: string }[];
    missing: string[];
}

export type ParkDriverFilter = 'pending' | 'approved' | 'rejected' | 'blocked' | 'all';

export interface ParkDriverList {
    drivers: ExchangeDriver[];
    counts: Record<ParkDriverFilter, number>;
}

/** «Сериков Серик Серикович» — или «без имени», если анкета пустая. */
export function фиоВодителя(d: Pick<ExchangeDriver, 'lastName' | 'firstName' | 'middleName'>): string {
    return [d.lastName, d.firstName, d.middleName].filter(Boolean).join(' ') || 'Без имени';
}

/** «900101 300123» — ИИН читается группами. */
export function иинКрасиво(iin: string | null): string {
    return iin ? `${iin.slice(0, 6)} ${iin.slice(6)}` : '—';
}
