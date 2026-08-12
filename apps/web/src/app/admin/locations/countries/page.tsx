'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Space } from 'antd';
import { Globe } from 'lucide-react';
import GeographyHeader from '../GeographyHeader';
import nova from '@/components/nova/nova.module.css';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api, Country } from '@/lib/api';
import { toast } from 'sonner';

export default function AdminCountriesPage() {
    const [countries, setCountries] = useState<Country[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();

    const fetchCountries = async () => {
        setLoading(true);
        try {
            const res = await api.get('/cities/countries');
            setCountries(res.data);
        } catch (error) {
            toast.error('Ошибка загрузки стран');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCountries();
    }, []);

    const handleSave = async (values: any) => {
        try {
            if (editingId) {
                await api.patch(`/cities/countries/${editingId}`, values);
                toast.success('Страна обновлена');
            } else {
                await api.post('/cities/countries', values);
                toast.success('Страна создана');
            }
            setModalOpen(false);
            form.resetFields();
            fetchCountries();
        } catch (error) {
            toast.error('Ошибка сохранения');
        }
    };

    const handleEdit = (record: Country) => {
        setEditingId(record.id);
        form.setFieldsValue(record);
        setModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/cities/countries/${id}`);
            toast.success('Страна удалена');
            fetchCountries();
        } catch (error) {
            toast.error('Ошибка удаления');
        }
    };

    const columns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            fontWeight: 'bold',
        },
        {
            title: 'Код (ISO)',
            dataIndex: 'code',
            key: 'code',
            render: (text: string) => <span className={nova.chip}>{text}</span>,
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Country) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
                </Space>
            ),
        },
    ];

    return (
        <div>
            <GeographyHeader
                actions={(
                    <button
                        type="button"
                        className={`${nova.action} ${nova.actionPrimary}`}
                        onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}
                    >
                        <PlusOutlined /> Страна
                    </button>
                )}
            />

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <Globe size={14} />
                    <h2 className={nova.cardTitle}>Страны</h2>
                    {countries.length > 0 && <span className={nova.cardCount}>{countries.length}</span>}
                </div>
                <Table
                    dataSource={countries}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    loading={loading}
                    pagination={false}
                />
            </section>

            <Modal
                title={editingId ? "Редактировать страну" : "Новая страна"}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="name" label="Название" rules={[{ required: true }]}>
                        <Input placeholder="Например: Узбекистан" />
                    </Form.Item>
                    <Form.Item name="code" label="Код (2 символа)" rules={[{ required: true, len: 2 }]}>
                        <Input placeholder="Например: UZ" style={{ textTransform: 'uppercase' }} maxLength={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
