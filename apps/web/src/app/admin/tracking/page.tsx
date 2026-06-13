'use client';

import dynamic from 'next/dynamic';
import { Card, Tag, Typography, Spin, Badge, List, Avatar, Button, App } from 'antd';
import { CarOutlined, ReloadOutlined, AimOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

const InteractiveAdminMap = dynamic(() => import('@/components/ui/InteractiveAdminMap'), {
    ssr: false,
    loading: () => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000' }}>
            <Spin size="large" tip="Загрузка карты..." />
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

export default function TrackingMapPage() {
    const { message } = App.useApp();
    const [drivers, setDrivers] = useState<DriverPosition[]>([]);
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const [viewState, setViewState] = useState({
        latitude: 43.238949,
        longitude: 76.945780,
        zoom: 12
    });
    const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [popupInfo, setPopupInfo] = useState<DriverPosition | null>(null);

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

        // WebSocket подключение для real-time обновлений
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
                return [...prev, data];
            });
        });

        setSocket(newSocket);

        const interval = setInterval(fetchDrivers, 30000);

        return () => {
            newSocket.disconnect();
            clearInterval(interval);
        };
    }, [fetchDrivers]);

    // Подписка на конкретного водителя
    useEffect(() => {
        if (socket && selectedDriver) {
            socket.emit('subscribe:driver', { driverId: selectedDriver });
        }
    }, [socket, selectedDriver]);

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
        <div style={{ position: 'relative', height: isMobile ? 'calc(100vh - 64px - 16px)' : 'calc(100vh - 64px)', overflow: 'hidden' }}>
            {/* Список водителей (Glassmorphism Sidebar) */}
            <Card
                title="Водители на линии"
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
                    display: isMobile ? 'none' : 'flex',
                    flexDirection: 'column',
                }}
                bodyStyle={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}
                extra={<ReloadOutlined onClick={fetchDrivers} style={{ cursor: 'pointer' }} />}
            >
                {loading ? (
                    <Spin />
                ) : drivers.length === 0 ? (
                    <Text type="secondary">Нет активных водителей</Text>
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
            <div style={{ position: 'absolute', top: isMobile ? 12 : 24, right: isMobile ? 12 : 24, zIndex: 10 }}>
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

            {/* Карта */}
            <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
                <InteractiveAdminMap
                    viewState={viewState}
                    onViewStateChange={setViewState}
                    mapboxAccessToken={MAPBOX_TOKEN}
                    drivers={drivers}
                    selectedDriver={selectedDriver}
                    onSelectedDriverChange={setSelectedDriver}
                    popupInfo={popupInfo}
                    onPopupInfoChange={setPopupInfo}
                    myLocation={myLocation}
                    getDriverColor={getDriverColor}
                />
            </div>
        </div>
    );
}
