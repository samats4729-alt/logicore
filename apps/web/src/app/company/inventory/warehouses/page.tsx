'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Typography, Switch, Modal, Form, Input, App } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, HomeOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const { Text } = Typography;

interface Warehouse { id: string; name: string; isActive: boolean }

export default function WarehousesPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const { user } = useAuthStore();
    const canEdit = ['COMPANY_ADMIN', 'ACCOUNTANT', 'ADMIN'].includes(user?.role || '');

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<Warehouse[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Warehouse | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => { fetchItems(); }, []);

    const fetchItems = async () => {
        setLoading(true);
        try { setItems((await api.get('/inventory/warehouses')).data || []); }
        catch { message.error('Не удалось загрузить склады'); }
        finally { setLoading(false); }
    };

    const openCreate = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
    const openEdit = (r: Warehouse) => { setEditing(r); form.setFieldsValue({ name: r.name }); setModalOpen(true); };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            if (editing) await api.put(`/inventory/warehouses/${editing.id}`, values);
            else await api.post('/inventory/warehouses', values);
            message.success(editing ? 'Склад обновлён' : 'Склад добавлен');
            setModalOpen(false); fetchItems();
        } catch (e: any) { message.error(e.response?.data?.message || 'Ошибка сохранения'); }
        finally { setSaving(false); }
    };

    const toggleActive = async (r: Warehouse, isActive: boolean) => {
        try { await api.put(`/inventory/warehouses/${r.id}`, { isActive }); fetchItems(); }
        catch { message.error('Не удалось изменить статус'); }
    };

    const columns = [
        { title: 'Склад', dataIndex: 'name', key: 'name', render: (v: string, r: Warehouse) => <Text style={{ fontSize: 13, color: r.isActive ? undefined : 'var(--lc-text-ter)' }}>{v}</Text> },
        { title: 'Статус', dataIndex: 'isActive', key: 'active', width: 100, render: (v: boolean, r: Warehouse) => <Switch checked={v} disabled={!canEdit} size="small" onChange={(c) => toggleActive(r, c)} /> },
        ...(canEdit ? [{ title: '', key: 'act', width: 56, render: (_: any, r: Warehouse) => <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> }] : []),
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 900, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        ТМЦ · Справочники
                    </div>
                    <h1 className="lc2-title">Склады</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0', maxWidth: 560 }}>
                        Места хранения ТМЦ. По складам ведутся остатки, между ними оформляются перемещения.
                    </p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#eef2ff', color: '#4f46e5' }}><HomeOutlined /></div>
                        <div><div className="lc2-mlabel">Складов</div><div className="lc2-mvalue">{items.filter(i => i.isActive).length}</div><div className="lc2-msub">активных</div></div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить склад</Button>}
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table columns={columns} dataSource={items} rowKey="id" loading={loading} size="small" locale={{ emptyText: 'Нет складов' }} pagination={false} />
            </div>

            <Modal title={editing ? 'Редактировать склад' : 'Новый склад'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText={editing ? 'Сохранить' : 'Добавить'} cancelText="Отмена" confirmLoading={saving} destroyOnClose>
                <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 8 }}>
                    <Form.Item name="name" label="Название склада" rules={[{ required: true, message: 'Укажите название' }]}>
                        <Input size="large" maxLength={80} placeholder="Например: Основной склад" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
