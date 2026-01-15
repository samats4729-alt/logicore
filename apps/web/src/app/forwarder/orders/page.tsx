'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, Input, message, Typography, Drawer, Descriptions, Select } from 'antd';
import { EyeOutlined, UserAddOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';

const { Title, Text } = Typography;

const statusColors: Record<string, string> = {
    DRAFT: 'default',
    PENDING: 'orange',
    ASSIGNED: 'blue',
    EN_ROUTE_PICKUP: 'gold',
    AT_PICKUP: 'lime',
    LOADING: 'purple',
    IN_TRANSIT: 'cyan',
    AT_DELIVERY: 'lime',
    UNLOADING: 'purple',
    COMPLETED: 'green',
    PROBLEM: 'red',
};

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает назначения',
    ASSIGNED: 'Назначен водитель',
    EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке',
    LOADING: 'Загружается',
    IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке',
    UNLOADING: 'Разгружается',
    COMPLETED: 'Завершён',
    PROBLEM: 'Проблема',
};

interface Driver {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    trailerNumber?: string;
}

interface Order {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    cargoWeight?: number;
    cargoVolume?: number;
    requirements?: string;
    customerPrice?: number;
    createdAt: string;
    pickupLocation?: { name: string; address: string };
    deliveryPoints?: { location: { name: string; address: string } }[];
    customer?: { firstName: string; lastName: string; phone: string; email?: string };
    customerCompany?: { name: string; phone?: string };
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedDriverPlate?: string;
    assignedAt?: string;
}

export default function ForwarderOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [driversLoading, setDriversLoading] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [assignLoading, setAssignLoading] = useState(false);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [form] = Form.useForm();
    const [statusForm] = Form.useForm();

    const fetchOrders = async () => {
        try {
            const response = await api.get('/forwarder/orders');
            setOrders(response.data);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDrivers = async () => {
        setDriversLoading(true);
        try {
            const response = await api.get('/forwarder/drivers');
            setDrivers(response.data);
        } catch (error) {
            console.error('Failed to fetch drivers:', error);
            message.error('Ошибка загрузки списка водителей');
        } finally {
            setDriversLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const showOrderDetail = (order: Order) => {
        setSelectedOrder(order);
        setDetailDrawerOpen(true);
    };

    const openAssignModal = (order: Order) => {
        setSelectedOrder(order);
        setSelectedDriverId(null);
        form.resetFields();
        setAssignModalOpen(true);
        fetchDrivers(); // Загружаем список водителей при открытии формы
    };

    const handleDriverSelect = (driverId: string) => {
        setSelectedDriverId(driverId);
        const driver = drivers.find(d => d.id === driverId);
        if (driver) {
            // Автоматически заполняем поля формы
            const fullName = `${driver.lastName} ${driver.firstName} ${driver.middleName || ''}`.trim();
            form.setFieldsValue({
                driverName: fullName,
                driverPhone: driver.phone,
                driverPlate: driver.vehiclePlate || '',
                trailerNumber: driver.trailerNumber || '',
            });
        }
    };

    const handleAssignDriver = async (values: any) => {
        if (!selectedOrder) return;
        setAssignLoading(true);
        try {
            await api.put(`/forwarder/orders/${selectedOrder.id}/assign-driver`, values);
            message.success('Водитель назначен');
            setAssignModalOpen(false);
            form.resetFields();
            setSelectedDriverId(null);
            fetchOrders();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка назначения');
        } finally {
            setAssignLoading(false);
        }
    };

    const getNextStatuses = (currentStatus: string): { value: string; label: string }[] => {
        const transitions: Record<string, { value: string; label: string }[]> = {
            ASSIGNED: [
                { value: 'EN_ROUTE_PICKUP', label: 'Едет на погрузку' },
                { value: 'AT_PICKUP', label: 'На погрузке' },
            ],
            EN_ROUTE_PICKUP: [{ value: 'AT_PICKUP', label: 'На погрузке' }],
            AT_PICKUP: [{ value: 'LOADING', label: 'Загружается' }],
            LOADING: [{ value: 'IN_TRANSIT', label: 'В пути' }],
            IN_TRANSIT: [{ value: 'AT_DELIVERY', label: 'На выгрузке' }],
            AT_DELIVERY: [{ value: 'UNLOADING', label: 'Разгружается' }],
            UNLOADING: [{ value: 'COMPLETED', label: 'Завершён' }],
        };
        return transitions[currentStatus] || [];
    };

    const openStatusModal = () => {
        if (!selectedOrder) return;
        statusForm.resetFields();
        setStatusModalOpen(true);
    };

    const handleStatusChange = async (values: { status: string; comment?: string }) => {
        if (!selectedOrder) return;
        setStatusLoading(true);
        try {
            await api.put(`/forwarder/orders/${selectedOrder.id}/status`, values);
            message.success('Статус обновлён');
            setStatusModalOpen(false);
            setDetailDrawerOpen(false);
            fetchOrders();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка обновления статуса');
        } finally {
            setStatusLoading(false);
        }
    };

    const columns = [
        {
            title: '№ Заявки',
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            render: (text: string) => <strong>{text}</strong>,
        },
        {
            title: 'Заказчик',
            dataIndex: 'customerCompany',
            key: 'customerCompany',
            render: (company: any) => company?.name || '—',
        },
        {
            title: 'Груз',
            dataIndex: 'cargoDescription',
            key: 'cargoDescription',
            ellipsis: true,
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
            key: 'driver',
            render: (_: any, record: Order) =>
                record.assignedDriverName ? (
                    <Space direction="vertical" size={0}>
                        <Text>{record.assignedDriverName}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{record.assignedDriverPlate}</Text>
                    </Space>
                ) : (
                    <Tag color="warning">Не назначен</Tag>
                ),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Order) => (
                <Space>
                    <Button icon={<EyeOutlined />} onClick={() => showOrderDetail(record)} />
                    <Button
                        type={record.assignedDriverName ? 'default' : 'primary'}
                        icon={record.assignedDriverName ? <CheckCircleOutlined /> : <UserAddOutlined />}
                        onClick={() => openAssignModal(record)}
                    >
                        {record.assignedDriverName ? 'Изменить' : 'Назначить'}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Title level={3}>Входящие заявки</Title>

            <Card>
                <Table
                    columns={columns}
                    dataSource={orders}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                />
            </Card>

            {/* Модал назначения водителя */}
            <Modal
                title="Назначить водителя"
                open={assignModalOpen}
                onCancel={() => {
                    setAssignModalOpen(false);
                    setSelectedDriverId(null);
                    form.resetFields();
                }}
                onOk={() => form.submit()}
                okText="Назначить"
                cancelText="Отмена"
                confirmLoading={assignLoading}
            >
                <Form form={form} layout="vertical" onFinish={handleAssignDriver}>
                    <Form.Item
                        label="Выберите водителя"
                        required
                    >
                        <Select
                            placeholder="Выберите водителя из списка"
                            size="large"
                            loading={driversLoading}
                            onChange={handleDriverSelect}
                            value={selectedDriverId}
                            notFoundContent={drivers.length === 0 ? "Нет добавленных водителей" : "Водитель не найден"}
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={drivers.map(driver => ({
                                value: driver.id,
                                label: `${driver.lastName} ${driver.firstName} ${driver.middleName || ''}`.trim(),
                            }))}
                        />
                    </Form.Item>

                    {selectedDriverId && (
                        <>
                            <Form.Item
                                name="driverName"
                                label="ФИО водителя"
                                rules={[{ required: true }]}
                                hidden
                            >
                                <Input />
                            </Form.Item>
                            <Form.Item
                                name="driverPhone"
                                label="Телефон"
                            >
                                <Input size="large" disabled style={{ backgroundColor: '#f5f5f5' }} />
                            </Form.Item>
                            <Form.Item
                                name="driverPlate"
                                label="Госномер"
                            >
                                <Input size="large" disabled style={{ backgroundColor: '#f5f5f5' }} />
                            </Form.Item>
                            <Form.Item
                                name="trailerNumber"
                                label="Номер прицепа"
                            >
                                <Input size="large" disabled style={{ backgroundColor: '#f5f5f5' }} placeholder="Нет прицепа" />
                            </Form.Item>
                        </>
                    )}
                </Form>
            </Modal>

            {/* Drawer деталей заявки */}
            <Drawer
                title={`Заявка ${selectedOrder?.orderNumber}`}
                open={detailDrawerOpen}
                onClose={() => setDetailDrawerOpen(false)}
                width={500}
            >
                {selectedOrder && (
                    <div>
                        <Card size="small" style={{ marginBottom: 16 }}>
                            <Tag color={statusColors[selectedOrder.status]}>
                                {statusLabels[selectedOrder.status]}
                            </Tag>
                        </Card>

                        <Title level={5}>Заказчик</Title>
                        <Descriptions size="small" column={1}>
                            <Descriptions.Item label="Компания">
                                {selectedOrder.customerCompany?.name || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Контакт">
                                {selectedOrder.customer?.firstName} {selectedOrder.customer?.lastName}
                            </Descriptions.Item>
                            <Descriptions.Item label="Телефон">
                                {selectedOrder.customer?.phone}
                            </Descriptions.Item>
                        </Descriptions>

                        <Title level={5} style={{ marginTop: 16 }}>Груз</Title>
                        <Text>{selectedOrder.cargoDescription}</Text>
                        {selectedOrder.cargoWeight && <div>Вес: {selectedOrder.cargoWeight} кг</div>}
                        {selectedOrder.cargoVolume && <div>Объём: {selectedOrder.cargoVolume} м³</div>}
                        {selectedOrder.requirements && <div>Требования: {selectedOrder.requirements}</div>}

                        <Title level={5} style={{ marginTop: 16 }}>Маршрут</Title>
                        <div><strong>Погрузка:</strong> {selectedOrder.pickupLocation?.name}</div>
                        <div style={{ color: '#666' }}>{selectedOrder.pickupLocation?.address}</div>
                        {selectedOrder.deliveryPoints?.map((dp, i) => (
                            <div key={i} style={{ marginTop: 8 }}>
                                <strong>Выгрузка {i + 1}:</strong> {dp.location.name}
                                <div style={{ color: '#666' }}>{dp.location.address}</div>
                            </div>
                        ))}

                        <Title level={5} style={{ marginTop: 16 }}>Назначенный водитель</Title>
                        {selectedOrder.assignedDriverName ? (
                            <Descriptions size="small" column={1}>
                                <Descriptions.Item label="ФИО">
                                    {selectedOrder.assignedDriverName}
                                </Descriptions.Item>
                                <Descriptions.Item label="Телефон">
                                    {selectedOrder.assignedDriverPhone}
                                </Descriptions.Item>
                                <Descriptions.Item label="Госномер">
                                    {selectedOrder.assignedDriverPlate}
                                </Descriptions.Item>
                            </Descriptions>
                        ) : (
                            <Tag color="warning">Водитель не назначен</Tag>
                        )}

                        <div style={{ marginTop: 24 }}>
                            <Button
                                type="primary"
                                icon={<UserAddOutlined />}
                                onClick={() => {
                                    setDetailDrawerOpen(false);
                                    openAssignModal(selectedOrder);
                                }}
                                block
                            >
                                {selectedOrder.assignedDriverName ? 'Изменить водителя' : 'Назначить водителя'}
                            </Button>

                            {/* Кнопка изменения статуса */}
                            {getNextStatuses(selectedOrder.status).length > 0 && (
                                <Button
                                    type="primary"
                                    style={{ marginTop: 8, width: '100%' }}
                                    onClick={openStatusModal}
                                >
                                    Изменить статус заявки
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Drawer>

            {/* Модал изменения статуса */}
            <Modal
                title="Изменить статус заявки"
                open={statusModalOpen}
                onCancel={() => setStatusModalOpen(false)}
                onOk={() => statusForm.submit()}
                okText="Обновить"
                cancelText="Отмена"
                confirmLoading={statusLoading}
            >
                {selectedOrder && (
                    <Form form={statusForm} layout="vertical" onFinish={handleStatusChange}>
                        <div style={{ marginBottom: 16 }}>
                            Текущий статус: <Tag color={statusColors[selectedOrder.status]}>
                                {statusLabels[selectedOrder.status]}
                            </Tag>
                        </div>
                        <Form.Item
                            name="status"
                            label="Новый статус"
                            rules={[{ required: true, message: 'Выберите статус' }]}
                        >
                            <Select placeholder="Выберите статус" size="large">
                                {getNextStatuses(selectedOrder.status).map(s => (
                                    <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>
                                ))}
                            </Select>
                        </Form.Item>
                        <Form.Item
                            name="comment"
                            label="Комментарий (необязательно)"
                        >
                            <Input.TextArea rows={3} placeholder="Причина изменения статуса..." />
                        </Form.Item>
                    </Form>
                )}
            </Modal>
        </div>
    );
}
