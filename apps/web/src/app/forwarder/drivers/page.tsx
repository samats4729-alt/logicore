'use client';

import { useEffect, useState } from 'react';
import {
    Table, Card, Button, Space, Modal, Form,
    Input, Typography, App, Row, Col, Select, DatePicker, Divider, Tag
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, IdcardOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

interface Driver {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    trailerNumber?: string;
    docType?: string;
    docNumber?: string;
    docIssuedAt?: string;
    docExpiresAt?: string;
    docIssuedBy?: string;
    createdAt: string;
}

const docTypeLabels: Record<string, string> = {
    ID_CARD: 'Удостоверение личности',
    PASSPORT: 'Паспорт',
};

export default function ForwarderDriversPage() {
    const { message, modal } = App.useApp();
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
    const [form] = Form.useForm();

    const fetchDrivers = async () => {
        try {
            setLoading(true);
            const res = await api.get('/forwarder/drivers');
            setDrivers(res.data);
        } catch {
            message.error('Ошибка загрузки водителей');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDrivers(); }, []);

    const handleCreate = async (values: any) => {
        try {
            // Convert dayjs dates to ISO strings
            const payload = {
                ...values,
                docIssuedAt: values.docIssuedAt ? values.docIssuedAt.toISOString() : undefined,
                docExpiresAt: values.docExpiresAt ? values.docExpiresAt.toISOString() : undefined,
            };

            if (editingDriver) {
                await api.put(`/forwarder/drivers/${editingDriver.id}`, payload);
                message.success('Данные водителя обновлены');
            } else {
                await api.post('/forwarder/drivers', payload);
                message.success('Водитель добавлен');
            }
            setModalOpen(false);
            setEditingDriver(null);
            form.resetFields();
            fetchDrivers();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка');
        }
    };

    const handleEdit = (driver: Driver) => {
        setEditingDriver(driver);
        form.setFieldsValue({
            ...driver,
            docIssuedAt: driver.docIssuedAt ? dayjs(driver.docIssuedAt) : undefined,
            docExpiresAt: driver.docExpiresAt ? dayjs(driver.docExpiresAt) : undefined,
        });
        setModalOpen(true);
    };

    const handleDelete = (id: string) => {
        modal.confirm({
            title: 'Удалить водителя?',
            content: 'Водитель будет деактивирован',
            okText: 'Да',
            cancelText: 'Нет',
            okType: 'danger',
            onOk: async () => {
                try {
                    await api.delete(`/forwarder/drivers/${id}`);
                    message.success('Водитель удалён');
                    fetchDrivers();
                } catch {
                    message.error('Ошибка удаления');
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
                    <UserOutlined />
                    <div>
                        <div style={{ fontWeight: 600 }}>{record.lastName} {record.firstName} {record.middleName || ''}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{record.phone}</div>
                    </div>
                </Space>
            ),
        },
        {
            title: 'Транспорт',
            key: 'vehicle',
            render: (_: any, record: Driver) => (
                <div>
                    <div>{record.vehicleModel || '—'}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{record.vehiclePlate || '—'}</div>
                </div>
            ),
        },
        {
            title: 'Документ',
            key: 'document',
            render: (_: any, record: Driver) => {
                if (!record.docType && !record.docNumber) return <Text type="secondary">—</Text>;
                const isExpired = record.docExpiresAt && dayjs(record.docExpiresAt).isBefore(dayjs());
                return (
                    <div>
                        <div>
                            <Tag color={isExpired ? 'red' : 'blue'}>
                                {record.docType ? docTypeLabels[record.docType] || record.docType : ''}
                            </Tag>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>№ {record.docNumber || '—'}</div>
                        {record.docExpiresAt && (
                            <div style={{ fontSize: 11, color: isExpired ? '#ff4d4f' : '#888' }}>
                                до {dayjs(record.docExpiresAt).format('DD.MM.YYYY')}
                                {isExpired && ' (истёк)'}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Дата регистрации',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (text: string) => new Date(text).toLocaleDateString('ru-RU'),
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
                width={650}
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
                            { pattern: /^(\+7|8)\d{10}$/, message: 'Формат: +7XXXXXXXXXX или 8XXXXXXXXXX' }
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

                    <Divider><IdcardOutlined /> Документ, удостоверяющий личность</Divider>

                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="docType"
                                label="Вид документа"
                            >
                                <Select placeholder="Выберите тип" allowClear>
                                    <Option value="ID_CARD">Удостоверение личности</Option>
                                    <Option value="PASSPORT">Паспорт</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="docNumber"
                                label="Номер документа"
                            >
                                <Input placeholder="012345678" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="docIssuedAt"
                                label="Дата выдачи"
                            >
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="01.01.2020" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="docExpiresAt"
                                label="Действителен до"
                            >
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="01.01.2030" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item
                        name="docIssuedBy"
                        label="Кем выдан"
                    >
                        <Input placeholder="МВД РК / РОВД г. Алматы" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
