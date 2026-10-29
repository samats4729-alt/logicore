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
    /** Заказчик — только в своих заявках («Мои»); в общей ленте чужого клиента не показывают. */
    customerName?: string | null;
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
    /** Последнее изменение отклика (цена, подача). Старый сервер не присылает. */
    updatedAt?: string;
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
        /** Ещё номера и куда слать акты и счета (Q6). Старый сервер не присылает. */
        extraPhones?: string[];
        docsEmail?: string | null;
        docsContact?: string | null;
        /** Основной прицеп водителя (R4). Старый сервер не присылает. */
        trailerPlate?: string | null;
    } | null;
    company: { name: string; bin: string | null } | null;
}

/** Биржа в карточке заявки: на бирже ли и можно ли выставить. */
/** Когда отклик в последний раз появился или изменился — по этому времени он «новый». */
export const откликИзменён = (o: Pick<ExchangeOffer, 'createdAt' | 'updatedAt'>) => o.updatedAt ?? o.createdAt;

/** Цену (или подачу) поменяли после отклика — больше минуты спустя. */
export const ценаИзменена = (o: Pick<ExchangeOffer, 'createdAt' | 'updatedAt'>) =>
    !!o.updatedAt && new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime() > 60_000;

/** Отклик на свою заявку — в «Предложениях» биржи и в колокольчике: с заявкой, к которой он относится. */
export type IncomingOffer = ExchangeOffer & {
    orderId: string;
    orderNumber: string;
    from: string;
    to: string;
    orderPrice: number | null;
};

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
    /** Компания — ИП: на биржу только через парк или приложение водителя (P7). */
    soleTrader?: boolean;
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
    /** Компания — ИП: смотреть биржу можно, выставлять и откликаться — нет (P7). */
    soleTrader?: boolean;
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
            .then((r) => ({ enabled: !!r.data?.enabled, isPark: !!r.data?.isPark, soleTrader: !!r.data?.soleTrader }))
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

/** Тягач или прицеп водителя биржи (R4). */
export interface DriverVehicle {
    id: string;
    kind: 'TRACTOR' | 'TRAILER';
    plate: string;
    model: string | null;
    bodyType: string | null;
    capacityKg: number | null;
    regNumber: string | null;
    isOwn: boolean;
    isMain: boolean;
    createdAt: string;
}

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
    /** Ещё номера и контакты для документов (Q6). Старый сервер не присылает. */
    extraPhones?: string[];
    docsEmail?: string | null;
    docsContact?: string | null;
    /** Из ИИН — сервер считает сам. */
    birthDate: string | null;
    idNumber: string | null;
    idIssuedBy: string | null;
    idIssuedAt: string | null;
    idExpiresAt: string | null;
    /** Для договора с парком: адрес прописки, марка и модель, номер техпаспорта. */
    registrationAddress: string | null;
    vehicleModel: string | null;
    vehicleRegNumber: string | null;
    /** Подписанный договор с этим парком — только в карточке парка. */
    contract?: { number: string; signedAt: string } | null;
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

export type ParkDriverFilter = 'pending' | 'approved' | 'rejected' | 'blocked' | 'all' | 'draft';

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
    /** Выплаты, которые ждут парка: запрошены или реестр уже выгружен. */
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
    /** Расчёт «на руки» (рейсы с 12.10.2026): итог водителю, топливо, доли парка и LogiCore. */
    settlement?: {
        driverTotal: number; fuelEstimate: number; parkFee: number; platformFee: number;
        /** 2 — схема шефа (16.10.2026), 1 — прежняя. Разбивка налогов по рейсу. */
        scheme?: number; gross?: number; opv?: number; vosms?: number; so?: number; ipn?: number; preliminary?: boolean;
    } | null;
    /** Чеков на топливо ждут решения парка. */
    fuelReceiptsPending?: number;
    /** Чеков на топливо по рейсу (принятых и ждущих); 0 — чеков пока не было. Старый сервер не присылает. */
    fuelReceipts?: number;
    /** Кто ведёт рейс от парка — к нему водитель пишет в WhatsApp. */
    responsible?: { id: string; name: string } | null;
    createdAt: string;
    completedAt: string | null;
}

/** Отклик водителя парка на бирже — как его видит парк (29.10.2026). */
export interface ParkOffer {
    id: string;
    status: 'ACTIVE' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
    /** Цена для компании — с налогами, топливом и комиссиями. */
    price: number;
    driverTotal: number | null;
    fuel: number | null;
    agreed: boolean;
    readyDate: string | null;
    comment: string | null;
    createdAt: string;
    updatedAt: string;
    decidedAt: string | null;
    driverName: string;
    driverPhone: string | null;
    vehiclePlate: string | null;
    orderId: string;
    orderNumber: string;
    orderStatus: string;
    from: string;
    to: string;
    loadingDate: string | null;
    cargo: string | null;
    customerName: string | null;
}

/**
 * Расчёт водителя без ИП в заявке парка (`/exchange/calculator/order/:id`):
 * TRIP — рейс с биржи, расчёт зафиксирован при выборе водителя; OWN — своя
 * заявка парка, посчитано из цены для заказчика. Не парк или не его водитель —
 * сервер отдаёт пусто.
 */
export interface ParkOrderCalc {
    source: 'TRIP' | 'OWN';
    /** 1 — прежняя схема (до 16.10.2026): «на руки» вместе с топливом. */
    scheme: 1 | 2;
    driverName: string | null;
    distanceKm: number | null;
    preliminary: boolean;
    rates: { opvPct: number; vosmsPct: number; soPct: number; ipnPct: number; parkPct: number; platformPct: number; vatPct: number };
    calc: {
        base: number;
        fuel: number;
        gross: number;
        opv: number;
        driverTotal: number;
        vosms: number;
        so: number;
        ipn: number;
        commission: number;
        platformFee: number;
        parkFee: number;
        vat: number;
        customerPrice: number;
        deductionAmount: number;
    } | null;
    /** Почему расчёта нет — словами. */
    reason: string | null;
}

/** Топливо рейса водителя парка: сколько дали, чеки, сколько перечислить в конце. */
export interface ParkTripFuel {
    orderId: string;
    orderNumber: string;
    park: { name: string; bin: string | null; phone: string | null } | null;
    driverTotal: number | null;
    fuelEstimate: number | null;
    distanceKm: number | null;
    /** Лимит на топливо в литрах — по расходу парка на 100 км. */
    fuelLiters?: number | null;
    issued: { total: number; items: { id: string; amount: number; method: 'STATION' | 'TO_DRIVER'; note: string | null; createdAt: string; byRequest?: boolean }[] };
    /** Предоплата водителю из суммы на руки: вычитается из выплаты, чек не нужен. */
    advances?: { total: number; items: { id: string; amount: number; method: 'STATION' | 'TO_DRIVER'; note: string | null; createdAt: string; byRequest?: boolean }[] };
    receipts: {
        accepted: number;
        pending: number;
        items: { id: string; amount: number; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; rejectReason: string | null; createdAt: string; byPark?: boolean }[];
    };
    toPay: number | null;
    withoutReceipt: number;
    /** 2 — схема шефа: на руки без топлива, топливо сводится чеками; 1 — прежняя. */
    scheme?: number | null;
    /** Чеков больше, чем дали: водитель заправлялся за свои — парк возвращает. */
    ownMoney?: number;
    locked: boolean;
}

/** Ссылка-приглашение парка: её отправляют водителю в WhatsApp. */
export function ссылкаПриглашения(code: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://logicore.kz';
    return `${origin}/park-invite/${code}`;
}

export type PayoutStatus = 'REQUESTED' | 'EXPORTED' | 'PAID' | 'REJECTED';

export const PAYOUT_STATUS_TEXT: Record<PayoutStatus, string> = {
    REQUESTED: 'Запрошена',
    EXPORTED: 'Реестр выгружен',
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
    /** Сколько перечислить: по расчёту «на руки» — итог минус выданное на топливо. */
    net: number;
    so: number;
    /** Расчёт «на руки»: выдано на топливо по рейсам выплаты. */
    fuelIssued?: number | null;
    trips: number;
    iban: string | null;
    bank: string | null;
    requestedAt: string;
    exportedAt: string | null;
    paidAt: string | null;
    rejectReason: string | null;
    driver: { id: string; name: string; iin: string | null; phone: string | null };
    /** Расчёт предварительный: бухгалтер парка не подтвердил ставки или рейс посчитан до подтверждения. */
    preliminary?: boolean;
}

/** Ставки удержаний парка, %. */
export interface PayoutRates {
    commissionPct: number;
    opvPct: number;
    vosmsPct: number;
    ipnPct: number;
    soPct: number;
    /** Расчёт «на руки» (12.10.2026): топливо на км, вычет по ИПН; комиссия LogiCore — для сведения. */
    fuelPerKm?: number;
    applyDeduction?: boolean;
    deductionMrp?: number;
    mrp?: number;
    platformPct?: number;
    /** НДС (15.10.2026): прибавляется к цене для компании, только у плательщиков НДС. */
    vatPayer?: boolean;
    vatPct?: number;
    /** Топливо (16.10.2026): расход на 100 км, цена литра лето/зима, сезон. */
    fuelConsumption?: number;
    fuelPriceSummer?: number;
    fuelPriceWinter?: number | null;
    fuelSeason?: 'SUMMER' | 'WINTER';
    /** Прогрессивный ИПН: повышенная ставка выше порога годового дохода, МРП. */
    ipnHighPct?: number;
    ipnThresholdMrp?: number;
    /** Сколько от суммы за рейс водитель может попросить заранее, % (Q17). */
    advanceLimitPct?: number;
    /** Бухгалтер парка подтвердил ставки и порядок расчёта; пока нет — расчёт «предварительный». */
    confirmedAt?: string | null;
    preliminary?: boolean;
    updatedAt?: string | null;
    isDefault?: boolean;
}

/** Что с деньгами рейса водителя парка: от «рейс идёт» до «выплачено». */
export type RegistryPayStatus = 'IN_TRIP' | 'TO_REQUEST' | PayoutStatus;

/** Рейс в реестре бухгалтера парка за месяц (15.10.2026). */
export interface ParkRegistryLine {
    orderId: string;
    orderNumber: string;
    route: string;
    loadingDate: string | null;
    completedAt: string | null;
    driver: { id: string; name: string; iin: string | null };
    driverTotal: number;
    fuelEstimate: number;
    fuelIssued: number;
    fuelReceipts: number;
    gross: number;
    opv: number;
    vosms: number;
    ipn: number;
    withheld: number;
    so: number;
    toBudget: number;
    deductionAmount: number;
    toPay: number;
    paid: number;
    payStatus: RegistryPayStatus;
    payStatusText: string;
    /** Суммы из запрошенной выплаты; false — оценка по текущим чекам. */
    fixed: boolean;
    preliminary: boolean;
    fuelReceiptsPending: number;
    customerPrice: number;
    vat: number;
    parkFee: number;
    platformFee: number;
    /** Топливо против расчёта по довезённому рейсу: «+» экономия, «−» перерасход (K8). */
    fuelDiff?: number;
    /** Прибыль парка по рейсу: комиссия плюс разница по топливу. */
    parkProfit?: number;
}

type RegistryTotals = Pick<ParkRegistryLine,
    'driverTotal' | 'fuelIssued' | 'fuelReceipts' | 'gross' | 'opv' | 'vosms' | 'ipn' | 'withheld' | 'so' | 'toBudget'
    | 'deductionAmount' | 'toPay' | 'paid' | 'customerPrice' | 'vat' | 'parkFee' | 'platformFee' | 'fuelDiff' | 'parkProfit'>;

export interface ParkRegistry {
    month: string;
    preliminary: boolean;
    lines: ParkRegistryLine[];
    drivers: (RegistryTotals & { driver: ParkRegistryLine['driver']; trips: number })[];
    totals: RegistryTotals & { trips: number };
}
