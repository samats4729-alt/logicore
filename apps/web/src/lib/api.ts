import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
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
                    window.location.href = '/login';
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
