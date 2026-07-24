// Построение автомобильного маршрута по дорогам через бесплатный OSRM
// (публичный сервер, без ключа, запрос из браузера). Используется на карте
// заявки и на карте GPS-мониторинга, чтобы маршрут строился одинаково.

export interface RoadRoute {
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    distanceKm: number;
}

// coords — массив [lng, lat]
export async function fetchRoadRoute(coords: [number, number][]): Promise<RoadRoute | null> {
    if (coords.length < 2) return null;
    const path = coords.map((c) => `${c[0]},${c[1]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
    try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const json = await r.json();
        const route = json?.routes?.[0];
        if (!route?.geometry?.coordinates) return null;
        return { geometry: route.geometry, distanceKm: (route.distance || 0) / 1000 };
    } catch {
        return null;
    }
}
