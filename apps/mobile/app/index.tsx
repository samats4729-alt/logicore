import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { isExchangeDriver, useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';

/**
 * Куда вести после запуска.
 *
 * Водитель компании (вход по телефону и паролю) — к своему рейсу.
 * Водитель биржи (вход через Google, без компании) — на биржу: там анкета,
 * пока его не допустили, и грузы, когда допустили.
 */
export default function IndexScreen() {
    const { isAuthenticated, isLoading, user } = useStore();
    const { colors } = useAppTheme();

    if (isLoading) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.text} />
            </View>
        );
    }

    if (!isAuthenticated) return <Redirect href="/login" />;
    if (isExchangeDriver(user)) return <Redirect href="/exchange" />;
    return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
