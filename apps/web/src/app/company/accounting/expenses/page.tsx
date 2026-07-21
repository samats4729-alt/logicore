'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Typography, Space, Tag, DatePicker, Input, Select, message, Segmented, Modal, Form, InputNumber, Popconfirm, Drawer, Descriptions, Divider, theme } from 'antd';
import {
    SearchOutlined, ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, DollarOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/auth';
import StatusPill, { STATUS_LABELS } from '@/components/ui/StatusPill';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface JournalEntry {
    id: string; orderNumber: string; createdAt: string; status: string;
    cargoDescription: string; customerPrice: number; isCustomerPaid: boolean; customerPaidAt: string | null;
    forwarder: { id: string; name: string } | null;
}
interface ManualExpense { id: string; date: string; category: string; description: string; amount: number; note?: string; order?: { orderNumber: string }; }

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

export default function CompanyExpensesPage() {
    const { token } = theme.useToken();
    const { user } = useAuthStore();
    const canEditFinance = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';
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
    const router = useRouter();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

    useEffect(() => { fetchJournal(); fetchManual(); }, []);
    const fetchJournal = async () => { setLoading(true); try { const res = await api.get('/accounting/customer-expenses-journal'); setEntries(res.data); } catch {} finally { setLoading(false); } };
    const fetchManual = async () => { try { const res = await api.get('/accounting/expenses'); setManualExpenses(res.data); } catch {} };

    const getCarrierName = (e: JournalEntry): string => { if (e.forwarder) return e.forwarder.name; return '—'; };
    const openDetail = (entry: JournalEntry) => { setSelectedEntry(entry); setDrawerOpen(true); };

    const handleSaveManual = async (values: any) => {
        try {
            const label = EXPENSE_CATEGORIES.find(c => c.value === values.category)?.label || values.category;
            const payload = { ...values, description: label, date: values.date.toISOString() };
            if (editingExpense) { await api.put(`/accounting/expenses/${editingExpense.id}`, payload); message.success('Обновлено'); }
            else { await api.post('/accounting/expenses', payload); message.success('Добавлено'); }
            setModalOpen(false); setEditingExpense(null); form.resetFields(); fetchManual();
        } catch { message.error('Ошибка сохранения'); }
    };
    const handleDeleteManual = async (id: string) => { try { await api.delete(`/accounting/expenses/${id}`); message.success('Удалено'); fetchManual(); } catch { message.error('Ошибка удаления'); } };

    const filtered = entries.filter(e => {
        if (searchQuery) { const q = searchQuery.toLowerCase(); if (!e.orderNumber.toLowerCase().includes(q) && !getCarrierName(e).toLowerCase().includes(q) && !e.cargoDescription.toLowerCase().includes(q)) return false; }
        if (paymentFilter === 'paid' && !e.isCustomerPaid) return false;
        if (paymentFilter === 'unpaid' && e.isCustomerPaid) return false;
        if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(e.createdAt); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; }
        return true;
    });
    const totalSum = filtered.reduce((s, e) => s + (e.customerPrice || 0), 0);
    const paidSum = filtered.filter(e => e.isCustomerPaid).reduce((s, e) => s + (e.customerPrice || 0), 0);
    const debtSum = totalSum - paidSum;

    const orderExpenses = manualExpenses.filter(exp => {
        if (!exp.order) return false;
        if (searchQuery) { const q = searchQuery.toLowerCase(); if (!exp.description.toLowerCase().includes(q) && !(exp.note || '').toLowerCase().includes(q)) return false; }
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
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 100, render: (val: string) => <strong style={{ fontSize: 13 }}>{val}</strong> },
        { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 100, sorter: (a: JournalEntry, b: JournalEntry) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <span style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</span> },
        { title: 'Груз', dataIndex: 'cargoDescription', key: 'cargoDescription', ellipsis: true, render: (val: string) => <span style={{ fontSize: 13 }}>{val || '—'}</span> },
        { title: 'Перевозчик', key: 'carrier', render: (_: any, r: JournalEntry) => <span style={{ fontSize: 13 }}>{getCarrierName(r)}</span> },
        { title: 'Статус', dataIndex: 'status', key: 'status', width: 120, render: (val: string) => <StatusPill status={val} /> },
        { title: 'Сумма', dataIndex: 'customerPrice', key: 'customerPrice', width: 130, align: 'right' as const, sorter: (a: JournalEntry, b: JournalEntry) => (a.customerPrice || 0) - (b.customerPrice || 0), render: (val: number) => <strong style={{ fontSize: 13 }}>{val.toLocaleString('ru-RU')} ₸</strong> },
        { title: 'Оплата', key: 'payment', width: 100, render: (_: any, r: JournalEntry) => r.isCustomerPaid ? <Tag color="green">Оплачено</Tag> : <Tag color="red">Не оплачено</Tag> },
    ];

    const manualColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, sorter: (a: ManualExpense, b: ManualExpense) => dayjs(a.date).unix() - dayjs(b.date).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <span style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</span> },
        { title: 'Категория', dataIndex: 'category', key: 'category', width: 170, render: (val: string) => <Tag color={categoryColors[val] || 'default'} style={{ fontSize: 12 }}>{EXPENSE_CATEGORIES.find(c => c.value === val)?.label || val}</Tag> },
        { title: 'Описание', dataIndex: 'description', key: 'description', ellipsis: true, render: (val: string, r: ManualExpense) => (
            <Space direction="vertical" size={0}>
                <span style={{ fontSize: 13 }}>{val}</span>
                {r.order && <Tag color="blue" style={{ marginTop: 4 }}>Заявка {r.order.orderNumber}</Tag>}
            </Space>
        ) },
        { title: 'Сумма', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' as const, render: (val: number) => <strong style={{ fontSize: 13, color: '#dc3545' }}>-{val.toLocaleString('ru-RU')} ₸</strong> },
        { title: 'Примечание', dataIndex: 'note', key: 'note', width: 180, ellipsis: true, render: (val: string) => <span style={{ fontSize: 13 }}>{val || '—'}</span> },
        { title: '', key: 'actions', width: 80, render: (_: any, r: ManualExpense) => canEditFinance ? <Space><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingExpense(r); form.setFieldsValue({ ...r, date: dayjs(r.date) }); setModalOpen(true); }} /><Popconfirm title="Удалить?" onConfirm={() => handleDeleteManual(r.id)} okText="Да" cancelText="Нет"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> : null },
    ];

    const currentTotal = tab === 'journal' ? totalSum : tab === 'order_expenses' ? orderExpensesTotal : otherExpensesTotal;

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Расходы
                    </div>
                    <h1 className="lc2-title">Расходы</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Учёт исходящих платежей по заявкам и прочих расходов
                    </p>
                    {tab !== 'journal' && canEditFinance && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingExpense(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalOpen(true); }} className="lc-cta">
                            Добавить расход
                        </Button>
                    )}
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#ffeef0', color: '#dc3545' }}>
                            <DollarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Сумма</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#dc3545' }}>
                                {currentTotal.toLocaleString('ru-RU')} ₸
                            </div>
                            <div className="lc2-msub">за период</div>
                        </div>
                    </div>
                </div>
            </div>

            <Segmented value={tab} onChange={(v) => { setTab(v as string); setSearchQuery(''); setDateRange(null); }}
                options={[
                    { label: 'Журнал', value: 'journal' },
                    { label: 'По заявкам', value: 'order_expenses' },
                    { label: 'Прочие', value: 'other_expenses' }
                ]} style={{ marginBottom: 16 }} />

            {tab === 'journal' ? (
                <>
                    <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear />
                            <Select placeholder="Статус оплаты" value={paymentFilter} onChange={setPaymentFilter} style={{ width: 180 }} allowClear options={[{ value: 'paid', label: 'Оплачено' }, { value: 'unpaid', label: 'Не оплачено' }]} />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} />
                        </Space>
                    </div>
                    <div className="lc-card" style={{ padding: 0 }}>
                        <Table columns={journalColumns} dataSource={filtered} rowKey="id" loading={loading} size="small"
                            locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true }}
                            onRow={(record) => ({ onClick: () => openDetail(record), style: { cursor: 'pointer' } })} />
                    </div>
                </>
            ) : (
                <>
                    <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} />
                        </Space>
                    </div>
                    <div className="lc-card" style={{ padding: 0 }}>
                        <Table columns={manualColumns} dataSource={tab === 'order_expenses' ? orderExpenses : otherExpenses} rowKey="id" loading={loading} size="small"
                            locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true }} />
                    </div>
                </>
            )}

            <Drawer title={<Space><FileTextOutlined /><span>Расход ДС {selectedEntry?.orderNumber}</span></Space>}
                open={drawerOpen} onClose={() => setDrawerOpen(false)} width={500}>
                {selectedEntry && (
                    <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="Заявка">{selectedEntry.orderNumber}</Descriptions.Item>
                        <Descriptions.Item label="Дата">{dayjs(selectedEntry.createdAt).format('DD.MM.YYYY HH:mm')}</Descriptions.Item>
                        <Descriptions.Item label="Статус">{STATUS_LABELS[selectedEntry.status] || selectedEntry.status}</Descriptions.Item>
                        <Descriptions.Item label="Груз">{selectedEntry.cargoDescription}</Descriptions.Item>
                        <Descriptions.Item label="Перевозчик">{getCarrierName(selectedEntry)}</Descriptions.Item>
                        <Divider />
                        <Descriptions.Item label="Сумма"><strong>{selectedEntry.customerPrice.toLocaleString('ru-RU')} ₸</strong></Descriptions.Item>
                        <Descriptions.Item label="Оплата">{selectedEntry.isCustomerPaid ? <Tag color="green">Оплачено {dayjs(selectedEntry.customerPaidAt).format('DD.MM.YYYY')}</Tag> : <Tag color="red">Не оплачено</Tag>}</Descriptions.Item>
                    </Descriptions>
                )}
            </Drawer>

            <Modal title={editingExpense ? 'Редактировать' : 'Новый расход'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingExpense(null); }} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSaveManual} initialValues={{ date: dayjs() }}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}><Select options={EXPENSE_CATEGORIES} placeholder="Выберите" /></Form.Item>
                    <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} placeholder="0" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} /></Form.Item>
                    <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} placeholder="Доп. информация" /></Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}><Space><Button onClick={() => { setModalOpen(false); setEditingExpense(null); }}>Отмена</Button><Button type="primary" htmlType="submit">{editingExpense ? 'Сохранить' : 'Добавить'}</Button></Space></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
