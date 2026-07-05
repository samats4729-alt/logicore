// Единый загрузчик 2GIS MapGL на всё приложение
// Используется в DgisTrackingMap, MapPicker, FeaturedOrderCard

let mapglPromise: Promise<any> | null = null;

export function loadMapgl(): Promise<any> {
    if (typeof window === 'undefined') return Promise.reject(new Error('mapgl requires browser'));
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

export const DGIS_KEY = process.env.NEXT_PUBLIC_2GIS_API_KEY || '';
