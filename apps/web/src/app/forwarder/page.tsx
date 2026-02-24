'use client';

import { useEffect, useState } from 'react';
import { Row, Col, Table, Tag, Typography } from 'antd';
import {
    FileTextOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    TruckOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title } = Typography;

interface Stats {
    total: number;
    pending: number;
    assigned: number;
    completed: number;
}

const statusColors: Record<string, string> = {
    DRAFT: 'default', PENDING: 'orange', ASSIGNED: 'blue', EN_ROUTE_PICKUP: 'gold',
    AT_PICKUP: 'lime', LOADING: 'purple', IN_TRANSIT: 'cyan', AT_DELIVERY: 'lime',
    UNLOADING: 'purple', COMPLETED: 'green', CANCELLED: 'default', PROBLEM: 'red',
};

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик', PENDING: 'Ожидает', ASSIGNED: 'Назначен', EN_ROUTE_PICKUP: 'Едет на погр.',
    AT_PICKUP: 'На погр.', LOADING: 'Загрузка', IN_TRANSIT: 'В пути', AT_DELIVERY: 'На выгр.',
    UNLOADING: 'Разгрузка', COMPLETED: 'Завершён', CANCELLED: 'Отменён', PROBLEM: 'Проблема',
};

interface Order {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    customerPrice?: number;
    createdAt: string;
    pickupLocation?: { name: string; address: string; city?: string };
    deliveryPoints?: { location: { name: string; address: string; city?: string } }[];
    customer?: { name: string };
    assignedDriverName?: string;
    assignedDriverPlate?: string;
}

function extractCity(loc: { name?: string; address?: string; city?: string } | undefined): string {
    if (!loc) return '—';
    if (loc.city) return loc.city;
    if (loc.address) { const m = loc.address.match(/г\.\s*([^,]+)/); if (m?.[1]) return m[1].trim(); }
    return loc.name || '—';
}

export default function ForwarderDashboard() {
    const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, assigned: 0, completed: 0 });
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsRes, ordersRes] = await Promise.all([
                    api.get('/forwarder/stats'),
                    api.get('/forwarder/orders'),
                ]);
                setStats(statsRes.data);
                setOrders(ordersRes.data);
            } catch (error) { console.error('Failed to fetch:', error); }
            finally { setLoading(false); }
        };
        fetchData();
    }, []);

    const columns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'num', width: 130,
            render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 60,
            render: (d: string) => <span style={{ fontSize: 11, color: '#888' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>,
        },
        {
            title: 'Груз', dataIndex: 'cargoDescription', key: 'cargo', ellipsis: true, width: 120,
            render: (t: string) => <span style={{ fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Заказчик', key: 'customer', width: 110, ellipsis: true,
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{(r as any).customer?.name || '—'}</span>,
        },
        {
            title: 'Откуда', key: 'from', width: 100, ellipsis: true,
            render: (_: any, r: Order) => <span style={{ fontSize: 12, fontWeight: 500 }}>{extractCity(r.pickupLocation)}</span>,
        },
        {
            title: 'Куда', key: 'to', width: 100, ellipsis: true,
            render: (_: any, r: Order) => {
                const dp = r.deliveryPoints?.length ? r.deliveryPoints[r.deliveryPoints.length - 1] : null;
                return <span style={{ fontSize: 12, fontWeight: 500 }}>{extractCity(dp?.location)}</span>;
            },
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 100,
            render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, margin: 0, lineHeight: '18px' }}>{statusLabels[s] || s}</Tag>,
        },
        {
            title: 'Водитель', key: 'driver', width: 110, ellipsis: true,
            render: (_: any, r: Order) => {
                if (r.assignedDriverName) return <span style={{ fontSize: 12 }}>{r.assignedDriverName}</span>;
                return <span style={{ color: '#ccc' }}>—</span>;
            },
        },
        {
            title: 'Сумма ₸', dataIndex: 'customerPrice', key: 'price', width: 90, align: 'right' as const,
            render: (p: number) => p ? <span style={{ fontSize: 12, fontWeight: 600 }}>{p.toLocaleString('ru-RU')}</span> : <span style={{ color: '#ccc' }}>—</span>,
        },
    ];

    return (
        <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '8px', color: '#09090b' }}>
                    Дашборд экспедитора
                </h1>
                <p style={{ color: '#71717a', fontSize: '16px' }}>
                    Обзор текущих задач и статистика
                </p>
            </div>

            <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Всего заявок</div>
                            <FileTextOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.total}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>доступные к работе</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Ожидают назначения</div>
                            <ClockCircleOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.pending}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>требуют водителя</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">В работе</div>
                            <TruckOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.assigned}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>активные рейсы</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="premium-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div className="premium-stat-label">Завершено</div>
                            <CheckCircleOutlined style={{ color: '#71717a', fontSize: '16px' }} />
                        </div>
                        <div className="premium-stat-value">{stats.completed}</div>
                        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>выполненные заказы</div>
                    </div>
                </Col>
            </Row>

            {/* COMPACT LAST 10 ORDERS TABLE */}
            <div className="premium-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#09090b', margin: 0 }}>Последние заявки</h2>
                        <p style={{ color: '#71717a', fontSize: '12px', margin: '2px 0 0' }}>10 последних входящих заявок</p>
                    </div>
                    <span style={{ fontSize: 11, color: '#999' }}>Всего: {orders.length}</span>
                </div>
                <Table
                    columns={columns}
                    dataSource={orders.slice(0, 10)}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    size="small"
                    scroll={{ x: 900 }}
                    rowClassName={(record) => {
                        if (record.status === 'COMPLETED') return 'row-completed';
                        if (record.status === 'PROBLEM') return 'row-problem';
                        if (record.status === 'CANCELLED') return 'row-cancelled';
                        return '';
                    }}
                />
            </div>

            <style jsx global>{`
                .premium-card .ant-table-small .ant-table-thead > tr > th {
                    padding: 6px 8px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    background: #fafafa !important;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    color: #666 !important;
                    white-space: nowrap;
                }
                .premium-card .ant-table-small .ant-table-tbody > tr > td {
                    padding: 4px 8px !important;
                    font-size: 12px !important;
                    border-bottom: 1px solid #f5f5f5 !important;
                }
                .premium-card .ant-table-small .ant-table-tbody > tr:hover > td {
                    background: #e6f7ff !important;
                }
                .premium-card .ant-table-small .ant-table-tbody > tr.row-completed > td {
                    background: #f6ffed !important;
                }
                .premium-card .ant-table-small .ant-table-tbody > tr.row-problem > td {
                    background: #fff2f0 !important;
                }
                .premium-card .ant-table-small .ant-table-tbody > tr.row-cancelled > td {
                    background: #fafafa !important;
                    color: #bbb;
                    text-decoration: line-through;
                }
            `}</style>
        </div>
    );
}
