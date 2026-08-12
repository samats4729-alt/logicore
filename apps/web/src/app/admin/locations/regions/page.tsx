'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Landmark } from 'lucide-react';
import { api, Country, Region } from '@/lib/api';
import { toast } from 'sonner';
import GeographyHeader from '../GeographyHeader';
import nova from '@/components/nova/nova.module.css';

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
            const list: Country[] = res.data || [];
            setCountries(list);
            if (list.length > 0 && !selectedCountryId) {
                const kazakhstan = list.find(country =>
                    country.code === 'KZ' || /казах/i.test(country.name),
                );
                setSelectedCountryId((kazakhstan || list[0]).id);
            }
        } catch (error) {
            toast.error('Ошибка загрузки стран');
        }
    };

    const fetchRegions = async (countryId: string) => {
        setLoading(true);
        try {
            const res = await api.get(`/cities/regions?countryId=${countryId}`);
            setRegions(res.data);
        } catch (error) {
            toast.error('Ошибка загрузки регионов');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (values: any) => {
        try {
            const payload = { ...values, countryId: selectedCountryId };

            if (editingId) {
                await api.patch(`/cities/regions/${editingId}`, payload);
                toast.success('Регион обновлён');
            } else {
                await api.post('/cities/regions', payload);
                toast.success('Регион создан');
            }
            setModalOpen(false);
            form.resetFields();
            if (selectedCountryId) fetchRegions(selectedCountryId);
        } catch (error) {
            toast.error('Ошибка сохранения');
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
            toast.success('Регион удалён');
            if (selectedCountryId) fetchRegions(selectedCountryId);
        } catch (error) {
            toast.error('Ошибка удаления');
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
            <GeographyHeader
                actions={(
                    <>
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
                        <button
                            type="button"
                            className={`${nova.action} ${nova.actionPrimary}`}
                            disabled={!selectedCountryId}
                            onClick={() => { setEditingId(null); form.resetFields(); setModalOpen(true); }}
                        >
                            <PlusOutlined /> Регион
                        </button>
                    </>
                )}
            />

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <Landmark size={14} />
                    <h2 className={nova.cardTitle}>Регионы и области</h2>
                    {selectedCountryId && regions.length > 0 && (
                        <span className={nova.cardCount}>{regions.length}</span>
                    )}
                </div>
                {!selectedCountryId ? (
                    <div className={nova.empty}>
                        Выберите страну — области показываются по одной стране за раз.
                    </div>
                ) : (
                    <Table
                        dataSource={regions}
                        columns={columns}
                        rowKey="id"
                        size="small"
                        loading={loading}
                        pagination={false}
                        locale={{ emptyText: 'В этой стране пока нет регионов' }}
                    />
                )}
            </section>

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
