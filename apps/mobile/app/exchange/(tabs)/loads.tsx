import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverProfile, Load, exchangeApi, ответ } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Button, Chip, Empty } from '@/components/kit';
import { LoadCard } from '@/components/LoadCard';

/**
 * Лента грузов — те, что ищут машину, ближайшие сверху.
 *
 * По умолчанию — только под свой кузов: тентовику рефрижераторные грузы
 * не нужны. Переключатель «Все» — если хочется посмотреть рынок.
 */
export default function LoadsScreen() {
    const { colors } = useAppTheme();
    const [me, setMe] = useState<DriverProfile | null>(null);
    const [onlyMine, setOnlyMine] = useState(true);
    const [loads, setLoads] = useState<Load[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (mine = onlyMine) => {
        try {
            setError(null);
            const profile = me ?? await exchangeApi.me();
            setMe(profile);
            setLoads(await exchangeApi.feed(mine && profile.vehicleBodyType ? profile.vehicleBodyType : undefined));
        } catch (e) {
            setError(ответ(e, 'Не удалось загрузить грузы'));
        }
    }, [me, onlyMine]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const toggle = (mine: boolean) => { setOnlyMine(mine); setLoads(null); load(mine); };
    const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsBar} contentContainerStyle={styles.chips}>
                <Chip label={me?.vehicleBodyType ? `Мой кузов · ${me.vehicleBodyType}` : 'Мой кузов'} active={onlyMine} onPress={() => toggle(true)} />
                <Chip label="Все грузы" active={!onlyMine} onPress={() => toggle(false)} />
            </ScrollView>

            {error ? (
                <Empty icon="cloud-offline-outline" title="Не получилось" text={error} action={<Button title="Повторить" onPress={() => load()} />} />
            ) : !loads ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />
            ) : (
                <FlatList
                    data={loads}
                    keyExtractor={(l: Load) => l.id}
                    contentContainerStyle={{ padding: 16, paddingBottom: 120, flexGrow: 1 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
                    renderItem={({ item }: { item: Load }) => (
                        <LoadCard load={item} onPress={() => router.push(`/exchange/load/${item.id}`)} />
                    )}
                    ListEmptyComponent={
                        <Empty
                            icon="cube-outline"
                            title="Пока грузов нет"
                            text={onlyMine ? 'Под ваш кузов сейчас ничего. Потяните вниз, чтобы обновить, или посмотрите все грузы.' : 'Новые грузы появятся здесь. Потяните вниз, чтобы обновить.'}
                            action={onlyMine ? <Button title="Показать все" variant="secondary" onPress={() => toggle(false)} /> : undefined}
                        />
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    chipsBar: { flexGrow: 0 },
    chips: { gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
});
