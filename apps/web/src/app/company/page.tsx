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
    pickupLocation?: { name: string };
    driver?: { firstName: string; lastName: string; vehiclePlate?: string };
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

    const columns = [
        {
            title: '№ Заявки',
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            render: (text: string) => <strong>{text}</strong>,
        },
        {
            title: 'Груз',
            dataIndex: 'cargoDescription',
            key: 'cargoDescription',
            ellipsis: true,
        },
        {
            title: 'Откуда',
            dataIndex: ['pickupLocation', 'name'],
            key: 'pickupLocation',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag color={statusColors[status] || 'default'}>
                    {statusLabels[status] || status}
                </Tag>
            ),
        },
        {
            title: 'Водитель/Машина',
            dataIndex: 'driver',
            key: 'driver',
            render: (driver: any) =>
                driver ? `${driver.firstName} ${driver.lastName} (${driver.vehiclePlate || '—'})` : '—',
        },
        {
            title: 'Сумма',
            dataIndex: 'customerPrice',
            key: 'customerPrice',
            render: (price: number) => price ? `${price.toLocaleString()} ₸` : '—',
        },
    ];

    return (
        <div>
            <Title level={3}>Дашборд</Title>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Всего заявок"
                            value={stats.total}
                            prefix={<FileTextOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Ожидают подтверждения"
                            value={stats.pending}
                            prefix={<ClockCircleOutlined />}
                            valueStyle={{ color: '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="В процессе"
                            value={stats.inProgress}
                            prefix={<TruckOutlined />}
                            valueStyle={{ color: '#1677ff' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Завершено"
                            value={stats.completed}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
            </Row>

            <Card title="Последние заявки">
                <Table
                    columns={columns}
                    dataSource={orders.slice(0, 10)}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    size="small"
                />
            </Card>
        </div>
    );
}
