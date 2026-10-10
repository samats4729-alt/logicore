import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

/** Точка маршрута на бирже — только город и день: адрес откроется исполнителю. */
export interface ExchangePoint {
    type: 'PICKUP' | 'ADDITIONAL_PICKUP' | 'DELIVERY';
    city: string;
    region: string | null;
    date: string | null;
}

/** Заявка на бирже — как её видят другие компании и водители. */
export interface ExchangeOrder {
    id: string;
    orderNumber: string;
    /** Компания, которая ищет исполнителя. */
    companyName: string | null;
    from: string;
    to: string;
    loadingDate: string | null;
    points: ExchangePoint[];
    cargoDescription: string | null;
    weightKg: number | null;
    volumeM3: number | null;
    bodyType: string | null;
    natureOfCargo: string | null;
    palletCount: number | null;
    loadingTypes: string[];
    packagingTypes: string[];
    tempMin: number | null;
    tempMax: number | null;
    adr: boolean | null;
    adrClass: string | null;
    requirements: string | null;
    /** Цена, которую компания предлагает исполнителю. */
    price: number | null;
    note: string | null;
    publishedAt: string | null;
    /** Своя заявка (карточка биржи) — откликаться на неё незачем. */
    own?: boolean;
    /** Своя заявка с прошедшей погрузкой — её уже никто не видит. */
    stale?: boolean;
    /** Свой отклик на эту заявку: ждёт решения, выбрали, выбрали другого. */
    myOfferStatus?: OfferStatus | null;
    myOffer?: OwnOffer | null;
}

export type OfferStatus = 'ACTIVE' | 'WITHDRAWN' | 'ACCEPTED' | 'REJECTED';

/** Свой отклик — как его видит откликнувшийся. */
export interface OwnOffer {
    id: string;
    status: OfferStatus;
    price: number;
    agreed: boolean;
    readyDate: string | null;
    comment: string | null;
    updatedAt: string;
}

/** Отклик на свою заявку — кто, на чём, за сколько. */
export interface ExchangeOffer {
    id: string;
    status: OfferStatus;
    price: number;
    agreed: boolean;
    readyDate: string | null;
    comment: string | null;
    createdAt: string;
    kind: 'DRIVER_IP' | 'DRIVER_PARK' | 'COMPANY';
    name: string;
    phone: string | null;
    driver: {
        ipName: string | null;
        parkName: string | null;
        vehiclePlate: string | null;
        vehicleBodyType: string | null;
        vehicleCapacityKg: number | null;
        tripsCompleted: number;
        since: string;
    } | null;
    company: { name: string; bin: string | null } | null;
}

/** Биржа в карточке заявки: на бирже ли и можно ли выставить. */
export interface ExchangeOrderState {
    orderId: string;
    orderNumber: string;
    onExchange: boolean;
    canPublish: boolean;
    /** Почему выставить нельзя — словами. */
    reason: string | null;
    publishedAt: string | null;
    price: number | null;
    note: string | null;
    closedAt: string | null;
    closeReason: string | null;
    /** Откуда и куда — для подсказки «почём возили». */
    from: string | null;
    to: string | null;
    /** Сколько откликов ждут решения. */
    offersCount: number;
    /** Подсказка: сколько в заявке заложено перевозчику. */
    suggestedPrice: number | null;
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
 * «12 окт» — день словами. Месяц пишем сами: русской локали у dayjs в
 * проекте нет, и `MMM` давал «Oct».
 */
export function день(date: string | null | undefined): string {
    if (!date) return 'дата не указана';
    const d = dayjs(date);
    return `${d.date()} ${МЕСЯЦЫ[d.month()]}`;
}

/** Строка груза: «Напитки · 20 т · 86 м³ · тент». */
export function грузКратко(o: Pick<ExchangeOrder, 'cargoDescription' | 'weightKg' | 'volumeM3' | 'bodyType'>): string {
    return [
        o.cargoDescription,
        тонн(o.weightKg),
        o.volumeM3 ? `${o.volumeM3} м³` : null,
        o.bodyType,
    ].filter(Boolean).join(' · ') || '—';
}

/** Промежуточные точки: «через Тараз» / «ещё 2 точки» — маршрут длиннее двух городов. */
export function черезТочки(o: Pick<ExchangeOrder, 'points'>): string | null {
    const middle = o.points.slice(1, -1);
    if (!middle.length) return null;
    if (middle.length === 1) return `через ${middle[0].city}`;
    return `ещё ${middle.length} точки`;
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
 * Включена ли биржа и парк ли компания. Спрашиваем один раз на вход:
 * вкладка в меню не должна мигать при каждом переходе.
 *
 * Ответ запоминается за конкретным человеком и компанией. Выход и вход
 * страницу не перезагружают, и без этого новый вход получал ответ,
 * данный прошлому: владелец, заглянув перед этим в компанию без биржи,
 * не видел в админке раздела «Биржа: доступ и парки», а компания после
 * админа — кабинета парка.
 */
let statusRequest: Promise<ExchangeStatus> | null = null;
let statusFor = '';
export function exchangeStatus(): Promise<ExchangeStatus> {
    const user = useAuthStore.getState().user;
    const who = `${user?.id ?? ''}:${user?.companyId ?? ''}`;
    if (!statusRequest || statusFor !== who) {
        statusFor = who;
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
    /** Из ИИН — сервер считает сам. */
    birthDate: string | null;
    idNumber: string | null;
    idIssuedBy: string | null;
    idIssuedAt: string | null;
    idExpiresAt: string | null;
    /** Когда водитель дал согласие на обработку персональных данных и на какой текст. */
    consentAt: string | null;
    consentVersion: string | null;
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

/** «+77011234567» → «+7 701 123 45 67»: так номер читают и диктуют. */
export function телефонКрасиво(phone: string | null | undefined): string {
    const d = (phone ?? '').replace(/\D/g, '');
    if (d.length !== 11) return phone || '—';
    return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
}

/** Название в кавычках, если своих нет: Алем → «Алем», ТОО «Алем» → ТОО «Алем». */
export function вКавычках(name: string | null | undefined): string {
    if (!name) return '—';
    return /[«"]/.test(name) ? name : `«${name}»`;
}


// ==================== кабинет парка ====================

export interface ParkOverview {
    pendingDrivers: number;
    approvedDrivers: number;
    activeTrips: number;
    monthTrips: number;
    monthSum: number;
    inviteCode: string;
    /** Выплаты, которые ждут парка: запрошены или в 1С. */
    pendingPayouts: { count: number; net: number };
}

export type ParkTripFilter = 'active' | 'done' | 'all';

/** Рейс водителя парка — как его видит парк (без цены заказчика). */
export interface ParkTrip {
    id: string;
    orderNumber: string;
    status: string;
    price: number | null;
    driverName: string | null;
    vehiclePlate: string | null;
    from: string;
    to: string;
    loadingDate: string | null;
    customerName: string | null;
    createdAt: string;
    completedAt: string | null;
}

/** Ссылка-приглашение парка: её отправляют водителю в WhatsApp. */
export function ссылкаПриглашения(code: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://logicore.kz';
    return `${origin}/park-invite/${code}`;
}

export type PayoutStatus = 'REQUESTED' | 'EXPORTED' | 'PAID' | 'REJECTED';

export const PAYOUT_STATUS_TEXT: Record<PayoutStatus, string> = {
    REQUESTED: 'Запрошена',
    EXPORTED: 'В 1С',
    PAID: 'Выплачено',
    REJECTED: 'Отклонена',
};

/** Выплата водителю парка — как её видит парк. */
export interface ParkPayout {
    id: string;
    status: PayoutStatus;
    gross: number;
    commission: number;
    opv: number;
    vosms: number;
    ipn: number;
    net: number;
    so: number;
    trips: number;
    iban: string | null;
    bank: string | null;
    requestedAt: string;
    exportedAt: string | null;
    paidAt: string | null;
    rejectReason: string | null;
    driver: { id: string; name: string; iin: string | null; phone: string | null };
}

/** Ставки удержаний парка, %. */
export interface PayoutRates {
    commissionPct: number;
    opvPct: number;
    vosmsPct: number;
    ipnPct: number;
    soPct: number;
    updatedAt?: string | null;
    isDefault?: boolean;
}
