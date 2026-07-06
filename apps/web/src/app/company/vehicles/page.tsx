'use client';

import { useEffect, useState } from 'react';
import { Table, Button, Input, Modal, Form, Select, message, Space, Popconfirm, Segmented, Tag, Checkbox, Row, Col, Divider } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, CarOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';

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
    driverPhone?: string;
    driverId?: string;
    driverLastName?: string;
    driverFirstName?: string;
    driverMiddleName?: string;
    driverIin?: string;
}

export default function VehiclesPage() {
    const [ownVehicles, setOwnVehicles] = useState<Vehicle[]>([]);
    const [carrierVehicles, setCarrierVehicles] = useState<Vehicle[]>([]);
    const [ownDrivers, setOwnDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<string>('all');
    const [form] = Form.useForm();

    const selectedDriverId = Form.useWatch('driverId', form);
    const shouldEditDriver = Form.useWatch('editDriverDetails', form);

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
                                driverPhone: driver.phone || '',
                                driverLastName: driver.lastName,
                                driverFirstName: driver.firstName,
                                driverMiddleName: driver.middleName,
                                driverIin: driver.iin,
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

    const fetchDrivers = async () => {
        try {
            const res = await api.get('/company/drivers');
            setOwnDrivers(res.data || []);
        } catch (error) {
            console.error('Ошибка загрузки водителей', error);
        }
    };

    useEffect(() => {
        fetchVehicles();
        fetchDrivers();
    }, []);

    const handleCreateOrUpdate = async (values: any) => {
        try {
            if (editingVehicle) {
                if (editingVehicle.source === 'carrier') {
                    await api.put(`/company/drivers/${editingVehicle.id}`, {
                        lastName: values.driverLastName,
                        firstName: values.driverFirstName,
                        middleName: values.driverMiddleName || null,
                        phone: values.driverPhone,
                        iin: values.driverIin || null,
                        vehicleModel: values.model,
                        vehiclePlate: values.plate,
                        vehicleType: values.type,
                        trailerNumber: values.trailerNumber || null,
                    });
                    message.success('Транспорт перевозчика успешно обновлен');
                } else {
                    let finalDriverId = values.driverId;

                    if (values.driverId === '__NEW_DRIVER__') {
                        const driverRes = await api.post('/company/drivers', {
                            lastName: values.driverLastName,
                            firstName: values.driverFirstName,
                            middleName: values.driverMiddleName || null,
                            phone: values.driverPhone,
                            iin: values.driverIin || null,
                        });
                        finalDriverId = driverRes.data.id;
                    } else if (values.driverId && values.editDriverDetails) {
                        await api.put(`/company/drivers/${values.driverId}`, {
                            lastName: values.driverLastName,
                            firstName: values.driverFirstName,
                            middleName: values.driverMiddleName || null,
                            phone: values.driverPhone,
                            iin: values.driverIin || null,
                        });
                    }

                    await api.put(`/company/vehicles/${editingVehicle.id}`, {
                        model: values.model,
                        plate: values.plate,
                        type: values.type,
                        trailerNumber: values.trailerNumber || null,
                        driverId: finalDriverId || null,
                    });
                    message.success('Транспорт успешно обновлен');
                }
            } else {
                let finalDriverId = values.driverId;

                if (values.driverId === '__NEW_DRIVER__') {
                    const driverRes = await api.post('/company/drivers', {
                        lastName: values.driverLastName,
                        firstName: values.driverFirstName,
                        middleName: values.driverMiddleName || null,
                        phone: values.driverPhone,
                        iin: values.driverIin || null,
                    });
                    finalDriverId = driverRes.data.id;
                }

                await api.post('/company/vehicles', {
                    model: values.model,
                    plate: values.plate,
                    type: values.type,
                    trailerNumber: values.trailerNumber || null,
                    driverId: finalDriverId || null,
                });
                message.success('Транспорт успешно добавлен');
            }
            setModalOpen(false);
            setEditingVehicle(null);
            form.resetFields();
            fetchVehicles();
            fetchDrivers();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения');
        }
    };

    const handleEdit = (vehicle: Vehicle) => {
        setEditingVehicle(vehicle);
        const assignedDriver = ownDrivers.find(d => d.id === vehicle.driverId);

        form.setFieldsValue({
            model: vehicle.model,
            plate: vehicle.plate,
            trailerNumber: vehicle.trailerNumber || '',
            type: vehicle.type,
            driverId: vehicle.driverId || undefined,
            editDriverDetails: false,
            driverLastName: vehicle.source === 'carrier' ? vehicle.driverLastName : (assignedDriver?.lastName || ''),
            driverFirstName: vehicle.source === 'carrier' ? vehicle.driverFirstName : (assignedDriver?.firstName || ''),
            driverMiddleName: vehicle.source === 'carrier' ? vehicle.driverMiddleName : (assignedDriver?.middleName || ''),
            driverPhone: vehicle.source === 'carrier' ? vehicle.driverPhone : (assignedDriver?.phone || ''),
            driverIin: vehicle.source === 'carrier' ? vehicle.driverIin : (assignedDriver?.iin || ''),
        });
        setModalOpen(true);
    };

    const handleDelete = async (vehicle: Vehicle) => {
        try {
            if (vehicle.source === 'carrier') {
                await api.put(`/company/drivers/${vehicle.id}`, {
                    vehicleModel: null,
                    vehiclePlate: null,
                    vehicleType: null,
                    trailerNumber: null,
                });
                message.success('Транспорт перевозчика удален');
            } else {
                await api.delete(`/company/vehicles/${vehicle.id}`);
                message.success('Транспорт удален');
            }
            fetchVehicles();
            fetchDrivers();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка удаления');
        }
    };

    const getInitials = (name: string) => {
        if (!name || name === '—') return '';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
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
            render: (text: string) => <strong>{text}</strong>,
        },
        {
            title: 'Госномер авто',
            dataIndex: 'plate',
            key: 'plate',
            render: (text: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#dc3545' }}>{text}</span>,
        },
        {
            title: 'Номер прицепа',
            dataIndex: 'trailerNumber',
            key: 'trailerNumber',
            render: (text: string) => text ? <span style={{ fontFamily: 'monospace' }}>{text}</span> : <span style={{ color: 'var(--lc-text-ter)' }}>—</span>,
        },
        {
            title: 'Тип транспорта',
            dataIndex: 'type',
            key: 'type',
        },
        {
            title: 'Водитель',
            key: 'driver',
            render: (_: any, record: Vehicle) => {
                if (record.driverName) {
                    return (
                        <Space size={8}>
                            <span className="lc2-avatar lc2-avatar-sm" style={{ background: '#e0f2fe', color: '#0369a1', flexShrink: 0 }}>
                                {getInitials(record.driverName) || 'ВД'}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span style={{ fontWeight: 500, fontSize: 13 }}>{record.driverName}</span>
                                {record.driverPhone && <span style={{ color: 'var(--lc-text-ter)', fontSize: 12 }}>{record.driverPhone}</span>}
                            </div>
                        </Space>
                    );
                }
                return <span style={{ color: 'var(--lc-text-ter)' }}>—</span>;
            },
        },
        {
            title: 'Принадлежность',
            key: 'source',
            width: 160,
            render: (_: any, record: Vehicle) => {
                if (record.source === 'carrier') {
                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Tag color="orange" style={{ margin: 0, width: 'fit-content' }}>От перевозчика</Tag>
                            {record.carrierName && <span style={{ color: 'var(--lc-text-ter)', fontSize: 12 }}>{record.carrierName}</span>}
                        </div>
                    );
                }
                return <Tag color="blue" style={{ margin: 0 }}>Свой</Tag>;
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
            width: 80,
            render: (_: any, record: Vehicle) => {
                return (
                    <Space>
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => handleEdit(record)}
                        />
                        <Popconfirm
                            title={record.source === 'carrier'
                                ? "Убрать транспорт у этого водителя?"
                                : "Удалить это транспортное средство?"}
                            onConfirm={() => handleDelete(record)}
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
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Транспорт · Автопарк</div>
                    <h1 className="lc2-title">Автопарк</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Собственный транспорт и транспорт от перевозчиков
                    </p>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setEditingVehicle(null);
                            form.resetFields();
                            setModalOpen(true);
                        }}
                        className="lc-cta"
                    >
                        Добавить свой транспорт
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <CarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Всего</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {allVehicles.length}
                            </div>
                            <div className="lc2-msub">единиц</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#28a745' }}>
                            <CarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Свои</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {ownVehicles.length}
                            </div>
                            <div className="lc2-msub">в автопарке</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: carrierVehicles.length > 0 ? '#fff3e0' : '#f1f2f5', color: carrierVehicles.length > 0 ? '#e67e22' : '#5f6672' }}>
                            <CarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Перевозчики</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {carrierVehicles.length}
                            </div>
                            <div className="lc2-msub">привлечённый транспорт</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== CONTENT CARD ===== */}
            <div className="lc-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Input
                        placeholder="Поиск по модели, госномеру, перевозчику..."
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ maxWidth: 400 }}
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
                    />
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredVehicles}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    size="small"
                />
            </div>

            <Modal
                title={editingVehicle 
                    ? (editingVehicle.source === 'carrier' ? 'Редактирование транспорта перевозчика' : 'Редактирование собственного транспорта') 
                    : 'Добавление собственного транспорта'}
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
                width={700}
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

                    {(!editingVehicle || editingVehicle.source === 'own') && (
                        <>
                            <Form.Item
                                name="driverId"
                                label="Назначенный водитель (опционально)"
                            >
                                <Select 
                                    placeholder="Выберите водителя" 
                                    allowClear 
                                    showSearch 
                                    optionFilterProp="children"
                                >
                                    {ownDrivers.map(d => (
                                        <Select.Option key={d.id} value={d.id}>
                                            {`${d.lastName} ${d.firstName} ${d.middleName || ''} (${d.phone})`.trim()}
                                        </Select.Option>
                                    ))}
                                    <Select.Option value="__NEW_DRIVER__" style={{ fontWeight: 'bold', color: '#1890ff' }}>
                                        + Добавить нового водителя
                                    </Select.Option>
                                </Select>
                            </Form.Item>

                            {selectedDriverId && selectedDriverId !== '__NEW_DRIVER__' && (
                                <Form.Item
                                    name="editDriverDetails"
                                    valuePropName="checked"
                                    style={{ marginBottom: 12 }}
                                >
                                    <Checkbox>Редактировать данные водителя</Checkbox>
                                </Form.Item>
                            )}

                            {(selectedDriverId === '__NEW_DRIVER__' || (selectedDriverId && shouldEditDriver)) && (
                                <div>
                                    <Divider orientation="left" style={{ fontSize: 13, color: '#1890ff', margin: '12px 0' }}>
                                        {selectedDriverId === '__NEW_DRIVER__' ? 'Данные нового водителя' : 'Данные назначенного водителя'}
                                    </Divider>
                                    <Row gutter={16}>
                                        <Col span={8}>
                                            <Form.Item name="driverLastName" label="Фамилия" rules={[{ required: true, message: 'Введите фамилию' }]}>
                                                <Input placeholder="Иванов" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item name="driverFirstName" label="Имя" rules={[{ required: true, message: 'Введите имя' }]}>
                                                <Input placeholder="Иван" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={8}>
                                            <Form.Item name="driverMiddleName" label="Отчество">
                                                <Input placeholder="Иванович" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item name="driverPhone" label="Телефон" rules={[{ required: true, message: 'Введите телефон' }]}>
                                                <Input placeholder="+77001234567" />
                                            </Form.Item>
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item name="driverIin" label="ИИН">
                                                <Input placeholder="123456789012" maxLength={12} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </div>
                            )}
                        </>
                    )}

                    {editingVehicle && editingVehicle.source === 'carrier' && (
                        <div>
                            <Divider orientation="left" style={{ fontSize: 13, color: '#1890ff', margin: '12px 0' }}>Данные водителя перевозчика</Divider>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="driverLastName" label="Фамилия" rules={[{ required: true, message: 'Введите фамилию' }]}>
                                        <Input placeholder="Иванов" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="driverFirstName" label="Имя" rules={[{ required: true, message: 'Введите имя' }]}>
                                        <Input placeholder="Иван" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="driverMiddleName" label="Отчество">
                                        <Input placeholder="Иванович" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="driverPhone" label="Телефон" rules={[{ required: true, message: 'Введите телефон' }]}>
                                        <Input placeholder="+77001234567" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="driverIin" label="ИИН">
                                        <Input placeholder="123456789012" maxLength={12} />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>
                    )}
                </Form>
            </Modal>
        </div>
    );
}
