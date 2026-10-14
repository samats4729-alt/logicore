import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { exchangeApi } from '@/lib/exchange';
import { PillTabBar, TabIcon, useTabScreenOptions } from '@/components/TabBar';

/** Допущенный водитель биржи: лента грузов, свой рейс, профиль. */
export default function ExchangeTabs() {
    const screenOptions = useTabScreenOptions();
    /* «Баланс» — только у водителя парка: водителю с ИП платит заказчик напрямую.
       Был «Заработок»; переименован по задаче владельца от 09.10.2026. */
    const [viaPark, setViaPark] = useState(false);
    useEffect(() => { exchangeApi.me().then((d) => setViaPark(d.kind === 'PARK')).catch(() => undefined); }, []);
    return (
        <Tabs screenOptions={screenOptions} tabBar={(props: any) => <PillTabBar {...props} />}>
            <Tabs.Screen
                name="loads"
                options={{
                    title: 'Грузы',
                    headerTitle: 'Биржа грузов',
                    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name="cube" focused={focused} color={color} />,
                }}
            />
            <Tabs.Screen
                name="trip"
                options={{
                    title: 'Мой рейс',
                    headerTitle: 'Мой рейс',
                    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name="navigate" focused={focused} color={color} />,
                }}
            />
            <Tabs.Screen
                name="earnings"
                options={{
                    title: 'Баланс',
                    headerTitle: 'Баланс',
                    href: viaPark ? undefined : null,
                    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name="wallet" focused={focused} color={color} />,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Профиль',
                    headerTitle: 'Профиль',
                    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name="person" focused={focused} color={color} />,
                }}
            />
        </Tabs>
    );
}
