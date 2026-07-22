'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Typography, Space, Tag, DatePicker, Input, Select, InputNumber, Modal, Form, Divider, App, Tooltip } from 'antd';
import { ArrowLeftOutlined, ArrowUpOutlined, ArrowDownOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface Account { id: string; name: string; kind: string; isDefault: boolean; isActive?: boolean }
interface Category { id: string; name: string; direction: 'IN' | 'OUT'; costType?: string | null; isActive: boolean }
interface Partner { id: string; name: string; isCustomer?: boolean; isCarrier?: boolean }
interface OrderLite { id: string; orderNumber: string }
interface PaymentRow {
    id: string;
    date: string;
    amount: number;
    method: string;
    note?: string | null;
    order?: { orderNumber?: string } | null;
    orderId?: string | null;
    counterparty?: { name?: string } | null;
    counterpartyId?: string | null;
    account?: { id?: string; name?: string } | null;
    accountId?: string | null;
    category?: { id?: string; name?: string } | null;
    categoryId?: string | null;
}

const METHOD_OPTIONS = [
    { value: 'BANK', label: 'Банк' },
    { value: 'CASH', label: 'Касса' },
    { value: 'CARD', label: 'Карта' },
    { value: 'OTHER', label: 'Прочее' },
];
const METHOD_LABELS: Record<string, string> = { BANK: 'Банк', CASH: 'Касса', CARD: 'Карта', OTHER: 'Прочее' };
const moneyFmt = (v: any) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const moneyParse = (v: any) => (v || '').replace(/\s/g, '');
const money = (v: number) => (v || 0).toLocaleString('ru-RU') + ' ₸';

export default function CashJournal({ direction }: { direction: 'IN' | 'OUT' }) {
    const router = useRouter();
    const { message, modal } = App.useApp();
    const { user } = useAuthStore();
    const canEdit = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';

    const isIn = direction === 'IN';
    const cfg = isIn
        ? { title: 'Поступление денежных средств', metric: 'Поступило', create: 'Создать поступление', color: '#16a34a', icon: <ArrowDownOutlined /> }
        : { title: 'Расход денежных средств', metric: 'Списано', create: 'Создать расход', color: '#dc2626', icon: <ArrowUpOutlined /> };

    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<PaymentRow[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [orders, setOrders] = useState<OrderLite[]>([]);

    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<PaymentRow | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    const watchedCategoryId = Form.useWatch('categoryId', form);
    const selectedCat = categories.find(c => c.id === watchedCategoryId);
    const needsOrder = !isIn && selectedCat?.costType === 'PER_ORDER';

    useEffect(() => { fetchAll(); }, [direction]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [payRes, accRes, catRes, partRes, ordRes] = await Promise.all([
                api.get('/accounting/payments', { params: { direction } }),
                api.get('/accounting/finance-accounts'),
                api.get('/accounting/finance-categories'),
                api.get('/partners'),
                api.get('/orders', { params: { limit: 300 } }),
            ]);
            setRows(payRes.data || []);
            setAccounts((accRes.data || []).filter((a: Account) => a.isActive !== false));
            setCategories((catRes.data || []).filter((c: Category) => c.isActive !== false && c.direction === direction));
            setPartners((partRes.data || []).filter((p: Partner) => p && p.id));
            const list = ordRes.data?.data || ordRes.data || [];
            setOrders(list.map((o: any) => ({ id: o.id, orderNumber: o.orderNumber })));
        } catch {
            message.error('Не удалось загрузить данные');
        } finally {
            setLoading(false);
        }
    };

    const filtered = useMemo(() => {
        return rows.filter(r => {
            if (categoryFilter && r.category?.id !== categoryFilter && r.categoryId !== categoryFilter) return false;
            if (dateRange && dateRange[0] && dateRange[1]) {
                const d = dayjs(r.date);
                if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false;
            }
            if (search) {
                const q = search.toLowerCase();
                const hay = `${r.category?.name || ''} ${r.counterparty?.name || ''} ${r.order?.orderNumber || ''} ${r.note || ''} ${r.account?.name || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [rows, categoryFilter, dateRange, search]);

    const total = filtered.reduce((s, r) => s + r.amount, 0);

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({
            date: dayjs(),
            method: 'BANK',
            accountId: accounts.find(a => a.isDefault)?.id ?? accounts[0]?.id,
        });
        setModalOpen(true);
    };

    const openEdit = (r: PaymentRow) => {
        setEditing(r);
        form.setFieldsValue({
            date: dayjs(r.date),
            categoryId: r.category?.id || r.categoryId || undefined,
            orderId: r.orderId || undefined,
            counterpartyId: r.counterpartyId || undefined,
            amount: r.amount,
            accountId: r.account?.id || r.accountId || undefined,
            method: r.method || 'BANK',
            note: r.note || '',
        });
        setModalOpen(true);
    };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            const payload: any = {
                direction,
                date: values.date.toISOString(),
                categoryId: values.categoryId || undefined,
                counterpartyId: values.counterpartyId || undefined,
                amount: values.amount,
                accountId: values.accountId || undefined,
                method: values.method || 'BANK',
                note: values.note || undefined,
                orderId: values.orderId || null,
            };
            if (editing) {
                await api.put(`/accounting/payments/${editing.id}`, payload);
                message.success('Документ обновлён');
            } else {
                await api.post('/accounting/payments', payload);
                message.success(isIn ? 'Поступление создано' : 'Расход создан');
            }
            setModalOpen(false);
            fetchAll();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (r: PaymentRow) => {
        modal.confirm({
            title: 'Удалить документ?',
            content: `${dayjs(r.date).format('DD.MM.YYYY')} · ${r.category?.name || ''} · ${money(r.amount)}`,
            okText: 'Удалить', okButtonProps: { danger: true }, cancelText: 'Отмена',
            onOk: async () => {
                try {
                    await api.delete(`/accounting/payments/${r.id}`);
                    message.success('Документ удалён');
                    fetchAll();
                } catch (e: any) {
                    message.error(e.response?.data?.message || 'Не удалось удалить');
                }
            },
        });
    };

    const columns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 105, render: (v: string) => <span style={{ fontSize: 13 }}>{dayjs(v).format('DD.MM.YYYY')}</span> },
        { title: 'Статья', key: 'cat', render: (_: any, r: PaymentRow) => <span style={{ fontSize: 13, fontWeight: 500 }}>{r.category?.name || '—'}</span> },
        { title: 'Контрагент', key: 'cp', render: (_: any, r: PaymentRow) => <span style={{ fontSize: 13 }}>{r.counterparty?.name || '—'}</span> },
        {
            title: 'Заявка', key: 'order', width: 110,
            render: (_: any, r: PaymentRow) => r.order?.orderNumber
                ? <Tag color="blue" style={{ margin: 0, cursor: 'pointer' }} onClick={() => r.orderId && router.push(`/company/orders/${r.orderId}`)}>{r.order.orderNumber}</Tag>
                : <Text type="secondary">—</Text>,
        },
        { title: 'Счёт / касса', key: 'acc', width: 140, render: (_: any, r: PaymentRow) => <span style={{ fontSize: 13, color: 'var(--lc-text-ter)' }}>{r.account?.name || METHOD_LABELS[r.method] || '—'}</span> },
        {
            title: 'Сумма', key: 'amount', width: 140, align: 'right' as const,
            render: (_: any, r: PaymentRow) => <strong style={{ fontSize: 13, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>{isIn ? '+' : '−'}{money(r.amount)}</strong>,
        },
        { title: 'Примечание', dataIndex: 'note', key: 'note', width: 160, ellipsis: true, render: (v?: string) => <span style={{ fontSize: 13 }}>{v || '—'}</span> },
        ...(canEdit ? [{
            title: '', key: 'act', width: 80,
            render: (_: any, r: PaymentRow) => (
                <Space size={0}>
                    <Tooltip title="Изменить"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
                    <Tooltip title="Удалить"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)} /></Tooltip>
                </Space>
            ),
        }] : []),
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Деньги
                    </div>
                    <h1 className="lc2-title">{cfg.title}</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        Журнал документов «{isIn ? 'Поступление' : 'Расход'} денежных средств». Создавайте документ, выбирайте статью, счёт, контрагента и при необходимости — заявку.
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: isIn ? '#e6ffed' : '#ffeef0', color: cfg.color }}>{cfg.icon}</div>
                        <div>
                            <div className="lc2-mlabel">{cfg.metric}</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: cfg.color }}>{money(total)}</div>
                            <div className="lc2-msub">{filtered.length} докум.</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Space wrap>
                    <Input placeholder="Поиск: статья, контрагент, заявка, примечание…" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 300 }} allowClear />
                    <RangePicker value={dateRange} onChange={d => setDateRange(d as any)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} />
                    <Select
                        placeholder="Статья"
                        value={categoryFilter}
                        onChange={setCategoryFilter}
                        allowClear
                        style={{ width: 220 }}
                        showSearch optionFilterProp="label"
                        options={categories.map(c => ({ value: c.id, label: c.name }))}
                    />
                    {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{cfg.create}</Button>}
                </Space>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    locale={{ emptyText: 'Нет документов. Нажмите «' + cfg.create + '».' }}
                    pagination={{ pageSize: 30, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
                />
            </div>

            <Modal
                title={editing ? `Изменить: ${cfg.title.toLowerCase()}` : cfg.create}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
                okText={editing ? 'Сохранить' : 'Создать'}
                cancelText="Отмена"
                confirmLoading={saving}
                destroyOnClose
                width={560}
            >
                <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 8 }}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true, message: 'Укажите дату' }]}>
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>
                    <Form.Item name="categoryId" label="Статья движения денег" rules={[{ required: true, message: 'Выберите статью' }]}>
                        <Select
                            placeholder="Выберите статью"
                            showSearch optionFilterProp="label"
                            options={categories.map(c => ({
                                value: c.id,
                                label: c.costType === 'PER_ORDER' ? `${c.name} · по заявке` : c.costType === 'PER_VEHICLE' ? `${c.name} · по машине` : c.name,
                            }))}
                            onChange={() => form.setFieldsValue({ orderId: undefined })}
                            popupRender={(menu) => (
                                <>
                                    {menu}
                                    <Divider style={{ margin: '6px 0' }} />
                                    <Button type="link" icon={<PlusOutlined />} style={{ paddingLeft: 12 }}
                                        onClick={() => router.push('/company/accounting/settings?tab=categories')}>
                                        Добавить статью в справочник
                                    </Button>
                                </>
                            )}
                        />
                    </Form.Item>
                    <Form.Item
                        name="orderId"
                        label="Заявка"
                        rules={needsOrder ? [{ required: true, message: 'Статья «по заявке» — укажите заявку' }] : []}
                        extra={needsOrder ? 'Расход отнесётся к этой заявке и уменьшит её маржу' : 'Необязательно — если оплата относится к конкретному рейсу'}
                    >
                        <Select
                            placeholder="Выберите заявку (по номеру)"
                            showSearch optionFilterProp="label" allowClear
                            options={orders.map(o => ({ value: o.id, label: o.orderNumber }))}
                        />
                    </Form.Item>
                    <Form.Item name="counterpartyId" label="Контрагент">
                        <Select
                            placeholder="Выберите контрагента"
                            showSearch optionFilterProp="label" allowClear
                            options={partners.map(p => ({ value: p.id, label: p.name }))}
                        />
                    </Form.Item>
                    <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true, message: 'Укажите сумму' }]}>
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="0" formatter={moneyFmt} parser={moneyParse} />
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Form.Item name="accountId" label="Счёт / касса" style={{ flex: 1 }}>
                            <Select placeholder="Счёт или касса" allowClear
                                options={accounts.map(a => ({ value: a.id, label: `${a.name} · ${a.kind === 'CASH' ? 'касса' : 'счёт'}` }))} />
                        </Form.Item>
                        <Form.Item name="method" label="Форма оплаты" style={{ flex: 1 }}>
                            <Select options={METHOD_OPTIONS} />
                        </Form.Item>
                    </div>
                    <Form.Item name="note" label="Примечание">
                        <Input.TextArea rows={2} placeholder="Доп. информация" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
