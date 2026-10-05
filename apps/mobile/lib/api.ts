import axios from 'axios';
import * as SecureStore from '@/lib/secure';
import Constants from 'expo-constants';

/**
 * Адрес API берётся из app.json → expo.extra.apiUrl.
 * Для локальной отладки через adb reverse можно указать http://localhost:3001.
 */
const API_URL: string =
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) || 'http://localhost:3001';

export const api = axios.create({
    baseURL: API_URL,
    timeout: 20000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Загружаем токен при инициализации
export const initializeApi = async () => {
    const token = await SecureStore.getItemAsync('token');
    if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
};

/**
 * Что делать, когда вход кончился (пропуск истёк или вход выполнен на
 * другом телефоне). Задаёт корневой экран: вернуть человека ко входу,
 * а не оставлять на экранах, которые только пишут «не удалось загрузить».
 */
let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: (() => void) | null) => { unauthorizedHandler = handler; };

// Интерцептор для обработки 401
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            // Отказ на сам вход (неверный пароль) — это не «вход кончился».
            const hadPass = !!error.config?.headers?.Authorization;
            await SecureStore.deleteItemAsync('token');
            await SecureStore.deleteItemAsync('user');
            delete api.defaults.headers.common['Authorization'];
            if (hadPass) unauthorizedHandler?.();
        }
        return Promise.reject(error);
    }
);

// Сохранение токена
export const setAuthToken = async (token: string) => {
    await SecureStore.setItemAsync('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

// Очистка токена
export const clearAuthToken = async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    delete api.defaults.headers.common['Authorization'];
};

/** Стабильный ID устройства для Single Session Policy */
export const getDeviceId = async (): Promise<string> => {
    let deviceId = await SecureStore.getItemAsync('deviceId');
    if (!deviceId) {
        deviceId = `mob-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await SecureStore.setItemAsync('deviceId', deviceId);
    }
    return deviceId;
};

/** Заголовок авторизации для загрузки картинок (аватар) */
export const getAuthHeader = (): Record<string, string> => {
    const auth = api.defaults.headers.common['Authorization'];
    return auth ? { Authorization: String(auth) } : {};
};

export { API_URL };
