'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Popconfirm, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, GlobalOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title } = Typography;

interface ExternalCompany {
    id: string;
    name: string;
    bin?: string;
    phone?: string;
    email?: string;
    type: 'CUSTOMER' | 'FORWARDER';
    address?: string;
    directorName?: string;
    isActive: boolean;
    createdAt: string;
}

export default function ExternalCompaniesSection() {
    const [companies, setCompanies] = useState<ExternalCompany[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<ExternalCompany | null>(null);
    const [form] = Form.useForm();

    const fetchCompanies = async () => {
        setLoading(true);
        try {
            const res = await api.get('/external-companies');
            setCompanies(res.data);
        } catch (e) {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCompanies();
    }, []);

    const handleSave = async (values: any) => {
        try {
            if (editingCompany) {
                await api.patch(`/external-companies/${editingCompany.id}`, values);
                message.success('Компания обновлена');
            } else {
                await api.post('/external-companies', values);
                message.success('Компания добавлена');
            }
            setModalOpen(false);
            form.resetFields();
            setEditingCompany(null);
            fetchCompanies();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/external-companies/${id}`);
            message.success('Компания удалена');
            fetchCompanies();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка удаления');
        }
    };

    const openEdit = (company: ExternalCompany) => {
        setEditingCompany(company);
        form.setFieldsValue(company);
        setModalOpen(true);
    };

    const openCreate = () => {
        setEditingCompany(null);
        form.resetFields();
        setModalOpen(true);
    };

    const columns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => <strong>{text}</strong>,
        },
        {
            title: 'Тип',
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => (
                <Tag color={type === 'CUSTOMER' ? 'blue' : 'green'}>
                    {type === 'CUSTOMER' ? 'Заказчик' : 'Экспедитор'}
                </Tag>
            ),
        },
        {
            title: 'БИН',
            dataIndex: 'bin',
            key: 'bin',
            render: (v: string) => v || '—',
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
            render: (v: string) => v || '—',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            render: (v: string) => v || '—',
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: ExternalCompany) => (
                <Space>
                    <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                        Изменить
                    </Button>
                    <Popconfirm title="Удалить компанию?" onConfirm={() => handleDelete(record.id)}>
                        <Button type="link" danger icon={<DeleteOutlined />}>
                            Удалить
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>
                    <GlobalOutlined style={{ marginRight: 8 }} />
                    Внешние компании
                </Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Добавить компанию
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={companies}
                rowKey="id"
                loading={loading}
                locale={{ emptyText: 'Нет внешних компаний' }}
                pagination={false}
                size="middle"
            />

            <Modal
                title={editingCompany ? 'Редактировать компанию' : 'Новая внешняя компания'}
                open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditingCompany(null); form.resetFields(); }}
                onOk={() => form.submit()}
                okText="Сохранить"
                cancelText="Отмена"
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="ТОО Пример" />
                    </Form.Item>
                    {!editingCompany && (
                        <Form.Item name="type" label="Тип" rules={[{ required: true, message: 'Выберите тип' }]}>
                            <Select placeholder="Выберите тип">
                                <Select.Option value="CUSTOMER">Заказчик</Select.Option>
                                <Select.Option value="FORWARDER">Экспедитор</Select.Option>
                            </Select>
                        </Form.Item>
                    )}
                    <Form.Item name="bin" label="БИН/ИИН">
                        <Input placeholder="123456789012" />
                    </Form.Item>
                    <Form.Item name="phone" label="Телефон">
                        <Input placeholder="+77001234567" />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input placeholder="company@example.com" />
                    </Form.Item>
                    <Form.Item name="address" label="Адрес">
                        <Input placeholder="г. Алматы, ул. Абая 1" />
                    </Form.Item>
                    <Form.Item name="directorName" label="ФИО директора">
                        <Input placeholder="Иванов Иван Иванович" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
