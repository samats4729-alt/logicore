'use client';

import { useState, useCallback } from 'react';
import ReactMap, { Marker, Popup, NavigationControl, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import Truck3DLayer from './Truck3DLayer';
import { Tag } from 'antd';

// Иконка для моего местоположения
const MyLocationIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1677ff" stroke="#fff" strokeWidth="2" style={{ filter: 'drop-shadow(0px 0px 8px rgba(22, 119, 255, 0.5))' }}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="12" fill="none" stroke="#1677ff" strokeOpacity="0.3" strokeWidth="4" />
    </svg>
);

interface DriverPosition {
    driverId: string;
    driverName: string;
    vehiclePlate: string;
    latitude: number;
    longitude: number;
    speed: number;
    heading: number;
    updatedAt: string;
    orderId?: string;
    orderNumber?: string;
}

interface InteractiveMapProps {
    viewState: {
        latitude: number;
        longitude: number;
        zoom: number;
        pitch: number;
        bearing: number;
    };
    onViewStateChange: (evt: any) => void;
    mapStyle: string;
    mapboxAccessToken: string;
    drivers: DriverPosition[];
    popupInfo: DriverPosition | null;
    onPopupInfoChange: (info: DriverPosition | null) => void;
    myLocation: { latitude: number; longitude: number } | null;
    getDriverColor: (driver: DriverPosition) => string;
    lightPreset?: 'day' | 'dawn' | 'dusk' | 'night';
}

export default function InteractiveMap({
    viewState,
    onViewStateChange,
    mapStyle,
    mapboxAccessToken,
    drivers,
    popupInfo,
    onPopupInfoChange,
    myLocation,
    getDriverColor,
    lightPreset = 'day',
}: InteractiveMapProps) {
    const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);

    // Применяем освещение при каждой загрузке стиля (день/ночь переключает стиль карты)
    const applyLightPreset = useCallback((event: any) => {
        try {
            event.target?.setConfigProperty?.('basemap', 'lightPreset', lightPreset);
        } catch { /* классический стиль без config */ }
    }, [lightPreset]);

    const handleMapLoad = useCallback((event: any) => {
        const map = event.target;
        if (!map) return;
        try {
            if (map.setConfigProperty) {
                map.setConfigProperty('basemap', 'colorBuildingSelect', '#1677ff');
                map.setConfigProperty('basemap', 'lightPreset', lightPreset);
            }
            
            // Нативное выделение зданий для стилей на базе Mapbox Standard (v3)
            if (map.addInteraction) {
                // Сохраняем текущее выделенное здание в объекте карты, чтобы не зависеть от React State
                map._currentBuilding = null;
                map.addInteraction('building-click-interaction', {
                    type: 'click',
                    target: { featuresetId: 'buildings', importId: 'basemap' },
                    handler: (e: any) => {
                        if (map._currentBuilding) {
                            map.setFeatureState(map._currentBuilding, { select: false });
                        }
                        map._currentBuilding = e.feature;
                        if (e.feature) {
                            map.setFeatureState(e.feature, { select: true });
                        }
                    }
                });
                console.log('Mapbox Standard building interaction enabled successfully');
            }
        } catch (e) {
            console.log('Failed to configure Mapbox Standard properties:', e);
        }
    }, []);

    const handleMapClick = useCallback((event: any) => {
        const map = event.target;
        if (!map) return;

        // Повторная настройка цвета на всякий случай
        try {
            if (map.setConfigProperty) {
                map.setConfigProperty('basemap', 'colorBuildingSelect', '#1677ff');
                map.setConfigProperty('basemap', 'lightPreset', 'day');
            }
        } catch (e) {}

        // Логика выделения теперь обрабатывается через map.addInteraction
    }, []);

    return (
        <ReactMap
            {...viewState}
            onMove={(evt: any) => onViewStateChange(evt.viewState)}
            mapStyle={mapStyle}
            mapboxAccessToken={mapboxAccessToken}
            style={{ width: '100%', height: '100%' }}
            terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
            onClick={handleMapClick}
            onLoad={handleMapLoad}
            onStyleData={applyLightPreset}
        >
            <NavigationControl position="bottom-right" />

            {/* 3D Truck Layer */}
            <Truck3DLayer drivers={drivers} />

            {popupInfo && (
                <Popup
                    anchor="top"
                    longitude={popupInfo.longitude}
                    latitude={popupInfo.latitude}
                    onClose={() => onPopupInfoChange(null)}
                >
                    <div style={{ minWidth: 150, padding: 4 }}>
                        <strong>{popupInfo.driverName}</strong>
                        <br />
                        <Tag style={{ marginTop: 4 }}>{popupInfo.vehiclePlate}</Tag>
                        <br />
                        {popupInfo.orderNumber && (
                            <>
                                <Tag color={getDriverColor(popupInfo)} style={{ marginTop: 4 }}>
                                    {popupInfo.orderNumber}
                                </Tag>
                                <br />
                            </>
                        )}
                        <small style={{ display: 'block', marginTop: 4, color: '#666' }}>
                            Скорость: {popupInfo.speed ? `${Math.round(popupInfo.speed * 3.6)} км/ч` : 'Стоит'}
                            <br />
                            Обновлено: {new Date(popupInfo.updatedAt).toLocaleTimeString('ru-RU')}
                        </small>
                    </div>
                </Popup>
            )}

            {myLocation && (
                <Marker longitude={myLocation.longitude} latitude={myLocation.latitude} anchor="center">
                    <MyLocationIcon />
                </Marker>
            )}
        </ReactMap>
    );
}
