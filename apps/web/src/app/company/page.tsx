'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Row, Col, Table, Button } from 'antd';
import {
    FileTextOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    TruckOutlined,
    PlusOutlined,
    ArrowRightOutlined,
    DollarOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import StatusPill from '@/components/ui/StatusPill';
import LiveTicker, { buildOrderTickerItems } from '@/components/ui/LiveTicker';
import FeaturedOrderCard from '@/components/ui/FeaturedOrderCard';

interface Order {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    natureOfCargo?: string;
    customerPrice?: number;
    createdAt: string;
    pickupLocation?: { name: string; address: string; city?: string };
    deliveryPoints?: { location: { name: string; address: string; city?: string } }[];
    routePoints?: { pointType: string; location?: { name?: string; address?: string; city?: string } }[];
    driver?: { firstName: string; lastName: string; vehiclePlate?: string };
    forwarder?: { name: string };
    assignedDriverName?: string;
    assignedDriverPlate?: string;
}

function extractCity(loc: { name?: string; address?: string; city?: string } | undefined): string {
    if (!loc) return '—';
    if (loc.city) return loc.city;
    if (loc.address) { const m = loc.address.match(/г\.\s*([^,]+)/); if (m?.[1]) return m[1].trim(); }
    return loc.name || '—';
}

function greeting(): string {
    const h = new Date().getHours();
    if (h < 5) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
}

export default function CompanyDashboard() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0 });
    const [payrollSummary, setPayrollSummary] = useState<{ total: number; hasScheme: boolean } | null>(null);

    const isManager = user?.role === 'LOGISTICIAN';

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const mine = isManager ? '&mine=true' : '';
                const response = await api.get(`/company/orders?limit=100${mine}`);
                const rawData = response.data;
                const ordersList = Array.isArray(rawData) ? rawData : (rawData?.data || []);
                setOrders(ordersList);
                setStats({
                    total: Array.isArray(rawData) ? rawData.length : (rawData?.total || 0),
                    pending: ordersList.filter((o: Order) => o.status === 'PENDING').length,
                    inProgress: ordersList.filter((o: Order) => ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'].includes(o.status)).length,
                    completed: ordersList.filter((o: Order) => o.status === 'COMPLETED').length,
                });
            } catch (error) { console.error('Failed to fetch orders:', error); }
            finally { setLoading(false); }
        };
        fetchOrders();
    }, [isManager]);

    useEffect(() => {
        if (isManager) {
            api.get('/payroll/my/summary')
                .then(res => setPayrollSummary(res.data))
                .catch(err => console.error('Failed to fetch payroll summary', err));
        }
    }, [isManager]);

    const metrics = [
        { label: isManager ? 'Мои заявки' : 'Всего заявок', value: stats.total, hint: 'за всё время', icon: <FileTextOutlined />, bg: '#e8f0fe', fg: '#1d4ed8' },
        { label: 'Ожидают', value: stats.pending, hint: 'требуют внимания', icon: <ClockCircleOutlined />, bg: '#fff4e5', fg: '#b45309' },
        { label: 'В пути', value: stats.inProgress, hint: 'активные перевозки', icon: <TruckOutlined />, bg: '#e0f2fe', fg: '#0369a1' },
        { label: 'Завершено', value: stats.completed, hint: 'успешные доставки', icon: <CheckCircleOutlined />, bg: '#e7f8ef', fg: '#15803d' },
    ];

    if (isManager && payrollSummary?.hasScheme) {
        metrics.push({
            label: 'Заработано в этом месяце',
            value: `${payrollSummary.total.toLocaleString('ru-RU')} ₸`,
            hint: 'перейти к деталям',
            icon: <DollarOutlined />,
            bg: '#fdf2f8',
            fg: '#db2777',
            onClick: () => router.push('/company/my-salary'),
        } as any);
    }

    const columns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'num', width: 130,
            render: (t: string) => <span className="lc-ordernum">{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 60,
            render: (d: string) => <span style={{ fontSize: 11, color: '#888' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>,
        },
        {
            title: 'Груз', key: 'cargo', ellipsis: true, width: 130,
            render: (_: any, r: Order) => {
                const parts = [];
                if (r.natureOfCargo) parts.push(r.natureOfCargo);
                if (r.cargoDescription) parts.push(r.cargoDescription);
                return <span style={{ fontSize: 12 }}>{parts.join(' / ') || '—'}</span>;
            }
        },
        {
            title: 'Маршрут', key: 'route', width: 180, ellipsis: true,
            render: (_: any, r: Order) => {
                const pickup = r.routePoints?.find(p => p.pointType === 'PICKUP')?.location || r.pickupLocation;
                const deliveries = r.routePoints?.filter(p => p.pointType === 'DELIVERY') || [];
                const lastDelivery = deliveries.length ? deliveries[deliveries.length - 1].location : r.deliveryPoints?.[r.deliveryPoints.length - 1]?.location;
                return (
                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                        {extractCity(pickup)}
                        <ArrowRightOutlined style={{ fontSize: 10, color: '#94a3b8', margin: '0 6px' }} />
                        {extractCity(lastDelivery)}
                    </span>
                );
            },
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 110,
            render: (s: string) => <StatusPill status={s} />,
        },
        {
            title: 'Водитель', key: 'driver', width: 130, ellipsis: true,
            render: (_: any, r: Order) => {
                if (r.assignedDriverName) return (
                    <span style={{ fontSize: 12 }}>{r.assignedDriverName} <span style={{ color: '#999', fontFamily: 'monospace', fontSize: 11 }}>{r.assignedDriverPlate || ''}</span></span>
                );
                if (r.driver) return <span style={{ fontSize: 12 }}>{r.driver.firstName} {r.driver.lastName}</span>;
                return <span style={{ color: '#ccc' }}>—</span>;
            },
        },
        {
            title: 'Сумма ₸', dataIndex: 'customerPrice', key: 'price', width: 100, align: 'right' as const,
            render: (p: number) => p ? <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.toLocaleString('ru-RU')}</span> : <span style={{ color: '#ccc' }}>—</span>,
        },
    ];

    const featured = orders.find(o => !['COMPLETED', 'CANCELLED', 'DRAFT'].includes(o.status)) || orders[0] || null;
    const tickerItems = buildOrderTickerItems(orders);

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">LogiCore — обзор</div>
                    <h1 className="lc2-title">{greeting()}{user?.firstName ? `, ${user.firstName}` : ''}</h1>
                    <p style={{ color: '#8a91a0', fontSize: 13, margin: '6px 0 14px' }}>
                        {isManager ? 'Ваши заявки и активность' : 'Сводка по всем заявкам компании'}
                    </p>
                    <Button type="primary" icon={<PlusOutlined />} className="lc-cta" onClick={() => router.push('/company/orders/create')}>
                        Создать заявку
                    </Button>
                </div>
                <div className="lc2-metrics">
                    {metrics.map((m: any, i) => (
                        <div
                            key={i}
                            className="lc2-metric"
                            onClick={m.onClick}
                            style={m.onClick ? { cursor: 'pointer' } : undefined}
                        >
                            <div className="lc2-mic" style={{ background: m.bg, color: m.fg }}>{m.icon}</div>
                            <div>
                                <div className="lc2-mlabel">{m.label}</div>
                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
                                <div className="lc2-msub">{m.hint}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ===== ТИКЕР ===== */}
            <LiveTicker items={tickerItems} />

            {/* ===== FEATURED: активная заявка ===== */}
            <FeaturedOrderCard order={featured} onOpen={(id) => router.push(`/company/orders/${id}`)} />

            {/* Recent orders */}
            <div className="lc-card">
                <div style={{ padding: '16px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#0b0d12', letterSpacing: '-0.01em' }}>Последние заявки</div>
                        <div style={{ color: '#8a91a0', fontSize: 12, marginTop: 2 }}>
                            {isManager ? '10 ваших последних заявок' : '10 последних заявок компании'}
                        </div>
                    </div>
                    <span className="lc-link" onClick={() => router.push('/company/orders')}>
                        Все заявки <ArrowRightOutlined style={{ fontSize: 11 }} />
                    </span>
                </div>
                <Table
                    columns={columns}
                    dataSource={orders.slice(0, 10)}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    size="small"
                    scroll={{ x: 900 }}
                    onRow={(record) => ({
                        onClick: () => router.push(`/company/orders/${record.id}`),
                    })}
                />
            </div>
        </div>
    );
}
