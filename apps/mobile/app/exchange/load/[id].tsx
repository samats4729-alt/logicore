import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverProfile, ExchangeOrder, exchangeApi, груз, деньги, когда, ответ } from '@/lib/exchange';
import { BRAND } from '@/lib/theme';
import { Button, Card, Empty, Row } from '@/components/kit';

const POINT_TITLE: Record<ExchangeOrder['points'][number]['type'], string> = {
    PICKUP: 'Погрузка',
    ADDITIONAL_PICKUP: 'Догруз',
    DELIVERY: 'Выгрузка',
};

/**
 * Заявка с биржи.
 *
 * Всё, чтобы решить «повезу или нет»: маршрут по точкам с датами, груз,
 * цена и что ещё важно компании. Точные адреса компания откроет тому, кого
 * выберет. Откликнуться с ценой — следующим обновлением.
 */
export default function OrderScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const [order, setOrder] = useState<ExchangeOrder | null>(null);
    const [me, setMe] = useState<DriverProfile | null>(null);
    const [error, setError] = useState<string | null>(null);

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

    if (error) {
        return <Empty icon="alert-circle-outline" title="Заявка недоступна" text={error} action={<Button title="Назад к грузам" onPress={() => router.back()} />} />;
    }
    if (!order || !me) {
        return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={BRAND.primary} /></View>;
    }

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
                    <Text style={[styles.priceLabel, { color: colors.textTertiary }]}>КОМПАНИЯ ПРЕДЛАГАЕТ</Text>
                    <Text style={[styles.price, { color: colors.text }]}>{order.price != null ? деньги(order.price) : 'Цена договорная'}</Text>
                    {me.kind === 'PARK' && order.price != null && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 4 }}>
                            Через парк вы получите эту сумму за вычетом комиссии парка и налогов.
                        </Text>
                    )}
                </Card>

                <Card>
                    <Row icon="cube-outline" label="Что везём" value={order.cargoDescription || '—'} />
                    <Row icon="bus-outline" label="Кузов и вес" value={груз(order) || '—'} />
                    {order.palletCount != null && <Row icon="grid-outline" label="Паллет" value={String(order.palletCount)} />}
                    {order.loadingTypes.length > 0 && <Row icon="swap-vertical-outline" label="Загрузка" value={order.loadingTypes.join(', ')} />}
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

            <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
                <Text style={[styles.footerNote, { color: colors.textSecondary }]}>
                    Откликнуться — согласиться на цену или предложить свою — можно будет в следующем обновлении приложения.
                    Компания сама выберет, кто повезёт.
                </Text>
                <Button title="Назад к грузам" variant="secondary" onPress={() => router.back()} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    head: { fontWeight: '700', marginBottom: 10 },
    point: { flexDirection: 'row', gap: 12 },
    pointRail: { alignItems: 'center', width: 12 },
    dot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
    line: { width: 2, flex: 1, marginTop: 2 },
    city: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
    addrNote: { fontSize: 12.5, marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
    priceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    price: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 2 },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
    footerNote: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
});
