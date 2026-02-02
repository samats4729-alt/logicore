import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export type UserRole = 'ADMIN' | 'COMPANY_ADMIN' | 'LOGISTICIAN' | 'WAREHOUSE_MANAGER' | 'DRIVER' | 'RECIPIENT' | 'PARTNER' | 'FORWARDER';

interface User {
    id: string;
    email?: string;
    phone: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    companyId?: string;
    company?: {
        id: string;
        name: string;
        type: string;
    };
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // Actions
    login: (email: string, password: string, deviceId: string) => Promise<void>;
    logout: () => void;
    setUser: (user: User, token: string) => void;
    checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,

            login: async (email: string, password: string, deviceId: string) => {
                set({ isLoading: true });
                try {
                    const response = await api.post('/auth/login', { email, password, deviceId });
                    const { accessToken, user } = response.data;

                    set({
                        user,
                        token: accessToken,
                        isAuthenticated: true,
                        isLoading: false
                    });

                    // Сохраняем токен в API клиент
                    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },

            logout: () => {
                api.post('/auth/logout').catch(() => { });
                set({ user: null, token: null, isAuthenticated: false });
                delete api.defaults.headers.common['Authorization'];
            },

            setUser: (user: User, token: string) => {
                set({ user, token, isAuthenticated: true });
                api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            },

            checkAuth: async () => {
                const { token } = get();
                if (!token) return;

                try {
                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                    const response = await api.post('/auth/me');
                    set({ user: response.data, isAuthenticated: true });
                } catch {
                    set({ user: null, token: null, isAuthenticated: false });
                    delete api.defaults.headers.common['Authorization'];
                }
            },
        }),
        {
            name: 'logcomp-auth',
            partialize: (state) => ({ token: state.token, user: state.user }),
        }
    )
);
