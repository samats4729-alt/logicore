'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Space, Tag, DatePicker, Input, Select, InputNumber, Modal, Form, App, Tooltip } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, InboxOutlined, SwapOutlined, ExportOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';

type MoveType = 'receipt' | 'transfer' | 'writeoff';

interface Nomen { id: string; name: string; unit: string; isActive?: boolean }
interface Wh { id: string; name: string; isActive?: boolean }
interface Cat { id: string; name: string; direction: 'IN' | 'OUT'; isActive?: boolean }
interface Line { id?: string; nomenclatureId: string; quantity: number; price?: number | null; amount?: number | null; nomenclature?: { name?: string; unit?: string } }
interface Move {
    id: string; number: string; date: string; note?: string | null; counterparty?: string | null; expenseCategory?: string | null;
    warehouseId: string; warehouse?: { name?: string }; toWarehouseId?: string | null; toWarehouse?: { name?: string };
    lines: Line[];
}

const money = (v: number) => (v || 0).toLocaleString('ru-RU') + ' ₸';
const num = (v: number) => (v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });

const CFG: Record<MoveType, { title: string; eyebrow: string; create: string; whLabel: string; hasTo: boolean; hasCounterparty: boolean; hasPrice: boolean; icon: any }> = {
    receipt: { title: 'Поступление товаров и услуг', eyebrow: 'ТМЦ · Документы', create: 'Создать поступление', whLabel: 'Склад (куда приходуем)', hasTo: false, hasCounterparty: true, hasPrice: true, icon: <InboxOutlined /> },
    transfer: { title: 'Перемещение товаров', eyebrow: 'ТМЦ · Документы', create: 'Создать перемещение', whLabel: 'Склад-отправитель', hasTo: true, hasCounterparty: false, hasPrice: false, icon: <SwapOutlined /> },
    writeoff: { title: 'Списание материалов', eyebrow: 'ТМЦ · Документы', create: 'Создать списание', whLabel: 'Склад (откуда списываем)', hasTo: false, hasCounterparty: false, hasPrice: false, icon: <ExportOutlined /> },
};

export default function StockMoveJournal({ type }: { type: MoveType }) {
    const router = useRouter();
    const { message, modal } = App.useApp();
    const { user } = useAuthStore();
    const canEdit = ['COMPANY_ADMIN', 'ACCOUNTANT', 'ADMIN'].includes(user?.role || '');
    const cfg = CFG[type];

    const [loading, setLoading] = useState(false);
    const [moves, setMoves] = useState<Move[]>([]);
    const [warehouses, setWarehouses] = useState<Wh[]>([]);
    const [nomen, setNomen] = useState<Nomen[]>([]);
    const [categories, setCategories] = useState<Cat[]>([]);
    const [search, setSearch] = useState('');

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Move | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => { fetchAll(); }, [type]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [mvRes, whRes, nmRes, catRes] = await Promise.all([
                api.get(`/inventory/moves/${type}`),
                api.get('/inventory/warehouses'),
                api.get('/inventory/nomenclature'),
                type === 'writeoff' ? api.get('/accounting/finance-categories') : Promise.resolve({ data: [] }),
            ]);
            setMoves(mvRes.data || []);
            setWarehouses((whRes.data || []).filter((w: Wh) => w.isActive !== false));
            setNomen((nmRes.data || []).filter((n: Nomen) => n.isActive !== false));
            setCategories((catRes.data || []).filter((c: Cat) => c.isActive !== false && c.direction === 'OUT'));
        } catch { message.error('Не удалось загрузить документы'); }
        finally { setLoading(false); }
    };

    const filtered = useMemo(() => moves.filter(m => {
        if (!search) return true;
        const q = search.toLowerCase();
        return `${m.number} ${m.counterparty || ''} ${m.note || ''} ${m.warehouse?.name || ''} ${m.toWarehouse?.name || ''}`.toLowerCase().includes(q)
            || m.lines.some(l => (l.nomenclature?.name || '').toLowerCase().includes(q));
    }), [moves, search]);

    const openCreate = () => {
        setEditing(null); form.resetFields();
        form.setFieldsValue({ date: dayjs(), warehouseId: warehouses[0]?.id, lines: [{ nomenclatureId: undefined, quantity: 1 }] });
        setModalOpen(true);
    };
    const openEdit = (m: Move) => {
        setEditing(m);
        form.setFieldsValue({
            date: dayjs(m.date), warehouseId: m.warehouseId, toWarehouseId: m.toWarehouseId || undefined, counterparty: m.counterparty || '', expenseCategory: m.expenseCategory || undefined, note: m.note || '',
            lines: m.lines.map(l => ({ nomenclatureId: l.nomenclatureId, quantity: l.quantity, price: l.price ?? undefined })),
        });
        setModalOpen(true);
    };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            const payload = {
                date: values.date.toISOString(),
                warehouseId: values.warehouseId,
                toWarehouseId: cfg.hasTo ? values.toWarehouseId : undefined,
                counterparty: cfg.hasCounterparty ? values.counterparty : undefined,
                expenseCategory: type === 'writeoff' ? (values.expenseCategory || undefined) : undefined,
                note: values.note || undefined,
                lines: (values.lines || []).filter((l: any) => l && l.nomenclatureId).map((l: any) => ({ nomenclatureId: l.nomenclatureId, quantity: l.quantity, price: cfg.hasPrice ? l.price : undefined })),
            };
            if (editing) await api.put(`/inventory/moves/${editing.id}`, payload);
            else await api.post(`/inventory/moves/${type}`, payload);
            message.success(editing ? 'Документ обновлён' : 'Документ создан');
            setModalOpen(false); fetchAll();
        } catch (e: any) { message.error(e.response?.data?.message || 'Ошибка сохранения'); }
        finally { setSaving(false); }
    };

    const handleDelete = (m: Move) => {
        modal.confirm({
            title: 'Удалить документ?', content: `${m.number} от ${dayjs(m.date).format('DD.MM.YYYY')}`,
            okText: 'Удалить', okButtonProps: { danger: true }, cancelText: 'Отмена',
            onOk: async () => { try { await api.delete(`/inventory/moves/${m.id}`); message.success('Документ удалён'); fetchAll(); } catch (e: any) { message.error(e.response?.data?.message || 'Не удалось удалить'); } },
        });
    };

    const columns = [
        { title: '№', dataIndex: 'number', key: 'number', width: 120, render: (v: string) => <span style={{ fontWeight: 600, fontSize: 13 }}>{v}</span> },
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 105, render: (v: string) => <span style={{ fontSize: 13 }}>{dayjs(v).format('DD.MM.YYYY')}</span> },
        {
            title: cfg.hasTo ? 'Откуда → Куда' : 'Склад', key: 'wh',
            render: (_: any, m: Move) => cfg.hasTo
                ? <span style={{ fontSize: 13 }}>{m.warehouse?.name} <SwapOutlined style={{ color: 'var(--lc-text-ter)', fontSize: 11 }} /> {m.toWarehouse?.name}</span>
                : <span style={{ fontSize: 13 }}>{m.warehouse?.name}</span>,
        },
        ...(cfg.hasCounterparty ? [{ title: 'Поставщик', dataIndex: 'counterparty', key: 'cp', render: (v: string) => <span style={{ fontSize: 13 }}>{v || '—'}</span> }] : []),
        ...(type === 'writeoff' ? [{ title: 'Статья затрат', dataIndex: 'expenseCategory', key: 'exp', render: (v: string) => v ? <Tag color="orange">{v}</Tag> : <span style={{ fontSize: 13, color: 'var(--lc-text-ter)' }}>—</span> }] : []),
        { title: 'Позиций', key: 'pos', width: 90, align: 'center' as const, render: (_: any, m: Move) => <Tag>{m.lines.length}</Tag> },
        ...(cfg.hasPrice ? [{ title: 'Сумма', key: 'sum', width: 140, align: 'right' as const, render: (_: any, m: Move) => <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(m.lines.reduce((s, l) => s + (l.amount || 0), 0))}</strong> }] : []),
        ...(canEdit ? [{
            title: '', key: 'act', width: 80,
            render: (_: any, m: Move) => (
                <Space size={0}>
                    <Tooltip title="Изменить"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(m)} /></Tooltip>
                    <Tooltip title="Удалить"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(m)} /></Tooltip>
                </Space>
            ),
        }] : []),
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1300, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        {cfg.eyebrow}
                    </div>
                    <h1 className="lc2-title">{cfg.title}</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        Журнал документов. Создайте документ, выберите склад и позиции номенклатуры — остатки пересчитаются автоматически.
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#eef2ff', color: '#4f46e5' }}>{cfg.icon}</div>
                        <div><div className="lc2-mlabel">Документов</div><div className="lc2-mvalue">{filtered.length}</div><div className="lc2-msub">в журнале</div></div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Space wrap>
                    <Input placeholder="Поиск: номер, склад, позиция, примечание…" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 320 }} allowClear />
                    {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={warehouses.length === 0 || nomen.length === 0}>{cfg.create}</Button>}
                </Space>
                {(warehouses.length === 0 || nomen.length === 0) && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: '#e67e22' }}>
                        Сначала заведите {warehouses.length === 0 ? <a onClick={() => router.push('/company/inventory/warehouses')}>склад</a> : null}
                        {warehouses.length === 0 && nomen.length === 0 ? ' и ' : ''}
                        {nomen.length === 0 ? <a onClick={() => router.push('/company/inventory/nomenclature')}>номенклатуру</a> : null}.
                    </div>
                )}
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table
                    columns={columns} dataSource={filtered} rowKey="id" loading={loading} size="small"
                    locale={{ emptyText: 'Нет документов' }} pagination={{ pageSize: 30, showTotal: (t) => `Всего: ${t}` }}
                    expandable={{
                        expandedRowRender: (m: Move) => (
                            <Table
                                size="small" pagination={false} rowKey={(l) => l.id || l.nomenclatureId}
                                dataSource={m.lines}
                                columns={[
                                    { title: 'Номенклатура', key: 'n', render: (_: any, l: Line) => l.nomenclature?.name || '—' },
                                    { title: 'Кол-во', key: 'q', width: 140, align: 'right' as const, render: (_: any, l: Line) => `${num(l.quantity)} ${l.nomenclature?.unit || ''}` },
                                    ...(cfg.hasPrice ? [
                                        { title: 'Цена', key: 'p', width: 120, align: 'right' as const, render: (_: any, l: Line) => l.price != null ? money(l.price) : '—' },
                                        { title: 'Сумма', key: 'a', width: 140, align: 'right' as const, render: (_: any, l: Line) => l.amount != null ? money(l.amount) : '—' },
                                    ] : []),
                                ]}
                            />
                        ),
                    }}
                />
            </div>

            <Modal
                title={editing ? `Изменить: ${cfg.title.toLowerCase()}` : cfg.create}
                open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}
                okText={editing ? 'Сохранить' : 'Создать'} cancelText="Отмена" confirmLoading={saving} destroyOnClose width={720}
            >
                <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <Form.Item name="date" label="Дата" rules={[{ required: true, message: 'Укажите дату' }]} style={{ flex: '0 0 160px' }}>
                            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                        </Form.Item>
                        <Form.Item name="warehouseId" label={cfg.whLabel} rules={[{ required: true, message: 'Укажите склад' }]} style={{ flex: 1, minWidth: 200 }}>
                            <Select showSearch optionFilterProp="label" options={warehouses.map(w => ({ value: w.id, label: w.name }))} />
                        </Form.Item>
                        {cfg.hasTo && (
                            <Form.Item name="toWarehouseId" label="Склад-получатель" rules={[{ required: true, message: 'Укажите склад' }]} style={{ flex: 1, minWidth: 200 }}>
                                <Select showSearch optionFilterProp="label" options={warehouses.map(w => ({ value: w.id, label: w.name }))} />
                            </Form.Item>
                        )}
                    </div>
                    {cfg.hasCounterparty && (
                        <Form.Item name="counterparty" label="Поставщик">
                            <Input placeholder="Наименование поставщика" />
                        </Form.Item>
                    )}
                    {type === 'writeoff' && (
                        <Form.Item name="expenseCategory" label="Статья затрат" extra="Списание попадёт в расход (Прибыли и убытки / Расходы по статьям) по себестоимости. Кассу не трогает.">
                            <Select
                                placeholder="Списание материалов"
                                showSearch optionFilterProp="label" allowClear
                                options={categories.map(c => ({ value: c.name, label: c.name }))}
                            />
                        </Form.Item>
                    )}

                    <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 8px' }}>Позиции</div>
                    <Form.List name="lines">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...rest }) => (
                                    <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                        <Form.Item {...rest} name={[name, 'nomenclatureId']} rules={[{ required: true, message: 'Позиция' }]} style={{ flex: 2 }}>
                                            <Select placeholder="Номенклатура" showSearch optionFilterProp="label" options={nomen.map(n => ({ value: n.id, label: `${n.name} (${n.unit})` }))} />
                                        </Form.Item>
                                        <Form.Item {...rest} name={[name, 'quantity']} rules={[{ required: true, message: 'Кол-во' }]} style={{ flex: 1 }}>
                                            <InputNumber placeholder="Кол-во" min={0} style={{ width: '100%' }} />
                                        </Form.Item>
                                        {cfg.hasPrice && (
                                            <Form.Item {...rest} name={[name, 'price']} style={{ flex: 1 }}>
                                                <InputNumber placeholder="Цена" min={0} style={{ width: '100%' }} />
                                            </Form.Item>
                                        )}
                                        <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(name)} style={{ marginTop: 2 }} disabled={fields.length === 1} />
                                    </div>
                                ))}
                                <Button type="dashed" onClick={() => add({ quantity: 1 })} icon={<PlusOutlined />} block>Добавить позицию</Button>
                            </>
                        )}
                    </Form.List>

                    <Form.Item name="note" label="Примечание" style={{ marginTop: 12 }}>
                        <Input.TextArea rows={2} placeholder="Доп. информация" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
