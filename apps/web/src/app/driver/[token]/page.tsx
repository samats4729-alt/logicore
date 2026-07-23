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
    ttnCount: number;
}

const STATUS_LABEL: Record<string, string> = {
    PENDING: 'Ожидание', ASSIGNED: 'Назначен', EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке', LOADING: 'Погрузка', IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке', UNLOADING: 'Выгрузка', COMPLETED: 'Завершён',
    CANCELLED: 'Отменён', PROBLEM: 'Проблема',
};

// Этап рейса: 0 к погрузке · 1 загружен/в пути · 2 к выгрузке · 3 готово
const STEPS = ['Погрузка', 'В пути', 'Выгрузка', 'Готово'];
function stepIndex(status: string): number {
    if (['PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING'].includes(status)) return 0;
    if (status === 'IN_TRANSIT') return 1;
    if (['AT_DELIVERY', 'UNLOADING'].includes(status)) return 2;
    if (status === 'COMPLETED') return 3;
    return 0;
}

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
    const [ttnBusy, setTtnBusy] = useState(false);

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
                    speed: speed != null ? Math.max(speed * 3.6, 0) : undefined,
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

    const uploadTtn = async (fileList: FileList | null) => {
        const file = fileList?.[0];
        if (!file) return;
        setTtnBusy(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            await axios.post(`${API_URL}/public/driver/${token}/ttn`, fd);
            await load();
            alert('ТТН отправлена диспетчеру ✅');
        } catch {
            alert('Не удалось отправить фото. Попробуйте ещё раз.');
        } finally { setTtnBusy(false); }
    };

    const beforeTransit = order ? ['PENDING', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING'].includes(order.status) : true;
    const target = (() => {
        if (!order) return null;
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
                <div style={{ ...card, textAlign: 'center', marginTop: 40 }}>
                    <div style={{ fontSize: 52, marginBottom: 8 }}>📱</div>
                    <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Откройте на телефоне</div>
                    <div style={{ color: '#64748b', fontSize: 15 }}>Эта страница для водителя. Откройте ссылку на своём телефоне.</div>
                </div>
            </div>
        );
    }
    if (loading) return <div style={{ ...wrap, justifyContent: 'center', alignItems: 'center' }}><div style={{ color: '#64748b', fontSize: 16 }}>Загрузка…</div></div>;
    if (err || !order) return <div style={wrap}><div style={{ ...card, textAlign: 'center', color: '#dc2626', fontSize: 16, marginTop: 40 }}>{err || 'Ошибка'}</div></div>;

    const step = stepIndex(order.status);

    return (
        <div style={wrap}>
            {/* Шапка */}
            <div style={{ ...card, background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: 13, opacity: 0.85 }}>Заявка</div>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>{order.orderNumber}</div>
                    </div>
                    <span style={{ padding: '6px 14px', borderRadius: 999, fontSize: 14, fontWeight: 800, background: order.isProblem ? 'rgba(220,38,38,0.9)' : order.isFinished ? 'rgba(22,163,74,0.95)' : 'rgba(255,255,255,0.22)', color: '#fff' }}>
                        {STATUS_LABEL[order.status] || order.status}
                    </span>
                </div>
                {order.driverName && <div style={{ marginTop: 10, fontSize: 15, opacity: 0.95 }}>🚚 {order.driverName}{order.vehiclePlate ? ` · ${order.vehiclePlate}` : ''}</div>}
            </div>

            {/* Прогресс рейса */}
            <div style={{ ...card, padding: '18px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    {STEPS.map((label, i) => {
                        const done = i < step || order.isFinished;
                        const active = i === step && !order.isFinished;
                        return (
                            <div key={label} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                                {i > 0 && <div style={{ position: 'absolute', top: 15, right: '50%', width: '100%', height: 3, background: (i <= step || order.isFinished) ? '#16a34a' : '#e2e8f0' }} />}
                                <div style={{ position: 'relative', zIndex: 1, width: 32, height: 32, margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', background: done ? '#16a34a' : active ? '#2563eb' : '#cbd5e1' }}>
                                    {done ? '✓' : i + 1}
                                </div>
                                <div style={{ fontSize: 12, marginTop: 6, fontWeight: active ? 700 : 500, color: done ? '#16a34a' : active ? '#2563eb' : '#94a3b8' }}>{label}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Геолокация */}
            {!order.isFinished && (
                <div style={{ ...card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, background: geo === 'on' ? '#f0fdf4' : geo === 'denied' ? '#fef2f2' : '#fefce8' }}>
                    <span style={{ fontSize: 22 }}>{geo === 'on' ? '🛰️' : geo === 'denied' ? '⚠️' : '📍'}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: geo === 'on' ? '#16a34a' : geo === 'denied' ? '#dc2626' : '#a16207' }}>
                        {geo === 'on' ? 'Геолокация включена — диспетчер видит вас' : geo === 'denied' ? 'Включите геолокацию, чтобы вас было видно' : 'Разрешите доступ к геолокации во всплывающем окне'}
                    </span>
                </div>
            )}

            {/* Куда ехать */}
            {target && !order.isFinished && (
                <div style={{ ...card, borderLeft: `5px solid ${beforeTransit ? '#2563eb' : '#dc2626'}` }}>
                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>
                        {beforeTransit ? '📦 ЕХАТЬ НА ПОГРУЗКУ' : '🏁 ЕХАТЬ НА ВЫГРУЗКУ'}
                    </div>
                    {target.name && <div style={{ fontSize: 18, fontWeight: 800 }}>{target.name}</div>}
                    <div style={{ fontSize: 18, fontWeight: target.name ? 500 : 800, marginTop: 2, lineHeight: 1.3 }}>
                        {[target.city, target.address].filter(Boolean).join(', ')}
                    </div>
                    {target.contactPhone && (
                        <a href={`tel:${target.contactPhone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 15, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                            ☎ {target.contactName ? `${target.contactName}: ` : ''}{target.contactPhone}
                        </a>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <a href={navLink('2gis')} target="_blank" rel="noreferrer" style={{ ...navBtn, background: '#00b956' }}>🧭 2ГИС</a>
                        <a href={navLink('yandex')} target="_blank" rel="noreferrer" style={{ ...navBtn, background: '#ff3d00' }}>🧭 Яндекс</a>
                    </div>
                </div>
            )}

            {/* Груз */}
            <div style={card}>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>📦 ГРУЗ</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{order.cargoDescription || 'Без описания'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {order.cargoWeight ? <span style={chip}>⚖ {order.cargoWeight} т</span> : null}
                    {order.cargoVolume ? <span style={chip}>📐 {order.cargoVolume} м³</span> : null}
                    {order.palletCount ? <span style={chip}>🟫 {order.palletCount} палет</span> : null}
                </div>
                {order.requirements && <div style={{ fontSize: 14, color: '#64748b', marginTop: 10 }}>❗ {order.requirements}</div>}
            </div>

            {/* ТТН */}
            <div style={card}>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700, marginBottom: 10 }}>
                    📄 НАКЛАДНАЯ (ТТН){order.ttnCount > 0 ? ` · отправлено: ${order.ttnCount}` : ''}
                </div>
                <label style={{ ...bigBtn, background: order.ttnCount > 0 ? '#0ea5e9' : '#1d4ed8', display: 'block', textAlign: 'center', cursor: 'pointer', opacity: ttnBusy ? 0.6 : 1 }}>
                    {ttnBusy ? 'Отправка…' : order.ttnCount > 0 ? '📷 Отправить ещё фото' : '📷 Сфотографировать и отправить'}
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={ttnBusy}
                        onChange={(e) => { uploadTtn(e.target.files); e.currentTarget.value = ''; }} />
                </label>
                {order.ttnCount > 0 && <div style={{ marginTop: 10, fontSize: 14, color: '#16a34a', textAlign: 'center', fontWeight: 600 }}>✅ Диспетчер получил накладную</div>}
            </div>

            {/* Действия */}
            <div style={{ position: 'sticky', bottom: 0, padding: '10px 0 22px', background: 'linear-gradient(transparent, #eef2ff 28px)' }}>
                {order.isFinished ? (
                    <div style={{ ...card, textAlign: 'center', margin: 0, background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#fff' }}>
                        <div style={{ fontSize: 40 }}>✅</div>
                        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>Рейс завершён</div>
                        <div style={{ fontSize: 15, opacity: 0.95, marginTop: 2 }}>Спасибо за работу!</div>
                    </div>
                ) : (
                    <>
                        {order.nextAction && (
                            <button onClick={advance} disabled={busy} style={{ ...bigBtn, background: 'linear-gradient(135deg, #16a34a, #15803d)', fontSize: 20, boxShadow: '0 6px 16px rgba(22,163,74,0.35)' }}>
                                {busy ? 'Секунду…' : `✅ ${order.nextAction.label}`}
                            </button>
                        )}
                        {order.isProblem ? (
                            <div style={{ ...card, marginTop: 10, marginBottom: 0, textAlign: 'center', background: '#fef2f2' }}>
                                <div style={{ color: '#dc2626', fontSize: 15, fontWeight: 600 }}>⚠️ Диспетчер уведомлён о проблеме</div>
                                {order.dispatcherPhone && <a href={`tel:${order.dispatcherPhone}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 16, color: '#2563eb', fontWeight: 700 }}>☎ Позвонить диспетчеру</a>}
                            </div>
                        ) : (
                            <button onClick={reportProblem} disabled={busy} style={{ ...bigBtn, background: '#fff', color: '#dc2626', border: '2px solid #fecaca', marginTop: 10, fontSize: 17 }}>
                                ⚠️ Сообщить о проблеме
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#eef2ff', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' };
const card: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 2px 10px rgba(30,58,138,0.06)' };
const bigBtn: React.CSSProperties = { width: '100%', padding: '18px', fontSize: 19, fontWeight: 800, color: '#fff', border: 'none', borderRadius: 16, cursor: 'pointer' };
const navBtn: React.CSSProperties = { flex: 1, textAlign: 'center', padding: '15px', fontSize: 16, fontWeight: 800, color: '#fff', borderRadius: 14, textDecoration: 'none' };
const chip: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, background: '#f1f5f9', fontSize: 14, fontWeight: 600, color: '#334155' };
