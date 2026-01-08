'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Modal, Form, Input, Select, message, Typography, Space, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title } = Typography;

interface CompanyUser {
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    role: string;
    createdAt: string;
}

const roleLabels: Record<string, string> = {
    COMPANY_ADMIN: 'Админ',
    LOGISTICIAN: 'Логист',
    WAREHOUSE_MANAGER: 'Завсклад',
};

const roleColors: Record<string, string> = {
    COMPANY_ADMIN: 'purple',
    LOGISTICIAN: 'blue',
    WAREHOUSE_MANAGER: 'green',
};

export default function CompanyUsersPage() {
    const [users, setUsers] = useState<CompanyUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
    const [form] = Form.useForm();

    const fetchUsers = async () => {
        try {
            const response = await api.get('/company/users');
            setUsers(response.data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSubmit = async (values: any) => {
        try {
            if (editingUser) {
                await api.put(`/company/users/${editingUser.id}`, values);
                message.success('Пользователь обновлён');
            } else {
                await api.post('/company/users', values);
                message.success('Пользователь создан');
            }
            setModalOpen(false);
            form.resetFields();
            setEditingUser(null);
            fetchUsers();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        }
    };

    const handleDelete = async (userId: string) => {
        try {
            await api.delete(`/company/users/${userId}`);
            message.success('Пользователь удалён');
            fetchUsers();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        }
    };

    const openEditModal = (user: CompanyUser) => {
        setEditingUser(user);
        form.setFieldsValue({
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
        });
        setModalOpen(true);
    };

    const openCreateModal = () => {
        setEditingUser(null);
        form.resetFields();
        setModalOpen(true);
    };

    const columns = [
        {
            title: 'Имя',
            key: 'name',
            render: (_: any, record: CompanyUser) => `${record.firstName} ${record.lastName}`,
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
        },
        {
            title: 'Роль',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => (
                <Tag color={roleColors[role] || 'default'}>
                    {roleLabels[role] || role}
                </Tag>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: CompanyUser) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => openEditModal(record)} />
                    {record.role !== 'COMPANY_ADMIN' && (
                        <Popconfirm
                            title="Удалить пользователя?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Да"
                            cancelText="Нет"
                        >
                            <Button icon={<DeleteOutlined />} danger />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Title level={3}>Пользователи компании</Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                    Добавить
                </Button>
            </div>

            <Card>
                <Table
                    columns={columns}
                    dataSource={users}
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                />
            </Card>

            <Modal
                title={editingUser ? 'Редактировать' : 'Новый пользователь'}
                open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditingUser(null); }}
                onOk={() => form.submit()}
                okText={editingUser ? 'Сохранить' : 'Создать'}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    {!editingUser && (
                        <>
                            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                                <Input />
                            </Form.Item>
                            <Form.Item name="phone" label="Телефон" rules={[{ required: true }]}>
                                <Input placeholder="+77001234567" />
                            </Form.Item>
                            <Form.Item name="password" label="Пароль" rules={[{ required: true, min: 6 }]}>
                                <Input.Password />
                            </Form.Item>
                        </>
                    )}
                    <Form.Item name="firstName" label="Имя" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="lastName" label="Фамилия" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
                        <Select>
                            <Select.Option value="LOGISTICIAN">Логист</Select.Option>
                            <Select.Option value="WAREHOUSE_MANAGER">Завсклад</Select.Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
