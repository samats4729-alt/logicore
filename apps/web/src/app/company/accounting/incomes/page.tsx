'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Typography, Space, Tag, DatePicker, Input, Select, message, Statistic, Row, Col, Segmented, Modal, Form, InputNumber, Popconfirm } from 'antd';
import { SearchOutlined, ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface ManualIncome { id: string; date: string; category: string; description: string; amount: number; note?: string; order?: { orderNumber: string }; }

const INCOME_CATEGORIES = [{ value: 'order_payment', label: 'Оплата за перевозку' }, { value: 'prepayment', label: 'Предоплата' }, { value: 'refund', label: 'Возврат' }, { value: 'bonus', label: 'Бонус/Премия' }, { value: 'insurance_payout', label: 'Страховая выплата' }, { value: 'corporate', label: 'Корпоративное' }, { value: 'other', label: 'Прочее' }];
const categoryColors: Record<string, string> = { order_payment: 'green', prepayment: 'blue', refund: 'orange', bonus: 'purple', insurance_payout: 'cyan', corporate: 'geekblue', other: 'default' };

export default function CompanyIncomesPage() {
    const [tab, setTab] = useState<string>('order_incomes');
    const [manualIncomes, setManualIncomes] = useState<ManualIncome[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingIncome, setEditingIncome] = useState<ManualIncome | null>(null);
    const [form] = Form.useForm();
    const router = useRouter();

    useEffect(() => { fetchManual(); }, []);
    const fetchManual = async () => { setLoading(true); try { const res = await api.get('/accounting/incomes'); setManualIncomes(res.data); } catch {} finally { setLoading(false); } };

    const handleSaveManual = async (values: any) => { try { const label = INCOME_CATEGORIES.find(c => c.value === values.category)?.label || values.category; const payload = { ...values, description: label, date: values.date.toISOString() }; if (editingIncome) { await api.put(`/accounting/incomes/${editingIncome.id}`, payload); message.success('Обновлено'); } else { await api.post('/accounting/incomes', payload); message.success('Добавлено'); } setModalOpen(false); setEditingIncome(null); form.resetFields(); fetchManual(); } catch { message.error('Ошибка сохранения'); } };
    const handleDeleteManual = async (id: string) => { try { await api.delete(`/accounting/incomes/${id}`); message.success('Удалено'); fetchManual(); } catch { message.error('Ошибка удаления'); } };

    const orderIncomes = manualIncomes.filter(inc => {
        if (!inc.order) return false;
        if (searchQuery) { const q = searchQuery.toLowerCase(); if (!inc.description.toLowerCase().includes(q) && !(inc.note || '').toLowerCase().includes(q)) return false; }
        if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(inc.date); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; }
        return true;
    });
    const orderIncomesTotal = orderIncomes.reduce((s, inc) => s + inc.amount, 0);

    const otherIncomes = manualIncomes.filter(inc => {
        if (inc.order) return false;
        if (searchQuery) { const q = searchQuery.toLowerCase(); if (!inc.description.toLowerCase().includes(q) && !(inc.note || '').toLowerCase().includes(q)) return false; }
        if (dateRange && dateRange[0] && dateRange[1]) { const d = dayjs(inc.date); if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false; }
        return true;
    });
    const otherIncomesTotal = otherIncomes.reduce((s, inc) => s + inc.amount, 0);

    const manualColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, sorter: (a: ManualIncome, b: ManualIncome) => dayjs(a.date).unix() - dayjs(b.date).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <Text style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'category', width: 170, render: (val: string) => <Tag color={categoryColors[val] || 'default'} style={{ fontSize: 12 }}>{INCOME_CATEGORIES.find(c => c.value === val)?.label || val}</Tag> },
        { title: 'Описание', dataIndex: 'description', key: 'description', ellipsis: true, render: (val: string, r: ManualIncome) => (
            <Space direction="vertical" size={0}>
                <Text style={{ fontSize: 13 }}>{val}</Text>
                {r.order && <Tag color="blue" style={{ marginTop: 4 }}>Заявка {r.order.orderNumber}</Tag>}
            </Space>
        ) },
        { title: 'Сумма', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' as const, render: (val: number) => <Text strong style={{ fontSize: 13, color: '#389e0d' }}>+{val.toLocaleString('ru-RU')} ₸</Text> },
        { title: 'Примечание', dataIndex: 'note', key: 'note', width: 180, ellipsis: true, render: (val: string) => <Text style={{ fontSize: 13 }}>{val || '—'}</Text> },
        { title: '', key: 'actions', width: 80, render: (_: any, r: ManualIncome) => <Space><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingIncome(r); form.setFieldsValue({ ...r, date: dayjs(r.date) }); setModalOpen(true); }} /><Popconfirm title="Удалить?" onConfirm={() => handleDeleteManual(r.id)} okText="Да" cancelText="Нет"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
    ];

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/accounting')} style={{ padding: '4px 8px' }} />
                <Title level={4} style={{ margin: 0 }}>Поступление денежных средств</Title>
            </div>

            <Segmented 
                value={tab} 
                onChange={(v) => { setTab(v as string); setSearchQuery(''); setDateRange(null); }} 
                options={[
                    { label: 'Поступления по заявкам', value: 'order_incomes' },
                    { label: 'Прочие поступления', value: 'other_incomes' }
                ]} 
                style={{ marginBottom: 16 }} 
            />

            {tab === 'order_incomes' ? (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Card size="small" style={{ flex: 1, marginRight: 12 }}>
                            <Space size="large">
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Итого поступлений по заявкам</Text><div><Text strong style={{ fontSize: 20, color: '#389e0d' }}>{orderIncomesTotal.toLocaleString('ru-RU')} ₸</Text></div></div>
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Записей</Text><div><Text strong style={{ fontSize: 20 }}>{orderIncomes.length}</Text></div></div>
                            </Space>
                        </Card>
                    </div>
                    <Card size="small" style={{ marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск по описанию..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear size="small" />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" />
                        </Space>
                    </Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}>
                        <Table columns={manualColumns} dataSource={orderIncomes} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }} />
                    </Card>
                </>
            ) : (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Card size="small" style={{ flex: 1, marginRight: 12 }}>
                            <Space size="large">
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Итого прочих поступлений</Text><div><Text strong style={{ fontSize: 20, color: '#389e0d' }}>{otherIncomesTotal.toLocaleString('ru-RU')} ₸</Text></div></div>
                                <div><Text type="secondary" style={{ fontSize: 12 }}>Записей</Text><div><Text strong style={{ fontSize: 20 }}>{otherIncomes.length}</Text></div></div>
                            </Space>
                        </Card>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingIncome(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalOpen(true); }}>Добавить поступление</Button>
                    </div>
                    <Card size="small" style={{ marginBottom: 12 }}>
                        <Space wrap>
                            <Input placeholder="Поиск по описанию..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear size="small" />
                            <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} size="small" />
                        </Space>
                    </Card>
                    <Card size="small" styles={{ body: { padding: 0 } }}>
                        <Table columns={manualColumns} dataSource={otherIncomes} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true, size: 'small' }} />
                    </Card>
                </>
            )}
            <Modal title={editingIncome ? 'Редактировать' : 'Новое поступление'} open={modalOpen} onCancel={() => { setModalOpen(false); setEditingIncome(null); }} footer={null} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSaveManual} initialValues={{ date: dayjs() }}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}><Select options={INCOME_CATEGORIES} placeholder="Выберите" /></Form.Item>
                    <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} placeholder="0" formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} /></Form.Item>
                    <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} placeholder="Доп. информация" /></Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}><Space><Button onClick={() => { setModalOpen(false); setEditingIncome(null); }}>Отмена</Button><Button type="primary" htmlType="submit">{editingIncome ? 'Сохранить' : 'Добавить'}</Button></Space></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
