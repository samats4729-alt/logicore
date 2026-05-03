'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Tag, Space, message, Typography, Modal, Tooltip, Drawer } from 'antd';
import { CheckCircleOutlined, InfoCircleOutlined, EyeOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const { Title, Text } = Typography;

interface Order {
    id: string;
    orderNumber: string;
    cargoDescription: string;
    pickupLocation: { city?: string; address: string; name: string };
    deliveryPoints: { location: { city?: string; address: string; name: string } }[];
    customerCompany?: { name: string; phone?: string };
    customerPrice?: number;
    pickupDate?: string;
    createdAt: string;
    cargoWeight?: number;
    cargoVolume?: number;
    cargoType?: string;
    natureOfCargo?: string;
    requirements?: string;
    customerPriceType?: string;
    status: string;
}

export default function ForwarderSearchPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    const showOrderDetail = (order: Order) => {
        setSelectedOrder(order);
        setDetailDrawerOpen(true);
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const response = await api.get('/forwarder/marketplace');
            setOrders(response.data);
        } catch (error) {
            console.error('Failed to fetch marketplace orders:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const handleTakeOrder = (order: Order) => {
        Modal.confirm({
            title: 'Взять заявку в работу?',
            content: `Вы уверены, что хотите взять заявку ${order.orderNumber}?`,
            okText: 'Да, взять',
            cancelText: 'Отмена',
            onOk: async () => {
                try {
                    await api.put(`/forwarder/orders/${order.id}/take`);
                    message.success('Заявка взята в работу! Теперь она в списке "Мои заявки".');
                    fetchOrders();
                } catch (error: any) {
                    message.error(error.response?.data?.message || 'Ошибка');
                }
            },
        });
    };

    const columns = [
        {
            title: '№',
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            width: 80,
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
            title: 'Откуда',
            key: 'pickupLocation',
            render: (_: any, record: Order) => {
                const loc = record.pickupLocation;
                if (loc?.city) return <Text strong>{loc.city} (KZ)</Text>;
                return <Text>{loc?.name || loc?.address}</Text>;
            }
        },
        {
            title: 'Куда',
            key: 'deliveryLocation',
            render: (_: any, record: Order) => {
                const deliveryPoint = record.deliveryPoints?.[record.deliveryPoints.length - 1];
                const loc = deliveryPoint?.location;
                if (loc?.city) return <Text strong>{loc.city} (KZ)</Text>;
                return <Text>{loc?.name || loc?.address}</Text>;
            }
        },
        {
            title: 'Ставка',
            dataIndex: 'customerPrice',
            key: 'customerPrice',
            render: (price: number) => price ? <Text type="success" strong>{price.toLocaleString()} ₸</Text> : '—',
        },
        {
            title: 'Дата погрузки',
            dataIndex: 'pickupDate',
            key: 'pickupDate',
            render: (date: string) => date ? new Date(date).toLocaleDateString() : '—',
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 120,
            render: (_: any, record: Order) => (
                <Tooltip title="Подробнее">
                    <Button icon={<EyeOutlined />} onClick={() => showOrderDetail(record)} />
                </Tooltip>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <Title level={3}>Поиск грузов (Биржа)</Title>
                <Button onClick={fetchOrders}>Обновить</Button>
            </div>

            <Card>
                <Table
                    columns={columns}
                    dataSource={orders}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{ emptyText: 'Нет доступных грузов на бирже' }}
                />
            </Card>

            <Drawer
                title={`Заявка ${selectedOrder?.orderNumber}`}
                open={detailDrawerOpen}
                onClose={() => setDetailDrawerOpen(false)}
                width={500}
            >
                {selectedOrder && (
                    <div>
                        <Card size="small" style={{ marginBottom: 16 }}>
                            <Tag color="cyan" style={{ marginBottom: 8 }}>
                                Статус: В ожидании исполнителя
                            </Tag>
                            <div style={{ marginTop: 8 }}>
                                <Text type="secondary">Создана: {new Date(selectedOrder.createdAt).toLocaleDateString()}</Text>
                            </div>
                        </Card>

                        <Title level={5}>Груз</Title>
                        <Text strong>{selectedOrder.cargoDescription}</Text>
                        <div style={{ marginTop: 8 }}>
                            {selectedOrder.natureOfCargo && <div>Характер: {selectedOrder.natureOfCargo}</div>}
                            {selectedOrder.cargoWeight && <div>Вес: <strong>{selectedOrder.cargoWeight} кг</strong></div>}
                            {selectedOrder.cargoVolume && <div>Объём: <strong>{selectedOrder.cargoVolume} м³</strong></div>}
                            {selectedOrder.cargoType && <div>Тип кузова: {selectedOrder.cargoType}</div>}
                        </div>

                        {selectedOrder.requirements && (
                            <div style={{ marginTop: 12 }}>
                                <Text strong>Требования:</Text>
                                <div>{selectedOrder.requirements}</div>
                            </div>
                        )}

                        <Title level={5} style={{ marginTop: 24 }}>Финансы</Title>
                        <div style={{ fontSize: 16 }}>
                            Ставка: <Text type="success" strong>{selectedOrder.customerPrice ? `${selectedOrder.customerPrice.toLocaleString()} ₸` : 'Не указана'}</Text>
                        </div>
                        {selectedOrder.customerPriceType && (
                            <div style={{ color: '#888' }}>Тип оплаты: {selectedOrder.customerPriceType}</div>
                        )}

                        <Title level={5} style={{ marginTop: 24 }}>Маршрут</Title>
                        <div>
                            <EnvironmentOutlined style={{ color: '#1890ff', marginRight: 8 }} />
                            <strong>Погрузка:</strong> {selectedOrder.pickupDate ? new Date(selectedOrder.pickupDate).toLocaleDateString() : 'По готовности'}
                        </div>
                        <div style={{ paddingLeft: 24, marginBottom: 12 }}>
                            <div>{selectedOrder.pickupLocation?.name}</div>
                            <Text type="secondary">{selectedOrder.pickupLocation?.address}</Text>
                        </div>

                        {selectedOrder.deliveryPoints?.map((dp, i) => (
                            <div key={i} style={{ marginBottom: 12 }}>
                                <div>
                                    <EnvironmentOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                                    <strong>Выгрузка {i + 1}:</strong>
                                </div>
                                <div style={{ paddingLeft: 24 }}>
                                    <div>{dp.location.name}</div>
                                    <Text type="secondary">{dp.location.address}</Text>
                                </div>
                            </div>
                        ))}

                        <div style={{ marginTop: 32 }}>
                            <Button
                                type="primary"
                                size="large"
                                block
                                icon={<CheckCircleOutlined />}
                                onClick={() => {
                                    setDetailDrawerOpen(false);
                                    handleTakeOrder(selectedOrder);
                                }}
                            >
                                Взять заявку в работу
                            </Button>
                        </div>
                    </div>
                )}
            </Drawer>
        </div>
    );
}
