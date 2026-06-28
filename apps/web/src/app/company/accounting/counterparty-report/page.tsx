'use client';

import { useEffect, useState, useMemo } from 'react';
import { Typography, Card, Row, Col, Statistic, Input, Select, Table, Tag, Collapse, Space, Empty, Spin, Drawer, Descriptions, Modal, Button, message, theme } from 'antd';
import {
    SearchOutlined, ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
    CheckCircleOutlined, CloseCircleOutlined, TeamOutlined,
    RightOutlined, DownOutlined, ShareAltOutlined, CopyOutlined, SendOutlined, LinkOutlined,
    FileExcelOutlined, DollarOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

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

// Role definitions mapped dynamically inside the component using theme tokens

interface OrderItem {
    id: string;
    orderNumber: string;
    createdAt: string;
    completedAt?: string;
    status: string;
    cargoDescription?: string;
    amount: number;
    isPaid: boolean;
    paidAt?: string;
    direction: 'theyOwe' | 'weOwe';
    routePoints?: { pointType: string; location?: { city?: string; address?: string } }[];
}

interface CounterpartyEntry {
    counterparty: { id: string; name: string };
    ourRole: string;
    orders: OrderItem[];
    theyOweUs: number;
    theyOweUsPaid: number;
    weOweThem: number;
    weOweThemPaid: number;
    balance: number;
    unpaidTheyOweUs: number;
    unpaidWeOweThem: number;
    totalOrders: number;
}

interface Totals {
    totalTheyOweUs: number;
    totalWeOweThem: number;
    unpaidTheyOweUs: number;
    unpaidWeOweThem: number;
    balance: number;
    totalCounterparties: number;
    totalOrders: number;
}

const fmt = (n: number) => n.toLocaleString('ru-RU');

function getRoute(order: OrderItem): string {
    const pts = order.routePoints || [];
    const pickup = pts.find(p => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
    const delivery = pts.find(p => p.pointType === 'DELIVERY');
    const from = pickup?.location?.city || pickup?.location?.address || '—';
    const to = delivery?.location?.city || delivery?.location?.address || '—';
    return `${from} → ${to}`;
}

export default function CounterpartyReportPage() {
    const { token } = theme.useToken();
    const cardStyle = {
        borderRadius: 8,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    };
    const getRoleInfo = (ourRole: string) => {
        const labels: Record<string, string> = {
            'Заказчик': 'Мы заказчик',
            'Экспедитор': 'Мы экспедитор',
            'Суб-экспедитор': 'Мы суб-экспедитор',
        };
        return {
            label: labels[ourRole] || ourRole,
            color: token.colorPrimary,
        };
    };
    const [data, setData] = useState<{ counterparties: CounterpartyEntry[]; totals: Totals } | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [paymentFilter, setPaymentFilter] = useState<string>('all');
    const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
    const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
    const [exporting, setExporting] = useState(false);

    // Share modal state
    const [shareModal, setShareModal] = useState<{ open: boolean; counterpartyId: string; ourRole: string; counterpartyName: string }>({ open: false, counterpartyId: '', ourRole: '', counterpartyName: '' });
    const [shareUrl, setShareUrl] = useState('');
    const [shareLoading, setShareLoading] = useState(false);
    const [shareEmail, setShareEmail] = useState('');
    const [emailSending, setEmailSending] = useState(false);

    const handleShare = async (counterpartyId: string, ourRole: string, counterpartyName: string) => {
        setShareModal({ open: true, counterpartyId, ourRole, counterpartyName });
        setShareUrl('');
        setShareEmail('');
        setShareLoading(true);
        try {
            const res = await api.post('/accounting/share-report', { counterpartyId, ourRole });
            setShareUrl(res.data.shareUrl);
        } catch {
            message.error('Ошибка генерации ссылки');
        } finally {
            setShareLoading(false);
        }
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl);
        message.success('Ссылка скопирована!');
    };

    const handleSendEmail = async () => {
        if (!shareEmail) { message.warning('Введите email'); return; }
        setEmailSending(true);
        try {
            await api.post('/accounting/share-report', {
                counterpartyId: shareModal.counterpartyId,
                ourRole: shareModal.ourRole,
                email: shareEmail,
            });
            message.success('Отчёт отправлен на ' + shareEmail);
            setShareEmail('');
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка отправки письма');
        } finally {
            setEmailSending(false);
        }
    };

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const res = await api.get('/accounting/counterparty-report/export', {
                responseType: 'blob',
            });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `counterparty-report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            message.success('Отчет экспортирован успешно');
        } catch {
            message.error('Ошибка при экспорте в Excel');
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const res = await api.get('/accounting/counterparty-report');
                setData(res.data);
            } catch {
                console.error('Ошибка загрузки отчёта');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filtered = useMemo(() => {
        if (!data) return [];
        let result = data.counterparties;

        if (search) {
            const s = search.toLowerCase();
            result = result.filter(c =>
                c.counterparty.name.toLowerCase().includes(s) ||
                c.orders.some(o => o.orderNumber.toLowerCase().includes(s))
            );
        }
        if (roleFilter !== 'all') {
            result = result.filter(c => c.ourRole === roleFilter);
        }
        if (paymentFilter === 'unpaid_them') {
            result = result.filter(c => c.unpaidTheyOweUs > 0);
        } else if (paymentFilter === 'unpaid_us') {
            result = result.filter(c => c.unpaidWeOweThem > 0);
        } else if (paymentFilter === 'settled') {
            result = result.filter(c => c.unpaidTheyOweUs === 0 && c.unpaidWeOweThem === 0);
        }

        return result;
    }, [data, search, roleFilter, paymentFilter]);

    // Пересчитанные итоги по фильтрованным
    const filteredTotals = useMemo(() => {
        return {
            totalTheyOweUs: filtered.reduce((s, c) => s + c.theyOweUs, 0),
            totalWeOweThem: filtered.reduce((s, c) => s + c.weOweThem, 0),
            unpaidTheyOweUs: filtered.reduce((s, c) => s + c.unpaidTheyOweUs, 0),
            unpaidWeOweThem: filtered.reduce((s, c) => s + c.unpaidWeOweThem, 0),
            balance: filtered.reduce((s, c) => s + c.balance, 0),
        };
    }, [filtered]);

    const columns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'num', width: 120,
            sorter: (a: OrderItem, b: OrderItem) => a.orderNumber.localeCompare(b.orderNumber),
            render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80,
            sorter: (a: OrderItem, b: OrderItem) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (d: string) => <span style={{ fontSize: 11, color: token.colorTextSecondary }}>{dayjs(d).format('DD.MM.YY')}</span>,
        },
        {
            title: 'Маршрут', key: 'route', width: 200, ellipsis: true,
            render: (_: any, r: OrderItem) => <span style={{ fontSize: 12 }}>{getRoute(r)}</span>,
        },
        {
            title: 'Груз', dataIndex: 'cargoDescription', key: 'cargo', width: 140, ellipsis: true,
            render: (t: string) => <span style={{ fontSize: 12 }}>{t || '—'}</span>,
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 110,
            render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, margin: 0 }}>{statusLabels[s] || s}</Tag>,
        },
        {
            title: 'Направление', key: 'direction', width: 120,
            render: (_: any, r: OrderItem) => (
                <Tag color={r.direction === 'theyOwe' ? 'green' : 'orange'} style={{ fontSize: 11, margin: 0 }}>
                    {r.direction === 'theyOwe' ? 'Нам должны' : 'Мы должны'}
                </Tag>
            ),
        },
        {
            title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const,
            sorter: (a: OrderItem, b: OrderItem) => a.amount - b.amount,
            render: (v: number) => v ? <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(v)}</span> : <span style={{ color: token.colorTextDisabled }}>—</span>,
        },
        {
            title: 'Оплата', key: 'paid', width: 90, align: 'center' as const,
            render: (_: any, r: OrderItem) => (
                <Space size={4}>
                    {r.isPaid
                        ? <Tag color="green" style={{ fontSize: 11, margin: 0 }}><CheckCircleOutlined /> Да</Tag>
                        : <Tag color="red" style={{ fontSize: 11, margin: 0 }}><CloseCircleOutlined /> Нет</Tag>
                    }
                </Space>
            ),
        },
    ];

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}><Spin size="large" /></div>;
    }

    if (!data || data.counterparties.length === 0) {
        return (
            <div>
                <Title level={4} style={{ margin: '0 0 16px' }}>Взаиморасчёты с контрагентами</Title>
                <Empty description="Нет данных по взаиморасчётам" />
            </div>
        );
    }

    return (
        <div style={{ height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>Взаиморасчёты с контрагентами</Title>
                    <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                        Финансовая отчётность по всем контрагентам — как заказчик, экспедитор или суб-экспедитор
                    </Text>
                </div>
                <Button
                    type="default"
                    icon={<FileExcelOutlined />}
                    onClick={handleExportExcel}
                    loading={exporting}
                    style={{
                        borderColor: token.colorSuccess,
                        color: token.colorSuccess,
                        fontWeight: 600,
                        boxShadow: `0 2px 4px ${token.colorSuccess}20`,
                    }}
                >
                    Экспорт в Excel
                </Button>
            </div>

            {/* SUMMARY CARDS */}
            <Row gutter={12} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={8}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }} style={cardStyle}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: token.colorTextSecondary }}>Нам должны</span>}
                            value={filteredTotals.unpaidTheyOweUs}
                            prefix={<ArrowUpOutlined style={{ color: token.colorWarning, marginRight: 4 }} />}
                            valueStyle={{ fontSize: 20, color: token.colorText, fontWeight: 700 }}
                            suffix="₸"
                        />
                        {filteredTotals.totalTheyOweUs > 0 && (
                            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
                                всего: {fmt(filteredTotals.totalTheyOweUs)} ₸
                            </div>
                        )}
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }} style={cardStyle}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: token.colorTextSecondary }}>Мы должны</span>}
                            value={filteredTotals.unpaidWeOweThem}
                            prefix={<ArrowDownOutlined style={{ color: token.colorError, marginRight: 4 }} />}
                            valueStyle={{ fontSize: 20, color: token.colorText, fontWeight: 700 }}
                            suffix="₸"
                        />
                        {filteredTotals.totalWeOweThem > 0 && (
                            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
                                всего: {fmt(filteredTotals.totalWeOweThem)} ₸
                            </div>
                        )}
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card size="small" styles={{ body: { padding: '12px 16px' } }} style={cardStyle}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: token.colorTextSecondary }}>Баланс</span>}
                            value={filteredTotals.balance}
                            prefix={<SwapOutlined style={{ color: token.colorPrimary, marginRight: 4 }} />}
                            valueStyle={{ fontSize: 20, color: token.colorText, fontWeight: 700 }}
                            suffix="₸"
                        />
                        <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
                            {filtered.length} контрагент{filtered.length === 1 ? '' : filtered.length < 5 ? 'а' : 'ов'}
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* FILTERS */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <Input
                    placeholder="Поиск по контрагенту или № заявки..."
                    prefix={<SearchOutlined style={{ color: token.colorTextDescription }} />}
                    value={search} onChange={e => setSearch(e.target.value)}
                    style={{ width: 280 }} allowClear size="small"
                />
                <Select
                    size="small" value={roleFilter} onChange={setRoleFilter}
                    style={{ width: 200 }}
                    options={[
                        { value: 'all', label: 'Все роли' },
                        { value: 'Заказчик', label: 'Мы заказчик' },
                        { value: 'Экспедитор', label: 'Мы экспедитор' },
                        { value: 'Суб-экспедитор', label: 'Мы суб-экспедитор' },
                    ]}
                />
                <Select
                    size="small" value={paymentFilter} onChange={setPaymentFilter}
                    style={{ width: 220 }}
                    options={[
                        { value: 'all', label: 'Все контрагенты' },
                        { value: 'unpaid_them', label: 'Нам должны' },
                        { value: 'unpaid_us', label: 'Мы должны' },
                        { value: 'settled', label: 'Все оплачено' },
                    ]}
                />
                <span style={{ fontSize: 11, color: token.colorTextSecondary, marginLeft: 'auto', lineHeight: '24px' }}>
                    {filtered.length} из {data.counterparties.length} контрагентов
                </span>
            </div>

            {/* COUNTERPARTY CARDS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map((cp) => {
                    const key = `${cp.counterparty.id}__${cp.ourRole}`;
                    const isExpanded = expandedKeys.includes(key);
                    const roleInfo = getRoleInfo(cp.ourRole);

                    return (
                        <Card
                            key={key}
                            size="small"
                            styles={{
                                body: { padding: 0 },
                            }}
                            style={{
                                ...cardStyle,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                borderRadius: 10,
                                overflow: 'hidden',
                            }}
                        >
                            {/* Header */}
                            <div
                                onClick={() => {
                                    setExpandedKeys(prev =>
                                        prev.includes(key)
                                            ? prev.filter(k => k !== key)
                                            : [...prev, key]
                                    );
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '12px 16px',
                                    cursor: 'pointer',
                                    background: isExpanded ? token.colorFillAlter : token.colorBgContainer,
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = token.colorFillAlter; }}
                                onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = token.colorBgContainer; }}
                            >
                                {/* Expand icon */}
                                <span style={{ color: token.colorTextDescription, fontSize: 11, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>
                                    <RightOutlined />
                                </span>

                                {/* Company name + role */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <TeamOutlined style={{ color: token.colorPrimary, fontSize: 14 }} />
                                        <Text strong style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {cp.counterparty.name}
                                        </Text>
                                        <Tag color="processing" style={{ fontSize: 10, margin: 0, padding: '0 6px', lineHeight: '16px' }}>
                                            {roleInfo.label}
                                        </Tag>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                        {cp.totalOrders} заяв{cp.totalOrders === 1 ? 'ка' : cp.totalOrders < 5 ? 'ки' : 'ок'}
                                    </Text>
                                </div>

                                {/* Mini stats */}
                                <div style={{ display: 'flex', gap: 20, flexShrink: 0, alignItems: 'center' }}>
                                    {cp.unpaidTheyOweUs > 0 && (
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: token.colorTextSecondary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Нам должны</div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: token.colorSuccess }}>{fmt(cp.unpaidTheyOweUs)} ₸</div>
                                        </div>
                                    )}
                                    {cp.unpaidWeOweThem > 0 && (
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 10, color: token.colorTextSecondary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Мы должны</div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: token.colorError }}>{fmt(cp.unpaidWeOweThem)} ₸</div>
                                        </div>
                                    )}
                                    {cp.unpaidTheyOweUs === 0 && cp.unpaidWeOweThem === 0 && (
                                        <Tag color="green" style={{ fontSize: 11, margin: 0 }}>
                                            Всё оплачено
                                        </Tag>
                                    )}
                                    <div style={{ textAlign: 'right', borderLeft: `1px solid ${token.colorBorderSecondary}`, paddingLeft: 16 }}>
                                        <div style={{ fontSize: 10, color: token.colorTextSecondary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Баланс</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: cp.balance >= 0 ? token.colorSuccess : token.colorError }}>
                                            {cp.balance >= 0 ? '+' : ''}{fmt(cp.balance)} ₸
                                        </div>
                                    </div>
                                    {/* Share button */}
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<ShareAltOutlined />}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleShare(cp.counterparty.id, cp.ourRole, cp.counterparty.name);
                                        }}
                                        style={{ marginLeft: 8, color: token.colorPrimary, borderRadius: 6 }}
                                        title="Поделиться отчётом"
                                    />
                                </div>
                            </div>

                            {/* Expanded content — Table */}
                            {isExpanded && (
                                <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                                    {/* Detailed stats bar */}
                                    <div style={{ display: 'flex', gap: 16, padding: '8px 16px', background: token.colorFillAlter, borderBottom: `1px solid ${token.colorBorderSecondary}`, flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: 12 }}>
                                            <span style={{ color: token.colorTextSecondary }}>Нам должны всего: </span>
                                            <span style={{ fontWeight: 600, color: token.colorSuccess }}>{fmt(cp.theyOweUs)} ₸</span>
                                            <span style={{ color: token.colorTextSecondary }}> (оплачено: {fmt(cp.theyOweUsPaid)} ₸)</span>
                                        </div>
                                        <div style={{ fontSize: 12 }}>
                                            <span style={{ color: token.colorTextSecondary }}>Мы должны всего: </span>
                                            <span style={{ fontWeight: 600, color: token.colorError }}>{fmt(cp.weOweThem)} ₸</span>
                                            <span style={{ color: token.colorTextSecondary }}> (оплачено: {fmt(cp.weOweThemPaid)} ₸)</span>
                                        </div>
                                    </div>

                                    <Table
                                        columns={columns}
                                        dataSource={cp.orders}
                                        rowKey="id"
                                        size="small"
                                        pagination={cp.orders.length > 20 ? { pageSize: 20, size: 'small', showTotal: (t) => `Всего: ${t}` } : false}
                                        scroll={{ x: 1000 }}
                                        onRow={(record) => ({
                                            style: { cursor: 'pointer' },
                                            onClick: () => setSelectedOrder(record),
                                        })}
                                        rowClassName={(record) => {
                                            if (record.status === 'COMPLETED') return 'row-completed';
                                            if (record.status === 'PROBLEM') return 'row-problem';
                                            return '';
                                        }}
                                        summary={() => {
                                            if (cp.orders.length < 2) return null;
                                            const totalAmount = cp.orders.reduce((s, o) => s + o.amount, 0);
                                            const paidAmount = cp.orders.filter(o => o.isPaid).reduce((s, o) => s + o.amount, 0);
                                            return (
                                                <Table.Summary>
                                                    <Table.Summary.Row>
                                                        <Table.Summary.Cell index={0} colSpan={6}>
                                                            <Text strong style={{ fontSize: 12 }}>ИТОГО</Text>
                                                        </Table.Summary.Cell>
                                                        <Table.Summary.Cell index={6} align="right">
                                                            <Text strong style={{ fontSize: 12 }}>{fmt(totalAmount)} ₸</Text>
                                                        </Table.Summary.Cell>
                                                        <Table.Summary.Cell index={7} align="center">
                                                            <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>{fmt(paidAmount)} опл.</Text>
                                                        </Table.Summary.Cell>
                                                    </Table.Summary.Row>
                                                </Table.Summary>
                                            );
                                        }}
                                    />
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>

            {/* DETAIL DRAWER */}
            <Drawer
                title={selectedOrder ? `Детали заявки: №${selectedOrder.orderNumber}` : ''}
                open={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                width={520}
            >
                {selectedOrder && (() => {
                    const o = selectedOrder;
                    const route = getRoute(o);

                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <Descriptions column={1} size="small" bordered labelStyle={{ width: 160, fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
                                <Descriptions.Item label="Маршрут">{route}</Descriptions.Item>
                                <Descriptions.Item label="Статус рейса">
                                    <Tag color={statusColors[o.status] || 'default'}>
                                        {statusLabels[o.status] || o.status}
                                    </Tag>
                                </Descriptions.Item>
                                <Descriptions.Item label="Груз">{o.cargoDescription || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Дата создания">{dayjs(o.createdAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                            </Descriptions>

                            <div style={{ marginTop: 12 }}>
                                <Title level={5} style={{ borderBottom: `1px solid ${token.colorBorderSecondary}`, paddingBottom: 8, marginBottom: 12 }}>
                                    <DollarOutlined style={{ marginRight: 8, color: token.colorPrimary }} /> Финансы
                                </Title>
                                <Card
                                    size="small"
                                    style={{
                                        background: o.direction === 'theyOwe' ? token.colorSuccessBg : token.colorErrorBg,
                                        border: `1px solid ${o.direction === 'theyOwe' ? token.colorSuccessBorder : token.colorErrorBorder}`,
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                                {o.direction === 'theyOwe' ? 'Нам должны' : 'Мы должны'}
                                            </div>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: o.direction === 'theyOwe' ? token.colorSuccess : token.colorError }}>
                                                {fmt(o.amount)} ₸
                                            </div>
                                        </div>
                                        <Tag color={o.isPaid ? 'green' : 'red'} style={{ fontSize: 13 }}>
                                            {o.isPaid ? 'Оплачено' : 'Не оплачено'}
                                        </Tag>
                                    </div>
                                    {o.isPaid && o.paidAt && (
                                        <div style={{ fontSize: 11, color: token.colorSuccess, marginTop: 4 }}>
                                            Оплачено: {dayjs(o.paidAt).format('DD.MM.YYYY')}
                                        </div>
                                    )}
                                </Card>
                            </div>
                        </div>
                    );
                })()}
            </Drawer>

            {/* SHARE MODAL */}
            <Modal
                title={<><ShareAltOutlined style={{ marginRight: 8 }} />Поделиться отчётом — {shareModal.counterpartyName}</>}
                open={shareModal.open}
                onCancel={() => setShareModal({ open: false, counterpartyId: '', ourRole: '', counterpartyName: '' })}
                footer={null}
                width={520}
            >
                {shareLoading ? (
                    <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
                ) : shareUrl ? (
                    <div>
                        <div style={{ marginBottom: 20 }}>
                            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                                Ссылка на отчёт (действительна 7 дней):
                            </Text>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <Input
                                    value={shareUrl}
                                    readOnly
                                    prefix={<LinkOutlined style={{ color: token.colorTextDisabled }} />}
                                    style={{ flex: 1, fontSize: 13 }}
                                />
                                <Button
                                    type="primary"
                                    icon={<CopyOutlined />}
                                    onClick={handleCopyLink}
                                >
                                    Копировать
                                </Button>
                            </div>
                        </div>

                        <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16 }}>
                            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                                Или отправить на email:
                            </Text>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <Input
                                    placeholder="email@example.com"
                                    value={shareEmail}
                                    onChange={(e) => setShareEmail(e.target.value)}
                                    onPressEnter={handleSendEmail}
                                    style={{ flex: 1 }}
                                    type="email"
                                />
                                <Button
                                    icon={<SendOutlined />}
                                    onClick={handleSendEmail}
                                    loading={emailSending}
                                >
                                    Отправить
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <Empty description="Не удалось сгенерировать ссылку" />
                )}
            </Modal>

            {/* COMPACT TABLE STYLES */}
            <style jsx global>{`
                .ant-table-small .ant-table-thead > tr > th {
                    padding: 6px 8px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    background: ${token.colorBgLayout} !important;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    color: ${token.colorTextSecondary} !important;
                    white-space: nowrap;
                }
                .ant-table-small .ant-table-tbody > tr > td {
                    padding: 4px 8px !important;
                    font-size: 12px !important;
                    border-bottom: 1px solid ${token.colorBorderSecondary} !important;
                }
                .ant-table-small .ant-table-tbody > tr:hover > td {
                    background: ${token.colorPrimaryBg} !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-completed > td {
                    background: ${token.colorSuccessBg} !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-problem > td {
                    background: ${token.colorErrorBg} !important;
                }
            `}</style>
        </div>
    );
}
