import { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/store';
import { showNavigationOptions } from '@/lib/navigation';
import { startBackgroundTracking, stopBackgroundTracking, getCurrentLocation } from '@/lib/location';
import { api } from '@/lib/api';
import { useAppTheme } from '@/hooks/useAppTheme';

const statusConfig: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
    ASSIGNED: {
        label: 'Назначен',
        color: '#1677ff',
        next: 'EN_ROUTE_PICKUP',
        nextLabel: 'Выехал на погрузку',
    },
    EN_ROUTE_PICKUP: {
        label: 'Еду на погрузку',
        color: '#faad14',
        next: 'AT_PICKUP',
        nextLabel: 'Прибыл на погрузку',
    },
    AT_PICKUP: {
        label: 'На месте погрузки',
        color: '#52c41a',
        next: 'LOADING',
        nextLabel: 'Начать погрузку',
    },
    LOADING: {
        label: 'Идёт погрузка',
        color: '#722ed1',
        next: 'IN_TRANSIT',
        nextLabel: 'Выехал в рейс',
    },
    IN_TRANSIT: {
        label: 'В пути',
        color: '#13c2c2',
        next: 'AT_DELIVERY',
        nextLabel: 'Прибыл на выгрузку',
    },
    AT_DELIVERY: {
        label: 'На месте выгрузки',
        color: '#52c41a',
        next: 'UNLOADING',
        nextLabel: 'Начать выгрузку',
    },
    UNLOADING: {
        label: 'Идёт выгрузка',
        color: '#722ed1',
        next: 'COMPLETED',
        nextLabel: 'Завершить рейс',
    },
    COMPLETED: {
        label: 'Завершён',
        color: '#52c41a',
    },
};

export default function TripScreen() {
    const { currentOrder, fetchCurrentOrder, updateOrderStatus, user } = useStore();
    const { colors, isDark } = useAppTheme();

    useEffect(() => {
        fetchCurrentOrder();
    }, []);

    // Автозапуск GPS при наличии активного рейса
    useEffect(() => {
        const manageTracking = async () => {
            if (currentOrder && !['COMPLETED', 'CANCELLED'].includes(currentOrder.status)) {
                // Есть активный рейс - запускаем трекинг
                const started = await startBackgroundTracking();
                if (started) {
                    console.log('GPS tracking started for order:', currentOrder.orderNumber);
                }

                // Сразу отправляем текущую позицию
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
                        console.log('Initial GPS sent');
                    } catch (error) {
                        console.error('Failed to send GPS:', error);
                    }
                }
            } else {
                // Нет рейса - останавливаем
                await stopBackgroundTracking();
            }
        };

        manageTracking();
    }, [currentOrder]);

    const handleUpdateStatus = async () => {
        if (!currentOrder) return;

        const config = statusConfig[currentOrder.status];
        if (!config?.next) return;

        Alert.alert(
            'Подтверждение',
            `Изменить статус на "${config.nextLabel}"?`,
            [
                { text: 'Отмена', style: 'cancel' },
                {
                    text: 'Подтвердить',
                    onPress: async () => {
                        try {
                            await updateOrderStatus(currentOrder.id, config.next!);
                        } catch (error: any) {
                            Alert.alert('Ошибка', error.response?.data?.message || 'Не удалось обновить статус');
                        }
                    },
                },
            ]
        );
    };

    const handleRefresh = () => {
        fetchCurrentOrder();
    };

    if (!currentOrder) {
        return (
            <ScrollView
                style={[styles.container, { backgroundColor: colors.background }]}
                contentContainerStyle={styles.emptyContainer}
                refreshControl={
                    <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.text} />
                }
            >
                <Ionicons name="car-outline" size={80} color={colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Нет активных рейсов</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    Ожидайте назначения нового рейса от диспетчера
                </Text>
            </ScrollView>
        );
    }

    const statusInfo = statusConfig[currentOrder.status] || { label: currentOrder.status, color: '#999' };

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: colors.background }]}
            refreshControl={
                <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.text} />
            }
        >
            {/* Order Header */}
            <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <Text style={[styles.orderNumber, { color: colors.text }]}>Рейс {currentOrder.orderNumber}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
                    <Text style={styles.statusText}>{statusInfo.label}</Text>
                </View>
            </View>

            {/* Cargo Info */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
                <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Груз</Text>
                <Text style={[styles.cargoDescription, { color: colors.text }]}>{currentOrder.cargoDescription}</Text>
                {currentOrder.cargoWeight && (
                    <Text style={[styles.cargoDetail, { color: colors.textSecondary }]}>Вес: {currentOrder.cargoWeight} кг</Text>
                )}
            </View>

            {/* Pickup Location */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
                <View style={styles.locationHeader}>
                    <Ionicons name="location" size={20} color="#52c41a" />
                    <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Погрузка</Text>
                </View>
                <Text style={[styles.locationName, { color: colors.text }]}>{currentOrder.pickupLocation.name}</Text>
                <Text style={[styles.locationAddress, { color: colors.textSecondary }]}>{currentOrder.pickupLocation.address}</Text>
                <TouchableOpacity
                    style={[styles.navButton, { backgroundColor: isDark ? '#333' : '#e6f4ff' }]}
                    onPress={() => showNavigationOptions(
                        currentOrder.pickupLocation.latitude,
                        currentOrder.pickupLocation.longitude,
                        currentOrder.pickupLocation.address
                    )}
                >
                    <Ionicons name="navigate" size={18} color="#1677ff" />
                    <Text style={styles.navButtonText}>Открыть в навигаторе</Text>
                </TouchableOpacity>
            </View>

            {/* Delivery Points */}
            {currentOrder.deliveryPoints?.map((point, index) => (
                <View key={point.id} style={[styles.card, { backgroundColor: colors.card }]}>
                    <View style={styles.locationHeader}>
                        <Ionicons name="flag" size={20} color="#f5222d" />
                        <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>Выгрузка {index + 1}</Text>
                    </View>
                    <Text style={[styles.locationName, { color: colors.text }]}>{point.location.name}</Text>
                    <Text style={[styles.locationAddress, { color: colors.textSecondary }]}>{point.location.address}</Text>
                    <TouchableOpacity
                        style={[styles.navButton, { backgroundColor: isDark ? '#333' : '#e6f4ff' }]}
                        onPress={() => showNavigationOptions(
                            point.location.latitude,
                            point.location.longitude,
                            point.location.address
                        )}
                    >
                        <Ionicons name="navigate" size={18} color="#1677ff" />
                        <Text style={styles.navButtonText}>Открыть в навигаторе</Text>
                    </TouchableOpacity>
                </View>
            ))}

            {/* Action Button */}
            {statusInfo.next && (
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: statusInfo.color }]}
                    onPress={handleUpdateStatus}
                >
                    <Text style={styles.actionButtonText}>{statusInfo.nextLabel}</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
            )}

            {/* DEBUG GPS BUTTON */}
            <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#333', marginTop: 8 }]}
                onPress={async () => {
                    const { Alert } = require('react-native');
                    const Location = require('expo-location');

                    try {
                        Alert.alert('GPS Diagnostic', 'Проверка прав...');

                        // Check Permissions
                        const { status } = await Location.requestForegroundPermissionsAsync();
                        if (status !== 'granted') {
                            Alert.alert('Permission Error', `Статус прав: ${status}. Зайдите в настройки телефона -> Приложения -> LogComp Driver -> Разрешения и включите "Местоположение".`);
                            return;
                        }

                        // Check Services
                        const enabled = await Location.hasServicesEnabledAsync();
                        if (!enabled) {
                            Alert.alert('GPS Disabled', 'GPS выключен на телефоне. Включите геолокацию в шторке.');
                            return;
                        }

                        Alert.alert('GPS Test', 'Права есть. Получаем координаты...');
                        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

                        Alert.alert('GPS Data', `Lat: ${loc.coords.latitude}\nLng: ${loc.coords.longitude}\nОтправка на сервер...`);

                        await api.post('/tracking/gps', {
                            latitude: loc.coords.latitude,
                            longitude: loc.coords.longitude,
                            accuracy: loc.coords.accuracy,
                            speed: loc.coords.speed,
                            heading: loc.coords.heading,
                            orderId: currentOrder?.id,
                            recordedAt: new Date().toISOString(),
                        });
                        Alert.alert('Success', 'Координаты отправлены успешно! Проверьте карту через минуту.');
                    } catch (e: any) {
                        Alert.alert('Error', e.message + '\n' + JSON.stringify(e.response?.data || ''));
                    }
                }}
            >
                <Text style={styles.actionButtonText}>Проверить GPS (Тест)</Text>
                <Ionicons name="navigate-circle" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={styles.spacer} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    orderNumber: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    statusText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    card: {
        margin: 12,
        marginBottom: 0,
        padding: 16,
        borderRadius: 12,
        // Shadow will be subtle on dark mode or visible on light
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    cargoDescription: {
        fontSize: 16,
        lineHeight: 22,
    },
    cargoDetail: {
        fontSize: 14,
        marginTop: 8,
    },
    locationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    locationName: {
        fontSize: 16,
        fontWeight: '600',
    },
    locationAddress: {
        fontSize: 14,
        marginTop: 4,
    },
    navButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    navButtonText: {
        color: '#1677ff',
        fontSize: 14,
        fontWeight: '500',
    },
    actionButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        margin: 16,
        padding: 16,
        borderRadius: 12,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    spacer: {
        height: 32,
    },
});
