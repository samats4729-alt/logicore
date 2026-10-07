import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverProfile, ExchangeOrder, MyOffer, exchangeApi, грузов, ответ } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Button, Card, Chip, Empty } from '@/components/kit';
import { LoadCard } from '@/components/LoadCard';

/**
 * Лента грузов — те, что ищут машину, ближайшие сверху.
 *
 * По умолчанию — только под свой кузов: тентовику рефрижераторные грузы
 * не нужны. Переключатель «Все» — если хочется посмотреть рынок. Второй
 * ряд — откуда: водитель обычно ищет груз там, где стоит сейчас.
 */
export default function LoadsScreen() {
    const { colors } = useAppTheme();
    const [me, setMe] = useState<DriverProfile | null>(null);
    const [onlyMine, setOnlyMine] = useState(true);
    const [from, setFrom] = useState<string | null>(null);
    const [loads, setLoads] = useState<ExchangeOrder[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [myOffers, setMyOffers] = useState<MyOffer[]>([]);

    const load = useCallback(async (mine = onlyMine) => {
        try {
            setError(null);
            const profile = me ?? await exchangeApi.me();
            setMe(profile);
            const [feed, offers] = await Promise.all([
                exchangeApi.feed(mine && profile.vehicleBodyType ? profile.vehicleBodyType : undefined),
                exchangeApi.myOffers().catch(() => [] as MyOffer[]),
            ]);
            setLoads(feed);
            setMyOffers(offers);
        } catch (e) {
            setError(ответ(e, 'Не удалось загрузить заявки — проверьте интернет'));
        }
    }, [me, onlyMine]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const toggle = (mine: boolean) => { setOnlyMine(mine); setFrom(null); setLoads(null); load(mine); };
    const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    /** Города погрузки из ленты — частые первыми. Один город — ряд не нужен. */
    const cities = useMemo(() => {
        const count = new Map<string, number>();
        (loads ?? []).forEach((l) => count.set(l.from, (count.get(l.from) ?? 0) + 1));
        return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [loads]);
    const shown = useMemo(() => (loads ?? []).filter((l) => !from || l.from === from), [loads, from]);

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsBar} contentContainerStyle={styles.chips}>
                <Chip label={me?.vehicleBodyType ? `Мой кузов · ${me.vehicleBodyType}` : 'Мой кузов'} active={onlyMine} onPress={() => toggle(true)} />
                <Chip label="Все кузова" active={!onlyMine} onPress={() => toggle(false)} />
            </ScrollView>
            {cities.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsBar} contentContainerStyle={styles.chips}>
                    <Chip label="Откуда угодно" active={!from} onPress={() => setFrom(null)} />
                    {cities.map(([city, n]) => (
                        <Chip key={city} label={`${city} · ${n}`} active={from === city} onPress={() => setFrom(from === city ? null : city)} />
                    ))}
                </ScrollView>
            )}

            {error ? (
                <Empty icon="cloud-offline-outline" title="Не получилось" text={error} action={<Button title="Повторить" onPress={() => load()} />} />
            ) : !loads ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />
            ) : (
                <FlatList
                    data={shown}
                    keyExtractor={(l: ExchangeOrder) => l.id}
                    contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 120, flexGrow: 1 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
                    ListHeaderComponent={
                        <>
                            <OffersStrip offers={myOffers} />
                            {shown.length > 0 && (
                                <Text style={[styles.count, { color: colors.textTertiary }]}>
                                    {грузов(shown.length)}{from ? ` из ${from}` : ''} · ближайшие сверху
                                </Text>
                            )}
                        </>
                    }
                    renderItem={({ item }: { item: ExchangeOrder }) => (
                        <LoadCard order={item} onPress={() => router.push(`/exchange/load/${item.id}`)} />
                    )}
                    ListEmptyComponent={
                        <Empty
                            icon="cube-outline"
                            title={onlyMine ? 'Под ваш кузов грузов нет' : 'Пока грузов нет'}
                            text={onlyMine
                                ? 'Потяните экран вниз, чтобы проверить новые. Или посмотрите грузы под другие кузова.'
                                : 'Потяните экран вниз, чтобы проверить новые.'}
                            action={onlyMine ? <Button title="Показать все кузова" variant="secondary" onPress={() => toggle(false)} /> : undefined}
                        />
                    }
                />
            )}
        </View>
    );
}

/**
 * Мои отклики — над лентой. Главное: выбрали — сразу к рейсу. Иначе —
 * сколько откликов ждут решения и кого обошли за последние дни, чтобы
 * водитель не гадал, куда делась заявка из ленты.
 */
function OffersStrip({ offers }: { offers: MyOffer[] }) {
    const { colors } = useAppTheme();
    const recent = (o: MyOffer) => Date.now() - new Date(o.updatedAt).getTime() < 3 * 86_400_000;
    const accepted = offers.find((o) => o.status === 'ACCEPTED' && recent(o));
    const waiting = offers.filter((o) => o.status === 'ACTIVE').length;
    const rejected = offers.filter((o) => o.status === 'REJECTED' && recent(o));
    if (!accepted && !waiting && !rejected.length) return null;
    return (
        <View style={{ marginBottom: 10 }}>
            {accepted && (
                <Card onPress={() => router.push('/exchange/(tabs)/trip')} style={{ backgroundColor: '#e7f8ef', borderColor: '#bbf7d0' }}>
                    <Text style={{ color: '#14532d', fontWeight: '800', fontSize: 15 }}>Вас выбрали: {accepted.from} → {accepted.to}</Text>
                    <Text style={{ color: '#166534', fontSize: 13, marginTop: 2 }}>Заявка {accepted.orderNumber}. Откройте «Мой рейс» — там адреса и шаги.</Text>
                </Card>
            )}
            {waiting > 0 && (
                <Text style={[styles.count, { color: colors.textSecondary, marginBottom: 4 }]}>Ваших откликов ждут решения: {waiting}</Text>
            )}
            {rejected.map((o) => (
                <Text key={o.id} style={[styles.count, { color: colors.textTertiary, marginBottom: 4 }]}>
                    Выбрали другого: {o.from} → {o.to}
                </Text>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    chipsBar: { flexGrow: 0 },
    chips: { gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
    count: { fontSize: 12.5, fontWeight: '600', marginBottom: 10, marginLeft: 2 },
});
