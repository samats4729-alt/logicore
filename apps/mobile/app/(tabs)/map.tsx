import { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Mapbox, { UserLocationRenderMode, UserTrackingMode } from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';

import * as Location from 'expo-location';
import { useStore } from '@/store';
import { featureCollection, point, lineString } from '@turf/helpers';

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG9udGlwaWxhdCIsImEiOiJjbWtybWQ1b3UwemdhM2NzOWkxZjJqeGZ6In0.iKSM05aqs4Wpx4B-CBscjg';
Mapbox.setAccessToken(MAPBOX_TOKEN);

const MAPBOX_STYLE_DARK = 'mapbox://styles/pontipilat/cmkrnybo6006c01qxdlo18v6e';
const MAPBOX_STYLE_LIGHT = 'mapbox://styles/pontipilat/cmkro81vk005m01s55aem6mcy';

const truckModelSource = require('../../assets/low_poly_truck.glb');
// Resolve asset URI for Mapbox
const truckModelUri = Image.resolveAssetSource(truckModelSource).uri;

export default function MapScreen() {
    const { currentOrder, mapTheme } = useStore();
    const cameraRef = useRef<Mapbox.Camera>(null);
    const [userLocation, setUserLocation] = useState<number[] | null>(null);
    const [heading, setHeading] = useState(0);

    // Determines style based on theme
    const getStyleURL = () => {
        if (mapTheme === 'dark') return MAPBOX_STYLE_DARK;
        if (mapTheme === 'light') return MAPBOX_STYLE_LIGHT;
        const hour = new Date().getHours();
        return (hour < 6 || hour >= 20) ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT;
    };

    const styleURL = getStyleURL();

    // Initial request for permissions and location
    useEffect(() => {
        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert(
                        'Нет доступа к геолокации',
                        'Для работы карты необходимо разрешить доступ к местоположению.'
                    );
                    return;
                }
            } catch (e) {
                console.error(e);
                Alert.alert('Ошибка', 'Не удалось запросить права на геолокацию');
            }
        })();
    }, []);

    const onUserLocationUpdate = (location: Mapbox.Location) => {
        if (location?.coords) {
            setUserLocation([location.coords.longitude, location.coords.latitude]);
            if (typeof location.coords.heading === 'number') {
                setHeading(location.coords.heading);
            }
        }
    };

    const centerOnMyLocation = async () => {
        if (!userLocation) {
            Alert.alert('Геолокация', 'Местоположение еще не определено');
            return;
        }

        cameraRef.current?.setCamera({
            centerCoordinate: userLocation,
            zoomLevel: 17,
            pitch: 60,
            heading: 0,
            animationDuration: 1000,
        });
    };

    const fitToRoute = () => {
        if (!currentOrder) return;

        const points = [];
        // Add pickup
        points.push([currentOrder.pickupLocation.longitude, currentOrder.pickupLocation.latitude]);

        // Add delivery points
        if (currentOrder.deliveryPoints) {
            currentOrder.deliveryPoints.forEach(p => {
                points.push([p.location.longitude, p.location.latitude]);
            });
        }

        // Add user location if available
        if (userLocation) {
            points.push(userLocation);
        }

        if (points.length === 0) return;

        if (points.length === 1) {
            cameraRef.current?.setCamera({
                centerCoordinate: points[0],
                zoomLevel: 14,
                animationDuration: 1000,
            });
            return;
        }

        // Simple bounding box calculation
        let minLng = points[0][0], maxLng = points[0][0];
        let minLat = points[0][1], maxLat = points[0][1];

        points.forEach(p => {
            if (p[0] < minLng) minLng = p[0];
            if (p[0] > maxLng) maxLng = p[0];
            if (p[1] < minLat) minLat = p[1];
            if (p[1] > maxLat) maxLat = p[1];
        });

        // Add padding
        const padding = 0.01;

        cameraRef.current?.fitBounds(
            [maxLng + padding, maxLat + padding], // NE
            [minLng - padding, minLat - padding], // SW
            [50, 50, 50, 50], // padding
            1000 // duration
        );
    };

    // Prepare Route Line
    const routeCoordinates = currentOrder ? [
        [currentOrder.pickupLocation.longitude, currentOrder.pickupLocation.latitude],
        ...(currentOrder.deliveryPoints?.map(p => [p.location.longitude, p.location.latitude]) || [])
    ] : [];

    const routeFeature = routeCoordinates.length > 1 ? lineString(routeCoordinates) : null;

    // Truck location feature
    const truckFeature = useMemo(() => userLocation ? point(userLocation) : null, [userLocation]);

    return (
        <View style={styles.container}>
            <Mapbox.MapView style={styles.map} styleURL={styleURL} logoEnabled={false} scaleBarEnabled={false}>
                <Mapbox.Camera
                    ref={cameraRef}
                    defaultSettings={{
                        zoomLevel: 17,
                        pitch: 60,
                    }}
                    followUserLocation={true}
                    followUserMode={UserTrackingMode.FollowWithCourse as any}
                    followZoomLevel={17}
                    followPitch={60}
                />

                {/* Load from Native Assets */}
                <Mapbox.Models models={{ truck: truckModelUri }} />

                {/* Light - Noon position to minimize shadows */}
                <Mapbox.Light style={{ position: [2, 0, 0], anchor: 'map', color: '#ffffff', intensity: 0.8 } as any} />

                <Mapbox.UserLocation
                    visible={true}
                    onUpdate={onUserLocationUpdate}
                    renderMode={UserLocationRenderMode.Normal}
                >
                    <View style={{ width: 0, height: 0, opacity: 0 }} />
                </Mapbox.UserLocation>

                {/* 3D Truck Model Layer */}
                {truckFeature && (
                    <Mapbox.ShapeSource id="truckSource" shape={truckFeature}>
                        <Mapbox.ModelLayer
                            id="truckModel"
                            style={{
                                modelId: 'truck',
                                modelScale: [
                                    "interpolate",
                                    ["linear"],
                                    ["zoom"],
                                    10, [20, 20, 20],   // Far out: Huge
                                    16, [0.8, 0.8, 0.8] // Close up: Real size
                                ],
                                modelTranslation: [0, 0, 0],
                                modelRotation: [0, 0, 90 - heading],
                                modelOpacity: 1
                            } as any}
                        />
                    </Mapbox.ShapeSource>
                )}

                {/* Pickup Marker */}
                {currentOrder && (
                    <Mapbox.PointAnnotation
                        id="pickup"
                        coordinate={[currentOrder.pickupLocation.longitude, currentOrder.pickupLocation.latitude]}
                    >
                        <View style={[styles.marker, { backgroundColor: 'green' }]} />
                        <Mapbox.Callout title="Погрузка" />
                    </Mapbox.PointAnnotation>
                )}

                {/* Delivery Markers */}
                {currentOrder?.deliveryPoints?.map((point, index) => (
                    <Mapbox.PointAnnotation
                        key={point.id}
                        id={`delivery-${point.id}`}
                        coordinate={[point.location.longitude, point.location.latitude]}
                    >
                        <View style={[styles.marker, { backgroundColor: 'red' }]} />
                        <Mapbox.Callout title={`Выгрузка ${index + 1}`} />
                    </Mapbox.PointAnnotation>
                ))}

                {/* Route Line */}
                {routeFeature && (
                    <Mapbox.ShapeSource id="routeSource" shape={routeFeature}>
                        <Mapbox.LineLayer
                            id="routeFill"
                            style={{
                                lineColor: '#1677ff',
                                lineWidth: 3,
                                lineCap: 'round',
                                lineJoin: 'round',
                            }}
                        />
                    </Mapbox.ShapeSource>
                )}

            </Mapbox.MapView>

            {/* Controls */}
            <View style={styles.controls}>
                <TouchableOpacity style={styles.controlButton} onPress={centerOnMyLocation}>
                    <Ionicons name="locate" size={24} color="#1677ff" />
                </TouchableOpacity>
                {currentOrder && (
                    <TouchableOpacity style={styles.controlButton} onPress={fitToRoute}>
                        <Ionicons name="expand" size={24} color="#1677ff" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Bottom info card */}
            {currentOrder && (
                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>{currentOrder.orderNumber}</Text>
                    <Text style={styles.infoText}>
                        {currentOrder.pickupLocation.name} → {currentOrder.deliveryPoints?.[0]?.location.name || '...'}
                    </Text>
                </View>
            )}
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
    marker: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: 'white',
    },
});
