import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { API_URL, getAuthHeader } from '@/lib/api';
import { DriverProfile, Load, exchangeApi, loadPhotoPath, груз, деньги, когда, телефонКрасиво, ответ } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Badge, Button, Card, Empty, Route, Row } from '@/components/kit';
import { Sheet } from '@/components/Sheet';

/** Почему не берёт — частые причины одним нажатием. */
const DECLINE_REASONS = ['Не мой кузов', 'Не успеваю к дате', 'Далеко ехать', 'Низкая цена'];

/**
 * Карточка груза.
 *
 * «Беру» — после вопроса: взял груз — обязан отвезти, сняться можно только
 * до погрузки и с причиной. Телефон отправителя открывается тому, кто взял.
 */
export default function LoadScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const [load, setLoad] = useState<Load | null>(null);
    const [me, setMe] = useState<DriverProfile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [photo, setPhoto] = useState<string | null>(null);
    /** Уже везёт другой груз — второй взять нельзя: говорим заранее, а не отказом после «Беру». */
    const [busyWith, setBusyWith] = useState<Load | null>(null);

    const fetch = useCallback(async () => {
        try {
            setError(null);
            const [l, d, trips] = await Promise.all([exchangeApi.load(id), exchangeApi.me(), exchangeApi.trips().catch(() => [] as Load[])]);
            setLoad(l);
            setMe(d);
            setBusyWith(trips.find((t) => t.id !== id && (t.status === 'TAKEN' || t.status === 'IN_TRANSIT')) ?? null);
        } catch (e) {
            setError(ответ(e, 'Груз недоступен'));
        }
    }, [id]);
    useEffect(() => { fetch(); }, [fetch]);

    const take = () => {
        if (!load) return;
        Alert.alert(
            `Взять груз ${load.number}?`,
            `${load.originCityName} → ${load.destinationCityName}, ${когда(load)}.\nВзяли — обязаны отвезти. Сняться можно только до погрузки.`,
            [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Беру',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            await exchangeApi.take(load.id);
                            router.replace('/exchange/(tabs)/trip');
                        } catch (e) {
                            Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
                            fetch();
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ],
        );
    };

    const [declining, setDeclining] = useState(false);
    const decline = async (reason: string) => {
        if (!load) return;
        try {
            await exchangeApi.decline(load.id, reason);
            router.back();
        } catch (e) {
            Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
        }
    };

    if (error) {
        return <Empty icon="alert-circle-outline" title="Груз недоступен" text={error} action={<Button title="Назад к грузам" onPress={() => router.back()} />} />;
    }
    if (!load || !me) {
        return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={BRAND.primary} /></View>;
    }

    const isOpen = load.status === 'OPEN';
    const mine = !isOpen;

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }}>
                <View style={styles.head}>
                    <Text style={{ color: colors.textTertiary, fontWeight: '700' }}>{load.number}</Text>
                    {mine && <Badge label="Ваш рейс" tone="blue" />}
                </View>

                {load.photoIds.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                        {load.photoIds.map((pid) => {
                            const uri = `${API_URL}${loadPhotoPath(pid)}`;
                            return (
                                <Pressable key={pid} onPress={() => setPhoto(uri)} accessibilityLabel="Открыть фото груза">
                                    <Image source={{ uri, headers: getAuthHeader() }} style={styles.photo} />
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                )}

                <Card>
                    <Route from={load.originCityName} fromAddress={load.originAddress} to={load.destinationCityName} toAddress={load.destinationAddress} />
                </Card>

                <Card>
                    <Text style={[styles.priceLabel, { color: colors.textTertiary }]}>ОПЛАТА ЗА РЕЙС</Text>
                    <Text style={[styles.price, { color: colors.text }]}>{деньги(load.price)}</Text>
                    {me.kind === 'PARK' && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 4 }}>
                            Через парк вы получите эту сумму за вычетом комиссии парка и налогов.
                        </Text>
                    )}
                </Card>

                <Card>
                    <Row icon="calendar-outline" label="Погрузка" value={когда(load)} />
                    <Row icon="cube-outline" label="Что везём" value={load.cargoDescription} />
                    <Row icon="bus-outline" label="Кузов и вес" value={груз(load)} />
                    {!!load.requirements && <Row icon="alert-circle-outline" label="Важно" value={load.requirements} />}
                    {!!load.companyName && <Row icon="business-outline" label="Заказчик" value={load.companyName} />}
                </Card>

                {mine && load.contact && (
                    <Card>
                        <Row icon="person-outline" label="Контакт" value={load.contact.name ?? '—'} />
                        {!!load.contact.phone && (
                            <Button
                                title={`Позвонить · ${телефонКрасиво(load.contact.phone)}`}
                                icon="call-outline"
                                variant="secondary"
                                onPress={() => Linking.openURL(`tel:${load.contact!.phone}`)}
                                style={{ marginTop: 8 }}
                            />
                        )}
                    </Card>
                )}
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
                {isOpen && busyWith && (
                    <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
                        Вы везёте {busyWith.number} ({busyWith.originCityName} → {busyWith.destinationCityName}). Новый груз можно взять после доставки.
                    </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    {isOpen && !busyWith ? (
                        <>
                            <Button title="Не подходит" variant="secondary" onPress={() => setDeclining(true)} style={{ flex: 1 }} />
                            <Button title="Беру" icon="checkmark" loading={busy} onPress={take} style={{ flex: 1.4 }} />
                        </>
                    ) : (
                        <Button title="Открыть мой рейс" icon="navigate" onPress={() => router.replace('/exchange/(tabs)/trip')} style={{ flex: 1 }} />
                    )}
                </View>
            </View>

            <Sheet
                visible={declining}
                title="Почему не подходит?"
                text="Груз пропадёт из вашей ленты. Причина поможет подбирать грузы точнее."
                options={DECLINE_REASONS.map((reason) => ({ label: reason, onPress: () => decline(reason) }))}
                onClose={() => setDeclining(false)}
            />

            <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
                <Pressable style={styles.viewer} onPress={() => setPhoto(null)} accessibilityLabel="Закрыть фото">
                    {photo && <Image source={{ uri: photo, headers: getAuthHeader() }} style={styles.viewerImage} resizeMode="contain" />}
                    <Ionicons name="close" size={30} color="#fff" style={[styles.viewerClose, { top: insets.top + 12 }]} />
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    photo: { width: 140, height: 104, borderRadius: 14, backgroundColor: '#e5e7eb' },
    priceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    price: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    footerNote: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
    viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '80%' },
    viewerClose: { position: 'absolute', right: 20 },
});

