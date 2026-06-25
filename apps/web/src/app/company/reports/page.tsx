'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Table, Card, Statistic, Row, Col, Button, Space, Typography, DatePicker, Tag, Tabs, Spin, Alert, Divider, theme } from 'antd';
import { PrinterOutlined, ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface DriverReportEntry {
    id: string;
    name: string;
    vehicle: string;
    orders: number;
    completed: number;
    revenue: number;
    margin: number;
}

export default function ReportsPage() {
    const { token } = theme.useToken();
    const router = useRouter();

    const [reportType, setReportType] = useState<'pnl' | 'counterparties' | 'profitability' | 'drivers' | 'summary'>('pnl');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
        dayjs().subtract(90, 'day'), dayjs(),
    ]);

    const [orders, setOrders] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<DriverReportEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);

        const results = await Promise.allSettled([
            api.get('/company/orders'),
            api.get('/accounting/payments'),
            api.get('/users/drivers'),
        ]);

        // Process orders
        if (results[0].status === 'fulfilled') {
            const rawData = results[0].value.data;
            const ordersList = Array.isArray(rawData) ? rawData : (rawData?.data || []);
            setOrders(ordersList);
        } else {
            setOrders([]);
            setError(prev => prev ? `${prev}; Не удалось загрузить заявки` : 'Не удалось загрузить заявки');
        }

        // Process payments
        if (results[1].status === 'fulfilled') {
            setPayments(results[1].value.data || []);
        } else {
            setPayments([]);
            setError(prev => prev ? `${prev}; Не удалось загрузить платежи` : 'Не удалось загрузить платежи');
        }

        // Process drivers
        if (results[2].status === 'fulfilled') {
            const driverList = results[2].value.data || [];
            setDrivers(driverList.map((d: any) => ({
                id: d.id,
                name: `${d.lastName} ${d.firstName}`,
                vehicle: d.vehiclePlate || '—',
                orders: 0,
                completed: 0,
                revenue: 0,
                margin: 0,
            })));
        } else {
            setDrivers([]);
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const fmt = (n: number) => n.toLocaleString('ru-RU');

    // Filter by dates
    const filteredPayments = useMemo(() => payments.filter(p => {
        if (!dateRange) return true;
        const d = dayjs(p.date);
        return d.isAfter(dateRange[0].startOf('day')) && d.isBefore(dateRange[1].endOf('day'));
    }), [payments, dateRange]);

    const filteredOrders = useMemo(() => orders.filter(o => {
        if (!dateRange) return true;
        const d = dayjs(o.createdAt);
        return d.isAfter(dateRange[0].startOf('day')) && d.isBefore(dateRange[1].endOf('day'));
    }), [orders, dateRange]);

    // KPI Summary
    const totalIncome = filteredPayments.filter(p => p.direction === 'IN').reduce((s, p) => s + p.amount, 0);
    const totalExpense = filteredPayments.filter(p => p.direction === 'OUT').reduce((s, p) => s + p.amount, 0);

    // Unique counterparties
    const uniqueCounterparties = useMemo(() => {
        const names = new Set<string>();
        filteredPayments.forEach(p => {
            const name = p.counterparty?.name;
            if (name) names.add(name);
        });
        return names.size;
    }, [filteredPayments]);

    // P&L by months
    const pnlData = useMemo(() => {
        const map = new Map<string, { income: number; expense: number }>();
        filteredPayments.forEach(p => {
            const key = dayjs(p.date).format('MMM YYYY');
            const e = map.get(key) || { income: 0, expense: 0 };
            if (p.direction === 'IN') e.income += p.amount;
            else e.expense += p.amount;
            map.set(key, e);
        });
        return Array.from(map.entries())
            .map(([month, val]) => ({ key: month, month, ...val, margin: val.income - val.expense }))
            .sort((a, b) => a.month.localeCompare(b.month));
    }, [filteredPayments]);

    // Counterparties Report
    const cpData = useMemo(() => {
        const map = new Map<string, { income: number; expense: number; count: number }>();
        filteredPayments.forEach(p => {
            const name = p.counterparty?.name || 'Без названия';
            const e = map.get(name) || { income: 0, expense: 0, count: 0 };
            if (p.direction === 'IN') e.income += p.amount;
            else e.expense += p.amount;
            e.count++;
            map.set(name, e);
        });
        return Array.from(map.entries())
            .map(([name, val]) => ({ key: name, name, ...val, balance: val.income - val.expense }));
    }, [filteredPayments]);

    // Order Profitability Report
    const profitData = useMemo(() => filteredOrders
        .filter(o => o.status !== 'CANCELLED')
        .map(o => {
            const rev = o.customerPrice || 0;
            const cost = o.executorCost ?? o.subForwarderPrice ?? o.driverCost ?? 0;
            const route = o.routePoints?.map((p: any) => p.location?.city || p.location?.name).filter(Boolean).join(' → ') || '—';
            return {
                key: o.id,
                orderNumber: o.orderNumber,
                route,
                revenue: rev,
                cost: cost,
                margin: rev - cost,
                pct: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0,
            };
        }), [filteredOrders]);

    // Drivers Report
    const driverData = useMemo(() => {
        const map = new Map<string, DriverReportEntry>();
        drivers.forEach(d => map.set(d.id, { ...d, orders: 0, completed: 0, revenue: 0, margin: 0 }));

        filteredOrders.forEach(o => {
            const dId = o.driverId || o.driver?.id;
            if (!dId) return;

            if (!map.has(dId)) {
                map.set(dId, {
                    id: dId,
                    name: o.assignedDriverName || (o.driver ? `${o.driver.lastName} ${o.driver.firstName}` : 'Неизвестный'),
                    vehicle: o.assignedDriverPlate || o.driver?.vehiclePlate || '—',
                    orders: 0, completed: 0, revenue: 0, margin: 0,
                });
            }

            const e = map.get(dId)!;
            e.orders++;
            const rev = o.customerPrice || 0;
            const cost = o.executorCost ?? o.subForwarderPrice ?? o.driverCost ?? 0;
            e.revenue += rev;
            e.margin += (rev - cost);
            if (o.status === 'COMPLETED') e.completed++;
        });

        return Array.from(map.values()).filter(d => d.orders > 0);
    }, [filteredOrders, drivers]);


    if (loading && orders.length === 0 && payments.length === 0) {
        return (
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                    <Spin size="large" tip="Загрузка данных..." />
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {error && (
                <Alert
                    type="warning"
                    message="Часть данных не загружена"
                    description={error}
                    action={<Button size="small" icon={<ReloadOutlined />} onClick={fetchAll}>Повторить</Button>}
                    style={{ marginBottom: 16 }}
                    closable
                />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company')} style={{ padding: '4px 8px' }} />
                    <div>
                        <Title level={2} style={{ margin: 0, fontWeight: 600 }}>
                            Конструктор отчётов
                        </Title>
                        <Text type="secondary" style={{ fontSize: '16px' }}>
                            Аналитика по периодам, контрагентам, водителям и рентабельности
                        </Text>
                    </div>
                </div>
                <Space wrap>
                    <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchAll}>Обновить</Button>
                    <RangePicker value={dateRange as any} onChange={(d) => setDateRange(d as any)} format="DD.MM.YYYY" allowClear={false} style={{ boxShadow: `0 1px 3px ${token.colorBorderSecondary}`, borderRadius: 8 }} />
                    <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Печать</Button>
                </Space>
            </div>

            {/* KPI Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} md={6}>
                    <Card size="small" className="premium-card" bordered={false}>
                        <Statistic title="Доходы" value={totalIncome} suffix="₸" valueStyle={{ color: '#52c41a', fontSize: 18, fontWeight: 700 }} formatter={(v) => fmt(v as number)} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small" className="premium-card" bordered={false}>
                        <Statistic title="Расходы" value={totalExpense} suffix="₸" valueStyle={{ color: '#ff4d4f', fontSize: 18, fontWeight: 700 }} formatter={(v) => fmt(v as number)} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small" className="premium-card" bordered={false}>
                        <Statistic title="Маржа" value={totalIncome - totalExpense} suffix="₸" valueStyle={{ color: totalIncome >= totalExpense ? '#52c41a' : '#ff4d4f', fontSize: 18, fontWeight: 700 }} formatter={(v) => fmt(v as number)} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small" className="premium-card" bordered={false}>
                        <Statistic title="Рентабельность" value={totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0} suffix="%" valueStyle={{ color: totalIncome >= totalExpense ? '#52c41a' : '#ff4d4f', fontSize: 18, fontWeight: 700 }} />
                    </Card>
                </Col>
            </Row>

            <Tabs activeKey={reportType} onChange={(k) => setReportType(k as any)} style={{ marginBottom: 20 }}>
                <Tabs.TabPane tab="P&L" key="pnl" />
                <Tabs.TabPane tab="Контрагенты" key="counterparties" />
                <Tabs.TabPane tab="Рентабельность" key="profitability" />
                <Tabs.TabPane tab="Водители" key="drivers" />
                <Tabs.TabPane tab="Сводка" key="summary" />
            </Tabs>

            <Card className="premium-card" bordered={false} styles={{ body: { padding: 12 } }}>
                {reportType === 'pnl' && (
                    <Table 
                        columns={[
                            { title: 'Период', dataIndex: 'month', key: 'month', render: (v: string) => <Text style={{ fontSize: 13, fontWeight: 500 }}>{v}</Text> },
                            { title: 'Доходы', dataIndex: 'income', key: 'inc', align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Расходы', dataIndex: 'expense', key: 'exp', align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Маржа', dataIndex: 'margin', key: 'margin', align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{v >= 0 ? '+' : ''}{fmt(v)} ₸</span> },
                        ]} 
                        dataSource={pnlData} 
                        size="small" 
                        pagination={{ pageSize: 50 }} 
                    />
                )}

                {reportType === 'counterparties' && (
                    <Table 
                        columns={[
                            { title: 'Контрагент', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ fontSize: 13, fontWeight: 500 }}>{v}</Text> },
                            { title: 'Поступления', dataIndex: 'income', key: 'inc', align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>+{fmt(v)} ₸</span> },
                            { title: 'Выплаты', dataIndex: 'expense', key: 'exp', align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13 }}>-{fmt(v)} ₸</span> },
                            { title: 'Сальдо', dataIndex: 'balance', key: 'bal', align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{v >= 0 ? '+' : ''}{fmt(v)} ₸</span> },
                        ]} 
                        dataSource={cpData} 
                        size="small" 
                        pagination={{ pageSize: 50 }} 
                    />
                )}

                {reportType === 'profitability' && (
                    <Table 
                        columns={[
                            { title: 'Заявка', dataIndex: 'orderNumber', key: 'num', render: (v: string) => <span style={{ fontWeight: 700, color: '#1677ff', fontSize: 13 }}>{v}</span> },
                            { title: 'Маршрут', dataIndex: 'route', key: 'route', ellipsis: true, render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
                            { title: 'Ставка', dataIndex: 'revenue', key: 'rev', align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Затраты', dataIndex: 'cost', key: 'cost', align: 'right' as const, render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Маржа', dataIndex: 'margin', key: 'margin', align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{v >= 0 ? '+' : ''}{fmt(v)} ₸</span> },
                            { title: '%', dataIndex: 'pct', key: 'pct', width: 70, align: 'center' as const, render: (v: number) => <Tag color={v >= 0 ? 'green' : 'red'} style={{ fontSize: 11 }}>{v}%</Tag> },
                        ]} 
                        dataSource={profitData} 
                        size="small" 
                        pagination={{ pageSize: 50 }} 
                    />
                )}

                {reportType === 'drivers' && (
                    <Table 
                        columns={[
                            { title: 'Водитель', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ fontSize: 13, fontWeight: 500 }}>{v}</Text> },
                            { title: 'ТС', dataIndex: 'vehicle', key: 'vehicle', render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
                            { title: 'Рейсов', dataIndex: 'orders', key: 'orders', align: 'center' as const, render: (v: number) => <Text style={{ fontSize: 13 }}>{v}</Text> },
                            { title: 'Завершено', dataIndex: 'completed', key: 'completed', align: 'center' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{v}</span> },
                            { title: 'Выручка', dataIndex: 'revenue', key: 'rev', align: 'right' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600, fontSize: 13 }}>{fmt(v)} ₸</span> },
                            { title: 'Маржа', dataIndex: 'margin', key: 'margin', align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{v >= 0 ? '+' : ''}{fmt(v)} ₸</span> },
                        ]} 
                        dataSource={driverData} 
                        size="small" 
                        pagination={{ pageSize: 50 }} 
                    />
                )}

                {reportType === 'summary' && (
                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={8}>
                            <Card title={<span style={{ fontWeight: 600, fontSize: 14 }}>Заявки</span>} size="small" className="premium-card" bordered={false}>
                                <Row gutter={[8, 8]}>
                                    <Col span={12}><Statistic title="Всего" value={filteredOrders.length} valueStyle={{ fontSize: 16 }} /></Col>
                                    <Col span={12}><Statistic title="Завершено" value={filteredOrders.filter(o => o.status === 'COMPLETED').length} valueStyle={{ color: '#52c41a', fontSize: 16 }} /></Col>
                                    <Col span={12}><Statistic title="В работе" value={filteredOrders.filter(o => ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'].includes(o.status)).length} valueStyle={{ color: '#1677ff', fontSize: 16 }} /></Col>
                                    <Col span={12}><Statistic title="Отменено" value={filteredOrders.filter(o => o.status === 'CANCELLED').length} valueStyle={{ color: '#ff4d4f', fontSize: 16 }} /></Col>
                                </Row>
                            </Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card title={<span style={{ fontWeight: 600, fontSize: 14 }}>Финансы</span>} size="small" className="premium-card" bordered={false}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Text type="secondary" style={{ fontSize: 13 }}>Выручка</Text><Text strong style={{ color: '#52c41a', fontSize: 13 }}>{fmt(totalIncome)} ₸</Text></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><Text type="secondary" style={{ fontSize: 13 }}>Затраты</Text><Text strong style={{ color: '#ff4d4f', fontSize: 13 }}>{fmt(totalExpense)} ₸</Text></div>
                                <Divider style={{ margin: '12px 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Text strong style={{ fontSize: 13 }}>Маржа</Text>
                                    <Text strong style={{ color: totalIncome >= totalExpense ? '#52c41a' : '#ff4d4f', fontSize: 13 }}>{totalIncome >= totalExpense ? '+' : ''}{fmt(totalIncome - totalExpense)} ₸</Text>
                                </div>
                            </Card>
                        </Col>
                        <Col xs={24} md={8}>
                            <Card title={<span style={{ fontWeight: 600, fontSize: 14 }}>Автопарк</span>} size="small" className="premium-card" bordered={false}>
                                <Statistic title="Всего водителей" value={drivers.length} valueStyle={{ fontSize: 16 }} />
                                <div style={{ marginTop: 12 }}>
                                    <Statistic title="Контрагентов" value={uniqueCounterparties} valueStyle={{ fontSize: 16 }} />
                                </div>
                            </Card>
                        </Col>
                    </Row>
                )}
            </Card>
        </div>
    );
}
