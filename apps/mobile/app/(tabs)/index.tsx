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
                style={styles.container}
                contentContainerStyle={styles.emptyContainer}
                refreshControl={
                    <RefreshControl refreshing={false} onRefresh={handleRefresh} />
                }
            >
                <Ionicons name="car-outline" size={80} color="#ccc" />
                <Text style={styles.emptyTitle}>Нет активных рейсов</Text>
                <Text style={styles.emptyText}>
                    Ожидайте назначения нового рейса от диспетчера
                </Text>
            </ScrollView>
        );
    }

    const statusInfo = statusConfig[currentOrder.status] || { label: currentOrder.status, color: '#999' };

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={false} onRefresh={handleRefresh} />
            }
        >
            {/* Order Header */}
            <View style={styles.header}>
                <Text style={styles.orderNumber}>Рейс {currentOrder.orderNumber}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
                    <Text style={styles.statusText}>{statusInfo.label}</Text>
                </View>
            </View>

            {/* Cargo Info */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Груз</Text>
                <Text style={styles.cargoDescription}>{currentOrder.cargoDescription}</Text>
                {currentOrder.cargoWeight && (
                    <Text style={styles.cargoDetail}>Вес: {currentOrder.cargoWeight} кг</Text>
                )}
            </View>

            {/* Pickup Location */}
            <View style={styles.card}>
                <View style={styles.locationHeader}>
                    <Ionicons name="location" size={20} color="#52c41a" />
                    <Text style={styles.cardTitle}>Погрузка</Text>
                </View>
                <Text style={styles.locationName}>{currentOrder.pickupLocation.name}</Text>
                <Text style={styles.locationAddress}>{currentOrder.pickupLocation.address}</Text>
                <TouchableOpacity
                    style={styles.navButton}
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
                <View key={point.id} style={styles.card}>
                    <View style={styles.locationHeader}>
                        <Ionicons name="flag" size={20} color="#f5222d" />
                        <Text style={styles.cardTitle}>Выгрузка {index + 1}</Text>
                    </View>
                    <Text style={styles.locationName}>{point.location.name}</Text>
                    <Text style={styles.locationAddress}>{point.location.address}</Text>
                    <TouchableOpacity
                        style={styles.navButton}
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

            <View style={styles.spacer} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
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
        color: '#333',
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginTop: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e8e8e8',
    },
    orderNumber: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
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
        backgroundColor: '#fff',
        margin: 12,
        marginBottom: 0,
        padding: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    cargoDescription: {
        fontSize: 16,
        color: '#333',
        lineHeight: 22,
    },
    cargoDetail: {
        fontSize: 14,
        color: '#666',
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
        color: '#333',
    },
    locationAddress: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    navButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: '#e6f4ff',
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
