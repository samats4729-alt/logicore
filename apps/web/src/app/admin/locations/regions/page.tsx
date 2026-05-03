'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Modal, Form, Input, message, Select, Space, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { api, Country, Region } from '@/lib/api';

const { Title } = Typography;
const { Option } = Select;

export default function AdminRegionsPage() {
    const [countries, setCountries] = useState<Country[]>([]);
    const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
    const [regions, setRegions] = useState<Region[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        fetchCountries();
    }, []);

    useEffect(() => {
        if (selectedCountryId) {
            fetchRegions(selectedCountryId);
        } else {
            setRegions([]);
        }
    }, [selectedCountryId]);

    const fetchCountries = async () => {
        try {
            const res = await api.get('/cities/countries');
            setCountries(res.data);
            // Select first country by default if available
            if (res.data.length > 0 && !selectedCountryId) {
                setSelectedCountryId(res.data[0].id);
            }
        } catch (error) {
            message.error('Ошибка загрузки стран');
        }
    };

    const fetchRegions = async (countryId: string) => {
        setLoading(true);
        try {
            const res = await api.get(`/cities/regions?countryId=${countryId}`);
            setRegions(res.data);
        } catch (error) {
            message.error('Ошибка загрузки регионов');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (values: any) => {
        try {
            const payload = { ...values, countryId: selectedCountryId };

            if (editingId) {
                await api.patch(`/cities/regions/${editingId}`, payload);
                message.success('Регион обновлен');
            } else {
                await api.post('/cities/regions', payload);
                message.success('Регион создан');
            }
            setModalOpen(false);
            form.resetFields();
            if (selectedCountryId) fetchRegions(selectedCountryId);
        } catch (error) {
            message.error('Ошибка сохранения');
        }
    };

    const handleEdit = (record: Region) => {
        setEditingId(record.id);
        form.setFieldsValue(record);
        setModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/cities/regions/${id}`);
            message.success('Регион удален');
            if (selectedCountryId) fetchRegions(selectedCountryId);
        } catch (error) {
            message.error('Ошибка удаления');
        }
    };

    const columns = [
        {
            title: 'Название области',
            dataIndex: 'name',
            key: 'name',
            fontWeight: 'bold',
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 150,
            render: (_: any, record: Region) => (
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
                    <EnvironmentOutlined style={{ marginRight: 12 }} />
                    Регионы / Области
                </Title>
                <div style={{ display: 'flex', gap: 16 }}>
                    <Select
                        style={{ width: 200 }}
                        placeholder="Выберите страну"
                        value={selectedCountryId}
                        onChange={setSelectedCountryId}
                    >
                        {countries.map(c => (
                            <Option key={c.id} value={c.id}>{c.name}</Option>
                        ))}
                    </Select>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}
                        disabled={!selectedCountryId}
                    >
                        Добавить регион
                    </Button>
                </div>
            </div>

            <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                {!selectedCountryId ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                        Выберите страну, чтобы увидеть список регионов
                    </div>
                ) : (
                    <Table
                        dataSource={regions}
                        columns={columns}
                        rowKey="id"
                        loading={loading}
                        pagination={false}
                        locale={{ emptyText: 'В этой стране пока нет регионов' }}
                    />
                )}
            </Card>

            <Modal
                title={editingId ? "Редактировать регион" : "Новый регион"}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="name" label="Название" rules={[{ required: true }]}>
                        <Input placeholder="Например: Алматинская область" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
