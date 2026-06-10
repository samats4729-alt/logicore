'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Typography, Card, Row, Col, Statistic, Table, Tag, Space, Empty, Spin, Descriptions } from 'antd';
import {
    ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
    CheckCircleOutlined, CloseCircleOutlined,
    ExclamationCircleOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusLabels: Record<string, string> = {
    PENDING: 'Ожидает', ASSIGNED: 'Назначена', EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке', LOADING: 'Загрузка', IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке', UNLOADING: 'Разгрузка', COMPLETED: 'Завершена', PROBLEM: 'Проблема',
};

const statusColors: Record<string, string> = {
    PENDING: 'orange', ASSIGNED: 'blue', EN_ROUTE_PICKUP: 'cyan',
    AT_PICKUP: 'geekblue', LOADING: 'purple', IN_TRANSIT: 'processing',
    AT_DELIVERY: 'lime', UNLOADING: 'gold', COMPLETED: 'green', PROBLEM: 'red',
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
            title: '№', dataIndex: 'orderNumber', key: 'num', width: 120,
            sorter: (a: any, b: any) => a.orderNumber.localeCompare(b.orderNumber),
            render: (t: string) => <span style={{ fontWeight: 600, fontSize: 13 }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 100,
            sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (d: string) => <span style={{ fontSize: 12, color: '#666' }}>{dayjs(d).format('DD.MM.YY')}</span>,
        },
        {
            title: 'Маршрут', key: 'route', width: 220, ellipsis: true,
            render: (_: any, r: any) => <span style={{ fontSize: 13 }}>{getRoute(r)}</span>,
        },
        {
            title: 'Груз', dataIndex: 'cargoDescription', key: 'cargo', width: 160, ellipsis: true,
            render: (t: string) => <span style={{ fontSize: 13 }}>{t || '—'}</span>,
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 120,
            render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 12 }}>{statusLabels[s] || s}</Tag>,
        },
        {
            title: 'Направление', key: 'direction', width: 140,
            render: (_: any, r: any) => (
                <Tag color={r.direction === 'theyOwe' ? 'green' : 'volcano'} style={{ fontSize: 12 }}>
                    {r.direction === 'theyOwe' ? '↓ Вам должны' : '↑ Вы должны'}
                </Tag>
            ),
        },
        {
            title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' as const,
            sorter: (a: any, b: any) => a.amount - b.amount,
            render: (v: number) => v ? <span style={{ fontSize: 13, fontWeight: 600 }}>{fmt(v)}</span> : <span style={{ color: '#ccc' }}>—</span>,
        },
        {
            title: 'Оплата', key: 'paid', width: 100, align: 'center' as const,
            render: (_: any, r: any) => (
                <Space size={4}>
                    {r.isPaid
                        ? <Tag color="green" style={{ fontSize: 12, margin: 0 }}><CheckCircleOutlined /> Да</Tag>
                        : <Tag color="red" style={{ fontSize: 12, margin: 0 }}><CloseCircleOutlined /> Нет</Tag>
                    }
                </Space>
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f5f5f5',
            }}>
                <Spin size="large" />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f5f5f5',
            }}>
                <Card style={{ maxWidth: 480, textAlign: 'center', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
                    <ExclamationCircleOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 16 }} />
                    <Title level={4} style={{ margin: '0 0 8px' }}>Ссылка недействительна</Title>
                    <Text type="secondary" style={{ fontSize: 15 }}>{error}</Text>
                </Card>
            </div>
        );
    }

    if (!data || !data.counterparty) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                height: '100vh', background: '#f5f5f5',
            }}>
                <Card style={{ maxWidth: 480, textAlign: 'center', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
                    <Empty description="Нет данных по взаиморасчётам" />
                </Card>
            </div>
        );
    }

    const cp = data.counterparty;
    const totals = data.totals;

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f0f5ff 0%, #f5f5f5 100%)' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #1677ff 0%, #4096ff 100%)',
                padding: '32px 24px',
                color: '#fff',
            }}>
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: 'rgba(255,255,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 20, fontWeight: 800,
                        }}>
                            L
                        </div>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>LogiCore</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>Система управления логистикой</div>
                        </div>
                    </div>
                    <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 13, opacity: 0.85 }}>Отчёт от компании</div>
                        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{data.senderCompany}</div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 13, opacity: 0.85 }}>для</div>
                        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{data.counterpartyName}</div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' }}>
                {/* Summary Cards */}
                <Row gutter={16} style={{ marginBottom: 24 }}>
                    <Col xs={24} sm={8}>
                        <Card size="small" style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }} styles={{ body: { padding: '16px 20px' } }}>
                            <Statistic
                                title={<span style={{ fontSize: 12, color: '#389e0d' }}>Вам должны</span>}
                                value={totals.unpaidTheyOweUs}
                                prefix={<ArrowUpOutlined />}
                                valueStyle={{ fontSize: 24, color: '#389e0d', fontWeight: 700 }}
                                suffix="₸"
                            />
                            {totals.theyOweUs > 0 && (
                                <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                                    всего: {fmt(totals.theyOweUs)} ₸
                                </div>
                            )}
                        </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Card size="small" style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }} styles={{ body: { padding: '16px 20px' } }}>
                            <Statistic
                                title={<span style={{ fontSize: 12, color: '#cf1322' }}>Вы должны</span>}
                                value={totals.unpaidWeOweThem}
                                prefix={<ArrowDownOutlined />}
                                valueStyle={{ fontSize: 24, color: '#cf1322', fontWeight: 700 }}
                                suffix="₸"
                            />
                            {totals.weOweThem > 0 && (
                                <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                                    всего: {fmt(totals.weOweThem)} ₸
                                </div>
                            )}
                        </Card>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Card size="small" style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }} styles={{ body: { padding: '16px 20px' } }}>
                            <Statistic
                                title={<span style={{ fontSize: 12, color: '#1677ff' }}>Баланс</span>}
                                value={totals.balance}
                                prefix={<SwapOutlined />}
                                valueStyle={{ fontSize: 24, color: totals.balance >= 0 ? '#389e0d' : '#cf1322', fontWeight: 700 }}
                                suffix="₸"
                            />
                            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                                {totals.totalOrders} заяв{totals.totalOrders === 1 ? 'ка' : totals.totalOrders < 5 ? 'ки' : 'ок'}
                            </div>
                        </Card>
                    </Col>
                </Row>

                {/* Orders Table */}
                <Card
                    title={<span style={{ fontSize: 16, fontWeight: 600 }}>📋 Сделки</span>}
                    size="small"
                    style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
                >
                    {/* Stats bar */}
                    <div style={{
                        display: 'flex', gap: 24, padding: '8px 0 16px', flexWrap: 'wrap',
                        borderBottom: '1px solid #f0f0f0', marginBottom: 12,
                    }}>
                        <div style={{ fontSize: 13 }}>
                            <span style={{ color: '#8c8c8c' }}>Вам должны всего: </span>
                            <span style={{ fontWeight: 600, color: '#389e0d' }}>{fmt(cp.theyOweUs)} ₸</span>
                            <span style={{ color: '#8c8c8c' }}> (оплачено: {fmt(cp.theyOweUsPaid)} ₸)</span>
                        </div>
                        <div style={{ fontSize: 13 }}>
                            <span style={{ color: '#8c8c8c' }}>Вы должны всего: </span>
                            <span style={{ fontWeight: 600, color: '#cf1322' }}>{fmt(cp.weOweThem)} ₸</span>
                            <span style={{ color: '#8c8c8c' }}> (оплачено: {fmt(cp.weOweThemPaid)} ₸)</span>
                        </div>
                    </div>

                    <Table
                        columns={columns}
                        dataSource={cp.orders}
                        rowKey="id"
                        size="small"
                        pagination={cp.orders.length > 20 ? { pageSize: 20, size: 'small', showTotal: (t: number) => `Всего: ${t}` } : false}
                        scroll={{ x: 1000 }}
                        rowClassName={(record: any) => {
                            if (record.status === 'COMPLETED') return 'row-completed';
                            if (record.status === 'PROBLEM') return 'row-problem';
                            return '';
                        }}
                        summary={() => {
                            if (cp.orders.length < 2) return null;
                            const totalAmount = cp.orders.reduce((s: number, o: any) => s + o.amount, 0);
                            const paidAmount = cp.orders.filter((o: any) => o.isPaid).reduce((s: number, o: any) => s + o.amount, 0);
                            return (
                                <Table.Summary>
                                    <Table.Summary.Row>
                                        <Table.Summary.Cell index={0} colSpan={6}>
                                            <Text strong style={{ fontSize: 13 }}>ИТОГО</Text>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={6} align="right">
                                            <Text strong style={{ fontSize: 13 }}>{fmt(totalAmount)} ₸</Text>
                                        </Table.Summary.Cell>
                                        <Table.Summary.Cell index={7} align="center">
                                            <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{fmt(paidAmount)} опл.</Text>
                                        </Table.Summary.Cell>
                                    </Table.Summary.Row>
                                </Table.Summary>
                            );
                        }}
                    />
                </Card>

                {/* Footer */}
                <div style={{
                    textAlign: 'center', marginTop: 32, padding: '16px 0',
                    color: '#bfbfbf', fontSize: 12,
                }}>
                    <ClockCircleOutlined style={{ marginRight: 6 }} />
                    Отчёт сформирован {dayjs(data.createdAt).format('DD.MM.YYYY в HH:mm')} · Ссылка действительна {data.expiresIn}
                </div>
            </div>

            {/* Table styles */}
            <style jsx global>{`
                .ant-table-small .ant-table-thead > tr > th {
                    padding: 8px 12px !important;
                    font-size: 12px !important;
                    font-weight: 600 !important;
                    background: #fafafa !important;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    color: #666 !important;
                }
                .ant-table-small .ant-table-tbody > tr > td {
                    padding: 6px 12px !important;
                    font-size: 13px !important;
                    border-bottom: 1px solid #f5f5f5 !important;
                }
                .ant-table-small .ant-table-tbody > tr:hover > td {
                    background: #e6f7ff !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-completed > td {
                    background: #f6ffed !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-problem > td {
                    background: #fff2f0 !important;
                }
            `}</style>
        </div>
    );
}
