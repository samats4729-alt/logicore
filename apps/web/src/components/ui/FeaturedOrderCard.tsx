'use client';

import { Button } from 'antd';
import { RightOutlined, PhoneOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import StatusPill, { STATUS_LABELS } from './StatusPill';
import { shortenCompanyName } from '@/lib/company-helper';

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

export default function FeaturedOrderCard({ order, onOpen }: { order: any; onOpen?: (id: string) => void }) {
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
            <div className="lc2-f-right">
                <div className="lc2-f-driver">
                    <span className="lc2-avatar">{nameInitials(driverName)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {driverName || 'Водитель не назначен'}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>
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
