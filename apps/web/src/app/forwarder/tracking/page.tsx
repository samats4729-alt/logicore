'use client';

import { useEffect, useState } from 'react';
import { Card, Typography, Spin, App, Empty, Space } from 'antd';
import { EnvironmentOutlined, CarOutlined } from '@ant-design/icons';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

// Dynamic import для карты
const MapContainer = dynamic(
    () => import('react-leaflet').then(mod => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import('react-leaflet').then(mod => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import('react-leaflet').then(mod => mod.Marker),
    { ssr: false }
);
const Popup = dynamic(
    () => import('react-leaflet').then(mod => mod.Popup),
    { ssr: false }
);

interface DriverLocation {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    lastLocation: {
        latitude: number;
        longitude: number;
        timestamp: string;
        speed?: number;
    } | null;
}

const TrackingMap = ({ drivers }: { drivers: DriverLocation[] }) => {
    const L = require('leaflet');
    require('leaflet/dist/leaflet.css');

    const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const driversWithLocation = drivers.filter(d => d.lastLocation);

    // Алматы center
    const center: [number, number] = driversWithLocation.length > 0
        ? [driversWithLocation[0].lastLocation!.latitude, driversWithLocation[0].lastLocation!.longitude]
        : [43.2389, 76.8897];

    return (
        <MapContainer
            center={center}
            zoom={11}
            style={{ height: 'calc(100vh - 200px)', width: '100%', borderRadius: 8 }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {driversWithLocation.map(driver => (
                <Marker
                    key={driver.id}
                    position={[driver.lastLocation!.latitude, driver.lastLocation!.longitude]}
                    icon={icon}
                >
                    <Popup>
                        <div style={{ padding: 8 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                {driver.lastName} {driver.firstName}
                            </div>
                            <div style={{ fontSize: 12, color: '#666' }}>
                                {driver.vehicleModel && <div>🚛 {driver.vehicleModel}</div>}
                                {driver.vehiclePlate && <div>🔢 {driver.vehiclePlate}</div>}
                                {driver.lastLocation?.speed != null && (
                                    <div>💨 {Math.round(driver.lastLocation?.speed || 0)} км/ч</div>
                                )}
                                <div style={{ marginTop: 4, fontSize: 11 }}>
                                    {new Date(driver.lastLocation!.timestamp).toLocaleString('ru-RU')}
                                </div>
                            </div>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
};

export default function ForwarderTrackingPage() {
    const { message } = App.useApp();
    const [drivers, setDrivers] = useState<DriverLocation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTracking();
        // Обновляем каждые 30 секунд
        const interval = setInterval(fetchTracking, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchTracking = async () => {
        try {
            const response = await api.get('/forwarder/tracking');
            setDrivers(response.data);
        } catch (error) {
            message.error('Ошибка загрузки данных');
        } finally {
            setLoading(false);
        }
    };

    const driversWithLocation = drivers.filter(d => d.lastLocation);
    const driversWithoutLocation = drivers.filter(d => !d.lastLocation);

    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <Title level={2} style={{ margin: 0 }}>Карта водителей</Title>
                <Text type="secondary">
                    Отслеживание местоположения водителей в реальном времени
                </Text>
            </div>

            <Card bordered={false} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 60 }}>
                        <Spin size="large" />
                    </div>
                ) : driversWithLocation.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60 }}>
                        <EnvironmentOutlined style={{ fontSize: 48, color: '#ccc', display: 'block', margin: '0 auto 16px' }} />
                        <Empty description="Нет данных о местоположении водителей" />
                    </div>
                ) : (
                    <>
                        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f5f5f5', borderRadius: 8 }}>
                            <Space size="large">
                                <div>
                                    <CarOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                                    <strong>На карте:</strong> {driversWithLocation.length}
                                </div>
                                {driversWithoutLocation.length > 0 && (
                                    <div>
                                        <EnvironmentOutlined style={{ color: '#999', marginRight: 8 }} />
                                        <strong>Нет данных:</strong> {driversWithoutLocation.length}
                                    </div>
                                )}
                            </Space>
                        </div>
                        <TrackingMap drivers={drivers} />
                    </>
                )}
            </Card>
        </div>
    );
}
