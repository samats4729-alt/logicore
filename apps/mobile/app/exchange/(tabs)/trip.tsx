import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Load, exchangeApi, груз, деньги, когда, телефонКрасиво, ответ } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Badge, Button, Card, Empty, Route } from '@/components/kit';
import { Sheet, SheetOption } from '@/components/Sheet';

const STEPS: { key: 'TAKEN' | 'IN_TRANSIT' | 'DELIVERED'; title: string }[] = [
    { key: 'TAKEN', title: 'Взял груз' },
    { key: 'IN_TRANSIT', title: 'Погрузился' },
    { key: 'DELIVERED', title: 'Доставил' },
];

const RELEASE_REASONS = ['Сломалась машина', 'Не успеваю к погрузке', 'Заболел', 'Другое'];

/**
 * Навигаторы для адреса: координат у адреса груза нет — ищем по тексту.
 * Нет приложения на телефоне — открываем сайт того же навигатора.
 */
function navigators(city: string, address: string | null): SheetOption[] {
    const q = encodeURIComponent([city, address].filter(Boolean).join(', '));
    return [
        { label: '2ГИС', icon: 'map-outline', onPress: () => { Linking.openURL(`dgis://2gis.ru/search/${q}`).catch(() => Linking.openURL(`https://2gis.kz/search/${q}`)); } },
        { label: 'Яндекс Карты', icon: 'navigate-circle-outline', onPress: () => { Linking.openURL(`yandexmaps://maps.yandex.ru/?text=${q}`).catch(() => Linking.openURL(`https://yandex.kz/maps/?text=${q}`)); } },
        { label: 'Google Maps', icon: 'globe-outline', onPress: () => { Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`); } },
    ];
}

/**
 * Мой рейс: что везу, куда, следующий шаг одной большой кнопкой.
 * Ниже — довезённые грузы.
 */
export default function TripScreen() {
    const { colors } = useAppTheme();
    const [trips, setTrips] = useState<Load[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [sheet, setSheet] = useState<'nav' | 'release' | null>(null);

    const load = useCallback(async () => {
        try {
            setError(null);
            setTrips(await exchangeApi.trips());
        } catch (e) {
            setError(ответ(e, 'Не удалось загрузить рейсы'));
        }
    }, []);
    useFocusEffect(useCallback(() => { load(); }, [load]));
    const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    if (error) return <Empty icon="cloud-offline-outline" title="Не получилось" text={error} action={<Button title="Повторить" onPress={load} />} />;
    if (!trips) return <ActivityIndicator style={{ marginTop: 40 }} size="large" color={BRAND.primary} />;

    const active = trips.find((t) => t.status === 'TAKEN' || t.status === 'IN_TRANSIT') ?? null;
    const done = trips.filter((t) => t.status === 'DELIVERED');

    const advance = (to: 'IN_TRANSIT' | 'DELIVERED') => {
        if (!active) return;
        Alert.alert(
            to === 'IN_TRANSIT' ? 'Погрузились?' : 'Доставили груз?',
            to === 'IN_TRANSIT' ? 'Заказчик увидит, что груз в пути.' : 'Заказчик увидит, что груз доставлен.',
            [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Да',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            await exchangeApi.advance(active.id, to);
                            await load();
                            if (to === 'DELIVERED') Alert.alert('Рейс закрыт', 'Груз отмечен доставленным, заказчик это видит. Можно брать следующий.');
                        }
                        catch (e) { Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз')); }
                        finally { setBusy(false); }
                    },
                },
            ],
        );
    };

    const release = async (reason: string) => {
        if (!active) return;
        try {
            await exchangeApi.release(active.id, reason);
            await load();
            Alert.alert('Вы сняты с рейса', 'Груз вернулся на биржу, заказчик это видит.');
        }
        catch (e) { Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз')); }
    };

    const reached = active ? STEPS.findIndex((s) => s.key === active.status) : -1;

    return (
        <ScrollView
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
            {active ? (
                <>
                    <Card>
                        <View style={styles.headRow}>
                            <Text style={{ color: colors.textTertiary, fontWeight: '700' }}>{active.number} · {когда(active)}</Text>
                            <Badge label={active.status === 'TAKEN' ? 'Еду на погрузку' : 'В пути'} tone="blue" />
                        </View>
                        <Route from={active.originCityName} fromAddress={active.originAddress} to={active.destinationCityName} toAddress={active.destinationAddress} />
                        <View style={styles.navRow}>
                            <Button
                                title={active.status === 'TAKEN' ? 'К погрузке' : 'К выгрузке'}
                                icon="navigate-outline"
                                variant="secondary"
                                onPress={() => setSheet('nav')}
                                style={{ flex: 1 }}
                            />
                            {!!active.contact?.phone && (
                                <Button
                                    title="Позвонить"
                                    icon="call-outline"
                                    variant="secondary"
                                    onPress={() => Linking.openURL(`tel:${active.contact!.phone}`)}
                                    style={{ flex: 1 }}
                                />
                            )}
                        </View>
                        {!!active.contact?.phone && (
                            <Text style={{ color: colors.textTertiary, fontSize: 12.5, marginTop: 8 }}>
                                Отправитель: {[active.contact.name, телефонКрасиво(active.contact.phone)].filter(Boolean).join(' · ')}
                            </Text>
                        )}
                    </Card>

                    {/* Шаги рейса */}
                    <Card>
                        {STEPS.map((s, i) => (
                            <View key={s.key} style={styles.step}>
                                <View style={[styles.stepDot, {
                                    backgroundColor: i <= reached ? BRAND.primary : 'transparent',
                                    borderColor: i <= reached ? BRAND.primary : colors.border,
                                }]}>
                                    {i <= reached && <Ionicons name="checkmark" size={14} color="#fff" />}
                                </View>
                                <Text style={{ color: i <= reached ? colors.text : colors.textTertiary, fontSize: 15, fontWeight: i === reached + 1 ? '800' : '600' }}>
                                    {s.title}
                                </Text>
                            </View>
                        ))}
                    </Card>

                    <Button
                        title={active.status === 'TAKEN' ? 'Погрузился — выезжаю' : 'Доставил груз'}
                        icon={active.status === 'TAKEN' ? 'arrow-forward-circle-outline' : 'checkmark-done-outline'}
                        loading={busy}
                        onPress={() => advance(active.status === 'TAKEN' ? 'IN_TRANSIT' : 'DELIVERED')}
                    />

                    <Card style={{ marginTop: 12 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13.5 }}>{active.cargoDescription} · {груз(active)}</Text>
                        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 6 }}>{деньги(active.price)}</Text>
                    </Card>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Button title="Подробнее" variant="secondary" icon="document-text-outline" onPress={() => router.push(`/exchange/load/${active.id}`)} style={{ flex: 1 }} />
                        {active.status === 'TAKEN' && (
                            <Button title="Сняться" variant="danger" icon="close-circle-outline" onPress={() => setSheet('release')} style={{ flex: 1 }} />
                        )}
                    </View>

                    <Sheet
                        visible={sheet === 'nav'}
                        title={active.status === 'TAKEN' ? 'Навигатор к погрузке' : 'Навигатор к выгрузке'}
                        text={active.status === 'TAKEN'
                            ? [active.originCityName, active.originAddress].filter(Boolean).join(', ')
                            : [active.destinationCityName, active.destinationAddress].filter(Boolean).join(', ')}
                        options={active.status === 'TAKEN'
                            ? navigators(active.originCityName, active.originAddress)
                            : navigators(active.destinationCityName, active.destinationAddress)}
                        onClose={() => setSheet(null)}
                    />
                    <Sheet
                        visible={sheet === 'release'}
                        title="Сняться с рейса?"
                        text="Груз вернётся на биржу, заказчик увидит это. Отказ запишется в вашу историю — выберите причину."
                        options={RELEASE_REASONS.map((reason) => ({ label: reason, danger: true, onPress: () => release(reason) }))}
                        onClose={() => setSheet(null)}
                    />
                </>
            ) : (
                <Empty
                    icon="navigate-outline"
                    title="Сейчас рейса нет"
                    text="Выберите груз в ленте и нажмите «Беру» — здесь появится маршрут и шаги рейса."
                    action={<Button title="К грузам" icon="cube-outline" onPress={() => router.push('/exchange/(tabs)/loads')} />}
                />
            )}

            {done.length > 0 && (
                <>
                    <Text style={[styles.section, { color: colors.textTertiary }]}>ДОВЕЗЁННЫЕ · {done.length}</Text>
                    {done.map((t) => (
                        <Card key={t.id} onPress={() => router.push(`/exchange/load/${t.id}`)} style={{ paddingVertical: 12 }}>
                            <View style={styles.headRow}>
                                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{t.originCityName} → {t.destinationCityName}</Text>
                                <Text style={{ color: colors.text, fontWeight: '800' }}>{деньги(t.price)}</Text>
                            </View>
                            <Text style={{ color: colors.textTertiary, fontSize: 12.5 }}>
                                {t.number} · доставлен {t.deliveredAt ? new Date(t.deliveredAt).toLocaleDateString('ru-RU') : ''}
                            </Text>
                        </Card>
                    ))}
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    navRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
    stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    section: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: 20, marginBottom: 10 },
});
