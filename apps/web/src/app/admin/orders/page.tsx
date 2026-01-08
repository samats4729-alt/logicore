'use client';

import { useEffect, useState } from 'react';
import {
    Table, Card, Button, Tag, Space, Modal, Form,
    Input, Select, Typography, App, InputNumber, Drawer, Descriptions, Divider
} from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined, UserAddOutlined } from '@ant-design/icons';
import { api, Order, Location, User } from '@/lib/api';

const { Title, Text } = Typography;
const { Option } = Select;

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает',
    ASSIGNED: 'Назначен',
    EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке',
    LOADING: 'Загружается',
    IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке',
    UNLOADING: 'Разгружается',
    COMPLETED: 'Завершён',
    CANCELLED: 'Отменён',
    PROBLEM: 'Проблема',
};

const statusColors: Record<string, string> = {
    DRAFT: 'default',
    PENDING: 'orange',
    ASSIGNED: 'blue',
    EN_ROUTE_PICKUP: 'processing',
    AT_PICKUP: 'processing',
    LOADING: 'processing',
    IN_TRANSIT: 'cyan',
    AT_DELIVERY: 'processing',
    UNLOADING: 'processing',
    COMPLETED: 'green',
    CANCELLED: 'default',
    PROBLEM: 'red',
};

export default function OrdersPage() {
    const { message } = App.useApp();
    const [orders, setOrders] = useState<Order[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [drivers, setDrivers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [ordersRes, locationsRes, driversRes] = await Promise.all([
                api.get('/orders'),
                api.get('/locations'),
                api.get('/users/drivers'),
            ]);
            setOrders(ordersRes.data);
            setLocations(locationsRes.data);
            setDrivers(driversRes.data || []);
        } catch (error) {
            message.error('Ошибка загрузки данных');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (values: any) => {
        try {
            await api.post('/orders', values);
            message.success('Заявка создана');
            setModalOpen(false);
            form.resetFields();
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания');
        }
    };

    const handleEdit = async (values: any) => {
        if (!selectedOrder) return;
        try {
            await api.put(`/orders/${selectedOrder.id}`, values);
            message.success('Заявка обновлена');
            setEditModalOpen(false);
            editForm.resetFields();
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка обновления');
        }
    };

    const handleAssignDriver = async (orderId: string, driverId: string) => {
        try {
            await api.put(`/orders/${orderId}/assign`, { driverId });
            message.success('Водитель назначен');
            fetchData();
            setDrawerOpen(false);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка назначения');
        }
    };

    const openViewDrawer = (order: Order) => {
        setSelectedOrder(order);
        setDrawerOpen(true);
    };

    const openEditModal = (order: Order) => {
        setSelectedOrder(order);
        editForm.setFieldsValue({
            cargoDescription: order.cargoDescription,
            cargoWeight: order.cargoWeight,
            cargoVolume: order.cargoVolume,
            requirements: order.requirements,
            pickupLocationId: order.pickupLocation?.id,
            driverId: order.driver?.id,
            // New fields
            customerPrice: order.customerPrice,
            customerPaymentCondition: order.customerPaymentCondition,
            customerPaymentForm: order.customerPaymentForm,
            customerPaymentDate: order.customerPaymentDate ? new Date(order.customerPaymentDate).toISOString().split('T')[0] : undefined,
            driverCost: order.driverCost,
            driverPaymentCondition: order.driverPaymentCondition,
            driverPaymentDate: order.driverPaymentDate ? new Date(order.driverPaymentDate).toISOString().split('T')[0] : undefined,
            ttnNumber: order.ttnNumber,
            trailerNumber: order.trailerNumber,
            atiCodeCustomer: order.atiCodeCustomer,
            atiCodeCarrier: order.atiCodeCarrier,
        });
        setEditModalOpen(true);
    };

    const columns = [
        {
            title: '№ Заявки',
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            render: (text: string) => <strong>{text}</strong>,
        },
        {
            title: 'Груз',
            dataIndex: 'cargoDescription',
            key: 'cargoDescription',
            ellipsis: true,
            width: 200,
        },
        {
            title: 'Вес, кг',
            dataIndex: 'cargoWeight',
            key: 'cargoWeight',
            render: (w: number) => w ? w.toLocaleString() : '—',
        },
        {
            title: 'Откуда',
            dataIndex: ['pickupLocation', 'name'],
            key: 'pickupLocation',
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag color={statusColors[status] || 'default'}>
                    {statusLabels[status] || status}
                </Tag>
            ),
        },
        {
            title: 'Водитель',
            dataIndex: 'driver',
            key: 'driver',
            render: (driver: any) =>
                driver ? (
                    <span>
                        {driver.firstName} {driver.lastName}
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{driver.vehiclePlate}</Text>
                    </span>
                ) : (
                    <Tag color="warning">Не назначен</Tag>
                ),
        },
        {
            title: 'Цена (Заказчик)',
            dataIndex: 'customerPrice',
            key: 'customerPrice',
            render: (p: number) => p ? p.toLocaleString() : '—',
        },
        {
            title: 'Оплата (Заказчик)',
            key: 'customerPayment',
            render: (_: any, r: Order) => (
                <Space direction="vertical" size={0}>
                    <Text style={{ fontSize: 12 }}>{r.customerPaymentForm || '-'}</Text>
                    {r.customerPaymentDate && <Text type="secondary" style={{ fontSize: 10 }}>{new Date(r.customerPaymentDate).toLocaleDateString()}</Text>}
                </Space>
            )
        },
        {
            title: 'Создана',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => new Date(date).toLocaleDateString('ru-RU'),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Order) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => openViewDrawer(record)}
                    />
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(record)}
                    />
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Title level={3} style={{ margin: 0 }}>Заявки на перевозку</Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    Новая заявка
                </Button>
            </div>

            <Card>
                <Table
                    columns={columns}
                    dataSource={orders}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                />
            </Card>

            {/* Модал создания */}
            <Modal
                title="Новая заявка"
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item
                        name="pickupLocationId"
                        label="Точка погрузки"
                        rules={[{ required: true, message: 'Выберите точку' }]}
                    >
                        <Select placeholder="Выберите точку погрузки" showSearch optionFilterProp="children">
                            {locations.map((loc) => (
                                <Option key={loc.id} value={loc.id}>
                                    {loc.name} — {loc.address}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="cargoDescription"
                        label="Описание груза"
                        rules={[{ required: true, message: 'Введите описание' }]}
                    >
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Space style={{ width: '100%' }} wrap>
                        <Form.Item name="cargoWeight" label="Вес, кг">
                            <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name="cargoVolume" label="Объём, м³">
                            <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name="price" label="Цена, ₸">
                            <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                    </Space>
                    <Form.Item name="driverId" label="Водитель">
                        <Select placeholder="Выберите водителя (опционально)" allowClear showSearch optionFilterProp="children">
                            {drivers.map((d) => (
                                <Option key={d.id} value={d.id}>
                                    {d.lastName} {d.firstName} • {d.vehiclePlate || 'Без авто'}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="requirements" label="Особые требования">
                        <Input.TextArea rows={2} placeholder="Тент, аккуратная погрузка и т.д." />
                    </Form.Item>

                    <Divider orientation="left">Финансы (Заказчик)</Divider>
                    <Space wrap style={{ width: '100%' }}>
                        <Form.Item name="customerPrice" label="Ставка заказчика (KZT)">
                            <InputNumber style={{ width: 140 }} />
                        </Form.Item>
                        <Form.Item name="customerPaymentCondition" label="Условие оплаты">
                            <Select style={{ width: 160 }} placeholder="Условие">
                                <Option value="По факту">По факту</Option>
                                <Option value="Отсрочка">Отсрочка</Option>
                                <Option value="Предоплата">Предоплата</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="customerPaymentForm" label="Форма оплаты">
                            <Select style={{ width: 160 }} placeholder="Форма">
                                <Option value="С НДС">С НДС</Option>
                                <Option value="Без НДС">Без НДС</Option>
                                <Option value="Наличные">Наличные</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="customerPaymentDate" label="Дата оплаты">
                            <Input type="date" style={{ width: 140 }} />
                        </Form.Item>
                    </Space>

                    <Divider orientation="left">Финансы (Перевозчик)</Divider>
                    <Space wrap style={{ width: '100%' }}>
                        <Form.Item name="driverCost" label="Ставка перевозчику">
                            <InputNumber style={{ width: 140 }} />
                        </Form.Item>
                        <Form.Item name="driverPaymentCondition" label="Условие оплаты">
                            <Select style={{ width: 160 }} placeholder="Условие">
                                <Option value="По факту">По факту</Option>
                                <Option value="Отсрочка">Отсрочка</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="driverPaymentDate" label="Дата оплаты">
                            <Input type="date" style={{ width: 140 }} />
                        </Form.Item>
                    </Space>

                    <Divider orientation="left">Документы и Транспорт</Divider>
                    <Space wrap>
                        <Form.Item name="ttnNumber" label="Номер ТТН">
                            <Input placeholder="123456" />
                        </Form.Item>
                        <Form.Item name="trailerNumber" label="Номер прицепа">
                            <Input placeholder="00AA00" />
                        </Form.Item>
                        <Form.Item name="atiCodeCustomer" label="АТИ Заказчик">
                            <Input style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item name="atiCodeCarrier" label="АТИ Перевозчик">
                            <Input style={{ width: 100 }} />
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>

            {/* Модал редактирования */}
            <Modal
                title={`Редактировать заявку ${selectedOrder?.orderNumber || ''}`}
                open={editModalOpen}
                onCancel={() => setEditModalOpen(false)}
                onOk={() => editForm.submit()}
                width={600}
            >
                <Form form={editForm} layout="vertical" onFinish={handleEdit}>
                    <Form.Item
                        name="pickupLocationId"
                        label="Точка погрузки"
                    >
                        <Select placeholder="Выберите точку погрузки" showSearch optionFilterProp="children">
                            {locations.map((loc) => (
                                <Option key={loc.id} value={loc.id}>
                                    {loc.name} — {loc.address}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="cargoDescription" label="Описание груза">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Space style={{ width: '100%' }} wrap>
                        <Form.Item name="cargoWeight" label="Вес, кг">
                            <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name="cargoVolume" label="Объём, м³">
                            <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name="price" label="Цена, ₸">
                            <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                    </Space>
                    <Form.Item name="driverId" label="Водитель">
                        <Select placeholder="Выберите водителя" allowClear showSearch optionFilterProp="children">
                            {drivers.map((d) => (
                                <Option key={d.id} value={d.id}>
                                    {d.lastName} {d.firstName} • {d.vehiclePlate || 'Без авто'}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="requirements" label="Особые требования">
                        <Input.TextArea rows={2} placeholder="Тент, аккуратная погрузка и т.д." />
                    </Form.Item>

                    <Divider orientation="left">Финансы (Заказчик)</Divider>
                    <Space wrap style={{ width: '100%' }}>
                        <Form.Item name="customerPrice" label="Ставка заказчика (KZT)">
                            <InputNumber style={{ width: 140 }} />
                        </Form.Item>
                        <Form.Item name="customerPaymentCondition" label="Условие оплаты">
                            <Select style={{ width: 160 }} placeholder="Условие">
                                <Option value="По факту">По факту</Option>
                                <Option value="Отсрочка">Отсрочка</Option>
                                <Option value="Предоплата">Предоплата</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="customerPaymentForm" label="Форма оплаты">
                            <Select style={{ width: 160 }} placeholder="Форма">
                                <Option value="С НДС">С НДС</Option>
                                <Option value="Без НДС">Без НДС</Option>
                                <Option value="Наличные">Наличные</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="customerPaymentDate" label="Дата оплаты">
                            <Input type="date" style={{ width: 140 }} />
                        </Form.Item>
                    </Space>

                    <Divider orientation="left">Финансы (Перевозчик)</Divider>
                    <Space wrap style={{ width: '100%' }}>
                        <Form.Item name="driverCost" label="Ставка перевозчику">
                            <InputNumber style={{ width: 140 }} />
                        </Form.Item>
                        <Form.Item name="driverPaymentCondition" label="Условие оплаты">
                            <Select style={{ width: 160 }} placeholder="Условие">
                                <Option value="По факту">По факту</Option>
                                <Option value="Отсрочка">Отсрочка</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="driverPaymentDate" label="Дата оплаты">
                            <Input type="date" style={{ width: 140 }} />
                        </Form.Item>
                    </Space>

                    <Divider orientation="left">Документы и Транспорт</Divider>
                    <Space wrap>
                        <Form.Item name="ttnNumber" label="Номер ТТН">
                            <Input placeholder="123456" />
                        </Form.Item>
                        <Form.Item name="trailerNumber" label="Номер прицепа">
                            <Input placeholder="00AA00" />
                        </Form.Item>
                        <Form.Item name="atiCodeCustomer" label="АТИ Заказчик">
                            <Input style={{ width: 100 }} />
                        </Form.Item>
                        <Form.Item name="atiCodeCarrier" label="АТИ Перевозчик">
                            <Input style={{ width: 100 }} />
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>

            {/* Drawer просмотра заявки */}
            <Drawer
                title={`Заявка ${selectedOrder?.orderNumber || ''}`}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={500}
            >
                {selectedOrder && (
                    <>
                        <Descriptions column={1} bordered size="small">
                            <Descriptions.Item label="Статус">
                                <Tag color={statusColors[selectedOrder.status]}>
                                    {statusLabels[selectedOrder.status]}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Груз">
                                {selectedOrder.cargoDescription}
                            </Descriptions.Item>
                            <Descriptions.Item label="Вес">
                                {selectedOrder.cargoWeight ? `${selectedOrder.cargoWeight} кг` : '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Откуда">
                                {selectedOrder.pickupLocation?.name}
                                <br />
                                <Text type="secondary">{selectedOrder.pickupLocation?.address}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Цена">
                                {selectedOrder.customerPrice ? `${selectedOrder.customerPrice.toLocaleString()} ₸` : '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Оплата">
                                {selectedOrder.customerPaymentForm} {selectedOrder.customerPaymentCondition}
                            </Descriptions.Item>
                        </Descriptions>

                        <Divider>Финансы Перевозчика</Divider>
                        <Descriptions column={1} bordered size="small">
                            <Descriptions.Item label="Ставка">
                                {selectedOrder.driverCost ? `${selectedOrder.driverCost.toLocaleString()} ₸` : '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Оплата">
                                {selectedOrder.driverPaymentForm} {selectedOrder.driverPaymentCondition}
                            </Descriptions.Item>
                        </Descriptions>

                        <Divider>Документы и Инфо</Divider>
                        <Descriptions column={2} bordered size="small">
                            <Descriptions.Item label="ТТН">
                                {selectedOrder.ttnNumber || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Прицеп">
                                {selectedOrder.trailerNumber || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="АТИ (Зак)">
                                {selectedOrder.atiCodeCustomer || '-'}
                            </Descriptions.Item>
                            <Descriptions.Item label="АТИ (Пер)">
                                {selectedOrder.atiCodeCarrier || '-'}
                            </Descriptions.Item>
                        </Descriptions>

                        <Divider>Водитель</Divider>

                        {selectedOrder.driver ? (
                            <Card size="small">
                                <Text strong>{selectedOrder.driver.lastName} {selectedOrder.driver.firstName}</Text>
                                <br />
                                <Text type="secondary">{selectedOrder.driver.phone}</Text>
                                <br />
                                <Tag>{selectedOrder.driver.vehiclePlate}</Tag>
                            </Card>
                        ) : (
                            <div>
                                <Text type="secondary">Водитель не назначен</Text>
                                <Select
                                    style={{ width: '100%', marginTop: 8 }}
                                    placeholder="Назначить водителя"
                                    onChange={(driverId) => handleAssignDriver(selectedOrder.id, driverId)}
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {drivers.map((d) => (
                                        <Option key={d.id} value={d.id}>
                                            {d.lastName} {d.firstName} • {d.vehiclePlate || 'Без авто'}
                                        </Option>
                                    ))}
                                </Select>
                            </div>
                        )}

                        <Divider />

                        <Space>
                            <Button icon={<EditOutlined />} onClick={() => {
                                setDrawerOpen(false);
                                openEditModal(selectedOrder);
                            }}>
                                Редактировать
                            </Button>
                        </Space>
                    </>
                )}
            </Drawer>
        </div>
    );
}
