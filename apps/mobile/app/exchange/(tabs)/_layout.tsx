import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { exchangeApi } from '@/lib/exchange';
import { TabIcon, useTabScreenOptions } from '@/components/TabBar';

/** Допущенный водитель биржи: лента грузов, свой рейс, профиль. */
export default function ExchangeTabs() {
    const screenOptions = useTabScreenOptions();
    /* «Баланс» — только у водителя парка: водителю с ИП платит заказчик напрямую.
       Был «Заработок»; переименован по задаче владельца от 09.10.2026. */
    const [viaPark, setViaPark] = useState(false);
    useEffect(() => { exchangeApi.me().then((d) => setViaPark(d.kind === 'PARK')).catch(() => undefined); }, []);
    return (
        <Tabs
            screenOptions={screenOptions}
        >
            <Tabs.Screen
                name="loads"
                options={{
                    title: 'Грузы',
                    headerTitle: 'Биржа грузов',
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="cube" focused={focused} />,
                }}
            />
            <Tabs.Screen
                name="trip"
                options={{
                    title: 'Мой рейс',
                    headerTitle: 'Мой рейс',
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="navigate" focused={focused} />,
                }}
            />
            <Tabs.Screen
                name="earnings"
                options={{
                    title: 'Баланс',
                    headerTitle: 'Баланс',
                    href: viaPark ? undefined : null,
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="wallet" focused={focused} />,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Профиль',
                    headerTitle: 'Профиль',
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="person" focused={focused} />,
                }}
            />
        </Tabs>
    );
}
