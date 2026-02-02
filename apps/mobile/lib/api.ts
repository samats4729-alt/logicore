import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

import { Platform } from 'react-native';

// Revert to localhost for USB debugging via adb reverse (Firewall safe)
const API_URL = 'http://localhost:3001';

export const api = axios.create({
    baseURL: API_URL,
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
