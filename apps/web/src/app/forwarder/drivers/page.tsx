'use client';

import { useEffect, useState } from 'react';
import {
    Table, Card, Button, Space, Modal, Form,
    Input, Typography, App, Row, Col
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

interface Driver {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    trailerNumber?: string;
    createdAt: string;
}

export default function ForwarderDriversPage() {
    const { message } = App.useApp();
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [form] = Form.useForm();

    useEffect(() => {
        fetchDrivers();
    }, []);

    const fetchDrivers = async () => {
        try {
            const response = await api.get('/forwarder/drivers');
            setDrivers(response.data);
        } catch (error) {
            message.error('Ошибка загрузки водителей');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (values: any) => {
        try {
            if (editingDriver) {
                await api.put(`/forwarder/drivers/${editingDriver.id}`, values);
                message.success('Водитель обновлён');
            } else {
                await api.post('/forwarder/drivers', values);
                message.success('Водитель добавлен');
            }
            setModalOpen(false);
            setEditingDriver(null);
            form.resetFields();
            fetchDrivers();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения');
        }
    };

    const handleEdit = (driver: Driver) => {
        setEditingDriver(driver);
        form.setFieldsValue(driver);
        setModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        Modal.confirm({
            title: 'Деактивировать водителя?',
            content: 'Водитель будет деактивирован и не сможет войти в систему',
            okText: 'Деактивировать',
            cancelText: 'Отмена',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api.delete(`/forwarder/drivers/${id}`);
                    message.success('Водитель деактивирован');
                    fetchDrivers();
                } catch {
                    message.error('Ошибка деактивации');
                }
            },
        });
    };

    const columns = [
        {
            title: 'ФИО',
            key: 'name',
            render: (_: any, record: Driver) => (
                <Space>
                    <UserOutlined style={{ color: '#52c41a' }} />
                    <strong>
                        {record.lastName} {record.firstName} {record.middleName}
                    </strong>
                </Space>
            ),
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
        },
        {
            title: 'Автомобиль',
            key: 'vehicle',
            render: (_: any, record: Driver) => (
                record.vehicleModel ? (
                    <div>
                        <div><strong>{record.vehicleModel}</strong></div>
                        <div style={{ fontSize: 12, color: '#888' }}>{record.vehiclePlate || '—'}</div>
                    </div>
                ) : '—'
            ),
        },
        {
            title: 'Прицеп',
            dataIndex: 'trailerNumber',
            key: 'trailerNumber',
            render: (text: string) => text || '—',
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Driver) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                    />
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>Водители</Title>
                    <Text type="secondary">Управление водителями компании</Text>
                </div>
                <Button
                    type="primary"
                    size="large"
                    icon={<PlusOutlined />}
                    onClick={() => {
                        setEditingDriver(null);
                        form.resetFields();
                        setModalOpen(true);
                    }}
                >
                    Добавить водителя
                </Button>
            </div>

            <Card bordered={false} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Table
                    columns={columns}
                    dataSource={drivers}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            <Modal
                title={editingDriver ? 'Редактирование водителя' : 'Добавление водителя'}
                open={modalOpen}
                onCancel={() => {
                    setModalOpen(false);
                    setEditingDriver(null);
                    form.resetFields();
                }}
                onOk={() => form.submit()}
                width={600}
                centered
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="lastName"
                                label="Фамилия"
                                rules={[{ required: true, message: 'Обязательное поле' }]}
                            >
                                <Input placeholder="Иванов" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="firstName"
                                label="Имя"
                                rules={[{ required: true, message: 'Обязательное поле' }]}
                            >
                                <Input placeholder="Иван" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item
                        name="middleName"
                        label="Отчество"
                    >
                        <Input placeholder="Иванович" />
                    </Form.Item>
                    <Form.Item
                        name="phone"
                        label="Телефон"
                        rules={[
                            { required: true, message: 'Обязательное поле' },
                            { pattern: /^\+7\d{10}$/, message: 'Формат: +7XXXXXXXXXX' }
                        ]}
                    >
                        <Input placeholder="+77001234567" disabled={!!editingDriver} />
                    </Form.Item>
                    <Form.Item
                        name="vehicleModel"
                        label="Модель автомобиля"
                    >
                        <Input placeholder="КАМАЗ 65115" />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="vehiclePlate"
                                label="Гос. номер авто"
                            >
                                <Input placeholder="A123BC01" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="trailerNumber"
                                label="Номер прицепа"
                            >
                                <Input placeholder="AB1234" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
