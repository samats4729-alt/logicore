'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, Input, InputNumber, Select, DatePicker, message, Typography, Drawer } from 'antd';
import { PlusOutlined, EyeOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const { Title, Text } = Typography;
const { TextArea } = Input;

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
    PENDING: 'Ожидает подтверждения',
    ASSIGNED: 'Машина назначена',
    EN_ROUTE_PICKUP: 'Едет на погрузку',
    AT_PICKUP: 'На погрузке',
    LOADING: 'Загружается',
    IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке',
    UNLOADING: 'Разгружается',
    COMPLETED: 'Завершён',
    PROBLEM: 'Проблема',
};

interface Order {
    id: string;
    orderNumber: string;
    status: string;
    cargoDescription: string;
    cargoWeight?: number;
    cargoVolume?: number;
    requirements?: string;
    customerPrice?: number;
    isConfirmed: boolean;
    createdAt: string;
    pickupLocation?: { name: string; address: string };
    deliveryPoints?: { location: { name: string; address: string } }[];
    driver?: { firstName: string; lastName: string; phone: string; vehiclePlate?: string };
    forwarder?: { name: string };
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedDriverPlate?: string;
    assignedDriverTrailer?: string;
}

export default function CompanyOrdersPage() {
    const { user } = useAuthStore();
    const [orders, setOrders] = useState<Order[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [forwarders, setForwarders] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [form] = Form.useForm();
    const [statusForm] = Form.useForm();

    const fetchOrders = async () => {
        try {
            const response = await api.get('/company/orders');
            setOrders(response.data);
        } catch (error) {
            console.error('Failed to fetch orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch (error) {
            console.error('Failed to fetch locations:', error);
        }
    };

    const fetchForwarders = async () => {
        try {
            const response = await api.get('/company/forwarders');
            setForwarders(response.data);
        } catch (error) {
            console.error('Failed to fetch forwarders:', error);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchLocations();
        fetchForwarders();
    }, []);

    const handleCreateOrder = async (values: any) => {
        try {
            await api.post('/orders', {
                ...values,
                customerId: user?.id,
            });
            message.success('Заявка создана');
            setCreateModalOpen(false);
            form.resetFields();
            fetchOrders();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания заявки');
        }
    };

    const handleCancelOrder = (order: Order) => {
        Modal.confirm({
            title: 'Отменить заявку?',
            content: `Вы уверены что хотите отменить заявку ${order.orderNumber}?`,
            okText: 'Да, отменить',
            cancelText: 'Нет',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api.put(`/orders/${order.id}/status`, {
                        status: 'CANCELLED',
                        comment: 'Отменено заказчиком',
                    });
                    message.success('Заявка отменена');
                    fetchOrders();
                } catch (error: any) {
                    message.error(error.response?.data?.message || 'Ошибка отмены заявки');
                }
            },
        });
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
            await api.put(`/orders/${selectedOrder.id}/status`, values);
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

    const showOrderDetail = (order: Order) => {
        setSelectedOrder(order);
        setDetailDrawerOpen(true);
    };

    const canCreateOrder = user?.role === 'LOGISTICIAN' || user?.role === 'COMPANY_ADMIN';

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
            render: (status: string, record: Order) => (
                <Space direction="vertical" size={0}>
                    <Tag color={statusColors[status] || 'default'}>
                        {statusLabels[status] || status}
                    </Tag>
                    {record.isConfirmed && <Tag color="green" style={{ fontSize: 10 }}>Подтверждена</Tag>}
                </Space>
            ),
        },
        {
            title: 'Машина',
            key: 'vehicle',
            render: (_: any, record: Order) => {
                // Приоритет: назначенный водитель от экспедитора, потом собственный водитель
                if (record.assignedDriverName) {
                    return (
                        <Space direction="vertical" size={0}>
                            <Text style={{ fontSize: 12 }}>{record.assignedDriverName}</Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                {record.assignedDriverPlate || '—'}
                                {record.assignedDriverTrailer && ` + ${record.assignedDriverTrailer}`}
                            </Text>
                        </Space>
                    );
                }
                if (record.driver) {
                    return record.driver.vehiclePlate || '—';
                }
                return '—';
            },
        },
        {
            title: 'Сумма',
            dataIndex: 'customerPrice',
            key: 'customerPrice',
            render: (price: number) => price ? `${price.toLocaleString()} ₸` : '—',
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Order) => (
                <Space>
                    <Button icon={<EyeOutlined />} onClick={() => showOrderDetail(record)} />
                    {/* Можно отменить только заявки в статусах PENDING или ASSIGNED */}
                    {(record.status === 'PENDING' || record.status === 'ASSIGNED' || record.status === 'DRAFT') && (
                        <Button
                            danger
                            icon={<CloseCircleOutlined />}
                            onClick={() => handleCancelOrder(record)}
                        >
                            Отменить
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Title level={3}>Заявки</Title>
                {canCreateOrder && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                        Новая заявка
                    </Button>
                )}
            </div>

            <Card>
                <Table
                    columns={columns}
                    dataSource={orders}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                />
            </Card>

            {/* Модал создания заявки */}
            <Modal
                title="Новая заявка"
                open={createModalOpen}
                onCancel={() => setCreateModalOpen(false)}
                onOk={() => form.submit()}
                okText="Создать"
                cancelText="Отмена"
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleCreateOrder}>
                    <Form.Item name="cargoDescription" label="Описание груза" rules={[{ required: true }]}>
                        <TextArea rows={2} placeholder="Что везём?" />
                    </Form.Item>
                    <Form.Item name="pickupLocationId" label="Точка погрузки" rules={[{ required: true }]}>
                        <Select placeholder="Выберите локацию" showSearch optionFilterProp="children">
                            {locations.map((loc) => (
                                <Select.Option key={loc.id} value={loc.id}>
                                    {loc.name} — {loc.address}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="pickupDate" label="Дата погрузки">
                        <DatePicker
                            style={{ width: '100%' }}
                            format="DD.MM.YYYY HH:mm"
                            showTime={{ format: 'HH:mm' }}
                            placeholder="Выберите дату и время"
                        />
                    </Form.Item>
                    <Form.Item name="deliveryLocationId" label="Точка выгрузки">
                        <Select placeholder="Выберите локацию" showSearch optionFilterProp="children" allowClear>
                            {locations.map((loc) => (
                                <Select.Option key={loc.id} value={loc.id}>
                                    {loc.name} — {loc.address}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Space>
                        <Form.Item name="cargoWeight" label="Вес (кг)">
                            <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name="cargoVolume" label="Объём (м³)">
                            <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name="customerPrice" label="Сумма (₸)">
                            <InputNumber min={0} style={{ width: 150 }} />
                        </Form.Item>
                    </Space>
                    <Form.Item name="requirements" label="Особые требования">
                        <TextArea rows={2} placeholder="Тент, аккуратная погрузка и т.д." />
                    </Form.Item>
                    <Form.Item
                        name="forwarderId"
                        label="Экспедитор"
                        rules={[{ required: true, message: 'Выберите экспедитора' }]}
                    >
                        <Select placeholder="Выберите экспедитора для выполнения перевозки">
                            {forwarders.map((f) => (
                                <Select.Option key={f.id} value={f.id}>
                                    {f.name}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
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
                            <Tag color={statusColors[selectedOrder.status]} style={{ marginBottom: 8 }}>
                                {statusLabels[selectedOrder.status]}
                            </Tag>
                            {selectedOrder.isConfirmed && (
                                <Tag color="green">Подтверждена LogiCore</Tag>
                            )}
                        </Card>

                        <Title level={5}>Груз</Title>
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

                        {selectedOrder.driver && (
                            <>
                                <Title level={5} style={{ marginTop: 16 }}>Водитель</Title>
                                <div>{selectedOrder.driver.firstName} {selectedOrder.driver.lastName}</div>
                                <div>Телефон: {selectedOrder.driver.phone}</div>
                                <div>Машина: {selectedOrder.driver.vehiclePlate || '—'}</div>
                            </>
                        )}

                        {selectedOrder.assignedDriverName && (
                            <>
                                <Title level={5} style={{ marginTop: 16 }}>Назначенный водитель (от экспедитора)</Title>
                                <div><strong>ФИО:</strong> {selectedOrder.assignedDriverName}</div>
                                <div><strong>Телефон:</strong> {selectedOrder.assignedDriverPhone}</div>
                                <div><strong>Госномер:</strong> {selectedOrder.assignedDriverPlate}</div>
                                {selectedOrder.assignedDriverTrailer && (
                                    <div><strong>Номер прицепа:</strong> {selectedOrder.assignedDriverTrailer}</div>
                                )}
                            </>
                        )}

                        {selectedOrder.forwarder && (
                            <>
                                <Title level={5} style={{ marginTop: 16 }}>Экспедитор</Title>
                                <div>{selectedOrder.forwarder.name}</div>
                            </>
                        )}

                        <Title level={5} style={{ marginTop: 16 }}>Стоимость</Title>
                        <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                            {selectedOrder.customerPrice ? `${selectedOrder.customerPrice.toLocaleString()} ₸` : 'Не указана'}
                        </div>

                        {/* Кнопка изменения статуса */}
                        {getNextStatuses(selectedOrder.status).length > 0 && (
                            <Button
                                type="primary"
                                style={{ marginTop: 16, width: '100%' }}
                                onClick={openStatusModal}
                            >
                                Изменить статус заявки
                            </Button>
                        )}
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
