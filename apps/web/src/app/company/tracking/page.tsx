'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, Tag, Typography, Spin, Badge, List, Avatar, Button, App } from 'antd';
import { CarOutlined, ReloadOutlined, AimOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';
import L from 'leaflet';

const { Text } = Typography;

// Динамический импорт карты (Leaflet не работает с SSR)
const MapContainer = dynamic(
    () => import('react-leaflet').then((mod) => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import('react-leaflet').then((mod) => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import('react-leaflet').then((mod) => mod.Marker),
    { ssr: false }
);
const Popup = dynamic(
    () => import('react-leaflet').then((mod) => mod.Popup),
    { ssr: false }
);

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

// Создаём SVG иконку машины с заданным цветом
const createCarIcon = (color: string, isSelected: boolean = false) => {
    const size = isSelected ? 40 : 32;
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="${isSelected ? '#000' : '#fff'}" stroke-width="1">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
        </svg>
    `;

    return L.divIcon({
        html: svg,
        className: 'car-marker',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
    });
};

// Иконка для моего местоположения
const createMyLocationIcon = () => {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1677ff" stroke="#fff" stroke-width="2">
            <circle cx="12" cy="12" r="8"/>
        </svg>
    `;

    return L.divIcon({
        html: svg,
        className: 'my-location-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
    });
};

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
    const [socket, setSocket] = useState<Socket | null>(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapCenter, setMapCenter] = useState<[number, number]>([43.238949, 76.945780]);
    const [mapKey, setMapKey] = useState(0);
    const [myLocation, setMyLocation] = useState<[number, number] | null>(null);

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
            // message.error('Не удалось загрузить данные о водителях'); // Suppress error
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => {
        setMapReady(true);
        fetchDrivers();

        // WebSocket подключение для real-time обновлений
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const newSocket = io(API_URL, {
            transports: ['websocket'],
        });

        newSocket.on('connect', () => {
            console.log('Connected to tracking socket');
        });

        newSocket.on('position:update', (data: DriverPosition) => {
            // Если водителя нет в моем списке (например, чужая компания), он не появится?
            // API возвращает filtered list, но sockets?
            // Socket broadcasting currently sends to everyone.
            // TODO: Implement room-based socket broadcasting for companies.
            // While messy, frontend can verify if they care about this update.
            // But we don't have companyId on frontend easy access in this component without store.
            // Let's just refetch on update or accept it. 
            // Better: update valid drivers if they exist in list, or refetch full list to check permissions.

            setDrivers((prev) => {
                const index = prev.findIndex((d) => d.driverId === data.driverId);
                if (index >= 0) {
                    const updated = [...prev];
                    updated[index] = data;
                    return updated;
                }
                // If it's a new driver potentially for my company, we might want to refetch or assume it's valid if backend broadcast logic changes.
                // For now, simpler to reload list occasionally or trust socket (but socket sends all).
                // Let's stick to updating existing only to avoid showing other company drivers.
                return prev;
            });
        });

        setSocket(newSocket);

        // Периодическое обновление каждые 30 секунд
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
                    const loc: [number, number] = [position.coords.latitude, position.coords.longitude];
                    setMyLocation(loc);
                    setMapCenter(loc);
                    setMapKey(prev => prev + 1);
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
        setMapCenter([driver.latitude, driver.longitude]);
        setMapKey(prev => prev + 1);
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

    if (!mapReady) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin size="large" />
            </div>
        );
    }

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
                            {Array.from(orderColorMap.entries()).map(([order, color]) => (
                                <Tag key={order} color={color}>{order}</Tag>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* Карта */}
            <Card style={{ flex: 1, padding: 0, position: 'relative' }} bodyStyle={{ padding: 0, height: '100%' }}>
                <link
                    rel="stylesheet"
                    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
                />
                <style>{`
                    .car-marker, .my-location-marker {
                        background: transparent !important;
                        border: none !important;
                    }
                `}</style>

                <Button
                    type="primary"
                    icon={<AimOutlined />}
                    onClick={centerOnMyLocation}
                    style={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        zIndex: 1000,
                    }}
                >
                    Моё место
                </Button>

                <MapContainer
                    key={mapKey}
                    center={mapCenter}
                    zoom={12}
                    style={{ height: '100%', width: '100%', borderRadius: 8 }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {drivers.map((driver) => (
                        <Marker
                            key={driver.driverId}
                            position={[driver.latitude, driver.longitude]}
                            icon={createCarIcon(getDriverColor(driver), selectedDriver === driver.driverId)}
                        >
                            <Popup>
                                <div style={{ minWidth: 150 }}>
                                    <strong>{driver.driverName}</strong>
                                    <br />
                                    <Tag>{driver.vehiclePlate}</Tag>
                                    <br />
                                    {driver.orderNumber && (
                                        <>
                                            <Tag color={getDriverColor(driver)}>{driver.orderNumber}</Tag>
                                            <br />
                                        </>
                                    )}
                                    <small>
                                        Скорость: {driver.speed ? `${Math.round(driver.speed * 3.6)} км/ч` : 'Стоит'}
                                        <br />
                                        Обновлено: {new Date(driver.updatedAt).toLocaleTimeString('ru-RU')}
                                    </small>
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                    {/* Моя позиция */}
                    {myLocation && (
                        <Marker position={myLocation} icon={createMyLocationIcon()}>
                            <Popup>
                                <strong>📍 Вы здесь</strong>
                            </Popup>
                        </Marker>
                    )}
                </MapContainer>
            </Card>
        </div>
    );
}
