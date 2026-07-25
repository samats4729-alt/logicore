import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

export type UserRole = 'ADMIN' | 'COMPANY_ADMIN' | 'LOGISTICIAN' | 'WAREHOUSE_MANAGER' | 'DRIVER' | 'RECIPIENT' | 'PARTNER' | 'FORWARDER' | 'ACCOUNTANT';

interface User {
    id: string;
    email?: string;
    phone: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    permissions?: string[];
    companyId?: string;
    company?: {
        id: string;
        name: string;
        type: string;
    };
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // Actions
    login: (email: string, password: string, deviceId: string) => Promise<void>;
    logout: () => void;
    setUser: (user: User) => void;
    checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            isLoading: false,

            login: async (email: string, password: string, deviceId: string) => {
                set({ isLoading: true });
                try {
                    const response = await api.post('/auth/login', { email, password, deviceId });
                    const { user } = response.data;

                    set({
                        user,
                        isAuthenticated: true,
                        isLoading: false
                    });
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },

            logout: () => {
                api.post('/auth/logout').catch(() => { });
                set({ user: null, isAuthenticated: false });
            },

            setUser: (user: User) => {
                set({ user, isAuthenticated: true });
            },

            checkAuth: async () => {
                try {
                    const response = await api.post('/auth/me');
                    set({ user: response.data, isAuthenticated: true });
                } catch {
                    set({ user: null, isAuthenticated: false });
                }
            },
        }),
        {
            name: 'logcomp-auth',
            version: 1,
            partialize: (state) => ({ user: state.user }),
            migrate: (persistedState: any) => ({
                ...persistedState,
                token: undefined,
            }),
        }
    )
);
