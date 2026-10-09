import { api } from '@/lib/api';

/** Анкета водителя биржи — как её отдаёт сервер. */
export interface DriverProfile {
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
    /** Удостоверение личности: номер, кем выдано, даты «ГГГГ-ММ-ДД…». */
    idNumber: string | null;
    idIssuedBy: string | null;
    idIssuedAt: string | null;
    idExpiresAt: string | null;
    /** Когда дано согласие на обработку персональных данных. */
    consentAt: string | null;
    email: string | null;
    ipName: string | null;
    ipIin: string | null;
    vehiclePlate: string | null;
    vehicleBodyType: string | null;
    vehicleCapacityKg: number | null;
    vehicleIsOwn: boolean;
    contractSignedAt: string | null;
    rejectReason: string | null;
    blockedReason: string | null;
    tripsCompleted: number;
    documents: { id: string; kind: DocumentKind; fileName: string; mimeType: string; createdAt: string }[];
    /** Чего не хватает, чтобы отправить анкету — словами. */
    missing: string[];
}

export type DocumentKind =
    'ID_FRONT' | 'ID_BACK' | 'SELFIE_WITH_ID' | 'LICENSE' | 'VEHICLE_REGISTRATION' | 'POWER_OF_ATTORNEY' | 'IP_CERTIFICATE';

export const DOCUMENTS: { kind: DocumentKind; title: string; hint: string }[] = [
    { kind: 'ID_FRONT', title: 'Удостоверение — лицевая сторона', hint: 'Сфотографируйте целиком, без бликов' },
    { kind: 'ID_BACK', title: 'Удостоверение — обратная сторона', hint: 'Чтобы читался ИИН' },
    { kind: 'SELFIE_WITH_ID', title: 'Фото с удостоверением в руке', hint: 'Лицо и документ в кадре' },
    { kind: 'LICENSE', title: 'Водительское удостоверение', hint: 'Лицевая сторона' },
    { kind: 'VEHICLE_REGISTRATION', title: 'Техпаспорт машины', hint: 'Видно госномер и владельца' },
    { kind: 'POWER_OF_ATTORNEY', title: 'Доверенность от владельца', hint: 'Если машина не ваша' },
];

export interface Park {
    id: string;
    name: string;
    bin: string | null;
}

/** Точка маршрута на бирже — город и день: адрес откроется исполнителю. */
export interface ExchangePoint {
    type: 'PICKUP' | 'ADDITIONAL_PICKUP' | 'DELIVERY';
    city: string;
    region: string | null;
    date: string | null;
}

/** Заявка на бирже — компания ищет, кто повезёт. */
export interface ExchangeOrder {
    id: string;
    orderNumber: string;
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
    /** Цена, которую компания предлагает исполнителю; нет — договорная. */
    price: number | null;
    note: string | null;
    publishedAt: string | null;
    /** Свой отклик: в ленте — только статус, в карточке — целиком. */
    myOfferStatus?: OfferStatus | null;
    myOffer?: OwnOffer | null;
}

export type OfferStatus = 'ACTIVE' | 'WITHDRAWN' | 'ACCEPTED' | 'REJECTED';

/** Свой отклик на заявку. */
export interface OwnOffer {
    id: string;
    status: OfferStatus;
    price: number;
    agreed: boolean;
    readyDate: string | null;
    comment: string | null;
    updatedAt: string;
}

/** Свой отклик в списке «Мои отклики» — с маршрутом заявки. */
export interface MyOffer extends OwnOffer {
    orderId: string;
    orderNumber: string;
    from: string;
    to: string;
}

/** Суммы выплаты: начислено, удержано, на руки. */
export interface PayoutAmounts {
    gross: number;
    commission: number;
    opv: number;
    vosms: number;
    ipn: number;
    net: number;
    so: number;
}

export type PayoutStatus = 'REQUESTED' | 'EXPORTED' | 'PAID' | 'REJECTED';

/** «Заработок» водителя парка. */
export interface Earnings {
    parkName: string | null;
    rates: { commissionPct: number; opvPct: number; vosmsPct: number; ipnPct: number; soPct: number };
    iban: string | null;
    bank: string | null;
    available: PayoutAmounts;
    trips: (PayoutAmounts & { orderId: string; orderNumber: string; route: string; completedAt: string | null })[];
    payouts: (PayoutAmounts & { id: string; status: PayoutStatus; trips: number; requestedAt: string; exportedAt: string | null; paidAt: string | null; rejectReason: string | null })[];
}

/** Что отправляем в отклике. */
export interface OfferInput {
    agree?: boolean;
    price?: number;
    readyDate?: string;
    comment?: string;
}

/**
 * Типы кузова — тот же список, что у компании при постановке груза: по
 * точному совпадению лента показывает водителю «его» грузы.
 */
export const BODY_TYPES = [
    'тент', 'рефрижератор', 'изотерм', 'бортовая', 'открытая', 'контейнеровоз', 'самосвал', 'трал',
    'платформа', 'манипулятор', 'автовоз', 'цельномет.', 'цистерна пищ.', 'цистерна хим.', 'цистерна газовая',
    'цистерна изотерм.', 'бензовоз', 'зерновоз', 'зерновоз-самосвал', 'лесовоз', 'панелевоз', 'негабарит',
    'микроавтобус', 'спецмашина', 'тягач', 'эвакуатор', 'автокран', 'бетономеситель', 'цементовоз', 'скотовоз',
    'птицевоз', 'муковоз', 'кормовоз', 'металловоз (ломовоз)', 'стекловоз', 'трубовоз', 'рулоновоз', 'щеповоз',
    'масловоз', 'битумовоз', 'меблевоз', 'цельнопластик', 'контейнер пустой', 'экскаватор',
    'автобус грузопас.', 'автобус люкс',
];

const МЕСЯЦЫ = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «12 окт». Даты нет — так и пишем. */
export function когда(date: string | null | undefined): string {
    if (!date) return 'дата не указана';
    const d = new Date(date);
    return `${d.getDate()} ${МЕСЯЦЫ[d.getMonth()]}`;
}

/** «450 000 ₸». */
export function деньги(value: number): string {
    return `${Math.round(value).toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;
}

/** «20 т · 86 м³ · тент». */
export function груз(load: Pick<ExchangeOrder, 'weightKg' | 'volumeM3' | 'bodyType'>): string {
    return [
        load.weightKg != null ? `${(load.weightKg / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} т` : null,
        load.volumeM3 ? `${load.volumeM3} м³` : null,
        load.bodyType,
    ].filter(Boolean).join(' · ');
}

/**
 * ИИН прошёл проверку — те же правила, что на сервере: 12 цифр, дата
 * рождения, век и контрольная цифра. Ошибку видно сразу под полем, а не
 * после отказа сервера.
 */
export function иинВерный(raw: string): boolean {
    const iin = raw.replace(/\D/g, '');
    if (!/^\d{12}$/.test(iin)) return false;
    const d = iin.split('').map(Number);
    const month = Number(iin.slice(2, 4));
    const day = Number(iin.slice(4, 6));
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    if (d[6] < 1 || d[6] > 6) return false;
    const sum = (w: number[]) => w.reduce((s, x, i) => s + x * d[i], 0) % 11;
    let check = sum([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    if (check === 10) {
        check = sum([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]);
        if (check === 10) return false;
    }
    return check === d[11];
}

/**
 * Дата рождения из ИИН — как считает сервер: ГГММДД и седьмая цифра —
 * век. Показываем под полем ИИН, чтобы водитель сразу увидел ошибку в
 * цифрах: «1909 год» заметнее, чем неверная контрольная цифра.
 */
export function датаРожденияПоИин(raw: string): string | null {
    const iin = raw.replace(/\D/g, '');
    if (!иинВерный(iin)) return null;
    const century = [0, 1800, 1800, 1900, 1900, 2000, 2000][Number(iin[6])];
    return `${iin.slice(4, 6)}.${iin.slice(2, 4)}.${century + Number(iin.slice(0, 2))}`;
}

/** Поле даты «ДД.ММ.ГГГГ»: человек жмёт только цифры, точки встают сами. */
export function деньВвод(raw: string): string {
    const d = raw.replace(/\D/g, '').slice(0, 8);
    return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('.');
}

/** «ДД.ММ.ГГГГ» → «ГГГГ-ММ-ДД» для сервера; пусто — пустая строка; не дата — null. */
export function деньНаСервер(text: string): string | null {
    if (!text.trim()) return '';
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
    if (!m) return null;
    const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Дата с сервера «ГГГГ-ММ-ДД…» → «ДД.ММ.ГГГГ» для поля. */
export function деньИзСервера(iso: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** Казахстанский мобильный: «8 701…», «+7 (701)…», «701…» — все годятся. */
export function телефонВерный(raw: string): boolean {
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits.length === 10) digits = `7${digits}`;
    return /^7\d{10}$/.test(digits);
}

/** Что ответил сервер — словами; список проверок склеиваем. */
export function ответ(error: any, fallback: string): string {
    const m = error?.response?.data?.message;
    if (Array.isArray(m)) return m.join('. ');
    if (typeof m === 'string' && m) return m;
    if (error?.message === 'Network Error') return 'Нет связи с сервером. Проверьте интернет.';
    return fallback;
}

/** Где приложение помнит код приглашения парка до заполнения анкеты. */
export const PARK_INVITE_KEY = 'parkInviteCode';

export const exchangeApi = {
    /** Включена ли биржа — до входа. Старый сервер без биржи ответит 404 → «нет». */
    publicStatus: () => api.get('/exchange/public-status').then((r) => !!r.data?.enabled).catch(() => false),
    me: () => api.get<DriverProfile>('/exchange/driver/me').then((r) => r.data),
    update: (data: Partial<Record<string, unknown>>) => api.put<DriverProfile>('/exchange/driver/me', data).then((r) => r.data),
    parks: () => api.get<Park[]>('/exchange/driver/parks').then((r) => r.data),
    uploadDocument: (kind: DocumentKind, uri: string) => {
        const form = new FormData();
        form.append('kind', kind);
        form.append('file', { uri, name: `${kind.toLowerCase()}.jpg`, type: 'image/jpeg' } as any);
        return api.post<DriverProfile>('/exchange/driver/me/documents', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
        }).then((r) => r.data);
    },
    removeDocument: (id: string) => api.delete<DriverProfile>(`/exchange/driver/me/documents/${id}`).then((r) => r.data),
    signContract: (deviceId: string) =>
        api.post<DriverProfile>('/exchange/driver/me/sign-contract', {}, { headers: { 'X-Device-Id': deviceId } }).then((r) => r.data),
    submit: () => api.post<DriverProfile>('/exchange/driver/me/submit').then((r) => r.data),
    /** Вернуть принятую анкету на правку — после отправки её снова проверят. */
    reopen: () => api.post<DriverProfile>('/exchange/driver/me/reopen').then((r) => r.data),
    /** Вступить в парк по коду из приглашения. */
    joinPark: (code: string) => api.post<DriverProfile>('/exchange/driver/me/park-code', { code }).then((r) => r.data),
    deleteAccount: () => api.post('/exchange/driver/me/delete'),

    feed: (bodyType?: string) =>
        api.get<ExchangeOrder[]>('/exchange/driver/loads', { params: bodyType ? { bodyType } : {} }).then((r) => r.data),
    order: (id: string) => api.get<ExchangeOrder>(`/exchange/driver/loads/${id}`).then((r) => r.data),
    offer: (id: string, input: OfferInput) => api.post<OwnOffer>(`/exchange/driver/loads/${id}/offer`, input).then((r) => r.data),
    withdraw: (id: string) => api.post(`/exchange/driver/loads/${id}/offer/withdraw`),
    myOffers: () => api.get<MyOffer[]>('/exchange/driver/offers').then((r) => r.data),
    earnings: () => api.get<Earnings>('/exchange/driver/earnings').then((r) => r.data),
    setPayoutAccount: (iban: string, bank?: string) => api.put('/exchange/driver/me/payout-account', { iban, bank }).then((r) => r.data),
    requestPayout: () => api.post<{ id: string; net: number; trips: number }>('/exchange/driver/payouts/request').then((r) => r.data),
};

/** Адрес фото груза — картинка грузится с пропуском (заголовок авторизации). */
export const documentPath = (docId: string) => `/exchange/driver/me/documents/${docId}`;

/** Название парка в кавычках, если своих нет: «Алем» → «Алем», ТОО «Алем» → ТОО «Алем». */
export function вКавычках(name: string | null | undefined): string {
    if (!name) return '—';
    return /[«"]/.test(name) ? name : `«${name}»`;
}

/** «+77011234567» → «+7 701 123 45 67»: так номер читают и диктуют. */
export function телефонКрасиво(phone: string | null | undefined): string {
    const d = (phone ?? '').replace(/\D/g, '');
    if (d.length !== 11) return phone || '—';
    return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
}

/** «Сегодня», «Завтра», «12 окт» — водителю важнее «когда ехать», чем число. */
export function когдаПросто(date: string | null | undefined): string {
    if (!date) return 'Дата не указана';
    const d = new Date(date);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diff = Math.round((day - today) / 86_400_000);
    return diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : diff === 2 ? 'Послезавтра' : когда(date);
}

/** Промежуточные точки: «через Тараз» / «ещё 2 точки». */
export function черезТочки(o: Pick<ExchangeOrder, 'points'>): string | null {
    const middle = o.points.slice(1, -1);
    if (!middle.length) return null;
    return middle.length === 1 ? `через ${middle[0].city}` : `ещё ${middle.length} точки`;
}

/** 1 груз, 2 груза, 5 грузов. */
export function грузов(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    const word = mod10 === 1 && mod100 !== 11 ? 'груз' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'груза' : 'грузов';
    return `${n} ${word}`;
}
