import { Tabs } from 'expo-router';
import { TabIcon, useTabScreenOptions } from '@/components/TabBar';

export default function TabsLayout() {
    const screenOptions = useTabScreenOptions();

    // Заголовки экранов — внутри самих экранов (крупный заголовок Unbounded,
    // как в кабинете), поэтому стандартная шапка скрыта.
    return (
        <Tabs screenOptions={{ ...screenOptions, headerShown: false }}>
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Рейс',
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="car" focused={focused} />,
                }}
            />
            <Tabs.Screen
                name="map"
                options={{
                    title: 'Карта',
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="map" focused={focused} />,
                }}
            />
            <Tabs.Screen
                name="orders"
                options={{
                    title: 'Рейсы',
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="documents" focused={focused} />,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Профиль',
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="person" focused={focused} />,
                }}
            />
        </Tabs>
    );
}
