import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api, setAuthToken, clearAuthToken } from '@/lib/api';
import * as Device from 'expo-device';

interface User {
    id: string;
    phone: string;
    firstName: string;
    lastName: string;
    role: string;
    vehiclePlate?: string;
    vehicleModel?: string;
}

interface Order {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    cargoWeight?: number;
    pickupLocation: {
        id: string;
        name: string;
        address: string;
        latitude: number;
        longitude: number;
    };
    deliveryPoints: Array<{
        id: string;
        sequence: number;
        location: {
            id: string;
            name: string;
            address: string;
            latitude: number;
            longitude: number;
        };
    }>;
}

interface AppState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    currentOrder: Order | null;

    // Auth actions
    requestSmsCode: (phone: string) => Promise<void>;
    verifySmsCode: (phone: string, code: string) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;

    // Order actions
    fetchCurrentOrder: () => Promise<void>;
    updateOrderStatus: (orderId: string, status: string) => Promise<void>;

    // Settings
    mapTheme: 'auto' | 'light' | 'dark';
    setMapTheme: (theme: 'auto' | 'light' | 'dark') => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    currentOrder: null,

    requestSmsCode: async (phone: string) => {
        await api.post('/auth/sms/request', { phone });
    },

    verifySmsCode: async (phone: string, code: string) => {
        const deviceId = Device.deviceName || 'unknown-device';
        const response = await api.post('/auth/sms/verify', { phone, code, deviceId });
        const { user, accessToken } = response.data;

        await setAuthToken(accessToken);
        await SecureStore.setItemAsync('user', JSON.stringify(user));

        set({ user, isAuthenticated: true });
    },

    logout: async () => {
        try {
            await api.post('/auth/logout');
        } catch { }
        await clearAuthToken();
        set({ user: null, isAuthenticated: false, currentOrder: null });
    },

    checkAuth: async () => {
        set({ isLoading: true });
        try {
            const token = await SecureStore.getItemAsync('token');
            const userJson = await SecureStore.getItemAsync('user');
            const mapTheme = (await SecureStore.getItemAsync('mapTheme')) as 'auto' | 'light' | 'dark' | null;

            if (token && userJson) {
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                const user = JSON.parse(userJson);
                set({ user, isAuthenticated: true, mapTheme: mapTheme || 'auto' });
            } else {
                set({ mapTheme: mapTheme || 'auto' });
            }
        } catch {
            await clearAuthToken();
        } finally {
            set({ isLoading: false });
        }
    },

    fetchCurrentOrder: async () => {
        try {
            const response = await api.get('/orders/my');
            console.log('API RESPONSE:', JSON.stringify(response.data, null, 2)); // DEBUG LOG

            const orders = response.data;

            if (!Array.isArray(orders)) {
                throw new Error(`Invalid server response: Expected array, got ${typeof orders}. Content: ${JSON.stringify(orders).substring(0, 100)}`);
            }

            // Берём первый активный заказ
            const activeOrder = orders.find((o: Order) =>
                !['COMPLETED', 'CANCELLED'].includes(o.status)
            );
            set({ currentOrder: activeOrder || null });
        } catch (error: any) {
            console.error('Fetch Order Error:', error);
            // Show error to user to debug connectivity
            const { Alert } = require('react-native');
            Alert.alert('Ошибка связи', error.message + '\n' + (error.response?.data?.message || ''));
            set({ currentOrder: null });
        }
    },

    updateOrderStatus: async (orderId: string, status: string) => {
        await api.put(`/orders/${orderId}/status`, { status });
        await get().fetchCurrentOrder();
    },

    mapTheme: 'auto',
    setMapTheme: async (theme: 'auto' | 'light' | 'dark') => {
        await SecureStore.setItemAsync('mapTheme', theme);
        set({ mapTheme: theme });
    },
}));
