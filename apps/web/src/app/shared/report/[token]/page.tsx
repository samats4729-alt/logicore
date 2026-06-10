'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Typography, Table, Tag, Space, Empty, Spin, Row, Col } from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
    FileTextOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает',
    ASSIGNED: 'Назначен',
    EN_ROUTE_PICKUP: 'Едет на погр.',
    AT_PICKUP: 'На погрузке',
    LOADING: 'Загрузка',
    IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке',
    UNLOADING: 'Разгрузка',
    COMPLETED: 'Завершён',
    PROBLEM: 'Проблема',
    CANCELLED: 'Отменён',
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
    PROBLEM: 'red',
    CANCELLED: 'red',
};

const fmt = (n: number) => n.toLocaleString('ru-RU');

function getRoute(order: any): string {
    const pts = order.routePoints || [];
    const pickup = pts.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
    const delivery = pts.find((p: any) => p.pointType === 'DELIVERY');
    const from = pickup?.location?.city || pickup?.location?.address || '—';
    const to = delivery?.location?.city || delivery?.location?.address || '—';
    return `${from} → ${to}`;
}

export default function SharedReportPage() {
    const params = useParams();
    const token = params.token as string;
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await axios.get(`${API_URL}/public/accounting/report/${token}`);
                setData(res.data);
            } catch (err: any) {
                if (err.response?.status === 404) {
                    setError('Ссылка недействительна или срок действия истёк');
                } else {
                    setError('Ошибка загрузки отчёта');
                }
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const columns = [
        {
            title: '№ Заявки',
            dataIndex: 'orderNumber',
            key: 'num',
            width: 120,
            sorter: (a: any, b: any) => a.orderNumber.localeCompare(b.orderNumber),
            render: (t: string) => <span style={{ fontWeight: 600, color: '#09090b' }}>{t}</span>,
        },
        {
            title: 'Дата',
            dataIndex: 'createdAt',
            key: 'date',
            width: 110,
            sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (d: string) => <span style={{ color: '#71717a' }}>{dayjs(d).format('DD.MM.YYYY')}</span>,
        },
        {
            title: 'Маршрут',
            key: 'route',
            width: 240,
            ellipsis: true,
            render: (_: any, r: any) => <span style={{ color: '#09090b' }}>{getRoute(r)}</span>,
        },
        {
            title: 'Груз',
            dataIndex: 'cargoDescription',
            key: 'cargo',
            width: 180,
            ellipsis: true,
            render: (t: string) => <span style={{ color: '#71717a' }}>{t || '—'}</span>,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (s: string) => (
                <Tag color={statusColors[s] || 'default'} style={{ borderRadius: 6, fontWeight: 500 }}>
                    {statusLabels[s] || s}
                </Tag>
            ),
        },
        {
            title: 'Тип сделки',
            key: 'direction',
            width: 140,
            render: (_: any, r: any) => (
                <span style={{
                    fontWeight: 500,
                    color: r.direction === 'theyOwe' ? '#16a34a' : '#dc2626',
                }}>
                    {r.direction === 'theyOwe' ? 'Дебиторская' : 'Кредиторская'}
                </span>
            ),
        },
        {
            title: 'Сумма, ₸',
            dataIndex: 'amount',
            key: 'amount',
            width: 140,
            align: 'right' as const,
            sorter: (a: any, b: any) => a.amount - b.amount,
            render: (v: number) => v ? <span style={{ fontWeight: 600, color: '#09090b' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>—</span>,
        },
        {
            title: 'Оплата',
            key: 'paid',
            width: 100,
            align: 'center' as const,
            render: (_: any, r: any) => (
                r.isPaid
                    ? <span style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}><CheckCircleOutlined /> Да</span>
                    : <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}><CloseCircleOutlined /> Нет</span>
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f8f8f8',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16, color: '#71717a', fontSize: 14 }}>
                        Загрузка отчёта...
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f8f8f8',
            }}>
                <div className="premium-card" style={{
                    maxWidth: 420, textAlign: 'center', padding: '48px 40px',
                }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
                        background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ExclamationCircleOutlined style={{ fontSize: 24, color: '#d97706' }} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#09090b', marginBottom: 8 }}>
                        Ссылка недействительна
                    </div>
                    <div style={{ fontSize: 14, color: '#71717a', lineHeight: 1.6 }}>
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    if (!data || !data.counterparty) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f8f8f8',
            }}>
                <div className="premium-card" style={{
                    maxWidth: 420, textAlign: 'center', padding: '48px 40px',
                }}>
                    <Empty description={<span style={{ color: '#71717a' }}>Нет данных по взаиморасчётам</span>} />
                </div>
            </div>
        );
    }

    const cp = data.counterparty;
    const totals = data.totals;

    return (
        <div style={{ minHeight: '100vh', background: '#f8f8f8', display: 'flex', flexDirection: 'column' }}>
            {/* Header / Navbar style matches the platform */}
            <div style={{ background: '#ffffff', borderBottom: '1px solid #e4e4e7', padding: '16px 24px', zIndex: 10 }}>
                <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 32, height: 32, background: '#09090b', borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>L</span>
                        </div>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#09090b', letterSpacing: '-0.02em' }}>
                            LogiCore
                        </span>
                    </div>
                    <Tag color="blue" style={{ margin: 0, borderRadius: 6, fontWeight: 500 }}>
                        Публичный отчёт
                    </Tag>
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{ flex: 1, maxWidth: 1200, width: '100%', margin: '0 auto', padding: '32px 24px 64px' }}>
                
                {/* Title Section */}
                <div style={{ marginBottom: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#71717a', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <FileTextOutlined /> Отчёт по взаиморасчётам
                    </div>
                    <Title level={2} style={{ margin: '8px 0 4px', fontWeight: 700, color: '#09090b', letterSpacing: '-0.02em' }}>
                        {data.senderCompany}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 14 }}>
                        для контрагента: <Text strong style={{ color: '#09090b' }}>{data.counterpartyName}</Text>
                    </Text>
                </div>

                {/* Summary Cards matching Platform Premium-Card */}
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col xs={24} sm={8}>
                        <div className="premium-card" style={{ padding: '20px 24px' }}>
                            <div className="premium-stat-label">Дебиторская задолженность</div>
                            <div className="premium-stat-value">
                                {fmt(totals.unpaidTheyOweUs)} <span style={{ fontSize: 16, fontWeight: 500, color: '#71717a' }}>₸</span>
                            </div>
                            {totals.theyOweUs > 0 && (
                                <div style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>
                                    Всего начислено: {fmt(totals.theyOweUs)} ₸
                                </div>
                            )}
                        </div>
                    </Col>
                    <Col xs={24} sm={8}>
                        <div className="premium-card" style={{ padding: '20px 24px' }}>
                            <div className="premium-stat-label">Кредиторская задолженность</div>
                            <div className="premium-stat-value" style={{ color: totals.unpaidWeOweThem > 0 ? '#dc2626' : '#09090b' }}>
                                {fmt(totals.unpaidWeOweThem)} <span style={{ fontSize: 16, fontWeight: 500, color: '#71717a' }}>₸</span>
                            </div>
                            {totals.weOweThem > 0 && (
                                <div style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>
                                    Всего начислено: {fmt(totals.weOweThem)} ₸
                                </div>
                            )}
                        </div>
                    </Col>
                    <Col xs={24} sm={8}>
                        <div className="premium-card" style={{ padding: '20px 24px' }}>
                            <div className="premium-stat-label">Текущее сальдо</div>
                            <div className="premium-stat-value" style={{ color: totals.balance >= 0 ? '#1677ff' : '#dc2626' }}>
                                {totals.balance >= 0 ? '+' : ''}{fmt(totals.balance)} <span style={{ fontSize: 16, fontWeight: 500, color: '#71717a' }}>₸</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>
                                Всего сделок: {totals.totalOrders}
                            </div>
                        </div>
                    </Col>
                </Row>

                {/* Orders Table Container */}
                <div className="premium-card" style={{ padding: 24, background: '#ffffff' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 20,
                        flexWrap: 'wrap',
                        gap: 12
                    }}>
                        <Title level={4} style={{ margin: 0, fontWeight: 700, fontSize: 16, color: '#09090b' }}>
                            Реестр сделок
                        </Title>
                        <Space size={12} wrap>
                            <Tag color="success" style={{ borderRadius: 6, fontWeight: 500 }}>
                                Дебиторская: {fmt(cp.theyOweUs)} ₸
                            </Tag>
                            <Tag color="error" style={{ borderRadius: 6, fontWeight: 500 }}>
                                Кредиторская: {fmt(cp.weOweThem)} ₸
                            </Tag>
                        </Space>
                    </div>

                    <Table
                        columns={columns}
                        dataSource={cp.orders}
                        rowKey="id"
                        size="middle"
                        pagination={cp.orders.length > 20 ? { pageSize: 20, size: 'small', showTotal: (t: number) => `Всего: ${t}` } : false}
                        scroll={{ x: 1000 }}
                        summary={() => {
                            if (cp.orders.length < 2) return null;
                            const totalAmount = cp.orders.reduce((s: number, o: any) => s + o.amount, 0);
                            const paidAmount = cp.orders.filter((o: any) => o.isPaid).reduce((s: number, o: any) => s + o.amount, 0);
                            return (
                                <Table.Summary>
                                    <Table.Summary.Row style={{ background: '#fafafa' }}>
                                        <Table.Summary.Cell index={0} colSpan={6}>
                                            <span style={{ fontWeight: 600, color: '#09090b' }}>Итого по отчёту</span>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={6} align="right">
                                            <span style={{ fontWeight: 700, color: '#09090b' }}>{fmt(totalAmount)} ₸</span>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={7} align="center">
                                            <span style={{ color: '#71717a', fontSize: 12 }}>{fmt(paidAmount)} опл.</span>
                                        </Table.Summary.Cell>
                                    </Table.Summary.Row>
                                </Table.Summary>
                            );
                        }}
                    />
                </div>

                {/* Footer Section */}
                <div style={{ textAlign: 'center', marginTop: 40, padding: '24px 0 0', borderTop: '1px solid #e4e4e7' }}>
                    <div style={{ color: '#71717a', fontSize: 12, lineHeight: 1.8 }}>
                        Отчёт сформирован {dayjs(data.createdAt).format('DD.MM.YYYY в HH:mm')}
                    </div>
                    <div style={{ color: '#a1a1aa', fontSize: 12, marginTop: 4 }}>
                        Срок действия ссылки: {data.expiresIn}
                    </div>
                    <div style={{ color: '#71717a', fontSize: 12, fontWeight: 600, marginTop: 16, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        LogiCore
                    </div>
                </div>

            </div>
        </div>
    );
}
