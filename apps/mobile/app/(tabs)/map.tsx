import { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Mapbox, { UserLocationRenderMode, UserTrackingMode } from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';

import * as Location from 'expo-location';
import { useStore } from '@/store';
import { featureCollection, point, lineString } from '@turf/helpers';
import { statusMeta } from '@/lib/theme';

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
        if (currentOrder.routePoints) {
            currentOrder.routePoints.forEach(p => {
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
    const routeCoordinates = currentOrder?.routePoints?.map(p => [p.location.longitude, p.location.latitude]) || [];

    // Маршрут по дорогам через Mapbox Directions (фолбэк — прямые линии между точками)
    const [roadRoute, setRoadRoute] = useState<number[][] | null>(null);

    useEffect(() => {
        let alive = true;
        setRoadRoute(null);
        if (routeCoordinates.length < 2 || routeCoordinates.length > 25) return;

        const coordsStr = routeCoordinates.map(c => `${c[0]},${c[1]}`).join(';');
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsStr}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

        fetch(url)
            .then(res => res.json())
            .then(data => {
                const geometry = data?.routes?.[0]?.geometry?.coordinates;
                if (alive && Array.isArray(geometry) && geometry.length > 1) {
                    setRoadRoute(geometry);
                }
            })
            .catch(() => { /* остаёмся на прямых линиях */ });

        return () => { alive = false; };
    }, [JSON.stringify(routeCoordinates)]);

    const lineCoords = roadRoute || routeCoordinates;
    const routeFeature = lineCoords.length > 1 ? lineString(lineCoords) : null;

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

                {/* Route Line — под маркерами */}
                {routeFeature && (
                    <Mapbox.ShapeSource id="routeSource" shape={routeFeature}>
                        <Mapbox.LineLayer
                            id="routeCasing"
                            style={{
                                lineColor: 'rgba(11, 13, 18, 0.35)',
                                lineWidth: 7,
                                lineCap: 'round',
                                lineJoin: 'round',
                            }}
                        />
                        <Mapbox.LineLayer
                            id="routeFill"
                            style={{
                                lineColor: '#1677ff',
                                lineWidth: 4,
                                lineCap: 'round',
                                lineJoin: 'round',
                            }}
                        />
                    </Mapbox.ShapeSource>
                )}

                {/* Route Markers — фирменные пилюли */}
                {currentOrder?.routePoints?.map((point, index) => {
                    const isDelivery = point.pointType === 'DELIVERY';
                    const label = isDelivery ? 'Выгрузка' : (point.pointType === 'PICKUP' ? 'Погрузка' : 'Догруз');
                    return (
                        <Mapbox.PointAnnotation
                            key={`${point.pointType}-${point.sequence}`}
                            id={`point-${point.sequence}`}
                            coordinate={[point.location.longitude, point.location.latitude]}
                        >
                            <View style={styles.markerWrap}>
                                <View style={[styles.markerPill, { backgroundColor: isDelivery ? '#dc2626' : '#16a34a' }]}>
                                    <Text style={styles.markerText}>{index + 1}</Text>
                                </View>
                                <View style={[styles.markerTip, { borderTopColor: isDelivery ? '#dc2626' : '#16a34a' }]} />
                            </View>
                            <Mapbox.Callout title={`${label}: ${point.location.name || point.location.address}`} />
                        </Mapbox.PointAnnotation>
                    );
                })}

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
                    <View style={styles.infoTop}>
                        <Text style={styles.infoTitle}>№ {currentOrder.orderNumber}</Text>
                        <View style={[styles.infoPill, { backgroundColor: statusMeta(currentOrder.status).bg }]}>
                            <Text style={[styles.infoPillText, { color: statusMeta(currentOrder.status).fg }]}>
                                {statusMeta(currentOrder.status).label}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.infoText} numberOfLines={1}>
                        {currentOrder.routePoints?.[0]?.location.name || '...'} → {currentOrder.routePoints?.[currentOrder.routePoints.length - 1]?.location.name || '...'}
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
        bottom: 110,
        left: 16,
        right: 16,
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 12,
        elevation: 5,
    },
    infoTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0b0d12',
        letterSpacing: -0.3,
    },
    infoPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
    },
    infoPillText: {
        fontSize: 11.5,
        fontWeight: '700',
    },
    infoText: {
        fontSize: 13.5,
        color: '#5f6672',
        marginTop: 6,
        fontWeight: '500',
    },
    markerWrap: {
        alignItems: 'center',
    },
    markerPill: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2.5,
        borderColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    markerText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '800',
    },
    markerTip: {
        width: 0,
        height: 0,
        borderLeftWidth: 5,
        borderRightWidth: 5,
        borderTopWidth: 7,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        marginTop: -1,
    },
});
