'use client';

import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography } from 'antd';
import {
    FileTextOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    TruckOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title } = Typography;

const statusColors: Record<string, string> = {
    DRAFT: 'default',
    PENDING: 'orange',
    ASSIGNED: 'blue',
    EN_ROUTE_PICKUP: 'gold',
    AT_PICKUP: 'lime',
    LOADING: 'purple',
    IN_TRANSIT: 'cyan',
    AT_DELIVERY: 'lime',
    UNLOADING: 'purple',
    COMPLETED: 'green',
    CANCELLED: 'default',
    PROBLEM: 'red',
};

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает подтверждения',
    ASSIGNED: 'Машина назначена',
    EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке',
    LOADING: 'Загружается',
    IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке',
    UNLOADING: 'Разгружается',
    COMPLETED: 'Завершён',
    CANCELLED: 'Отменён',
    PROBLEM: 'Проблема',
};

interface Order {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    customerPrice?: number;
    createdAt: string;
    pickupLocation: { name: string };
    driver?: { firstName: string; lastName: string; vehiclePlate?: string };
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedDriverPlate?: string;
    assignedDriverTrailer?: string;
}

export default function CompanyDashboard() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
    });

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await api.get('/company/orders');
                const data = response.data;
                setOrders(data);
                setStats({
                    total: data.length,
                    pending: data.filter((o: Order) => o.status === 'PENDING').length,
                    inProgress: data.filter((o: Order) =>
                        ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'].includes(o.status)
                    ).length,
                    completed: data.filter((o: Order) => o.status === 'COMPLETED').length,
                });
            } catch (error) {
                console.error('Failed to fetch orders:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchOrders();
    }, []);

    const getStatusTag = (status: string) => {
        const color = statusColors[status] || 'default';
        const label = statusLabels[status] || status;

        // Custom simple badges instead of AntD tags for cleaner look
        const badgeStyle: React.CSSProperties = {
            padding: '4px 10px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 500,
            display: 'inline-block',
        };

        const colors: Record<string, { bg: string, text: string, border: string }> = {
            default: { bg: '#f4f4f5', text: '#71717a', border: '#e4e4e7' }, // Zinc
            orange: { bg: '#fff7ed', text: '#c2410c', border: '#ffedd5' }, // Orange
            blue: { bg: '#eff6ff', text: '#1d4ed8', border: '#dbeafe' }, // Blue
            gold: { bg: '#fefce8', text: '#a16207', border: '#fef9c3' }, // Yellow
            lime: { bg: '#f7fee7', text: '#4d7c0f', border: '#d9f99d' }, // Lime
            purple: { bg: '#faf5ff', text: '#7e22ce', border: '#f3e8ff' }, // Purple
            cyan: { bg: '#ecfeff', text: '#0e7490', border: '#cffafe' }, // Cyan
            green: { bg: '#f0fdf4', text: '#15803d', border: '#dcfce7' }, // Green
            red: { bg: '#fef2f2', text: '#b91c1c', border: '#fee2e2' }, // Red
        };

        const style = colors[color === 'default' ? 'default' : color] || colors.default;

        return (
            <span style={{
                ...badgeStyle,
                backgroundColor: style.bg,
                color: style.text,
                border: `1px solid ${style.border}`
            }}>
                {label}
            </span>
        );
    };

    const columns = [
        {
            title: <span style={{ color: '#71717a', fontWeight: 500 }}>№ ЗАЯВКИ</span>,
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            render: (text: string) => <span style={{ fontWeight: 600, color: '#09090b' }}>{text}</span>,
        },
        {
            title: <span style={{ color: '#71717a', fontWeight: 500 }}>ГРУЗ</span>,
            dataIndex: 'cargoDescription',
            key: 'cargoDescription',
            ellipsis: true,
            render: (text: string) => <span style={{ color: '#09090b', fontWeight: 500 }}>{text}</span>,
        },
        {
            title: <span style={{ color: '#71717a', fontWeight: 500 }}>ОТКУДА</span>,
            dataIndex: ['pickupLocation', 'name'],
            key: 'pickupLocation',
            render: (text: string) => <span style={{ color: '#52525b' }}>{text}</span>,
        },
        {
            title: <span style={{ color: '#71717a', fontWeight: 500 }}>СТАТУС</span>,
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => getStatusTag(status),
        },
        {
            title: <span style={{ color: '#71717a', fontWeight: 500 }}>ВОДИТЕЛЬ</span>,
            key: 'driver',
            render: (_: any, record: Order) => {
                let text = '—';
                if (record.assignedDriverName) {
                    const vehicle = record.assignedDriverPlate || '';
                    text = `${record.assignedDriverName} ${vehicle}`;
                } else if (record.driver) {
                    text = `${record.driver.firstName} ${record.driver.lastName}`;
                }
                return <span style={{ color: '#52525b' }}>{text}</span>;
            },
        },
        {
            title: <span style={{ color: '#71717a', fontWeight: 500 }}>СУММА</span>,
            dataIndex: 'customerPrice',
            key: 'customerPrice',
            render: (price: number) => price ? <span style={{ fontWeight: 600 }}>{price.toLocaleString()} ₸</span> : '—',
        },
    ];

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '8px', color: '#09090b' }}>
                    Обзор компании
                </h1>
                <p style={{ color: '#71717a', fontSize: '16px' }}>
                    Сводка по вашим текущим заказам и активности
                </p>
            </div>

            <Row gutter={[24, 24]} style={{ marginBottom: 40 }}>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Всего заявок</div>
                            <FileTextOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.total}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>за все время</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Ожидают</div>
                            <ClockCircleOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.pending}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>требуют внимания</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">В пути</div>
                            <TruckOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.inProgress}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>активные перевозки</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Завершено</div>
                            <CheckCircleOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.completed}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>успешные доставки</div>
                    </div>
                </Col>
            </Row>

            <div className="premium-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '24px 24px 0', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#09090b', margin: 0 }}>Последние заявки</h2>
                    <p style={{ color: '#71717a', fontSize: '14px', margin: '4px 0 0' }}>Список 10 последних созданных заявок</p>
                </div>
                <Table
                    columns={columns}
                    dataSource={orders.slice(0, 10)}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    size="middle"
                    rowClassName={() => 'premium-table-row'}
                />
            </div>
        </div>
    );
}
