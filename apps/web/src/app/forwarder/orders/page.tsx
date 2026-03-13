'use client';

import { useEffect, useState, useMemo } from 'react';
import {
    Table, Button, Tag, Space, Modal, Form, Input, message, Typography,
    Drawer, Descriptions, Select, Tooltip, Tabs, InputNumber, Row, Col,
    DatePicker, Checkbox, Slider
} from 'antd';
import {
    EyeOutlined, UserAddOutlined, CheckCircleOutlined, PlusOutlined,
    EnvironmentOutlined, FlagOutlined, DeleteOutlined, SearchOutlined,
    FilterOutlined, ClearOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
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

interface Partner {
    id: string;
    name: string;
}

interface LocationState {
    city: string;
    address: string;
    id?: string;
}

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
    customerPriceType?: string;
    createdAt: string;
    pickupDate?: string;
    pickupLocation?: { name: string; address: string; city?: string };
    deliveryPoints?: { location: { name: string; address: string; city?: string } }[];
    customer?: { firstName: string; lastName: string; phone: string; email?: string };
    customerCompany?: { name: string; phone?: string };
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedDriverPlate?: string;
    assignedAt?: string;
    subForwarder?: { name: string };
    forwarder?: { name: string };
    isConfirmed?: boolean;
}

// ============================================================
// Component
// ============================================================

export default function ForwarderOrdersPage() {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('incoming');

    // Incoming orders
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    // Outgoing orders
    const [outgoingOrders, setOutgoingOrders] = useState<Order[]>([]);
    const [outgoingLoading, setOutgoingLoading] = useState(true);

    // Common
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [partnersLoading, setPartnersLoading] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignType, setAssignType] = useState<'driver' | 'partner'>('driver');
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [form] = Form.useForm();
    const [statusForm] = Form.useForm();

    // Create order
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [createForm] = Form.useForm();
    const [locations, setLocations] = useState<Location[]>([]);
    const [cargoCategories, setCargoCategories] = useState<any[]>([]);
    const [pickupLocation, setPickupLocation] = useState<LocationState>({ city: '', address: '' });
    const [deliveryLocation, setDeliveryLocation] = useState<LocationState>({ city: '', address: '' });
    const [intermediatePoints, setIntermediatePoints] = useState<LocationState[]>([]);
    const [forwarders, setForwarders] = useState<{ id: string; name: string }[]>([]);
    const [isMarketplace, setIsMarketplace] = useState(false);
    const [appliedTariff, setAppliedTariff] = useState<any>(null);
    const [tariffLoading, setTariffLoading] = useState(false);

    // =================== FILTERS ===================
    const [filterCompany, setFilterCompany] = useState<string | undefined>(undefined);
    const [filterDriver, setFilterDriver] = useState<string | undefined>(undefined);
    const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
    const [filterFrom, setFilterFrom] = useState<string | undefined>(undefined);
    const [filterTo, setFilterTo] = useState<string | undefined>(undefined);
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
    const uniqueCompanies = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => { if (o.customerCompany?.name) set.add(o.customerCompany.name); });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueDrivers = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => { if (o.assignedDriverName) set.add(o.assignedDriverName); });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueStatuses = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => set.add(o.status));
        return Array.from(set);
    }, [orders]);

    const uniqueFromCities = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => {
            const city = extractCity(o, 'pickup');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueToCities = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => {
            const city = extractCity(o, 'delivery');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [orders]);

    // =================== FILTERED DATA ===================
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            if (filterCompany && o.customerCompany?.name !== filterCompany) return false;
            if (filterDriver && o.assignedDriverName !== filterDriver) return false;
            if (filterStatus && o.status !== filterStatus) return false;
            if (filterFrom) {
                const city = extractCity(o, 'pickup');
                if (city !== filterFrom) return false;
            }
            if (filterTo) {
                const city = extractCity(o, 'delivery');
                if (city !== filterTo) return false;
            }
            if (filterSumMin !== undefined && (o.customerPrice || 0) < filterSumMin) return false;
            if (filterSumMax !== undefined && (o.customerPrice || 0) > filterSumMax) return false;
            return true;
        });
    }, [orders, filterCompany, filterDriver, filterStatus, filterFrom, filterTo, filterSumMin, filterSumMax]);

    const hasActiveFilters = filterCompany || filterDriver || filterStatus || filterFrom || filterTo || filterSumMin !== undefined || filterSumMax !== undefined;

    const clearFilters = () => {
        setFilterCompany(undefined);
        setFilterDriver(undefined);
        setFilterStatus(undefined);
        setFilterFrom(undefined);
        setFilterTo(undefined);
        setFilterSumMin(undefined);
        setFilterSumMax(undefined);
    };

    // =================== HELPER ===================
    function extractCity(order: Order, type: 'pickup' | 'delivery'): string {
        if (type === 'pickup') {
            const loc = order.pickupLocation;
            if (loc?.city) return loc.city;
            if (loc?.address) {
                const m = loc.address.match(/г\.\s*([^,]+)/);
                if (m?.[1]) return m[1].trim();
            }
            return loc?.name || '';
        } else {
            const dp = order.deliveryPoints?.length
                ? order.deliveryPoints[order.deliveryPoints.length - 1]
                : null;
            const loc = dp?.location;
            if (loc?.city) return loc.city;
            if (loc?.address) {
                const m = loc.address.match(/г\.\s*([^,]+)/);
                if (m?.[1]) return m[1].trim();
            }
            return loc?.name || '';
        }
    }

    // =================== FETCH ===================

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

    const fetchOutgoingOrders = async () => {
        try {
            setOutgoingLoading(true);
            const response = await api.get('/company/orders');
            setOutgoingOrders(response.data);
        } catch (error) {
            console.error('Failed to fetch outgoing orders:', error);
        } finally {
            setOutgoingLoading(false);
        }
    };

    const fetchDrivers = async () => {
        setDriversLoading(true);
        try {
            const response = await api.get('/forwarder/drivers');
            setDrivers(response.data);
        } catch {
            message.error('Ошибка загрузки водителей');
        } finally {
            setDriversLoading(false);
        }
    };

    const fetchPartners = async () => {
        setPartnersLoading(true);
        try {
            const [partnersRes, externalRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
            ]);
            const partnersList = partnersRes.data;
            const externalList = externalRes.data.map((e: any) => ({
                id: e.id,
                name: `${e.name} (внешняя)`,
            }));
            setPartners([...partnersList, ...externalList]);
        } catch { } finally {
            setPartnersLoading(false);
        }
    };

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch { }
    };

    const fetchForwarders = async () => {
        try {
            const [partnersRes, externalRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
            ]);
            const partnerForwarders = partnersRes.data.filter((p: any) => p.type === 'FORWARDER');
            const externalForwarders = externalRes.data
                .filter((e: any) => e.type === 'FORWARDER')
                .map((e: any) => ({ id: e.id, name: `${e.name} (внешняя)` }));
            setForwarders([...partnerForwarders, ...externalForwarders]);
        } catch { }
    };

    const fetchCargoTypes = async () => {
        try {
            const response = await api.get('/cargo-types');
            setCargoCategories(response.data);
        } catch { }
    };

    const lookupTariff = async (originCity: string, destCity: string) => {
        if (!originCity || !destCity) { setAppliedTariff(null); return; }
        setTariffLoading(true);
        try {
            const response = await api.get('/contracts/tariff-lookup', {
                params: { originCity, destinationCity: destCity }
            });
            if (response.data?.price) {
                setAppliedTariff(response.data);
                createForm.setFieldsValue({ customerPrice: response.data.price });
                message.success(`Тариф: ${response.data.price.toLocaleString('ru-RU')} ₸`);
            } else { setAppliedTariff(null); }
        } catch { setAppliedTariff(null); } finally { setTariffLoading(false); }
    };

    useEffect(() => {
        fetchOrders();
        fetchOutgoingOrders();
        fetchLocations();
        fetchForwarders();
        fetchCargoTypes();
    }, []);

    // =================== INCOMING HANDLERS ===================

    const showOrderDetail = (order: Order) => { setSelectedOrder(order); setDetailDrawerOpen(true); };

    const openAssignModal = (order: Order) => {
        setSelectedOrder(order);
        setSelectedDriverId(null);
        form.resetFields();
        setAssignModalOpen(true);
        setAssignType('driver');
        fetchDrivers();
        fetchPartners();
    };

    const handleDriverSelect = (driverId: string) => {
        setSelectedDriverId(driverId);
        const driver = drivers.find(d => d.id === driverId);
        if (driver) {
            form.setFieldsValue({
                driverName: `${driver.lastName} ${driver.firstName} ${driver.middleName || ''}`.trim(),
                driverPhone: driver.phone,
                driverPlate: driver.vehiclePlate || '',
                trailerNumber: driver.trailerNumber || '',
            });
        }
    };

    const handleAssign = async (values: any) => {
        if (!selectedOrder) return;
        setAssignLoading(true);
        try {
            if (assignType === 'driver') {
                await api.put(`/forwarder/orders/${selectedOrder.id}/assign-driver`, { ...values, driverId: selectedDriverId });
                message.success('Водитель назначен');
            } else {
                await api.put(`/forwarder/orders/${selectedOrder.id}/assign-forwarder`, { partnerId: values.partnerId, price: values.price });
                message.success('Заявка передана партнеру');
            }
            setAssignModalOpen(false); form.resetFields(); setSelectedDriverId(null); fetchOrders();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка назначения');
        } finally { setAssignLoading(false); }
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
        try {
            await api.put(`/forwarder/orders/${selectedOrder.id}/status`, values);
            message.success('Статус обновлён');
            setStatusModalOpen(false); setDetailDrawerOpen(false); fetchOrders();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        } finally { setStatusLoading(false); }
    };

    // =================== CREATE ORDER ===================

    const handleCreateOrder = async (values: any) => {
        try {
            const getLocId = async (loc: LocationState) => {
                if (loc.id) return loc.id;
                const res = await api.post('/locations', { name: `${loc.city}, ${loc.address}`, address: `${loc.city}, ${loc.address}`, latitude: 0, longitude: 0, city: loc.city || '' });
                return res.data.id;
            };
            if (!pickupLocation.city && !pickupLocation.address && !pickupLocation.id) { message.error('Заполните адрес погрузки'); return; }
            const pickupId = await getLocId(pickupLocation);
            if (!deliveryLocation.city && !deliveryLocation.address && !deliveryLocation.id) { message.error('Заполните адрес выгрузки'); return; }
            const deliveryId = await getLocId(deliveryLocation);
            const dps = [];
            for (const p of intermediatePoints) { if ((p.city && p.address) || p.id) { dps.push({ locationId: await getLocId(p) }); } }
            const { isMarketplace: _, ...ov } = values;
            await api.post('/orders', { ...ov, pickupLocationId: pickupId, deliveryLocationId: deliveryId, deliveryPoints: dps, customerId: user?.id, appliedTariffId: appliedTariff?.id || undefined });
            message.success('Заявка создана');
            setCreateModalOpen(false); createForm.resetFields(); fetchOutgoingOrders();
        } catch (error: any) { message.error(error.response?.data?.message || 'Ошибка создания'); }
    };

    // =================== COMPACT CELL STYLE ===================
    const cellStyle: React.CSSProperties = { fontSize: 12, padding: '4px 6px', lineHeight: '1.3' };

    // =================== COLUMNS ===================

    const incomingColumns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 60,
            sorter: (a: Order, b: Order) => a.orderNumber.localeCompare(b.orderNumber),
            render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80,
            sorter: (a: Order, b: Order) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            render: (d: string) => <span style={{ fontSize: 11, color: '#666' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>,
        },
        {
            title: 'Заказчик', key: 'company', width: 130, ellipsis: true,
            sorter: (a: Order, b: Order) => (a.customerCompany?.name || '').localeCompare(b.customerCompany?.name || ''),
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.customerCompany?.name || '—'}</span>,
        },
        {
            title: 'Груз', dataIndex: 'cargoDescription', key: 'cargo', ellipsis: true, width: 130,
            render: (t: string) => <span style={{ fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Откуда', key: 'from', width: 110, ellipsis: true,
            sorter: (a: Order, b: Order) => extractCity(a, 'pickup').localeCompare(extractCity(b, 'pickup')),
            render: (_: any, r: Order) => {
                const c = extractCity(r, 'pickup');
                return <span style={{ fontSize: 12, fontWeight: 500 }}>{c || '—'}</span>;
            },
        },
        {
            title: 'Куда', key: 'to', width: 110, ellipsis: true,
            sorter: (a: Order, b: Order) => extractCity(a, 'delivery').localeCompare(extractCity(b, 'delivery')),
            render: (_: any, r: Order) => {
                const c = extractCity(r, 'delivery');
                return <span style={{ fontSize: 12, fontWeight: 500 }}>{c || '—'}</span>;
            },
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 100,
            render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, margin: 0, lineHeight: '18px' }}>{statusLabels[s] || s}</Tag>,
        },
        {
            title: 'Исп-ль', key: 'sub', width: 100, ellipsis: true,
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.subForwarder?.name || '—'}</span>,
        },
        {
            title: 'Водитель', key: 'driver', width: 110, ellipsis: true,
            render: (_: any, r: Order) => r.assignedDriverName
                ? <span style={{ fontSize: 12 }}>{r.assignedDriverName}</span>
                : <Tag color="warning" style={{ fontSize: 11, margin: 0 }}>—</Tag>,
        },
        {
            title: 'Гос №', key: 'plate', width: 80,
            render: (_: any, r: Order) => <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{r.assignedDriverPlate || '—'}</span>,
        },
        {
            title: 'Сумма ₸', dataIndex: 'customerPrice', key: 'price', width: 90, align: 'right' as const,
            sorter: (a: Order, b: Order) => (a.customerPrice || 0) - (b.customerPrice || 0),
            render: (p: number) => p ? <span style={{ fontSize: 12, fontWeight: 600 }}>{p.toLocaleString('ru-RU')}</span> : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>,
        },
        {
            title: '', key: 'actions', width: 80, fixed: 'right' as const,
            render: (_: any, r: Order) => (
                <Space size={4}>
                    <Tooltip title="Подробнее"><Button size="small" icon={<EyeOutlined />} onClick={() => showOrderDetail(r)} style={{ fontSize: 12 }} /></Tooltip>
                    <Tooltip title={r.assignedDriverName ? 'Изменить' : 'Назначить'}>
                        <Button size="small" type={r.assignedDriverName ? 'default' : 'primary'} icon={r.assignedDriverName ? <CheckCircleOutlined /> : <UserAddOutlined />} onClick={() => openAssignModal(r)} />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const outgoingColumns = [
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 60, render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span> },
        { title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80, render: (d: string) => <span style={{ fontSize: 11, color: '#666' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span> },
        { title: 'Груз', dataIndex: 'cargoDescription', key: 'cargo', ellipsis: true, width: 140, render: (t: string) => <span style={{ fontSize: 12 }}>{t}</span> },
        {
            title: 'Откуда', key: 'from', width: 110,
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{extractCity(r, 'pickup') || '—'}</span>,
        },
        {
            title: 'Куда', key: 'to', width: 110,
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{extractCity(r, 'delivery') || '—'}</span>,
        },
        { title: 'Статус', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, margin: 0 }}>{statusLabels[s] || s}</Tag> },
        { title: 'Экспедитор', key: 'fwd', width: 120, ellipsis: true, render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.forwarder?.name || '—'}</span> },
        { title: 'Водитель', key: 'drv', width: 110, render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.assignedDriverName || '—'}</span> },
        { title: 'Сумма ₸', dataIndex: 'customerPrice', key: 'price', width: 90, align: 'right' as const, render: (p: number) => p ? <span style={{ fontSize: 12, fontWeight: 600 }}>{p.toLocaleString('ru-RU')}</span> : '—' },
        { title: '', key: 'actions', width: 50, render: (_: any, r: Order) => <Button size="small" icon={<EyeOutlined />} onClick={() => showOrderDetail(r)} /> },
    ];

    // =================== RENDER ===================

    return (
        <div style={{ height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Title level={4} style={{ margin: 0 }}>Заявки</Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                    Новая заявка
                </Button>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                size="small"
                tabBarStyle={{ marginBottom: 8 }}
                items={[
                    {
                        key: 'incoming',
                        label: <span>Входящие <Tag style={{ marginLeft: 4, fontSize: 11 }}>{filteredOrders.length}{hasActiveFilters ? `/${orders.length}` : ''}</Tag></span>,
                        children: (
                            <div>
                                {/* FILTER BAR */}
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8,
                                    padding: '8px 12px', background: '#fafafa', borderRadius: 8,
                                    border: '1px solid #f0f0f0', alignItems: 'center'
                                }}>
                                    <FilterOutlined style={{ color: '#999', fontSize: 13 }} />
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Заказчик" style={{ width: 150 }}
                                        value={filterCompany} onChange={setFilterCompany}
                                    >
                                        {uniqueCompanies.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Водитель" style={{ width: 140 }}
                                        value={filterDriver} onChange={setFilterDriver}
                                    >
                                        {uniqueDrivers.map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear
                                        placeholder="Статус" style={{ width: 120 }}
                                        value={filterStatus} onChange={setFilterStatus}
                                    >
                                        {uniqueStatuses.map(s => <Select.Option key={s} value={s}>{statusLabels[s] || s}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Откуда" style={{ width: 120 }}
                                        value={filterFrom} onChange={setFilterFrom}
                                    >
                                        {uniqueFromCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Куда" style={{ width: 120 }}
                                        value={filterTo} onChange={setFilterTo}
                                    >
                                        {uniqueToCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <InputNumber
                                        size="small" placeholder="Сумма от" style={{ width: 90 }}
                                        value={filterSumMin} onChange={v => setFilterSumMin(v ?? undefined)}
                                        min={0} controls={false}
                                    />
                                    <InputNumber
                                        size="small" placeholder="Сумма до" style={{ width: 90 }}
                                        value={filterSumMax} onChange={v => setFilterSumMax(v ?? undefined)}
                                        min={0} controls={false}
                                    />
                                    {hasActiveFilters && (
                                        <Button size="small" icon={<ClearOutlined />} onClick={clearFilters} type="link" danger>
                                            Сбросить
                                        </Button>
                                    )}
                                </div>

                                {/* TABLE */}
                                <Table
                                    columns={incomingColumns}
                                    dataSource={filteredOrders}
                                    rowKey="id"
                                    loading={loading}
                                    size="small"
                                    scroll={{ x: 1200 }}
                                    pagination={{ pageSize: 50, size: 'small', showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `Всего: ${t}` }}
                                    style={{ fontSize: 12 }}
                                    onRow={(record) => ({
                                        style: { cursor: 'pointer' },
                                        onDoubleClick: () => showOrderDetail(record),
                                    })}
                                    rowClassName={(record) => {
                                        if (record.status === 'COMPLETED') return 'row-completed';
                                        if (record.status === 'PROBLEM') return 'row-problem';
                                        return '';
                                    }}
                                />
                            </div>
                        ),
                    },
                    {
                        key: 'outgoing',
                        label: <span>Исходящие <Tag style={{ marginLeft: 4, fontSize: 11 }}>{outgoingOrders.length}</Tag></span>,
                        children: (
                            <div>
                                <Table
                                    columns={outgoingColumns}
                                    dataSource={outgoingOrders}
                                    rowKey="id"
                                    loading={outgoingLoading}
                                    size="small"
                                    scroll={{ x: 1000 }}
                                    pagination={{ pageSize: 50, size: 'small', showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: (t) => `Всего: ${t}` }}
                                    onRow={(record) => ({
                                        style: { cursor: 'pointer' },
                                        onDoubleClick: () => showOrderDetail(record),
                                    })}
                                />
                            </div>
                        ),
                    },
                ]}
            />

            {/* ========== INLINE STYLES FOR COMPACT TABLE ========== */}
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
                .ant-table-small .ant-pagination {
                    margin: 8px 0 !important;
                }
            `}</style>

            {/* ========== CREATE ORDER MODAL ========== */}
            <Modal title="Новая заявка" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={() => createForm.submit()} okText="Создать" cancelText="Отмена" width={900} style={{ top: 20 }}>
                <Form form={createForm} layout="vertical" onFinish={handleCreateOrder}>
                    <Row gutter={24}>
                        <Col span={12}>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Маршрут</Title>
                            <Form.Item name="pickupDate" label="Дата погрузки" rules={[{ required: true, message: 'Укажите дату' }]}>
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY HH:mm" showTime={{ format: 'HH:mm' }} placeholder="Дата и время" />
                            </Form.Item>
                            <div style={{ padding: '8px 12px', background: '#f0f5ff', borderRadius: 8, marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#1890ff' }}>📍 Погрузка</div>
                                <Select
                                    placeholder="Выберите адрес" allowClear showSearch optionFilterProp="children" style={{ width: '100%' }}
                                    onChange={(val) => {
                                        if (!val) { setPickupLocation({ city: '', address: '' }); setAppliedTariff(null); }
                                        else {
                                            const loc = locations.find(l => l.id === val);
                                            if (loc) {
                                                setPickupLocation({ city: loc.city || '', address: loc.address, id: loc.id });
                                                if (loc.city && deliveryLocation.city) lookupTariff(loc.city, deliveryLocation.city);
                                            }
                                        }
                                    }}
                                >
                                    {locations.map(l => <Select.Option key={l.id} value={l.id}>{l.name} ({l.address})</Select.Option>)}
                                </Select>
                            </div>
                            <div style={{ padding: '8px 12px', background: '#f6ffed', borderRadius: 8, marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#52c41a' }}>🏁 Выгрузка</div>
                                <Select
                                    placeholder="Выберите адрес" allowClear showSearch optionFilterProp="children" style={{ width: '100%' }}
                                    onChange={(val) => {
                                        if (!val) { setDeliveryLocation({ city: '', address: '' }); setAppliedTariff(null); }
                                        else {
                                            const loc = locations.find(l => l.id === val);
                                            if (loc) {
                                                setDeliveryLocation({ city: loc.city || '', address: loc.address, id: loc.id });
                                                if (pickupLocation.city && loc.city) lookupTariff(pickupLocation.city, loc.city);
                                            }
                                        }
                                    }}
                                >
                                    {locations.map(l => <Select.Option key={l.id} value={l.id}>{l.name} ({l.address})</Select.Option>)}
                                </Select>
                            </div>
                            {intermediatePoints.map((_, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                    <Select placeholder={`Доп. ${i + 1}`} allowClear showSearch optionFilterProp="children" style={{ flex: 1 }}
                                        onChange={(val) => {
                                            const loc = locations.find(l => l.id === val);
                                            const np = [...intermediatePoints];
                                            np[i] = loc ? { city: loc.city || '', address: loc.address, id: loc.id } : { city: '', address: '' };
                                            setIntermediatePoints(np);
                                        }}
                                    >
                                        {locations.map(l => <Select.Option key={l.id} value={l.id}>{l.name}</Select.Option>)}
                                    </Select>
                                    <Button danger icon={<DeleteOutlined />} onClick={() => { const np = [...intermediatePoints]; np.splice(i, 1); setIntermediatePoints(np); }} />
                                </div>
                            ))}
                            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setIntermediatePoints([...intermediatePoints, { city: '', address: '' }])} style={{ width: '100%' }}>
                                Доп. адрес
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
                                        <Select placeholder="Тент, Реф..." allowClear>
                                            {VEHICLE_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="cargoDescription" label="Описание груза" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                                <TextArea rows={2} placeholder="Мебель, 20 коробок..." />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={8}><Form.Item name="cargoWeight" label="Вес (кг)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
                                <Col span={8}><Form.Item name="cargoVolume" label="Объём (м³)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
                                <Col span={8}>
                                    <Form.Item name="customerPrice" label="Сумма ₸"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
                                    {appliedTariff && <div style={{ marginTop: -12, marginBottom: 8, padding: '3px 6px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, fontSize: 11 }}>✅ Тариф ДС №{appliedTariff.agreement?.agreementNumber || '—'}</div>}
                                </Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                                        <Select>
                                            <Select.Option value="FIXED">За рейс</Select.Option>
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
                                        <Checkbox checked={isMarketplace} onChange={e => { setIsMarketplace(e.target.checked); if (e.target.checked) createForm.setFieldsValue({ forwarderId: null }); }}>
                                            На биржу (всем)
                                        </Checkbox>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="requirements" label="Доп. требования" style={{ marginBottom: 0 }}>
                                <TextArea rows={2} placeholder="Ремни, коники..." />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            {/* ========== ASSIGN DRIVER MODAL ========== */}
            <Modal title="Назначить водителя" open={assignModalOpen} onCancel={() => { setAssignModalOpen(false); setSelectedDriverId(null); form.resetFields(); }} onOk={() => form.submit()} okText="Назначить" cancelText="Отмена" confirmLoading={assignLoading}>
                <Form form={form} layout="vertical" onFinish={handleAssign}>
                    <Tabs activeKey={assignType} onChange={(k) => setAssignType(k as any)} items={[
                        {
                            key: 'driver', label: 'Свой водитель',
                            children: (
                                <>
                                    <Form.Item name="driverId" label="Водитель" rules={[{ required: assignType === 'driver', message: 'Выберите' }]}>
                                        <Select placeholder="Выберите водителя" size="large" loading={driversLoading} onChange={handleDriverSelect} value={selectedDriverId}
                                            showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())}
                                            options={drivers.map(d => ({ value: d.id, label: `${d.lastName} ${d.firstName} ${d.middleName || ''}`.trim() }))}
                                        />
                                    </Form.Item>
                                    {selectedDriverId && (
                                        <>
                                            <Form.Item name="driverName" hidden><Input /></Form.Item>
                                            <Form.Item name="driverPhone" label="Телефон"><Input size="large" disabled style={{ backgroundColor: '#f5f5f5' }} /></Form.Item>
                                            <Form.Item name="driverPlate" label="Госномер"><Input size="large" disabled style={{ backgroundColor: '#f5f5f5' }} /></Form.Item>
                                            <Form.Item name="trailerNumber" label="Прицеп"><Input size="large" disabled style={{ backgroundColor: '#f5f5f5' }} placeholder="—" /></Form.Item>
                                        </>
                                    )}
                                </>
                            )
                        },
                        {
                            key: 'partner', label: 'Партнёру',
                            children: (
                                <>
                                    <Form.Item name="partnerId" label="Партнер" rules={[{ required: assignType === 'partner', message: 'Выберите' }]}>
                                        <Select placeholder="Компания-партнер" size="large" loading={partnersLoading} options={partners.map(p => ({ label: p.name, value: p.id }))} />
                                    </Form.Item>
                                    <Form.Item name="price" label="Стоимость (₸)" rules={[{ required: assignType === 'partner', message: 'Укажите' }]}>
                                        <InputNumber style={{ width: '100%' }} size="large" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} parser={v => v!.replace(/\s/g, '')} />
                                    </Form.Item>
                                </>
                            )
                        }
                    ]} />
                </Form>
            </Modal>

            {/* ========== ORDER DETAIL DRAWER ========== */}
            <Drawer title={`Заявка ${selectedOrder?.orderNumber}`} open={detailDrawerOpen} onClose={() => setDetailDrawerOpen(false)} width={500}>
                {selectedOrder && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <Tag color={statusColors[selectedOrder.status]} style={{ fontSize: 13 }}>{statusLabels[selectedOrder.status]}</Tag>
                        </div>

                        <Title level={5}>Заказчик</Title>
                        <Descriptions size="small" column={1}>
                            <Descriptions.Item label="Компания">{selectedOrder.customerCompany?.name || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Контакт">{selectedOrder.customer?.firstName} {selectedOrder.customer?.lastName}</Descriptions.Item>
                            <Descriptions.Item label="Телефон">{selectedOrder.customer?.phone}</Descriptions.Item>
                        </Descriptions>

                        <Title level={5} style={{ marginTop: 16 }}>Груз</Title>
                        <Text>{selectedOrder.cargoDescription}</Text>
                        {selectedOrder.natureOfCargo && <div>Характер: <strong>{selectedOrder.natureOfCargo}</strong></div>}
                        {selectedOrder.cargoWeight && <div>Вес: {selectedOrder.cargoWeight} кг</div>}
                        {selectedOrder.cargoVolume && <div>Объём: {selectedOrder.cargoVolume} м³</div>}
                        {selectedOrder.cargoType && <div>Кузов: <strong>{selectedOrder.cargoType}</strong></div>}
                        {selectedOrder.requirements && <div>Треб.: {selectedOrder.requirements}</div>}
                        {selectedOrder.customerPrice && (
                            <div style={{ marginTop: 8, fontSize: 16 }}>
                                <Text type="success" strong>{selectedOrder.customerPrice.toLocaleString('ru-RU')} ₸</Text>
                            </div>
                        )}

                        <Title level={5} style={{ marginTop: 16 }}>Маршрут</Title>
                        <div><strong>Погрузка:</strong> {selectedOrder.pickupLocation?.name}</div>
                        <div style={{ color: '#666' }}>{selectedOrder.pickupLocation?.address}</div>
                        {selectedOrder.deliveryPoints?.map((dp, i) => (
                            <div key={i} style={{ marginTop: 8 }}>
                                <strong>Выгрузка {i + 1}:</strong> {dp.location.name}
                                <div style={{ color: '#666' }}>{dp.location.address}</div>
                            </div>
                        ))}

                        <Title level={5} style={{ marginTop: 16 }}>Водитель</Title>
                        {selectedOrder.assignedDriverName ? (
                            <Descriptions size="small" column={1}>
                                <Descriptions.Item label="ФИО">{selectedOrder.assignedDriverName}</Descriptions.Item>
                                <Descriptions.Item label="Телефон">{selectedOrder.assignedDriverPhone}</Descriptions.Item>
                                <Descriptions.Item label="Госномер">{selectedOrder.assignedDriverPlate}</Descriptions.Item>
                            </Descriptions>
                        ) : <Tag color="warning">Не назначен</Tag>}

                        <div style={{ marginTop: 24 }}>
                            <Button type="primary" icon={<UserAddOutlined />} onClick={() => { setDetailDrawerOpen(false); openAssignModal(selectedOrder); }} block>
                                {selectedOrder.assignedDriverName ? 'Изменить водителя' : 'Назначить водителя'}
                            </Button>
                            {getNextStatuses(selectedOrder.status).length > 0 && (
                                <Button type="primary" style={{ marginTop: 8 }} onClick={() => { statusForm.resetFields(); setStatusModalOpen(true); }} block>
                                    Изменить статус
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Drawer>

            {/* ========== STATUS MODAL ========== */}
            <Modal title="Изменить статус" open={statusModalOpen} onCancel={() => setStatusModalOpen(false)} onOk={() => statusForm.submit()} okText="Обновить" cancelText="Отмена" confirmLoading={statusLoading}>
                {selectedOrder && (
                    <Form form={statusForm} layout="vertical" onFinish={handleStatusChange}>
                        <div style={{ marginBottom: 16 }}>Текущий: <Tag color={statusColors[selectedOrder.status]}>{statusLabels[selectedOrder.status]}</Tag></div>
                        <Form.Item name="status" label="Новый статус" rules={[{ required: true }]}>
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
