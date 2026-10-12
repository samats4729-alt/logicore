import { Logger } from '@nestjs/common';

/**
 * Расстояние маршрута по дорогам, км — для оценки топлива в цене водителя.
 *
 * Сначала спрашиваем бесплатный маршрутизатор OSRM (тот же, что рисует
 * маршрут на карте заявки). Не ответил за несколько секунд — считаем по
 * прямой между точками с поправкой на дороги (×1,25: Алматы–Астана по прямой
 * ~970 км, по трассе ~1 215). Это оценка: водителю за топливо платят по чекам.
 */
export type LngLat = [number, number];

const ROAD_FACTOR = 1.25;
const TIMEOUT_MS = 6000;
const logger = new Logger('RouteDistance');

/** По прямой между двумя точками, км. */
export function haversineKm(a: LngLat, b: LngLat): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b[1] - a[1]);
    const dLng = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Оценка без сети: по прямой с поправкой на дороги. */
export function estimateRoadKm(points: LngLat[]): number | null {
    if (points.length < 2) return null;
    let km = 0;
    for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
    return Math.round(km * ROAD_FACTOR);
}

/** По дорогам через OSRM; не вышло — оценка по прямой. */
export async function roadDistanceKm(points: LngLat[]): Promise<number | null> {
    if (points.length < 2) return null;
    const path = points.map((p) => `${p[0]},${p[1]}`).join(';');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=false`, { signal: controller.signal });
        if (r.ok) {
            const json: any = await r.json();
            const meters = json?.routes?.[0]?.distance;
            if (typeof meters === 'number' && meters > 0) return Math.round(meters / 1000);
        }
    } catch (e) {
        logger.warn(`OSRM не ответил, считаем по прямой: ${(e as Error).message}`);
    } finally {
        clearTimeout(timer);
    }
    return estimateRoadKm(points);
}

/** Координаты точки: адрес, иначе город из справочника. */
export function pointOf(location: {
    latitude?: number | null; longitude?: number | null;
    cityRecord?: { latitude: number; longitude: number } | null;
}): LngLat | null {
    if (typeof location.latitude === 'number' && typeof location.longitude === 'number') return [location.longitude, location.latitude];
    if (location.cityRecord) return [location.cityRecord.longitude, location.cityRecord.latitude];
    return null;
}
