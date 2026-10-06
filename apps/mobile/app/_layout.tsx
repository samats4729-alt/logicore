import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Unbounded_500Medium } from '@expo-google-fonts/unbounded/500Medium';
import { Unbounded_600SemiBold } from '@expo-google-fonts/unbounded/600SemiBold';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';
import { useStore } from '@/store';
import { initializeApi, onUnauthorized } from '@/lib/api';
import '@/lib/alert-polyfill';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONT } from '@/lib/theme';

export default function RootLayout() {
    const checkAuth = useStore((state) => state.checkAuth);
    const { isDark, colors } = useAppTheme();
    // Шрифты платформы: Inter — текст, Unbounded — заголовки. Не загрузились
    // (нет места, сбой) — приложение всё равно открывается, на системном шрифте.
    const [fontsLoaded, fontError] = useFonts({
        Inter_400Regular,
        Inter_500Medium,
        Inter_600SemiBold,
        Inter_700Bold,
        Unbounded_500Medium,
        Unbounded_600SemiBold,
        Unbounded_700Bold,
    });

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

    if (!fontsLoaded && !fontError) {
        return <View style={{ flex: 1, backgroundColor: colors.background }} />;
    }

    return (
        <>
            <StatusBar style={isDark ? "light" : "dark"} />
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: colors.background },
                    headerShadowVisible: false,
                    headerTintColor: colors.text,
                    headerTitleStyle: { fontFamily: FONT.display, fontSize: 16 },
                    contentStyle: { backgroundColor: colors.background },
                }}
            >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ headerShown: false }} />
                <Stack.Screen name="exchange" options={{ headerShown: false }} />
                <Stack.Screen name="park-invite/[code]" options={{ headerShown: false }} />
            </Stack>
        </>
    );
}
