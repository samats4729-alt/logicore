'use client';

import { useEffect, useRef } from 'react';
import { EnvironmentOutlined } from '@ant-design/icons';

const DGIS_KEY = process.env.NEXT_PUBLIC_2GIS_API_KEY || '';

// Единый загрузчик 2GIS MapGL на всё приложение
let mapglPromise: Promise<any> | null = null;
function loadMapgl(): Promise<any> {
    if ((window as any).mapgl) return Promise.resolve((window as any).mapgl);
    if (!mapglPromise) {
        mapglPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://mapgl.2gis.com/api/js/v1';
            s.onload = () => resolve((window as any).mapgl);
            s.onerror = () => {
                mapglPromise = null;
                reject(new Error('Не удалось загрузить 2GIS MapGL'));
            };
            document.head.appendChild(s);
        });
    }
    return mapglPromise;
}

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
    const mapRef = useRef<any>(null);
    const mapglRef = useRef<any>(null);
    const driverMarkersRef = useRef<any[]>([]);
    const myMarkerRef = useRef<any>(null);
    const onDriverClickRef = useRef(onDriverClick);
    onDriverClickRef.current = onDriverClick;

    // Инициализация карты (обычная светлая 2GIS, плоская)
    useEffect(() => {
        if (!DGIS_KEY || !containerRef.current) return;
        let cancelled = false;

        loadMapgl().then((mapgl) => {
            if (cancelled || !containerRef.current) return;
            mapglRef.current = mapgl;
            const map = new mapgl.Map(containerRef.current, {
                center: [76.9458, 43.2389],
                zoom: 12,
                key: DGIS_KEY,
                lang: 'ru',
            });
            mapRef.current = map;
            onReady?.(map);
        }).catch(() => { /* сеть/ключ — ниже есть заглушка про ключ */ });

        return () => {
            cancelled = true;
            driverMarkersRef.current.forEach(m => m.destroy());
            driverMarkersRef.current = [];
            if (myMarkerRef.current) { myMarkerRef.current.destroy(); myMarkerRef.current = null; }
            if (mapRef.current) { mapRef.current.destroy(); mapRef.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Маркеры водителей (пересобираем при изменении данных/выбора)
    useEffect(() => {
        const map = mapRef.current;
        const mapgl = mapglRef.current;
        if (!map || !mapgl) return;

        driverMarkersRef.current.forEach(m => m.destroy());
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

            const marker = new mapgl.HtmlMarker(map, {
                coordinates: [driver.longitude, driver.latitude],
                html: el,
                anchor: [size / 2, size / 2],
            });
            driverMarkersRef.current.push(marker);
        });
    }, [drivers, selectedDriverId, getDriverColor]);

    // Маркер «моё место»
    useEffect(() => {
        const map = mapRef.current;
        const mapgl = mapglRef.current;
        if (!map || !mapgl) return;
        if (myMarkerRef.current) { myMarkerRef.current.destroy(); myMarkerRef.current = null; }
        if (!myLocation) return;

        const el = document.createElement('div');
        el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#1677ff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(22,119,255,0.25), 0 2px 6px rgba(0,0,0,0.3);';
        myMarkerRef.current = new mapgl.HtmlMarker(map, {
            coordinates: [myLocation.longitude, myLocation.latitude],
            html: el,
            anchor: [8, 8],
        });
    }, [myLocation]);

    if (!DGIS_KEY) {
        return (
            <div style={{
                height: '100%', width: '100%', background: '#f6f7f9',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 8, color: '#8a91a0', fontSize: 13,
            }}>
                <EnvironmentOutlined style={{ fontSize: 28, color: '#c3c9d4' }} />
                <div style={{ fontWeight: 600, color: '#5b6472' }}>Карта не настроена</div>
                <div style={{ textAlign: 'center', maxWidth: 360 }}>
                    Не задан NEXT_PUBLIC_2GIS_API_KEY (сервис web, нужна пересборка).
                </div>
            </div>
        );
    }

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
