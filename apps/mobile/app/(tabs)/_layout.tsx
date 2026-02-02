import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function TabsLayout() {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();

    // Android navigation bar adjustment
    const androidBottomPadding = 12;
    const iosBottomPadding = insets.bottom > 0 ? insets.bottom : 20;
    const paddingBottom = Platform.OS === 'android' ? androidBottomPadding : iosBottomPadding;

    // Calculate total height: Base (60) + Padding
    const tabBarHeight = 60 + paddingBottom;

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
                    shadowOpacity: 0.25,
                    shadowRadius: 10,
                    paddingTop: 0,
                    paddingBottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                },
                tabBarItemStyle: {
                    paddingVertical: 10,
                    height: 65,
                },
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '600',
                    marginBottom: 5,
                },
                headerStyle: {
                    backgroundColor: colors.card,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    elevation: 0,
                    shadowOpacity: 0,
                },
                headerTintColor: colors.text,
                headerTitleStyle: {
                    fontWeight: 'bold',
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Рейс',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="car" size={size} color={color} />
                    ),
                    headerTitle: 'Активный рейс',
                }}
            />
            <Tabs.Screen
                name="map"
                options={{
                    title: 'Карта',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="map" size={size} color={color} />
                    ),
                    headerShown: false,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Профиль',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="person" size={size} color={color} />
                    ),
                    headerTitle: 'Профиль',
                }}
            />
        </Tabs>
    );
}
