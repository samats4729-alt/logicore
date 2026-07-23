'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { MAP_STYLE_URL } from '@/lib/maplibre';

// Белый грузовик для маркера водителя (на чёрном круге)
const TRUCK_SVG = '<svg viewBox="0 0 640 512" width="58%" height="58%" aria-hidden="true"><path fill="#fff" d="M0 48C0 21.5 21.5 0 48 0H368c26.5 0 48 21.5 48 48V96h50.7c17 0 33.3 6.7 45.3 18.7L621.3 173.3c12 12 18.7 28.3 18.7 45.3V352c17.7 0 32 14.3 32 32s-14.3 32-32 32H576c0 53-43 96-96 96s-96-43-96-96H256c0 53-43 96-96 96s-96-43-96-96H32c-17.7 0-32-14.3-32-32V48zM160 464a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm368-48a48 48 0 1 0-96 0 48 48 0 1 0 96 0zM416 160v96h149.5L466.7 157.3c-3-3-7.1-4.7-11.3-4.7H416z"/></svg>';

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
    autoFit?: boolean;             // центрировать/масштабировать по маркерам
    extraPoints?: ExtraPoint[];    // доп. точки (погрузка/выгрузка)
}

interface ExtraPoint { latitude: number; longitude: number; label?: string; color?: string }


export default function DgisTrackingMap({
    drivers,
    selectedDriverId,
    onDriverClick,
    myLocation,
    getDriverColor,
    onReady,
    autoFit,
    extraPoints,
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
            const isSelected = selectedDriverId === driver.driverId;
            const size = isSelected ? 40 : 32;

            // Маркер водителя — чёрный круг с белым грузовиком внутри
            const el = document.createElement('div');
            el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:#0b0d12;border:2.5px solid ${isSelected ? '#1677ff' : '#ffffff'};box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;cursor:pointer;`;
            el.innerHTML = TRUCK_SVG;
            el.title = `${driver.driverName} · ${driver.vehiclePlate}`;
            el.addEventListener('click', () => onDriverClickRef.current(driver));

            const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat([driver.longitude, driver.latitude])
                .addTo(map);
            driverMarkersRef.current.push(marker);
        });
    }, [drivers, selectedDriverId, getDriverColor]);

    // Доп. точки (погрузка/выгрузка) + авто-подгонка вида под все маркеры
    const extraMarkersRef = useRef<maplibregl.Marker[]>([]);
    const lastFitKeyRef = useRef('');
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        extraMarkersRef.current.forEach(m => m.remove());
        extraMarkersRef.current = [];
        (extraPoints || []).forEach((pt) => {
            const el = document.createElement('div');
            const c = pt.color || '#64748b';
            el.style.cssText = `width:14px;height:14px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${c};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);`;
            if (pt.label) el.title = pt.label;
            const m = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([pt.longitude, pt.latitude]).addTo(map);
            extraMarkersRef.current.push(m);
        });

        // Подгоняем вид только когда меняется НАБОР маркеров (новый водитель/точка),
        // а не при каждом обновлении координат — иначе карта постоянно «дёргается».
        if (autoFit) {
            const key = [...drivers.map(d => d.driverId), ...(extraPoints || []).map(p => `${p.latitude},${p.longitude}`)].join('|');
            if (key !== lastFitKeyRef.current) {
                lastFitKeyRef.current = key;
                const pts: [number, number][] = [
                    ...drivers.map(d => [d.longitude, d.latitude] as [number, number]),
                    ...(extraPoints || []).map(p => [p.longitude, p.latitude] as [number, number]),
                ].filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
                if (pts.length === 1) {
                    map.easeTo({ center: pts[0], zoom: 13, duration: 500 });
                } else if (pts.length > 1) {
                    const bounds = pts.reduce((b, p) => b.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
                    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 500 });
                }
            }
        }
    }, [extraPoints, drivers, autoFit]);

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
