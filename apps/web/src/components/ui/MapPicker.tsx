'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Component that handles map clicks
const MapEvents = ({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) => {
    const { useMapEvents } = require('react-leaflet');
    const map = useMapEvents({
        click(e: any) {
            onLocationSelect(e.latlng.lat, e.latlng.lng);
            map.flyTo(e.latlng, map.getZoom());
        },
    });
    return null;
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
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet');
    const L = require('leaflet');
    require('leaflet/dist/leaflet.css');

    const [position, setPosition] = useState<[number, number] | null>(
        initialLat && initialLng ? [initialLat, initialLng] : null
    );

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
            <MapEvents onLocationSelect={handleSelect} />
            {position && (
                <Marker position={position} icon={icon}>
                    <Popup>Выбрана точка</Popup>
                </Marker>
            )}
        </MapContainer>
    );
};

// Export dynamic component to avoid SSR issues
export default dynamic(() => Promise.resolve(MapComponent), {
    ssr: false,
    loading: () => <p>Загрузка карты...</p>
});
