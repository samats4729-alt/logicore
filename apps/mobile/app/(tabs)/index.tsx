import { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
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
import { statusMeta, BRAND, RADIUS } from '@/lib/theme';

export default function TripScreen() {
    const { currentOrder, fetchCurrentOrder, updateOrderStatus, reportProblem } = useStore();
    const { colors, isDark } = useAppTheme();
    const [refreshing, setRefreshing] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchCurrentOrder();
    }, []);

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

    const handleUpdateStatus = () => {
        if (!currentOrder) return;
        const meta = statusMeta(currentOrder.status);
        if (!meta.next) return;

        Alert.alert('Подтверждение', `Изменить статус на «${meta.nextLabel}»?`, [
            { text: 'Отмена', style: 'cancel' },
            {
                text: 'Подтвердить',
                onPress: async () => {
                    try {
                        await updateOrderStatus(currentOrder.id, meta.next!);
                    } catch (error: any) {
                        Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось обновить статус');
                    }
                },
            },
        ]);
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

    // ==================== Пустое состояние ====================
    if (!currentOrder) {
        return (
            <ScrollView
                style={[styles.container, { backgroundColor: colors.background }]}
                contentContainerStyle={styles.emptyContainer}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.text} />}
            >
                <View style={[styles.emptyIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="car-outline" size={44} color={BRAND.primary} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Нет активных рейсов</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    Как только диспетчер назначит вам рейс, он появится здесь. Потяните вниз, чтобы обновить.
                </Text>
            </ScrollView>
        );
    }

    const meta = statusMeta(currentOrder.status);
    const pickups = currentOrder.routePoints?.filter(p => p.pointType !== 'DELIVERY') || [];
    const deliveries = currentOrder.routePoints?.filter(p => p.pointType === 'DELIVERY') || [];

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.text} />}
        >
            {/* ===== Hero: номер, статус, прогресс ===== */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.heroTop}>
                    <View>
                        <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>АКТИВНЫЙ РЕЙС</Text>
                        <Text style={[styles.heroNumber, { color: colors.text }]}>№ {currentOrder.orderNumber}</Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                        <View style={[styles.pillDot, { backgroundColor: meta.fg }]} />
                        <Text style={[styles.pillText, { color: meta.fg }]}>{meta.label}</Text>
                    </View>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.hover }]}>
                    <View style={[styles.progressFill, { width: `${meta.progress}%` as any, backgroundColor: meta.fg }]} />
                </View>
                <Text style={[styles.progressLabel, { color: colors.textTertiary }]}>
                    Выполнено {meta.progress}%
                </Text>
            </View>

            {/* ===== Маршрут: таймлайн ===== */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>МАРШРУТ</Text>
                {currentOrder.routePoints?.map((point, index) => {
                    const isDelivery = point.pointType === 'DELIVERY';
                    const isLast = index === (currentOrder.routePoints?.length || 0) - 1;
                    const badgeColor = isDelivery ? BRAND.danger : BRAND.success;
                    let label = 'Точка';
                    if (point.pointType === 'PICKUP') label = 'Погрузка';
                    else if (point.pointType === 'ADDITIONAL_PICKUP') label = 'Догруз';
                    else if (point.pointType === 'DELIVERY') label = deliveries.length > 1 ? `Выгрузка ${deliveries.indexOf(point) + 1}` : 'Выгрузка';

                    return (
                        <View key={`${point.pointType}-${point.sequence}`} style={styles.timelineRow}>
                            {/* Линия и точка */}
                            <View style={styles.timelineRail}>
                                <View style={[styles.timelineDot, { backgroundColor: badgeColor }]}>
                                    <Text style={styles.timelineDotText}>{index + 1}</Text>
                                </View>
                                {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
                            </View>

                            {/* Содержимое точки */}
                            <View style={[styles.timelineContent, !isLast && { paddingBottom: 18 }]}>
                                <Text style={[styles.pointLabel, { color: badgeColor }]}>{label.toUpperCase()}</Text>
                                <Text style={[styles.pointName, { color: colors.text }]}>{point.location.name}</Text>
                                <Text style={[styles.pointAddress, { color: colors.textSecondary }]}>{point.location.address}</Text>

                                <View style={styles.pointActions}>
                                    <TouchableOpacity
                                        style={[styles.pointButton, { backgroundColor: isDark ? colors.hover : '#e6f4ff' }]}
                                        onPress={() => showNavigationOptions(
                                            point.location.latitude,
                                            point.location.longitude,
                                            point.location.address,
                                        )}
                                    >
                                        <Ionicons name="navigate" size={15} color={BRAND.primary} />
                                        <Text style={styles.pointButtonText}>Навигатор</Text>
                                    </TouchableOpacity>
                                    {!!point.location.contactPhone && (
                                        <TouchableOpacity
                                            style={[styles.pointButton, { backgroundColor: isDark ? colors.hover : '#e7f8ef' }]}
                                            onPress={() => Linking.openURL(`tel:${point.location.contactPhone}`)}
                                        >
                                            <Ionicons name="call" size={15} color={BRAND.success} />
                                            <Text style={[styles.pointButtonText, { color: BRAND.success }]}>
                                                {point.location.contactName || 'Позвонить'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        </View>
                    );
                })}
            </View>

            {/* ===== Груз ===== */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>ГРУЗ</Text>
                <Text style={[styles.cargoText, { color: colors.text }]}>{currentOrder.cargoDescription || '—'}</Text>
                {!!currentOrder.cargoWeight && (
                    <Text style={[styles.cargoWeight, { color: colors.textSecondary }]}>
                        Вес: {(currentOrder.cargoWeight / 1000).toLocaleString('ru-RU')} т
                    </Text>
                )}
            </View>

            {/* ===== Действия ===== */}
            {meta.next && (
                <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: BRAND.primary }]}
                    onPress={handleUpdateStatus}
                >
                    <Text style={styles.primaryButtonText}>{meta.nextLabel}</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
            )}

            <View style={styles.secondaryRow}>
                <TouchableOpacity
                    style={[styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={handleAttachDocument}
                    disabled={uploading}
                >
                    {uploading
                        ? <ActivityIndicator size="small" color={BRAND.primary} />
                        : <Ionicons name="camera-outline" size={19} color={BRAND.primary} />}
                    <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Фото документа</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={handleReportProblem}
                >
                    <Ionicons name="warning-outline" size={19} color={BRAND.danger} />
                    <Text style={[styles.secondaryButtonText, { color: BRAND.danger }]}>Проблема</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyIcon: {
        width: 88,
        height: 88,
        borderRadius: 26,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 18,
    },
    emptyTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
    emptyText: { fontSize: 13.5, textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 280 },

    card: {
        borderRadius: RADIUS.card,
        borderWidth: 1,
        padding: 16,
        marginBottom: 12,
    },
    heroTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
    heroNumber: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: RADIUS.pill,
    },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 12.5, fontWeight: '700' },
    progressTrack: {
        height: 6,
        borderRadius: 999,
        marginTop: 14,
        overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 999 },
    progressLabel: { fontSize: 11, marginTop: 6 },

    sectionTitle: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },

    timelineRow: { flexDirection: 'row' },
    timelineRail: { alignItems: 'center', width: 34 },
    timelineDot: {
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
    },
    timelineDotText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    timelineLine: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1 },
    timelineContent: { flex: 1, marginLeft: 10 },
    pointLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    pointName: { fontSize: 15.5, fontWeight: '700', marginTop: 3, letterSpacing: -0.2 },
    pointAddress: { fontSize: 13, marginTop: 2, lineHeight: 18 },
    pointActions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
    pointButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    pointButtonText: { color: BRAND.primary, fontSize: 13, fontWeight: '600' },

    cargoText: { fontSize: 15.5, lineHeight: 22, fontWeight: '600' },
    cargoWeight: { fontSize: 13, marginTop: 6 },

    primaryButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        padding: 17,
        borderRadius: RADIUS.button + 2,
        marginTop: 4,
    },
    primaryButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
    secondaryRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    secondaryButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 7,
        padding: 14,
        borderRadius: RADIUS.button + 2,
        borderWidth: 1,
    },
    secondaryButtonText: { fontSize: 14, fontWeight: '600' },
});
