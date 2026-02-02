'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Modal, Form, Input, message, Space, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined } from '@ant-design/icons';
import { api, Country } from '@/lib/api';

const { Title } = Typography;

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
            message.error('Ошибка загрузки стран');
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
                message.success('Страна обновлена');
            } else {
                await api.post('/cities/countries', values);
                message.success('Страна создана');
            }
            setModalOpen(false);
            form.resetFields();
            fetchCountries();
        } catch (error) {
            message.error('Ошибка сохранения');
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
            message.success('Страна удалена');
            fetchCountries();
        } catch (error) {
            message.error('Ошибка удаления');
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
            render: (text: string) => <Typography.Text code>{text}</Typography.Text>,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
                <Title level={2} style={{ margin: 0 }}>
                    <GlobalOutlined style={{ marginRight: 12 }} />
                    Страны
                </Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}>
                    Добавить страну
                </Button>
            </div>

            <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Table
                    dataSource={countries}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                />
            </Card>

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
