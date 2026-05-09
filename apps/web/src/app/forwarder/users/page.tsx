'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Modal, Form, Input, InputNumber, Select, message, Typography, Space, Popconfirm, Tabs, Alert, Checkbox } from 'antd';
import { MailOutlined, EditOutlined, DeleteOutlined, CopyOutlined, SettingOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export const MODULE_PERMISSIONS = [
    { label: 'Заявки', value: 'orders' },
    { label: 'Документы', value: 'documents' },
    { label: 'Бухгалтерия', value: 'accounting' },
    { label: 'Партнеры', value: 'partners' },
    { label: 'Карта / Трекинг', value: 'tracking' },
    { label: 'Водители', value: 'drivers' },
];

const { Title, Text } = Typography;

interface ForwarderUser {
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    role: string;
    permissions: string[];
    commissionPercent: number;
    createdAt: string;
}

interface Invitation {
    id: string;
    email: string;
    role: string;
    token: string;
    permissions: string[];
    createdAt: string;
}

const roleLabels: Record<string, string> = {
    FORWARDER: 'Администратор',
    LOGISTICIAN: 'Менеджер',
    ACCOUNTANT: 'Бухгалтер',
    WAREHOUSE_MANAGER: 'Завсклад',
};

const roleColors: Record<string, string> = {
    FORWARDER: 'red',
    LOGISTICIAN: 'blue',
    ACCOUNTANT: 'gold',
    WAREHOUSE_MANAGER: 'green',
};

export default function ForwarderUsersPage() {
    const { user: currentUser } = useAuthStore();
    const [users, setUsers] = useState<ForwarderUser[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<ForwarderUser | null>(null);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, invRes] = await Promise.all([
                api.get('/company/users'),
                api.get('/company/invitations')
            ]);
            setUsers(usersRes.data);
            setInvitations(invRes.data);
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleInvite = async (values: any) => {
        try {
            const res = await api.post('/company/invitations', values);
            message.success('Приглашение создано');
            
            // Build the link based on current domain
            const link = `${window.location.origin}/invite?token=${res.data.token}`;
            setGeneratedLink(link);
            
            form.resetFields();
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        }
    };

    const handleCancelInvitation = async (id: string) => {
        try {
            await api.delete(`/company/invitations/${id}`);
            message.success('Приглашение отменено');
            fetchData();
        } catch (error) {
            message.error('Ошибка');
        }
    };

    const handleEditPermissions = async (values: any) => {
        try {
            if (!editingUser) return;
            // Сохраняем права
            await api.put(`/company/users/${editingUser.id}/permissions`, {
                permissions: values.permissions || [],
            });
            // Сохраняем комиссию
            if (values.commissionPercent !== undefined) {
                await api.put(`/forwarder/users/${editingUser.id}/commission`, {
                    commissionPercent: values.commissionPercent || 0,
                });
            }
            message.success('Настройки обновлены');
            setEditModalOpen(false);
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        try {
            await api.delete(`/company/users/${userId}`);
            message.success('Пользователь удалён');
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        }
    };

    const openInviteModal = () => {
        setGeneratedLink(null);
        form.resetFields();
        setModalOpen(true);
    };

    const copyToClipboard = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink);
            message.success('Ссылка скопирована в буфер обмена');
        }
    };

    const userColumns = [
        {
            title: 'Имя',
            key: 'name',
            render: (_: any, record: ForwarderUser) => `${record.firstName} ${record.lastName}`,
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
            title: '% от маржи',
            dataIndex: 'commissionPercent',
            key: 'commission',
            width: 100,
            render: (v: number) => <Tag color={v > 0 ? 'green' : 'default'}>{v || 0}%</Tag>,
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: ForwarderUser) => (
                <Space>
                    {record.id !== currentUser?.id && (
                        <Button 
                            icon={<SettingOutlined />} 
                            onClick={() => {
                                setEditingUser(record);
                                editForm.setFieldsValue({ 
                                    permissions: record.permissions || [],
                                    commissionPercent: record.commissionPercent || 0,
                                });
                                setEditModalOpen(true);
                            }}
                        />
                    )}
                    {record.id !== currentUser?.id && (
                        <Popconfirm
                            title="Удалить пользователя?"
                            onConfirm={() => handleDeleteUser(record.id)}
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

    const invitationColumns = [
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
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
            title: 'Создано',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => new Date(date).toLocaleString('ru-RU'),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Invitation) => (
                <Popconfirm
                    title="Отменить приглашение?"
                    onConfirm={() => handleCancelInvitation(record.id)}
                    okText="Да"
                    cancelText="Нет"
                >
                    <Button danger>Отменить</Button>
                </Popconfirm>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Title level={3}>Сотрудники</Title>
                <Button type="primary" icon={<MailOutlined />} onClick={openInviteModal}>
                    Пригласить
                </Button>
            </div>

            <Card>
                <Tabs defaultActiveKey="1">
                    <Tabs.TabPane tab={`Активные (${users.length})`} key="1">
                        <Table
                            columns={userColumns}
                            dataSource={users}
                            rowKey="id"
                            loading={loading}
                            pagination={false}
                        />
                    </Tabs.TabPane>
                    <Tabs.TabPane tab={`Приглашения (${invitations.length})`} key="2">
                        <Table
                            columns={invitationColumns}
                            dataSource={invitations}
                            rowKey="id"
                            loading={loading}
                            pagination={false}
                        />
                    </Tabs.TabPane>
                </Tabs>
            </Card>

            <Modal
                title="Приглашение сотрудника"
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={generatedLink ? [
                    <Button key="close" type="primary" onClick={() => setModalOpen(false)}>
                        Готово
                    </Button>
                ] : [
                    <Button key="cancel" onClick={() => setModalOpen(false)}>Отмена</Button>,
                    <Button key="submit" type="primary" onClick={() => form.submit()}>Создать ссылку</Button>
                ]}
            >
                {generatedLink ? (
                    <div style={{ padding: '20px 0', textAlign: 'center' }}>
                        <MailOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
                        <Title level={5}>Приглашение успешно создано!</Title>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                            Скопируйте эту ссылку и отправьте её сотруднику:
                        </Text>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Input value={generatedLink} readOnly />
                            <Button 
                                type="primary" 
                                icon={<CopyOutlined />} 
                                onClick={copyToClipboard}
                                style={{ marginLeft: 8 }}
                            />
                        </div>
                    </div>
                ) : (
                    <Form form={form} layout="vertical" onFinish={handleInvite}>
                        <Form.Item name="email" label="Email сотрудника" rules={[{ required: true, type: 'email' }]}>
                            <Input placeholder="employee@company.kz" />
                        </Form.Item>
                        <Form.Item name="role" label="Роль" rules={[{ required: true }]}>
                            <Select placeholder="Выберите роль">
                                <Select.Option value="LOGISTICIAN">Менеджер</Select.Option>
                                <Select.Option value="ACCOUNTANT">Бухгалтер</Select.Option>
                                <Select.Option value="WAREHOUSE_MANAGER">Завсклад</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="permissions" label="Права доступа (для левого меню)">
                            <Checkbox.Group options={MODULE_PERMISSIONS} />
                        </Form.Item>
                        <Alert 
                            message="Сотрудник сам введёт свои данные" 
                            description="По этой ссылке сотрудник сможет сам задать себе ФИО, телефон и пароль для входа." 
                            type="info" 
                            showIcon 
                            style={{ marginTop: 16 }}
                        />
                    </Form>
                )}
            </Modal>

            <Modal
                title={`Настройки: ${editingUser?.firstName} ${editingUser?.lastName}`}
                open={editModalOpen}
                onCancel={() => setEditModalOpen(false)}
                onOk={() => editForm.submit()}
                okText="Сохранить"
                cancelText="Отмена"
            >
                <Form form={editForm} layout="vertical" onFinish={handleEditPermissions}>
                    <Form.Item name="commissionPercent" label="Процент от маржи (%)">
                        <InputNumber min={0} max={100} step={1} style={{ width: '100%' }} placeholder="0" addonAfter="%" />
                    </Form.Item>
                    <Form.Item name="permissions" label="Доступ к разделам">
                        <Checkbox.Group options={MODULE_PERMISSIONS} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
