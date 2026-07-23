'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Point {
    type: string;
    city: string | null;
    address: string;
    name: string | null;
    latitude: number | null;
    longitude: number | null;
    contactName: string | null;
    contactPhone: string | null;
}
interface DriverOrder {
    orderNumber: string;
    status: string;
    cargoDescription: string | null;
    cargoWeight: number | null;
    cargoVolume: number | null;
    palletCount: number | null;
    requirements: string | null;
    driverName: string | null;
    vehiclePlate: string | null;
    points: Point[];
    nextAction: { to: string; label: string } | null;
    isFinished: boolean;
    isProblem: boolean;
    dispatcherName: string | null;
    dispatcherPhone: string | null;
}

const STATUS_LABEL: Record<string, string> = {
    PENDING: 'Ожидание', ASSIGNED: 'Назначен', EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке', LOADING: 'Погрузка', IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке', UNLOADING: 'Выгрузка', COMPLETED: 'Завершён',
    CANCELLED: 'Отменён', PROBLEM: 'Проблема',
};

function isMobile() {
    if (typeof navigator === 'undefined') return true;
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent);
}

export default function DriverPage() {
    const params = useParams();
    const token = params?.token as string;

    const [order, setOrder] = useState<DriverOrder | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [mobile, setMobile] = useState(true);
    const [geo, setGeo] = useState<'idle' | 'on' | 'denied'>('idle');

    useEffect(() => { setMobile(isMobile()); }, []);

    const load = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/public/driver/${token}`);
            setOrder(res.data);
            setErr('');
        } catch {
            setErr('Ссылка недействительна или заявка удалена.');
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { load(); }, [load]);

    // Фоновая геолокация — шлём координаты не чаще раза в 20 сек
    useEffect(() => {
        if (!token || !order || order.isFinished) return;
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        let lastSent = 0;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setGeo('on');
                const now = Date.now();
                if (now - lastSent < 20000) return;
                lastSent = now;
                const { latitude, longitude, accuracy, speed, heading } = pos.coords;
                axios.post(`${API_URL}/public/driver/${token}/location`, {
                    latitude, longitude,
                    accuracy: accuracy ?? undefined,
                    speed: speed != null ? Math.max(speed * 3.6, 0) : undefined, // м/с → км/ч
                    heading: heading ?? undefined,
                }).catch(() => { });
            },
            () => setGeo('denied'),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [token, order?.isFinished]);

    const advance = async () => {
        if (!order?.nextAction) return;
        setBusy(true);
        try {
            const res = await axios.post(`${API_URL}/public/driver/${token}/status`, { status: order.nextAction.to });
            setOrder(res.data);
        } catch {
            alert('Не удалось обновить статус. Попробуйте ещё раз.');
        } finally { setBusy(false); }
    };

    const reportProblem = async () => {
        const comment = window.prompt('Что случилось? (можно оставить пустым)') ?? undefined;
        setBusy(true);
        try {
            const res = await axios.post(`${API_URL}/public/driver/${token}/problem`, { comment });
            setOrder(res.data);
        } catch {
            alert('Не удалось отправить. Попробуйте ещё раз.');
        } finally { setBusy(false); }
    };

    // Куда ехать сейчас: до погрузки — точка PICKUP, после — DELIVERY
    const target = (() => {
        if (!order) return null;
        const beforeTransit = ['PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING'].includes(order.status);
        const pickup = order.points.find(p => p.type === 'PICKUP' || p.type === 'ADDITIONAL_PICKUP');
        const delivery = [...order.points].reverse().find(p => p.type === 'DELIVERY');
        return beforeTransit ? (pickup || delivery) : (delivery || pickup);
    })();

    const navLink = (provider: '2gis' | 'yandex') => {
        if (!target) return '#';
        const hasCoords = target.latitude != null && target.longitude != null;
        if (provider === '2gis') {
            return hasCoords
                ? `https://2gis.kz/routeSearch/rsType/car/to/${target.longitude},${target.latitude}`
                : `https://2gis.kz/search/${encodeURIComponent(`${target.city || ''} ${target.address}`)}`;
        }
        return hasCoords
            ? `https://yandex.ru/maps/?rtext=~${target.latitude},${target.longitude}&rtt=auto`
            : `https://yandex.ru/maps/?text=${encodeURIComponent(`${target.city || ''} ${target.address}`)}`;
    };

    if (!mobile) {
        return (
            <div style={wrap}>
                <div style={{ ...card, textAlign: 'center' }}>
                    <div style={{ fontSize: 44, marginBottom: 8 }}>📱</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Откройте на телефоне</div>
                    <div style={{ color: '#64748b', fontSize: 15 }}>Эта страница для водителя. Откройте ссылку на своём телефоне.</div>
                </div>
            </div>
        );
    }

    if (loading) return <div style={{ ...wrap, justifyContent: 'center' }}><div style={{ color: '#64748b' }}>Загрузка…</div></div>;
    if (err || !order) return <div style={wrap}><div style={{ ...card, textAlign: 'center', color: '#dc2626', fontSize: 16 }}>{err || 'Ошибка'}</div></div>;

    return (
        <div style={wrap}>
            {/* Шапка */}
            <div style={{ ...card, paddingBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 15, color: '#64748b' }}>Заявка {order.orderNumber}</div>
                    <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 14, fontWeight: 700, background: order.isProblem ? '#fee2e2' : order.isFinished ? '#dcfce7' : '#dbeafe', color: order.isProblem ? '#dc2626' : order.isFinished ? '#16a34a' : '#1d4ed8' }}>
                        {STATUS_LABEL[order.status] || order.status}
                    </span>
                </div>
                {order.driverName && <div style={{ marginTop: 8, fontSize: 15 }}>{order.driverName}{order.vehiclePlate ? ` · ${order.vehiclePlate}` : ''}</div>}
                {!order.isFinished && (
                    <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, padding: '8px 12px', borderRadius: 12, background: geo === 'on' ? '#dcfce7' : geo === 'denied' ? '#fee2e2' : '#fef9c3', color: geo === 'on' ? '#16a34a' : geo === 'denied' ? '#dc2626' : '#a16207' }}>
                        {geo === 'on' ? '📍 Геолокация включена — диспетчер видит вас' : geo === 'denied' ? '⚠ Включите геолокацию, чтобы вас было видно на карте' : '📍 Разрешите доступ к геолокации во всплывающем окне'}
                    </div>
                )}
            </div>

            {/* Куда ехать */}
            {target && !order.isFinished && (
                <div style={card}>
                    <div style={{ fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                        {['PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING'].includes(order.status) ? '📦 Куда ехать — погрузка' : '🏁 Куда ехать — выгрузка'}
                    </div>
                    {target.name && <div style={{ fontSize: 17, fontWeight: 700 }}>{target.name}</div>}
                    <div style={{ fontSize: 17, fontWeight: target.name ? 400 : 700, marginTop: 2 }}>
                        {[target.city, target.address].filter(Boolean).join(', ')}
                    </div>
                    {target.contactPhone && (
                        <a href={`tel:${target.contactPhone}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 15, color: '#1d4ed8' }}>
                            ☎ {target.contactName ? `${target.contactName}: ` : ''}{target.contactPhone}
                        </a>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <a href={navLink('2gis')} target="_blank" rel="noreferrer" style={{ ...navBtn, background: '#00b956' }}>2ГИС</a>
                        <a href={navLink('yandex')} target="_blank" rel="noreferrer" style={{ ...navBtn, background: '#ff3d00' }}>Яндекс</a>
                    </div>
                </div>
            )}

            {/* Груз */}
            <div style={card}>
                <div style={{ fontSize: 13, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Груз</div>
                <div style={{ fontSize: 16 }}>{order.cargoDescription || 'Без описания'}</div>
                <div style={{ fontSize: 15, color: '#475569', marginTop: 4 }}>
                    {[order.cargoWeight ? `${order.cargoWeight} т` : null, order.cargoVolume ? `${order.cargoVolume} м³` : null, order.palletCount ? `${order.palletCount} палет` : null].filter(Boolean).join(' · ') || '—'}
                </div>
                {order.requirements && <div style={{ fontSize: 14, color: '#64748b', marginTop: 6 }}>Требования: {order.requirements}</div>}
            </div>

            {/* Действия */}
            <div style={{ position: 'sticky', bottom: 0, padding: '12px 0 20px', background: 'linear-gradient(transparent, #f1f5f9 24px)' }}>
                {order.isFinished ? (
                    <div style={{ ...card, textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#16a34a', margin: 0 }}>
                        ✅ Рейс завершён. Спасибо!
                    </div>
                ) : (
                    <>
                        {order.nextAction && (
                            <button onClick={advance} disabled={busy} style={{ ...bigBtn, background: '#16a34a' }}>
                                {busy ? 'Секунду…' : order.nextAction.label}
                            </button>
                        )}
                        {order.isProblem ? (
                            <div style={{ textAlign: 'center', color: '#dc2626', fontSize: 15, marginTop: 10 }}>
                                Диспетчер уведомлён о проблеме{order.dispatcherPhone ? '. ' : '.'}
                                {order.dispatcherPhone && <a href={`tel:${order.dispatcherPhone}`} style={{ color: '#1d4ed8' }}>Позвонить</a>}
                            </div>
                        ) : (
                            <button onClick={reportProblem} disabled={busy} style={{ ...bigBtn, background: '#fff', color: '#dc2626', border: '2px solid #dc2626', marginTop: 10 }}>
                                ⚠ Проблема
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#f1f5f9', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' };
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
const bigBtn: React.CSSProperties = { width: '100%', padding: '18px', fontSize: 19, fontWeight: 700, color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer' };
const navBtn: React.CSSProperties = { flex: 1, textAlign: 'center', padding: '14px', fontSize: 16, fontWeight: 700, color: '#fff', borderRadius: 12, textDecoration: 'none' };
