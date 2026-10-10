import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Mapbox, { UserTrackingMode } from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';

import * as Location from 'expo-location';
import { useStore } from '@/store';
import { featureCollection, lineString } from '@turf/helpers';
import { FONT } from '@/lib/theme';
import { StatusPill } from '@/components/kit';

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG9udGlwaWxhdCIsImEiOiJjbWtybWQ1b3UwemdhM2NzOWkxZjJqeGZ6In0.iKSM05aqs4Wpx4B-CBscjg';
Mapbox.setAccessToken(MAPBOX_TOKEN);

const MAPBOX_STYLE_DARK = 'mapbox://styles/pontipilat/cmkrnybo6006c01qxdlo18v6e';
const MAPBOX_STYLE_LIGHT = 'mapbox://styles/pontipilat/cmkro81vk005m01s55aem6mcy';

/** Пустая линия маршрута — пока рейса нет (зачем она, см. ниже у карты). */
const NO_ROUTE = featureCollection([]);

/**
 * Есть ли у точки маршрута место на карте.
 *
 * Адрес заводится и без координат — когда геокодер молчит, иначе рейс не
 * оформить вовсе. Точку допишут позже, а до тех пор её нельзя ни поставить
 * маркером, ни включить в линию маршрута: Mapbox получит `null` вместо
 * числа, и карта у водителя останется пустой.
 */
const hasPoint = (p: any) =>
    typeof p?.location?.latitude === 'number' && typeof p?.location?.longitude === 'number';

export default function DriverMap() {
    const { currentOrder, mapTheme } = useStore();
    const cameraRef = useRef<Mapbox.Camera>(null);
    const [userLocation, setUserLocation] = useState<number[] | null>(null);
    // Точку «я здесь» ставим, когда есть и разрешение, и загруженная карта.
    // Поставленная раньше разрешения, она молча не появлялась до перезапуска.
    const [locationAllowed, setLocationAllowed] = useState(false);
    const [styleReady, setStyleReady] = useState(false);

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
                setLocationAllowed(true);
            } catch (e) {
                console.error(e);
                Alert.alert('Ошибка', 'Не удалось запросить права на геолокацию');
            }
        })();
    }, []);

    const onUserLocationUpdate = (location: Mapbox.Location) => {
        if (location?.coords) {
            setUserLocation([location.coords.longitude, location.coords.latitude]);
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
            currentOrder.routePoints.filter(hasPoint).forEach(p => {
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
    const routeCoordinates = currentOrder?.routePoints?.filter(hasPoint)
        .map(p => [p.location.longitude, p.location.latitude]) || [];

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

    return (
        <View style={styles.container}>
            <Mapbox.MapView
                style={styles.map}
                styleURL={styleURL}
                logoEnabled={false}
                scaleBarEnabled={false}
                onDidFinishLoadingStyle={() => setStyleReady(true)}
            >
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

                {/* Линия маршрута — под маркерами и под точкой «я здесь».
                    Слой стоит на карте всегда, без рейса — пустой: карта
                    кладёт новый слой поверх прежних, и линия, появившаяся
                    позже точки, легла бы на неё — водитель ведь на маршруте. */}
                <Mapbox.ShapeSource id="routeSource" shape={routeFeature ?? NO_ROUTE}>
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

                {/* «Я здесь» — синяя точка со стрелкой по ходу движения.
                    Раньше обычную точку прятали ради 3D-грузовика, а файл
                    грузовика в установленном приложении карта не находит
                    (он лежит в ресурсах, а не по адресу), — и водитель не
                    видел себя вовсе. Координаты для кнопок «где я» и «весь
                    маршрут» берём у невидимого слушателя рядом. */}
                {locationAllowed && styleReady && (
                    <>
                        <Mapbox.LocationPuck
                            puckBearingEnabled
                            puckBearing="course"
                            pulsing={{ isEnabled: true, color: '#1677ff' }}
                        />
                        <Mapbox.UserLocation visible={false} onUpdate={onUserLocationUpdate} />
                    </>
                )}

                {/* Route Markers — фирменные пилюли */}
                {currentOrder?.routePoints?.map((point, index) => {
                    // Отсеиваем здесь, а не фильтром до `map`: иначе у
                    // оставшихся точек съедет нумерация, и водитель увидит
                    // выгрузку под номером погрузки.
                    if (!hasPoint(point)) return null;
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
                    <Ionicons name="locate-outline" size={22} color="#0b0d12" />
                </TouchableOpacity>
                {currentOrder && (
                    <TouchableOpacity style={styles.controlButton} onPress={fitToRoute}>
                        <Ionicons name="expand-outline" size={22} color="#0b0d12" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Bottom info card */}
            {currentOrder && (
                <View style={styles.infoCard}>
                    <View style={styles.infoTop}>
                        <Text style={styles.infoTitle}>№ {currentOrder.orderNumber}</Text>
                        <StatusPill status={currentOrder.status} />
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
        borderWidth: 1,
        borderColor: '#e6e8ec',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
        elevation: 4,
    },
    infoCard: {
        position: 'absolute',
        bottom: 110,
        left: 16,
        right: 16,
        backgroundColor: '#fff',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#e6e8ec',
        padding: 16,
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
        elevation: 6,
    },
    infoTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    infoTitle: {
        fontFamily: FONT.display,
        fontSize: 15,
        color: '#0b0d12',
        letterSpacing: -0.5,
    },
    infoText: {
        fontFamily: FONT.medium,
        fontSize: 14,
        color: '#4c5460',
        marginTop: 8,
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
        fontSize: 12.5,
        fontFamily: FONT.bold,
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
