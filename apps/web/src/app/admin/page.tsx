'use client';

import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography } from 'antd';
import {
    CarOutlined,
    TeamOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { api, Order } from '@/lib/api';

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
    PENDING: 'Ожидает',
    ASSIGNED: 'Назначен',
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

export default function AdminDashboard() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        inTransit: 0,
        completed: 0,
        problems: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await api.get('/orders');
                const data = response.data;
                setOrders(data);

                setStats({
                    total: data.length,
                    pending: data.filter((o: Order) => o.status === 'PENDING').length,
                    inTransit: data.filter((o: Order) => o.status === 'IN_TRANSIT').length,
                    completed: data.filter((o: Order) => o.status === 'COMPLETED').length,
                    problems: data.filter((o: Order) => o.status === 'PROBLEM').length,
                });
            } catch (error) {
                console.error('Failed to fetch orders:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
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
            title: 'Водитель',
            dataIndex: 'driver',
            key: 'driver',
            render: (driver: any) =>
                driver ? `${driver.firstName} ${driver.lastName}` : '—',
        },
        {
            title: 'Создана',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
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
                            prefix={<CarOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Ожидают назначения"
                            value={stats.pending}
                            prefix={<ClockCircleOutlined />}
                            valueStyle={{ color: '#faad14' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="В пути"
                            value={stats.inTransit}
                            prefix={<CarOutlined />}
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

            {/* <Card title="Последние заявки">
                <Table
                    columns={columns}
                    dataSource={orders.slice(0, 10)}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    size="small"
                />
            </Card> */}

            <div style={{ textAlign: 'center', marginTop: 40, color: '#999' }}>
                <Typography.Text type="secondary">
                    Детальная информация по заявкам доступна только участникам процесса.
                    <br />
                    Здесь отображается только общая статистика платформы.
                </Typography.Text>
            </div>
        </div >
    );
}
