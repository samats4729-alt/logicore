'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Typography, Space, Tag, DatePicker, Input, Select, Switch, message, Tooltip, Statistic, Row, Col, Segmented, Modal, Form, InputNumber, Popconfirm, Drawer, Descriptions, Divider } from 'antd';
import {
    SearchOutlined, CheckCircleOutlined, CloseCircleOutlined, ArrowLeftOutlined,
    PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, SaveOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface JournalEntry {
    id: string; orderNumber: string; createdAt: string; status: string;
    cargoDescription: string;
    // Заказчик
    customerPrice: number | null; isCustomerPaid: boolean; customerPaidAt: string | null;
    customerCompany: { id: string; name: string } | null;
    // Водитель / партнёр
    driverCost: number | null; isDriverPaid: boolean; driverPaidAt: string | null;
    driverPaymentCondition: string | null; driverPaymentForm: string | null;
    assignedDriverName: string | null; assignedDriverPhone: string | null;
    driver: { id: string; firstName: string; lastName: string; phone: string } | null;
    partner: { id: string; name: string } | null;
    // Суб-экспедитор
    subForwarderId?: string; subForwarderPrice?: number | null;
    isSubForwarderPaid: boolean; subForwarderPaidAt: string | null;
    subForwarder: { id: string; name: string } | null;
    pickupDate: string | null; completedAt: string | null;
}

interface ManualExpense { id: string; date: string; category: string; description: string; amount: number; note?: string; order?: { orderNumber: string }; }

const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Ожидает', ASSIGNED: 'Назначен', EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке', LOADING: 'Погрузка', IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке', UNLOADING: 'Выгрузка', COMPLETED: 'Завершён', PROBLEM: 'Проблема',
};

const EXPENSE_CATEGORIES = [
    { value: 'fuel', label: 'Топливо' }, { value: 'repair', label: 'Ремонт' },
    { value: 'salary', label: 'Зарплата' }, { value: 'insurance', label: 'Страхование' },
    { value: 'tax', label: 'Налоги' }, { value: 'rent', label: 'Аренда' },
    { value: 'communication', label: 'Связь' }, { value: 'office', label: 'Офис' },
    { value: 'corporate', label: 'Корпоративные' }, { value: 'penalties', label: 'Штрафы' },
    { value: 'refund', label: 'Возврат' }, { value: 'other', label: 'Прочее' },
];

const categoryColors: Record<string, string> = {
    fuel: 'orange', repair: 'red', salary: 'blue', insurance: 'cyan',
    tax: 'volcano', rent: 'purple', communication: 'geekblue', office: 'lime',
    corporate: 'magenta', penalties: 'red', refund: 'gold', other: 'default',
};

export default function ForwarderExpensesPage() {
    const [tab, setTab] = useState<string>('journal');
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentFilter, setPaymentFilter] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<ManualExpense | null>(null);
    const [form] = Form.useForm();
    const [detailForm] = Form.useForm();
    const router = useRouter();

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
    const [savingDetail, setSavingDetail] = useState(false);

    useEffect(() => { fetchJournal(); fetchManual(); }, []);

    const fetchJournal = async () => { setLoading(true); try { const res = await api.get('/accounting/financial-registry'); setEntries(res.data); } catch {} finally { setLoading(false); } };
    const fetchManual = async () => { try { const res = await api.get('/accounting/expenses'); setManualExpenses(res.data); } catch {} };

    const getIsPaid = (e: JournalEntry): boolean => {
        return e.subForwarderId ? e.isSubForwarderPaid : e.isDriverPaid;
    };

    const getPaidAt = (e: JournalEntry): string | null => {
        return e.subForwarderId ? e.subForwarderPaidAt : e.driverPaidAt;
    };

    const getExecutorLabel = (e: JournalEntry): string => {
        return e.subForwarderId ? 'Суб-экспедитор' : 'Водитель / Партнёр';
    };

    const togglePaid = async (entry: JournalEntry) => {
        const isSubForwarder = !!entry.subForwarderId;
        const currentPaid = isSubForwarder ? entry.isSubForwarderPaid : entry.isDriverPaid;
        const endpoint = isSubForwarder
            ? `/accounting/orders/${entry.id}/subforwarder-paid`
            : `/accounting/orders/${entry.id}/driver-paid`;
        try {
            await api.put(endpoint, { paid: !currentPaid });
            message.success(!currentPaid ? 'Оплата отмечена' : 'Отметка снята');
            fetchJournal();
            if (selectedEntry?.id === entry.id) {
                if (isSubForwarder) {
                    setSelectedEntry(prev => prev ? { ...prev, isSubForwarderPaid: !currentPaid, subForwarderPaidAt: !currentPaid ? new Date().toISOString() : null } : null);
                } else {
                    setSelectedEntry(prev => prev ? { ...prev, isDriverPaid: !currentPaid, driverPaidAt: !currentPaid ? new Date().toISOString() : null } : null);
                }
            }
        } catch { message.error('Ошибка'); }
    };

    const toggleCustomerPaid = async (entry: JournalEntry) => {
        try {
            await api.put(`/accounting/orders/${entry.id}/customer-paid`, { paid: !entry.isCustomerPaid });
            message.success(!entry.isCustomerPaid ? 'Оплата отмечена' : 'Отметка снята');
            fetchJournal();
        } catch { message.error('Ошибка'); }
    };

    // Строка «в порядке» только если все нужные платежи закрыты
    const isFullyPaid = (e: JournalEntry): boolean => {
        const customerOk = e.isCustomerPaid;
        const carrierOk = e.subForwarderId ? e.isSubForwarderPaid : e.isDriverPaid;
        return customerOk && carrierOk;
    };

    const getExpenseCost = (e: JournalEntry): number => {
        return e.subForwarderId ? (e.subForwarderPrice || 0) : (e.driverCost || 0);
    };

    const getCarrierName = (e: JournalEntry): string => {
        if (e.partner) return e.partner.name;
        if (e.subForwarder) return e.subForwarder.name;
        if (e.assignedDriverName) return e.assignedDriverName;
        if (e.driver) return `${e.driver.lastName} ${e.driver.firstName}`;
        return '—';
    };

    const openDetail = (entry: JournalEntry) => {
        setSelectedEntry(entry);
        detailForm.setFieldsValue({
            driverCost: getExpenseCost(entry),
            driverPaymentCondition: entry.driverPaymentCondition,
            driverPaymentForm: entry.driverPaymentForm,
        });
        setDrawerOpen(true);
    };

    const saveDetail = async () => {
        if (!selectedEntry) return;
        setSavingDetail(true);
        try {
            const values = detailForm.getFieldsValue();
            await api.put(`/accounting/orders/${selectedEntry.id}/update-finance`, {
                driverCost: values.driverCost,
                driverPaymentCondition: values.driverPaymentCondition,
                driverPaymentForm: values.driverPaymentForm,
            });
            message.success('Данные сохранены');
            fetchJournal();
            setDrawerOpen(false);
        } catch { message.error('Ошибка сохранения'); }
        finally { setSavingDetail(false); }
    };

    const handleSaveManual = async (values: any) => {
        try {
            const label = EXPENSE_CATEGORIES.find(c => c.value === values.category)?.label || values.category;
            const payload = { ...values, description: label, date: values.date.toISOString() };
            if (editingExpense) { await api.put(`/accounting/expenses/${editingExpense.id}`, payload); message.success('Обновлено'); }
            else { await api.post('/accounting/expenses', payload); message.success('Добавлено'); }
            setModalOpen(false); setEditingExpense(null); form.resetFields(); fetchManual();
        } catch { message.error('Ошибка сохранения'); }
    };

    const handleDeleteManual = async (id: string) => {
        try { await api.delete(`/accounting/expenses/${id}`); message.success('Удалено'); fetchManual(); }
        catch { message.error('Ошибка удаления'); }
    };

    const filtered = entries.filter(e => {
        const q = searchQuery.toLowerCase();
        if (searchQuery && !e.orderNumber.toLowerCase().includes(q) && !(e.customerCompany?.name || '').toLowerCase().includes(q) && !getCarrierName(e).toLowerCase().includes(q)) return false;
        if (paymentFilter === 'paid' && !isFullyPaid(e)) return false;
        if (paymentFilter === 'unpaid' && isFullyPaid(e)) return false;
        if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(e.createdAt); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; }
        return true;
    });

    const totalCustomer = filtered.reduce((s, e) => s + (e.customerPrice || 0), 0);
    const paidCustomer = filtered.filter(e => e.isCustomerPaid).reduce((s, e) => s + (e.customerPrice || 0), 0);
    const totalCarrier = filtered.reduce((s, e) => s + getExpenseCost(e), 0);
    const paidCarrier = filtered.filter(e => getIsPaid(e)).reduce((s, e) => s + getExpenseCost(e), 0);

    const orderExpenses = manualExpenses.filter(exp => {
        if (!exp.order) return false;
        if (searchQuery) { const q = searchQuery.toLowerCase(); if (!exp.description.toLowerCase().includes(q) && !(exp.note || '').toLowerCase().includes(q) && !(exp.order?.orderNumber || '').toLowerCase().includes(q)) return false; }
        if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(exp.date); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; }
        return true;
    });
    const orderExpensesTotal = orderExpenses.reduce((s, exp) => s + exp.amount, 0);

    const otherExpenses = manualExpenses.filter(exp => {
        if (exp.order) return false;
        if (searchQuery) { const q = searchQuery.toLowerCase(); if (!exp.description.toLowerCase().includes(q) && !(exp.note || '').toLowerCase().includes(q)) return false; }
        if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(exp.date); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; }
        return true;
    });
    const otherExpensesTotal = otherExpenses.reduce((s, exp) => s + exp.amount, 0);

    const journalColumns = [
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 90, render: (val: string) => <Text strong style={{ fontSize: 13 }}>{val}</Text> },
        { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 95, sorter: (a: JournalEntry, b: JournalEntry) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <Text style={{ fontSize: 12 }}>{dayjs(val).format('DD.MM.YYYY')}</Text> },
        { title: 'Заказчик', key: 'customer', width: 160, render: (_: any, r: JournalEntry) => <Text style={{ fontSize: 12 }}>{r.customerCompany?.name || '—'}</Text> },
        { title: 'Описание', dataIndex: 'cargoDescription', key: 'desc', ellipsis: true, render: (val: string) => <Text style={{ fontSize: 12 }}>{val}</Text> },
        {
            title: 'Заказчик оплатил', key: 'custPaid', width: 160, align: 'center' as const,
            render: (_: any, r: JournalEntry) => (
                <Space direction="vertical" size={0} style={{ alignItems: 'center' }}>
                    <Switch size="small" checked={r.isCustomerPaid} onChange={(_, e) => { e.stopPropagation(); toggleCustomerPaid(r); }} checkedChildren={<CheckCircleOutlined />} unCheckedChildren={<CloseCircleOutlined />} style={{ background: r.isCustomerPaid ? '#52c41a' : '#ff4d4f' }} />
                    <Text style={{ fontSize: 11, color: r.isCustomerPaid ? '#389e0d' : '#cf1322' }}>{(r.customerPrice || 0).toLocaleString('ru-RU')} ₸</Text>
                </Space>
            ),
        },
        {
            title: 'Мы оплатили', key: 'carrierPaid', width: 160, align: 'center' as const,
            render: (_: any, r: JournalEntry) => (
                <Space direction="vertical" size={0} style={{ alignItems: 'center' }}>
                    <Space size={4}>
                        <Switch size="small" checked={getIsPaid(r)} onChange={(_, e) => { e.stopPropagation(); togglePaid(r); }} checkedChildren={<CheckCircleOutlined />} unCheckedChildren={<CloseCircleOutlined />} style={{ background: getIsPaid(r) ? '#52c41a' : '#ff4d4f' }} />
                        {r.subForwarderId && <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>Суб</Tag>}
                    </Space>
                    <Text style={{ fontSize: 11, color: getIsPaid(r) ? '#389e0d' : '#cf1322' }}>{getExpenseCost(r).toLocaleString('ru-RU')} ₸</Text>
                    <Text type="secondary" style={{ fontSize: 10 }}>{getCarrierName(r)}</Text>
                </Space>
            ),
        },
        { title: 'Статус', dataIndex: 'status', key: 'status', width: 110, render: (val: string) => <Tag color={val === 'COMPLETED' ? 'green' : val === 'PROBLEM' ? 'red' : 'blue'} style={{ fontSize: 11 }}>{STATUS_LABELS[val] || val}</Tag> },
    ];

    const manualColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, sorter: (a: ManualExpense, b: ManualExpense) => dayjs(a.date).unix() - dayjs(b.date).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <Text style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</Text> },
        { title: 'Заявка №', key: 'orderNum', width: 100, render: (_: any, r: ManualExpense) => r.order ? <Text style={{ fontSize: 13 }}>{r.order.orderNumber}</Text> : <Text type="secondary">—</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'category', width: 150, render: (val: string) => <Tag color={categoryColors[val] || 'default'} style={{ fontSize: 12 }}>{EXPENSE_CATEGORIES.find(c => c.value === val)?.label || val}</Tag> },
        { title: 'Сумма', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' as const, render: (val: number) => <Text strong style={{ fontSize: 13, color: '#cf1322' }}>−{val.toLocaleString('ru-RU')} ₸</Text> },
        { title: 'Примечание', dataIndex: 'note', key: 'note', ellipsis: true, render: (val: string) => <Text style={{ fontSize: 13 }}>{val || '—'}</Text> },
        { title: '', key: 'actions', width: 80, render: (_: any, r: ManualExpense) => <Space><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingExpense(r); form.setFieldsValue({ ...r, date: dayjs(r.date) }); setModalOpen(true); }} /><Popconfirm title="Удалить?" onConfirm={() => handleDeleteManual(r.id)} okText="Да" cancelText="Нет"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
    ];

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/forwarder/accounting')} style={{ padding: '4px 8px' }} />
                <Title level={4} style={{ margin: 0 }}>Расход денежных средств</Title>
            </div>

            <Segmented 
                value={tab} 
                onChange={(v) => { setTab(v as string); setSearchQuery(''); setPaymentFilter(undefined); setDateRange(null); }} 
                options={[
                    { label: 'Оплата перевозчикам', value: 'journal' }, 
                    { label: 'Расходы по заявкам', value: 'order_expenses' },
                    { label: 'Прочие расходы', value: 'other_expenses' }
                ]} 
                style={{ marginBottom: 16 }} 
            />

            {tab === 'journal' ? (
                <>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                        <Col xs={24} sm={6}><Card size="small"><Statistic title="Заказчики должны" value={totalCustomer - paidCustomer} suffix="₸" valueStyle={{ fontSize: 18, color: (totalCustomer - paidCustomer) > 0 ? '#cf1322' : '#389e0d' }} formatter={(v) => Number(v).toLocaleString('ru-RU')} /></Card></Col>
                        <Col xs={24} sm={6}><Card size="small"><Statistic title="Заказчики оплатили" value={paidCustomer} suffix="₸" valueStyle={{ fontSize: 18, color: '#389e0d' }} formatter={(v) => Number(v).toLocaleString('ru-RU')} /></Card></Col>
                        <Col xs={24} sm={6}><Card size="small"><Statistic title="Мы должны исполнителям" value={totalCarrier - paidCarrier} suffix="₸" valueStyle={{ fontSize: 18, color: (totalCarrier - paidCarrier) > 0 ? '#cf1322' : '#389e0d' }} formatter={(v) => Number(v).toLocaleString('ru-RU')} /></Card></Col>
                        <Col xs={24} sm={6}><Card size="small"><Statistic title="Мы оплатили" value={paidCarrier} suffix="₸" valueStyle={{ fontSize: 18, color: '#389e0d' }} formatter={(v) => Number(v).toLocaleString('ru-RU')} /></Card></Col>
                    </Row>
                    <Card size="small" style={{ marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 280 }} allowClear size="small" />
                            <Select placeholder="Статус оплаты" value={paymentFilter} onChange={setPaymentFilter} allowClear style={{ width: 160 }} size="small" options={[{ value: 'paid', label: 'Оплачено' }, { value: 'unpaid', label: 'Не оплачено' }]} />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" />
                        </Space>
                    </Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}>
                        <Table columns={journalColumns} dataSource={filtered} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет данных' }}
                            pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }}
                            rowClassName={(r) => `${!isFullyPaid(r) ? 'unpaid-row' : ''} clickable-row`}
                            onRow={(record) => ({ onClick: () => openDetail(record) })}
                        />
                    </Card>
                </>
            ) : tab === 'order_expenses' ? (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Card size="small" style={{ flex: 1, marginRight: 12 }}>
                            <Space size="large">
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Итого расходов по заявкам</Text><div><Text strong style={{ fontSize: 20, color: '#cf1322' }}>{orderExpensesTotal.toLocaleString('ru-RU')} ₸</Text></div></div>
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Записей</Text><div><Text strong style={{ fontSize: 20 }}>{orderExpenses.length}</Text></div></div>
                            </Space>
                        </Card>
                    </div>
                    <Card size="small" style={{ marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear size="small" />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" />
                        </Space>
                    </Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}>
                        <Table columns={manualColumns} dataSource={orderExpenses} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }} />
                    </Card>
                </>
            ) : (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Card size="small" style={{ flex: 1, marginRight: 12 }}>
                            <Space size="large">
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Итого прочих расходов</Text><div><Text strong style={{ fontSize: 20, color: '#cf1322' }}>{otherExpensesTotal.toLocaleString('ru-RU')} ₸</Text></div></div>
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Записей</Text><div><Text strong style={{ fontSize: 20 }}>{otherExpenses.length}</Text></div></div>
                            </Space>
                        </Card>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingExpense(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalOpen(true); }}>Добавить расход</Button>
                    </div>
                    <Card size="small" style={{ marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear size="small" />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" />
                        </Space>
                    </Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}>
                        <Table columns={manualColumns} dataSource={otherExpenses} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }} />
                    </Card>
                </>
            )}

            {/* ==================== DETAIL DRAWER ==================== */}
            <Drawer
                title={<Space><FileTextOutlined /><span>Расход ДС {selectedEntry?.orderNumber} от {selectedEntry ? dayjs(selectedEntry.createdAt).format('DD.MM.YYYY HH:mm') : ''}</span></Space>}
                width={520}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                extra={<Button icon={<SaveOutlined />} type="primary" onClick={saveDetail} loading={savingDetail}>Сохранить</Button>}
            >
                {selectedEntry && (
                    <div>
                        <Descriptions column={1} size="small" bordered labelStyle={{ width: 160, fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
                            <Descriptions.Item label="Номер">{selectedEntry.orderNumber}</Descriptions.Item>
                            <Descriptions.Item label="Дата создания">{dayjs(selectedEntry.createdAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                            <Descriptions.Item label="Контрагент">
                                <Text strong style={{ color: getIsPaid(selectedEntry) ? undefined : '#cf1322' }}>
                                    {getCarrierName(selectedEntry)}
                                </Text>
                                <div><Text type="secondary" style={{ fontSize: 12 }}>{getExecutorLabel(selectedEntry)}</Text></div>
                            </Descriptions.Item>
                            {selectedEntry.assignedDriverPhone && (
                                <Descriptions.Item label="Телефон">{selectedEntry.assignedDriverPhone}</Descriptions.Item>
                            )}
                            <Descriptions.Item label="Вид операции">Оплата перевозчику</Descriptions.Item>
                            <Descriptions.Item label="Статус заявки">
                                <Tag color={selectedEntry.status === 'COMPLETED' ? 'green' : selectedEntry.status === 'PROBLEM' ? 'red' : 'blue'}>
                                    {STATUS_LABELS[selectedEntry.status] || selectedEntry.status}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Статус оплаты">
                                <Switch
                                    checked={getIsPaid(selectedEntry)}
                                    onChange={() => togglePaid(selectedEntry)}
                                    checkedChildren="Оплачено"
                                    unCheckedChildren="Не оплачено"
                                    style={{ background: getIsPaid(selectedEntry) ? '#52c41a' : '#ff4d4f' }}
                                />
                                {getPaidAt(selectedEntry) && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{dayjs(getPaidAt(selectedEntry)).format('DD.MM.YYYY')}</Text>}
                            </Descriptions.Item>
                        </Descriptions>

                        <Divider style={{ margin: '16px 0' }}>Финансы</Divider>

                        <Form form={detailForm} layout="vertical" size="small">
                            <Form.Item name="driverCost" label="Сумма документа (₸)">
                                <InputNumber style={{ width: '100%' }} min={0} formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="driverPaymentCondition" label="Условие оплаты">
                                        <Select allowClear placeholder="Не указано">
                                            <Select.Option value="По факту">По факту</Select.Option>
                                            <Select.Option value="Предоплата">Предоплата</Select.Option>
                                            <Select.Option value="Отсрочка 5">Отсрочка 5 дней</Select.Option>
                                            <Select.Option value="Отсрочка 10">Отсрочка 10 дней</Select.Option>
                                            <Select.Option value="Отсрочка 15">Отсрочка 15 дней</Select.Option>
                                            <Select.Option value="Отсрочка 30">Отсрочка 30 дней</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="driverPaymentForm" label="Форма оплаты">
                                        <Select allowClear placeholder="Не указано">
                                            <Select.Option value="Безналичные">Безналичные</Select.Option>
                                            <Select.Option value="Безналичные с НДС">Безналичные с НДС</Select.Option>
                                            <Select.Option value="Безналичные без НДС">Безналичные без НДС</Select.Option>
                                            <Select.Option value="Наличные">Наличные</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>

                        <Divider style={{ margin: '16px 0' }}>Сделка</Divider>

                        <Card size="small" style={{ background: '#fafafa' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Заявка</Text>
                                    <div>
                                        <Button type="link" size="small" style={{ padding: 0, fontSize: 13 }} onClick={() => router.push(`/forwarder/orders/${selectedEntry.id}`)}>
                                            {selectedEntry.orderNumber} от {dayjs(selectedEntry.createdAt).format('DD.MM.YYYY HH:mm')}
                                        </Button>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{selectedEntry.cargoDescription}</Text>
                                </div>
                                <Text strong style={{ fontSize: 16 }}>{getExpenseCost(selectedEntry).toLocaleString('ru-RU')} ₸</Text>
                            </div>
                        </Card>

                        <Divider style={{ margin: '16px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                            <Text strong style={{ fontSize: 14 }}>Всего:</Text>
                            <Text strong style={{ fontSize: 18 }}>{(detailForm.getFieldValue('driverCost') || getExpenseCost(selectedEntry)).toLocaleString('ru-RU')} ₸</Text>
                        </div>
                    </div>
                )}
            </Drawer>

            {/* ==================== MANUAL ADD MODAL ==================== */}
            <Modal title={editingExpense ? 'Редактировать' : 'Новый расход'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingExpense(null); }} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSaveManual} initialValues={{ date: dayjs() }}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}><Select options={EXPENSE_CATEGORIES} placeholder="Выберите" /></Form.Item>
                    <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} placeholder="0" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} /></Form.Item>
                    <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} placeholder="Доп. информация" /></Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}><Space><Button onClick={() => { setModalOpen(false); setEditingExpense(null); }}>Отмена</Button><Button type="primary" htmlType="submit">{editingExpense ? 'Сохранить' : 'Добавить'}</Button></Space></Form.Item>
                </Form>
            </Modal>

            <style jsx global>{`
                .unpaid-row { background: #fff2f0 !important; }
                .unpaid-row:hover > td { background: #ffebe8 !important; }
                .clickable-row { cursor: pointer; }
                .clickable-row:hover > td { background: #e6f7ff !important; }
                .unpaid-row.clickable-row:hover > td { background: #ffebe8 !important; }
            `}</style>
        </div>
    );
}
