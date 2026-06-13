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

    const toggleMapTheme = () => {
        const newMode = mapMode === 'night' ? 'day' : 'night';
        setMapMode(newMode);
        // Use user's custom styles
        setMapStyle(newMode === 'night'
            ? 'mapbox://styles/pontipilat/cmkrnybo6006c01qxdlo18v6e'
            : 'mapbox://styles/pontipilat/cmkro81vk005m01s55aem6mcy'
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
        <div style={{ display: 'flex', height: 'calc(100vh - 180px)', gap: 16 }}>
            {/* Список водителей */}
            <Card
                title="Отслеживание грузов"
                style={{ width: 320, overflow: 'auto' }}
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
                                    background: selectedDriver === driver.driverId ? '#e6f4ff' : 'transparent',
                                    borderRadius: 8,
                                    padding: '8px 12px',
                                    marginBottom: 4,
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{driver.driverName}</span>
                                            <Tag>{driver.vehiclePlate}</Tag>
                                        </div>
                                    }
                                    description={
                                        <>
                                            {driver.orderNumber && (
                                                <Tag
                                                    color={getDriverColor(driver)}
                                                    style={{ marginBottom: 4 }}
                                                >
                                                    {driver.orderNumber}
                                                </Tag>
                                            )}
                                            <div style={{ fontSize: 12, color: '#999' }}>
                                                {driver.speed ? `${Math.round(driver.speed * 3.6)} км/ч` : 'Стоит'}
                                                {' • '}
                                                {new Date(driver.updatedAt).toLocaleTimeString('ru-RU')}
                                            </div>
                                        </>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                )}

                {/* Легенда */}
                {orderColorMap.size > 0 && (
                    <div style={{ marginTop: 16, padding: '8px 0', borderTop: '1px solid #f0f0f0' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Рейсы:</Text>
                        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(Array.from(orderColorMap.entries()) as any[]).map(([order, color]) => (
                                <Tag key={order} color={color}>{order}</Tag>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* Карта */}
            <Card style={{ flex: 1, padding: 0, position: 'relative', overflow: 'hidden' }} bodyStyle={{ padding: 0, height: '100%' }}>
                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1, display: 'flex', gap: 8 }}>
                    <Button
                        onClick={toggleMapTheme}
                        style={{
                            background: mapMode === 'night' ? '#333' : '#fff',
                            color: mapMode === 'night' ? '#fff' : '#000',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        icon={mapMode === 'night' ? '🌙' : '☀️'}
                    >
                        {mapMode === 'night' ? 'Ночь' : 'День'}
                    </Button>
                    <Button
                        type="primary"
                        icon={<AimOutlined />}
                        onClick={centerOnMyLocation}
                    >
                        Моё место
                    </Button>
                </div>

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
            </Card>
        </div>
    );
}
