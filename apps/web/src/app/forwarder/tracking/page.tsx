'use client';

import { useEffect, useState } from 'react';
import { Card, Typography, Spin, App, Empty, Space } from 'antd';
import { EnvironmentOutlined, CarOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import ReactMap, { Marker, Popup, NavigationControl, ViewStateChangeEvent, MapMouseEvent } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

const { Title, Text } = Typography;

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG9udGlwaWxhdCIsImEiOiJjbWtybWQ1b3UwemdhM2NzOWkxZjJqeGZ6In0.iKSM05aqs4Wpx4B-CBscjg';

// Компонент маркера машины
const CarMarkerIcon = ({ isSelected = false }: { isSelected?: boolean }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={isSelected ? "40" : "32"}
        height={isSelected ? "40" : "32"}
        viewBox="0 0 24 24"
        fill="#52c41a"
        stroke="#fff"
        strokeWidth="1"
        style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}
    >
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
    </svg>
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
    const driversWithLocation = drivers.filter(d => d.lastLocation);
    const [popupInfo, setPopupInfo] = useState<DriverLocation | null>(null);

    // Initial center (Almaty by default or first driver)
    const initialViewState = {
        latitude: driversWithLocation.length > 0 ? driversWithLocation[0].lastLocation!.latitude : 43.2389,
        longitude: driversWithLocation.length > 0 ? driversWithLocation[0].lastLocation!.longitude : 76.8897,
        zoom: 11
    };

    return (
        <div style={{ height: 'calc(100vh - 200px)', width: '100%', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
            <ReactMap
                initialViewState={initialViewState}
                mapStyle="mapbox://styles/mapbox/streets-v12"
                mapboxAccessToken={MAPBOX_TOKEN}
            >
                <NavigationControl position="top-right" />

                {driversWithLocation.map(driver => (
                    <Marker
                        key={driver.id}
                        latitude={driver.lastLocation!.latitude}
                        longitude={driver.lastLocation!.longitude}
                        anchor="center"
                        onClick={(e: any) => {
                            e.originalEvent.stopPropagation();
                            setPopupInfo(driver);
                        }}
                    >
                        <div style={{ cursor: 'pointer' }}>
                            <CarMarkerIcon />
                        </div>
                    </Marker>
                ))}

                {popupInfo && (
                    <Popup
                        anchor="top"
                        longitude={popupInfo.lastLocation!.longitude}
                        latitude={popupInfo.lastLocation!.latitude}
                        onClose={() => setPopupInfo(null)}
                    >
                        <div style={{ padding: 4, minWidth: 150 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                {popupInfo.lastName} {popupInfo.firstName}
                            </div>
                            <div style={{ fontSize: 12, color: '#666' }}>
                                {popupInfo.vehicleModel && <div>🚛 {popupInfo.vehicleModel}</div>}
                                {popupInfo.vehiclePlate && <div>🔢 {popupInfo.vehiclePlate}</div>}
                                {popupInfo.lastLocation?.speed != null && (
                                    <div>💨 {Math.round(popupInfo.lastLocation?.speed || 0)} км/ч</div>
                                )}
                                <div style={{ marginTop: 4, fontSize: 11 }}>
                                    {new Date(popupInfo.lastLocation!.timestamp).toLocaleString('ru-RU')}
                                </div>
                            </div>
                        </div>
                    </Popup>
                )}
            </ReactMap>
        </div>
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
