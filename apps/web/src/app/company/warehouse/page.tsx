'use client';

import { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography, Button, Space, List, Avatar } from 'antd';
import { CarOutlined, ClockCircleOutlined, ReloadOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import nova from '@/components/nova/nova.module.css';
import Loader from '@/components/ui/Loader';

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
        } catch (error: any) {
            console.error(error);
            if (error.response && (error.response.status === 404 || error.response.status === 400)) {
                setQueueItems([]);
            }
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
        // Цветом — то, что требует движения: машину зовут к воротам. Остальное
        // просто где она сейчас.
        if (item.completedAt) return <span className={nova.chip}>Загружен</span>;
        if (item.startedAt) return <span className={nova.chip}>Погрузка</span>;
        if (item.assignedAt) {
            return <span className={`${nova.chip} ${nova.chipWarn}`}>К воротам {item.gate?.gateNumber}</span>;
        }
        return <span className={nova.chip}>Ожидает</span>;
    };

    const waitingCount = queueItems.filter(i => !i.assignedAt).length;
    const loadingCount = queueItems.filter(i => i.startedAt && !i.completedAt).length;

    // Склад — таблица остатков: по экрану, а не в колонку.
    return (
        <div className="lc-page">
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Склад · Операции</div>
                    <h1 className="lc2-title">Очередь на погрузку</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Управление очередью машин на складах
                    </p>
                    <Button icon={<ReloadOutlined />} onClick={fetchQueue}>
                        Обновить
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic">
                            <CarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">В очереди</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {queueItems.length}
                            </div>
                            <div className="lc2-msub">машин</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic">
                            <ClockCircleOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Ожидают</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {waitingCount}
                            </div>
                            <div className="lc2-msub">назначения ворот</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: loadingCount > 0 ? '#e6ffed' : '#f1f2f5', color: loadingCount > 0 ? '#28a745' : '#5f6672' }}>
                            <CarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">На погрузке</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {loadingCount}
                            </div>
                            <div className="lc2-msub">сейчас</div>
                        </div>
                    </div>
                </div>
            </div>

            {loading && queueItems.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 50 }}>
                    <Loader size="large" />
                </div>
            ) : Object.keys(groupedItems).length === 0 ? (
                <div className="lc-card" style={{ padding: 20, textAlign: 'center' }}>
                    <Text type="secondary">Очередь пуста</Text>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {Object.entries(groupedItems).map(([locationName, items]) => (
                        <div className="lc-card" key={locationName} style={{ padding: 0 }}>
                            <div style={{ padding: '16px 20px', fontWeight: 600, fontSize: 15, borderBottom: '1px solid var(--lc-border)' }}>
                                <Space>
                                    <EnvironmentOutlined />
                                    {locationName}
                                </Space>
                            </div>
                            <div style={{ padding: 16 }}>
                            <Table
                                dataSource={items}
                                rowKey="id"
                                pagination={false}
                                size="small"
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
                                                    <div style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>
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
                                                <div style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>
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
                                        render: (_, record) => record.gate ? <span className={nova.chip}>{record.gate.gateNumber}</span> : '-',
                                    }
                                ]}
                            />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
