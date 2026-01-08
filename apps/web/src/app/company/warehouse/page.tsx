'use client';

import { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography, Spin, Button, message, Space, List, Avatar } from 'antd';
import { CarOutlined, ClockCircleOutlined, ReloadOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface QueueItem {
    id: string;
    orderId: string;
    arrivedAt: string;
    assignedAt?: string;
    startedAt?: string;
    completedAt?: string;
    gate?: {
        id: string;
        gateNumber: string;
    };
    order: {
        id: string;
        orderNumber: string;
        cargoDescription: string;
        pickupLocation: {
            id: string;
            name: string;
            address: string;
        };
        driver?: {
            id: string;
            firstName: string;
            lastName: string;
            vehiclePlate?: string;
        };
    };
}

export default function CompanyWarehousePage() {
    const [loading, setLoading] = useState(true);
    const [queueItems, setQueueItems] = useState<QueueItem[]>([]);

    const fetchQueue = async () => {
        setLoading(true);
        try {
            const response = await api.get('/warehouse/queue/my');
            setQueueItems(response.data);
        } catch (error) {
            console.error(error);
            message.error('Не удалось загрузить очередь');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
        const interval = setInterval(fetchQueue, 30000);
        return () => clearInterval(interval);
    }, []);

    // Группировка по складам
    const groupedItems = queueItems.reduce((acc, item) => {
        const locName = item.order.pickupLocation?.name || 'Неизвестный склад';
        if (!acc[locName]) {
            acc[locName] = [];
        }
        acc[locName].push(item);
        return acc;
    }, {} as Record<string, QueueItem[]>);

    const getStatusTag = (item: QueueItem) => {
        if (item.completedAt) return <Tag color="green">Загружен</Tag>;
        if (item.startedAt) return <Tag color="blue">Погрузка</Tag>;
        if (item.assignedAt) return <Tag color="orange">К воротам {item.gate?.gateNumber}</Tag>;
        return <Tag color="default">Ожидает</Tag>;
    };

    return (
        <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                <Title level={2}>Очередь на погрузку</Title>
                <Button icon={<ReloadOutlined />} onClick={fetchQueue}>Обновить</Button>
            </div>

            {loading && queueItems.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 50 }}>
                    <Spin size="large" />
                </div>
            ) : Object.keys(groupedItems).length === 0 ? (
                <Card>
                    <div style={{ textAlign: 'center', padding: 40 }}>
                        <Text type="secondary">Очередь пуста</Text>
                    </div>
                </Card>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {Object.entries(groupedItems).map(([locationName, items]) => (
                        <Card
                            key={locationName}
                            title={
                                <Space>
                                    <EnvironmentOutlined />
                                    {locationName}
                                </Space>
                            }
                        >
                            <Table
                                dataSource={items}
                                rowKey="id"
                                pagination={false}
                                columns={[
                                    {
                                        title: 'Время прибытия',
                                        dataIndex: 'arrivedAt',
                                        key: 'arrivedAt',
                                        render: (date) => (
                                            <Space>
                                                <ClockCircleOutlined />
                                                {dayjs(date).format('HH:mm')}
                                            </Space>
                                        ),
                                        width: 120,
                                    },
                                    {
                                        title: 'Транспорт',
                                        key: 'vehicle',
                                        render: (_, record) => (
                                            <Space>
                                                <Avatar icon={<CarOutlined />} />
                                                <div>
                                                    <div>{record.order.driver?.vehiclePlate || 'Без номера'}</div>
                                                    <div style={{ fontSize: 12, color: '#888' }}>
                                                        {record.order.driver?.lastName} {record.order.driver?.firstName}
                                                    </div>
                                                </div>
                                            </Space>
                                        ),
                                    },
                                    {
                                        title: 'Заявка',
                                        key: 'order',
                                        render: (_, record) => (
                                            <div>
                                                <Text strong>{record.order.orderNumber}</Text>
                                                <div style={{ fontSize: 12, color: '#888' }}>
                                                    {record.order.cargoDescription}
                                                </div>
                                            </div>
                                        ),
                                    },
                                    {
                                        title: 'Статус',
                                        key: 'status',
                                        render: (_, record) => getStatusTag(record),
                                    },
                                    {
                                        title: 'Ворота',
                                        key: 'gate',
                                        render: (_, record) => record.gate ? <Tag color="volcano">{record.gate.gateNumber}</Tag> : '-',
                                    }
                                ]}
                            />
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
