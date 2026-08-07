import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Пустое тело запроса не должно уезжать строкой «null».
 *
 * Заголовок `Content-Type: application/json` стоит на всех запросах, поэтому
 * `api.post(url, null)` отправляет ровно четыре символа `null`. Разбор JSON
 * на сервере принимает только объект или массив и отвечает 400 ещё до
 * проверки прав — пользователь видел «Unexpected token 'n'» вместо действия.
 * Тело `null` всегда означает «тела нет», так его и передаём.
 */
api.interceptors.request.use((config) => {
    if (config.data === null) {
        config.data = undefined;
    }
    // Файл уезжает формой, а не JSON.
    //
    // Заголовок `Content-Type: application/json` стоит на всех запросах, а
    // axios на нём пересобирает форму с файлом в JSON-объект — файл при этом
    // теряется, до сервера доезжает пустышка. Так молча ломалась загрузка
    // документов на подключении организации: сообщения об ошибке не было,
    // кнопка «Отправить на проверку» оставалась серой. Заголовок убираем —
    // браузер проставит `multipart/form-data` вместе с разделителем сам.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        config.headers.delete('Content-Type');
    }
    return config;
});

// Удаляем токены, сохранённые старыми версиями веб-клиента. Пользовательские
// данные можно оставить для быстрой отрисовки; сессия проверяется по httpOnly cookie.
if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    try {
        const authData = localStorage.getItem('logcomp-auth');
        if (authData) {
            const parsed = JSON.parse(authData);
            if (parsed.state?.token) {
                delete parsed.state.token;
                localStorage.setItem('logcomp-auth', JSON.stringify(parsed));
            }
        }
    } catch { }
}

// Интерцептор для обработки ошибок авторизации
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Отказ проверки полей приходит списком причин, а экраны показывают
        // `data.message` как одну строку. Список туда не помещался, и человек
        // видел пустое место вместо объяснения: окно не закрывалось, ошибки
        // не было, действие молча не выполнялось. Склеиваем список в строку
        // один раз здесь — иначе это пришлось бы помнить на каждом экране.
        const reasons = error.response?.data?.message;
        if (Array.isArray(reasons)) {
            error.response.data.message = reasons.join('. ');
        }

        if (error.response?.status === 401) {
            // Исключаем публичные запросы авторизации/регистрации, чтобы некорректные данные или ошибки не вызывали логаут
            const url = error.config?.url || '';
            const publicAuthPatterns = [
                /\/auth\/login\b/,
                /\/auth\/forgot-password\b/,
                /\/auth\/reset-password\b/,
                /\/auth\/register-company\b/,
                /\/auth\/google\b/,
                /\/auth\/invitation\//,
                /\/auth\/register\/invited\b/,
                /\/auth\/company-lookup\//,
                /\/auth\/refresh\b/
            ];
            
            const isPublicAuthRequest = publicAuthPatterns.some(pattern => pattern.test(url));
            
            if (!isPublicAuthRequest) {
                // Токен невалидный — очищаем
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('logcomp-auth');
                    localStorage.removeItem('token');

                    // На самой странице входа перезагрузка запрещена. Сюда
                    // прилетает 401 от фонового запроса, который просто
                    // выяснял, есть ли сессия, — а `window.location`
                    // перезагружает страницу целиком и стирает уже набранные
                    // почту с паролем. Человек видит, что форма сама
                    // очистилась, без единого сообщения, и набирает заново.
                    if (!window.location.pathname.startsWith('/login')) {
                        window.location.href = '/login';
                    }
                }
            }
        }
        return Promise.reject(error);
    }
);

// Универсальный fetcher для SWR
export const fetcher = (url: string) => api.get(url).then(res => res.data);

export interface CreateReconciliationDraftRequest {
    counterpartyId: string;
    reportPeriodFrom: string;
    reportPeriodTo: string;
    documentDate?: string;
    note?: string;
}

export interface AccountingDocumentDraft {
    id: string;
    number: string;
    type: 'RECONCILIATION_ACT';
    status: 'DRAFT';
    reportPeriodFrom: string;
    reportPeriodTo: string;
    reconciliationLines: Array<{ id: string }>;
}

export const accountingDocumentsApi = {
    createReconciliationDraft: (payload: CreateReconciliationDraftRequest) =>
        api.post<AccountingDocumentDraft>('/accounting-documents/reconciliation/from-ledger', payload)
            .then((response) => response.data),
    downloadPdf: (documentId: string) =>
        api.get<Blob>(`/accounting-documents/${documentId}/pdf`, { responseType: 'blob' })
            .then((response) => response.data),
};

// Типы для API
export interface Location {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    contactName?: string;
    contactPhone?: string;
    city?: string;
    cityId?: string;
    cityRecord?: City;
    companyId?: string;
    emails?: string;
}

export interface Country {
    id: string;
    name: string;
    code: string;
}

export interface GeoProviderEntity {
    externalId?: string;
    name: string;
}

export interface GeoProviderHierarchy {
    provider: '2gis';
    placeId?: string;
    country?: GeoProviderEntity & { code: string };
    region?: GeoProviderEntity;
    city?: GeoProviderEntity;
}

export interface Region {
    id: string;
    name: string;
    countryId: string;
}

export interface City {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    countryId?: string;
    regionId?: string;
    country?: {
        id?: string;
        code: string;
        name: string;
    };
    region?: {
        id: string;
        name: string;
    };
}

export interface Order {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    cargoWeight?: number;
    cargoVolume?: number;
    requirements?: string;
    pickupLocation: Location;
    deliveryPoints: { location: Location; sequence: number }[];
    customer: { firstName: string; lastName: string };
    driver?: { id: string; firstName: string; lastName: string; phone: string; vehiclePlate?: string };
    createdAt: string;
    // Old price field might be used, but we switched to distinct prices
    customerPrice?: number;
    driverCost?: number;

    // New Fields
    customerPaymentCondition?: string;
    customerPaymentForm?: string;
    customerPaymentDate?: string;
    driverPaymentCondition?: string;
    driverPaymentForm?: string;
    driverPaymentDate?: string;
    ttnNumber?: string;
    atiCodeCustomer?: string;
    atiCodeCarrier?: string;
    trailerNumber?: string;
    actualWeight?: number;
    actualVolume?: number;
    natureOfCargo?: string;
    cargoType?: string;
}

export interface User {
    id: string;
    email?: string;
    phone: string;
    firstName: string;
    lastName: string;
    role: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    isActive: boolean;
}
