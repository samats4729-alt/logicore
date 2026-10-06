import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { exchangeApi } from '@/lib/exchange';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';

/** Допущенный водитель биржи: лента грузов, свой рейс, профиль. */
export default function ExchangeTabs() {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    /* «Заработок» — только у водителя парка: водителю с ИП платит заказчик напрямую. */
    const [viaPark, setViaPark] = useState(false);
    useEffect(() => { exchangeApi.me().then((d) => setViaPark(d.kind === 'PARK')).catch(() => undefined); }, []);
    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: isDark ? '#888' : '#8E8E93',
                tabBarStyle: {
                    position: 'absolute',
                    bottom: Platform.OS === 'android' ? 20 : insets.bottom + 10,
                    marginHorizontal: 20,
                    height: 65,
                    backgroundColor: colors.card,
                    borderRadius: 35,
                    borderTopWidth: 0,
                    elevation: 5,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.2,
                    shadowRadius: 10,
                },
                tabBarItemStyle: { paddingTop: 6, paddingBottom: 10, height: 65 },
                tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
                headerStyle: { backgroundColor: colors.card },
                headerShadowVisible: false,
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '800' },
            }}
        >
            <Tabs.Screen
                name="loads"
                options={{
                    title: 'Грузы',
                    headerTitle: 'Биржа грузов',
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="cube" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="trip"
                options={{
                    title: 'Мой рейс',
                    headerTitle: 'Мой рейс',
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="navigate" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="earnings"
                options={{
                    title: 'Заработок',
                    headerTitle: 'Заработок',
                    href: viaPark ? undefined : null,
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="wallet" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Профиль',
                    headerTitle: 'Профиль',
                    tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name="person" size={size} color={color} />,
                }}
            />
        </Tabs>
    );
}
