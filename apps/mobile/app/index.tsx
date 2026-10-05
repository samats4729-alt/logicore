import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { isExchangeDriver, useStore } from '@/store';

/**
 * Куда вести после запуска.
 *
 * Водитель компании (вход по телефону и паролю) — к своему рейсу.
 * Водитель биржи (вход через Google, без компании) — на биржу: там анкета,
 * пока его не допустили, и грузы, когда допустили.
 */
export default function IndexScreen() {
    const { isAuthenticated, isLoading, user } = useStore();

    if (isLoading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#1677ff" />
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
        backgroundColor: '#f5f5f5',
    },
});
