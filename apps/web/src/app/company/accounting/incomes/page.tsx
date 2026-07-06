'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Typography, Space, Tag, DatePicker, Input, Select, message, Segmented, Modal, Form, InputNumber, Popconfirm, theme } from 'antd';
import { SearchOutlined, ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined, WalletOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/auth';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface ManualIncome { id: string; date: string; category: string; description: string; amount: number; note?: string; order?: { orderNumber: string }; }

const INCOME_CATEGORIES = [{ value: 'order_payment', label: 'Оплата за перевозку' }, { value: 'prepayment', label: 'Предоплата' }, { value: 'refund', label: 'Возврат' }, { value: 'bonus', label: 'Бонус/Премия' }, { value: 'insurance_payout', label: 'Страховая выплата' }, { value: 'corporate', label: 'Корпоративное' }, { value: 'other', label: 'Прочее' }];
const categoryColors: Record<string, string> = { order_payment: 'green', prepayment: 'blue', refund: 'orange', bonus: 'purple', insurance_payout: 'cyan', corporate: 'geekblue', other: 'default' };

export default function CompanyIncomesPage() {
    const { token } = theme.useToken();
    const { user } = useAuthStore();
    const canEditFinance = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';
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
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, sorter: (a: ManualIncome, b: ManualIncome) => dayjs(a.date).unix() - dayjs(b.date).unix(), defaultSortOrder: 'descend' as const, render: (val: string) => <span style={{ fontSize: 13 }}>{dayjs(val).format('DD.MM.YYYY')}</span> },
        { title: 'Категория', dataIndex: 'category', key: 'category', width: 170, render: (val: string) => <Tag color={categoryColors[val] || 'default'} style={{ fontSize: 12 }}>{INCOME_CATEGORIES.find(c => c.value === val)?.label || val}</Tag> },
        { title: 'Описание', dataIndex: 'description', key: 'description', ellipsis: true, render: (val: string, r: ManualIncome) => (
            <Space direction="vertical" size={0}>
                <span style={{ fontSize: 13 }}>{val}</span>
                {r.order && <Tag color="blue" style={{ marginTop: 4 }}>Заявка {r.order.orderNumber}</Tag>}
            </Space>
        ) },
        { title: 'Сумма', dataIndex: 'amount', key: 'amount', width: 130, align: 'right' as const, render: (val: number) => <strong style={{ fontSize: 13, color: '#28a745' }}>+{val.toLocaleString('ru-RU')} ₸</strong> },
        { title: 'Примечание', dataIndex: 'note', key: 'note', width: 180, ellipsis: true, render: (val: string) => <span style={{ fontSize: 13 }}>{val || '—'}</span> },
        { title: '', key: 'actions', width: 80, render: (_: any, r: ManualIncome) => canEditFinance ? <Space><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingIncome(r); form.setFieldsValue({ ...r, date: dayjs(r.date) }); setModalOpen(true); }} /><Popconfirm title="Удалить?" onConfirm={() => handleDeleteManual(r.id)} okText="Да" cancelText="Нет"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Space> : null },
    ];

    const currentTotal = tab === 'order_incomes' ? orderIncomesTotal : otherIncomesTotal;
    const currentCount = tab === 'order_incomes' ? orderIncomes.length : otherIncomes.length;

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/accounting')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Поступления
                    </div>
                    <h1 className="lc2-title">Поступления</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Учёт входящих платежей по заявкам и прочих доходов
                    </p>
                    {tab === 'other_incomes' && canEditFinance && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingIncome(null); form.resetFields(); form.setFieldsValue({ date: dayjs() }); setModalOpen(true); }} className="lc-cta">
                            Добавить поступление
                        </Button>
                    )}
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#28a745' }}>
                            <WalletOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Сумма</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#28a745' }}>
                                {currentTotal.toLocaleString('ru-RU')} ₸
                            </div>
                            <div className="lc2-msub">за период</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <EditOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Записей</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {currentCount}
                            </div>
                            <div className="lc2-msub">в таблице</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== CONTENT ===== */}
            <Segmented 
                value={tab} 
                onChange={(v) => { setTab(v as string); setSearchQuery(''); setDateRange(null); }} 
                options={[
                    { label: 'Поступления по заявкам', value: 'order_incomes' },
                    { label: 'Прочие поступления', value: 'other_incomes' }
                ]} 
                style={{ marginBottom: 16 }} 
            />

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Space wrap>
                    <Input placeholder="Поиск по описанию..." prefix={<SearchOutlined />} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: 250 }} allowClear />
                    <RangePicker value={dateRange} onChange={(dates) => setDateRange(dates)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} />
                </Space>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table columns={manualColumns} dataSource={tab === 'order_incomes' ? orderIncomes : otherIncomes} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 25, showSizeChanger: true }} />
            </div>

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
