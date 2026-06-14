import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Попытка восстановить токен из localStorage сразу при загрузке модуля (до инициализации React компонентов)
const getInitialToken = () => {
    if (typeof window === 'undefined') return null;
    try {
        const authData = localStorage.getItem('logcomp-auth');
        if (authData) {
            const parsed = JSON.parse(authData);
            return parsed.state?.token || null;
        }
    } catch (e) {
        return null;
    }
    return null;
};

const initialToken = getInitialToken();
if (initialToken) {
    api.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`;
}

// Интерцептор для обработки ошибок авторизации
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Исключаем запросы авторизации, чтобы некорректный пароль или код не вызывали перезагрузку страницы
            const url = error.config?.url || '';
            const isAuthRequest = url.includes('/auth/login');
            
            if (!isAuthRequest) {
                // Токен невалидный — очищаем
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('logcomp-auth');
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

// Универсальный fetcher для SWR
export const fetcher = (url: string) => api.get(url).then(res => res.data);

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
    companyId?: string;
    emails?: string;
}

export interface Country {
    id: string;
    name: string;
    code: string;
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
        code: string;
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
