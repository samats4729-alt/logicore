'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Card, Tag, Typography, Spin, Badge, List, Avatar, Button, App } from 'antd';
import { CarOutlined, ReloadOutlined, AimOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

const DgisTrackingMap = dynamic(() => import('@/components/ui/DgisTrackingMap'), {
    ssr: false,
    loading: () => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f8f8' }}>
            <Spin size="large" tip="Загрузка карты..." />
        </div>
    )
});

const { Text } = Typography;

// Цвета для разных рейсов
const ORDER_COLORS = [
    '#1677ff', // blue
    '#52c41a', // green
    '#fa541c', // orange
    '#722ed1', // purple
    '#13c2c2', // cyan
    '#eb2f96', // magenta
    '#faad14', // gold
    '#2f54eb', // geekblue
    '#a0d911', // lime
    '#f5222d', // red
];

// Компонент маркера машины
const CarMarkerIcon = ({ color, isSelected }: { color: string, isSelected: boolean }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={isSelected ? "40" : "32"}
        height={isSelected ? "40" : "32"}
        viewBox="0 0 24 24"
        fill={color}
        stroke={isSelected ? '#000' : '#fff'}
        strokeWidth="1"
        style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}
    >
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
    </svg>
);



interface DriverPosition {
    driverId: string;
    driverName: string;
    vehiclePlate: string;
    latitude: number;
    longitude: number;
    speed: number;
    heading: number;
    updatedAt: string;
    orderId?: string;
    orderNumber?: string;
}

export default function CompanyTrackingPage() {
    const { message } = App.useApp();
    const [drivers, setDrivers] = useState<DriverPosition[]>([]);
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const dgisMapRef = useRef<any>(null);
    const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [popupInfo, setPopupInfo] = useState<DriverPosition | null>(null);

    const [mapMode, setMapMode] = useState<'day' | 'night'>('day');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-map-theme', mapMode);
        return () => {
            document.documentElement.removeAttribute('data-map-theme');
        };
    }, [mapMode]);

    // Сопоставление рейсов и цветов
    const orderColorMap = useMemo(() => {
        const map = new Map<string, string>();
        const orderSet = new Set(drivers.filter(d => d.orderNumber).map(d => d.orderNumber!));
        const uniqueOrders = Array.from(orderSet);
        uniqueOrders.forEach((order, index) => {
            map.set(order, ORDER_COLORS[index % ORDER_COLORS.length]);
        });
        return map;
    }, [drivers]);

    // Загрузка позиций водителей
    const fetchDrivers = useCallback(async () => {
        try {
            const response = await api.get('/tracking/drivers');
            setDrivers(response.data);
        } catch (error) {
            console.error('Failed to fetch drivers:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDrivers();

        // WebSocket подключение
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const newSocket = io(API_URL, {
            transports: ['websocket'],
        });

        newSocket.on('connect', () => {
            console.log('Connected to tracking socket');
        });

        newSocket.on('position:update', (data: DriverPosition) => {
            setDrivers((prev) => {
                const index = prev.findIndex((d) => d.driverId === data.driverId);
                if (index >= 0) {
                    const updated = [...prev];
                    updated[index] = data;
                    return updated;
                }
                return prev;
            });
        });

        const interval = setInterval(fetchDrivers, 30000);

        return () => {
            newSocket.disconnect();
            clearInterval(interval);
        };
    }, [fetchDrivers]);

    // Центрировать на своём местоположении
    const centerOnMyLocation = () => {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setMyLocation({ latitude, longitude });
                    dgisMapRef.current?.setCenter([longitude, latitude]);
                    dgisMapRef.current?.setZoom(14);
                    message.success('Карта центрирована на вашем местоположении');
                },
                (error) => {
                    message.error('Не удалось определить местоположение');
                    console.error('Geolocation error:', error);
                },
                { enableHighAccuracy: true }
            );
        } else {
            message.error('Геолокация не поддерживается');
        }
    };

    // Центрировать на выбранном водителе
    const centerOnDriver = (driver: DriverPosition) => {
        setSelectedDriver(driver.driverId);
        dgisMapRef.current?.setCenter([driver.longitude, driver.latitude]);
        dgisMapRef.current?.setZoom(15);
        setPopupInfo(driver);
    };

    // Получить цвет для водителя
    const getDriverColor = (driver: DriverPosition) => {
        if (driver.orderNumber) {
            return orderColorMap.get(driver.orderNumber) || '#999';
        }
        return '#999'; // Без рейса - серый
    };

    const getStatusColor = (updatedAt: string) => {
        const diff = Date.now() - new Date(updatedAt).getTime();
        if (diff < 60000) return 'green'; // < 1 мин
        if (diff < 300000) return 'orange'; // < 5 мин
        return 'red'; // > 5 мин
    };

    const isDark = mapMode === 'night';

    return (
        <div style={{
            position: 'relative',
            height: isMobile ? 'calc(100vh - 140px)' : 'calc(100vh - 56px - 48px - 48px)',
            minHeight: 480,
            overflow: 'hidden',
            borderRadius: 14,
            border: '1px solid #e8e9ee',
        }}>
            {/* ═══════════════════════════════════════════
                SIDEBAR — Frosted Glass Panel
                ═══════════════════════════════════════════ */}
            <div
                className="tracking-sidebar"
                style={{
                    position: isMobile ? 'relative' : 'absolute',
                    top: isMobile ? 0 : 24,
                    left: isMobile ? 0 : 24,
                    bottom: isMobile ? 'auto' : 24,
                    width: isMobile ? '100%' : 340,
                    zIndex: 10,
                    display: isMobile ? 'none' : 'flex',
                    flexDirection: 'column',
                    borderRadius: 20,
                    overflow: 'hidden',
                    background: isDark
                        ? 'linear-gradient(145deg, rgba(20, 20, 30, 0.85), rgba(10, 10, 18, 0.75))'
                        : 'linear-gradient(145deg, rgba(255, 255, 255, 0.55), rgba(245, 245, 250, 0.45))',
                    backdropFilter: 'blur(40px) saturate(1.6)',
                    WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
                    border: isDark
                        ? '1px solid rgba(255, 255, 255, 0.1)'
                        : '1px solid rgba(255, 255, 255, 0.6)',
                    boxShadow: isDark
                        ? '0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                        : '0 20px 60px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                    transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {/* Sidebar Header */}
                <div style={{
                    padding: '20px 20px 16px',
                    borderBottom: isDark
                        ? '1px solid rgba(255, 255, 255, 0.06)'
                        : '1px solid rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div>
                        <div style={{
                            fontSize: 15,
                            fontWeight: 700,
                            letterSpacing: '-0.02em',
                            color: isDark ? '#fff' : '#09090b',
                        }}>
                            Отслеживание
                        </div>
                        <div style={{
                            fontSize: 12,
                            color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
                            marginTop: 2,
                        }}>
                            {drivers.length} {drivers.length === 1 ? 'водитель' : 'водителей'} онлайн
                        </div>
                    </div>
                    <button
                        onClick={fetchDrivers}
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 10,
                            border: isDark
                                ? '1px solid rgba(255,255,255,0.08)'
                                : '1px solid rgba(0,0,0,0.06)',
                            background: isDark
                                ? 'rgba(255,255,255,0.05)'
                                : 'rgba(0,0,0,0.03)',
                            color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        <ReloadOutlined />
                    </button>
                </div>

                {/* Sidebar Body */}
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                            <Spin />
                        </div>
                    ) : drivers.length === 0 ? (
                        /* ── Premium Empty State ── */
                        <div style={{
                            textAlign: 'center',
                            padding: '48px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                        }}>
                            {/* Animated radar pulse */}
                            <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 24 }}>
                                <div className="tracking-radar-pulse" />
                                <div className="tracking-radar-pulse-delayed" />
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: 40,
                                    height: 40,
                                    borderRadius: 12,
                                    background: isDark
                                        ? 'linear-gradient(135deg, rgba(22, 119, 255, 0.3), rgba(114, 46, 209, 0.3))'
                                        : 'linear-gradient(135deg, rgba(22, 119, 255, 0.15), rgba(114, 46, 209, 0.15))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <EnvironmentOutlined style={{
                                        fontSize: 20,
                                        color: isDark ? 'rgba(255,255,255,0.7)' : '#1677ff',
                                    }} />
                                </div>
                            </div>

                            <div style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: isDark ? 'rgba(255,255,255,0.85)' : '#09090b',
                                marginBottom: 6,
                            }}>
                                Нет активных рейсов
                            </div>
                            <div style={{
                                fontSize: 12,
                                lineHeight: 1.5,
                                color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
                                maxWidth: 200,
                            }}>
                                Водители появятся здесь, когда начнут движение по вашим заявкам
                            </div>
                        </div>
                    ) : (
                        <List
                            dataSource={drivers}
                            renderItem={(driver) => (
                                <List.Item
                                    style={{
                                        cursor: 'pointer',
                                        background: selectedDriver === driver.driverId
                                            ? (isDark ? 'rgba(22, 119, 255, 0.15)' : 'rgba(22, 119, 255, 0.08)')
                                            : 'transparent',
                                        borderRadius: 12,
                                        padding: '10px 12px',
                                        marginBottom: 4,
                                        border: selectedDriver === driver.driverId
                                            ? (isDark ? '1px solid rgba(22, 119, 255, 0.2)' : '1px solid rgba(22, 119, 255, 0.15)')
                                            : '1px solid transparent',
                                        transition: 'all 0.2s ease',
                                    }}
                                    onClick={() => centerOnDriver(driver)}
                                >
                                    <List.Item.Meta
                                        avatar={
                                            <Badge dot color={getStatusColor(driver.updatedAt)}>
                                                <Avatar
                                                    icon={<CarOutlined />}
                                                    style={{ background: getDriverColor(driver) }}
                                                />
                                            </Badge>
                                        }
                                        title={
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{
                                                    fontWeight: 600,
                                                    fontSize: 13,
                                                    color: isDark ? '#fff' : '#09090b',
                                                }}>{driver.driverName}</span>
                                                <Tag style={{
                                                    margin: 0,
                                                    fontSize: 10,
                                                    borderRadius: 6,
                                                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                    border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
                                                    color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)',
                                                }}>{driver.vehiclePlate}</Tag>
                                            </div>
                                        }
                                        description={
                                            <div style={{ marginTop: 4 }}>
                                                {driver.orderNumber && (
                                                    <Tag
                                                        color={getDriverColor(driver)}
                                                        style={{ marginBottom: 4, fontSize: 10, borderRadius: 6 }}
                                                    >
                                                        {driver.orderNumber}
                                                    </Tag>
                                                )}
                                                <div style={{
                                                    fontSize: 11,
                                                    color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                                                }}>
                                                    {driver.speed ? `${Math.round(driver.speed * 3.6)} км/ч` : 'Стоит'}
                                                    {' • '}
                                                    {new Date(driver.updatedAt).toLocaleTimeString('ru-RU')}
                                                </div>
                                            </div>
                                        }
                                    />
                                </List.Item>
                            )}
                        />
                    )}

                    {/* Легенда */}
                    {orderColorMap.size > 0 && (
                        <div style={{
                            marginTop: 16,
                            padding: '12px 0',
                            borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                        }}>
                            <Text type="secondary" style={{
                                fontSize: 11,
                                color: isDark ? 'rgba(255,255,255,0.4)' : undefined,
                            }}>Рейсы:</Text>
                            <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(Array.from(orderColorMap.entries()) as any[]).map(([order, color]) => (
                                    <Tag key={order} color={color} style={{ fontSize: 10, margin: 0, borderRadius: 6 }}>{order}</Tag>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════
                CONTROL BUTTONS — Floating Glass Pills
                ═══════════════════════════════════════════ */}
            <div style={{
                position: 'absolute',
                top: isMobile ? 12 : 24,
                right: isMobile ? 12 : 24,
                zIndex: 10,
                display: 'flex',
                gap: 8,
            }}>
                <button
                    onClick={centerOnMyLocation}
                    className="liquid-glass-btn"
                >
                    <AimOutlined style={{ fontSize: 14 }} />
                    Моё место
                </button>
            </div>

            {/* ═══════════════════════════════════════════
                EDGE VIGNETTES — Soft fade overlays
                ═══════════════════════════════════════════ */}
            {!isMobile && (
                <>
                    {/* Top edge fade */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: 32, zIndex: 5,
                        background: isDark
                            ? 'linear-gradient(to bottom, rgba(8, 8, 12, 0.5) 0%, transparent 100%)'
                            : 'linear-gradient(to bottom, rgba(245, 245, 248, 0.7) 0%, transparent 100%)',
                        pointerEvents: 'none',
                        transition: 'background 0.5s ease',
                    }} />

                    {/* Bottom edge fade */}
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, zIndex: 5,
                        background: isDark
                            ? 'linear-gradient(to top, rgba(8, 8, 12, 0.5) 0%, transparent 100%)'
                            : 'linear-gradient(to top, rgba(245, 245, 248, 0.7) 0%, transparent 100%)',
                        pointerEvents: 'none',
                        transition: 'background 0.5s ease',
                    }} />

                    {/* Left edge fade */}
                    <div style={{
                        position: 'absolute', top: 32, bottom: 32, left: 0, width: 24, zIndex: 5,
                        background: isDark
                            ? 'linear-gradient(to right, rgba(8, 8, 12, 0.4) 0%, transparent 100%)'
                            : 'linear-gradient(to right, rgba(245, 245, 248, 0.6) 0%, transparent 100%)',
                        pointerEvents: 'none',
                        transition: 'background 0.5s ease',
                    }} />

                    {/* Right edge fade */}
                    <div style={{
                        position: 'absolute', top: 32, bottom: 32, right: 0, width: 24, zIndex: 5,
                        background: isDark
                            ? 'linear-gradient(to left, rgba(8, 8, 12, 0.4) 0%, transparent 100%)'
                            : 'linear-gradient(to left, rgba(245, 245, 248, 0.6) 0%, transparent 100%)',
                        pointerEvents: 'none',
                        transition: 'background 0.5s ease',
                    }} />

                    {/* Map viewport frame — subtle inset glow */}
                    <div style={{
                        position: 'absolute', top: 24, left: 380, right: 24, bottom: 24, zIndex: 6,
                        borderRadius: 24,
                        pointerEvents: 'none',
                        border: isDark
                            ? '1px solid rgba(255, 255, 255, 0.06)'
                            : '1px solid rgba(0, 0, 0, 0.04)',
                        boxShadow: isDark
                            ? 'inset 0 0 80px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255,255,255,0.03)'
                            : 'inset 0 0 80px rgba(255, 255, 255, 0.15), 0 0 0 1px rgba(0,0,0,0.02)',
                        transition: 'all 0.5s ease',
                    }} />
                </>
            )}

            {/* ═══════════════════════════════════════════
                MAP — Full screen background
                ═══════════════════════════════════════════ */}
            <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
                <DgisTrackingMap
                    drivers={drivers}
                    selectedDriverId={selectedDriver}
                    onDriverClick={(d) => { setSelectedDriver(d.driverId); setPopupInfo(d as any); }}
                    myLocation={myLocation}
                    getDriverColor={getDriverColor}
                    onReady={(m) => { dgisMapRef.current = m; }}
                />

                {popupInfo && (
                    <div style={{
                        position: 'absolute', right: 84, bottom: 24, zIndex: 5,
                        background: '#fff', borderRadius: 12, border: '1px solid #e8e9ee',
                        boxShadow: '0 12px 32px -8px rgba(16,24,40,0.25)', padding: '12px 14px', minWidth: 220,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{popupInfo.driverName}</span>
                            <span style={{ cursor: 'pointer', color: '#98a1b2' }} onClick={() => setPopupInfo(null)}>✕</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#5b6472', display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span>Госномер: <b style={{ color: '#0b0d12' }}>{popupInfo.vehiclePlate || '—'}</b></span>
                            {popupInfo.orderNumber && <span>Рейс: <b style={{ color: '#1677ff' }}>{popupInfo.orderNumber}</b></span>}
                            <span>Скорость: <b style={{ color: '#0b0d12' }}>{Math.round(popupInfo.speed || 0)} км/ч</b></span>
                            <span>Обновлено: {new Date(popupInfo.updatedAt).toLocaleTimeString('ru-RU')}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════
                ANIMATIONS
                ═══════════════════════════════════════════ */}
            <style jsx global>{`
                @keyframes tracking-radar {
                    0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0.6; }
                    100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
                }
                .tracking-radar-pulse,
                .tracking-radar-pulse-delayed {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    border: 2px solid ${isDark ? 'rgba(22, 119, 255, 0.3)' : 'rgba(22, 119, 255, 0.2)'};
                    animation: tracking-radar 2.5s ease-out infinite;
                }
                .tracking-radar-pulse-delayed {
                    animation-delay: 1.2s;
                }

                .tracking-control-btn:hover {
                    transform: translateY(-1px);
                    filter: brightness(1.1);
                }
                .tracking-control-btn:active {
                    transform: translateY(0);
                    filter: brightness(0.95);
                }

                /* Sidebar scrollbar styling */
                .tracking-sidebar::-webkit-scrollbar,
                .tracking-sidebar *::-webkit-scrollbar {
                    width: 4px;
                }
                .tracking-sidebar::-webkit-scrollbar-track,
                .tracking-sidebar *::-webkit-scrollbar-track {
                    background: transparent;
                }
                .tracking-sidebar::-webkit-scrollbar-thumb,
                .tracking-sidebar *::-webkit-scrollbar-thumb {
                    background: ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'};
                    border-radius: 4px;
                }

                /* Override ant design list items for tracking sidebar */
                .tracking-sidebar .ant-list-item {
                    border-bottom: none !important;
                }
                .tracking-sidebar .ant-list-item:hover {
                    background: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'} !important;
                    border-radius: 12px;
                }
            `}</style>
        </div>
    );
}
