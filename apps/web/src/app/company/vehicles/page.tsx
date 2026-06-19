'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Modal, Form, Select, message, Typography, Space, Popconfirm, Segmented, Tag } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, CarOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';

const { Title, Text } = Typography;

interface Vehicle {
    id: string;
    type: string;
    plate: string;
    model: string;
    trailerNumber?: string;
    createdAt: string;
    // For carrier vehicles
    source?: 'own' | 'carrier';
    carrierName?: string;
    driverName?: string;
}

export default function VehiclesPage() {
    const [ownVehicles, setOwnVehicles] = useState<Vehicle[]>([]);
    const [carrierVehicles, setCarrierVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<string>('all');
    const [form] = Form.useForm();

    const fetchVehicles = async () => {
        setLoading(true);
        try {
            // Fetch own vehicles
            const ownRes = await api.get('/company/vehicles');
            const own = (ownRes.data || []).map((v: any) => ({ ...v, source: 'own' as const }));
            setOwnVehicles(own);

            // Fetch carrier vehicles (from drivers of external carrier companies)
            const externalRes = await api.get('/external-companies');
            const carriers = externalRes.data.filter((e: any) => e.isCarrier);

            const carrierVehiclesList: Vehicle[] = [];
            for (const carrier of carriers) {
                try {
                    const driversRes = await api.get('/company/drivers', { params: { companyId: carrier.id } });
                    for (const driver of driversRes.data) {
                        if (driver.vehiclePlate || driver.vehicleModel) {
                            carrierVehiclesList.push({
                                id: driver.id,
                                type: driver.vehicleType || '—',
                                plate: driver.vehiclePlate || '—',
                                model: driver.vehicleModel || '—',
                                trailerNumber: driver.trailerNumber,
                                createdAt: driver.createdAt,
                                source: 'carrier',
                                carrierName: carrier.name,
                                driverName: `${driver.lastName} ${driver.firstName}`.trim(),
                            });
                        }
                    }
                } catch {}
            }
            setCarrierVehicles(carrierVehiclesList);
        } catch (error) {
            message.error('Ошибка загрузки транспорта');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVehicles();
    }, []);

    const handleCreateOrUpdate = async (values: any) => {
        try {
            if (editingVehicle) {
                await api.put(`/company/vehicles/${editingVehicle.id}`, values);
                message.success('Транспорт успешно обновлен');
            } else {
                await api.post('/company/vehicles', values);
                message.success('Транспорт успешно добавлен');
            }
            setModalOpen(false);
            setEditingVehicle(null);
            form.resetFields();
            fetchVehicles();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения');
        }
    };

    const handleEdit = (vehicle: Vehicle) => {
        setEditingVehicle(vehicle);
        form.setFieldsValue(vehicle);
        setModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/company/vehicles/${id}`);
            message.success('Транспорт удален');
            fetchVehicles();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка удаления');
        }
    };

    // Combine and filter
    const allVehicles = [...ownVehicles, ...carrierVehicles];
    const filteredBySource = filter === 'own'
        ? ownVehicles
        : filter === 'carrier'
            ? carrierVehicles
            : allVehicles;

    const filteredVehicles = filteredBySource.filter(v =>
        (v.model || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.plate || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.trailerNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.carrierName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.driverName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const columns = [
        {
            title: 'Модель ТС',
            dataIndex: 'model',
            key: 'model',
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: 'Госномер авто',
            dataIndex: 'plate',
            key: 'plate',
            render: (text: string) => <Text type="danger" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{text}</Text>,
        },
        {
            title: 'Номер прицепа',
            dataIndex: 'trailerNumber',
            key: 'trailerNumber',
            render: (text: string) => text ? <Text style={{ fontFamily: 'monospace' }}>{text}</Text> : <Text type="secondary">—</Text>,
        },
        {
            title: 'Тип транспорта',
            dataIndex: 'type',
            key: 'type',
        },
        {
            title: 'Принадлежность',
            key: 'source',
            render: (_: any, record: Vehicle) => {
                if (record.source === 'carrier') {
                    return (
                        <Space direction="vertical" size={0}>
                            <Tag color="orange">От перевозчика</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>{record.carrierName}</Text>
                            {record.driverName && <Text type="secondary" style={{ fontSize: 11 }}>{record.driverName}</Text>}
                        </Space>
                    );
                }
                return <Tag color="blue">Свой</Tag>;
            },
        },
        {
            title: 'Дата добавления',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (date: string) => date ? new Date(date).toLocaleDateString('ru-RU') : '—',
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Vehicle) => {
                if (record.source === 'carrier') return null;
                return (
                    <Space>
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(record)}
                        />
                        <Popconfirm
                            title="Удалить это транспортное средство?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Да"
                            cancelText="Нет"
                            okButtonProps={{ danger: true }}
                        >
                            <Button type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </Space>
                );
            },
        },
    ];

    return (
        <div style={{ padding: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <Title level={3} style={{ margin: 0 }}>Транспорт</Title>
                    <Text type="secondary">Собственный транспорт и транспорт от перевозчиков</Text>
                </div>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="large"
                    onClick={() => {
                        setEditingVehicle(null);
                        form.resetFields();
                        setModalOpen(true);
                    }}
                >
                    Добавить свой транспорт
                </Button>
            </div>

            <Card bordered={false} style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.01)' }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Input
                        placeholder="Поиск по модели, госномеру, перевозчику..."
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ maxWidth: 400, borderRadius: 8 }}
                        size="large"
                        allowClear
                    />
                    <Segmented
                        value={filter}
                        onChange={(val) => setFilter(val as string)}
                        options={[
                            { label: `Все (${allVehicles.length})`, value: 'all' },
                            { label: `Свои (${ownVehicles.length})`, value: 'own' },
                            { label: `От перевозчиков (${carrierVehicles.length})`, value: 'carrier' },
                        ]}
                        size="large"
                    />
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredVehicles}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            <Modal
                title={editingVehicle ? 'Редактирование транспорта' : 'Добавление транспорта'}
                open={modalOpen}
                onCancel={() => {
                    setModalOpen(false);
                    setEditingVehicle(null);
                    form.resetFields();
                }}
                onOk={() => form.submit()}
                okText={editingVehicle ? 'Сохранить' : 'Добавить'}
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate}>
                    <Form.Item
                        name="model"
                        label="Модель ТС"
                        rules={[{ required: true, message: 'Введите модель транспортного средства (например, Volvo FH16)' }]}
                    >
                        <Input placeholder="Volvo FH16" />
                    </Form.Item>

                    <Form.Item
                        name="plate"
                        label="Госномер автомобиля"
                        rules={[{ required: true, message: 'Введите госномер' }]}
                    >
                        <Input placeholder="123ABC01" />
                    </Form.Item>

                    <Form.Item
                        name="trailerNumber"
                        label="Госномер прицепа (опционально)"
                    >
                        <Input placeholder="1234XX01" />
                    </Form.Item>

                    <Form.Item
                        name="type"
                        label="Тип транспорта"
                        rules={[{ required: true, message: 'Выберите тип' }]}
                    >
                        <Select placeholder="Выберите тип транспорта">
                            {VEHICLE_TYPES.map(t => (
                                <Select.Option key={t} value={t}>{t}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
