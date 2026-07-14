'use client';

import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Spin, Tag, Empty } from 'antd';
import {
    ShopOutlined,
    TeamOutlined,
    CarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    DollarOutlined,
    CustomerServiceOutlined,
    RiseOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

interface Overview {
    companies: { total: number; new30: number };
    users: { office: number; drivers: number };
    orders: { total: number; month: number; active: number; completed: number; problem: number };
    gmvMonth: number;
    openTickets: number;
    byStatus: Record<string, number>;
    ordersDaily: { date: string; count: number }[];
}

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

const fmt = (n: number) => n.toLocaleString('ru-RU');

export default function AdminDashboard() {
    const [data, setData] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/admin/stats')
            .then(res => setData(res.data))
            .catch(err => console.error('Failed to fetch stats:', err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
    }

    if (!data) {
        return <Empty description="Не удалось загрузить статистику" style={{ marginTop: 80 }} />;
    }

    const maxDaily = Math.max(1, ...data.ordersDaily.map(d => d.count));
    const statusEntries = Object.entries(data.byStatus).sort((a, b) => b[1] - a[1]);

    return (
        <div>
            <Title level={3}>Дашборд</Title>
            <Text type="secondary">Сводка по всей платформе. Обновляется при каждом открытии страницы.</Text>

            {/* Компании и люди */}
            <Row gutter={[16, 16]} style={{ marginTop: 20, marginBottom: 16 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Компаний на платформе" value={fmt(data.companies.total)} prefix={<ShopOutlined />} />
                        <Text type="success" style={{ fontSize: 12 }}>
                            <RiseOutlined /> +{data.companies.new30} за 30 дней
                        </Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Сотрудников компаний" value={fmt(data.users.office)} prefix={<TeamOutlined />} />
                        <Text type="secondary" style={{ fontSize: 12 }}>без учёта водителей</Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Водителей" value={fmt(data.users.drivers)} prefix={<CarOutlined />} />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Открытых обращений"
                            value={fmt(data.openTickets)}
                            prefix={<CustomerServiceOutlined />}
                            valueStyle={{ color: data.openTickets > 0 ? '#faad14' : undefined }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Заявки и деньги */}
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Заявок за месяц" value={fmt(data.orders.month)} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#1677ff' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>всего за всё время: {fmt(data.orders.total)}</Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Активных заявок" value={fmt(data.orders.active)} prefix={<CarOutlined />} valueStyle={{ color: '#13c2c2' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>в работе прямо сейчас</Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Завершено заявок" value={fmt(data.orders.completed)} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
                        {data.orders.problem > 0 && (
                            <Text type="danger" style={{ fontSize: 12 }}>
                                <ExclamationCircleOutlined /> проблемных: {data.orders.problem}
                            </Text>
                        )}
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Оборот за месяц"
                            value={fmt(Math.round(data.gmvMonth))}
                            prefix={<DollarOutlined />}
                            suffix="₸"
                            valueStyle={{ color: '#722ed1' }}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>сумма завершённых заявок</Text>
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                {/* Мини-график заявок по дням */}
                <Col xs={24} lg={14}>
                    <Card title="Новые заявки за 14 дней">
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, paddingTop: 8 }}>
                            {data.ordersDaily.map((d) => {
                                const h = Math.round((d.count / maxDaily) * 130);
                                const day = d.date.slice(8, 10);
                                return (
                                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <span style={{ fontSize: 11, color: 'var(--lc-text-ter, #999)', minHeight: 14 }}>
                                            {d.count > 0 ? d.count : ''}
                                        </span>
                                        <div
                                            title={`${d.date}: ${d.count}`}
                                            style={{
                                                width: '100%',
                                                maxWidth: 28,
                                                height: Math.max(h, 3),
                                                background: d.count > 0 ? 'linear-gradient(180deg, #4096ff, #1677ff)' : '#e8e8e8',
                                                borderRadius: 4,
                                                transition: 'height .3s ease',
                                            }}
                                        />
                                        <span style={{ fontSize: 11, color: 'var(--lc-text-ter, #999)' }}>{day}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </Col>

                {/* Заявки по статусам */}
                <Col xs={24} lg={10}>
                    <Card title="Заявки по статусам">
                        {statusEntries.length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Пока нет заявок" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {statusEntries.map(([status, count]) => (
                                    <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Tag color={statusColors[status] || 'default'}>{statusLabels[status] || status}</Tag>
                                        <Text strong>{fmt(count)}</Text>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
