'use client';

import { useEffect, useState, useMemo } from 'react';
import {
    Table, Typography, Tag, Card, Row, Col, Statistic, Input, DatePicker,
    Select, Space, Tooltip, Drawer, Descriptions, Button, Popconfirm, Progress,
    Modal, Form, InputNumber, App, theme
} from 'antd';
import {
    ArrowUpOutlined, ArrowDownOutlined, DollarOutlined,
    SearchOutlined, EyeOutlined, PlusOutlined, FileExcelOutlined,
    CalendarOutlined, DeleteOutlined, CarOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/auth';

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
    isSubForwarderPaid: boolean;
    subForwarderPaidAt?: string;
    customerCompany?: { id: string; name: string };
    forwarder?: { id: string; name: string };
    assignedDriverName?: string;
    driver?: { firstName: string; lastName: string };
    partner?: { id: string; name: string };
    subForwarder?: { id: string; name: string };
    routePoints?: { pointType: string; sequence: number; location?: { city?: string; address?: string } }[];
    margin: number;
    customerDebt: number;
    executorDebt: number;
    paidIn: number;
    paidOut: number;
}

interface OrderPayment {
    id: string;
    direction: 'IN' | 'OUT';
    amount: number;
    date: string;
    method: string;
    note?: string;
    counterparty?: { name: string };
}

export default function FinancialRegistryPage() {
    const { token } = theme.useToken();
    const cardStyle = {
        borderRadius: 8,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    };
    const { message } = App.useApp();
    const { user } = useAuthStore();
    const canEditFinance = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';
    const [orders, setOrders] = useState<RegistryOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);

    useEffect(() => {
        const fetchFinanceSettings = async () => {
            try {
                const [accRes, catRes] = await Promise.all([
                    api.get('/accounting/finance-accounts'),
                    api.get('/accounting/finance-categories'),
                ]);
                setAccounts(accRes.data || []);
                setCategories(catRes.data || []);
            } catch (err) {
                console.error('Failed to load accounts/categories', err);
            }
        };
        fetchFinanceSettings();
    }, []);
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [paymentFilter, setPaymentFilter] = useState<string>('all');
    const [selectedOrder, setSelectedOrder] = useState<RegistryOrder | null>(null);
    const [selectedOrderPayments, setSelectedOrderPayments] = useState<OrderPayment[]>([]);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Payment Modal State
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [paymentForm] = Form.useForm();
    const [paymentModalData, setPaymentModalData] = useState<{
        orderId: string;
        direction: 'IN' | 'OUT';
        counterpartyId?: string;
        counterpartyName: string;
        maxAmount: number;
    } | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get('/accounting/financial-registry');
            setOrders(res.data);
        } catch {
            message.error('Ошибка загрузки финансового реестра');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Load payments for selected order when drawer opens
    useEffect(() => {
        if (selectedOrder) {
            fetchOrderPayments(selectedOrder.id);
        } else {
            setSelectedOrderPayments([]);
        }
    }, [selectedOrder]);

    const fetchOrderPayments = async (orderId: string) => {
        setLoadingPayments(true);
        try {
            const res = await api.get(`/accounting/payments/order/${orderId}`);
            setSelectedOrderPayments(res.data);
        } catch {
            message.error('Ошибка загрузки платежей по заявке');
        } finally {
            setLoadingPayments(false);
        }
    };

    const getExecutorCost = (o: RegistryOrder) => {
        return o.subForwarderId ? (o.subForwarderPrice || 0) : (o.driverCost || 0);
    };

    const isOverdue = (completedAt?: string, isPaid?: boolean) => {
        if (isPaid || !completedAt) return false;
        return dayjs(completedAt).add(5, 'day').isBefore(dayjs());
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

        if (paymentFilter === 'debtor') result = result.filter(o => o.customerDebt > 0);
        if (paymentFilter === 'creditor') result = result.filter(o => o.executorDebt > 0);
        if (paymentFilter === 'all_paid') result = result.filter(o => o.customerDebt === 0 && o.executorDebt === 0);

        return result;
    }, [orders, search, dateRange, paymentFilter]);

    // Totals
    const totals = useMemo(() => {
        const totalIncome = filtered.reduce((s, o) => s + (o.customerPrice || 0), 0);
        const totalExpense = filtered.reduce((s, o) => s + getExecutorCost(o), 0);
        const totalMargin = filtered.reduce((s, o) => s + o.margin, 0);
        const debtorSum = filtered.reduce((s, o) => s + o.customerDebt, 0);
        const creditorSum = filtered.reduce((s, o) => s + o.executorDebt, 0);
        return { totalIncome, totalExpense, totalMargin, debtorSum, creditorSum };
    }, [filtered]);

    const fmt = (n: number) => {
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
    };

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const res = await api.get('/accounting/financial-registry/export', {
                responseType: 'blob',
            });
            const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `financial-registry_${dayjs().format('YYYY-MM-DD')}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            message.success('Реестр экспортирован успешно');
        } catch {
            message.error('Ошибка при экспорте в Excel');
        } finally {
            setExporting(false);
        }
    };

    const handleAddPaymentClick = (e: React.MouseEvent, record: RegistryOrder, direction: 'IN' | 'OUT') => {
        e.stopPropagation();
        const maxAmt = direction === 'IN' ? record.customerDebt : record.executorDebt;
        let cPartyName = '—';
        let cPartyId: string | undefined;

        if (direction === 'IN') {
            cPartyName = record.customerCompany?.name || 'Заказчик';
            cPartyId = record.customerCompany?.id;
        } else {
            if (record.subForwarder) {
                cPartyName = record.subForwarder.name;
                cPartyId = record.subForwarder.id;
            } else if (record.partner) {
                cPartyName = record.partner.name;
                cPartyId = record.partner.id;
            } else {
                cPartyName = record.assignedDriverName || 'Водитель';
            }
        }

        setPaymentModalData({
            orderId: record.id,
            direction,
            counterpartyId: cPartyId,
            counterpartyName: cPartyName,
            maxAmount: maxAmt
        });

        paymentForm.setFieldsValue({
            amount: maxAmt,
            date: dayjs(),
            method: 'BANK',
            note: direction === 'IN' ? 'Оплата от заказчика' : 'Оплата исполнителю'
        });

        setPaymentModalOpen(true);
    };

    const handleSavePayment = async (values: any) => {
        if (!paymentModalData) return;
        try {
            await api.post('/accounting/payments', {
                orderId: paymentModalData.orderId,
                counterpartyId: paymentModalData.counterpartyId,
                direction: paymentModalData.direction,
                amount: values.amount,
                date: values.date.toISOString(),
                method: values.method,
                accountId: values.accountId || undefined,
                categoryId: values.categoryId || undefined,
                note: values.note
            });
            message.success('Платёж успешно добавлен');
            setPaymentModalOpen(false);
            fetchData();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка сохранения платежа');
        }
    };

    const handleDeletePayment = async (paymentId: string) => {
        try {
            await api.delete(`/accounting/payments/${paymentId}`);
            message.success('Платёж успешно удален');
            if (selectedOrder) {
                fetchOrderPayments(selectedOrder.id);
            }
            fetchData();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка удаления платежа');
        }
    };

    const columns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'num', width: 75, fixed: 'left' as const,
            render: (t: string) => <span style={{ fontWeight: 600 }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 85,
            render: (d: string) => <span style={{ fontSize: 11, color: '#64748b' }}>{dayjs(d).format('DD.MM.YY')}</span>,
        },
        {
            title: 'Заказчик / Выручка', key: 'customer', width: 200,
            render: (_: any, r: RegistryOrder) => {
                const total = r.customerPrice || 0;
                const paid = r.paidIn || 0;
                const percent = total > 0 ? Math.min(Math.round((paid / total) * 100), 100) : 0;
                const name = r.customerCompany?.name || '—';

                return (
                    <div style={{ padding: '2px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontWeight: 500, fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 120 }}>{name}</span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(total)} ₸</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Progress percent={percent} size="small" showInfo={false} strokeColor={percent === 100 ? token.colorSuccess : token.colorPrimary} style={{ flex: 1, margin: 0 }} />
                            <span style={{ fontSize: 10, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>{percent}%</span>
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Исполнитель / Затраты', key: 'executor', width: 200,
            render: (_: any, r: RegistryOrder) => {
                const total = getExecutorCost(r);
                const paid = r.paidOut || 0;
                const percent = total > 0 ? Math.min(Math.round((paid / total) * 100), 100) : 0;

                const name = r.subForwarder?.name || r.partner?.name || r.assignedDriverName || (r.driver ? `${r.driver.lastName} ${r.driver.firstName}` : '—');

                return (
                    <div style={{ padding: '2px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                            <span style={{ fontWeight: 500, fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 120 }}>
                                <CarOutlined style={{ marginRight: 4, color: token.colorTextSecondary }} /> {name}
                                {r.subForwarderId && <Tag color="purple" style={{ fontSize: 9, padding: '0 4px', lineHeight: '14px', margin: '0 0 0 4px' }}>Суб</Tag>}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>{fmt(total)} ₸</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Progress percent={percent} size="small" showInfo={false} strokeColor={percent === 100 ? token.colorSuccess : token.colorPrimary} style={{ flex: 1, margin: 0 }} />
                            <span style={{ fontSize: 10, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>{percent}%</span>
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Статус рейса', dataIndex: 'status', key: 'status', width: 110,
            render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, margin: 0 }}>{statusLabels[s] || s}</Tag>,
        },
        {
            title: 'Долг заказчика', key: 'customerDebt', width: 140, align: 'right' as const,
            render: (_: any, r: RegistryOrder) => {
                const debt = r.customerDebt;
                const paid = r.isCustomerPaid;
                const isLate = isOverdue(r.completedAt, paid);

                return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: paid ? token.colorSuccess : token.colorError }}>
                                {debt === 0 ? 'Оплачено' : `${fmt(debt)} ₸`}
                            </span>
                            {isLate && (
                                <div style={{ fontSize: 9, color: token.colorError, fontWeight: 600 }}>Просрочка 5д+</div>
                            )}
                        </div>
                        {debt > 0 && canEditFinance && (
                            <Tooltip title="Зарегистрировать платеж">
                                <Button
                                    size="small"
                                    type="primary"
                                    shape="circle"
                                    icon={<PlusOutlined />}
                                    onClick={(e) => handleAddPaymentClick(e, r, 'IN')}
                                    style={{ background: token.colorSuccess, borderColor: token.colorSuccess, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                />
                            </Tooltip>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Наш долг', key: 'executorDebt', width: 140, align: 'right' as const,
            render: (_: any, r: RegistryOrder) => {
                const debt = r.executorDebt;
                const paid = debt === 0;

                return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: paid ? token.colorSuccess : token.colorWarning }}>
                                {paid ? 'Оплачено' : `${fmt(debt)} ₸`}
                            </span>
                        </div>
                        {debt > 0 && canEditFinance && (
                            <Tooltip title="Выплатить исполнителю">
                                <Button
                                    size="small"
                                    type="primary"
                                    shape="circle"
                                    icon={<PlusOutlined />}
                                    onClick={(e) => handleAddPaymentClick(e, r, 'OUT')}
                                    style={{ background: token.colorWarning, borderColor: token.colorWarning, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                />
                            </Tooltip>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Маржа ₸', key: 'margin', width: 100, align: 'right' as const,
            render: (_: any, r: RegistryOrder) => {
                const m = r.margin || 0;
                const revenue = r.customerPrice || 0;
                const percent = revenue > 0 ? Math.round((m / revenue) * 100) : 0;
                return (
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: m >= 0 ? token.colorSuccess : token.colorError }}>
                            {m >= 0 ? '+' : ''}{fmt(m)}
                        </span>
                        <div style={{ fontSize: 10, color: token.colorTextSecondary }}>{percent}%</div>
                    </div>
                );
            },
        },
        {
            title: '', key: 'actions', width: 50, fixed: 'right' as const,
            render: (_: any, r: RegistryOrder) => (
                <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setSelectedOrder(r)} />
            ),
        },
    ];

    return (
        <div style={{ height: '100%', padding: '4px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Title level={3} style={{ margin: 0, fontWeight: 700 }}>Финансовый реестр заявок</Title>
                    <Text type="secondary">Маржа, учет оплат и сверка взаиморасчетов по рейсам</Text>
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
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={12} sm={8} md={4}>
                    <Card size="small" bodyStyle={{ padding: 12 }} style={cardStyle}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: token.colorTextSecondary }}>Выручка</span>}
                            value={totals.totalIncome}
                            valueStyle={{ fontSize: 15, color: token.colorText, fontWeight: 700 }}
                            formatter={(val) => `${fmt(val as number)} ₸`}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} md={4}>
                    <Card size="small" bodyStyle={{ padding: 12 }} style={cardStyle}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: token.colorTextSecondary }}>Затраты</span>}
                            value={totals.totalExpense}
                            valueStyle={{ fontSize: 15, color: token.colorText, fontWeight: 700 }}
                            formatter={(val) => `${fmt(val as number)} ₸`}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} md={4}>
                    <Card size="small" bodyStyle={{ padding: 12 }} style={cardStyle}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: token.colorTextSecondary }}>Маржа</span>}
                            value={totals.totalMargin}
                            valueStyle={{ fontSize: 15, color: totals.totalMargin >= 0 ? token.colorSuccess : token.colorError, fontWeight: 700 }}
                            formatter={(val) => `${totals.totalMargin >= 0 ? '+' : ''}${fmt(val as number)} ₸`}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} md={6}>
                    <Card size="small" bodyStyle={{ padding: 12 }} style={cardStyle}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 500 }}>Дебиторка</span>}
                            value={totals.debtorSum}
                            valueStyle={{ fontSize: 15, color: token.colorText, fontWeight: 700 }}
                            formatter={(val) => `${fmt(val as number)} ₸`}
                            prefix={<ArrowUpOutlined style={{ color: token.colorWarning, fontSize: 13 }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={8} md={6}>
                    <Card size="small" bodyStyle={{ padding: 12 }} style={cardStyle}>
                        <Statistic
                            title={<span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 500 }}>Кредиторка</span>}
                            value={totals.creditorSum}
                            valueStyle={{ fontSize: 15, color: token.colorText, fontWeight: 700 }}
                            formatter={(val) => `${fmt(val as number)} ₸`}
                            prefix={<ArrowDownOutlined style={{ color: token.colorError, fontSize: 13 }} />}
                        />
                    </Card>
                </Col>
            </Row>

            {/* FILTERS */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <Input
                    placeholder="Поиск по №, грузу, заказчику..."
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    value={search} onChange={e => setSearch(e.target.value)}
                    style={{ width: 240 }} allowClear size="middle"
                />
                <RangePicker
                    size="middle" format="DD.MM.YYYY"
                    onChange={(dates) => setDateRange(dates as any)}
                    placeholder={['От', 'До']}
                />
                <Select
                    size="middle" value={paymentFilter} onChange={setPaymentFilter}
                    style={{ width: 210 }}
                    options={[
                        { value: 'all', label: 'Все заявки' },
                        { value: 'debtor', label: 'Долг заказчика' },
                        { value: 'creditor', label: 'Наш долг перед ТК' },
                        { value: 'all_paid', label: 'Все расчеты завершены' },
                    ]}
                />
                <span style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 'auto' }}>
                    Показано: <strong>{filtered.length}</strong> заявок
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
                pagination={{ pageSize: 25, size: 'small', showSizeChanger: true, pageSizeOptions: ['25', '50', '100'], showTotal: (t) => `Всего: ${t}` }}
                onRow={(record) => ({
                    style: { cursor: 'pointer' },
                    onDoubleClick: () => setSelectedOrder(record),
                })}
                rowClassName={(record) => {
                    if (record.status === 'COMPLETED') return 'row-completed';
                    if (record.status === 'PROBLEM') return 'row-problem';
                    return '';
                }}
            />

            {/* CSS FOR COMPACT PREMIUM GRID */}
            <style jsx global>{`
                .ant-table-thead > tr > th {
                    padding: 8px 10px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    background: ${token.colorBgLayout} !important;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: ${token.colorTextSecondary} !important;
                    border-bottom: 2px solid ${token.colorBorderSecondary} !important;
                }
                .ant-table-tbody > tr > td {
                    padding: 6px 10px !important;
                    font-size: 12px !important;
                    border-bottom: 1px solid ${token.colorBorderSecondary} !important;
                }
                .ant-table-tbody > tr:hover > td {
                    background: ${token.colorPrimaryBg} !important;
                }
                .row-completed td {
                    background: ${token.colorSuccessBg} !important;
                }
                .row-problem td {
                    background: ${token.colorErrorBg} !important;
                }
            `}</style>

            {/* DETAIL DRAWER */}
            <Drawer
                title={selectedOrder ? `Детали финансов: Заявка №${selectedOrder.orderNumber}` : ''}
                open={!!selectedOrder}
                onClose={() => setSelectedOrder(null)}
                width={540}
            >
                {selectedOrder && (() => {
                    const o = selectedOrder;
                    const executor = o.subForwarder?.name || o.partner?.name || o.assignedDriverName || (o.driver ? `${o.driver.lastName} ${o.driver.firstName}` : '—');
                    const pickupCity = o.routePoints?.[0]?.location?.city || '—';
                    const deliveryCity = o.routePoints?.[o.routePoints.length - 1]?.location?.city || '—';

                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <Descriptions column={1} size="small" bordered>
                                <Descriptions.Item label="Маршрут">{pickupCity} → {deliveryCity}</Descriptions.Item>
                                <Descriptions.Item label="Статус рейса"><Tag color={statusColors[o.status]}>{statusLabels[o.status] || o.status}</Tag></Descriptions.Item>
                                <Descriptions.Item label="Груз">{o.cargoDescription || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Заказчик">{o.customerCompany?.name || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Исполнитель">{executor}</Descriptions.Item>
                            </Descriptions>

                            <div>
                                <Title level={5} style={{ borderBottom: `1px solid ${token.colorBorderSecondary}`, paddingBottom: 8, marginBottom: 12 }}>
                                    <DollarOutlined style={{ marginRight: 8, color: token.colorPrimary }} /> Расчетные данные
                                </Title>
                                <Row gutter={12}>
                                    <Col span={12}>
                                        <Card size="small" bodyStyle={{ padding: 12 }} style={{ background: token.colorBgLayout, marginBottom: 8, border: 'none' }}>
                                            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Ставка заказчика (Гросс)</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText }}>{fmt(o.customerPrice || 0)} ₸</div>
                                        </Card>
                                    </Col>
                                    <Col span={12}>
                                        <Card size="small" bodyStyle={{ padding: 12 }} style={{ background: token.colorBgLayout, marginBottom: 8, border: 'none' }}>
                                            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>Ставка перевозчика (Гросс)</div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: token.colorText }}>{fmt(getExecutorCost(o))} ₸</div>
                                        </Card>
                                    </Col>
                                </Row>

                                <Card size="small" bodyStyle={{ padding: 12 }} style={{ background: o.margin >= 0 ? token.colorSuccessBg : token.colorErrorBg, border: `1px solid ${o.margin >= 0 ? token.colorSuccessBorder : token.colorErrorBorder}` }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span style={{ fontSize: 11, color: token.colorTextSecondary, textTransform: 'uppercase', display: 'block' }}>Маржинальность</span>
                                            <span style={{ fontSize: 20, fontWeight: 800, color: o.margin >= 0 ? token.colorSuccess : token.colorError }}>
                                                {o.margin >= 0 ? '+' : ''}{fmt(o.margin)} ₸
                                            </span>
                                        </div>
                                        <Tag color={o.margin >= 0 ? 'green' : 'red'} style={{ fontSize: 13, padding: '4px 8px', fontWeight: 600 }}>
                                            {o.customerPrice ? Math.round((o.margin / o.customerPrice) * 100) : 0}%
                                        </Tag>
                                    </div>
                                </Card>
                            </div>

                            {/* PAYMENTS HISTORY */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}`, paddingBottom: 8, marginBottom: 12 }}>
                                    <Title level={5} style={{ margin: 0 }}>
                                        <DollarOutlined style={{ marginRight: 8, color: token.colorPrimary }} /> История платежей по заявке
                                    </Title>
                                    {canEditFinance && (
                                        <Space>
                                            <Button size="small" type="primary" style={{ background: token.colorSuccess, borderColor: token.colorSuccess }} onClick={(e) => handleAddPaymentClick(e, o, 'IN')}>+ Входящий</Button>
                                            <Button size="small" type="primary" style={{ background: token.colorWarning, borderColor: token.colorWarning }} onClick={(e) => handleAddPaymentClick(e, o, 'OUT')}>+ Исходящий</Button>
                                        </Space>
                                    )}
                                </div>

                                {loadingPayments ? (
                                    <div style={{ textAlign: 'center', padding: '12px 0' }}><Spin size="small" /></div>
                                ) : selectedOrderPayments.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '16px 0', background: token.colorBgLayout, borderRadius: 8, color: token.colorTextSecondary }}>
                                        Платежей по этой заявке еще не зарегистрировано
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {selectedOrderPayments.map((p) => (
                                            <div
                                                key={p.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '10px 12px',
                                                    background: token.colorBgContainer,
                                                    border: `1px solid ${token.colorBorderSecondary}`,
                                                    borderRadius: 8,
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <Tag color={p.direction === 'IN' ? 'green' : 'orange'} style={{ fontSize: 10 }}>
                                                            {p.direction === 'IN' ? 'Входящий' : 'Исходящий'}
                                                        </Tag>
                                                        <strong style={{ fontSize: 13 }}>{fmt(p.amount)} ₸</strong>
                                                        <span style={{ fontSize: 11, color: token.colorTextSecondary }}>({p.method === 'BANK' ? 'Банк' : p.method === 'CASH' ? 'Наличные' : p.method === 'CARD' ? 'Карта' : 'Другое'})</span>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: token.colorTextDescription, marginTop: 3 }}>
                                                        От: {dayjs(p.date).format('DD.MM.YYYY')} | {p.note || 'без примечания'}
                                                    </div>
                                                </div>
                                                {canEditFinance ? (
                                                    <Popconfirm
                                                        title="Удалить платёж?"
                                                        description="Сумма долга по заявке будет пересчитана."
                                                        okText="Да, удалить"
                                                        cancelText="Отмена"
                                                        okButtonProps={{ danger: true }}
                                                        onConfirm={() => handleDeletePayment(p.id)}
                                                    >
                                                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                                                    </Popconfirm>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </Drawer>

            {/* PARTIAL PAYMENT MODAL */}
            <Modal
                title={paymentModalData ? `Регистрация платежа: ${paymentModalData.direction === 'IN' ? 'Поступление средств' : 'Расход средств'}` : ''}
                open={paymentModalOpen}
                onCancel={() => setPaymentModalOpen(false)}
                onOk={() => paymentForm.submit()}
                destroyOnClose
                centered
            >
                {paymentModalData && (
                    <Form form={paymentForm} layout="vertical" onFinish={handleSavePayment}>
                        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                            <Descriptions column={1} size="small">
                                <Descriptions.Item label="Контрагент"><strong>{paymentModalData.counterpartyName}</strong></Descriptions.Item>
                                <Descriptions.Item label="Остаток долга"><strong>{fmt(paymentModalData.maxAmount)} ₸</strong></Descriptions.Item>
                            </Descriptions>
                        </div>

                        <Form.Item
                            name="amount"
                            label="Сумма платежа (₸)"
                            rules={[
                                { required: true, message: 'Укажите сумму' },
                                { type: 'number', min: 0.01, message: 'Сумма должна быть больше нуля' },
                                {
                                    validator: (_, value) => {
                                        if (value > paymentModalData.maxAmount) {
                                            return Promise.reject(`Сумма превышает долг (${fmt(paymentModalData.maxAmount)} ₸)`);
                                        }
                                        return Promise.resolve();
                                    }
                                }
                            ]}
                        >
                            <InputNumber style={{ width: '100%' }} size="large" formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} />
                        </Form.Item>

                        <Form.Item
                            name="date"
                            label="Дата платежа"
                            rules={[{ required: true, message: 'Укажите дату' }]}
                        >
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" size="large" />
                        </Form.Item>

                        <Form.Item
                            name="method"
                            label="Способ оплаты"
                            rules={[{ required: true, message: 'Выберите способ' }]}
                        >
                            <Select size="large">
                                <Select.Option value="BANK">Безналичный (Банк)</Select.Option>
                                <Select.Option value="CASH">Наличные</Select.Option>
                                <Select.Option value="CARD">Карта</Select.Option>
                                <Select.Option value="OTHER">Другой способ</Select.Option>
                            </Select>
                        </Form.Item>

                        <Form.Item
                            name="accountId"
                            label="Счет / Касса"
                        >
                            <Select size="large" placeholder="По умолчанию" allowClear>
                                {accounts.map(acc => (
                                    <Select.Option key={acc.id} value={acc.id}>
                                        {acc.name} ({acc.kind === 'CASH' ? 'Касса' : 'Банк'})
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item
                            name="categoryId"
                            label="Статья"
                        >
                            <Select size="large" placeholder="По умолчанию" allowClear>
                                {categories.filter(c => c.direction === paymentModalData.direction && c.isActive).map(cat => (
                                    <Select.Option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item
                            name="note"
                            label="Примечание"
                        >
                            <Input placeholder="Например: Оплата по счету №..." size="large" />
                        </Form.Item>
                    </Form>
                )}
            </Modal>
        </div>
    );
}
