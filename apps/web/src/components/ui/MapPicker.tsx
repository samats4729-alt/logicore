'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Component that handles map clicks and updates center when position changes
const MapEvents = ({
    onLocationSelect,
    externalPosition
}: {
    onLocationSelect: (lat: number, lng: number) => void;
    externalPosition?: [number, number] | null;
}) => {
    const { useMapEvents, useMap } = require('react-leaflet');
    const map = useMap();

    // Fly to new position when address is selected
    useEffect(() => {
        if (externalPosition) {
            map.flyTo(externalPosition, 15);
        }
    }, [externalPosition, map]);

    useMapEvents({
        click(e: any) {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
            map.flyTo(e.latlng, map.getZoom());
        },
    });
    return null;
};

// Draggable marker component
const DraggableMarker = ({
    position,
    icon,
    onDragEnd
}: {
    position: [number, number];
    icon: any;
    onDragEnd: (lat: number, lng: number) => void;
}) => {
    const { Marker, Popup } = require('react-leaflet');

    return (
        <Marker
            position={position}
            icon={icon}
            draggable={true}
            eventHandlers={{
                dragend: (e: any) => {
                    const marker = e.target;
                    const pos = marker.getLatLng();
                    onDragEnd(pos.lat, pos.lng);
                },
            }}
        >
            <Popup>
                <div style={{ textAlign: 'center' }}>
                    <strong>Выбранная точка</strong>
                    <br />
                    <span style={{ fontSize: 11, color: '#666' }}>
                        Перетащите маркер для уточнения
                    </span>
                </div>
            </Popup>
        </Marker>
    );
};

const MapComponent = ({
    initialLat,
    initialLng,
    onLocationSelect
}: {
    initialLat?: number,
    initialLng?: number,
    onLocationSelect: (lat: number, lng: number) => void
}) => {
    const { MapContainer, TileLayer } = require('react-leaflet');
    const L = require('leaflet');
    require('leaflet/dist/leaflet.css');

    const [position, setPosition] = useState<[number, number] | null>(
        initialLat && initialLng ? [initialLat, initialLng] : null
    );

    // Update internal position when external props change (address autocomplete)
    useEffect(() => {
        if (initialLat && initialLng) {
            setPosition([initialLat, initialLng]);
        }
    }, [initialLat, initialLng]);

    // Create icon inside component to avoid SSR issues
    const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const handleSelect = (lat: number, lng: number) => {
        setPosition([lat, lng]);
        onLocationSelect(lat, lng);
    };

    const handleDragEnd = (lat: number, lng: number) => {
        setPosition([lat, lng]);
        onLocationSelect(lat, lng);
    };

    // Almaty center default
    const center: [number, number] = initialLat && initialLng ? [initialLat, initialLng] : [43.2389, 76.8897];

    return (
        <MapContainer
            center={center}
            zoom={13}
            style={{ height: '400px', width: '100%', borderRadius: 8 }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapEvents
                onLocationSelect={handleSelect}
                externalPosition={position}
            />
            {position && (
                <DraggableMarker
                    position={position}
                    icon={icon}
                    onDragEnd={handleDragEnd}
                />
            )}
        </MapContainer>
    );
};

// Export dynamic component to avoid SSR issues
export default dynamic(() => Promise.resolve(MapComponent), {
    ssr: false,
    loading: () => <p>Загрузка карты...</p>
});
