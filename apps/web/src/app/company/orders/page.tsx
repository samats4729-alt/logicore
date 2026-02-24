'use client';

import { useEffect, useState, useMemo } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, InputNumber, Select, DatePicker, message, Typography, Drawer, Row, Col, Tooltip, Checkbox, Card } from 'antd';
import { PlusOutlined, EyeOutlined, CloseCircleOutlined, EnvironmentOutlined, FlagOutlined, DeleteOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons';
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
    CANCELLED: '#f5222d',
};

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает',
    ASSIGNED: 'Назначен',
    EN_ROUTE_PICKUP: 'Едет на погр.',
    AT_PICKUP: 'На погрузке',
    LOADING: 'Загрузка',
    IN_TRANSIT: 'В пути',
    AT_DELIVERY: 'На выгрузке',
    UNLOADING: 'Разгрузка',
    COMPLETED: 'Завершён',
    PROBLEM: 'Проблема',
    CANCELLED: 'Отменён',
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

// =================== HELPERS ===================
function extractCity(order: Order, type: 'pickup' | 'delivery'): string {
    if (type === 'pickup') {
        const loc = order.pickupLocation;
        if (loc?.city) return loc.city;
        if (loc?.address) { const m = loc.address.match(/г\.\s*([^,]+)/); if (m?.[1]) return m[1].trim(); }
        return loc?.name || '';
    } else {
        const dp = order.deliveryPoints?.length ? order.deliveryPoints[order.deliveryPoints.length - 1] : null;
        const loc = dp?.location;
        if (loc?.city) return loc.city;
        if (loc?.address) { const m = loc.address.match(/г\.\s*([^,]+)/); if (m?.[1]) return m[1].trim(); }
        return loc?.name || '';
    }
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
    const [cargoCategories, setCargoCategories] = useState<any[]>([]);
    const [pickupLocation, setPickupLocation] = useState<LocationState>({ city: '', address: '' });
    const [deliveryLocation, setDeliveryLocation] = useState<LocationState>({ city: '', address: '' });
    const [intermediatePoints, setIntermediatePoints] = useState<LocationState[]>([]);
    const [isMarketplace, setIsMarketplace] = useState(false);
    const [appliedTariff, setAppliedTariff] = useState<any>(null);
    const [tariffLoading, setTariffLoading] = useState(false);

    // =================== FILTERS ===================
    const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
    const [filterFrom, setFilterFrom] = useState<string | undefined>(undefined);
    const [filterTo, setFilterTo] = useState<string | undefined>(undefined);
    const [filterForwarder, setFilterForwarder] = useState<string | undefined>(undefined);
    const [filterDriver, setFilterDriver] = useState<string | undefined>(undefined);
    const [filterSumMin, setFilterSumMin] = useState<number | undefined>(undefined);
    const [filterSumMax, setFilterSumMax] = useState<number | undefined>(undefined);

    // Reset location state when modal closes
    useEffect(() => {
        if (!createModalOpen) {
            setPickupLocation({ city: '', address: '' });
            setDeliveryLocation({ city: '', address: '' });
            setIntermediatePoints([]);
            setIsMarketplace(false);
            setAppliedTariff(null);
        }
    }, [createModalOpen]);

    // =================== UNIQUE VALUES FOR FILTERS ===================
    const uniqueStatuses = useMemo(() => {
        const s = new Set<string>();
        orders.forEach(o => s.add(o.status));
        return Array.from(s);
    }, [orders]);

    const uniqueFromCities = useMemo(() => {
        const s = new Set<string>();
        orders.forEach(o => { const c = extractCity(o, 'pickup'); if (c) s.add(c); });
        return Array.from(s).sort();
    }, [orders]);

    const uniqueToCities = useMemo(() => {
        const s = new Set<string>();
        orders.forEach(o => { const c = extractCity(o, 'delivery'); if (c) s.add(c); });
        return Array.from(s).sort();
    }, [orders]);

    const uniqueForwarders = useMemo(() => {
        const s = new Set<string>();
        orders.forEach(o => { if (o.forwarder?.name) s.add(o.forwarder.name); });
        return Array.from(s).sort();
    }, [orders]);

    const uniqueDrivers = useMemo(() => {
        const s = new Set<string>();
        orders.forEach(o => {
            if (o.assignedDriverName) s.add(o.assignedDriverName);
            else if (o.driver) s.add(`${o.driver.firstName} ${o.driver.lastName}`);
        });
        return Array.from(s).sort();
    }, [orders]);

    // =================== FILTERED DATA ===================
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            if (filterStatus && o.status !== filterStatus) return false;
            if (filterFrom && extractCity(o, 'pickup') !== filterFrom) return false;
            if (filterTo && extractCity(o, 'delivery') !== filterTo) return false;
            if (filterForwarder && o.forwarder?.name !== filterForwarder) return false;
            if (filterDriver) {
                const driverName = o.assignedDriverName || (o.driver ? `${o.driver.firstName} ${o.driver.lastName}` : '');
                if (driverName !== filterDriver) return false;
            }
            if (filterSumMin !== undefined && (o.customerPrice || 0) < filterSumMin) return false;
            if (filterSumMax !== undefined && (o.customerPrice || 0) > filterSumMax) return false;
            return true;
        });
    }, [orders, filterStatus, filterFrom, filterTo, filterForwarder, filterDriver, filterSumMin, filterSumMax]);

    const hasActiveFilters = filterStatus || filterFrom || filterTo || filterForwarder || filterDriver || filterSumMin !== undefined || filterSumMax !== undefined;

    const clearFilters = () => {
        setFilterStatus(undefined); setFilterFrom(undefined); setFilterTo(undefined);
        setFilterForwarder(undefined); setFilterDriver(undefined);
        setFilterSumMin(undefined); setFilterSumMax(undefined);
    };

    // =================== FETCH ===================
    const lookupTariff = async (originCity: string, destCity: string) => {
        if (!originCity || !destCity) { setAppliedTariff(null); return; }
        setTariffLoading(true);
        try {
            const forwarderId = form.getFieldValue('forwarderId');
            const vehicleType = form.getFieldValue('cargoType');
            const params: any = { originCity, destinationCity: destCity };
            if (forwarderId) params.forwarderCompanyId = forwarderId;
            if (vehicleType) params.vehicleType = vehicleType;
            const response = await api.get('/contracts/tariff-lookup', { params });
            if (response.data?.price) {
                setAppliedTariff(response.data);
                form.setFieldsValue({ customerPrice: response.data.price });
                message.success(`Тариф: ${response.data.price.toLocaleString('ru-RU')} ₸ (ДС №${response.data.agreement?.agreementNumber || '—'})`);
            } else { setAppliedTariff(null); }
        } catch { setAppliedTariff(null); } finally { setTariffLoading(false); }
    };

    const fetchOrders = async () => {
        try { const r = await api.get('/company/orders'); setOrders(r.data); }
        catch (e) { console.error('Failed to fetch orders:', e); }
        finally { setLoading(false); }
    };
    const fetchLocations = async () => { try { const r = await api.get('/locations'); setLocations(r.data); } catch { } };
    const fetchForwarders = async () => {
        try { const r = await api.get('/partners'); setForwarders(r.data.filter((p: any) => p.type === 'FORWARDER')); } catch { }
    };
    const fetchDrivers = async () => { try { const r = await api.get('/users?role=DRIVER'); setDrivers(r.data); } catch { } };
    const fetchCargoTypes = async () => { try { const r = await api.get('/cargo-types'); setCargoCategories(r.data); } catch { } };

    useEffect(() => { fetchOrders(); fetchLocations(); fetchForwarders(); fetchDrivers(); fetchCargoTypes(); }, []);

    // =================== HANDLERS ===================
    const handleCreateOrder = async (values: any) => {
        try {
            const getLocationId = async (loc: LocationState) => {
                if (loc.id) return loc.id;
                const res = await api.post('/locations', { name: `${loc.city}, ${loc.address}`, address: `${loc.city}, ${loc.address}`, latitude: loc.latitude || 0, longitude: loc.longitude || 0, city: loc.city || '' });
                return res.data.id;
            };
            if (!pickupLocation.city && !pickupLocation.address && !pickupLocation.id) { message.error('Заполните адрес погрузки'); return; }
            const pickupId = await getLocationId(pickupLocation);
            if (!deliveryLocation.city && !deliveryLocation.address && !deliveryLocation.id) { message.error('Заполните адрес выгрузки'); return; }
            const deliveryId = await getLocationId(deliveryLocation);
            const deliveryPoints = [];
            for (const point of intermediatePoints) { if ((point.city && point.address) || point.id) { deliveryPoints.push({ locationId: await getLocationId(point) }); } }
            const { isMarketplace: _, ...msgValues } = values;
            await api.post('/orders', { ...msgValues, pickupLocationId: pickupId, deliveryLocationId: deliveryId, deliveryPoints, customerId: user?.id, appliedTariffId: appliedTariff?.id || undefined });
            message.success('Заявка создана');
            setCreateModalOpen(false); form.resetFields(); fetchOrders();
        } catch (error: any) { message.error(error.response?.data?.message || 'Ошибка создания заявки'); }
    };

    const handleCancelOrder = (order: Order) => {
        Modal.confirm({
            title: 'Отменить заявку?', content: `Вы уверены что хотите отменить заявку ${order.orderNumber}?`,
            okText: 'Да, отменить', cancelText: 'Нет', okButtonProps: { danger: true },
            onOk: async () => {
                try { await api.put(`/orders/${order.id}/status`, { status: 'CANCELLED', comment: 'Отменено заказчиком' }); message.success('Заявка отменена'); fetchOrders(); }
                catch (error: any) { message.error(error.response?.data?.message || 'Ошибка отмены'); }
            },
        });
    };

    const getNextStatuses = (s: string) => {
        const t: Record<string, { value: string; label: string }[]> = {
            ASSIGNED: [{ value: 'EN_ROUTE_PICKUP', label: 'Едет на погрузку' }, { value: 'AT_PICKUP', label: 'На погрузке' }],
            EN_ROUTE_PICKUP: [{ value: 'AT_PICKUP', label: 'На погрузке' }],
            AT_PICKUP: [{ value: 'LOADING', label: 'Загружается' }],
            LOADING: [{ value: 'IN_TRANSIT', label: 'В пути' }],
            IN_TRANSIT: [{ value: 'AT_DELIVERY', label: 'На выгрузке' }],
            AT_DELIVERY: [{ value: 'UNLOADING', label: 'Разгружается' }],
            UNLOADING: [{ value: 'COMPLETED', label: 'Завершён' }],
        };
        return t[s] || [];
    };

    const handleStatusChange = async (values: { status: string; comment?: string }) => {
        if (!selectedOrder) return;
        setStatusLoading(true);
        try { await api.put(`/orders/${selectedOrder.id}/status`, values); message.success('Статус обновлён'); setStatusModalOpen(false); setDetailDrawerOpen(false); fetchOrders(); }
        catch (error: any) { message.error(error.response?.data?.message || 'Ошибка'); }
        finally { setStatusLoading(false); }
    };

    const showOrderDetail = (order: Order) => { setSelectedOrder(order); setDetailDrawerOpen(true); };
    const canCreateOrder = user?.role === 'LOGISTICIAN' || user?.role === 'COMPANY_ADMIN';

    // =================== COLUMNS ===================
    const columns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 130,
            sorter: (a: Order, b: Order) => a.orderNumber.localeCompare(b.orderNumber),
            render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 70,
            sorter: (a: Order, b: Order) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (d: string) => <span style={{ fontSize: 11, color: '#666' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>,
        },
        {
            title: 'Груз', dataIndex: 'cargoDescription', key: 'cargo', ellipsis: true, width: 130,
            render: (t: string) => <span style={{ fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Откуда', key: 'from', width: 110, ellipsis: true,
            sorter: (a: Order, b: Order) => extractCity(a, 'pickup').localeCompare(extractCity(b, 'pickup')),
            render: (_: any, r: Order) => <span style={{ fontSize: 12, fontWeight: 500 }}>{extractCity(r, 'pickup') || '—'}</span>,
        },
        {
            title: 'Куда', key: 'to', width: 110, ellipsis: true,
            sorter: (a: Order, b: Order) => extractCity(a, 'delivery').localeCompare(extractCity(b, 'delivery')),
            render: (_: any, r: Order) => <span style={{ fontSize: 12, fontWeight: 500 }}>{extractCity(r, 'delivery') || '—'}</span>,
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 110,
            render: (status: string, record: Order) => (
                <Space direction="vertical" size={0}>
                    <Tag color={statusColors[status] || 'default'} style={{ fontSize: 11, margin: 0, lineHeight: '18px' }}>{statusLabels[status] || status}</Tag>
                    {record.isConfirmed && <Tag color="green" style={{ fontSize: 10, margin: 0 }}>✓</Tag>}
                </Space>
            ),
        },
        {
            title: 'Экспедит.', key: 'forwarder', width: 110, ellipsis: true,
            sorter: (a: Order, b: Order) => (a.forwarder?.name || '').localeCompare(b.forwarder?.name || ''),
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.forwarder?.name || '—'}</span>,
        },
        {
            title: 'Водитель', key: 'driver', width: 120, ellipsis: true,
            render: (_: any, r: Order) => {
                if (r.assignedDriverName) return (
                    <Space direction="vertical" size={0}>
                        <span style={{ fontSize: 12 }}>{r.assignedDriverName}</span>
                        <span style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>{r.assignedDriverPlate || ''}{r.assignedDriverTrailer ? ` + ${r.assignedDriverTrailer}` : ''}</span>
                    </Space>
                );
                if (r.driver) return <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{r.driver.vehiclePlate || '—'}</span>;
                return <span style={{ color: '#ccc' }}>—</span>;
            },
        },
        {
            title: 'Сумма ₸', dataIndex: 'customerPrice', key: 'price', width: 90, align: 'right' as const,
            sorter: (a: Order, b: Order) => (a.customerPrice || 0) - (b.customerPrice || 0),
            render: (p: number) => p ? <span style={{ fontSize: 12, fontWeight: 600 }}>{p.toLocaleString('ru-RU')}</span> : <span style={{ color: '#ccc' }}>—</span>,
        },
        {
            title: '', key: 'actions', width: 80, fixed: 'right' as const,
            render: (_: any, record: Order) => (
                <Space size={4}>
                    <Tooltip title="Подробнее"><Button size="small" icon={<EyeOutlined />} onClick={() => showOrderDetail(record)} /></Tooltip>
                    {(record.status === 'PENDING' || record.status === 'ASSIGNED' || record.status === 'DRAFT') && (
                        <Tooltip title="Отменить"><Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleCancelOrder(record)} /></Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    // =================== RENDER ===================
    return (
        <div style={{ height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Title level={4} style={{ margin: 0 }}>Заявки</Title>
                {canCreateOrder && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                        Новая заявка
                    </Button>
                )}
            </div>

            {/* FILTER BAR */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8,
                padding: '8px 12px', background: '#fafafa', borderRadius: 8,
                border: '1px solid #f0f0f0', alignItems: 'center'
            }}>
                <FilterOutlined style={{ color: '#999', fontSize: 13 }} />
                <Select size="small" allowClear placeholder="Статус" style={{ width: 120 }} value={filterStatus} onChange={setFilterStatus}>
                    {uniqueStatuses.map(s => <Select.Option key={s} value={s}>{statusLabels[s] || s}</Select.Option>)}
                </Select>
                <Select size="small" allowClear showSearch optionFilterProp="children" placeholder="Откуда" style={{ width: 120 }} value={filterFrom} onChange={setFilterFrom}>
                    {uniqueFromCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                </Select>
                <Select size="small" allowClear showSearch optionFilterProp="children" placeholder="Куда" style={{ width: 120 }} value={filterTo} onChange={setFilterTo}>
                    {uniqueToCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                </Select>
                <Select size="small" allowClear showSearch optionFilterProp="children" placeholder="Экспедитор" style={{ width: 140 }} value={filterForwarder} onChange={setFilterForwarder}>
                    {uniqueForwarders.map(f => <Select.Option key={f} value={f}>{f}</Select.Option>)}
                </Select>
                <Select size="small" allowClear showSearch optionFilterProp="children" placeholder="Водитель" style={{ width: 140 }} value={filterDriver} onChange={setFilterDriver}>
                    {uniqueDrivers.map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}
                </Select>
                <InputNumber size="small" placeholder="₸ от" style={{ width: 80 }} value={filterSumMin} onChange={v => setFilterSumMin(v ?? undefined)} min={0} controls={false} />
                <InputNumber size="small" placeholder="₸ до" style={{ width: 80 }} value={filterSumMax} onChange={v => setFilterSumMax(v ?? undefined)} min={0} controls={false} />
                {hasActiveFilters && (
                    <Button size="small" icon={<ClearOutlined />} onClick={clearFilters} type="link" danger>Сбросить</Button>
                )}
                <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>
                    {hasActiveFilters ? `${filteredOrders.length} из ${orders.length}` : `Всего: ${orders.length}`}
                </span>
            </div>

            {/* TABLE */}
            <Table
                columns={columns}
                dataSource={filteredOrders}
                rowKey="id"
                loading={loading}
                size="small"
                scroll={{ x: 1100 }}
                pagination={{ pageSize: 50, size: 'small', showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `Всего: ${t}` }}
                onRow={(record) => ({
                    style: { cursor: 'pointer' },
                    onDoubleClick: () => showOrderDetail(record),
                })}
                rowClassName={(record) => {
                    if (record.status === 'COMPLETED') return 'row-completed';
                    if (record.status === 'PROBLEM') return 'row-problem';
                    if (record.status === 'CANCELLED') return 'row-cancelled';
                    return '';
                }}
            />

            {/* COMPACT TABLE STYLES */}
            <style jsx global>{`
                .ant-table-small .ant-table-thead > tr > th {
                    padding: 6px 8px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    background: #fafafa !important;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    color: #666 !important;
                    white-space: nowrap;
                }
                .ant-table-small .ant-table-tbody > tr > td {
                    padding: 4px 8px !important;
                    font-size: 12px !important;
                    border-bottom: 1px solid #f5f5f5 !important;
                }
                .ant-table-small .ant-table-tbody > tr:hover > td {
                    background: #e6f7ff !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-completed > td {
                    background: #f6ffed !important;
                    color: #389e0d;
                }
                .ant-table-small .ant-table-tbody > tr.row-problem > td {
                    background: #fff2f0 !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td {
                    background: #fafafa !important;
                    color: #bbb;
                    text-decoration: line-through;
                }
                .ant-table-small .ant-pagination {
                    margin: 8px 0 !important;
                }
            `}</style>

            {/* ========== CREATE ORDER MODAL ========== */}
            <Modal title="Новая заявка" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={() => form.submit()} okText="Создать" cancelText="Отмена" width={900} style={{ top: 20 }}>
                <Form form={form} layout="vertical" onFinish={handleCreateOrder}>
                    <Row gutter={24}>
                        <Col span={12}>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Маршрут</Title>
                            <Form.Item name="pickupDate" label="Дата погрузки" rules={[{ required: true, message: 'Укажите дату' }]}>
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY HH:mm" showTime={{ format: 'HH:mm' }} placeholder="Дата и время" />
                            </Form.Item>

                            <Card size="small" title={<Space><EnvironmentOutlined style={{ color: '#1890ff' }} /> Точка погрузки</Space>} style={{ marginBottom: 12 }} styles={{ body: { padding: '12px' } }}>
                                <Form.Item style={{ marginBottom: 0 }}>
                                    <Select placeholder="Выберите или добавьте адрес" allowClear showSearch optionFilterProp="children"
                                        dropdownRender={(menu) => (<>
                                            <div style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0' }}>
                                                <Button type="link" icon={<PlusOutlined />} style={{ width: '100%', textAlign: 'left', padding: 0 }} onMouseDown={e => e.preventDefault()} onClick={() => window.open('/company/locations', '_blank')}>Добавить новый адрес</Button>
                                            </div>{menu}
                                        </>)}
                                        onChange={(val) => {
                                            if (!val) { setPickupLocation({ city: '', address: '' }); setAppliedTariff(null); }
                                            else {
                                                const loc = locations.find(l => l.id === val);
                                                if (loc) {
                                                    const np = { city: loc.city || '', address: loc.address, id: loc.id };
                                                    setPickupLocation(np);
                                                    if (np.city && deliveryLocation.city) lookupTariff(np.city, deliveryLocation.city);
                                                }
                                            }
                                        }}
                                    >
                                        {locations.map(l => <Select.Option key={l.id} value={l.id}>{l.name} ({l.address})</Select.Option>)}
                                    </Select>
                                </Form.Item>
                            </Card>

                            <Card size="small" title={<Space><FlagOutlined style={{ color: '#52c41a' }} /> Точка выгрузки</Space>} style={{ marginBottom: 12 }} styles={{ body: { padding: '12px' } }}>
                                <Form.Item style={{ marginBottom: 0 }}>
                                    <Select placeholder="Выберите или добавьте адрес" allowClear showSearch optionFilterProp="children"
                                        dropdownRender={(menu) => (<>
                                            <div style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0' }}>
                                                <Button type="link" icon={<PlusOutlined />} style={{ width: '100%', textAlign: 'left', padding: 0 }} onMouseDown={e => e.preventDefault()} onClick={() => window.open('/company/locations', '_blank')}>Добавить новый адрес</Button>
                                            </div>{menu}
                                        </>)}
                                        onChange={(val) => {
                                            if (!val) { setDeliveryLocation({ city: '', address: '' }); setAppliedTariff(null); }
                                            else {
                                                const loc = locations.find(l => l.id === val);
                                                if (loc) {
                                                    const nd = { city: loc.city || '', address: loc.address, id: loc.id };
                                                    setDeliveryLocation(nd);
                                                    if (pickupLocation.city && nd.city) lookupTariff(pickupLocation.city, nd.city);
                                                }
                                            }
                                        }}
                                    >
                                        {locations.map(l => <Select.Option key={l.id} value={l.id}>{l.name} ({l.address})</Select.Option>)}
                                    </Select>
                                </Form.Item>
                            </Card>

                            {intermediatePoints.map((_, i) => (
                                <div key={i} style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
                                    <Select placeholder={`Доп. адрес ${i + 1}`} allowClear showSearch optionFilterProp="children" style={{ flex: 1 }}
                                        onChange={(val) => {
                                            const loc = locations.find(l => l.id === val);
                                            const np = [...intermediatePoints];
                                            np[i] = loc ? { city: loc.city || '', address: loc.address, id: loc.id } : { city: '', address: '' };
                                            setIntermediatePoints(np);
                                        }}
                                    >
                                        {locations.map(l => <Select.Option key={l.id} value={l.id}>{l.name} ({l.address})</Select.Option>)}
                                    </Select>
                                    <Button danger icon={<DeleteOutlined />} onClick={() => { const np = [...intermediatePoints]; np.splice(i, 1); setIntermediatePoints(np); }} />
                                </div>
                            ))}
                            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setIntermediatePoints([...intermediatePoints, { city: '', address: '' }])} style={{ width: '100%' }}>
                                Добавить промежуточный адрес
                            </Button>
                        </Col>

                        <Col span={12}>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Груз и Условия</Title>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="natureOfCargo" label="Характер груза" rules={[{ required: true }]}>
                                        <Select placeholder="Выберите..." showSearch optionFilterProp="children">
                                            {cargoCategories.map(cat => (
                                                <Select.OptGroup key={cat.id} label={cat.name}>
                                                    {cat.types.map((t: any) => <Select.Option key={t.id} value={t.name}>{t.name}</Select.Option>)}
                                                </Select.OptGroup>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="cargoType" label="Тип кузова">
                                        <Select placeholder="Тент, Реф..." allowClear showSearch optionFilterProp="children"
                                            filterOption={(input, option) => (option?.children as unknown as string).toLowerCase().includes(input.toLowerCase())}>
                                            {VEHICLE_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="cargoDescription" label="Описание груза" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                                <TextArea rows={2} placeholder="Мебель, 20 коробок. Хрупкое." />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={8}><Form.Item name="cargoWeight" label="Вес (кг)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
                                <Col span={8}><Form.Item name="cargoVolume" label="Объём (м³)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
                                <Col span={8}>
                                    <Form.Item name="customerPrice" label="Сумма ₸"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
                                    {appliedTariff && <div style={{ marginTop: -12, marginBottom: 8, padding: '4px 8px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, fontSize: 12 }}>✅ По тарифу ДС №{appliedTariff.agreement?.agreementNumber || '—'}</div>}
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
                                        <Select placeholder="Экспедитор" allowClear showSearch optionFilterProp="children" disabled={isMarketplace}>
                                            {forwarders.map(f => <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                    <Form.Item name="isMarketplace" valuePropName="checked" noStyle>
                                        <Checkbox checked={isMarketplace} onChange={e => { setIsMarketplace(e.target.checked); if (e.target.checked) form.setFieldsValue({ forwarderId: null }); }}>
                                            Искать на бирже (всем)
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

            {/* ========== DETAIL DRAWER ========== */}
            <Drawer title={`Заявка ${selectedOrder?.orderNumber}`} open={detailDrawerOpen} onClose={() => setDetailDrawerOpen(false)} width={500}>
                {selectedOrder && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <Tag color={statusColors[selectedOrder.status]} style={{ fontSize: 13 }}>{statusLabels[selectedOrder.status]}</Tag>
                            {selectedOrder.isConfirmed && <Tag color="green">Подтверждена LogiCore</Tag>}
                        </div>

                        <Title level={5}>Груз</Title>
                        <Text>{selectedOrder.cargoDescription}</Text>
                        {selectedOrder.natureOfCargo && <div style={{ marginTop: 4 }}>Характер: <strong>{selectedOrder.natureOfCargo}</strong></div>}
                        {selectedOrder.cargoWeight && <div>Вес: {selectedOrder.cargoWeight} кг</div>}
                        {selectedOrder.cargoVolume && <div>Объём: {selectedOrder.cargoVolume} м³</div>}
                        {selectedOrder.cargoType && <div>Кузов: <strong>{selectedOrder.cargoType}</strong></div>}
                        {selectedOrder.requirements && <div>Треб.: {selectedOrder.requirements}</div>}

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
                                {selectedOrder.assignedDriverTrailer && <div><strong>Прицеп:</strong> {selectedOrder.assignedDriverTrailer}</div>}
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
                            {selectedOrder.customerPrice ? (
                                <>{selectedOrder.customerPrice.toLocaleString()} ₸
                                    <span style={{ fontSize: 14, fontWeight: 'normal', color: '#666', marginLeft: 8 }}>
                                        {selectedOrder.customerPriceType === 'PER_KM' ? '(за км)' : selectedOrder.customerPriceType === 'PER_TON' ? '(за тонну)' : '(всего)'}
                                    </span>
                                </>
                            ) : 'Не указана'}
                        </div>
                        {(selectedOrder as any)?.appliedTariff && (
                            <div style={{ marginTop: 8, padding: '6px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, fontSize: 13 }}>
                                ✅ По тарифу: {(selectedOrder as any).appliedTariff.originCity?.name || (selectedOrder as any).appliedTariff.originCity} → {(selectedOrder as any).appliedTariff.destinationCity?.name || (selectedOrder as any).appliedTariff.destinationCity}
                            </div>
                        )}

                        {selectedOrder.status && getNextStatuses(selectedOrder.status).length > 0 && (
                            <Button type="primary" style={{ marginTop: 16, width: '100%' }} onClick={() => { statusForm.resetFields(); setStatusModalOpen(true); }}>
                                Изменить статус заявки
                            </Button>
                        )}
                    </div>
                )}
            </Drawer>

            {/* ========== STATUS MODAL ========== */}
            <Modal title="Изменить статус заявки" open={statusModalOpen} onCancel={() => setStatusModalOpen(false)} onOk={() => statusForm.submit()} okText="Обновить" cancelText="Отмена" confirmLoading={statusLoading}>
                {selectedOrder && (
                    <Form form={statusForm} layout="vertical" onFinish={handleStatusChange}>
                        <div style={{ marginBottom: 16 }}>Текущий: <Tag color={statusColors[selectedOrder.status]}>{statusLabels[selectedOrder.status]}</Tag></div>
                        <Form.Item name="status" label="Новый статус" rules={[{ required: true, message: 'Выберите' }]}>
                            <Select placeholder="Статус" size="large">
                                {getNextStatuses(selectedOrder.status).map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
                            </Select>
                        </Form.Item>
                        <Form.Item name="comment" label="Комментарий">
                            <Input.TextArea rows={3} placeholder="Причина..." />
                        </Form.Item>
                    </Form>
                )}
            </Modal>
        </div>
    );
}
