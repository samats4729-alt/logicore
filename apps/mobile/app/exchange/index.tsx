import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/store';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverProfile, exchangeApi, вКавычках, телефонКрасиво, ответ } from '@/lib/exchange';
import { Button, Card, Empty } from '@/components/kit';

/**
 * Развилка биржи.
 *
 * Допущен — сразу к грузам. Анкета не отправлена — к анкете. Отправлена и
 * ждёт парка, получила отказ или водителя заблокировали — честный экран о
 * том, что происходит и что делать.
 */
export default function ExchangeGate() {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const logout = useStore((s) => s.logout);
    const [driver, setDriver] = useState<DriverProfile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            setError(null);
            setDriver(await exchangeApi.me());
        } catch (e) {
            setError(ответ(e, 'Не удалось загрузить анкету'));
        }
    }, []);

    // Каждый раз при возврате на экран: парк мог допустить, пока водитель ждал.
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
    const exit = async () => { await logout(); router.replace('/login'); };

    if (error) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                <Empty icon="cloud-offline-outline" title="Нет связи" text={error} action={<Button title="Повторить" onPress={load} />} />
            </View>
        );
    }
    if (!driver) {
        return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color="#1677ff" /></View>;
    }
    if (driver.status === 'APPROVED') return <Redirect href="/exchange/(tabs)/loads" />;
    if (driver.status === 'DRAFT') return <Redirect href="/exchange/onboarding" />;

    const view = {
        PENDING: {
            icon: 'time-outline' as const,
            title: 'Анкета на проверке',
            text: `Парк ${вКавычках(driver.park?.name)} смотрит документы и может позвонить вам на ${driver.phone ? телефонКрасиво(driver.phone) : 'указанный номер'}. Как только допустят — здесь появятся грузы.`,
        },
        REJECTED: {
            icon: 'alert-circle-outline' as const,
            title: 'Нужно исправить анкету',
            text: driver.rejectReason ? `Парк ответил: «${driver.rejectReason}». Исправьте и отправьте снова.` : 'Парк вернул анкету. Исправьте и отправьте снова.',
        },
        BLOCKED: {
            icon: 'ban-outline' as const,
            title: 'Доступ к бирже закрыт',
            text: driver.blockedReason ? `Причина: ${driver.blockedReason}.` : 'Вас заблокировали на бирже.',
        },
    }[driver.status];

    return (
        <ScrollView
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={{ padding: 20, paddingTop: insets.top + 40, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
            <Empty icon={view.icon} title={view.title} text={view.text} />
            {driver.status === 'REJECTED' && (
                <Button title="Исправить анкету" icon="create-outline" onPress={() => router.push('/exchange/onboarding')} />
            )}
            {driver.status === 'PENDING' && (
                <>
                    <Card>
                        <Text style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 }}>
                            Обычно проверка занимает до одного рабочего дня. Чтобы узнать, допустили ли вас, нажмите «Проверить сейчас».
                        </Text>
                    </Card>
                    <Button title="Проверить сейчас" icon="refresh-outline" loading={refreshing} onPress={refresh} />
                </>
            )}
            <Button title="Выйти" variant="secondary" icon="log-out-outline" onPress={exit} style={{ marginTop: 12 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
});
