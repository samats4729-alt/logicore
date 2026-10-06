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
            {/* «История», а не «Рейсы»: рядом с вкладкой «Рейс» водитель путал,
                где текущий рейс, а где прошлые. */}
            <Tabs.Screen
                name="orders"
                options={{
                    title: 'История',
                    tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="time" focused={focused} />,
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
