import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    RefreshControl,
    Alert,
    ActivityIndicator,
    Linking,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '@/store';
import { showNavigationOptions } from '@/lib/navigation';
import { startBackgroundTracking, stopBackgroundTracking, getCurrentLocation } from '@/lib/location';
import { api } from '@/lib/api';
import { useAppTheme } from '@/hooks/useAppTheme';
import { statusMeta, FONT, RADIUS, SHADOW } from '@/lib/theme';
import { Empty, IconTile, ScreenHeader, Section, StatusPill } from '@/components/kit';
import { SwipeConfirm } from '@/components/SwipeConfirm';
import { useTabBarSpace } from '@/components/TabBar';

/** Шагов у рейса от «Назначен» до «Завершён» — столько делений у полосы прогресса. */
const STEPS = 8;
/** Высота ползунка «смахните вправо» (кружок 54 + поля). */
const SWIPE_HEIGHT = 64;

const точек = (n: number) => {
    const d = n % 10;
    const dd = n % 100;
    if (d === 1 && dd !== 11) return `${n} точка`;
    if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return `${n} точки`;
    return `${n} точек`;
};

/**
 * Текущий рейс водителя: маршрут с адресами, следующий шаг, проблема, фото
 * документов, геолокация. Общий для водителя компании и водителя биржи —
 * у второго рейс появляется, когда компания выбрала его исполнителем.
 */
export default function CurrentTrip({
    emptyText = 'Как только диспетчер назначит вам рейс, он появится здесь. Потяните вниз, чтобы обновить.',
    showHeader = true,
}: { emptyText?: string; showHeader?: boolean }) {
    const { currentOrder, fetchCurrentOrder, updateOrderStatus, reportProblem } = useStore();
    const { colors, isDark } = useAppTheme();
    const [refreshing, setRefreshing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const tabBarSpace = useTabBarSpace();

    // При каждом возврате на экран: рейс могли назначить, пока водитель был в ленте.
    useFocusEffect(useCallback(() => {
        fetchCurrentOrder();
    }, []));

    // Автозапуск GPS при наличии активного рейса
    useEffect(() => {
        const manageTracking = async () => {
            if (currentOrder && !['COMPLETED', 'CANCELLED'].includes(currentOrder.status)) {
                const started = await startBackgroundTracking();
                if (started) {
                    console.log('GPS tracking started for order:', currentOrder.orderNumber);
                }
                const location = await getCurrentLocation();
                if (location) {
                    try {
                        await api.post('/tracking/gps', {
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            accuracy: location.coords.accuracy,
                            speed: location.coords.speed,
                            heading: location.coords.heading,
                            orderId: currentOrder.id,
                            recordedAt: new Date().toISOString(),
                        });
                    } catch (error) {
                        console.error('Failed to send GPS:', error);
                    }
                }
            } else {
                await stopBackgroundTracking();
            }
        };
        manageTracking();
    }, [currentOrder]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchCurrentOrder();
        setRefreshing(false);
    };

    // Шаг меняется свайпом до конца — это и есть подтверждение, второго
    // вопроса «Вы уверены?» не нужно (решение владельца).
    const confirmNextStep = async () => {
        if (!currentOrder) return;
        const meta = statusMeta(currentOrder.status);
        if (!meta.next) return;
        try {
            await updateOrderStatus(currentOrder.id, meta.next);
        } catch (error: any) {
            Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось обновить статус');
        }
    };

    const sendProblem = async (text: string) => {
        if (!currentOrder) return;
        try {
            await reportProblem(currentOrder.id, text);
            Alert.alert('Отправлено', 'Диспетчер уведомлён о проблеме');
        } catch (error: any) {
            Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось отправить');
        }
    };

    const handleReportProblem = () => {
        if (!currentOrder) return;
        if (Platform.OS === 'ios') {
            Alert.prompt(
                'Сообщить о проблеме',
                'Опишите, что случилось — диспетчер сразу увидит сообщение.',
                [
                    { text: 'Отмена', style: 'cancel' },
                    {
                        text: 'Отправить',
                        onPress: (text?: string) => {
                            if (text?.trim()) sendProblem(text.trim());
                        },
                    },
                ],
                'plain-text',
            );
        } else {
            // Android: Alert.prompt недоступен — подтверждение с типовым текстом
            Alert.alert('Сообщить о проблеме', 'Отправить диспетчеру сигнал о проблеме с рейсом?', [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Отправить',
                    style: 'destructive',
                    onPress: () => sendProblem('Водитель сообщил о проблеме через приложение'),
                },
            ]);
        }
    };

    const uploadPhoto = async (fromCamera: boolean) => {
        if (!currentOrder) return;
        try {
            const picker = fromCamera
                ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
                : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });

            if (picker.canceled || !picker.assets?.[0]) return;
            const asset = picker.assets[0];

            setUploading(true);
            const formData = new FormData();
            formData.append('file', {
                uri: asset.uri,
                name: `doc_${Date.now()}.jpg`,
                type: 'image/jpeg',
            } as any);
            formData.append('type', 'TTN');

            await api.post(`/documents/upload/${currentOrder.id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            Alert.alert('Готово', 'Документ загружен и виден диспетчеру');
        } catch (error: any) {
            Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось загрузить документ');
        } finally {
            setUploading(false);
        }
    };

    const handleAttachDocument = () => {
        Alert.alert('Фото документа', 'ТТН, накладная или акт — прикрепите фото к рейсу', [
            { text: 'Камера', onPress: () => uploadPhoto(true) },
            { text: 'Галерея', onPress: () => uploadPhoto(false) },
            { text: 'Отмена', style: 'cancel' },
        ]);
    };

    const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.text} />;

    // ==================== Пустое состояние ====================
    if (!currentOrder) {
        return (
            <ScrollView
                style={[styles.container, { backgroundColor: colors.background }]}
                contentContainerStyle={{ flexGrow: 1, paddingBottom: tabBarSpace + 28 }}
                refreshControl={refreshControl}
            >
                {showHeader && <ScreenHeader eyebrow="Водитель" title="Рейс" />}
                <View style={styles.emptyWrap}>
                    <Empty icon="car-outline" title="Нет активных рейсов" text={emptyText} />
                </View>
            </ScrollView>
        );
    }

    const meta = statusMeta(currentOrder.status);
    const pickups = currentOrder.routePoints?.filter(p => p.pointType !== 'DELIVERY') || [];
    const deliveries = currentOrder.routePoints?.filter(p => p.pointType === 'DELIVERY') || [];
    const fromPoint = pickups[0]?.location;
    const toPoint = deliveries[deliveries.length - 1]?.location;
    const filledSteps = Math.max(1, Math.round((meta.progress / 100) * STEPS));
    const onFeature = colors.featureFg;

    // Ползунок шага висит над панелью вкладок — под ним оставляем место, чтобы
    // последняя карточка не пряталась.
    const dockSpace = meta.next ? SWIPE_HEIGHT + 22 : 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingBottom: tabBarSpace + dockSpace + 28 }}
            refreshControl={refreshControl}
        >
            {showHeader && <ScreenHeader eyebrow="Активный рейс" title={`№ ${currentOrder.orderNumber}`} />}

            <View style={[styles.body, !showHeader && { paddingTop: 14 }]}>
                {/* ===== Главная карточка: откуда — куда, статус, прогресс ===== */}
                <View style={[styles.hero, { backgroundColor: colors.feature }, isDark && { borderWidth: 1, borderColor: colors.border }]}>
                    <View style={styles.heroTop}>
                        <Text style={[styles.heroEyebrow, { color: onFeature }]}>
                            {showHeader ? 'МАРШРУТ' : `РЕЙС № ${currentOrder.orderNumber}`}
                        </Text>
                        <StatusPill status={currentOrder.status} />
                    </View>

                    {!!currentOrder.customerCompany?.name && (
                        <View style={[styles.customer, { borderColor: 'rgba(255,255,255,0.12)' }]}>
                            <Ionicons name="business-outline" size={15} color={onFeature} style={{ opacity: 0.6 }} />
                            <Text style={[styles.customerLabel, { color: onFeature }]}>Заказчик</Text>
                            <Text style={[styles.customerName, { color: onFeature }]} numberOfLines={1}>{currentOrder.customerCompany.name}</Text>
                        </View>
                    )}

                    {/* Откуда — куда: погрузка — закрашенная точка, выгрузка — полая */}
                    <View style={styles.heroRow}>
                        <View style={styles.heroRail}>
                            <View style={[styles.heroDot, { backgroundColor: onFeature }]} />
                            <View style={[styles.heroRailLine, { backgroundColor: onFeature }]} />
                        </View>
                        <View style={styles.heroRowText}>
                            <Text style={[styles.heroPlace, { color: onFeature }]} numberOfLines={2}>
                                {fromPoint?.name || fromPoint?.address || '—'}
                            </Text>
                            {!!fromPoint?.address && fromPoint.address !== fromPoint.name && (
                                <Text style={[styles.heroAddress, { color: onFeature }]} numberOfLines={1}>{fromPoint.address}</Text>
                            )}
                        </View>
                    </View>
                    <View style={[styles.heroRow, { paddingBottom: 0 }]}>
                        <View style={styles.heroRail}>
                            <View style={[styles.heroDot, { borderWidth: 2, borderColor: onFeature }]} />
                        </View>
                        <View style={[styles.heroRowText, { paddingBottom: 0 }]}>
                            <Text style={[styles.heroPlace, { color: onFeature }]} numberOfLines={2}>
                                {toPoint?.name || toPoint?.address || '—'}
                            </Text>
                            {!!toPoint?.address && toPoint.address !== toPoint.name && (
                                <Text style={[styles.heroAddress, { color: onFeature }]} numberOfLines={1}>{toPoint.address}</Text>
                            )}
                        </View>
                    </View>

                    <View style={styles.steps}>
                        {Array.from({ length: STEPS }).map((_, i) => (
                            <View
                                key={i}
                                style={[styles.step, { backgroundColor: onFeature, opacity: i < filledSteps ? 1 : 0.16 }]}
                            />
                        ))}
                    </View>
                    <View style={styles.heroFoot}>
                        <Text style={[styles.heroFootText, { color: onFeature }]}>{meta.label}</Text>
                        <Text style={[styles.heroFootValue, { color: onFeature }]}>{meta.progress}%</Text>
                    </View>
                </View>

                {/* ===== Документ и проблема ===== */}
                <View style={styles.actionsRow}>
                    <Pressable
                        onPress={handleAttachDocument}
                        disabled={uploading}
                        style={({ pressed }: { pressed: boolean }) => [
                            styles.action,
                            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                            !isDark && SHADOW,
                        ]}
                    >
                        {uploading
                            ? <View style={styles.actionSpinner}><ActivityIndicator size="small" color={colors.text} /></View>
                            : <IconTile icon="camera-outline" size={40} />}
                        <Text style={[styles.actionTitle, { color: colors.text }]}>Фото документа</Text>
                        <Text style={[styles.actionSub, { color: colors.textTertiary }]}>ТТН, накладная, акт</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleReportProblem}
                        style={({ pressed }: { pressed: boolean }) => [
                            styles.action,
                            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                            !isDark && SHADOW,
                        ]}
                    >
                        <IconTile icon="warning-outline" tone="danger" size={40} />
                        <Text style={[styles.actionTitle, { color: colors.danger }]}>Проблема</Text>
                        <Text style={[styles.actionSub, { color: colors.textTertiary }]}>Сообщить диспетчеру</Text>
                    </Pressable>
                </View>

                {/* ===== Маршрут: точки по порядку ===== */}
                <Section title="Маршрут" icon="git-commit-outline" right={точек(currentOrder.routePoints?.length || 0)}>
                    {currentOrder.routePoints?.map((point, index) => {
                        const isDelivery = point.pointType === 'DELIVERY';
                        const isLast = index === (currentOrder.routePoints?.length || 0) - 1;
                        let label = 'Точка';
                        if (point.pointType === 'PICKUP') label = 'Погрузка';
                        else if (point.pointType === 'ADDITIONAL_PICKUP') label = 'Догруз';
                        else if (point.pointType === 'DELIVERY') label = deliveries.length > 1 ? `Выгрузка ${deliveries.indexOf(point) + 1}` : 'Выгрузка';

                        return (
                            <View key={`${point.pointType}-${point.sequence}`} style={styles.timelineRow}>
                                {/* Линия и точка: погрузка — закрашенная, выгрузка — полая */}
                                <View style={styles.timelineRail}>
                                    <View
                                        style={[
                                            styles.timelineDot,
                                            isDelivery
                                                ? { borderWidth: 2, borderColor: colors.text, backgroundColor: colors.card }
                                                : { backgroundColor: colors.text },
                                        ]}
                                    >
                                        <Text style={[styles.timelineDotText, { color: isDelivery ? colors.text : colors.card }]}>{index + 1}</Text>
                                    </View>
                                    {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
                                </View>

                                {/* Содержимое точки */}
                                <View style={[styles.timelineContent, !isLast && { paddingBottom: 20 }]}>
                                    <Text style={[styles.pointLabel, { color: colors.textTertiary }]}>{label}</Text>
                                    <Text style={[styles.pointName, { color: colors.text }]}>{point.location.name}</Text>
                                    <Text style={[styles.pointAddress, { color: colors.textSecondary }]}>{point.location.address}</Text>

                                    <View style={styles.pointActions}>
                                        {/* Кнопка навигатора — только когда у точки
                                            есть координаты. Адрес заводится и без
                                            них, когда геокодер молчит; навигатор в
                                            этот момент увёл бы водителя в никуда,
                                            а сам адрес на экране остаётся. */}
                                        {typeof point.location.latitude === 'number'
                                            && typeof point.location.longitude === 'number' && (
                                            <Pressable
                                                style={({ pressed }: { pressed: boolean }) => [styles.pointButton, { borderColor: colors.border, backgroundColor: pressed ? colors.hover : colors.card }]}
                                                onPress={() => showNavigationOptions(
                                                    point.location.latitude,
                                                    point.location.longitude,
                                                    point.location.address,
                                                )}
                                            >
                                                <Ionicons name="navigate-outline" size={15} color={colors.text} />
                                                <Text style={[styles.pointButtonText, { color: colors.text }]}>Навигатор</Text>
                                            </Pressable>
                                        )}
                                        {!!point.location.contactPhone && (
                                            <Pressable
                                                style={({ pressed }: { pressed: boolean }) => [styles.pointButton, { borderColor: colors.border, backgroundColor: pressed ? colors.hover : colors.card }]}
                                                onPress={() => Linking.openURL(`tel:${point.location.contactPhone}`)}
                                            >
                                                <Ionicons name="call-outline" size={15} color={colors.pos} />
                                                <Text style={[styles.pointButtonText, { color: colors.text }]} numberOfLines={1}>
                                                    {point.location.contactName || 'Позвонить'}
                                                </Text>
                                            </Pressable>
                                        )}
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </Section>

                {/* ===== Груз ===== */}
                <Section title="Груз" icon="cube-outline">
                    <Text style={[styles.cargoText, { color: colors.text }]}>{currentOrder.cargoDescription || '—'}</Text>
                    {!!currentOrder.cargoWeight && (
                        <View style={[styles.cargoChip, { backgroundColor: colors.surface2, borderColor: colors.border2 }]}>
                            <Ionicons name="barbell-outline" size={14} color={colors.textSecondary} />
                            <Text style={[styles.cargoWeight, { color: colors.textSecondary }]}>
                                Вес: {(currentOrder.cargoWeight / 1000).toLocaleString('ru-RU')} т
                            </Text>
                        </View>
                    )}
                </Section>
            </View>
        </ScrollView>

            {/* ===== Следующий шаг: свайп вправо, внизу над вкладками ===== */}
            {meta.next && (
                // Подложка цвета фона с мягким краем сверху: прокрученные карточки
                // уходят под неё, а не просвечивают между ползунком и вкладками.
                <View pointerEvents="none" style={[styles.dockPlate, { height: tabBarSpace + 12 + SWIPE_HEIGHT + 14 + 24 }]}>
                    {[0.25, 0.55, 0.8].map((o) => (
                        <View key={o} style={{ height: 8, backgroundColor: colors.background, opacity: o }} />
                    ))}
                    <View style={{ flex: 1, backgroundColor: colors.background }} />
                </View>
            )}
            {meta.next && (
                <View style={[styles.dock, { bottom: tabBarSpace + 12 }]} pointerEvents="box-none">
                    <SwipeConfirm key={currentOrder.status} label={meta.nextLabel!} onConfirm={confirmNextStep} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    emptyWrap: { flex: 1, justifyContent: 'center', paddingBottom: 40 },
    body: { paddingHorizontal: 16 },

    hero: { borderRadius: 24, padding: 20, marginBottom: 12, overflow: 'hidden' },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    heroEyebrow: { fontFamily: FONT.displayMedium, fontSize: 10, letterSpacing: 0.8, opacity: 0.55 },
    heroRow: { flexDirection: 'row', gap: 14 },
    heroRowText: { flex: 1, paddingBottom: 16 },
    heroRail: { alignItems: 'center', width: 11, paddingTop: 8 },
    heroDot: { width: 11, height: 11, borderRadius: 6 },
    heroRailLine: { width: 1.5, flex: 1, marginTop: 6, marginBottom: -6, opacity: 0.3 },
    heroPlace: { fontFamily: FONT.display, fontSize: 21, letterSpacing: -0.8, lineHeight: 27 },
    heroAddress: { fontFamily: FONT.regular, fontSize: 13, marginTop: 3, opacity: 0.6 },
    steps: { flexDirection: 'row', gap: 4, marginTop: 24 },
    step: { flex: 1, height: 4, borderRadius: 2 },
    heroFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    heroFootText: { fontFamily: FONT.medium, fontSize: 12.5, opacity: 0.65 },
    heroFootValue: { fontFamily: FONT.semibold, fontSize: 12.5, fontVariant: ['tabular-nums'] },

    customer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: -6,
        marginBottom: 18,
        paddingBottom: 14,
        borderBottomWidth: 1,
    },
    customerLabel: { fontFamily: FONT.medium, fontSize: 12.5, opacity: 0.55 },
    customerName: { flex: 1, fontFamily: FONT.semibold, fontSize: 14, letterSpacing: -0.2 },

    dock: { position: 'absolute', left: 16, right: 16 },
    dockPlate: { position: 'absolute', left: 0, right: 0, bottom: 0 },

    actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    action: { flex: 1, borderRadius: RADIUS.card, borderWidth: 1, padding: 14 },
    actionSpinner: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    actionTitle: { fontFamily: FONT.semibold, fontSize: 14.5, letterSpacing: -0.2, marginTop: 12 },
    actionSub: { fontFamily: FONT.regular, fontSize: 12, marginTop: 2 },

    timelineRow: { flexDirection: 'row' },
    timelineRail: { alignItems: 'center', width: 28 },
    timelineDot: {
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
    },
    timelineDotText: { fontFamily: FONT.bold, fontSize: 11.5 },
    timelineLine: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1 },
    timelineContent: { flex: 1, marginLeft: 12 },
    pointLabel: { fontFamily: FONT.displayMedium, fontSize: 9.5, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 1 },
    pointName: { fontFamily: FONT.semibold, fontSize: 16, marginTop: 5, letterSpacing: -0.3 },
    pointAddress: { fontFamily: FONT.regular, fontSize: 13.5, marginTop: 2, lineHeight: 19 },
    pointActions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    pointButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingHorizontal: 13,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        maxWidth: 220,
    },
    pointButtonText: { fontFamily: FONT.medium, fontSize: 13 },

    cargoText: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
    cargoChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        marginTop: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
    },
    cargoWeight: { fontFamily: FONT.medium, fontSize: 12.5 },
});
