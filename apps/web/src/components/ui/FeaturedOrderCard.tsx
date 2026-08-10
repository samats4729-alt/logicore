'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dropdown } from 'antd';
import { RightOutlined, PhoneOutlined, EnvironmentOutlined, WhatsAppOutlined, CopyOutlined } from '@ant-design/icons';
import { ChevronDown, ChevronUp } from 'lucide-react';
import dayjs from 'dayjs';
import { STATUS_LABELS } from './StatusPill';
import StatusPill from './StatusPill';
import styles from './FeaturedOrderCard.module.css';
import { shortenCompanyName } from '@/lib/company-helper';
import maplibregl, { MAP_STYLE_URL } from '@/lib/maplibre';
import { useTheme } from '@/components/ThemeProvider';
import { toast } from 'sonner';

// Прогресс, цвет полосы и инициалы переехали в lib/order-status: те же
// значения были скопированы ещё в страницу списка заявок, и копии начали
// расходиться. Здесь оставлен ре-экспорт, чтобы не переписывать соседей.
import { ORDER_STATUS_PROGRESS, nameInitials, progressColor as orderProgressColor } from '@/lib/order-status';

export { ORDER_STATUS_PROGRESS, nameInitials, orderProgressColor };

function cityOf(order: any, type: 'pickup' | 'delivery'): string {
    const pts = order?.routePoints || [];
    let loc: any;
    if (type === 'pickup') {
        loc = pts.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP')?.location;
    } else {
        const dels = pts.filter((p: any) => p.pointType === 'DELIVERY');
        loc = dels.length ? dels[dels.length - 1].location : undefined;
    }
    if (loc?.city) return loc.city;
    if (loc?.address) {
        const m = loc.address.match(/г\.\s*([^,]+)/);
        if (m?.[1]) return m[1].trim();
    }
    return loc?.name || '';
}

// Белый грузовик для маркера водителя (на чёрном круге)
const TRUCK_SVG = '<svg viewBox="0 0 640 512" width="58%" height="58%" aria-hidden="true"><path fill="#fff" d="M0 48C0 21.5 21.5 0 48 0H368c26.5 0 48 21.5 48 48V96h50.7c17 0 33.3 6.7 45.3 18.7L621.3 173.3c12 12 18.7 28.3 18.7 45.3V352c17.7 0 32 14.3 32 32s-14.3 32-32 32H576c0 53-43 96-96 96s-96-43-96-96H256c0 53-43 96-96 96s-96-43-96-96H32c-17.7 0-32-14.3-32-32V48zM160 464a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm368-48a48 48 0 1 0-96 0 48 48 0 1 0 96 0zM416 160v96h149.5L466.7 157.3c-3-3-7.1-4.7-11.3-4.7H416z"/></svg>';

// Упрощённый контур Казахстана (Natural Earth) — для проверки, не ушёл ли маршрут за границу
const KZ_BOUNDARY: [number, number][] = [[70.962,42.266],[70.389,42.081],[69.07,41.384],[68.632,40.669],[68.26,40.662],[67.986,41.136],[66.714,41.168],[66.511,41.988],[66.023,41.995],[66.098,42.998],[64.901,43.728],[63.186,43.65],[62.013,43.504],[61.058,44.406],[60.24,44.784],[58.69,45.5],[58.503,45.587],[55.929,44.996],[55.968,41.309],[55.455,41.26],[54.755,42.044],[54.079,42.324],[52.944,42.116],[52.502,41.783],[52.446,42.027],[52.692,42.444],[52.501,42.792],[51.342,43.133],[50.891,44.031],[50.339,44.284],[50.306,44.61],[51.279,44.515],[51.317,45.246],[52.167,45.408],[53.041,45.259],[53.221,46.235],[53.043,46.853],[52.042,46.805],[51.192,47.049],[50.034,46.609],[49.101,46.399],[48.593,46.561],[48.695,47.076],[48.057,47.744],[47.315,47.716],[46.466,48.394],[47.044,49.152],[46.752,49.356],[47.549,50.455],[48.578,49.875],[48.702,50.605],[50.767,51.693],[52.329,51.719],[54.533,51.026],[55.717,50.622],[56.778,51.044],[58.363,51.064],[59.642,50.545],[59.933,50.842],[61.337,50.799],[61.588,51.273],[59.968,51.96],[60.927,52.448],[60.74,52.72],[61.7,52.98],[60.978,53.665],[61.437,54.006],[65.179,54.354],[65.667,54.601],[68.169,54.97],[69.068,55.385],[70.865,55.17],[71.18,54.133],[72.224,54.377],[73.509,54.036],[73.426,53.49],[74.385,53.547],[76.891,54.491],[76.525,54.177],[77.801,53.404],[80.036,50.865],[80.568,51.388],[81.946,50.812],[83.383,51.069],[83.935,50.889],[84.416,50.311],[85.116,50.117],[85.541,49.693],[86.829,49.827],[87.36,49.215],[86.599,48.549],[85.768,48.456],[85.72,47.453],[85.164,47.001],[83.18,47.33],[82.459,45.54],[81.947,45.317],[79.966,44.918],[80.866,43.18],[80.18,42.92],[80.26,42.35],[79.644,42.497],[79.142,42.856],[77.658,42.961],[76,42.988],[75.637,42.878],[74.213,43.298],[73.645,43.091],[73.49,42.501],[71.845,42.845],[71.186,42.704],[70.962,42.266]];

function pointInKz([x, y]: [number, number]): boolean {
    let inside = false;
    for (let i = 0, j = KZ_BOUNDARY.length - 1; i < KZ_BOUNDARY.length; j = i++) {
        const [xi, yi] = KZ_BOUNDARY[i];
        const [xj, yj] = KZ_BOUNDARY[j];
        if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

function haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371, toRad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * toRad, dLng = (b[0] - a[0]) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function straightKm(pts: [number, number][]): number {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += haversineKm(pts[i - 1], pts[i]);
    return d;
}

// Мини-карта маршрута (точки погрузки → выгрузки)
function RouteMapThumbnail({ order, theme }: { order: any; theme: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const [distanceKm, setDistanceKm] = useState<number | null>(null);

    const coords = useMemo(() => {
        const pts = (order?.routePoints || []) as any[];
        return pts
            .filter((p: any) => p.location?.latitude && p.location?.longitude)
            .map((p: any) => [p.location.longitude, p.location.latitude] as [number, number]);
    }, [order?.routePoints]);

    const driver: [number, number] | null = (order?.driverLat != null && order?.driverLng != null)
        ? [order.driverLng, order.driverLat] : null;

    useEffect(() => {
        if (!containerRef.current) return;
        const allPts = [...coords, ...(driver ? [driver] : [])];
        if (allPts.length < 1) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: MAP_STYLE_URL,
            center: driver || coords[0],
            zoom: 11,
            interactive: true,           // можно двигать и масштабировать
            attributionControl: false,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        mapRef.current = map;

        const markers: maplibregl.Marker[] = [];

        // Маркеры точек маршрута
        coords.forEach((c, i) => {
            const isFirst = i === 0;
            const el = document.createElement('div');
            el.style.cssText = `width:${isFirst ? 10 : 8}px;height:${isFirst ? 10 : 8}px;border-radius:50%;background:${isFirst ? '#1677ff' : '#dc3545'};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);`;
            markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(c).addTo(map));
        });

        // Грузовик водителя — чёрный круг, белый грузовик внутри
        if (driver) {
            const el = document.createElement('div');
            el.style.cssText = 'width:32px;height:32px;border-radius:50%;background:#0b0d12;border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;';
            el.innerHTML = TRUCK_SVG;
            markers.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(driver).addTo(map));
        }

        // Маршрут по дорогам (бесплатный OSRM, без ключа) + запасной прямой пунктир
        let cancelled = false;
        const straight = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } };
        // Рисуем линию маршрута, каждый раз пересоздавая слой начисто (надёжнее, чем менять dasharray)
        const drawRoute = (data: any, solid: boolean) => {
            if (!map || cancelled) return;
            const apply = () => {
                if (cancelled) return;
                if (map.getLayer('route-line')) map.removeLayer('route-line');
                if (map.getSource('route')) map.removeSource('route');
                map.addSource('route', { type: 'geojson', data });
                map.addLayer({
                    id: 'route-line', type: 'line', source: 'route',
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: solid
                        ? { 'line-color': '#1677ff', 'line-width': 3.5 }
                        : { 'line-color': '#1677ff', 'line-width': 2.5, 'line-dasharray': [2, 2] },
                });
            };
            if (map.isStyleLoaded()) apply(); else map.once('load', apply);
        };

        if (coords.length >= 2) {
            drawRoute(straight, false); // мгновенно показываем прямую, пока грузится маршрут
            setDistanceKm(straightKm(coords)); // сразу примерный км, даже если сервер маршрутов не ответит
            // Заявка внутри Казахстана, если ВСЕ точки маршрута внутри страны.
            // Если хоть одна точка за границей — груз едет за рубеж, маршрут через границу разрешён.
            const domestic = coords.every(pointInKz);
            const path = coords.map(c => `${c[0]},${c[1]}`).join(';');
            const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;

            const tryFetch = (attemptsLeft: number): Promise<void> =>
                fetch(url)
                    .then(r => r.ok ? r.json() : Promise.reject(new Error('http')))
                    .then(json => {
                        const route = json?.routes?.[0];
                        if (cancelled) return;
                        if (!route?.geometry) throw new Error('no-route');
                        const line = (route.geometry.coordinates || []) as [number, number][];

                        // Для внутренних заявок отбрасываем только грубый заезд за границу (большой крюк),
                        // а не лёгкое касание границы (контур страны упрощённый). Порог высокий.
                        if (domestic && line.length > 1) {
                            const stepN = Math.max(1, Math.floor(line.length / 200));
                            const sample = line.filter((_, i) => i % stepN === 0);
                            const outside = sample.filter(p => !pointInKz(p)).length;
                            if (outside / sample.length > 0.4) {
                                setDistanceKm(straightKm(coords));
                                return;
                            }
                        }

                        drawRoute({ type: 'Feature', properties: {}, geometry: route.geometry }, true);
                        if (typeof route.distance === 'number') setDistanceKm(route.distance / 1000);
                    })
                    .catch(() => {
                        // сервер маршрутов не ответил — ещё одна попытка, потом остаётся прямая + прямой км
                        if (attemptsLeft > 0 && !cancelled) {
                            return new Promise<void>(res => setTimeout(res, 900)).then(() => tryFetch(attemptsLeft - 1));
                        }
                    });

            tryFetch(1);
        }

        // Подгоняем вид под все точки (маршрут + водитель)
        if (allPts.length >= 2) {
            const lngs = allPts.map(c => c[0]);
            const lats = allPts.map(c => c[1]);
            map.fitBounds(
                [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
                { padding: 34, maxZoom: 13, duration: 0 },
            );
        }

        return () => {
            cancelled = true;
            markers.forEach(m => m.remove());
            map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coords, order?.driverLat, order?.driverLng]);

    if (coords.length < 1 && !driver) {
        const isDark = theme === 'dark';
        return (
            <div style={{
                flex: 1,
                minHeight: 140,
                background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                marginBottom: 12
            }}>
                <EnvironmentOutlined style={{
                    fontSize: 22,
                    color: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)'
                }} />
            </div>
        );
    }

    const mapFilter = theme === 'dark'
        ? 'invert(0.92) hue-rotate(180deg) saturate(0.8) brightness(0.9) contrast(0.95)'
        : 'none';

    return (
        <div style={{ position: 'relative', flex: 1, minHeight: 140, marginBottom: 12 }}>
            <div ref={containerRef} style={{
                position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden',
                filter: mapFilter,
                background: theme === 'dark' ? '#1a1e26' : '#f1f5f9',
            }} />
            {distanceKm != null && (
                <div style={{
                    position: 'absolute', top: 7, left: 7, zIndex: 2, pointerEvents: 'none',
                    padding: '2px 7px', borderRadius: 7,
                    fontSize: 10.5, fontWeight: 600, letterSpacing: '0.02em',
                    color: theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(11,13,18,0.5)',
                    background: theme === 'dark' ? 'rgba(20,24,32,0.55)' : 'rgba(255,255,255,0.6)',
                    backdropFilter: 'blur(3px)',
                }}>
                    ≈ {Math.round(distanceKm).toLocaleString('ru-RU')} км
                </div>
            )}
        </div>
    );
}

/** Точка маршрута целиком — нужны адрес и срок, а не только город. */
function pointOf(order: any, type: 'pickup' | 'delivery') {
    const pts = (order?.routePoints || []) as any[];
    if (type === 'pickup') return pts.find((p) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
    const dels = pts.filter((p) => p.pointType === 'DELIVERY');
    return dels.length ? dels[dels.length - 1] : undefined;
}

function money(value?: number | null) {
    return value ? `${value.toLocaleString('ru-RU')} ₸` : '—';
}

/**
 * Карточка рейса по эталону `design/orders-list`: три этажа в одной
 * карточке — шапка с номером и действиями, середина «путь + карта», подвал
 * с деньгами.
 *
 * Стрелка сворачивания живёт в шапке карточки. Отдельной серой полосы над
 * карточкой больше нет: владелец смотрел прямо на неё и не понимал, чем
 * свернулась карточка. В шапке стрелка стоит там же, где сама карточка, и
 * читается как её собственный орган управления.
 */
export default function FeaturedOrderCard({
    order,
    onOpen,
    collapsed = false,
    onToggle,
}: {
    order: any;
    onOpen?: (id: string) => void;
    collapsed?: boolean;
    onToggle?: () => void;
}) {
    const { theme } = useTheme();
    const router = useRouter();

    if (!order) return null;

    const progress = ORDER_STATUS_PROGRESS[order.status] ?? 0;
    const driverName = order.assignedDriverName
        || (order.driver ? `${order.driver.lastName} ${order.driver.firstName}` : '');
    const plate = order.assignedDriverPlate || order.driver?.vehiclePlate || '';
    const phone = order.assignedDriverPhone ? String(order.assignedDriverPhone) : '';
    const digits = phone.replace(/[^\d]/g, '');
    const hasDriverPosition = order.driverLat != null && order.driverLng != null;

    const pickup = pointOf(order, 'pickup');
    const delivery = pointOf(order, 'delivery');
    const carrierName = order.subForwarder?.name || order.forwarder?.name || order.partner?.name || '';
    const carrierPrice = order.driverCost || order.subForwarderPrice;
    const margin = order.customerPrice != null && carrierPrice != null
        ? order.customerPrice - carrierPrice
        : null;
    const invoice = order.accountingDocuments?.[0]?.document;

    const cargo = [
        order.natureOfCargo,
        order.cargoWeight ? `${order.cargoWeight.toLocaleString('ru-RU')} кг` : null,
        order.cargoType,
    ].filter(Boolean).join(' · ') || order.cargoDescription || 'Груз не указан';

    const stepDate = (pt: any) => (pt?.expectedDate ? dayjs(pt.expectedDate).format('DD.MM HH:mm') : '');

    return (
        <div className={styles.card}>
            <div className={styles.head}>
                <span className={styles.num}>{order.orderNumber}</span>
                <StatusPill status={order.status} />
                <span className={styles.divider} />
                <span className={styles.cargo}>{cargo}</span>

                <div className={styles.actions}>
                    {phone && (
                        <button type="button" className={styles.act} onClick={() => { window.location.href = `tel:${phone}`; }}>
                            <PhoneOutlined /> Позвонить
                        </button>
                    )}
                    {phone && (
                        <button type="button" className={styles.act} onClick={() => window.open(`https://wa.me/${digits}`, '_blank')}>
                            <WhatsAppOutlined /> WhatsApp
                        </button>
                    )}
                    {/* Кнопка есть, только когда машину видно: экран мониторинга
                        без координат покажет пустую карту, а человек решит, что
                        она сломалась. */}
                    {hasDriverPosition && (
                        <button type="button" className={styles.act} onClick={() => router.push('/company/tracking')}>
                            <EnvironmentOutlined /> На карте
                        </button>
                    )}
                    {onOpen && (
                        <button type="button" className={`${styles.act} ${styles.actPrimary}`} onClick={() => onOpen(order.id)}>
                            Открыть заявку <RightOutlined />
                        </button>
                    )}
                    {onToggle && (
                        <button
                            type="button"
                            className={styles.arrow}
                            aria-label={collapsed ? 'Развернуть карточку рейса' : 'Свернуть карточку рейса'}
                            aria-expanded={!collapsed}
                            onClick={onToggle}
                        >
                            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                        </button>
                    )}
                </div>
            </div>

            {!collapsed && (
                <>
                    <div className={styles.body}>
                        <div className={styles.path}>
                            <div className={`${styles.step} ${styles.stepDone}`}>
                                <i />
                                <div className={styles.stepText}>
                                    <b>{cityOf(order, 'pickup') || 'Погрузка'}</b>
                                    <span>{pickup?.location?.address || 'Точка погрузки'}</span>
                                </div>
                                <div className={styles.stepAside}>
                                    <b>{stepDate(pickup) || '—'}</b>
                                    <span>Погрузка</span>
                                </div>
                            </div>
                            <div className={`${styles.step} ${styles.stepActive}`}>
                                <i />
                                <div className={styles.stepText}>
                                    <b>{STATUS_LABELS[order.status] || order.status}</b>
                                    <span>Текущий статус</span>
                                </div>
                                <div className={styles.stepAside}>
                                    <b>сейчас</b>
                                    <span>Пройдено {progress}%</span>
                                </div>
                            </div>
                            <div className={`${styles.step} ${order.status === 'COMPLETED' ? styles.stepDone : ''}`}>
                                <i />
                                <div className={styles.stepText}>
                                    <b>{cityOf(order, 'delivery') || 'Выгрузка'}</b>
                                    <span>{delivery?.location?.address || 'Точка выгрузки'}</span>
                                </div>
                                <div className={styles.stepAside}>
                                    <b>{stepDate(delivery) || '—'}</b>
                                    <span>Выгрузка</span>
                                </div>
                            </div>

                            <div className={styles.progress}>
                                <i style={{ width: `${progress}%`, background: orderProgressColor(order.status) }} />
                            </div>
                            <div className={styles.progressCaption}>
                                <span>Пройдено {progress}% пути</span>
                                {stepDate(delivery) && <span>выгрузка {stepDate(delivery)}</span>}
                            </div>
                        </div>

                        <div className={`${styles.mapCell} ${theme}`}>
                            <RouteMapThumbnail order={order} theme={theme} />
                            <div className={styles.driver}>
                                <span className="lc2-avatar">{nameInitials(driverName)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className={styles.driverName}>{driverName || 'Водитель не назначен'}</div>
                                    <div className={styles.driverSub}>{[plate, phone].filter(Boolean).join(' · ') || '—'}</div>
                                </div>
                                {phone && (
                                    <Dropdown
                                        trigger={['click']}
                                        placement="topRight"
                                        menu={{
                                            items: [
                                                { key: 'wa', icon: <WhatsAppOutlined style={{ color: '#25D366' }} />, label: 'Написать в WhatsApp' },
                                                { key: 'call', icon: <PhoneOutlined />, label: `Позвонить · ${phone}` },
                                                { key: 'copy', icon: <CopyOutlined />, label: 'Скопировать номер' },
                                            ],
                                            onClick: ({ key, domEvent }) => {
                                                domEvent?.stopPropagation?.();
                                                if (key === 'wa') window.open(`https://wa.me/${digits}`, '_blank');
                                                else if (key === 'call') window.location.href = `tel:${phone}`;
                                                else if (key === 'copy') {
                                                    navigator.clipboard?.writeText(phone);
                                                    toast.success('Номер водителя скопирован');
                                                }
                                            },
                                        }}
                                    >
                                        <a
                                            className="lc2-callbtn"
                                            role="button"
                                            aria-label="Связаться с водителем"
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <PhoneOutlined />
                                        </a>
                                    </Dropdown>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={styles.foot}>
                        <div><span>Заказчик</span><b>{shortenCompanyName(order.customerCompany?.name || '') || '—'}</b></div>
                        <div><span>Ставка заказчика</span><b>{money(order.customerPrice)}</b></div>
                        <div><span>Перевозчик</span><b>{shortenCompanyName(carrierName) || '—'}</b></div>
                        <div><span>Ставка перевозчика</span><b className={styles.neg}>{money(carrierPrice)}</b></div>
                        <div><span>Маржа</span><b className={margin != null && margin >= 0 ? styles.pos : styles.neg}>{money(margin)}</b></div>
                        <div>
                            <span>Счёт</span>
                            {invoice
                                ? <b className={styles.accent}>№ {invoice.number}</b>
                                : <b className={styles.muted}>не выставлен</b>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}