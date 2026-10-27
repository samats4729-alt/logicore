import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverProfile, ExchangeOrder, OfferInput, exchangeApi, груз, деньги, загрузкаСловами, когда, ответ, суммаЗаРейс } from '@/lib/exchange';
import { BRAND, FONT } from '@/lib/theme';
import { Button, Card, Empty, Row } from '@/components/kit';
import { OfferSheet } from '@/components/OfferSheet';
import { TripMoneyLines } from '@/components/TripMoney';

const POINT_TITLE: Record<ExchangeOrder['points'][number]['type'], string> = {
    PICKUP: 'Погрузка',
    ADDITIONAL_PICKUP: 'Догруз',
    DELIVERY: 'Выгрузка',
};

/**
 * Заявка с биржи.
 *
 * Всё, чтобы решить «повезу или нет»: маршрут по точкам с датами, груз,
 * сумма за рейс с расшифровкой — на руки, топливо (лимит на заправку) и
 * пенсионные (шеф, 27.10.2026) — и что ещё важно компании. Налоги, которые
 * парк платит сверху, и цену компании водитель не видит (Q14). Точные адреса компания откроет тому, кого
 * выберет. Внизу — отклик: «согласен за цену компании» одной кнопкой или
 * своя цена. Решает компания; пока не решила, отклик можно отозвать.
 */
export default function OrderScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const [order, setOrder] = useState<ExchangeOrder | null>(null);
    const [me, setMe] = useState<DriverProfile | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sheet, setSheet] = useState(false);
    const [busy, setBusy] = useState(false);

    const fetch = useCallback(async () => {
        try {
            setError(null);
            const [o, d] = await Promise.all([exchangeApi.order(id), exchangeApi.me()]);
            setOrder(o);
            setMe(d);
        } catch (e) {
            setError(ответ(e, 'Заявка недоступна'));
        }
    }, [id]);
    useEffect(() => { fetch(); }, [fetch]);

    const send = async (input: OfferInput) => {
        if (!order) return;
        setBusy(true);
        try {
            const myOffer = await exchangeApi.offer(order.id, input);
            setOrder({ ...order, myOffer });
            setSheet(false);
            Alert.alert('Отклик отправлен', 'Компания увидит его вместе с другими и выберет исполнителя. Если выберут вас — рейс появится во вкладке «Мой рейс».');
        } catch (e) {
            Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
        } finally {
            setBusy(false);
        }
    };

    const agree = () => {
        if (!order || order.price == null) return;
        const t = order.trip;
        Alert.alert(
            t ? `Согласны на рейс за ${деньги(t.total)}?` : `Согласны за ${деньги(order.price)} на руки?`,
            (t ? `На руки — ${деньги(t.onHand)}, топливо — ${деньги(t.fuel)}, пенсионные — ${деньги(t.opv)}.\n\n` : '')
                + 'Компания увидит ваш отклик и решит, кто повезёт. Пока не решила — отклик можно отозвать.',
            [{ text: 'Отмена', style: 'cancel' }, { text: 'Откликнуться', onPress: () => send({ agree: true }) }],
        );
    };

    /** Свой отклик — тоже суммой за рейс, если сервер прислал топливо и долю ОПВ. */
    const mineTotal = (onHand: number, agreed: boolean) => {
        if (agreed && order?.trip) return order.trip.total;
        if (order?.opvPct == null) return null;
        return суммаЗаРейс(onHand, order.fuel?.amount ?? 0, order.opvPct).total;
    };

    const withdraw = () => {
        if (!order) return;
        Alert.alert('Отозвать отклик?', 'Компания больше не увидит его среди откликов.', [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Отозвать',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await exchangeApi.withdraw(order.id);
                        setOrder({ ...order, myOffer: order.myOffer ? { ...order.myOffer, status: 'WITHDRAWN' } : null });
                    } catch (e) {
                        Alert.alert('Не получилось', ответ(e, 'Попробуйте ещё раз'));
                    }
                },
            },
        ]);
    };

    if (error) {
        return <Empty icon="alert-circle-outline" title="Заявка недоступна" text={error} action={<Button title="Назад к грузам" onPress={() => router.back()} />} />;
    }
    if (!order || !me) {
        return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={BRAND.primary} /></View>;
    }

    const mine = order.myOffer;
    const temp = order.tempMin != null || order.tempMax != null ? `${order.tempMin ?? '…'}…${order.tempMax ?? '…'} °C` : null;

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 150 }}>
                <Text style={[styles.head, { color: colors.textTertiary }]}>Заявка {order.orderNumber}{order.companyName ? ` · ${order.companyName}` : ''}</Text>

                <Card>
                    {order.points.map((p, i) => (
                        <View key={i} style={styles.point}>
                            <View style={styles.pointRail}>
                                <View style={[styles.dot, p.type === 'DELIVERY'
                                    ? { borderWidth: 2, borderColor: colors.text, backgroundColor: 'transparent' }
                                    : { backgroundColor: colors.text }]} />
                                {i < order.points.length - 1 && <View style={[styles.line, { backgroundColor: colors.border }]} />}
                            </View>
                            <View style={{ flex: 1, paddingBottom: i < order.points.length - 1 ? 14 : 0 }}>
                                <Text style={[styles.city, { color: colors.text }]}>{p.city}</Text>
                                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                                    {POINT_TITLE[p.type]} · {когда(p.date)}
                                </Text>
                            </View>
                        </View>
                    ))}
                    <Text style={[styles.addrNote, { color: colors.textTertiary, borderTopColor: colors.border }]}>
                        Точные адреса компания откроет тому, кого выберет исполнителем.
                    </Text>
                </Card>

                <Card>
                    {/* Сумма за рейс и из чего она (шеф, 27.10.2026): видя только
                        «на руки», водитель не понимал, что топливо и пенсионные —
                        тоже его, и не брал рейс. Старый сервер расшифровку не
                        присылает — тогда как раньше, одна сумма на руки. */}
                    {order.trip ? (
                        <>
                            <Text style={[styles.priceLabel, { color: colors.textTertiary }]}>СУММА ЗА РЕЙС</Text>
                            <Text style={[styles.price, { color: colors.text }]}>{деньги(order.trip.total)}</Text>
                            <TripMoneyLines money={order.trip} opvPct={order.opvPct} distanceKm={order.distanceKm} liters={order.fuel?.liters} />
                        </>
                    ) : (
                        <>
                            <Text style={[styles.priceLabel, { color: colors.textTertiary }]}>ВЫ ПОЛУЧИТЕ НА РУКИ</Text>
                            <Text style={[styles.price, { color: colors.text }]}>{order.price != null ? деньги(order.price) : 'Цена договорная'}</Text>
                        </>
                    )}
                </Card>

                <Card>
                    <Row icon="cube-outline" label="Что везём" value={order.cargoDescription || '—'} />
                    <Row icon="bus-outline" label="Кузов и вес" value={груз(order) || '—'} />
                    {order.palletCount != null && <Row icon="grid-outline" label="Паллет" value={String(order.palletCount)} />}
                    {order.loadingTypes.length > 0 && <Row icon="swap-vertical-outline" label="Загрузка" value={загрузкаСловами(order.loadingTypes)} />}
                    {temp && <Row icon="thermometer-outline" label="Температура" value={temp} />}
                    {order.adr && <Row icon="warning-outline" label="Опасный груз" value={order.adrClass ? `ДОПОГ, класс ${order.adrClass}` : 'ДОПОГ'} />}
                    {!!order.requirements && <Row icon="alert-circle-outline" label="Требования" value={order.requirements} />}
                </Card>

                {!!order.note && (
                    <Card>
                        <Text style={[styles.priceLabel, { color: colors.textTertiary }]}>ОТ КОМПАНИИ</Text>
                        <Text style={{ color: colors.text, fontSize: 14.5, lineHeight: 20, marginTop: 4 }}>{order.note}</Text>
                    </Card>
                )}
            </ScrollView>

            <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border2, paddingBottom: Math.max(insets.bottom, 12) }]}>
                {mine && mine.status === 'ACTIVE' ? (
                    <>
                        <Text style={[styles.footerStatus, { color: colors.text }]}>
                            {(() => {
                                const total = mineTotal(mine.price, mine.agreed);
                                return total != null
                                    ? `Вы откликнулись: ${деньги(total)} за рейс, на руки ${деньги(mine.price)}`
                                    : `Вы откликнулись: ${деньги(mine.price)} на руки`;
                            })()}{mine.agreed ? ' — по цене компании' : ''}
                        </Text>
                        <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
                            Ждём решения компании. Если выберут вас — рейс появится во вкладке «Мой рейс».
                        </Text>
                        <View style={styles.footerRow}>
                            <Button title="Отозвать" variant="danger" onPress={withdraw} style={{ flex: 1 }} />
                            <Button title="Изменить сумму" variant="secondary" onPress={() => setSheet(true)} style={{ flex: 1.4 }} />
                        </View>
                    </>
                ) : mine && mine.status === 'ACCEPTED' ? (
                    <>
                        <Text style={[styles.footerStatus, { color: colors.text }]}>Вас выбрали исполнителем</Text>
                        <Button title="Открыть мой рейс" icon="navigate" onPress={() => router.replace('/exchange/(tabs)/trip')} />
                    </>
                ) : mine && mine.status === 'REJECTED' ? (
                    <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
                        Компания выбрала другого исполнителя или сняла заявку с биржи.
                    </Text>
                ) : (
                    <>
                        {order.price != null && (
                            <Button
                                title={order.trip ? `Согласен за ${деньги(order.trip.total)}` : `Согласен за ${деньги(order.price)} на руки`}
                                icon="checkmark"
                                loading={busy}
                                onPress={agree}
                            />
                        )}
                        <Button
                            title={order.price != null ? 'Предложить свою сумму' : 'Предложить сумму'}
                            variant={order.price != null ? 'secondary' : 'primary'}
                            onPress={() => setSheet(true)}
                            style={{ marginTop: order.price != null ? 8 : 0 }}
                        />
                    </>
                )}
            </View>

            <OfferSheet visible={sheet} mine={mine} busy={busy} fuel={order.fuel?.amount ?? 0} opvPct={order.opvPct} onSubmit={send} onClose={() => setSheet(false)} />
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    head: { fontFamily: FONT.bold, marginBottom: 10 },
    point: { flexDirection: 'row', gap: 12 },
    pointRail: { alignItems: 'center', width: 12 },
    dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
    line: { width: 2, flex: 1, marginTop: 2 },
    city: { fontSize: 17, fontFamily: FONT.bold, letterSpacing: -0.3 },
    addrNote: { fontSize: 12.5, marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
    priceLabel: { fontSize: 11, fontFamily: FONT.bold, letterSpacing: 1.2 },
    price: { fontSize: 30, fontFamily: FONT.bold, letterSpacing: -0.8, marginTop: 2 },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    footerNote: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
    footerStatus: { fontSize: 15, fontFamily: FONT.bold, marginBottom: 4 },
    footerRow: { flexDirection: 'row', gap: 10 },
});
