'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Button } from 'antd';
import { RightOutlined, PhoneOutlined, EnvironmentOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import StatusPill, { STATUS_LABELS } from './StatusPill';
import { shortenCompanyName } from '@/lib/company-helper';
import { loadMapgl, DGIS_KEY } from '@/lib/mapgl-loader';
import { useTheme } from '@/components/ThemeProvider';

// Грубый прогресс рейса по позиции статуса (точный % по GPS — этап 5 REDESIGN_PLAN.md)
export const ORDER_STATUS_PROGRESS: Record<string, number> = {
    DRAFT: 4, PENDING: 8, ASSIGNED: 18, EN_ROUTE_PICKUP: 30, AT_PICKUP: 42,
    LOADING: 52, IN_TRANSIT: 68, AT_DELIVERY: 82, UNLOADING: 92,
    COMPLETED: 100, PROBLEM: 50, CANCELLED: 100,
};

export const orderProgressColor = (s: string) =>
    s === 'PROBLEM' ? '#dc2626' : s === 'COMPLETED' ? '#16a34a' : s === 'CANCELLED' ? '#9ca3af' : '#1677ff';

export const nameInitials = (name?: string) => {
    if (!name) return '—';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '—';
};

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

// Мини-карта маршрута (точки погрузки → выгрузки)
function RouteMapThumbnail({ order, theme }: { order: any; theme: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);

    const coords = useMemo(() => {
        const pts = (order?.routePoints || []) as any[];
        return pts
            .filter((p: any) => p.location?.latitude && p.location?.longitude)
            .map((p: any) => [p.location.longitude, p.location.latitude] as [number, number]);
    }, [order?.routePoints]);

    useEffect(() => {
        if (!DGIS_KEY || !containerRef.current) return;
        if (coords.length < 1) return;

        let cancelled = false;
        loadMapgl().then((mapgl) => {
            if (cancelled || !containerRef.current) return;
            const map = new mapgl.Map(containerRef.current, {
                center: coords[0],
                zoom: 10,
                key: DGIS_KEY,
                lang: 'ru',
                zoomControl: false,
                attributionControl: false,
            });
            mapRef.current = map;

            // Маркеры точек
            coords.forEach((c, i) => {
                const isFirst = i === 0;
                const el = document.createElement('div');
                el.style.cssText = `width:${isFirst ? 10 : 8}px;height:${isFirst ? 10 : 8}px;border-radius:50%;background:${isFirst ? '#1677ff' : '#dc3545'};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);`;
                new mapgl.HtmlMarker(map, { coordinates: c, html: el, anchor: [isFirst ? 5 : 4, isFirst ? 5 : 4] });
            });

            // Линия маршрута
            if (coords.length >= 2) {
                new mapgl.Polyline(map, {
                    coordinates: coords,
                    width: 2,
                    color: '#1677ff',
                    dash: [4, 4],
                });
            }

            // Подгоняем viewport под все точки (fitBounds — правильный метод 2GIS)
            if (coords.length >= 2) {
                const lngs = coords.map(c => c[0]);
                const lats = coords.map(c => c[1]);
                map.fitBounds(
                    {
                        southWest: [Math.min(...lngs), Math.min(...lats)],
                        northEast: [Math.max(...lngs), Math.max(...lats)],
                    },
                    { padding: { top: 24, right: 24, bottom: 24, left: 24 } },
                );
            }
        }).catch(() => {});

        return () => {
            cancelled = true;
            if (mapRef.current) { mapRef.current.destroy(); mapRef.current = null; }
        };
    }, [coords]);

    if (!DGIS_KEY || coords.length < 1) {
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
        <div ref={containerRef} style={{
            flex: 1, minHeight: 140, borderRadius: 12, overflow: 'hidden', marginBottom: 12,
            filter: mapFilter,
            background: theme === 'dark' ? '#1a1e26' : '#f1f5f9',
        }} />
    );
}

export default function FeaturedOrderCard({ order, onOpen }: { order: any; onOpen?: (id: string) => void }) {
    const { theme } = useTheme();

    if (!order) return null;

    const progress = ORDER_STATUS_PROGRESS[order.status] ?? 0;
    const driverName = order.assignedDriverName
        || (order.driver ? `${order.driver.lastName} ${order.driver.firstName}` : '');

    return (
        <div className="lc2-featured">
            <div className="lc2-f-left">
                <div className="lc2-f-head">
                    <span className="lc-eyebrow" style={{ marginBottom: 0 }}>История рейса</span>
                    <StatusPill status={order.status} />
                </div>
                <div className="lc2-f-num">{order.orderNumber}</div>
                <div className="lc2-f-cargo">
                    {[order.natureOfCargo, order.cargoWeight ? `${order.cargoWeight} т` : null, order.cargoType]
                        .filter(Boolean).join(' · ') || order.cargoDescription || 'Груз не указан'}
                </div>
                <div className="lc2-f-timeline">
                    <div className="lc2-f-step done">
                        <i /><div><b>{cityOf(order, 'pickup') || 'Погрузка'}</b><span>Точка погрузки</span></div>
                    </div>
                    <div className="lc2-f-step active">
                        <i /><div><b>{STATUS_LABELS[order.status] || order.status}</b><span>Прогресс ≈ {progress}%</span></div>
                    </div>
                    <div className={`lc2-f-step ${order.status === 'COMPLETED' ? 'done' : ''}`}>
                        <i /><div><b>{cityOf(order, 'delivery') || 'Выгрузка'}</b><span>Точка выгрузки</span></div>
                    </div>
                </div>
                <div className="lc2-f-progress">
                    <i style={{ width: `${progress}%`, background: orderProgressColor(order.status) }} />
                </div>
                <div className="lc2-f-stats">
                    <div><span>Стоимость</span><b>{order.customerPrice ? `${order.customerPrice.toLocaleString('ru-RU')} ₸` : '—'}</b></div>
                    <div><span>Дата</span><b>{dayjs(order.createdAt).format('DD.MM.YYYY')}</b></div>
                    <div><span>Заказчик</span><b>{shortenCompanyName(order.customerCompany?.name || '') || '—'}</b></div>
                </div>
            </div>
            <div className={`lc2-f-right ${theme}`}>
                {/* Мини-карта маршрута */}
                <RouteMapThumbnail order={order} theme={theme} />

                {/* Водитель */}
                <div className="lc2-f-driver">
                    <span className="lc2-avatar">{nameInitials(driverName)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="lc2-f-driver-name" style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {driverName || 'Водитель не назначен'}
                        </div>
                        <div className="lc2-f-driver-sub" style={{ fontSize: 11.5 }}>
                            Водитель · {order.assignedDriverPlate || order.driver?.vehiclePlate || '—'}
                        </div>
                    </div>
                    {order.assignedDriverPhone && (
                        <a className="lc2-callbtn" href={`tel:${order.assignedDriverPhone}`} aria-label="Позвонить водителю">
                            <PhoneOutlined />
                        </a>
                    )}
                </div>
                {onOpen && (
                    <Button block className="lc2-openbtn" onClick={() => onOpen(order.id)}>
                        Открыть заявку <RightOutlined />
                    </Button>
                )}
            </div>
        </div>
    );
}