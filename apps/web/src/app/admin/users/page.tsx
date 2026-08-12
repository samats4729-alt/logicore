'use client';

import { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select } from 'antd';
import { PlusOutlined, StopOutlined } from '@ant-design/icons';
import { Users } from 'lucide-react';
import { api, User } from '@/lib/api';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@/lib/vocabulary';
import nova from '@/components/nova/nova.module.css';

const { Option } = Select;

/**
 * Люди на платформе — все, из всех компаний.
 *
 * Подписи ролей раньше жили здесь своим списком, и он отстал от жизни: в
 * таблице стояло `LOGISTICIAN` и `COMPANY_ADMIN` — владелец читал название
 * роли из кода. Теперь берутся из общего словаря, где их правят один раз на
 * всю платформу.
 */

/** Кого заводят из админки. Водителя и получателя заводит компания у себя. */
const CREATABLE_ROLES = ['COMPANY_ADMIN', 'LOGISTICIAN', 'FORWARDER', 'ACCOUNTANT', 'WAREHOUSE_MANAGER', 'DRIVER'];

export default function UsersPage() {
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
            toast.error('Ошибка загрузки пользователей');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (values: any) => {
        try {
            await api.post('/users', values);
            toast.success('Пользователь создан');
            setModalOpen(false);
            form.resetFields();
            fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка создания');
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
                    toast.success('Пользователь деактивирован');
                    fetchUsers();
                } catch {
                    toast.error('Ошибка деактивации');
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
                <span className={nova.chip}>{ROLE_LABELS[role] || role}</span>
            ),
        },
        {
            title: 'Транспорт',
            key: 'vehicle',
            // Модель знают не про каждую машину, а госномер — всегда. Раньше
            // без модели в таблице стояло «null (123 ABC 01)».
            render: (_: any, record: User) => (
                record.vehicleModel && record.vehiclePlate
                    ? `${record.vehicleModel} (${record.vehiclePlate})`
                    : record.vehiclePlate || '—'
            ),
        },
        {
            title: 'Статус',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive: boolean) => (
                // Цветом — только отключённый: «активен» это обычное
                // состояние, и подсвечивать его нечем.
                <span className={`${nova.chip}${isActive ? '' : ` ${nova.chipNeg}`}`}>
                    {isActive ? 'Активен' : 'Отключён'}
                </span>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 60,
            render: (_: any, record: User) => (
                <Space>
                    {record.isActive && (
                        <Button
                            type="text"
                            danger
                            icon={<StopOutlined />}
                            title="Отключить вход"
                            onClick={() => handleDeactivate(record.id)}
                        />
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Платформа</div>
                    <h1 className={nova.title}>Пользователи</h1>
                    <p className={nova.subtitle}>
                        Все люди на платформе — из всех компаний. Отсюда заводят учётную запись и
                        закрывают вход тем, кто больше не работает.
                    </p>
                </div>
                <div className={nova.heroActions}>
                    <button
                        type="button"
                        className={`${nova.action} ${nova.actionPrimary}`}
                        onClick={() => setModalOpen(true)}
                    >
                        <PlusOutlined /> Добавить
                    </button>
                </div>
            </div>

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <Users size={14} />
                    <h2 className={nova.cardTitle}>Учётные записи</h2>
                    {users.length > 0 && <span className={nova.cardCount}>{users.length}</span>}
                </div>
                <Table
                    columns={columns}
                    dataSource={users}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    pagination={{ pageSize: 15 }}
                />
            </section>

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
                            {CREATABLE_ROLES.map((role) => (
                                <Option key={role} value={role}>{ROLE_LABELS[role] || role}</Option>
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
