'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { MAP_STYLE_URL } from '@/lib/maplibre';

const MapPicker = ({
    initialLat,
    initialLng,
    focusLat,
    focusLng,
    focusZoom,
    onLocationSelect
}: {
    initialLat?: number,
    initialLng?: number,
    focusLat?: number,
    focusLng?: number,
    focusZoom?: number,
    onLocationSelect: (lat: number, lng: number, pickedName?: string) => void
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markerRef = useRef<maplibregl.Marker | null>(null);
    // Актуальный колбэк без пересоздания карты
    const onSelectRef = useRef(onLocationSelect);
    onSelectRef.current = onLocationSelect;

    const placeMarker = (lng: number, lat: number) => {
        if (!mapRef.current) return;
        if (markerRef.current) {
            markerRef.current.remove();
            markerRef.current = null;
        }
        markerRef.current = new maplibregl.Marker({ color: '#1677ff' })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
    };

    // Инициализация карты
    useEffect(() => {
        if (!containerRef.current) return;
        let cancelled = false;

        // Небольшая задержка: даём анимации модалки закончиться, чтобы WebGL-инициализация не дёргала интерфейс
        const timer = window.setTimeout(() => {
            if (cancelled || !containerRef.current) return;

            const hasPoint = !!(initialLat && initialLng);
            const map = new maplibregl.Map({
                container: containerRef.current,
                style: MAP_STYLE_URL,
                center: [initialLng || 76.8897, initialLat || 43.2389],
                zoom: hasPoint ? 17.2 : 13,
                pitch: 45,
                bearing: -15,
                attributionControl: { compact: true },
            });
            mapRef.current = map;

            if (hasPoint) {
                placeMarker(initialLng as number, initialLat as number);
            }

            map.on('click', (e) => {
                const { lng, lat } = e.lngLat;
                placeMarker(lng, lat);
                onSelectRef.current(lat, lng);
            });
        }, 150);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
            if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Перелёт к точке из поиска адреса (зум 17+ — видны номера домов)
    useEffect(() => {
        if (!mapRef.current || !initialLat || !initialLng) return;
        mapRef.current.setCenter([initialLng, initialLat]);
        mapRef.current.setZoom(17.2);
        placeMarker(initialLng, initialLat);
    }, [initialLat, initialLng]);

    // Обзор выбранного города (без маркера — точку ставит поиск улицы/клик)
    useEffect(() => {
        if (!mapRef.current || focusLat == null || focusLng == null) return;
        mapRef.current.flyTo({ center: [focusLng, focusLat], zoom: focusZoom ?? 11.5, essential: true });
    }, [focusLat, focusLng, focusZoom]);

    return (
        <div style={{ height: 400, width: '100%', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

export default MapPicker;
