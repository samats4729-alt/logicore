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
}: InteractiveMapProps) {
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
            mapStyle={mapStyle}
            mapboxAccessToken={mapboxAccessToken}
            style={{ width: '100%', height: '100%' }}
            terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
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
