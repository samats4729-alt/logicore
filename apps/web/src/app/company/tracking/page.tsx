'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, Tag, Typography, Spin, Badge, List, Avatar, Button, App } from 'antd';
import { CarOutlined, ReloadOutlined, AimOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

const InteractiveMap = dynamic(() => import('@/components/ui/InteractiveMap'), {
    ssr: false,
    loading: () => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000' }}>
            <Spin size="large" tip="Загрузка 3D-карты..." />
        </div>
    )
});

const { Text } = Typography;

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG9udGlwaWxhdCIsImEiOiJjbWtybWQ1b3UwemdhM2NzOWkxZjJqeGZ6In0.iKSM05aqs4Wpx4B-CBscjg';

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
    const [mapStyle, setMapStyle] = useState('mapbox://styles/pontipilat/cmkrnybo6006c01qxdlo18v6e');
    const [viewState, setViewState] = useState({
        latitude: 43.238949,
        longitude: 76.945780,
        zoom: 14,
        pitch: 50,
        bearing: -17
    });
    const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [popupInfo, setPopupInfo] = useState<DriverPosition | null>(null);

    const [mapMode, setMapMode] = useState<'day' | 'night'>('night');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const toggleMapTheme = () => {
        const newMode = mapMode === 'night' ? 'day' : 'night';
        setMapMode(newMode);
        // Use user's custom styles
        setMapStyle(newMode === 'night'
            ? 'mapbox://styles/pontipilat/cmkrnybo6006c01qxdlo18v6e'
            : 'mapbox://styles/pontipilat/cmqcu0om5000q01r66lm81p25'
        );
        // Always 3d
        setViewState(prev => ({ ...prev, pitch: 50, bearing: -17, zoom: 16 }));
    };

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
                    setViewState(prev => ({ ...prev, latitude, longitude, zoom: 14 }));
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
        setViewState(prev => ({
            ...prev,
            latitude: driver.latitude,
            longitude: driver.longitude,
            zoom: 15
        }));
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

    return (
        <div style={{ position: 'relative', height: isMobile ? 'calc(100vh - 56px - 16px)' : 'calc(100vh - 56px)', overflow: 'hidden' }}>
            {/* Список водителей (Glassmorphism Sidebar) */}
            <Card
                title="Отслеживание грузов"
                style={{
                    position: isMobile ? 'relative' : 'absolute',
                    top: isMobile ? 0 : 24,
                    left: isMobile ? 0 : 24,
                    bottom: isMobile ? 0 : 24,
                    width: isMobile ? '100%' : 320,
                    zIndex: 10,
                    background: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(228, 228, 231, 0.7)',
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
                    borderRadius: isMobile ? 0 : 16,
                    display: isMobile ? 'none' : 'flex', // Скрываем на мобилках, там управление на карте или drawer
                    flexDirection: 'column',
                }}
                bodyStyle={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}
                extra={<ReloadOutlined onClick={fetchDrivers} style={{ cursor: 'pointer' }} />}
            >
                {loading ? (
                    <Spin />
                ) : drivers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                        <Text type="secondary">Нет активных рейсов с GPS</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>Водители появятся здесь, когда начнут движение по вашим заявкам</Text>
                    </div>
                ) : (
                    <List
                        dataSource={drivers}
                        renderItem={(driver) => (
                            <List.Item
                                style={{
                                    cursor: 'pointer',
                                    background: selectedDriver === driver.driverId ? 'rgba(22, 119, 255, 0.15)' : 'transparent',
                                    borderRadius: 8,
                                    padding: '8px 12px',
                                    marginBottom: 4,
                                    border: 'none',
                                    transition: 'background 0.2s',
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
                                            <span style={{ fontWeight: 600, fontSize: 13 }}>{driver.driverName}</span>
                                            <Tag style={{ margin: 0, fontSize: 11 }}>{driver.vehiclePlate}</Tag>
                                        </div>
                                    }
                                    description={
                                        <div style={{ marginTop: 4 }}>
                                            {driver.orderNumber && (
                                                <Tag
                                                    color={getDriverColor(driver)}
                                                    style={{ marginBottom: 4, fontSize: 10 }}
                                                >
                                                    {driver.orderNumber}
                                                </Tag>
                                            )}
                                            <div style={{ fontSize: 11, color: '#666' }}>
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
                    <div style={{ marginTop: 16, padding: '8px 0', borderTop: '1px solid rgba(228, 228, 231, 0.8)' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>Рейсы:</Text>
                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(Array.from(orderColorMap.entries()) as any[]).map(([order, color]) => (
                                <Tag key={order} color={color} style={{ fontSize: 10, margin: 0 }}>{order}</Tag>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* Панель кнопок управления */}
            <div style={{ position: 'absolute', top: isMobile ? 12 : 24, right: isMobile ? 12 : 24, zIndex: 10, display: 'flex', gap: 8 }}>
                <Button
                    onClick={toggleMapTheme}
                    style={{
                        background: mapMode === 'night' ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                        color: mapMode === 'night' ? '#fff' : '#000',
                        border: '1px solid rgba(228, 228, 231, 0.5)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    }}
                    icon={mapMode === 'night' ? '🌙' : '☀️'}
                >
                    {mapMode === 'night' ? 'Ночь' : 'День'}
                </Button>
                <Button
                    type="primary"
                    icon={<AimOutlined />}
                    onClick={centerOnMyLocation}
                    style={{
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(22, 119, 255, 0.2)',
                    }}
                >
                    Моё место
                </Button>
            </div>

            {/* Десктопные заблюренные границы и рамки поверх карты */}
            {!isMobile && (
                <>
                    {/* Верхняя рамка с размытием */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, zIndex: 6, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', background: 'rgba(248, 248, 248, 0.25)', pointerEvents: 'none' }} />
                    
                    {/* Нижиняя рамка с размытием */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, zIndex: 6, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', background: 'rgba(248, 248, 248, 0.25)', pointerEvents: 'none' }} />
                    
                    {/* Левая внешняя рамка (до сайдбара) */}
                    <div style={{ position: 'absolute', top: 24, bottom: 24, left: 0, width: 24, zIndex: 6, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', background: 'rgba(248, 248, 248, 0.25)', pointerEvents: 'none' }} />
                    
                    {/* Правая внешняя рамка */}
                    <div style={{ position: 'absolute', top: 24, bottom: 24, right: 0, width: 24, zIndex: 6, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', background: 'rgba(248, 248, 248, 0.25)', pointerEvents: 'none' }} />
                    
                    {/* Промежуточная рамка (между сайдбаром и окном карты) */}
                    <div style={{ position: 'absolute', top: 24, bottom: 24, left: 344, width: 16, zIndex: 6, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', background: 'rgba(248, 248, 248, 0.25)', pointerEvents: 'none' }} />
                    
                    {/* Физическая рамка оригинального окна карты с тенью */}
                    <div style={{ position: 'absolute', top: 24, left: 360, right: 24, bottom: 24, zIndex: 7, border: '1px solid rgba(228, 228, 231, 0.8)', borderRadius: 24, pointerEvents: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }} />
                </>
            )}

            {/* Карта (На весь экран в фоне) */}
            <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
                <InteractiveMap
                    viewState={viewState}
                    onViewStateChange={setViewState}
                    mapStyle={mapStyle}
                    mapboxAccessToken={MAPBOX_TOKEN}
                    drivers={drivers}
                    popupInfo={popupInfo}
                    onPopupInfoChange={setPopupInfo}
                    myLocation={myLocation}
                    getDriverColor={getDriverColor}
                />
            </div>
        </div>
    );
}
