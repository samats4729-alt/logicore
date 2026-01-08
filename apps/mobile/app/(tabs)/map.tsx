import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useStore } from '@/store';

export default function MapScreen() {
    const { currentOrder } = useStore();
    const mapRef = useRef<MapView>(null);
    const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [region, setRegion] = useState({
        latitude: 43.238949,
        longitude: 76.945780,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
    });

    useEffect(() => {
        // Получаем текущее местоположение при загрузке
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const location = await Location.getCurrentPositionAsync({});
                    setUserLocation({
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                    });
                    // Центрируем на пользователе при первой загрузке
                    setRegion({
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                    });
                }
            } catch (error) {
                console.error('Location error:', error);
            }
        })();
    }, []);

    useEffect(() => {
        if (currentOrder?.pickupLocation && !userLocation) {
            setRegion({
                latitude: currentOrder.pickupLocation.latitude,
                longitude: currentOrder.pickupLocation.longitude,
                latitudeDelta: 0.1,
                longitudeDelta: 0.1,
            });
        }
    }, [currentOrder, userLocation]);

    // Центрировать на своём местоположении
    const centerOnMyLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Геолокация', 'Разрешите доступ к местоположению');
                return;
            }

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
            });

            const newRegion = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            };

            setUserLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            });

            mapRef.current?.animateToRegion(newRegion, 500);
        } catch (error) {
            Alert.alert('Ошибка', 'Не удалось определить местоположение');
        }
    };

    // Показать весь маршрут
    const fitToRoute = () => {
        if (currentOrder && mapRef.current) {
            const points = [
                {
                    latitude: currentOrder.pickupLocation.latitude,
                    longitude: currentOrder.pickupLocation.longitude,
                },
                ...(currentOrder.deliveryPoints?.map(p => ({
                    latitude: p.location.latitude,
                    longitude: p.location.longitude,
                })) || []),
            ];

            if (userLocation) {
                points.push(userLocation);
            }

            mapRef.current.fitToCoordinates(points, {
                edgePadding: { top: 50, right: 50, bottom: 150, left: 50 },
                animated: true,
            });
        }
    };

    if (!currentOrder) {
        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="map-outline" size={60} color="#ccc" />
                <Text style={styles.emptyText}>Нет активного рейса</Text>
            </View>
        );
    }

    const points = [
        currentOrder.pickupLocation,
        ...(currentOrder.deliveryPoints?.map(p => p.location) || []),
    ];

    const coordinates = points.map(p => ({
        latitude: p.latitude,
        longitude: p.longitude,
    }));

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                style={styles.map}
                provider={Platform.OS === 'android' ? PROVIDER_DEFAULT : undefined}
                initialRegion={region}
                showsUserLocation
                showsMyLocationButton={false}
                showsCompass
            >
                {/* Pickup marker */}
                <Marker
                    coordinate={{
                        latitude: currentOrder.pickupLocation.latitude,
                        longitude: currentOrder.pickupLocation.longitude,
                    }}
                    title="Погрузка"
                    description={currentOrder.pickupLocation.name}
                    pinColor="green"
                />

                {/* Delivery markers */}
                {currentOrder.deliveryPoints?.map((point, index) => (
                    <Marker
                        key={point.id}
                        coordinate={{
                            latitude: point.location.latitude,
                            longitude: point.location.longitude,
                        }}
                        title={`Выгрузка ${index + 1}`}
                        description={point.location.name}
                        pinColor="red"
                    />
                ))}

                {/* Route line */}
                {coordinates.length > 1 && (
                    <Polyline
                        coordinates={coordinates}
                        strokeColor="#1677ff"
                        strokeWidth={3}
                    />
                )}
            </MapView>

            {/* Кнопки управления */}
            <View style={styles.controls}>
                <TouchableOpacity style={styles.controlButton} onPress={centerOnMyLocation}>
                    <Ionicons name="locate" size={24} color="#1677ff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlButton} onPress={fitToRoute}>
                    <Ionicons name="expand" size={24} color="#1677ff" />
                </TouchableOpacity>
            </View>

            {/* Bottom info card */}
            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>{currentOrder.orderNumber}</Text>
                <Text style={styles.infoText}>
                    {currentOrder.pickupLocation.name} → {currentOrder.deliveryPoints?.[0]?.location.name || '...'}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    map: {
        flex: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        marginTop: 12,
    },
    controls: {
        position: 'absolute',
        right: 16,
        top: 60,
        gap: 8,
    },
    controlButton: {
        width: 48,
        height: 48,
        backgroundColor: '#fff',
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    infoCard: {
        position: 'absolute',
        bottom: 24,
        left: 16,
        right: 16,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    infoText: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
});
