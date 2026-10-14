import { Tabs } from 'expo-router';
import { PillTabBar, TabIcon, useTabScreenOptions } from '@/components/TabBar';

export default function TabsLayout() {
    const screenOptions = useTabScreenOptions();

    // Заголовки экранов — внутри самих экранов (крупный заголовок Unbounded,
    // как в кабинете), поэтому стандартная шапка скрыта.
    return (
        <Tabs screenOptions={{ ...screenOptions, headerShown: false }} tabBar={(props: any) => <PillTabBar {...props} />}>
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Рейс',
                    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name="car" focused={focused} color={color} />,
                }}
            />
            <Tabs.Screen
                name="map"
                options={{
                    title: 'Карта',
                    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name="map" focused={focused} color={color} />,
                }}
            />
            {/* «История», а не «Рейсы»: рядом с вкладкой «Рейс» водитель путал,
                где текущий рейс, а где прошлые. */}
            <Tabs.Screen
                name="orders"
                options={{
                    title: 'История',
                    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name="time" focused={focused} color={color} />,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Профиль',
                    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => <TabIcon name="person" focused={focused} color={color} />,
                }}
            />
        </Tabs>
    );
}
