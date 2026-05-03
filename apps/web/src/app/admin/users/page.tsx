'use client';

import { useEffect, useState } from 'react';
import {
    Table, Card, Button, Tag, Space, Modal, Form,
    Input, Select, Typography, App, Switch
} from 'antd';
import { PlusOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { api, User } from '@/lib/api';

const { Title } = Typography;
const { Option } = Select;

const roleLabels: Record<string, string> = {
    ADMIN: 'Администратор',
    CUSTOMER: 'Заказчик',
    WAREHOUSE: 'Завсклад',
    DRIVER: 'Водитель',
    RECIPIENT: 'Грузополучатель',
    PARTNER: 'Партнёр ТК',
};

const roleColors: Record<string, string> = {
    ADMIN: 'purple',
    CUSTOMER: 'blue',
    WAREHOUSE: 'cyan',
    DRIVER: 'green',
    RECIPIENT: 'orange',
    PARTNER: 'magenta',
};

export default function UsersPage() {
    const { message } = App.useApp();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form] = Form.useForm();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await api.get('/users');
            setUsers(response.data);
        } catch (error) {
            message.error('Ошибка загрузки пользователей');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (values: any) => {
        try {
            await api.post('/users', values);
            message.success('Пользователь создан');
            setModalOpen(false);
            form.resetFields();
            fetchUsers();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания');
        }
    };

    const handleDeactivate = async (id: string) => {
        Modal.confirm({
            title: 'Деактивировать пользователя?',
            content: 'Пользователь не сможет войти в систему',
            okText: 'Деактивировать',
            cancelText: 'Отмена',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api.delete(`/users/${id}`);
                    message.success('Пользователь деактивирован');
                    fetchUsers();
                } catch {
                    message.error('Ошибка деактивации');
                }
            },
        });
    };

    const columns = [
        {
            title: 'Имя',
            key: 'name',
            render: (_: any, record: User) => (
                <strong>{record.lastName} {record.firstName}</strong>
            ),
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            render: (email: string) => email || '—',
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
            title: 'Транспорт',
            key: 'vehicle',
            render: (_: any, record: User) =>
                record.vehiclePlate ? `${record.vehicleModel} (${record.vehiclePlate})` : '—',
        },
        {
            title: 'Статус',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive: boolean) => (
                <Tag color={isActive ? 'green' : 'red'}>
                    {isActive ? 'Активен' : 'Неактивен'}
                </Tag>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: User) => (
                <Space>
                    <Button type="text" icon={<EditOutlined />} />
                    {record.isActive && (
                        <Button
                            type="text"
                            danger
                            icon={<StopOutlined />}
                            onClick={() => handleDeactivate(record.id)}
                        />
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Title level={3} style={{ margin: 0 }}>Пользователи</Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    Добавить
                </Button>
            </div>

            <Card>
                <Table
                    columns={columns}
                    dataSource={users}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                />
            </Card>

            <Modal
                title="Новый пользователь"
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
                width={500}
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item
                        name="role"
                        label="Роль"
                        rules={[{ required: true, message: 'Выберите роль' }]}
                    >
                        <Select placeholder="Выберите роль">
                            {Object.entries(roleLabels).map(([key, label]) => (
                                <Option key={key} value={key}>{label}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Space style={{ width: '100%' }} align="start">
                        <Form.Item
                            name="lastName"
                            label="Фамилия"
                            rules={[{ required: true }]}
                        >
                            <Input />
                        </Form.Item>
                        <Form.Item
                            name="firstName"
                            label="Имя"
                            rules={[{ required: true }]}
                        >
                            <Input />
                        </Form.Item>
                        <Form.Item name="middleName" label="Отчество">
                            <Input />
                        </Form.Item>
                    </Space>
                    <Form.Item
                        name="phone"
                        label="Телефон"
                        rules={[{ required: true, message: 'Введите телефон' }]}
                    >
                        <Input placeholder="+7..." />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input type="email" />
                    </Form.Item>
                    <Form.Item name="password" label="Пароль (для не-водителей)">
                        <Input.Password />
                    </Form.Item>
                    <Form.Item name="vehiclePlate" label="Госномер (для водителей)">
                        <Input placeholder="123ABC01" />
                    </Form.Item>
                    <Form.Item name="vehicleModel" label="Модель авто">
                        <Input placeholder="MAN TGX" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
