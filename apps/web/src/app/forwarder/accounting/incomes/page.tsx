'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Typography, Space, Tag, DatePicker, Input, Select, Switch, message, Tooltip, Statistic, Row, Col, Segmented, Modal, Form, InputNumber, Popconfirm, Drawer, Descriptions, Divider } from 'antd';
import {
    SearchOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    ArrowLeftOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    FileTextOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface JournalEntry {
    id: string;
    orderNumber: string;
    createdAt: string;
    status: string;
    cargoDescription: string;
    customerPrice: number;
    customerPriceType: string;
    isCustomerPaid: boolean;
    customerPaidAt: string | null;
    customerPaymentCondition: string | null;
    customerPaymentForm: string | null;
    pickupDate: string | null;
    completedAt: string | null;
    customerCompany: { id: string; name: string } | null;
    customer: { id: string; firstName: string; lastName: string } | null;
}

interface ManualIncome {
    id: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    note?: string;
    order?: { id: string; orderNumber: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Ожидает', ASSIGNED: 'Назначен', EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке', LOADING: 'Погрузка', IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке', UNLOADING: 'Выгрузка', COMPLETED: 'Завершён', PROBLEM: 'Проблема',
};

const PAYMENT_CONDITIONS: Record<string, string> = {
    'По факту': 'По факту', 'Предоплата': 'Предоплата', 'Отсрочка': 'Отсрочка',
};

const INCOME_CATEGORIES = [
    { value: 'order_payment', label: 'Оплата за перевозку' },
    { value: 'prepayment', label: 'Предоплата' },
    { value: 'refund', label: 'Возврат' },
    { value: 'bonus', label: 'Бонус/Премия' },
    { value: 'insurance_payout', label: 'Страховая выплата' },
    { value: 'corporate', label: 'Корпоративное' },
    { value: 'other', label: 'Прочее' },
];

const categoryColors: Record<string, string> = {
    order_payment: 'green', prepayment: 'blue', refund: 'orange',
    bonus: 'purple', insurance_payout: 'cyan', corporate: 'geekblue', other: 'default',
};

export default function ForwarderIncomesPage() {
    const [tab, setTab] = useState<string>('journal');
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [manualIncomes, setManualIncomes] = useState<ManualIncome[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentFilter, setPaymentFilter] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingIncome, setEditingIncome] = useState<ManualIncome | null>(null);
    const [form] = Form.useForm();
    const [detailForm] = Form.useForm();
    const router = useRouter();

    // Detail drawer
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
    const [savingDetail, setSavingDetail] = useState(false);

    useEffect(() => { fetchJournal(); fetchManual(); }, []);

    const fetchJournal = async () => {
        setLoading(true);
        try { const res = await api.get('/accounting/incomes-journal'); setEntries(res.data); }
        catch { console.error('Failed to fetch journal'); }
        finally { setLoading(false); }
    };

    const fetchManual = async () => {
        try { const res = await api.get('/accounting/incomes'); setManualIncomes(res.data); }
        catch { console.error('Failed to fetch manual incomes'); }
    };

    const togglePaid = async (orderId: string, currentPaid: boolean) => {
        try {
            await api.put(`/accounting/orders/${orderId}/customer-paid`, { paid: !currentPaid });
            message.success(!currentPaid ? 'Оплата отмечена' : 'Отметка снята');
            fetchJournal();
            if (selectedEntry?.id === orderId) {
                setSelectedEntry(prev => prev ? { ...prev, isCustomerPaid: !currentPaid, customerPaidAt: !currentPaid ? new Date().toISOString() : null } : null);
            }
        } catch { message.error('Ошибка'); }
    };

    const openDetail = (entry: JournalEntry) => {
        setSelectedEntry(entry);
        detailForm.setFieldsValue({
            customerPrice: entry.customerPrice,
            customerPaymentCondition: entry.customerPaymentCondition,
            customerPaymentForm: entry.customerPaymentForm,
        });
        setDrawerOpen(true);
    };

    const saveDetail = async () => {
        if (!selectedEntry) return;
        setSavingDetail(true);
        try {
            const values = detailForm.getFieldsValue();
            await api.put(`/accounting/orders/${selectedEntry.id}/update-finance`, {
                customerPrice: values.customerPrice,
                customerPaymentCondition: values.customerPaymentCondition,
                customerPaymentForm: values.customerPaymentForm,
            });
            message.success('Данные сохранены');
            fetchJournal();
            setDrawerOpen(false);
        } catch { message.error('Ошибка сохранения'); }
        finally { setSavingDetail(false); }
    };

    const handleSaveManual = async (values: any) => {
        try {
            const payload = { ...values, date: values.date.toISOString() };
            if (editingIncome) {
                await api.put(`/accounting/incomes/${editingIncome.id}`, payload);
                message.success('Обновлено');
            } else {
                await api.post('/accounting/incomes', payload);
                message.success('Добавлено');
            }
            setModalOpen(false); setEditingIncome(null); form.resetFields(); fetchManual();
        } catch { message.error('Ошибка сохранения'); }
    };

    const handleDeleteManual = async (id: string) => {
        try { await api.delete(`/accounting/incomes/${id}`); message.success('Удалено'); fetchManual(); }
        catch { message.error('Ошибка удаления'); }
    };

    const filtered = entries.filter(e => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!e.orderNumber.toLowerCase().includes(q) && !(e.customerCompany?.name || '').toLowerCase().includes(q) && !e.cargoDescription.toLowerCase().includes(q)) return false;
        }
        if (paymentFilter === 'paid' && !e.isCustomerPaid) return false;
        if (paymentFilter === 'unpaid' && e.isCustomerPaid) return false;
        if (dateRange && dateRange[0] && dateRange[1]) {
            const d = dayjs(e.createdAt);
            if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false;
        }
        return true;
    });

    const totalSum = filtered.reduce((s, e) => s + (e.customerPrice || 0), 0);
    const paidSum = filtered.filter(e => e.isCustomerPaid).reduce((s, e) => s + (e.customerPrice || 0), 0);
    const debtSum = totalSum - paidSum;

    const filteredManual = manualIncomes.filter(inc => {
        if (searchQuery) { const q = searchQuery.toLowerCase(); if (!inc.description.toLowerCase().includes(q) && !(inc.note || '').toLowerCase().includes(q)) return false; }
        if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(inc.date); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; }
        return true;
    });
    const manualTotal = filteredManual.reduce((s, inc) => s + inc.amount, 0);

    const journalColumns = [
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 100, render: (val: string) => <Text strong style={{ fontSize: 13 }}>{val}</Text> },
        { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 100, sorter: (a: JournalEntry, b: JournalEntry) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <Text style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</Text> },
        { title: 'Заказчик', key: 'customer', width: 200, render: (_: any, r: JournalEntry) => { const name = r.customerCompany?.name || (r.customer ? `${r.customer.lastName} ${r.customer.firstName}` : '—'); return <Text strong={!r.isCustomerPaid} style={{ fontSize: 13, color: r.isCustomerPaid ? undefined : '#cf1322' }}>{name}</Text>; } },
        { title: 'Описание', dataIndex: 'cargoDescription', key: 'cargoDescription', ellipsis: true, render: (val: string) => <Text style={{ fontSize: 13 }}>{val}</Text> },
        { title: 'Статус', dataIndex: 'status', key: 'status', width: 120, render: (val: string) => <Tag color={val === 'COMPLETED' ? 'green' : val === 'PROBLEM' ? 'red' : 'blue'} style={{ fontSize: 12 }}>{STATUS_LABELS[val] || val}</Tag> },
        { title: 'Сумма', dataIndex: 'customerPrice', key: 'customerPrice', width: 130, align: 'right' as const, sorter: (a: JournalEntry, b: JournalEntry) => (a.customerPrice || 0) - (b.customerPrice || 0), render: (val: number) => <Text strong style={{ fontSize: 13 }}>{(val || 0).toLocaleString('ru-RU')} ₸</Text> },
        { title: 'Оплата', key: 'paid', width: 90, align: 'center' as const, render: (_: any, r: JournalEntry) => <Tooltip title={r.isCustomerPaid ? `Оплачено ${r.customerPaidAt ? dayjs(r.customerPaidAt).format('DD.MM.YYYY') : ''}` : 'Не оплачено'}><Switch size="small" checked={r.isCustomerPaid} onChange={(_, e) => { e.stopPropagation(); togglePaid(r.id, r.isCustomerPaid); }} checkedChildren={<CheckCircleOutlined />} unCheckedChildren={<CloseCircleOutlined />} style={{ background: r.isCustomerPaid ? '#52c41a' : '#ff4d4f' }} /></Tooltip> },
    ];

    const manualColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, sorter: (a: ManualIncome, b: ManualIncome) => dayjs(a.date).unix() - dayjs(b.date).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <Text style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'category', width: 170, render: (val: string) => <Tag color={categoryColors[val] || 'default'} style={{ fontSize: 12 }}>{INCOME_CATEGORIES.find(c => c.value === val)?.label || val}</Tag> },
        { title: 'Описание', dataIndex: 'description', key: 'description', ellipsis: true, render: (val: string) => <Text style={{ fontSize: 13 }}>{val}</Text> },
        { title: 'Сумма', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' as const, sorter: (a: ManualIncome, b: ManualIncome) => a.amount - b.amount, render: (val: number) => <Text strong style={{ fontSize: 13, color: '#389e0d' }}>+{val.toLocaleString('ru-RU')} ₸</Text> },
        { title: 'Примечание', dataIndex: 'note', key: 'note', width: 180, ellipsis: true, render: (val: string) => <Text style={{ fontSize: 13 }}>{val || '—'}</Text> },
        { title: '', key: 'actions', width: 80, render: (_: any, r: ManualIncome) => <Space><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingIncome(r); form.setFieldsValue({ ...r, date: dayjs(r.date) }); setModalOpen(true); }} /><Popconfirm title="Удалить?" onConfirm={() => handleDeleteManual(r.id)} okText="Да" cancelText="Нет"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
    ];

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/forwarder/accounting')} style={{ padding: '4px 8px' }} />
                <Title level={4} style={{ margin: 0 }}>Поступление денежных средств</Title>
            </div>

            <Segmented
                value={tab}
                onChange={(v) => { setTab(v as string); setSearchQuery(''); setPaymentFilter(undefined); setDateRange(null); }}
                options={[{ label: 'По заявкам', value: 'journal' }, { label: 'Прочие поступления', value: 'manual' }]}
                style={{ marginBottom: 16 }}
            />

            {tab === 'journal' ? (
                <>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                        <Col xs={24} sm={8}><Card size="small"><Statistic title="Общая сумма" value={totalSum} suffix="₸" valueStyle={{ fontSize: 20 }} formatter={(val) => Number(val).toLocaleString('ru-RU')} /></Card></Col>
                        <Col xs={24} sm={8}><Card size="small"><Statistic title="Оплачено" value={paidSum} suffix="₸" valueStyle={{ fontSize: 20, color: '#389e0d' }} formatter={(val) => Number(val).toLocaleString('ru-RU')} /></Card></Col>
                        <Col xs={24} sm={8}><Card size="small"><Statistic title="Задолженность" value={debtSum} suffix="₸" valueStyle={{ fontSize: 20, color: debtSum > 0 ? '#cf1322' : '#389e0d' }} formatter={(val) => Number(val).toLocaleString('ru-RU')} /></Card></Col>
                    </Row>
                    <Card size="small" style={{ marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск: № заявки, компания, груз..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 280 }} allowClear size="small" />
                            <Select placeholder="Статус оплаты" value={paymentFilter} onChange={setPaymentFilter} allowClear style={{ width: 160 }} size="small" options={[{ value: 'paid', label: 'Оплачено' }, { value: 'unpaid', label: 'Не оплачено' }]} />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" />
                        </Space>
                    </Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}>
                        <Table
                            columns={journalColumns}
                            dataSource={filtered}
                            rowKey="id"
                            loading={loading}
                            size="small"
                            locale={{ emptyText: 'Нет данных' }}
                            pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }}
                            rowClassName={(r) => `${r.isCustomerPaid ? '' : 'unpaid-row'} clickable-row`}
                            onRow={(record) => ({ onClick: () => openDetail(record) })}
                        />
                    </Card>
                </>
            ) : (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Card size="small" style={{ flex: 1, marginRight: 12 }}>
                            <Space size="large">
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Итого</Text><div><Text strong style={{ fontSize: 20, color: '#389e0d' }}>{manualTotal.toLocaleString('ru-RU')} ₸</Text></div></div>
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Записей</Text><div><Text strong style={{ fontSize: 20 }}>{filteredManual.length}</Text></div></div>
                            </Space>
                        </Card>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingIncome(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalOpen(true); }}>Добавить</Button>
                    </div>
                    <Card size="small" style={{ marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск по описанию..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear size="small" />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" />
                        </Space>
                    </Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}>
                        <Table columns={manualColumns} dataSource={filteredManual} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }} />
                    </Card>
                </>
            )}

            {/* ==================== DETAIL DRAWER ==================== */}
            <Drawer
                title={
                    <Space>
                        <FileTextOutlined />
                        <span>Поступление ДС {selectedEntry?.orderNumber} от {selectedEntry ? dayjs(selectedEntry.createdAt).format('DD.MM.YYYY HH:mm') : ''}</span>
                    </Space>
                }
                width={520}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                extra={
                    <Space>
                        <Button icon={<SaveOutlined />} type="primary" onClick={saveDetail} loading={savingDetail}>Сохранить</Button>
                    </Space>
                }
            >
                {selectedEntry && (
                    <div>
                        <Descriptions column={1} size="small" bordered labelStyle={{ width: 160, fontSize: 13 }} contentStyle={{ fontSize: 13 }}>
                            <Descriptions.Item label="Номер">{selectedEntry.orderNumber}</Descriptions.Item>
                            <Descriptions.Item label="Дата создания">{dayjs(selectedEntry.createdAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                            <Descriptions.Item label="Контрагент">
                                <Text strong style={{ color: selectedEntry.isCustomerPaid ? undefined : '#cf1322' }}>
                                    {selectedEntry.customerCompany?.name || (selectedEntry.customer ? `${selectedEntry.customer.lastName} ${selectedEntry.customer.firstName}` : '—')}
                                </Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Вид операции">Оплата от заказчика</Descriptions.Item>
                            <Descriptions.Item label="Статус заявки">
                                <Tag color={selectedEntry.status === 'COMPLETED' ? 'green' : selectedEntry.status === 'PROBLEM' ? 'red' : 'blue'}>
                                    {STATUS_LABELS[selectedEntry.status] || selectedEntry.status}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Статус оплаты">
                                <Switch
                                    checked={selectedEntry.isCustomerPaid}
                                    onChange={() => togglePaid(selectedEntry.id, selectedEntry.isCustomerPaid)}
                                    checkedChildren="Оплачено"
                                    unCheckedChildren="Не оплачено"
                                    style={{ background: selectedEntry.isCustomerPaid ? '#52c41a' : '#ff4d4f' }}
                                />
                                {selectedEntry.customerPaidAt && (
                                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                                        {dayjs(selectedEntry.customerPaidAt).format('DD.MM.YYYY')}
                                    </Text>
                                )}
                            </Descriptions.Item>
                        </Descriptions>

                        <Divider style={{ margin: '16px 0' }}>Финансы</Divider>

                        <Form form={detailForm} layout="vertical" size="small">
                            <Form.Item name="customerPrice" label="Сумма документа (₸)">
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={0}
                                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                                />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="customerPaymentCondition" label="Условие оплаты">
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
                                    <Form.Item name="customerPaymentForm" label="Форма оплаты">
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
                                <Text strong style={{ fontSize: 16 }}>
                                    {(selectedEntry.customerPrice || 0).toLocaleString('ru-RU')} ₸
                                </Text>
                            </div>
                        </Card>

                        <Divider style={{ margin: '16px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                            <Text strong style={{ fontSize: 14 }}>Всего:</Text>
                            <Text strong style={{ fontSize: 18 }}>
                                {(detailForm.getFieldValue('customerPrice') || selectedEntry.customerPrice || 0).toLocaleString('ru-RU')} ₸
                            </Text>
                        </div>
                    </div>
                )}
            </Drawer>

            {/* ==================== MANUAL ADD MODAL ==================== */}
            <Modal title={editingIncome ? 'Редактировать' : 'Новое поступление'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingIncome(null); }} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSaveManual} initialValues={{ date: dayjs() }}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true, message: 'Укажите дату' }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true, message: 'Выберите категорию' }]}><Select options={INCOME_CATEGORIES} placeholder="Выберите категорию" /></Form.Item>
                    <Form.Item name="description" label="Описание" rules={[{ required: true, message: 'Введите описание' }]}><Input placeholder="Описание поступления" /></Form.Item>
                    <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true, message: 'Укажите сумму' }]}><InputNumber style={{ width: '100%' }} min={0} placeholder="0" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} /></Form.Item>
                    <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} placeholder="Дополнительная информация" /></Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}><Space><Button onClick={() => { setModalOpen(false); setEditingIncome(null); }}>Отмена</Button><Button type="primary" htmlType="submit">{editingIncome ? 'Сохранить' : 'Добавить'}</Button></Space></Form.Item>
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
