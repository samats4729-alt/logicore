import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useStore } from '@/store';
import { FONT } from '@/lib/theme';

/** Биржа — раздел водителя, который пришёл сам, через Google. */
export default function ExchangeLayout() {
    const { colors } = useAppTheme();
    const isLoading = useStore((s) => s.isLoading);
    const isAuthenticated = useStore((s) => s.isAuthenticated);

    // Экраны биржи сразу спрашивают сервер — ждём, пока приложение достанет
    // пропуск, иначе первый запрос уйдёт без него и вход сбросится.
    if (isLoading) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
                <ActivityIndicator size="large" color={colors.text} />
            </View>
        );
    }
    if (!isAuthenticated) return <Redirect href="/login" />;

    return (
        <Stack
            screenOptions={{
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.text,
                headerTitleStyle: { fontFamily: FONT.display, fontSize: 16 },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.background },
            }}
        >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ title: 'Анкета водителя' }} />
            <Stack.Screen name="load/[id]" options={{ title: 'Груз' }} />
            <Stack.Screen name="documents" options={{ title: 'Мои документы' }} />
        </Stack>
    );
}
