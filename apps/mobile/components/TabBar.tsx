import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { FONT, type AppColors } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Значок вкладки. Выбранная — графитовая пилюля с белым значком, как
 * активный пункт верхнего меню кабинета; остальные — контурные, серые.
 */
export function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
    const { colors } = useAppTheme();
    const outline = `${name}-outline` as IconName;
    return (
        <View
            style={{
                width: 54,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? colors.primary : 'transparent',
            }}
        >
            <Ionicons name={focused ? name : outline} size={19} color={focused ? colors.primaryFg : colors.textTertiary} />
        </View>
    );
}

/** Плавающая панель вкладок — общая для водителя компании и водителя биржи. */
export function useTabScreenOptions() {
    const { colors, isDark } = useAppTheme();
    const insets = useSafeAreaInsets();
    return tabScreenOptions(colors, isDark, insets.bottom);
}

function tabScreenOptions(colors: AppColors, isDark: boolean, bottomInset: number) {
    return {
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
            position: 'absolute' as const,
            bottom: Platform.OS === 'android' ? 16 : bottomInset + 6,
            marginHorizontal: 16,
            height: 76,
            backgroundColor: colors.card,
            borderRadius: 26,
            borderTopWidth: 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderTopColor: colors.border,
            elevation: 8,
            shadowColor: '#101828',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.4 : 0.12,
            shadowRadius: 24,
            paddingTop: 0,
            paddingBottom: 0,
        },
        // Отступы у пункта небольшие: внутри у самой кнопки ещё свои 5 px, и
        // при больших отступах подпись под пилюлей сжималась и обрезалась.
        tabBarItemStyle: {
            paddingTop: 5,
            paddingBottom: 5,
            height: 74,
        },
        // Пилюля выбранной вкладки шире и выше стандартного места под значок.
        tabBarIconStyle: {
            width: 54,
            height: 30,
        },
        // Подпись под значком должна помещаться целиком: со старыми
        // отступами она сжималась до пары пикселей и не читалась.
        tabBarLabelStyle: {
            fontSize: 11,
            lineHeight: 14,
            fontFamily: FONT.semibold,
            marginTop: 4,
        },
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
