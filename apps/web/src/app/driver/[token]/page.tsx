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

const BRAND = '#1677ff';
const GREEN = '#16a34a';
const RED = '#dc2626';

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
            alert('ТТН отправлена диспетчеру');
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
                <div style={{ ...card, textAlign: 'center', marginTop: 48 }}>
                    <div style={{ fontSize: 44 }}>📱</div>
                    <div style={{ fontSize: 19, fontWeight: 700, marginTop: 8, color: 'var(--lc-text)' }}>Откройте на телефоне</div>
                    <div style={{ color: 'var(--lc-text-sec)', fontSize: 15, marginTop: 4 }}>Эта страница для водителя. Откройте ссылку на своём телефоне.</div>
                </div>
            </div>
        );
    }
    if (loading) return <div style={{ ...wrap, justifyContent: 'center', alignItems: 'center' }}><div style={{ color: 'var(--lc-text-ter)', fontSize: 16 }}>Загрузка…</div></div>;
    if (err || !order) return <div style={wrap}><div style={{ ...card, textAlign: 'center', color: RED, fontSize: 16, marginTop: 48 }}>{err || 'Ошибка'}</div></div>;

    const step = stepIndex(order.status);

    return (
        <div style={wrap}>
            {/* Шапка — фирменная */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ background: `linear-gradient(135deg, ${BRAND}, #0958d9)`, color: '#fff', padding: '16px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, opacity: 0.85 }}>LOGICORE · РЕЙС</div>
                        <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: order.isProblem ? RED : order.isFinished ? GREEN : 'rgba(255,255,255,0.22)', color: '#fff' }}>
                            {STATUS_LABEL[order.status] || order.status}
                        </span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, letterSpacing: 0.5 }}>{order.orderNumber}</div>
                    {order.driverName && <div style={{ marginTop: 6, fontSize: 14, opacity: 0.92 }}>{order.driverName}{order.vehiclePlate ? ` · ${order.vehiclePlate}` : ''}</div>}
                </div>
            </div>

            {/* Прогресс рейса */}
            <div style={{ ...card, padding: '18px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    {STEPS.map((label, i) => {
                        const done = i < step || order.isFinished;
                        const active = i === step && !order.isFinished;
                        const on = i <= step || order.isFinished;
                        return (
                            <div key={label} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                                {i > 0 && <div style={{ position: 'absolute', top: 14, right: '50%', width: '100%', height: 3, background: on ? BRAND : 'var(--lc-border)' }} />}
                                <div style={{ position: 'relative', zIndex: 1, width: 30, height: 30, margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', background: done ? BRAND : active ? BRAND : 'var(--lc-border)', boxShadow: active ? `0 0 0 4px rgba(22,119,255,0.18)` : 'none' }}>
                                    {done ? '✓' : i + 1}
                                </div>
                                <div style={{ fontSize: 12, marginTop: 6, fontWeight: active ? 700 : 500, color: on ? 'var(--lc-text)' : 'var(--lc-text-ter)' }}>{label}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Геолокация */}
            {!order.isFinished && (
                <div style={{ ...card, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: geo === 'on' ? GREEN : geo === 'denied' ? RED : '#eab308', flexShrink: 0, boxShadow: geo === 'on' ? `0 0 0 4px rgba(22,163,74,0.15)` : 'none' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--lc-text-sec)' }}>
                        {geo === 'on' ? 'Геолокация включена — диспетчер видит вас' : geo === 'denied' ? 'Включите геолокацию, чтобы вас было видно' : 'Разрешите доступ к геолокации во всплывающем окне'}
                    </span>
                </div>
            )}

            {/* Куда ехать */}
            {target && !order.isFinished && (
                <div style={{ ...card, borderLeft: `4px solid ${beforeTransit ? BRAND : RED}` }}>
                    <div style={eyebrow}>{beforeTransit ? 'Ехать на погрузку' : 'Ехать на выгрузку'}</div>
                    {target.name && <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--lc-text)' }}>{target.name}</div>}
                    <div style={{ fontSize: 17, fontWeight: target.name ? 500 : 700, marginTop: 2, lineHeight: 1.3, color: 'var(--lc-text)' }}>
                        {[target.city, target.address].filter(Boolean).join(', ')}
                    </div>
                    {target.contactPhone && (
                        <a href={`tel:${target.contactPhone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 15, color: BRAND, fontWeight: 600, textDecoration: 'none' }}>
                            ☎ {target.contactName ? `${target.contactName}: ` : ''}{target.contactPhone}
                        </a>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <a href={navLink('2gis')} target="_blank" rel="noreferrer" style={{ ...navBtn, background: '#00b956' }}>2ГИС</a>
                        <a href={navLink('yandex')} target="_blank" rel="noreferrer" style={{ ...navBtn, background: '#ff3d00' }}>Яндекс</a>
                    </div>
                </div>
            )}

            {/* Груз */}
            <div style={card}>
                <div style={eyebrow}>Груз</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--lc-text)' }}>{order.cargoDescription || 'Без описания'}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {order.cargoWeight ? <span style={chip}>{order.cargoWeight} т</span> : null}
                    {order.cargoVolume ? <span style={chip}>{order.cargoVolume} м³</span> : null}
                    {order.palletCount ? <span style={chip}>{order.palletCount} палет</span> : null}
                </div>
                {order.requirements && <div style={{ fontSize: 14, color: 'var(--lc-text-sec)', marginTop: 10 }}>Требования: {order.requirements}</div>}
            </div>

            {/* ТТН */}
            <div style={card}>
                <div style={eyebrow}>Накладная (ТТН){order.ttnCount > 0 ? ` · отправлено ${order.ttnCount}` : ''}</div>
                <label style={{ ...bigBtn, background: BRAND, display: 'block', textAlign: 'center', cursor: 'pointer', opacity: ttnBusy ? 0.6 : 1, boxShadow: `0 4px 12px rgba(22,119,255,0.25)` }}>
                    {ttnBusy ? 'Отправка…' : order.ttnCount > 0 ? '📷 Отправить ещё фото' : '📷 Сфотографировать и отправить'}
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={ttnBusy}
                        onChange={(e) => { uploadTtn(e.target.files); e.currentTarget.value = ''; }} />
                </label>
                {order.ttnCount > 0 && <div style={{ marginTop: 10, fontSize: 14, color: GREEN, textAlign: 'center', fontWeight: 600 }}>Диспетчер получил накладную</div>}
            </div>

            {/* Действия */}
            <div style={{ position: 'sticky', bottom: 0, padding: '10px 0 22px', background: 'linear-gradient(transparent, var(--lc-bg) 28px)' }}>
                {order.isFinished ? (
                    <div style={{ ...card, textAlign: 'center', margin: 0, background: `linear-gradient(135deg, ${GREEN}, #22c55e)`, color: '#fff', border: 'none' }}>
                        <div style={{ fontSize: 38 }}>✅</div>
                        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>Рейс завершён</div>
                        <div style={{ fontSize: 15, opacity: 0.95, marginTop: 2 }}>Спасибо за работу!</div>
                    </div>
                ) : (
                    <>
                        {order.nextAction && (
                            <button onClick={advance} disabled={busy} style={{ ...bigBtn, background: `linear-gradient(135deg, ${GREEN}, #15803d)`, boxShadow: `0 6px 16px rgba(22,163,74,0.32)` }}>
                                {busy ? 'Секунду…' : order.nextAction.label}
                            </button>
                        )}
                        {order.isProblem ? (
                            <div style={{ ...card, marginTop: 10, marginBottom: 0, textAlign: 'center' }}>
                                <div style={{ color: RED, fontSize: 15, fontWeight: 600 }}>Диспетчер уведомлён о проблеме</div>
                                {order.dispatcherPhone && <a href={`tel:${order.dispatcherPhone}`} style={{ display: 'inline-block', marginTop: 8, fontSize: 16, color: BRAND, fontWeight: 700 }}>Позвонить диспетчеру</a>}
                            </div>
                        ) : (
                            <button onClick={reportProblem} disabled={busy} style={{ ...bigBtn, background: 'var(--lc-card)', color: RED, border: `2px solid #fecaca`, marginTop: 10, fontSize: 17, boxShadow: 'none' }}>
                                Сообщить о проблеме
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--lc-bg)', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' };
const card: React.CSSProperties = { background: 'var(--lc-card)', borderRadius: 16, padding: 16, border: '1px solid var(--lc-border)', boxShadow: '0 1px 3px rgba(11,13,18,0.05)' };
const bigBtn: React.CSSProperties = { width: '100%', padding: '18px', fontSize: 19, fontWeight: 800, color: '#fff', border: 'none', borderRadius: 14, cursor: 'pointer' };
const navBtn: React.CSSProperties = { flex: 1, textAlign: 'center', padding: '15px', fontSize: 16, fontWeight: 800, color: '#fff', borderRadius: 12, textDecoration: 'none' };
const chip: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, background: 'var(--lc-card-2)', border: '1px solid var(--lc-border)', fontSize: 14, fontWeight: 600, color: 'var(--lc-text-sec)' };
const eyebrow: React.CSSProperties = { fontSize: 11, color: 'var(--lc-text-ter)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 8 };
