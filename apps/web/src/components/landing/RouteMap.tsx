'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './RouteMap.module.css';

/**
 * Живая карта рейса Алматы → Шымкент на главной странице.
 *
 * Карта настоящая — те же тайлы, что в кабинете, — но её код весит больше
 * всей остальной страницы. Поэтому он не входит в первую загрузку: модуль
 * подтягивается, только когда до раздела долистали. До этого на месте карты
 * лежит заглушка того же размера, чтобы страница не прыгала.
 *
 * Путь прокладывается по дорогам через открытый маршрутизатор OSRM — тот
 * же, что в карточке рейса в кабинете. Пока он отвечает, на карте лежит
 * пунктирная прямая: пустая карта хуже приблизительной линии. Расстояние
 * тоже приходит от маршрутизатора, а не считается по прямой.
 *
 * Тёмная тема получается тем же способом, что в карточке рейса: тайлы
 * приходят светлые и переворачиваются фильтром. Отдельного тёмного стиля у
 * бесплатных тайлов нет.
 */

const ALMATY: [number, number] = [76.889, 43.238];
const SHYMKENT: [number, number] = [69.596, 42.317];

/** Запасная прямая по трассе A2 — на случай, если маршрутизатор молчит. */
const FALLBACK: [number, number][] = [
    ALMATY,
    [74.752, 43.021],
    [71.367, 42.900],
    [70.641, 42.712],
    SHYMKENT,
];

const TRUCK_SVG = '<svg viewBox="0 0 640 512" width="56%" height="56%" aria-hidden="true"><path fill="#fff" d="M0 48C0 21.5 21.5 0 48 0H368c26.5 0 48 21.5 48 48V96h50.7c17 0 33.3 6.7 45.3 18.7L621.3 173.3c12 12 18.7 28.3 18.7 45.3V352c17.7 0 32 14.3 32 32s-14.3 32-32 32H576c0 53-43 96-96 96s-96-43-96-96H256c0 53-43 96-96 96s-96-43-96-96H32c-17.7 0-32-14.3-32-32V48zM160 464a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm368-48a48 48 0 1 0-96 0 48 48 0 1 0 96 0zM416 160v96h149.5L466.7 157.3c-3-3-7.1-4.7-11.3-4.7H416z"/></svg>';

function dot(color: string, size: number) {
    const el = document.createElement('div');
    el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);`;
    return el;
}

/** Точка на доле `t` пути — чтобы поставить машину на саму дорогу. */
function pointAt(line: [number, number][], t: number): [number, number] {
    if (line.length < 2) return line[0] || ALMATY;
    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < line.length; i++) {
        const d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        seg.push(d);
        total += d;
    }
    let left = total * t;
    for (let i = 0; i < seg.length; i++) {
        if (left <= seg[i]) {
            const k = seg[i] === 0 ? 0 : left / seg[i];
            return [
                line[i][0] + (line[i + 1][0] - line[i][0]) * k,
                line[i][1] + (line[i + 1][1] - line[i][1]) * k,
            ];
        }
        left -= seg[i];
    }
    return line[line.length - 1];
}

export default function RouteMap({ theme }: { theme: 'light' | 'dark' }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const [visible, setVisible] = useState(false);
    const [ready, setReady] = useState(false);
    const [distance, setDistance] = useState<number | null>(null);

    // Подгружаем, только когда раздел показался на экране.
    useEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '200px' },
        );
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!visible || !boxRef.current || mapRef.current) return;
        let cancelled = false;

        (async () => {
            const { default: maplibregl, MAP_STYLE_URL } = await import('@/lib/maplibre');
            if (cancelled || !boxRef.current) return;

            const map = new maplibregl.Map({
                container: boxRef.current,
                style: MAP_STYLE_URL,
                bounds: [[69.2, 42.0], [77.2, 43.6]],
                fitBoundsOptions: { padding: { top: 46, bottom: 46, left: 40, right: 40 } },
                // Карта здесь — витрина, а не инструмент: колесо мыши должно
                // листать страницу дальше, а не масштабировать её.
                interactive: false,
                attributionControl: false,
            });
            mapRef.current = map;

            map.on('error', (e: any) => {
                // Тайлы и маршрут приходят с чужих серверов: если они молчат,
                // это надо видеть, а не гадать по пустому прямоугольнику.
                console.error('карта рейса:', e?.error?.message || e);
            });

            const truck = document.createElement('div');
            truck.style.cssText = 'width:30px;height:30px;border-radius:50%;background:#0b0d12;border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;';
            truck.innerHTML = TRUCK_SVG;
            const truckMarker = new maplibregl.Marker({ element: truck, anchor: 'center' });

            map.on('load', () => {
                if (cancelled) return;

                map.addSource('trip', {
                    type: 'geojson',
                    data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: FALLBACK } },
                });
                map.addLayer({
                    id: 'trip-halo',
                    type: 'line',
                    source: 'trip',
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .9 },
                });
                map.addLayer({
                    id: 'trip-line',
                    type: 'line',
                    source: 'trip',
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    // Пока едет ответ маршрутизатора — пунктир: так видно, что
                    // это ещё не настоящая дорога, а прикидка.
                    paint: { 'line-color': '#1677ff', 'line-width': 2.5, 'line-dasharray': [2, 2] },
                });

                new maplibregl.Marker({ element: dot('#1677ff', 13), anchor: 'center' })
                    .setLngLat(ALMATY).addTo(map);
                new maplibregl.Marker({ element: dot('#d92d20', 13), anchor: 'center' })
                    .setLngLat(SHYMKENT).addTo(map);
                truckMarker.setLngLat(pointAt(FALLBACK, .6)).addTo(map);

                setReady(true);

                // Настоящий путь по дорогам.
                const path = `${ALMATY[0]},${ALMATY[1]};${SHYMKENT[0]},${SHYMKENT[1]}`;
                fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`)
                    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('маршрутизатор недоступен'))))
                    .then((json) => {
                        const route = json?.routes?.[0];
                        const line = route?.geometry?.coordinates as [number, number][] | undefined;
                        if (cancelled || !line || line.length < 2 || !map.getSource('trip')) return;

                        (map.getSource('trip') as any).setData({
                            type: 'Feature',
                            properties: {},
                            geometry: { type: 'LineString', coordinates: line },
                        });
                        // Дорога найдена — линия становится сплошной.
                        map.setPaintProperty('trip-line', 'line-dasharray', [1]);
                        map.setPaintProperty('trip-line', 'line-width', 3.4);
                        truckMarker.setLngLat(pointAt(line, .6));
                        if (route.distance) setDistance(Math.round(route.distance / 1000));
                    })
                    .catch((e) => {
                        // Пунктирная прямая уже нарисована — экран не пустой.
                        console.error('маршрут по дорогам не построен:', e?.message || e);
                    });
            });
        })();

        return () => {
            cancelled = true;
            mapRef.current?.remove?.();
            mapRef.current = null;
        };
    }, [visible]);

    return (
        <div className={styles.wrap}>
            <div
                ref={boxRef}
                className={styles.map}
                style={{
                    filter: theme === 'dark'
                        ? 'invert(0.92) hue-rotate(180deg) saturate(0.8) brightness(0.9) contrast(0.95)'
                        : 'none',
                }}
            />
            {!ready && <div className={styles.skeleton} aria-hidden />}

            <div className={styles.cityLeft}>Шымкент</div>
            <div className={styles.cityRight}>Алматы</div>
            <div className={styles.distance}>
                {distance ? `${distance.toLocaleString('ru-RU')} км по дорогам` : 'Строим маршрут…'}
            </div>
        </div>
    );
}
