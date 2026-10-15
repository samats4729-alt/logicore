import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { DriverProfile, ExchangeOrder, OfferInput, exchangeApi, груз, деньги, загрузкаСловами, когда, ответ } from '@/lib/exchange';
import { BRAND, FONT } from '@/lib/theme';
import { Button, Card, Empty, Row } from '@/components/kit';
import { OfferSheet } from '@/components/OfferSheet';

const POINT_TITLE: Record<ExchangeOrder['points'][number]['type'], string> = {
    PICKUP: 'Погрузка',
    ADDITIONAL_PICKUP: 'Догруз',
    DELIVERY: 'Выгрузка',
};

/**
 * Заявка с биржи.
 *
 * Всё, чтобы решить «повезу или нет»: маршрут по точкам с датами, груз,
 * сколько получите на руки и что ещё важно компании. Сумма на руки — вместе
 * с топливом; налоги и комиссии парк досчитывает сверху (12.10.2026). Точные адреса компания откроет тому, кого
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
        Alert.alert(
            `Согласны за ${деньги(order.price)} на руки?`,
            'Компания увидит ваш отклик и решит, кто повезёт. Пока не решила — отклик можно отозвать.',
            [{ text: 'Отмена', style: 'cancel' }, { text: 'Откликнуться', onPress: () => send({ agree: true }) }],
        );
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
                    <Text style={[styles.priceLabel, { color: colors.textTertiary }]}>ВЫ ПОЛУЧИТЕ НА РУКИ</Text>
                    <Text style={[styles.price, { color: colors.text }]}>{order.price != null ? деньги(order.price) : 'Цена договорная'}</Text>
                    {me.kind === 'PARK' && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 18, marginTop: 6 }}>
                            {order.fuelEstimate
                                ? `Вместе с топливом: по расчёту около ${деньги(order.fuelEstimate)}${order.distanceKm ? ` на ${Math.round(order.distanceKm).toLocaleString('ru-RU')} км` : ''}. Заправка через парк, чек — на БИН парка. `
                                : 'Вместе с топливом: заправка через парк, чек — на БИН парка. '}
                            Налоги за вас платит парк из цены рейса — из суммы на руки они не вычитаются.
                        </Text>
                    )}
                    {me.kind === 'PARK' && order.breakdown && <Breakdown b={order.breakdown} />}
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
                            Вы откликнулись: {деньги(mine.price)} на руки{mine.agreed ? ' — по цене компании' : ''}
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
                            <Button title={`Согласен за ${деньги(order.price)} на руки`} icon="checkmark" loading={busy} onPress={agree} />
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

            <OfferSheet visible={sheet} mine={mine} busy={busy} fuelEstimate={order.fuelEstimate ?? null} onSubmit={send} onClose={() => setSheet(false)} />
        </View>
    );
}

/**
 * Из чего сложилась сумма на руки (владелец, 15.10.2026: «комиссия и общая
 * сумма — чтобы было понятно, за что высчитывают»). Суммы — до тенге, и
 * сходятся до тенге: налоги считаются остатком от округлённых строк, иначе
 * при сложении «на глаз» вылезал бы лишний тенге.
 */
function Breakdown({ b }: { b: NonNullable<ExchangeOrder['breakdown']> }) {
    const { colors } = useAppTheme();
    const total = Math.round(b.customerPrice);
    const platform = Math.round(b.platformFee);
    const park = Math.round(b.parkFee);
    const vat = Math.round(b.vat ?? 0);
    const onHand = Math.round(b.driverTotal);
    const taxes = total - platform - park - vat - onHand;
    // Без процентов в подписях: комиссии считаются от стоимости работы без
    // топлива, а не от всей цены рейса, — «5 % от 508 000» не сошлось бы.
    const line = (label: string, value: string, strong = false) => (
        <View style={styles.bLine}>
            <Text style={[styles.bLabel, { color: strong ? colors.text : colors.textSecondary }, strong && { fontFamily: FONT.semibold }]}>{label}</Text>
            <Text style={[styles.bValue, { color: colors.text }, strong && { fontFamily: FONT.bold }]}>{value}</Text>
        </View>
    );
    return (
        <View style={[styles.breakdown, { borderTopColor: colors.border2 }]}>
            <Text style={[styles.priceLabel, { color: colors.textTertiary, marginBottom: 6 }]}>ИЗ ЧЕГО СЛОЖИЛАСЬ СУММА</Text>
            {line('Компания платит за рейс', деньги(total))}
            {line('Комиссия LogiCore', `− ${деньги(platform)}`)}
            {line('Комиссия парка', `− ${деньги(park)}`)}
            {vat > 0 && line(`НДС${b.vatPct ? ` ${b.vatPct} %` : ''} — парк платит в бюджет`, `− ${деньги(vat)}`)}
            {line('Налоги и взносы за вас', `− ${деньги(taxes)}`)}
            <View style={[styles.bRule, { backgroundColor: colors.border2 }]} />
            {line('Вам на руки', деньги(onHand), true)}
            <Text style={[styles.bNote, { color: colors.textTertiary }]}>
                {b.fuel > 0 ? `В том числе топливо — около ${деньги(Math.round(b.fuel))}. ` : ''}
                Налоги и взносы — пенсионные (ОПВ), медстраховка (ВОСМС), подоходный налог (ИПН) и социальные отчисления. Их платит парк в бюджет, на ваш пенсионный счёт и медстраховку.
                {b.preliminary ? ' Расчёт налогов предварительный: бухгалтер парка его ещё не подтвердил. Ваша сумма на руки от этого не меняется.' : ''}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    breakdown: { marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
    bLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 4 },
    bLabel: { flex: 1, fontFamily: FONT.regular, fontSize: 14 },
    bValue: { fontFamily: FONT.semibold, fontSize: 14.5, fontVariant: ['tabular-nums'] },
    bRule: { height: 1, marginVertical: 6 },
    bNote: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 17, marginTop: 8 },
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
