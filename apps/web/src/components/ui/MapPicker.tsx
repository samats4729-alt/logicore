'use client';

import { useState, useCallback, useEffect } from 'react';
import ReactMap, { Marker, NavigationControl, ViewStateChangeEvent, MapMouseEvent, MarkerDragEvent } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { EnvironmentOutlined } from '@ant-design/icons';
import { App } from 'antd';

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG9udGlwaWxhdCIsImEiOiJjbWtybWQ1b3UwemdhM2NzOWkxZjJqeGZ6In0.iKSM05aqs4Wpx4B-CBscjg';

const MapPicker = ({
    initialLat,
    initialLng,
    onLocationSelect
}: {
    initialLat?: number,
    initialLng?: number,
    onLocationSelect: (lat: number, lng: number, pickedName?: string) => void
}) => {
    const { message } = App.useApp();
    const [viewState, setViewState] = useState({
        latitude: initialLat || 43.2389,
        longitude: initialLng || 76.8897,
        zoom: 13
    });
    const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(
        initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
    );

    // Update view and marker when initial props change (e.g. from address search)
    useEffect(() => {
        if (initialLat && initialLng) {
            setViewState(prev => ({
                ...prev,
                latitude: initialLat,
                longitude: initialLng
            }));
            setMarker({ lat: initialLat, lng: initialLng });
        }
    }, [initialLat, initialLng]);

    const handleMapClick = useCallback((event: MapMouseEvent) => {
        const { lat, lng } = event.lngLat;
        setMarker({ lat, lng });

        // Try to get what the user *actually* clicked on (rendered on the map)
        // This is much more reliable than reverse geocoding for specific POIs
        const features = event.target.queryRenderedFeatures(event.point);
        const poiFeature = features.find(f => f.properties?.name);

        onLocationSelect(lat, lng, poiFeature?.properties?.name);
    }, [onLocationSelect]);

    const handleMarkerDragEnd = useCallback((event: MarkerDragEvent) => {
        const { lat, lng } = event.lngLat;
        setMarker({ lat, lng });
        onLocationSelect(lat, lng);
    }, [onLocationSelect]);

    return (
        <div style={{ height: '400px', width: '100%', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
            <ReactMap
                {...viewState}
                onMove={(evt: any) => setViewState(evt.viewState)}
                onLoad={(event) => {
                    const map = event.target;
                    const style = map.getStyle();
                    if (style && style.layers) {
                        for (const layer of style.layers) {
                            // Skip house numbers and other non-name labels
                            if (layer.id.includes('housenum') || layer.id.includes('number')) {
                                continue;
                            }

                            if (layer.layout && (layer.layout as any)['text-field']) {
                                map.setLayoutProperty(layer.id, 'text-field', [
                                    'coalesce',
                                    ['get', 'name_ru'],
                                    ['get', 'name']
                                ]);
                            }
                        }
                    }
                }}
                mapStyle="mapbox://styles/mapbox/streets-v12"
                mapboxAccessToken={MAPBOX_TOKEN}
                onClick={handleMapClick}
                cursor="crosshair"
            >
                <NavigationControl position="top-right" />

                {marker && (
                    <Marker
                        latitude={marker.lat}
                        longitude={marker.lng}
                        draggable
                        onDragEnd={handleMarkerDragEnd}
                        anchor="bottom"
                    >
                        <EnvironmentOutlined style={{ fontSize: '32px', color: '#1890ff', filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.5))' }} />
                    </Marker>
                )}
            </ReactMap>
        </div>
    );
};

export default MapPicker;
