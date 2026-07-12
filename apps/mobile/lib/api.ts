import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
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

// Интерцептор для обработки 401
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            await SecureStore.deleteItemAsync('token');
            await SecureStore.deleteItemAsync('user');
            delete api.defaults.headers.common['Authorization'];
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
