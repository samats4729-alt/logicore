import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONT, type AppColors } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Высота капсулы вкладок. */
const TAB_BAR_HEIGHT = 64;

/**
 * Отступ капсулы от низа экрана — над системной полосой телефона.
 *
 * Раньше на Android он был постоянным (16 точек) и не учитывал полосу кнопок
 * «назад / домой / недавние»: на телефонах с кнопками, а не жестами, меню
 * приложения ложилось под неё (жалоба владельца, 14.10.2026). Теперь высота
 * системной полосы прибавляется всегда — и на Android, и на iPhone.
 */
const tabBarBottom = (bottomInset: number) => Math.max(bottomInset, Platform.OS === 'android' ? 8 : 0) + 10;

/** Сколько места снизу занимает плавающая капсула вкладок: от края экрана до её верха. */
export function useTabBarSpace() {
    const insets = useSafeAreaInsets();
    return tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT;
}

/** Значок вкладки: у выбранной — залитый, у остальных — контурный. */
export function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color?: string }) {
    const outline = `${name}-outline` as IconName;
    return <Ionicons name={focused ? name : outline} size={21} color={color} />;
}

/* Описания навигатора вкладок — только то, что нужно капсуле (типы
   @react-navigation/bottom-tabs из приложения не видны). */
type TabRoute = { key: string; name: string; params?: object };
type TabOptions = {
    title?: string;
    tabBarIcon?: (p: { focused: boolean; color: string; size: number }) => React.ReactNode;
    tabBarItemStyle?: { display?: string } | unknown;
    tabBarAccessibilityLabel?: string;
};
type TabBarProps = {
    state: { index: number; routes: TabRoute[] };
    descriptors: Record<string, { options: TabOptions }>;
    navigation: {
        emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
        navigate: (name: string, params?: object) => void;
    };
};

/**
 * Плавающая капсула вкладок (по образцу владельца, 14.10.2026): белая
 * капсула над экраном, выбранный раздел — чёрная пилюля со значком и
 * подписью, остальные — только значки. Общая для водителя компании и
 * водителя биржи. Скрытые вкладки (`href: null`) не показываются.
 */
export function PillTabBar({ state, descriptors, navigation }: TabBarProps) {
    const { colors, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    const visible = state.routes
        .map((route, index) => ({ route, index, options: descriptors[route.key].options }))
        .filter(({ options }) => (options.tabBarItemStyle as { display?: string } | undefined)?.display !== 'none');

    return (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: tabBarBottom(insets.bottom) }]}>
            <View
                style={[
                    styles.bar,
                    // Светлая тема — белая капсула с тенью, как на образце; тёмная — чуть светлее фона, с тонкой рамкой.
                    { backgroundColor: colors.surface2, borderColor: isDark ? colors.border : colors.surface2 },
                    isDark ? null : styles.barShadow,
                ]}
            >
                {visible.map(({ route, index, options }) => {
                    const focused = state.index === index;
                    const label = options.title ?? route.name;
                    const fg = focused ? colors.primaryFg : colors.textTertiary;
                    const press = () => {
                        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                        if (focused || event.defaultPrevented) return;
                        LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
                        navigation.navigate(route.name, route.params);
                    };
                    return (
                        <Pressable
                            key={route.key}
                            onPress={press}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: focused }}
                            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                            hitSlop={4}
                            style={({ pressed }: { pressed: boolean }) => [
                                styles.item,
                                focused && [styles.itemOn, { backgroundColor: colors.primary }],
                                { opacity: pressed && !focused ? 0.6 : 1 },
                            ]}
                        >
                            {options.tabBarIcon?.({ focused, color: fg, size: 21 })}
                            {focused && <Text style={[styles.label, { color: fg }]} numberOfLines={1}>{label}</Text>}
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

/** Общие настройки вкладок: шапки и фон экранов. Саму капсулу рисует `PillTabBar`. */
export function useTabScreenOptions() {
    const { colors } = useAppTheme();
    return tabScreenOptions(colors);
}

function tabScreenOptions(colors: AppColors) {
    return {
        headerStyle: {
            backgroundColor: colors.background,
            elevation: 0,
            shadowOpacity: 0,
        },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleAlign: 'left' as const,
        headerTitleStyle: {
            fontFamily: FONT.display,
            fontSize: 17,
        },
        sceneStyle: { backgroundColor: colors.background },
    };
}

const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        height: TAB_BAR_HEIGHT,
        padding: 6,
        borderRadius: TAB_BAR_HEIGHT / 2,
        borderWidth: 1,
    },
    barShadow: {
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 28,
        elevation: 10,
    },
    item: {
        height: TAB_BAR_HEIGHT - 12,
        minWidth: 56,
        borderRadius: (TAB_BAR_HEIGHT - 12) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    itemOn: { paddingHorizontal: 20 },
    label: { fontFamily: FONT.semibold, fontSize: 14, letterSpacing: -0.2 },
});
