import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useStore } from '@/store';
import { initializeApi, onUnauthorized } from '@/lib/api';
import '@/lib/alert-polyfill';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function RootLayout() {
    const checkAuth = useStore((state) => state.checkAuth);
    const { isDark } = useAppTheme();

    useEffect(() => {
        const init = async () => {
            await initializeApi();
            await checkAuth();
        };
        init();
        // Вход кончился — ко входу. Без этого приложение показывало бы
        // пустые экраны с ошибками, пока водитель сам не нажмёт «Выйти».
        onUnauthorized(() => {
            if (!useStore.getState().isAuthenticated) return;
            useStore.setState({ user: null, isAuthenticated: false, currentOrder: null, orders: [] });
            router.replace('/login');
        });
        return () => onUnauthorized(null);
    }, []);

    return (
        <>
            <StatusBar style={isDark ? "light" : "dark"} />
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: '#1677ff' },
                    headerTintColor: '#fff',
                    headerTitleStyle: { fontWeight: 'bold' },
                }}
            >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="exchange" options={{ headerShown: false }} />
            </Stack>
        </>
    );
}
