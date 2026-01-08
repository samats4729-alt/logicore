'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, Input, InputNumber, Select, message, Typography, Drawer } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
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
}

export default function CompanyOrdersPage() {
    const { user } = useAuthStore();
    const [orders, setOrders] = useState<Order[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [form] = Form.useForm();

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

    useEffect(() => {
        fetchOrders();
        fetchLocations();
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
            dataIndex: 'driver',
            key: 'driver',
            render: (driver: any) =>
                driver ? driver.vehiclePlate || '—' : '—',
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
                <Button icon={<EyeOutlined />} onClick={() => showOrderDetail(record)} />
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

                        <Title level={5} style={{ marginTop: 16 }}>Стоимость</Title>
                        <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                            {selectedOrder.customerPrice ? `${selectedOrder.customerPrice.toLocaleString()} ₸` : 'Не указана'}
                        </div>
                    </div>
                )}
            </Drawer>
        </div>
    );
}
