'use client';

import { useState, useEffect, useMemo } from 'react';
import { Table, Button, Typography, Space, Tag, Input, Switch, Modal, Form, App } from 'antd';
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, SearchOutlined, BookOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

const { Text } = Typography;

interface DictItem {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
    isDefault: boolean;
}

export default function DictionaryManager({
    kind, title, description, hasCode = false, codeLabel = 'Код', namePlaceholder,
}: {
    kind: string;
    title: string;
    description: string;
    hasCode?: boolean;
    codeLabel?: string;
    namePlaceholder?: string;
}) {
    const router = useRouter();
    const { message } = App.useApp();
    const { user } = useAuthStore();
    const canEdit = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<DictItem[]>([]);
    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<DictItem | null>(null);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => { fetchItems(); }, [kind]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/accounting/dictionaries/${kind}`);
            setItems(res.data || []);
        } catch {
            message.error('Не удалось загрузить справочник');
        } finally {
            setLoading(false);
        }
    };

    const filtered = useMemo(() => items.filter(i =>
        !search || `${i.name} ${i.code || ''}`.toLowerCase().includes(search.toLowerCase())
    ), [items, search]);

    const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ isDefault: false }); setModalOpen(true); };
    const openEdit = (r: DictItem) => { setEditing(r); form.setFieldsValue({ name: r.name, code: r.code || '', isDefault: r.isDefault }); setModalOpen(true); };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            const payload = { name: values.name, code: hasCode ? values.code : undefined, isDefault: values.isDefault };
            if (editing) { await api.put(`/accounting/dictionaries/item/${editing.id}`, payload); message.success('Запись обновлена'); }
            else { await api.post(`/accounting/dictionaries/${kind}`, payload); message.success('Запись добавлена'); }
            setModalOpen(false);
            fetchItems();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (r: DictItem, active: boolean) => {
        try {
            await api.put(`/accounting/dictionaries/item/${r.id}/deactivate`, { active });
            message.success(active ? 'Запись активирована' : 'Запись скрыта');
            fetchItems();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось изменить статус');
        }
    };

    const columns = [
        {
            title: 'Наименование', dataIndex: 'name', key: 'name',
            render: (v: string, r: DictItem) => (
                <Text style={{ fontSize: 13, color: r.isActive ? undefined : 'var(--lc-text-ter)' }}>
                    {v}{r.isDefault && <Tag color="green" style={{ marginLeft: 8 }}>по умолчанию</Tag>}
                </Text>
            ),
        },
        ...(hasCode ? [{ title: codeLabel, dataIndex: 'code', key: 'code', width: 180, render: (v: string) => <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{v || '—'}</Text> }] : []),
        {
            title: 'Статус', dataIndex: 'isActive', key: 'active', width: 110,
            render: (v: boolean, r: DictItem) => <Switch checked={v} disabled={!canEdit} size="small" onChange={(c) => toggleActive(r, c)} />,
        },
        ...(canEdit ? [{ title: '', key: 'act', width: 60, render: (_: any, r: DictItem) => <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /> }] : []),
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">
                        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/company/finance')} style={{ padding: 0, marginRight: 8, height: 'auto' }} />
                        Финансы · Справочники
                    </div>
                    <h1 className="lc2-title">{title}</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0', maxWidth: 640 }}>{description}</p>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#eef2ff', color: '#4f46e5' }}><BookOutlined /></div>
                        <div>
                            <div className="lc2-mlabel">Записей</div>
                            <div className="lc2-mvalue">{items.filter(i => i.isActive).length}</div>
                            <div className="lc2-msub">активных</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lc-card" style={{ padding: 16, marginBottom: 12 }}>
                <Space wrap>
                    <Input placeholder="Поиск…" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 260 }} allowClear />
                    {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить</Button>}
                </Space>
            </div>

            <div className="lc-card" style={{ padding: 0 }}>
                <Table columns={columns} dataSource={filtered} rowKey="id" loading={loading} size="small"
                    locale={{ emptyText: 'Нет записей' }} pagination={{ pageSize: 30, hideOnSinglePage: true }} />
            </div>

            <Modal
                title={editing ? 'Редактировать запись' : `Добавить: ${title.toLowerCase()}`}
                open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}
                okText={editing ? 'Сохранить' : 'Добавить'} cancelText="Отмена" confirmLoading={saving} destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 8 }}>
                    <Form.Item name="name" label="Наименование" rules={[{ required: true, message: 'Укажите наименование' }]}>
                        <Input size="large" maxLength={120} placeholder={namePlaceholder} />
                    </Form.Item>
                    {hasCode && (
                        <Form.Item name="code" label={codeLabel}>
                            <Input size="large" maxLength={40} />
                        </Form.Item>
                    )}
                    <Form.Item name="isDefault" label="По умолчанию" valuePropName="checked" extra="Подставляется автоматически (может быть только одна запись)">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
