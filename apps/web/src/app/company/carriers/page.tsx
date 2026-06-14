'use client';

import { useState, useEffect } from 'react';
import {
    Table, Card, Input, Button, Tag, Space, Typography, Avatar,
    message, Modal, Form, Select, Popconfirm, DatePicker, Row, Col, Divider, theme
} from 'antd';
import {
    SearchOutlined, ShopOutlined, PlusOutlined, EditOutlined, DeleteOutlined,
    CarOutlined, UserOutlined, UserAddOutlined, IdcardOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function CarriersPage() {
    const { token } = theme.useToken();

    // Data States
    const [carriers, setCarriers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Lazy load drivers per carrier
    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
    const [carrierDrivers, setCarrierDrivers] = useState<Record<string, any[]>>({});
    const [driversLoading, setDriversLoading] = useState<Record<string, boolean>>({});

    // Carrier Modal & Form
    const [carrierModalOpen, setCarrierModalOpen] = useState(false);
    const [editingCarrier, setEditingCarrier] = useState<any | null>(null);
    const [carrierForm] = Form.useForm();
    const [carrierSubmitting, setCarrierSubmitting] = useState(false);

    // Driver Modal & Form
    const [driverModalOpen, setDriverModalOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState<any | null>(null);
    const [activeCarrierId, setActiveCarrierId] = useState<string | null>(null);
    const [driverForm] = Form.useForm();
    const [driverSubmitting, setDriverSubmitting] = useState(false);

    useEffect(() => {
        fetchCarriers();
    }, []);

    const fetchCarriers = async () => {
        setLoading(true);
        try {
            const response = await api.get('/external-companies');
            // Filter external companies that are carriers
            const carrierList = response.data.filter((e: any) => e.isCarrier);
            setCarriers(carrierList);
        } catch (error) {
            console.error('Failed to fetch carriers:', error);
            message.error('Ошибка загрузки списка перевозчиков');
        } finally {
            setLoading(false);
        }
    };

    const fetchDriversForCarrier = async (carrierId: string) => {
        setDriversLoading(prev => ({ ...prev, [carrierId]: true }));
        try {
            const res = await api.get('/company/drivers', { params: { companyId: carrierId } });
            setCarrierDrivers(prev => ({ ...prev, [carrierId]: res.data }));
        } catch (error) {
            console.error('Failed to fetch drivers for carrier:', carrierId, error);
            message.error('Ошибка загрузки водителей');
        } finally {
            setDriversLoading(prev => ({ ...prev, [carrierId]: false }));
        }
    };

    const handleExpand = (expanded: boolean, record: any) => {
        if (expanded) {
            fetchDriversForCarrier(record.id);
            setExpandedRowKeys(prev => [...prev, record.id]);
        } else {
            setExpandedRowKeys(prev => prev.filter(k => k !== record.id));
        }
    };

    // Carrier Save
    const handleCarrierSave = async (values: any) => {
        setCarrierSubmitting(true);
        const body = {
            ...values,
            isCustomer: false,
            isCarrier: true,
            type: 'FORWARDER'
        };

        try {
            if (editingCarrier) {
                await api.patch(`/external-companies/${editingCarrier.id}`, body);
                message.success('Данные перевозчика обновлены');
            } else {
                await api.post('/external-companies', body);
                message.success('Перевозчик добавлен');
            }
            setCarrierModalOpen(false);
            carrierForm.resetFields();
            setEditingCarrier(null);
            fetchCarriers();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения перевозчика');
        } finally {
            setCarrierSubmitting(false);
        }
    };

    // Carrier Delete
    const handleCarrierDelete = async (id: string) => {
        try {
            await api.delete(`/external-companies/${id}`);
            message.success('Перевозчик удален');
            fetchCarriers();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка удаления');
        }
    };

    const openCarrierEdit = (carrier: any) => {
        setEditingCarrier(carrier);
        carrierForm.setFieldsValue(carrier);
        setCarrierModalOpen(true);
    };

    const openCarrierCreate = () => {
        setEditingCarrier(null);
        carrierForm.resetFields();
        setCarrierModalOpen(true);
    };

    // Driver Save
    const handleDriverSave = async (values: any) => {
        if (!activeCarrierId) return;
        setDriverSubmitting(true);

        const body = {
            ...values,
            docIssuedAt: values.docIssuedAt ? values.docIssuedAt.toISOString() : undefined,
            docExpiresAt: values.docExpiresAt ? values.docExpiresAt.toISOString() : undefined,
        };

        try {
            if (editingDriver) {
                await api.put(`/company/drivers/${editingDriver.id}`, body);
                message.success('Данные водителя обновлены');
            } else {
                const res = await api.post('/company/drivers', {
                    ...body,
                    companyId: activeCarrierId
                });
                if (res.data?.alreadyExists) {
                    message.info('Использован существующий водитель');
                } else {
                    message.success('Водитель добавлен');
                }
            }
            setDriverModalOpen(false);
            driverForm.resetFields();
            setEditingDriver(null);
            fetchDriversForCarrier(activeCarrierId);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения водителя');
        } finally {
            setDriverSubmitting(false);
        }
    };

    // Driver Deactivate
    const handleDriverDeactivate = async (driverId: string, carrierId: string) => {
        try {
            await api.delete(`/company/drivers/${driverId}`);
            message.success('Водитель деактивирован');
            fetchDriversForCarrier(carrierId);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка деактивации водителя');
        }
    };

    const openDriverEdit = (driver: any, carrierId: string) => {
        setActiveCarrierId(carrierId);
        setEditingDriver(driver);
        driverForm.setFieldsValue({
            ...driver,
            docIssuedAt: driver.docIssuedAt ? dayjs(driver.docIssuedAt) : null,
            docExpiresAt: driver.docExpiresAt ? dayjs(driver.docExpiresAt) : null,
        });
        setDriverModalOpen(true);
    };

    const openDriverCreate = (carrierId: string) => {
        setActiveCarrierId(carrierId);
        setEditingDriver(null);
        driverForm.resetFields();
        setDriverModalOpen(true);
    };

    const filteredCarriers = carriers.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.bin && c.bin.includes(searchQuery))
    );

    // Columns for the Carriers Table
    const carrierColumns = [
        {
            title: 'Название перевозчика',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => (
                <Space>
                    <Avatar icon={<ShopOutlined />} style={{ backgroundColor: token.colorPrimary }} />
                    <Text strong>{text}</Text>
                </Space>
            )
        },
        {
            title: 'БИН/ИИН',
            dataIndex: 'bin',
            key: 'bin',
            render: (text: string) => text || '—'
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
            render: (text: string) => text || '—'
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            render: (text: string) => text || '—'
        },
        {
            title: 'Адрес',
            dataIndex: 'address',
            key: 'address',
            ellipsis: true,
            render: (text: string) => text || '—'
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 320,
            render: (_: any, record: any) => (
                <Space size="middle">
                    <Button
                        type="primary"
                        ghost
                        size="small"
                        icon={<UserAddOutlined />}
                        onClick={() => openDriverCreate(record.id)}
                    >
                        Добавить водителя
                    </Button>
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openCarrierEdit(record)}
                        style={{ padding: 0 }}
                    >
                        Изменить
                    </Button>
                    <Popconfirm
                        title="Удалить перевозчика и все связанные данные?"
                        onConfirm={() => handleCarrierDelete(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button
                            type="link"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            style={{ padding: 0 }}
                        >
                            Удалить
                        </Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    // Sub-table render function for carrier drivers
    const expandedRowRender = (carrier: any) => {
        const driversList = carrierDrivers[carrier.id] || [];
        const isDriversLoading = driversLoading[carrier.id] || false;

        const driverColumns = [
            {
                title: 'ФИО водителя',
                key: 'fullName',
                render: (_: any, record: any) => (
                    <Space>
                        <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#8c8c8c' }} />
                        <Text strong>{`${record.lastName} ${record.firstName} ${record.middleName || ''}`.trim()}</Text>
                    </Space>
                )
            },
            {
                title: 'Телефон',
                dataIndex: 'phone',
                key: 'phone',
                render: (text: string) => text || '—'
            },
            {
                title: 'ИИН',
                dataIndex: 'iin',
                key: 'iin',
                render: (text: string) => text || '—'
            },
            {
                title: 'Транспорт',
                key: 'vehicle',
                render: (_: any, record: any) => {
                    if (!record.vehiclePlate && !record.vehicleModel) return '—';
                    return (
                        <Space direction="vertical" size={0}>
                            <Text>{record.vehicleModel || 'Без модели'}</Text>
                            <Tag color="blue">{record.vehiclePlate}</Tag>
                            {record.trailerNumber && <Tag color="cyan">Прицеп: {record.trailerNumber}</Tag>}
                        </Space>
                    );
                }
            },
            {
                title: 'Тип кузова',
                dataIndex: 'vehicleType',
                key: 'vehicleType',
                render: (text: string) => text ? <Tag>{text}</Tag> : '—'
            },
            {
                title: 'Действия',
                key: 'actions',
                width: 180,
                render: (_: any, record: any) => (
                    <Space>
                        <Button
                            type="link"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openDriverEdit(record, carrier.id)}
                            style={{ padding: 0 }}
                        >
                            Изменить
                        </Button>
                        <Popconfirm
                            title="Деактивировать водителя?"
                            onConfirm={() => handleDriverDeactivate(record.id, carrier.id)}
                            okText="Да"
                            cancelText="Нет"
                        >
                            <Button
                                type="link"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                style={{ padding: 0 }}
                            >
                                Деактивировать
                            </Button>
                        </Popconfirm>
                    </Space>
                )
            }
        ];

        return (
            <div style={{ padding: '8px 16px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 13 }}>Водители перевозчика [{carrier.name}]</Text>
                    <Button
                        type="dashed"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => openDriverCreate(carrier.id)}
                    >
                        Добавить водителя
                    </Button>
                </div>
                <Table
                    columns={driverColumns}
                    dataSource={driversList}
                    rowKey="id"
                    pagination={false}
                    loading={isDriversLoading}
                    size="small"
                    locale={{ emptyText: 'У этого перевозчика пока нет водителей' }}
                />
            </div>
        );
    };

    return (
        <div style={{ padding: '0px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}>Внешние перевозчики</Title>
                    <Text type="secondary">Реестр внешних транспортных компаний и их водителей для назначения на рейсы</Text>
                </div>
                <Button
                    type="primary"
                    size="large"
                    icon={<PlusOutlined />}
                    onClick={openCarrierCreate}
                >
                    Добавить перевозчика
                </Button>
            </div>

            <Card size="small" style={{ marginBottom: 20 }}>
                <Input
                    placeholder="Поиск по названию или БИН/ИИН перевозчика..."
                    prefix={<SearchOutlined />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="large"
                    allowClear
                />
            </Card>

            <Card style={{ borderRadius: 12 }}>
                <Table
                    columns={carrierColumns}
                    dataSource={filteredCarriers}
                    rowKey="id"
                    loading={loading}
                    expandable={{
                        expandedRowRender,
                        onExpand: handleExpand,
                        expandedRowKeys
                    }}
                    locale={{ emptyText: 'Перевозчики не найдены' }}
                />
            </Card>

            {/* Carrier Add/Edit Modal */}
            <Modal
                title={editingCarrier ? 'Редактировать перевозчика' : 'Новый перевозчик'}
                open={carrierModalOpen}
                onCancel={() => { setCarrierModalOpen(false); setEditingCarrier(null); carrierForm.resetFields(); }}
                onOk={() => carrierForm.submit()}
                confirmLoading={carrierSubmitting}
                okText="Сохранить"
                cancelText="Отмена"
                width={500}
            >
                <Form
                    form={carrierForm}
                    layout="vertical"
                    onFinish={handleCarrierSave}
                    onValuesChange={async (changedValues) => {
                        if (changedValues.bin && /^\d{12}$/.test(changedValues.bin)) {
                            try {
                                const res = await api.get(`/auth/company-lookup/${changedValues.bin}`);
                                if (res.data) {
                                    const updateObj: any = {};
                                    if (res.data.name) updateObj.name = res.data.name;
                                    if (res.data.phone) updateObj.phone = res.data.phone;
                                    if (res.data.email) updateObj.email = res.data.email;
                                    if (res.data.address) updateObj.address = res.data.address;
                                    if (res.data.directorName) updateObj.directorName = res.data.directorName;
                                    carrierForm.setFieldsValue(updateObj);
                                    message.success('Реквизиты компании подтянуты');
                                }
                            } catch {}
                        }
                    }}
                >
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="ИП / ТОО Перевозчик" />
                    </Form.Item>
                    <Form.Item
                        name="bin" label="БИН/ИИН"
                        rules={[
                            { required: true, message: 'Введите БИН/ИИН' },
                            { pattern: /^\d{12}$/, message: 'Должен состоять ровно из 12 цифр' }
                        ]}
                    >
                        <Input placeholder="123456789012" maxLength={12} />
                    </Form.Item>
                    <Form.Item name="phone" label="Телефон">
                        <Input placeholder="+77001234567" />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input placeholder="carrier@example.com" />
                    </Form.Item>
                    <Form.Item name="address" label="Юридический адрес">
                        <Input placeholder="г. Алматы, ул. Толе би 50" />
                    </Form.Item>
                    <Form.Item name="directorName" label="ФИО руководителя">
                        <Input placeholder="Иванов Иван Иванович" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Driver Add/Edit Modal */}
            <Modal
                title={editingDriver ? 'Редактировать водителя' : 'Новый водитель'}
                open={driverModalOpen}
                onCancel={() => { setDriverModalOpen(false); setEditingDriver(null); driverForm.resetFields(); }}
                onOk={() => driverForm.submit()}
                confirmLoading={driverSubmitting}
                okText="Сохранить"
                cancelText="Отмена"
                width={700}
                style={{ top: 40 }}
            >
                <Form
                    form={driverForm}
                    layout="vertical"
                    onFinish={handleDriverSave}
                >
                    <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary, marginTop: 0 }}>Данные водителя</Divider>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="lastName" label="Фамилия" rules={[{ required: true, message: 'Введите фамилию' }]}>
                                <Input placeholder="Иванов" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="firstName" label="Имя" rules={[{ required: true, message: 'Введите имя' }]}>
                                <Input placeholder="Иван" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="middleName" label="Отчество">
                                <Input placeholder="Иванович" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="phone" label="Телефон" rules={[{ required: true, message: 'Введите телефон' }]}>
                                <Input placeholder="+77001234567" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="iin" label="ИИН">
                                <Input placeholder="123456789012" maxLength={12} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Транспортное средство</Divider>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="vehicleType" label="Тип транспорта">
                                <Select
                                    placeholder="Выберите тип кузова"
                                    options={VEHICLE_TYPES.map(t => ({ label: t, value: t }))}
                                    showSearch
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="vehicleModel" label="Модель автомобиля">
                                <Input placeholder="Volvo FH12" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="vehiclePlate" label="Госномер автомобиля" rules={[{ required: true, message: 'Введите госномер' }]}>
                                <Input placeholder="123 ABC 01" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="trailerNumber" label="Госномер прицепа">
                                <Input placeholder="1234 XX 01" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Документы</Divider>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="docType" label="Тип документа">
                                <Select placeholder="Выберите документ">
                                    <Select.Option value="ID_CARD">Удостоверение личности</Select.Option>
                                    <Select.Option value="PASSPORT">Паспорт</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="docNumber" label="Номер документа">
                                <Input placeholder="012345678" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="docIssuedAt" label="Дата выдачи">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="ДД.ММ.ГГГГ" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="docExpiresAt" label="Срок действия">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="ДД.ММ.ГГГГ" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="docIssuedBy" label="Кем выдан">
                                <Input placeholder="МВД РК" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
}
