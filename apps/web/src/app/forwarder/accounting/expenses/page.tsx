'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Typography, Space, Tag, DatePicker, Input, Select, message, Statistic, Row, Col, Segmented, Modal, Form, InputNumber, Popconfirm } from 'antd';
import {
    SearchOutlined, ArrowLeftOutlined,
    PlusOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

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

export default function ForwarderExpensesPage() {
    const [tab, setTab] = useState<string>('order_expenses');
    const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<ManualExpense | null>(null);
    const [form] = Form.useForm();
    const router = useRouter();

    useEffect(() => { fetchManual(); }, []);

    const fetchManual = async () => { setLoading(true); try { const res = await api.get('/accounting/expenses'); setManualExpenses(res.data); } catch {} finally { setLoading(false); } };

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
                <Title level={4} style={{ margin: 0 }}>Расходы</Title>
            </div>

            <Segmented
                value={tab}
                onChange={(v) => { setTab(v as string); setSearchQuery(''); setDateRange(null); }}
                options={[
                    { label: 'Расходы по заявкам', value: 'order_expenses' },
                    { label: 'Прочие расходы', value: 'other_expenses' }
                ]}
                style={{ marginBottom: 16 }}
            />

            {tab === 'order_expenses' ? (
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
                            <Input placeholder="Поиск по заявке, описанию..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 280 }} allowClear size="small" />
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
