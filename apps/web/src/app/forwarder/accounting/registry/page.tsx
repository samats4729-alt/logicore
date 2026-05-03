'use client';

import { useEffect, useState, useMemo } from 'react';
import { Table, Typography, Tag, Card, Row, Col, Statistic, Input, DatePicker, Select, Space, Tooltip, Drawer, Descriptions, Button } from 'antd';
import {
    ArrowUpOutlined, ArrowDownOutlined, DollarOutlined,
    SearchOutlined, CheckCircleOutlined, CloseCircleOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

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

interface RegistryOrder {
    id: string;
    orderNumber: string;
    createdAt: string;
    status: string;
    cargoDescription?: string;
    pickupDate?: string;
    completedAt?: string;
    customerPrice?: number;
    customerPriceType?: string;
    isCustomerPaid: boolean;
    customerPaidAt?: string;
    driverCost?: number;
    subForwarderPrice?: number;
    subForwarderId?: string;
    isDriverPaid: boolean;
    driverPaidAt?: string;
    customerCompany?: { id: string; name: string };
    assignedDriverName?: string;
    driver?: { firstName: string; lastName: string };
    partner?: { name: string };
    subForwarder?: { name: string };
    pickupLocation?: { address: string; city?: string };
    deliveryPoints?: { location: { address: string; city?: string } }[];
}

export default function FinancialRegistryPage() {
    const [orders, setOrders] = useState<RegistryOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [paymentFilter, setPaymentFilter] = useState<string>('all');
    const [selectedOrder, setSelectedOrder] = useState<RegistryOrder | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get('/accounting/financial-registry');
            setOrders(res.data);
        } catch {
            console.error('Ошибка загрузки реестра');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Helpers
    const getExpense = (o: RegistryOrder) => o.subForwarderId ? (o.subForwarderPrice || 0) : (o.driverCost || 0);
    const getIncome = (o: RegistryOrder) => o.customerPrice || 0;
    const getMargin = (o: RegistryOrder) => getIncome(o) - getExpense(o);
    const getMarginPercent = (o: RegistryOrder) => {
        const inc = getIncome(o);
        if (!inc) return 0;
        return Math.round((getMargin(o) / inc) * 100);
    };

    // Filters
    const filtered = useMemo(() => {
        let result = orders;

        if (search) {
            const s = search.toLowerCase();
            result = result.filter(o =>
                o.orderNumber.toLowerCase().includes(s) ||
                (o.cargoDescription || '').toLowerCase().includes(s) ||
                (o.customerCompany?.name || '').toLowerCase().includes(s) ||
                (o.assignedDriverName || '').toLowerCase().includes(s)
            );
        }

        if (dateRange && dateRange[0] && dateRange[1]) {
            const from = dateRange[0].startOf('day');
            const to = dateRange[1].endOf('day');
            result = result.filter(o => {
                const d = dayjs(o.createdAt);
                return d.isAfter(from) && d.isBefore(to);
            });
        }

        if (paymentFilter === 'debtor') result = result.filter(o => !o.isCustomerPaid && getIncome(o) > 0);
        if (paymentFilter === 'creditor') result = result.filter(o => !o.isDriverPaid && getExpense(o) > 0);
        if (paymentFilter === 'all_paid') result = result.filter(o => o.isCustomerPaid && o.isDriverPaid);

        return result;
    }, [orders, search, dateRange, paymentFilter]);

    // Totals
    const totals = useMemo(() => {
        const totalIncome = filtered.reduce((s, o) => s + getIncome(o), 0);
        const totalExpense = filtered.reduce((s, o) => s + getExpense(o), 0);
        const totalMargin = totalIncome - totalExpense;
        const debtorSum = filtered.filter(o => !o.isCustomerPaid).reduce((s, o) => s + getIncome(o), 0);
        const creditorSum = filtered.filter(o => !o.isDriverPaid).reduce((s, o) => s + getExpense(o), 0);
        return { totalIncome, totalExpense, totalMargin, debtorSum, creditorSum };
    }, [filtered]);

    const fmt = (n: number) => n.toLocaleString('ru-RU');

    const columns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'num', width: 80, fixed: 'left' as const,
            sorter: (a: RegistryOrder, b: RegistryOrder) => a.orderNumber.localeCompare(b.orderNumber),
            render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80,
            sorter: (a: RegistryOrder, b: RegistryOrder) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (d: string) => <span style={{ fontSize: 11, color: '#666' }}>{dayjs(d).format('DD.MM.YY')}</span>,
        },
        {
            title: 'Заказчик', key: 'customer', width: 140, ellipsis: true,
            render: (_: any, r: RegistryOrder) => {
                const name = r.customerCompany?.name || '—';
                return (
                    <span style={{ fontSize: 12, color: !r.isCustomerPaid && getIncome(r) > 0 ? '#cf1322' : undefined, fontWeight: !r.isCustomerPaid && getIncome(r) > 0 ? 600 : 400 }}>
                        {name}
                    </span>
                );
            },
        },
        {
            title: 'Исполнитель', key: 'executor', width: 130, ellipsis: true,
            render: (_: any, r: RegistryOrder) => {
                const name = r.subForwarder?.name || r.partner?.name || r.assignedDriverName || (r.driver ? `${r.driver.lastName} ${r.driver.firstName}` : '—');
                return (
                    <span style={{ fontSize: 12, color: !r.isDriverPaid && getExpense(r) > 0 ? '#cf1322' : undefined, fontWeight: !r.isDriverPaid && getExpense(r) > 0 ? 600 : 400 }}>
                        {name}
                    </span>
                );
            },
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 100,
            render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, margin: 0 }}>{statusLabels[s] || s}</Tag>,
        },
        {
            title: <Tooltip title="Дебиторская задолженность — сколько должны нам"><span>Должны нам ₸</span></Tooltip>,
            key: 'debit', width: 120, align: 'right' as const,
            sorter: (a: RegistryOrder, b: RegistryOrder) => getIncome(a) - getIncome(b),
            render: (_: any, r: RegistryOrder) => {
                const v = getIncome(r);
                if (!v) return <span style={{ color: '#ccc' }}>—</span>;
                return (
                    <Space size={4}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: r.isCustomerPaid ? '#389e0d' : '#cf1322' }}>{fmt(v)}</span>
                        {r.isCustomerPaid
                            ? <CheckCircleOutlined style={{ color: '#389e0d', fontSize: 11 }} />
                            : <CloseCircleOutlined style={{ color: '#cf1322', fontSize: 11 }} />}
                    </Space>
                );
            },
        },
        {
            title: <Tooltip title="Кредиторская задолженность — сколько должны мы"><span>Должны мы ₸</span></Tooltip>,
            key: 'credit', width: 120, align: 'right' as const,
            sorter: (a: RegistryOrder, b: RegistryOrder) => getExpense(a) - getExpense(b),
            render: (_: any, r: RegistryOrder) => {
                const v = getExpense(r);
                if (!v) return <span style={{ color: '#ccc' }}>—</span>;
                return (
                    <Space size={4}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: r.isDriverPaid ? '#389e0d' : '#cf1322' }}>{fmt(v)}</span>
                        {r.isDriverPaid
                            ? <CheckCircleOutlined style={{ color: '#389e0d', fontSize: 11 }} />
                            : <CloseCircleOutlined style={{ color: '#cf1322', fontSize: 11 }} />}
                    </Space>
                );
            },
        },
        {
            title: 'Маржа ₸', key: 'margin', width: 120, align: 'right' as const,
            sorter: (a: RegistryOrder, b: RegistryOrder) => getMargin(a) - getMargin(b),
            render: (_: any, r: RegistryOrder) => {
                const m = getMargin(r);
                const pct = getMarginPercent(r);
                if (!getIncome(r) && !getExpense(r)) return <span style={{ color: '#ccc' }}>—</span>;
                return (
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: m >= 0 ? '#389e0d' : '#cf1322' }}>
                            {m >= 0 ? '+' : ''}{fmt(m)}
                        </span>
                        {pct !== 0 && (
                            <div style={{ fontSize: 10, color: m >= 0 ? '#52c41a' : '#ff4d4f' }}>
                                {pct >= 0 ? '+' : ''}{pct}%
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: '', key: 'actions', width: 40, fixed: 'right' as const,
            render: (_: any, r: RegistryOrder) => (
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setSelectedOrder(r)} />
            ),
        },
    ];

    return (
        <div style={{ height: '100%' }}>
            <Title level={4} style={{ margin: '0 0 16px' }}>Реестр заявок — Финансы</Title>

            {/* SUMMARY CARDS */}
            <Row gutter={12} style={{ marginBottom: 16 }}>
                <Col span={5}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: '#8c8c8c' }}>Доход (всего)</span>}
                            value={totals.totalIncome}
                            prefix={<ArrowUpOutlined />}
                            valueStyle={{ fontSize: 18, color: '#389e0d', fontWeight: 700 }}
                            suffix="₸"
                        />
                    </Card>
                </Col>
                <Col span={5}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: '#8c8c8c' }}>Расход (всего)</span>}
                            value={totals.totalExpense}
                            prefix={<ArrowDownOutlined />}
                            valueStyle={{ fontSize: 18, color: '#cf1322', fontWeight: 700 }}
                            suffix="₸"
                        />
                    </Card>
                </Col>
                <Col span={5}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: '#8c8c8c' }}>Маржа</span>}
                            value={totals.totalMargin}
                            prefix={<DollarOutlined />}
                            valueStyle={{ fontSize: 18, color: totals.totalMargin >= 0 ? '#389e0d' : '#cf1322', fontWeight: 700 }}
                            suffix="₸"
                        />
                    </Card>
                </Col>
                <Col span={5}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: '#cf1322' }}>Дебиторка (нам должны)</span>}
                            value={totals.debtorSum}
                            valueStyle={{ fontSize: 18, color: '#cf1322', fontWeight: 700 }}
                            suffix="₸"
                        />
                    </Card>
                </Col>
                <Col span={4}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: '#fa8c16' }}>Кредиторка (мы должны)</span>}
                            value={totals.creditorSum}
                            valueStyle={{ fontSize: 18, color: '#fa8c16', fontWeight: 700 }}
                            suffix="₸"
                        />
                    </Card>
                </Col>
            </Row>

            {/* FILTERS */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <Input
                    placeholder="Поиск по №, грузу, заказчику..."
                    prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                    value={search} onChange={e => setSearch(e.target.value)}
                    style={{ width: 260 }} allowClear size="small"
                />
                <RangePicker
                    size="small" format="DD.MM.YYYY"
                    onChange={(dates) => setDateRange(dates as any)}
                    placeholder={['От', 'До']}
                />
                <Select
                    size="small" value={paymentFilter} onChange={setPaymentFilter}
                    style={{ width: 200 }}
                    options={[
                        { value: 'all', label: 'Все заявки' },
                        { value: 'debtor', label: '🔴 Нам должны (не оплачено)' },
                        { value: 'creditor', label: '🟠 Мы должны (не оплачено)' },
                        { value: 'all_paid', label: '✅ Все оплачены' },
                    ]}
                />
                <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto', lineHeight: '24px' }}>
                    Всего: {filtered.length} из {orders.length}
                </span>
            </div>

            {/* TABLE */}
            <Table
                columns={columns}
                dataSource={filtered}
                rowKey="id"
                loading={loading}
                size="small"
                scroll={{ x: 1000 }}
                pagination={{ pageSize: 50, size: 'small', showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `Всего: ${t}` }}
                onRow={(record) => ({
                    style: { cursor: 'pointer' },
                    onDoubleClick: () => setSelectedOrder(record),
                })}
                rowClassName={(record) => {
                    if (record.status === 'COMPLETED') return 'row-completed';
                    if (record.status === 'PROBLEM') return 'row-problem';
                    return '';
                }}
                summary={() => {
                    if (!filtered.length) return null;
                    return (
                        <Table.Summary fixed>
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={5}><Text strong style={{ fontSize: 12 }}>ИТОГО</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={5} align="right"><Text strong style={{ fontSize: 12, color: '#389e0d' }}>{fmt(totals.totalIncome)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={6} align="right"><Text strong style={{ fontSize: 12, color: '#cf1322' }}>{fmt(totals.totalExpense)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={7} align="right"><Text strong style={{ fontSize: 12, color: totals.totalMargin >= 0 ? '#389e0d' : '#cf1322' }}>{totals.totalMargin >= 0 ? '+' : ''}{fmt(totals.totalMargin)}</Text></Table.Summary.Cell>
                                <Table.Summary.Cell index={8} />
                            </Table.Summary.Row>
                        </Table.Summary>
                    );
                }}
            />

            {/* COMPACT TABLE STYLES */}
            <style jsx global>{`
                .ant-table-small .ant-table-thead > tr > th {
                    padding: 6px 8px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    background: #fafafa !important;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    color: #666 !important;
                    white-space: nowrap;
                }
                .ant-table-small .ant-table-tbody > tr > td {
                    padding: 4px 8px !important;
                    font-size: 12px !important;
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

            {/* DETAIL DRAWER */}
            <Drawer
                title={selectedOrder ? `Заявка ${selectedOrder.orderNumber}` : ''}
                open={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                width={480}
            >
                {selectedOrder && (() => {
                    const o = selectedOrder;
                    const income = getIncome(o);
                    const expense = getExpense(o);
                    const margin = getMargin(o);
                    const marginPct = getMarginPercent(o);
                    const executor = o.subForwarder?.name || o.partner?.name || o.assignedDriverName || (o.driver ? `${o.driver.lastName} ${o.driver.firstName}` : '—');
                    const pickupCity = o.pickupLocation?.city || o.pickupLocation?.address || '—';
                    const deliveryCity = o.deliveryPoints?.[0]?.location?.city || o.deliveryPoints?.[0]?.location?.address || '—';

                    return (
                        <div>
                            <Descriptions column={1} size="small" bordered>
                                <Descriptions.Item label="Дата создания">{dayjs(o.createdAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                                <Descriptions.Item label="Статус"><Tag color={statusColors[o.status]}>{statusLabels[o.status] || o.status}</Tag></Descriptions.Item>
                                <Descriptions.Item label="Маршрут">{pickupCity} → {deliveryCity}</Descriptions.Item>
                                {o.cargoDescription && <Descriptions.Item label="Груз">{o.cargoDescription}</Descriptions.Item>}
                                <Descriptions.Item label="Заказчик">{o.customerCompany?.name || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Исполнитель">{executor}</Descriptions.Item>
                            </Descriptions>

                            <div style={{ marginTop: 20 }}>
                                <Title level={5}>💰 Финансы</Title>
                                <Card size="small" style={{ background: '#f6ffed', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>Дебиторская задолженность (нам должны)</div>
                                            <div style={{ fontSize: 22, fontWeight: 700, color: '#389e0d' }}>{fmt(income)} ₸</div>
                                        </div>
                                        <Tag color={o.isCustomerPaid ? 'green' : 'red'} style={{ fontSize: 12 }}>
                                            {o.isCustomerPaid ? '✅ Оплачено' : '❌ Не оплачено'}
                                        </Tag>
                                    </div>
                                    {o.customerPaidAt && <div style={{ fontSize: 11, color: '#52c41a', marginTop: 4 }}>Оплачено: {dayjs(o.customerPaidAt).format('DD.MM.YYYY')}</div>}
                                </Card>

                                <Card size="small" style={{ background: '#fff2f0', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>Кредиторская задолженность (мы должны)</div>
                                            <div style={{ fontSize: 22, fontWeight: 700, color: '#cf1322' }}>{fmt(expense)} ₸</div>
                                        </div>
                                        <Tag color={o.isDriverPaid ? 'green' : 'red'} style={{ fontSize: 12 }}>
                                            {o.isDriverPaid ? '✅ Оплачено' : '❌ Не оплачено'}
                                        </Tag>
                                    </div>
                                    {o.driverPaidAt && <div style={{ fontSize: 11, color: '#52c41a', marginTop: 4 }}>Оплачено: {dayjs(o.driverPaidAt).format('DD.MM.YYYY')}</div>}
                                </Card>

                                <Card size="small" style={{ background: margin >= 0 ? '#f6ffed' : '#fff2f0', border: `2px solid ${margin >= 0 ? '#b7eb8f' : '#ffa39e'}` }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 1 }}>Маржа (прибыль)</div>
                                        <div style={{ fontSize: 28, fontWeight: 800, color: margin >= 0 ? '#389e0d' : '#cf1322' }}>
                                            {margin >= 0 ? '+' : ''}{fmt(margin)} ₸
                                        </div>
                                        {marginPct !== 0 && <div style={{ fontSize: 14, color: margin >= 0 ? '#52c41a' : '#ff4d4f' }}>{marginPct >= 0 ? '+' : ''}{marginPct}%</div>}
                                    </div>
                                </Card>
                            </div>
                        </div>
                    );
                })()}
            </Drawer>
        </div>
    );
}
