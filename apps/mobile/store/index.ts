import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api, setAuthToken, clearAuthToken, getDeviceId } from '@/lib/api';

interface User {
    id: string;
    phone: string;
    firstName: string;
    lastName: string;
    role: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    vehicleType?: string;
    trailerNumber?: string;
    avatarPath?: string | null;
    company?: { id: string; name: string } | null;
}

export interface Order {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    cargoWeight?: number;
    createdAt?: string;
    routePoints: Array<{
        pointType: string;
        sequence: number;
        expectedDate?: string | null;
        notes?: string | null;
        location: {
            id: string;
            name: string;
            address: string;
            latitude: number;
            longitude: number;
            contactName?: string | null;
            contactPhone?: string | null;
        };
    }>;
}

interface AppState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    currentOrder: Order | null;
    orders: Order[];
    ordersLoading: boolean;

    // Auth actions
    login: (phone: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;

    // Order actions
    fetchCurrentOrder: () => Promise<void>;
    fetchOrders: () => Promise<void>;
    updateOrderStatus: (orderId: string, status: string) => Promise<void>;
    reportProblem: (orderId: string, description: string) => Promise<void>;

    // Settings
    mapTheme: 'auto' | 'light' | 'dark';
    setMapTheme: (theme: 'auto' | 'light' | 'dark') => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    currentOrder: null,
    orders: [],
    ordersLoading: false,

    login: async (phone: string, password: string) => {
        const deviceId = await getDeviceId();
        const response = await api.post('/auth/driver-login', { phone, password, deviceId });
        const { accessToken, user } = response.data;
        await setAuthToken(accessToken);
        await SecureStore.setItemAsync('user', JSON.stringify(user));
        set({ user, isAuthenticated: true });
    },

    logout: async () => {
        try {
            await api.post('/auth/logout');
        } catch { }
        await clearAuthToken();
        set({ user: null, isAuthenticated: false, currentOrder: null, orders: [] });
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
            const orders = response.data;
            if (!Array.isArray(orders)) {
                throw new Error('Некорректный ответ сервера');
            }
            const activeOrder = orders.find((o: Order) =>
                !['COMPLETED', 'CANCELLED'].includes(o.status)
            );
            set({ currentOrder: activeOrder || null });
        } catch (error) {
            console.error('Fetch order error:', error);
            set({ currentOrder: null });
        }
    },

    fetchOrders: async () => {
        set({ ordersLoading: true });
        try {
            const response = await api.get('/orders/my?history=1');
            set({ orders: Array.isArray(response.data) ? response.data : [] });
        } catch (error) {
            console.error('Fetch orders error:', error);
        } finally {
            set({ ordersLoading: false });
        }
    },

    updateOrderStatus: async (orderId: string, status: string) => {
        await api.put(`/orders/${orderId}/status`, { status });
        await get().fetchCurrentOrder();
    },

    reportProblem: async (orderId: string, description: string) => {
        await api.post(`/orders/${orderId}/problem`, { description });
        await get().fetchCurrentOrder();
    },

    mapTheme: 'auto',
    setMapTheme: async (theme: 'auto' | 'light' | 'dark') => {
        await SecureStore.setItemAsync('mapTheme', theme);
        set({ mapTheme: theme });
    },
}));
