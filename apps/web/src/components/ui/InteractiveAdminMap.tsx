'use client';

import { useState, useCallback } from 'react';
import ReactMap, { Marker, Popup, NavigationControl, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Tag } from 'antd';

// Компонент маркера машины
const CarMarkerIcon = ({ color, isSelected }: { color: string, isSelected: boolean }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={isSelected ? "40" : "32"}
        height={isSelected ? "40" : "32"}
        viewBox="0 0 24 24"
        fill={color}
        stroke={isSelected ? '#000' : '#fff'}
        strokeWidth="1"
        style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}
    >
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
    </svg>
);

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

interface InteractiveAdminMapProps {
    viewState: {
        latitude: number;
        longitude: number;
        zoom: number;
    };
    onViewStateChange: (evt: any) => void;
    mapboxAccessToken: string;
    drivers: DriverPosition[];
    selectedDriver: string | null;
    onSelectedDriverChange: (id: string | null) => void;
    popupInfo: DriverPosition | null;
    onPopupInfoChange: (info: DriverPosition | null) => void;
    myLocation: { latitude: number; longitude: number } | null;
    getDriverColor: (driver: DriverPosition) => string;
}

export default function InteractiveAdminMap({
    viewState,
    onViewStateChange,
    mapboxAccessToken,
    drivers,
    selectedDriver,
    onSelectedDriverChange,
    popupInfo,
    onPopupInfoChange,
    myLocation,
    getDriverColor,
}: InteractiveAdminMapProps) {
    const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);

    const handleMapLoad = useCallback((event: any) => {
        const map = event.target;
        if (!map) return;
        try {
            if (map.setConfigProperty) {
                map.setConfigProperty('basemap', 'colorBuildingSelect', '#1677ff');
                console.log('Mapbox Standard building select color configured successfully');
            }
        } catch (e) {
            console.log('Failed to configure Mapbox Standard selection color:', e);
        }
    }, []);

    const handleMapClick = useCallback((event: any) => {
        const map = event.target;
        if (!map) return;

        // На всякий случай повторно настраиваем цвет
        try {
            if (map.setConfigProperty) {
                map.setConfigProperty('basemap', 'colorBuildingSelect', '#1677ff');
            }
        } catch (e) {}

        // Создаем небольшой bounding box вокруг точки клика (8x8 пикселей) для надежного попадания по 3D-зданиям
        const width = 8;
        const height = 8;
        const bbox = [
            [event.point.x - width / 2, event.point.y - height / 2],
            [event.point.x + width / 2, event.point.y + height / 2]
        ];

        const features = map.queryRenderedFeatures(bbox);
        console.log('Map clicked. Features under click (bbox):', features);
        
        // Находим здание по ID слоя, sourceLayer или типу слоя (fill-extrusion)
        const building = features.find((f: any) => {
            const layerId = (f.layer?.id || '').toLowerCase();
            const sourceLayer = (f.sourceLayer || '').toLowerCase();
            const type = (f.layer?.type || '').toLowerCase();
            return layerId.includes('building') || 
                   layerId.includes('structure') || 
                   layerId.includes('roof') ||
                   sourceLayer.includes('building') || 
                   sourceLayer.includes('structure') ||
                   type === 'fill-extrusion';
        });
        
        console.log('Selected building feature:', building);
        
        // Сбрасываем старое выделение
        if (selectedBuilding && selectedBuilding.id !== undefined) {
            try {
                map.setFeatureState(
                    { 
                        source: selectedBuilding.source || 'composite', 
                        sourceLayer: selectedBuilding.sourceLayer || 'building', 
                        id: selectedBuilding.id 
                    },
                    { select: false }
                );
            } catch (e) {}
        }

        if (building) {
            setSelectedBuilding(building);
            
            // Если есть id, выделяем через featureState
            if (building.id !== undefined) {
                try {
                    map.setFeatureState(
                        { 
                            source: building.source || 'composite', 
                            sourceLayer: building.sourceLayer || 'building', 
                            id: building.id 
                        },
                        { select: true }
                    );
                } catch (e) {
                    console.error('Failed to set feature state for building:', e);
                }
            }
        } else {
            setSelectedBuilding(null);
        }
    }, [selectedBuilding]);

    return (
        <ReactMap
            {...viewState}
            onMove={(evt: any) => onViewStateChange(evt.viewState)}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            mapboxAccessToken={mapboxAccessToken}
            style={{ width: '100%', height: '100%' }}
            onClick={handleMapClick}
            onLoad={handleMapLoad}
        >
            <NavigationControl position="bottom-right" />

            {/* Резервная подсветка (GeoJSON) для обычных векторных карт без поддержки select state */}
            {selectedBuilding && selectedBuilding.id === undefined && (
                <Source id="selected-building-geojson" type="geojson" data={selectedBuilding}>
                    <Layer
                        id="selected-building-highlight-3d"
                        type="fill-extrusion"
                        paint={{
                            'fill-extrusion-color': '#1677ff',
                            'fill-extrusion-height': [
                                '+',
                                [
                                    'coalesce',
                                    ['get', 'height'],
                                    ['get', 'render_height'],
                                    20
                                ],
                                0.5
                            ],
                            'fill-extrusion-base': [
                                'coalesce',
                                ['get', 'min_height'],
                                ['get', 'render_min_height'],
                                0
                            ],
                            'fill-extrusion-opacity': 0.8
                        }}
                    />
                    <Layer
                        id="selected-building-2d-outline"
                        type="line"
                        paint={{
                            'line-color': '#1677ff',
                            'line-width': 3,
                            'line-opacity': 0.95
                        }}
                    />
                </Source>
            )}

            {drivers.map((driver) => (
                <Marker
                    key={driver.driverId}
                    longitude={driver.longitude}
                    latitude={driver.latitude}
                    anchor="center"
                    onClick={(e: any) => {
                        e.originalEvent.stopPropagation();
                        onPopupInfoChange(driver);
                        onSelectedDriverChange(driver.driverId);
                    }}
                >
                    <div style={{ cursor: 'pointer' }}>
                        <CarMarkerIcon
                            color={getDriverColor(driver)}
                            isSelected={selectedDriver === driver.driverId}
                        />
                    </div>
                </Marker>
            ))}

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
