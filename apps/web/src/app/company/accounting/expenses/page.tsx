'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Typography, Space, Tag, DatePicker, Input, Select, Switch, message, Tooltip, Statistic, Row, Col, Segmented, Modal, Form, InputNumber, Popconfirm } from 'antd';
import { SearchOutlined, CheckCircleOutlined, CloseCircleOutlined, ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface JournalEntry { id: string; orderNumber: string; createdAt: string; status: string; cargoDescription: string; driverCost: number; isDriverPaid: boolean; driverPaidAt: string | null; assignedDriverName: string | null; driver: { id: string; firstName: string; lastName: string; phone: string } | null; partner: { id: string; name: string } | null; subForwarder: { id: string; name: string } | null; }
interface ManualExpense { id: string; date: string; category: string; description: string; amount: number; note?: string; }

const STATUS_LABELS: Record<string, string> = { PENDING: 'Ожидает', ASSIGNED: 'Назначен', EN_ROUTE_PICKUP: 'Едет на погрузку', AT_PICKUP: 'На погрузке', LOADING: 'Погрузка', IN_TRANSIT: 'В пути', AT_DELIVERY: 'На выгрузке', UNLOADING: 'Выгрузка', COMPLETED: 'Завершён', PROBLEM: 'Проблема' };
const EXPENSE_CATEGORIES = [{ value: 'fuel', label: 'Топливо' }, { value: 'repair', label: 'Ремонт' }, { value: 'salary', label: 'Зарплата' }, { value: 'insurance', label: 'Страхование' }, { value: 'tax', label: 'Налоги' }, { value: 'rent', label: 'Аренда' }, { value: 'communication', label: 'Связь' }, { value: 'office', label: 'Офис' }, { value: 'corporate', label: 'Корпоративные' }, { value: 'penalties', label: 'Штрафы' }, { value: 'refund', label: 'Возврат' }, { value: 'other', label: 'Прочее' }];
const categoryColors: Record<string, string> = { fuel: 'orange', repair: 'red', salary: 'blue', insurance: 'cyan', tax: 'volcano', rent: 'purple', communication: 'geekblue', office: 'lime', corporate: 'magenta', penalties: 'red', refund: 'gold', other: 'default' };

export default function CompanyExpensesPage() {
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

    useEffect(() => { fetchJournal(); fetchManual(); }, []);
    const fetchJournal = async () => { setLoading(true); try { const res = await api.get('/accounting/expenses-journal'); setEntries(res.data); } catch {} finally { setLoading(false); } };
    const fetchManual = async () => { try { const res = await api.get('/accounting/expenses'); setManualExpenses(res.data); } catch {} };
    const togglePaid = async (orderId: string, currentPaid: boolean) => { try { await api.put(`/accounting/orders/${orderId}/driver-paid`, { paid: !currentPaid }); message.success(!currentPaid ? 'Оплата отмечена' : 'Отметка снята'); fetchJournal(); } catch { message.error('Ошибка'); } };
    const handleSaveManual = async (values: any) => { try { const payload = { ...values, date: values.date.toISOString() }; if (editingExpense) { await api.put(`/accounting/expenses/${editingExpense.id}`, payload); message.success('Обновлено'); } else { await api.post('/accounting/expenses', payload); message.success('Добавлено'); } setModalOpen(false); setEditingExpense(null); form.resetFields(); fetchManual(); } catch { message.error('Ошибка сохранения'); } };
    const handleDeleteManual = async (id: string) => { try { await api.delete(`/accounting/expenses/${id}`); message.success('Удалено'); fetchManual(); } catch { message.error('Ошибка удаления'); } };
    const getCarrierName = (e: JournalEntry): string => { if (e.partner) return e.partner.name; if (e.subForwarder) return e.subForwarder.name; if (e.assignedDriverName) return e.assignedDriverName; if (e.driver) return `${e.driver.lastName} ${e.driver.firstName}`; return '—'; };

    const filtered = entries.filter(e => { if (searchQuery) { const q = searchQuery.toLowerCase(); if (!e.orderNumber.toLowerCase().includes(q) && !getCarrierName(e).toLowerCase().includes(q) && !e.cargoDescription.toLowerCase().includes(q)) return false; } if (paymentFilter === 'paid' && !e.isDriverPaid) return false; if (paymentFilter === 'unpaid' && e.isDriverPaid) return false; if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(e.createdAt); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; } return true; });
    const totalSum = filtered.reduce((s, e) => s + (e.driverCost || 0), 0);
    const paidSum = filtered.filter(e => e.isDriverPaid).reduce((s, e) => s + (e.driverCost || 0), 0);
    const debtSum = totalSum - paidSum;
    const filteredManual = manualExpenses.filter(exp => { if (searchQuery) { const q = searchQuery.toLowerCase(); if (!exp.description.toLowerCase().includes(q) && !(exp.note || '').toLowerCase().includes(q)) return false; } if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(exp.date); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; } return true; });
    const manualTotal = filteredManual.reduce((s, exp) => s + exp.amount, 0);

    const journalColumns = [
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 100, render: (val: string) => <Text strong style={{ fontSize: 13 }}>{val}</Text> },
        { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 100, sorter: (a: JournalEntry, b: JournalEntry) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <Text style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</Text> },
        { title: 'Перевозчик / Водитель', key: 'carrier', width: 220, render: (_: any, r: JournalEntry) => <Text strong={!r.isDriverPaid} style={{ fontSize: 13, color: r.isDriverPaid ? undefined : '#cf1322' }}>{getCarrierName(r)}</Text> },
        { title: 'Описание', dataIndex: 'cargoDescription', key: 'cargoDescription', ellipsis: true, render: (val: string) => <Text style={{ fontSize: 13 }}>{val}</Text> },
        { title: 'Статус', dataIndex: 'status', key: 'status', width: 120, render: (val: string) => <Tag color={val === 'COMPLETED' ? 'green' : val === 'PROBLEM' ? 'red' : 'blue'} style={{ fontSize: 12 }}>{STATUS_LABELS[val] || val}</Tag> },
        { title: 'Сумма', dataIndex: 'driverCost', key: 'driverCost', width: 130, align: 'right' as const, render: (val: number) => <Text strong style={{ fontSize: 13 }}>{(val || 0).toLocaleString('ru-RU')} ₸</Text> },
        { title: 'Оплата', key: 'paid', width: 90, align: 'center' as const, render: (_: any, r: JournalEntry) => <Tooltip title={r.isDriverPaid ? 'Оплачено' : 'Не оплачено'}><Switch size="small" checked={r.isDriverPaid} onChange={() => togglePaid(r.id, r.isDriverPaid)} checkedChildren={<CheckCircleOutlined />} unCheckedChildren={<CloseCircleOutlined />} style={{ background: r.isDriverPaid ? '#52c41a' : '#ff4d4f' }} /></Tooltip> },
    ];
    const manualColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, sorter: (a: ManualExpense, b: ManualExpense) => dayjs(a.date).unix() - dayjs(b.date).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <Text style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'category', width: 150, render: (val: string) => <Tag color={categoryColors[val] || 'default'} style={{ fontSize: 12 }}>{EXPENSE_CATEGORIES.find(c => c.value === val)?.label || val}</Tag> },
        { title: 'Описание', dataIndex: 'description', key: 'description', ellipsis: true, render: (val: string) => <Text style={{ fontSize: 13 }}>{val}</Text> },
        { title: 'Сумма', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' as const, render: (val: number) => <Text strong style={{ fontSize: 13, color: '#cf1322' }}>−{val.toLocaleString('ru-RU')} ₸</Text> },
        { title: 'Примечание', dataIndex: 'note', key: 'note', width: 180, ellipsis: true, render: (val: string) => <Text style={{ fontSize: 13 }}>{val || '—'}</Text> },
        { title: '', key: 'actions', width: 80, render: (_: any, r: ManualExpense) => <Space><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingExpense(r); form.setFieldsValue({ ...r, date: dayjs(r.date) }); setModalOpen(true); }} /><Popconfirm title="Удалить?" onConfirm={() => handleDeleteManual(r.id)} okText="Да" cancelText="Нет"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
    ];

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}><Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/accounting')} style={{ padding: '4px 8px' }} /><Title level={4} style={{ margin: 0 }}>Расход денежных средств</Title></div>
            <Segmented value={tab} onChange={(v) => { setTab(v as string); setSearchQuery(''); setPaymentFilter(undefined); setDateRange(null); }} options={[{ label: 'По заявкам', value: 'journal' }, { label: 'Прочие расходы', value: 'manual' }]} style={{ marginBottom: 16 }} />
            {tab === 'journal' ? (
                <>
                    <Row gutter={16} style={{ marginBottom: 16 }}><Col xs={24} sm={8}><Card size="small"><Statistic title="Общая сумма" value={totalSum} suffix="₸" valueStyle={{ fontSize: 20 }} formatter={(val) => Number(val).toLocaleString('ru-RU')} /></Card></Col><Col xs={24} sm={8}><Card size="small"><Statistic title="Оплачено" value={paidSum} suffix="₸" valueStyle={{ fontSize: 20, color: '#389e0d' }} formatter={(val) => Number(val).toLocaleString('ru-RU')} /></Card></Col><Col xs={24} sm={8}><Card size="small"><Statistic title="Наш долг" value={debtSum} suffix="₸" valueStyle={{ fontSize: 20, color: debtSum > 0 ? '#cf1322' : '#389e0d' }} formatter={(val) => Number(val).toLocaleString('ru-RU')} /></Card></Col></Row>
                    <Card size="small" style={{ marginBottom: 12 }}><Space wrap><Input placeholder="Поиск..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 280 }} allowClear size="small" /><Select placeholder="Статус оплаты" value={paymentFilter} onChange={setPaymentFilter} allowClear style={{ width: 160 }} size="small" options={[{ value: 'paid', label: 'Оплачено' }, { value: 'unpaid', label: 'Не оплачено' }]} /><RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" /></Space></Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}><Table columns={journalColumns} dataSource={filtered} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет данных' }} pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }} rowClassName={(r) => r.isDriverPaid ? '' : 'unpaid-row'} /></Card>
                </>
            ) : (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><Card size="small" style={{ flex: 1, marginRight: 12 }}><Space size="large"><div><Text type="secondary" style={{ fontSize: 12 }}>Итого расходов</Text><div><Text strong style={{ fontSize: 20, color: '#cf1322' }}>{manualTotal.toLocaleString('ru-RU')} ₸</Text></div></div><div><Text type="secondary" style={{ fontSize: 12 }}>Записей</Text><div><Text strong style={{ fontSize: 20 }}>{filteredManual.length}</Text></div></div></Space></Card><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingExpense(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalOpen(true); }}>Добавить</Button></div>
                    <Card size="small" style={{ marginBottom: 12 }}><Space wrap><Input placeholder="Поиск..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear size="small" /><RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" /></Space></Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}><Table columns={manualColumns} dataSource={filteredManual} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }} /></Card>
                </>
            )}
            <Modal title={editingExpense ? 'Редактировать' : 'Новый расход'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingExpense(null); }} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSaveManual} initialValues={{ date: dayjs() }}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}><Select options={EXPENSE_CATEGORIES} placeholder="Выберите" /></Form.Item>
                    <Form.Item name="description" label="Описание" rules={[{ required: true }]}><Input placeholder="Описание расхода" /></Form.Item>
                    <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} placeholder="0" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} /></Form.Item>
                    <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} placeholder="Доп. информация" /></Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}><Space><Button onClick={() => { setModalOpen(false); setEditingExpense(null); }}>Отмена</Button><Button type="primary" htmlType="submit">{editingExpense ? 'Сохранить' : 'Добавить'}</Button></Space></Form.Item>
                </Form>
            </Modal>
            <style jsx global>{`.unpaid-row { background: #fff2f0 !important; } .unpaid-row:hover > td { background: #ffebe8 !important; }`}</style>
        </div>
    );
}
