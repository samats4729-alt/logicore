'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Typography, Space, Tag, Input, Switch, Modal, Form, Select, App } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, SearchOutlined, AppstoreOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const { Text } = Typography;

interface Item { id: string; name: string; unit: string; sku: string | null; isActive: boolean }

export default function NomenclaturePage() {
    const router = useRouter();
    const { message } = App.useApp();
    const { user } = useAuthStore();
    const canEdit = ['COMPANY_ADMIN', 'ACCOUNTANT', 'ADMIN'].includes(user?.role || '');

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<Item[]>([]);
    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Item | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => { fetchItems(); }, []);

    const fetchItems = async () => {
        setLoading(true);
        try { setItems((await api.get('/inventory/nomenclature')).data || []); }
        catch { message.error('Не удалось загрузить номенклатуру'); }
        finally { setLoading(false); }
    };

    const filtered = useMemo(() => items.filter(i => !search || `${i.name} ${i.sku || ''}`.toLowerCase().includes(search.toLowerCase())), [items, search]);

    const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ unit: 'шт' }); setModalOpen(true); };
    const openEdit = (r: Item) => { setEditing(r); form.setFieldsValue({ name: r.name, unit: r.unit, sku: r.sku || '', isActive: r.isActive }); setModalOpen(true); };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            if (editing) await api.put(`/inventory/nomenclature/${editing.id}`, values);
            else await api.post('/inventory/nomenclature', values);
            message.success(editing ? 'Позиция обновлена' : 'Позиция добавлена');
            setModalOpen(false); fetchItems();
        } catch (e: any) { message.error(e.response?.data?.message || 'Ошибка сохранения'); }
        finally { setSaving(false); }
    };

    const toggleActive = async (r: Item, isActive: boolean) => {
        try { await api.put(`/inventory/nomenclature/${r.id}`, { isActive }); fetchItems(); }
        catch { message.error('Не удалось изменить статус'); }
    };

    const columns = [
        { title: 'Наименование', dataIndex: 'name', key: 'name', render: (v: string, r: Item) => <Text style={{ fontSize: 13, color: r.isActive ? undefined : 'var(--lc-text-ter)' }}>{v}</Text> },
        { title: 'Артикул', dataIndex: 'sku', key: 'sku', width: 160, render: (v: string) => <Text type="secondary">{v || '—'}</Text> },
        { title: 'Ед. изм.', dataIndex: 'unit', key: 'unit', width: 110, render: (v: string) => <Tag>{v}</Tag> },
        { title: 'Статус', dataIndex: 'isActive', key: 'active', width: 100, render: (v: boolean, r: Item) => <Switch checked={v} disabled={!canEdit} size="small" onChange={(c) => toggleActive(r, c)} /> },
        ...(canEdit ? [{ title: '', key: 'act', width: 56, render: (_: any, r: Item) => <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> }] : []),
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        ТМЦ · Справочники
                    </div>
                    <h1 className="lc2-title">Номенклатура</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0', maxWidth: 620 }}>
                        Справочник товаров и материалов: топливо, запчасти, шины, расходники. Используется в документах ТМЦ и остатках.
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#eef2ff', color: '#4f46e5' }}><AppstoreOutlined /></div>
                        <div><div className="lc2-mlabel">Позиций</div><div className="lc2-mvalue">{items.filter(i => i.isActive).length}</div><div className="lc2-msub">активных</div></div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Space wrap>
                    <Input placeholder="Поиск по названию или артикулу…" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 300 }} allowClear />
                    {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить позицию</Button>}
                </Space>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table columns={columns} dataSource={filtered} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет позиций' }} pagination={{ pageSize: 30 }} />
            </div>

            <Modal title={editing ? 'Редактировать позицию' : 'Новая позиция номенклатуры'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText={editing ? 'Сохранить' : 'Добавить'} cancelText="Отмена" confirmLoading={saving} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 8 }}>
                    <Form.Item name="name" label="Наименование" rules={[{ required: true, message: 'Укажите наименование' }]}>
                        <Input size="large" maxLength={120} placeholder="Например: Дизельное топливо" />
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Form.Item name="unit" label="Единица измерения" style={{ flex: 1 }}>
                            <Select size="large" options={['шт', 'л', 'кг', 'т', 'м', 'компл', 'услуга'].map(u => ({ value: u, label: u }))} />
                        </Form.Item>
                        <Form.Item name="sku" label="Артикул (необязательно)" style={{ flex: 1 }}>
                            <Input size="large" maxLength={40} />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
