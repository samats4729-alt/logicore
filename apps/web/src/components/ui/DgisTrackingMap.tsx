'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { MAP_STYLE_URL } from '@/lib/maplibre';

interface TrackDriver {
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

interface DgisTrackingMapProps {
    drivers: TrackDriver[];
    selectedDriverId?: string | null;
    onDriverClick: (driver: TrackDriver) => void;
    myLocation: { latitude: number; longitude: number } | null;
    getDriverColor: (driver: TrackDriver) => string;
    onReady?: (map: any) => void;
}

const TRUCK_PATH = 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z';

export default function DgisTrackingMap({
    drivers,
    selectedDriverId,
    onDriverClick,
    myLocation,
    getDriverColor,
    onReady,
}: DgisTrackingMapProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const driverMarkersRef = useRef<maplibregl.Marker[]>([]);
    const myMarkerRef = useRef<maplibregl.Marker | null>(null);
    const onDriverClickRef = useRef(onDriverClick);
    onDriverClickRef.current = onDriverClick;

    // Инициализация карты (MapLibre + OpenFreeMap, бесплатно и без ключей)
    useEffect(() => {
        if (!containerRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: MAP_STYLE_URL,
            center: [76.9458, 43.2389],
            zoom: 12,
            attributionControl: { compact: true },
        });
        mapRef.current = map;
        onReady?.(map);

        return () => {
            driverMarkersRef.current.forEach(m => m.remove());
            driverMarkersRef.current = [];
            if (myMarkerRef.current) { myMarkerRef.current.remove(); myMarkerRef.current = null; }
            map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Маркеры водителей (пересобираем при изменении данных/выбора)
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        driverMarkersRef.current.forEach(m => m.remove());
        driverMarkersRef.current = [];

        drivers.forEach((driver) => {
            const color = getDriverColor(driver);
            const isSelected = selectedDriverId === driver.driverId;
            const size = isSelected ? 40 : 32;

            const el = document.createElement('div');
            el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid ${isSelected ? '#0b0d12' : '#ffffff'};box-shadow:0 3px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;`;
            el.innerHTML = `<svg width="${size * 0.6}" height="${size * 0.6}" viewBox="0 0 24 24" fill="#fff"><path d="${TRUCK_PATH}"/></svg>`;
            el.title = `${driver.driverName} · ${driver.vehiclePlate}`;
            el.addEventListener('click', () => onDriverClickRef.current(driver));

            const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat([driver.longitude, driver.latitude])
                .addTo(map);
            driverMarkersRef.current.push(marker);
        });
    }, [drivers, selectedDriverId, getDriverColor]);

    // Маркер «моё место»
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (myMarkerRef.current) { myMarkerRef.current.remove(); myMarkerRef.current = null; }
        if (!myLocation) return;

        const el = document.createElement('div');
        el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#1677ff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(22,119,255,0.25), 0 2px 6px rgba(0,0,0,0.3);';
        myMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([myLocation.longitude, myLocation.latitude])
            .addTo(map);
    }, [myLocation]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
