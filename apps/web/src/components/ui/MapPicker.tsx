'use client';

import { useEffect, useRef } from 'react';
import { EnvironmentOutlined } from '@ant-design/icons';

const DGIS_KEY = process.env.NEXT_PUBLIC_2GIS_API_KEY || '';

// Загрузчик 2GIS MapGL (одна инъекция скрипта на всё приложение)
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

const MapPicker = ({
    initialLat,
    initialLng,
    onLocationSelect
}: {
    initialLat?: number,
    initialLng?: number,
    onLocationSelect: (lat: number, lng: number, pickedName?: string) => void
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const mapglRef = useRef<any>(null);
    // Актуальный колбэк без пересоздания карты
    const onSelectRef = useRef(onLocationSelect);
    onSelectRef.current = onLocationSelect;

    const placeMarker = (lng: number, lat: number) => {
        if (!mapglRef.current || !mapRef.current) return;
        if (markerRef.current) {
            markerRef.current.destroy();
            markerRef.current = null;
        }
        markerRef.current = new mapglRef.current.Marker(mapRef.current, {
            coordinates: [lng, lat],
        });
    };

    // Инициализация карты
    useEffect(() => {
        if (!DGIS_KEY || !containerRef.current) return;
        let cancelled = false;

        // Небольшая задержка: даём анимации модалки закончиться, чтобы WebGL-инициализация не дёргала интерфейс
        const timer = window.setTimeout(() => {
            loadMapgl().then((mapgl) => {
                if (cancelled || !containerRef.current) return;
                mapglRef.current = mapgl;

                const hasPoint = !!(initialLat && initialLng);
                const map = new mapgl.Map(containerRef.current, {
                    center: [initialLng || 76.8897, initialLat || 43.2389],
                    zoom: hasPoint ? 17.2 : 13,
                    // Наклон камеры — включает 3D-здания 2GIS на близком зуме
                    pitch: 45,
                    rotation: -15,
                    key: DGIS_KEY,
                    lang: 'ru',
                });
                mapRef.current = map;

                if (hasPoint) {
                    placeMarker(initialLng as number, initialLat as number);
                }

                map.on('click', (e: any) => {
                    const [lng, lat] = e.lngLat;
                    placeMarker(lng, lat);
                    onSelectRef.current(lat, lng);
                });
            }).catch(() => { /* заглушка ниже уже объясняет про ключ; сеть — редкий случай */ });
        }, 150);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            if (markerRef.current) { markerRef.current.destroy(); markerRef.current = null; }
            if (mapRef.current) { mapRef.current.destroy(); mapRef.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Перелёт к точке из поиска адреса (зум 17+ — виден 3D-город)
    useEffect(() => {
        if (!mapRef.current || !initialLat || !initialLng) return;
        mapRef.current.setCenter([initialLng, initialLat]);
        mapRef.current.setZoom(17.2);
        placeMarker(initialLng, initialLat);
    }, [initialLat, initialLng]);

    if (!DGIS_KEY) {
        return (
            <div style={{
                height: 400, width: '100%', borderRadius: 8, background: '#f6f7f9',
                border: '1px dashed #d9dce3', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8, color: '#8a91a0', fontSize: 13,
            }}>
                <EnvironmentOutlined style={{ fontSize: 28, color: '#c3c9d4' }} />
                <div style={{ fontWeight: 600, color: '#5b6472' }}>Карта не настроена</div>
                <div style={{ textAlign: 'center', maxWidth: 360 }}>
                    Не задан NEXT_PUBLIC_2GIS_API_KEY. Переменная должна быть на сервисе web
                    и требует пересборки (redeploy) фронтенда.
                </div>
            </div>
        );
    }

    return (
        <div style={{ height: 400, width: '100%', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
    );
};

export default MapPicker;
