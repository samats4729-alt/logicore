'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Typography, Space, Tag, DatePicker, Input, Segmented, message, Modal, Form, InputNumber, Select } from 'antd';
import { SearchOutlined, ArrowLeftOutlined, ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// Единая строка операции (нормализованная из платежей / доходов / расходов)
interface OpRow {
    id: string;
    date: string;
    direction: 'IN' | 'OUT';
    amount: number;
    kind: 'order' | 'income' | 'expense';
    kindLabel: string;
    title: string;
    counterparty?: string;
    orderNumber?: string;
    account?: string;
    note?: string;
}

const METHOD_LABELS: Record<string, string> = { BANK: 'Банк', CASH: 'Касса', CARD: 'Карта', OTHER: 'Прочее' };

const EXPENSE_CATEGORIES: Record<string, string> = {
    fuel: 'Топливо', repair: 'Ремонт', salary: 'Зарплата', insurance: 'Страхование',
    tax: 'Налоги', rent: 'Аренда', communication: 'Связь', office: 'Офис',
    corporate: 'Корпоративные', penalties: 'Штрафы', refund: 'Возврат', other: 'Прочее',
};
const INCOME_CATEGORIES: Record<string, string> = {
    order_payment: 'Оплата по заявке', prepayment: 'Предоплата', refund: 'Возврат', other: 'Прочее',
};

export default function AllOperationsPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const canEdit = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState<OpRow[]>([]);
    const [typeFilter, setTypeFilter] = useState<'all' | 'IN' | 'OUT'>('all');
    const [search, setSearch] = useState('');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
        dayjs().startOf('month'),
        dayjs().endOf('month'),
    ]);

    // Добавление ручной операции (доход / расход)
    const [addOpen, setAddOpen] = useState(false);
    const [addDir, setAddDir] = useState<'IN' | 'OUT'>('OUT');
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const [accounts, setAccounts] = useState<{ id: string; name: string; kind: string; isDefault: boolean }[]>([]);
    const [categories, setCategories] = useState<{ id: string; name: string; direction: 'IN' | 'OUT'; costType?: string | null; isActive: boolean }[]>([]);
    const [orders, setOrders] = useState<{ id: string; orderNumber: string }[]>([]);
    // Отслеживаем выбранную статью, чтобы понять её тип (по заявке / общий)
    const watchedCategory = Form.useWatch('category', form);
    const selectedCat = categories.find(c => c.direction === addDir && c.name === watchedCategory);
    const needsOrder = addDir === 'OUT' && selectedCat?.costType === 'PER_ORDER';

    useEffect(() => { fetchAll(); fetchAccounts(); fetchCategories(); fetchOrders(); }, []);

    const fetchAccounts = async () => {
        try {
            const res = await api.get('/accounting/finance-accounts');
            setAccounts((res.data || []).filter((a: any) => a.isActive !== false));
        } catch { /* необязательно */ }
    };

    const fetchCategories = async () => {
        try {
            const res = await api.get('/accounting/finance-categories');
            setCategories((res.data || []).filter((c: any) => c.isActive !== false));
        } catch { /* необязательно */ }
    };

    const fetchOrders = async () => {
        try {
            const res = await api.get('/orders', { params: { limit: 300 } });
            const list = res.data?.data || res.data || [];
            setOrders(list.map((o: any) => ({ id: o.id, orderNumber: o.orderNumber })));
        } catch { /* необязательно */ }
    };

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [paymentsRes, incomesRes, expensesRes] = await Promise.all([
                api.get('/accounting/payments'),
                api.get('/accounting/incomes'),
                api.get('/accounting/expenses'),
            ]);

            const payments: OpRow[] = (paymentsRes.data || []).map((p: any) => ({
                id: `p_${p.id}`,
                date: p.date,
                direction: p.direction,
                amount: p.amount,
                kind: 'order',
                kindLabel: p.order?.orderNumber ? 'Оплата по заявке' : 'Платёж',
                title: p.category?.name || (p.direction === 'IN' ? 'Поступление' : 'Списание'),
                counterparty: p.counterparty?.name,
                orderNumber: p.order?.orderNumber,
                account: p.account?.name || METHOD_LABELS[p.method] || undefined,
                note: p.note,
            }));

            const incomes: OpRow[] = (incomesRes.data || []).map((i: any) => ({
                id: `i_${i.id}`,
                date: i.date,
                direction: 'IN' as const,
                amount: i.amount,
                kind: 'income',
                kindLabel: 'Прочий доход',
                title: INCOME_CATEGORIES[i.category] || i.description || i.category,
                orderNumber: i.order?.orderNumber,
                account: i.account?.name,
                note: i.note,
            }));

            const expenses: OpRow[] = (expensesRes.data || []).map((e: any) => ({
                id: `e_${e.id}`,
                date: e.date,
                direction: 'OUT' as const,
                amount: e.amount,
                kind: 'expense',
                kindLabel: 'Прочий расход',
                title: EXPENSE_CATEGORIES[e.category] || e.description || e.category,
                orderNumber: e.order?.orderNumber,
                account: e.account?.name,
                note: e.note,
            }));

            const all = [...payments, ...incomes, ...expenses].sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix());
            setRows(all);
        } catch {
            message.error('Не удалось загрузить операции');
        } finally {
            setLoading(false);
        }
    };

    const filtered = useMemo(() => {
        return rows.filter(r => {
            if (typeFilter !== 'all' && r.direction !== typeFilter) return false;
            if (dateRange && dateRange[0] && dateRange[1]) {
                const d = dayjs(r.date);
                if (d.isBefore(dateRange[0], 'day') || d.isAfter(dateRange[1], 'day')) return false;
            }
            if (search) {
                const q = search.toLowerCase();
                const hay = `${r.title} ${r.counterparty || ''} ${r.orderNumber || ''} ${r.note || ''} ${r.kindLabel}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [rows, typeFilter, dateRange, search]);

    const totalIn = filtered.filter(r => r.direction === 'IN').reduce((s, r) => s + r.amount, 0);
    const totalOut = filtered.filter(r => r.direction === 'OUT').reduce((s, r) => s + r.amount, 0);
    const balance = totalIn - totalOut;

    const money = (v: number) => v.toLocaleString('ru-RU') + ' ₸';

    const openAdd = (dir: 'IN' | 'OUT') => {
        setAddDir(dir);
        form.resetFields();
        form.setFieldsValue({ date: dayjs(), accountId: accounts.find(a => a.isDefault)?.id ?? accounts[0]?.id });
        setAddOpen(true);
    };

    const handleSaveOp = async (values: any) => {
        setSaving(true);
        try {
            const payload = {
                category: values.category,
                description: values.category,
                amount: values.amount,
                date: values.date.toISOString(),
                accountId: values.accountId || undefined,
                orderId: needsOrder ? (values.orderId || undefined) : undefined,
                note: values.note,
            };
            if (addDir === 'IN') await api.post('/accounting/incomes', payload);
            else await api.post('/accounting/expenses', payload);
            message.success('Операция добавлена');
            setAddOpen(false);
            form.resetFields();
            fetchAll();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const exportCsv = () => {
        const header = ['Дата', 'Тип', 'Основание', 'Контрагент', 'Заявка', 'Счёт/касса', 'Сумма', 'Примечание'];
        const lines = filtered.map(r => [
            dayjs(r.date).format('DD.MM.YYYY'),
            r.direction === 'IN' ? 'Поступление' : 'Списание',
            r.title,
            r.counterparty || '',
            r.orderNumber || '',
            r.account || '',
            (r.direction === 'IN' ? '' : '-') + r.amount,
            (r.note || '').replace(/\n/g, ' '),
        ]);
        const csv = [header, ...lines]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
            .join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Операции_${dayjs().format('YYYY-MM-DD')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const columns = [
        {
            title: 'Дата', dataIndex: 'date', key: 'date', width: 110,
            render: (v: string) => <span style={{ fontSize: 13 }}>{dayjs(v).format('DD.MM.YYYY')}</span>,
        },
        {
            title: 'Тип', key: 'dir', width: 130,
            render: (_: any, r: OpRow) => r.direction === 'IN'
                ? <Tag color="green" style={{ margin: 0 }}><ArrowDownOutlined /> Поступление</Tag>
                : <Tag color="red" style={{ margin: 0 }}><ArrowUpOutlined /> Списание</Tag>,
        },
        {
            title: 'Основание', key: 'basis',
            render: (_: any, r: OpRow) => (
                <Space direction="vertical" size={0}>
                    <Space size={6}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</span>
                        {r.orderNumber && (
                            <Tag
                                color="blue"
                                style={{ margin: 0, cursor: 'pointer' }}
                                onClick={() => router.push('/company/accounting/registry')}
                            >
                                Заявка {r.orderNumber}
                            </Tag>
                        )}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {r.kindLabel}{r.counterparty ? ` · ${r.counterparty}` : ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Счёт / касса', dataIndex: 'account', key: 'account', width: 130,
            render: (v?: string) => <span style={{ fontSize: 13, color: 'var(--lc-text-ter)' }}>{v || '—'}</span>,
        },
        {
            title: 'Сумма', key: 'amount', width: 150, align: 'right' as const,
            render: (_: any, r: OpRow) => (
                <strong style={{ fontSize: 13, color: r.direction === 'IN' ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                    {r.direction === 'IN' ? '+' : '−'}{money(r.amount)}
                </strong>
            ),
        },
        {
            title: 'Примечание', dataIndex: 'note', key: 'note', width: 180, ellipsis: true,
            render: (v?: string) => <span style={{ fontSize: 13 }}>{v || '—'}</span>,
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Операции
                    </div>
                    <h1 className="lc2-title">Все операции</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Вся история денег в одном месте: оплаты по заявкам, прочие доходы и расходы. Здесь видно каждый платёж — куда и от кого.
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#16a34a' }}><ArrowDownOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Поступления</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>{money(totalIn)}</div>
                            <div className="lc2-msub">за период</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#ffeef0', color: '#dc2626' }}><ArrowUpOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Списания</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: '#dc2626' }}>{money(totalOut)}</div>
                            <div className="lc2-msub">за период</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}><SwapOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Сальдо</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: balance >= 0 ? '#16a34a' : '#dc2626' }}>{money(balance)}</div>
                            <div className="lc2-msub">приход − расход</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Space wrap>
                    <Segmented
                        value={typeFilter}
                        onChange={(v) => setTypeFilter(v as 'all' | 'IN' | 'OUT')}
                        options={[
                            { label: 'Все', value: 'all' },
                            { label: 'Поступления', value: 'IN' },
                            { label: 'Списания', value: 'OUT' },
                        ]}
                    />
                    <Input placeholder="Поиск: контрагент, заявка, примечание..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260 }} allowClear />
                    <RangePicker value={dateRange} onChange={(d) => setDateRange(d as any)} format="DD.MM.YYYY" placeholder={['С даты', 'По дату']} />
                    <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={filtered.length === 0}>Экспорт</Button>
                    {canEdit && (
                        <>
                            <Button type="primary" ghost icon={<ArrowDownOutlined />} onClick={() => openAdd('IN')}>Доход</Button>
                            <Button danger icon={<ArrowUpOutlined />} onClick={() => openAdd('OUT')}>Расход</Button>
                        </>
                    )}
                </Space>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    locale={{ emptyText: 'Нет операций за выбранный период' }}
                    pagination={{ pageSize: 30, showSizeChanger: true }}
                />
            </div>

            <Modal
                title={addDir === 'IN' ? 'Новый доход' : 'Новый расход'}
                open={addOpen}
                onCancel={() => setAddOpen(false)}
                onOk={() => form.submit()}
                okText="Добавить"
                cancelText="Отмена"
                confirmLoading={saving}
                destroyOnClose
            >
                <p style={{ color: 'var(--lc-text-ter)', fontSize: 12, marginTop: 0 }}>
                    {addDir === 'IN'
                        ? 'Прочий доход, не связанный с заявкой. Оплаты по заявкам вносятся в самой заявке или реестре.'
                        : 'Прочий расход, не связанный с заявкой (аренда, зарплата, топливо, налоги).'}
                </p>
                <Form form={form} layout="vertical" onFinish={handleSaveOp} initialValues={{ date: dayjs() }}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true, message: 'Укажите дату' }]}>
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>
                    <Form.Item name="category" label="Статья" rules={[{ required: true, message: 'Выберите статью' }]} extra="Не хватает статьи? Добавьте в справочнике: Финансы → Статьи">
                        <Select
                            placeholder="Выберите статью"
                            showSearch
                            optionFilterProp="label"
                            options={categories
                                .filter(c => c.direction === addDir)
                                .map(c => ({
                                    value: c.name,
                                    label: c.costType === 'PER_ORDER' ? `${c.name} · по заявке` : c.costType === 'PER_VEHICLE' ? `${c.name} · по машине` : c.name,
                                }))}
                            onChange={() => form.setFieldsValue({ orderId: undefined })}
                        />
                    </Form.Item>
                    {needsOrder && (
                        <Form.Item name="orderId" label="Заявка" rules={[{ required: true, message: 'Статья «по заявке» — укажите заявку' }]} extra="Расход отнесётся к этой заявке и уменьшит её маржу">
                            <Select
                                placeholder="Выберите заявку"
                                showSearch
                                optionFilterProp="label"
                                options={orders.map(o => ({ value: o.id, label: o.orderNumber }))}
                            />
                        </Form.Item>
                    )}
                    <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true, message: 'Укажите сумму' }]}>
                        <InputNumber style={{ width: '100%' }} min={0} placeholder="0" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} />
                    </Form.Item>
                    <Form.Item name="accountId" label="Касса / счёт" extra="Откуда/куда идут деньги — нужно для остатков по кассам">
                        <Select
                            placeholder="Выберите кассу или счёт"
                            allowClear
                            options={accounts.map(a => ({ value: a.id, label: `${a.name} · ${a.kind === 'CASH' ? 'касса' : 'счёт'}` }))}
                        />
                    </Form.Item>
                    <Form.Item name="note" label="Примечание">
                        <Input.TextArea rows={2} placeholder="Доп. информация" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
