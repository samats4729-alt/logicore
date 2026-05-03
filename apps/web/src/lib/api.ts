import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Интерцептор для обработки ошибок авторизации
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Токен невалидный — очищаем
            if (typeof window !== 'undefined') {
                localStorage.removeItem('logcomp-auth');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

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
