'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, Input, InputNumber, Select, DatePicker, message, Typography, Drawer, Row, Col, Tooltip, Checkbox } from 'antd';
import { PlusOutlined, EyeOutlined, CloseCircleOutlined, EnvironmentOutlined, FlagOutlined, DeleteOutlined } from '@ant-design/icons';
import { api, Location, City } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';


const { Title, Text } = Typography;
const { TextArea } = Input;

interface LocationState {
    city: string;
    address: string;
    id?: string;
    latitude?: number;
    longitude?: number;
}

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
    cargoType?: string;
    natureOfCargo?: string;
    requirements?: string;
    customerPrice?: number;
    customerPriceType?: 'FIXED' | 'PER_KM' | 'PER_TON';
    isConfirmed: boolean;
    createdAt: string;
    pickupLocation?: { name: string; address: string; city?: string };
    deliveryPoints?: { location: { name: string; address: string; city?: string } }[];
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
    const [drivers, setDrivers] = useState<{ id: string; firstName: string; lastName: string; phone: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [form] = Form.useForm();
    const [statusForm] = Form.useForm();
    // Locations state is already declared above, removing duplicates
    // const [locations, setLocations] = useState<Location[]>([]); 
    const [cargoCategories, setCargoCategories] = useState<any[]>([]); // Dynamic Cargo Types

    // New State for Locations
    const [pickupLocation, setPickupLocation] = useState<LocationState>({ city: '', address: '' });
    const [deliveryLocation, setDeliveryLocation] = useState<LocationState>({ city: '', address: '' });
    const [intermediatePoints, setIntermediatePoints] = useState<LocationState[]>([]);
    const [isMarketplace, setIsMarketplace] = useState(false);

    // Reset location state when modal closes
    useEffect(() => {
        if (!createModalOpen) {
            setPickupLocation({ city: '', address: '' });
            setDeliveryLocation({ city: '', address: '' });
            setIntermediatePoints([]);
            setIsMarketplace(false);
        }
    }, [createModalOpen]);

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
            // Fetch ONLY my partners
            const response = await api.get('/partners');
            // Filter only those who are Forwarders
            const forwarderPartners = response.data.filter((p: any) => p.type === 'FORWARDER');
            setForwarders(forwarderPartners);
        } catch (error) {
            console.error('Failed to fetch forwarders:', error);
        }
    };

    const fetchDrivers = async () => {
        try {
            const response = await api.get('/users?role=DRIVER');
            setDrivers(response.data);
        } catch (error) {
            console.error('Failed to fetch drivers:', error);
        }
    };

    const fetchCargoTypes = async () => {
        try {
            const response = await api.get('/cargo-types');
            setCargoCategories(response.data);
        } catch (error) {
            console.error('Failed to fetch cargo types:', error);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchLocations();
        fetchForwarders();
        fetchDrivers();
        fetchCargoTypes();
    }, []);

    const handleCreateOrder = async (values: any) => {
        try {
            // Helper to get or create location ID
            const getLocationId = async (loc: LocationState) => {
                // If user selected a saved location, use its ID directly
                if (loc.id) return loc.id;

                // Otherwise create a new one (Manual entry)
                const res = await api.post('/locations', {
                    name: `${loc.city}, ${loc.address}`,
                    address: `${loc.city}, ${loc.address}`,
                    latitude: loc.latitude || 0,
                    longitude: loc.longitude || 0,
                    city: loc.city || ''
                });
                return res.data.id;
            };

            // 1. Pickup
            if (!pickupLocation.city && !pickupLocation.address && !pickupLocation.id) {
                message.error('Заполните адрес погрузки');
                return;
            }
            const pickupId = await getLocationId(pickupLocation);

            // 2. Delivery
            if (!deliveryLocation.city && !deliveryLocation.address && !deliveryLocation.id) {
                message.error('Заполните адрес выгрузки');
                return;
            }
            const deliveryId = await getLocationId(deliveryLocation);

            // 3. Intermediate
            const deliveryPoints = [];
            for (const point of intermediatePoints) {
                if ((point.city && point.address) || point.id) {
                    const pointId = await getLocationId(point);
                    deliveryPoints.push({ locationId: pointId });
                }
            }

            // 4. Create Order
            // Remove isMarketplace from values to avoid API error
            const { isMarketplace, ...msgValues } = values;

            await api.post('/orders', {
                ...msgValues,
                pickupLocationId: pickupId,
                deliveryLocationId: deliveryId,
                deliveryPoints: deliveryPoints,
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
            key: 'pickupLocation',
            render: (_: any, record: Order) => {
                const loc = record.pickupLocation;
                if (loc?.city) return <Text strong>{loc.city} (KZ)</Text>;
                // Fallback from address
                if (loc?.address) {
                    const match = loc.address.match(/г\.\s*([^,]+)/);
                    if (match && match[1]) return <Text strong>{match[1]} (KZ)</Text>;
                }
                return <Text>{loc?.name || '—'}</Text>;
            }
        },
        {
            title: 'Куда',
            key: 'deliveryLocation',
            render: (_: any, record: Order) => {
                // Try to find the last delivery point or use destination
                const deliveryPoint = record.deliveryPoints && record.deliveryPoints.length > 0
                    ? record.deliveryPoints[record.deliveryPoints.length - 1]
                    : null;
                const loc = deliveryPoint?.location;

                if (loc?.city) return <Text strong>{loc.city} (KZ)</Text>;
                // Fallback from address
                if (loc?.address) {
                    const match = loc.address.match(/г\.\s*([^,]+)/);
                    if (match && match[1]) return <Text strong>{match[1]} (KZ)</Text>;
                }
                return <Text>{loc?.name || '—'}</Text>;
            }
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 180,
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
                        <Tooltip title="Отменить заявку">
                            <Button
                                danger
                                icon={<CloseCircleOutlined />}
                                onClick={() => handleCancelOrder(record)}
                            />
                        </Tooltip>
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
                width={900}
                style={{ top: 20 }}
            >
                <Form form={form} layout="vertical" onFinish={handleCreateOrder}>

                    <Row gutter={24}>
                        {/* ЛЕВАЯ КОЛОНКА: Маршрут */}
                        <Col span={12}>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Маршрут</Title>

                            {/* 1. Дата и время */}
                            <Form.Item name="pickupDate" label="Дата погрузки" rules={[{ required: true, message: 'Укажите дату' }]}>
                                <DatePicker
                                    style={{ width: '100%' }}
                                    format="DD.MM.YYYY HH:mm"
                                    showTime={{ format: 'HH:mm' }}
                                    placeholder="Выберите дату и время"
                                />
                            </Form.Item>

                            {/* 2. Точка погрузки */}
                            <Card
                                size="small"
                                title={<Space><EnvironmentOutlined style={{ color: '#1890ff' }} /> Точка погрузки</Space>}
                                style={{ marginBottom: 12 }}
                                styles={{ body: { padding: '12px' } }}
                            >
                                <Form.Item style={{ marginBottom: 0 }}>
                                    <Select
                                        placeholder="Выберите или добавьте адрес"
                                        allowClear
                                        showSearch
                                        optionFilterProp="children"
                                        dropdownRender={(menu) => (
                                            <>
                                                <div style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0' }}>
                                                    <Button
                                                        type="link"
                                                        icon={<PlusOutlined />}
                                                        style={{ width: '100%', textAlign: 'left', padding: 0 }}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => window.open('/company/locations', '_blank')}
                                                    >
                                                        Добавить новый адрес
                                                    </Button>
                                                </div>
                                                {menu}
                                            </>
                                        )}
                                        onChange={(val) => {
                                            if (!val) {
                                                setPickupLocation({ city: '', address: '' });
                                            } else {
                                                const loc = locations.find(l => l.id === val);
                                                if (loc) {
                                                    setPickupLocation({
                                                        city: loc.city || '',
                                                        address: loc.address,
                                                        id: loc.id
                                                    });
                                                }
                                            }
                                        }}
                                    >
                                        {locations.map(loc => (
                                            <Select.Option key={loc.id} value={loc.id}>
                                                {loc.name} ({loc.address})
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Card>

                            {/* 3. Точка выгрузки */}
                            <Card
                                size="small"
                                title={<Space><FlagOutlined style={{ color: '#52c41a' }} /> Точка выгрузки</Space>}
                                style={{ marginBottom: 12 }}
                                styles={{ body: { padding: '12px' } }}
                            >
                                <Form.Item style={{ marginBottom: 0 }}>
                                    <Select
                                        placeholder="Выберите или добавьте адрес"
                                        allowClear
                                        showSearch
                                        optionFilterProp="children"
                                        dropdownRender={(menu) => (
                                            <>
                                                <div style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0' }}>
                                                    <Button
                                                        type="link"
                                                        icon={<PlusOutlined />}
                                                        style={{ width: '100%', textAlign: 'left', padding: 0 }}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => window.open('/company/locations', '_blank')}
                                                    >
                                                        Добавить новый адрес
                                                    </Button>
                                                </div>
                                                {menu}
                                            </>
                                        )}
                                        onChange={(val) => {
                                            if (!val) {
                                                setDeliveryLocation({ city: '', address: '' });
                                            } else {
                                                const loc = locations.find(l => l.id === val);
                                                if (loc) {
                                                    setDeliveryLocation({
                                                        city: loc.city || '',
                                                        address: loc.address,
                                                        id: loc.id
                                                    });
                                                }
                                            }
                                        }}
                                    >
                                        {locations.map(loc => (
                                            <Select.Option key={loc.id} value={loc.id}>
                                                {loc.name} ({loc.address})
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Card>

                            {/* Промежуточные точки */}
                            {intermediatePoints.map((point, index) => (
                                <div key={index} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                                    <Select
                                        placeholder={`Доп. адрес ${index + 1}`}
                                        allowClear
                                        showSearch
                                        optionFilterProp="children"
                                        style={{ flex: 1 }}
                                        onChange={(val) => {
                                            const loc = locations.find(l => l.id === val);
                                            const newPoints = [...intermediatePoints];
                                            if (loc) {
                                                newPoints[index] = { city: loc.city || '', address: loc.address, id: loc.id };
                                            } else {
                                                newPoints[index] = { city: '', address: '' };
                                            }
                                            setIntermediatePoints(newPoints);
                                        }}
                                    >
                                        {locations.map(loc => (
                                            <Select.Option key={loc.id} value={loc.id}>
                                                {loc.name} ({loc.address})
                                            </Select.Option>
                                        ))}
                                    </Select>
                                    <Button
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => {
                                            const newPoints = [...intermediatePoints];
                                            newPoints.splice(index, 1);
                                            setIntermediatePoints(newPoints);
                                        }}
                                    />
                                </div>
                            ))}
                            <Button
                                type="dashed"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => setIntermediatePoints([...intermediatePoints, { city: '', address: '' }])}
                                style={{ width: '100%' }}
                            >
                                Добавить промежуточный адрес
                            </Button>
                        </Col>

                        {/* ПРАВАЯ КОЛОНКА: Груз и Финансы */}
                        <Col span={12}>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Груз и Условия</Title>

                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="natureOfCargo" label="Характер груза" rules={[{ required: true }]}>
                                        <Select
                                            placeholder="Выберите..."
                                            size="middle"
                                            showSearch
                                            optionFilterProp="children"
                                        >
                                            {cargoCategories.map(cat => (
                                                <Select.OptGroup key={cat.id} label={cat.name}>
                                                    {cat.types.map((type: any) => (
                                                        <Select.Option key={type.id} value={type.name}>{type.name}</Select.Option>
                                                    ))}
                                                </Select.OptGroup>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="cargoType" label="Тип кузова">
                                        <Select placeholder="Тент, Реф..." allowClear>
                                            {VEHICLE_TYPES.map(type => (
                                                <Select.Option key={type} value={type}>{type}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item name="cargoDescription" label="Описание груза" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                                <TextArea rows={2} placeholder="Например: Мебель, 20 коробок. Хрупкое." />
                            </Form.Item>

                            <Row gutter={12}>
                                <Col span={8}>
                                    <Form.Item name="cargoWeight" label="Вес (кг)">
                                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="cargoVolume" label="Объём (м³)">
                                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="customerPrice" label="Сумма">
                                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                                        <Select>
                                            <Select.Option value="FIXED">За рейс (всего)</Select.Option>
                                            <Select.Option value="PER_KM">За км</Select.Option>
                                            <Select.Option value="PER_TON">За тонну</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="forwarderId" label="Экспедитор" style={{ marginBottom: 8 }}>
                                        <Select
                                            placeholder="Выберите конкретного экспедитора"
                                            allowClear
                                            showSearch
                                            optionFilterProp="children"
                                            disabled={isMarketplace}
                                        >
                                            {forwarders.map((f) => (
                                                <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                    <Form.Item name="isMarketplace" valuePropName="checked" noStyle>
                                        <Checkbox
                                            checked={isMarketplace}
                                            onChange={(e) => {
                                                setIsMarketplace(e.target.checked);
                                                if (e.target.checked) {
                                                    form.setFieldsValue({ forwarderId: null });
                                                }
                                            }}
                                        >
                                            Искать исполнителя на бирже (всем)
                                        </Checkbox>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item name="requirements" label="Доп. требования" style={{ marginBottom: 0 }}>
                                <TextArea rows={2} placeholder="Ремни, коники, верхняя погрузка..." />
                            </Form.Item>
                        </Col>
                    </Row>
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
                            <Tag color={statusColors[selectedOrder?.status || '']} style={{ marginBottom: 8 }}>
                                {statusLabels[selectedOrder?.status || '']}
                            </Tag>
                            {selectedOrder?.isConfirmed && (
                                <Tag color="green">Подтверждена LogiCore</Tag>
                            )}
                        </Card>

                        <Title level={5}>Груз</Title>
                        <Text>{selectedOrder?.cargoDescription}</Text>
                        {selectedOrder?.natureOfCargo && <div style={{ marginTop: 4 }}>Характер: <strong>{selectedOrder?.natureOfCargo}</strong></div>}
                        {selectedOrder?.cargoWeight && <div>Вес: {selectedOrder?.cargoWeight} кг</div>}
                        {selectedOrder?.cargoVolume && <div>Объём: {selectedOrder?.cargoVolume} м³</div>}
                        {selectedOrder?.cargoType && <div>Тип транспорта: <strong>{selectedOrder?.cargoType}</strong></div>}
                        {selectedOrder?.requirements && <div>Требования: {selectedOrder?.requirements}</div>}

                        <Title level={5} style={{ marginTop: 16 }}>Маршрут</Title>
                        <div><strong>Погрузка:</strong> {selectedOrder?.pickupLocation?.name}</div>
                        <div style={{ color: '#666' }}>{selectedOrder?.pickupLocation?.address}</div>
                        {selectedOrder?.deliveryPoints?.map((dp, i) => (
                            <div key={i} style={{ marginTop: 8 }}>
                                <strong>Выгрузка {i + 1}:</strong> {dp.location.name}
                                <div style={{ color: '#666' }}>{dp.location.address}</div>
                            </div>
                        ))}

                        {selectedOrder?.driver && (
                            <>
                                <Title level={5} style={{ marginTop: 16 }}>Водитель</Title>
                                <div>{selectedOrder?.driver.firstName} {selectedOrder?.driver.lastName}</div>
                                <div>Телефон: {selectedOrder?.driver.phone}</div>
                                <div>Машина: {selectedOrder?.driver.vehiclePlate || '—'}</div>
                            </>
                        )}

                        {selectedOrder?.assignedDriverName && (
                            <>
                                <Title level={5} style={{ marginTop: 16 }}>Назначенный водитель (от экспедитора)</Title>
                                <div><strong>ФИО:</strong> {selectedOrder?.assignedDriverName}</div>
                                <div><strong>Телефон:</strong> {selectedOrder?.assignedDriverPhone}</div>
                                <div><strong>Госномер:</strong> {selectedOrder?.assignedDriverPlate}</div>
                                {selectedOrder?.assignedDriverTrailer && (
                                    <div><strong>Номер прицепа:</strong> {selectedOrder?.assignedDriverTrailer}</div>
                                )}
                            </>
                        )}

                        {selectedOrder?.forwarder && (
                            <>
                                <Title level={5} style={{ marginTop: 16 }}>Экспедитор</Title>
                                <div>{selectedOrder?.forwarder.name}</div>
                            </>
                        )}

                        <Title level={5} style={{ marginTop: 16 }}>Стоимость</Title>
                        <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                            {selectedOrder?.customerPrice ? (
                                <>
                                    {selectedOrder.customerPrice.toLocaleString()} ₸
                                    <span style={{ fontSize: 14, fontWeight: 'normal', color: '#666', marginLeft: 8 }}>
                                        {selectedOrder.customerPriceType === 'PER_KM' ? '(за км)' :
                                            selectedOrder.customerPriceType === 'PER_TON' ? '(за тонну)' : '(всего)'}
                                    </span>
                                </>
                            ) : 'Не указана'}
                        </div>

                        {/* Кнопка изменения статуса */}
                        {selectedOrder?.status && getNextStatuses(selectedOrder.status).length > 0 && (
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
                            Текущий статус: <Tag color={statusColors[selectedOrder?.status || '']}>
                                {statusLabels[selectedOrder?.status || '']}
                            </Tag>
                        </div>
                        <Form.Item
                            name="status"
                            label="Новый статус"
                            rules={[{ required: true, message: 'Выберите статус' }]}
                        >
                            <Select placeholder="Выберите статус" size="large">
                                {selectedOrder?.status && getNextStatuses(selectedOrder.status).map(s => (
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
        </div >
    );
}
