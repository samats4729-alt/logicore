'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Table, Button, Tag, Space, Modal, Form, Input, message, Typography,
    Drawer, Descriptions, Select, Tooltip, Tabs, InputNumber, Row, Col,
    DatePicker, Checkbox, Slider, Alert, Popconfirm, Radio
} from 'antd';
import dayjs from 'dayjs';
import {
    EyeOutlined, UserAddOutlined, CheckCircleOutlined, PlusOutlined,
    EnvironmentOutlined, FlagOutlined, DeleteOutlined, SearchOutlined,
    FilterOutlined, ClearOutlined, FileTextOutlined, CloseCircleOutlined, EditOutlined,
    MailOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';

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
    driverCost?: number;
    createdAt: string;
    routePoints?: { pointType: string; sequence: number; location: { id?: string; name: string; address: string; city?: string } }[];
    customer?: { firstName: string; lastName: string; phone: string; email?: string };
    customerCompany?: { id?: string; name: string; phone?: string; email?: string };
    customerCompanyId?: string;
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedDriverPlate?: string;
    assignedAt?: string;
    subForwarder?: { name: string; email?: string };
    forwarder?: { id?: string; name: string; email?: string };
    partner?: { name: string; email?: string };
    forwarderId?: string;
    isConfirmed?: boolean;
    driverId?: string;
    responsibleManager?: { firstName: string; lastName: string; };
}

// ============================================================
// Component
// ============================================================

export default function CompanyOrdersPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastClickedOrderIdRef = useRef<string | null>(null);

    useEffect(() => {
        return () => {
            if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current);
            }
        };
    }, []);
    const [activeTab, setActiveTab] = useState('incoming');
    const [incomingPage, setIncomingPage] = useState(1);
    const [incomingPageSize, setIncomingPageSize] = useState(20);
    const [outgoingPage, setOutgoingPage] = useState(1);
    const [outgoingPageSize, setOutgoingPageSize] = useState(20);
    const [archivePage, setArchivePage] = useState(1);
    const [archivePageSize, setArchivePageSize] = useState(20);

    // Fetch orders with SWR
    const { data: ordersData, isLoading: loading, mutate: mutateIncoming } = useSWR(
        `/company/orders?page=${incomingPage}&limit=${incomingPageSize}&type=incoming`,
        fetcher
    );
    const orders: Order[] = ordersData?.data || [];
    const totalOrders = ordersData?.total || 0;

    // Outgoing orders
    const { data: outgoingData, isLoading: outgoingLoading, mutate: mutateOutgoing } = useSWR(
        `/company/orders?page=${outgoingPage}&limit=${outgoingPageSize}&type=outgoing`,
        fetcher
    );
    const outgoingOrders: Order[] = outgoingData?.data || [];
    const totalOutgoingOrders = outgoingData?.total || 0;

    // Archive orders
    const { data: archiveData, isLoading: archiveLoading, mutate: mutateArchive } = useSWR(
        `/company/orders?page=${archivePage}&limit=${archivePageSize}&type=archive`,
        fetcher
    );
    const archiveOrders: Order[] = archiveData?.data || [];
    const totalArchiveOrders = archiveData?.total || 0;

    const mutateAll = () => {
        mutateIncoming();
        mutateOutgoing();
        mutateArchive();
    };

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
    const [assignType, setAssignType] = useState<'driver' | 'partner' | 'partner_manual'>('driver');
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();
    const [statusForm] = Form.useForm();

    // Share Power of Attorney modal
    const [sharePoAModalOpen, setSharePoAModalOpen] = useState(false);
    const [sharePoALoading, setSharePoALoading] = useState(false);
    const [shareEmailsList, setShareEmailsList] = useState<{ email: string; checked: boolean; label: string }[]>([]);
    const [customEmailInput, setCustomEmailInput] = useState('');

    const openSharePoAModal = (order: Order) => {
        const list: { email: string; checked: boolean; label: string }[] = [];
        
        if (order.customerCompany?.email) {
            list.push({ email: order.customerCompany.email, checked: true, label: `Компания-заказчик (${order.customerCompany.name})` });
        }
        if (order.customer?.email) {
            list.push({ email: order.customer.email, checked: true, label: `Заказчик (${order.customer.firstName} ${order.customer.lastName})` });
        }
        if (order.forwarder?.email) {
            list.push({ email: order.forwarder.email, checked: true, label: `Экспедитор (${order.forwarder.name})` });
        }
        if (order.subForwarder?.email) {
            list.push({ email: order.subForwarder.email, checked: true, label: `Суб-экспедитор (${order.subForwarder.name})` });
        }
        if (order.partner?.email) {
            list.push({ email: order.partner.email, checked: true, label: `Партнер (${order.partner.name})` });
        }
        
        // Remove duplicates
        const uniqueList: typeof list = [];
        const seenEmails = new Set<string>();
        for (const item of list) {
            if (!seenEmails.has(item.email)) {
                seenEmails.add(item.email);
                uniqueList.push(item);
            }
        }
        
        setShareEmailsList(uniqueList);
        setCustomEmailInput('');
        setSharePoAModalOpen(true);
    };

    const handleSharePoA = async () => {
        const selectedEmails = shareEmailsList.filter(item => item.checked).map(item => item.email);
        if (selectedEmails.length === 0) {
            message.warning('Выберите хотя бы один email для отправки');
            return;
        }

        setSharePoALoading(true);
        try {
            await api.post(`/orders/${selectedOrder?.id}/share-power-of-attorney`, {
                emails: selectedEmails,
            });
            message.success('Доверенность успешно отправлена на выбранные email-адреса');
            setSharePoAModalOpen(false);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка отправки доверенности');
        } finally {
            setSharePoALoading(false);
        }
    };

    const handleAddCustomEmail = () => {
        const email = customEmailInput.trim();
        if (!email) return;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            message.error('Некорректный формат email');
            return;
        }
        
        if (shareEmailsList.some(item => item.email === email)) {
            message.warning('Этот email уже добавлен');
            return;
        }
        
        if (shareEmailsList.length >= 15) {
            message.warning('Максимум 15 получателей');
            return;
        }
        
        setShareEmailsList([
            ...shareEmailsList,
            { email, checked: true, label: `Вручную: ${email}` }
        ]);
        setCustomEmailInput('');
    };

    // Create / Edit order
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [createForm] = Form.useForm();
    const [locations, setLocations] = useState<Location[]>([]);
    const [cargoCategories, setCargoCategories] = useState<any[]>([]);
    const [routePointsState, setRoutePointsState] = useState<Array<LocationState & { pointType: string, expectedDate?: string }>>([
        { city: '', address: '', pointType: 'PICKUP' },
        { city: '', address: '', pointType: 'DELIVERY' }
    ]);
    const [forwarders, setForwarders] = useState<{ id: string; name: string }[]>([]);
    const [isMarketplace, setIsMarketplace] = useState(false);
    const [appliedTariff, setAppliedTariff] = useState<any>(null);
    const [tariffLoading, setTariffLoading] = useState(false);
    const [profileComplete, setProfileComplete] = useState(true);
    const [showCustomerField, setShowCustomerField] = useState(false);
    const [showForwarderField, setShowForwarderField] = useState(true);
    const [creatorRole, setCreatorRole] = useState<'CUSTOMER' | 'FORWARDER'>('CUSTOMER');
    const [editCreatorRole, setEditCreatorRole] = useState<'CUSTOMER' | 'FORWARDER'>('CUSTOMER');

    const handleCreatorRoleChange = (role: 'CUSTOMER' | 'FORWARDER') => {
        setCreatorRole(role);
        setIsMarketplace(false);
        if (role === 'CUSTOMER') {
            setShowCustomerField(false);
            setShowForwarderField(true);
            createForm.setFieldsValue({ customerCompanyId: null, forwarderId: null, driverCost: null });
        } else if (role === 'FORWARDER') {
            setShowCustomerField(true);
            setShowForwarderField(false);
            createForm.setFieldsValue({ customerCompanyId: null, forwarderId: null, driverCost: null });
        }
    };

    const handleEditCreatorRoleChange = (role: 'CUSTOMER' | 'FORWARDER') => {
        setEditCreatorRole(role);
        setIsMarketplace(false);
        if (role === 'CUSTOMER') {
            setShowCustomerField(false);
            setShowForwarderField(true);
            editForm.setFieldsValue({ customerCompanyId: null, forwarderId: null, driverCost: null });
        } else if (role === 'FORWARDER') {
            setShowCustomerField(true);
            setShowForwarderField(false);
            editForm.setFieldsValue({ customerCompanyId: null, forwarderId: null, driverCost: null });
        }
    };

    // Quick add partner
    const [quickPartnerModalOpen, setQuickPartnerModalOpen] = useState(false);
    const [quickPartnerForm] = Form.useForm();
    const [quickPartnerLoading, setQuickPartnerLoading] = useState(false);

    const handleCreateQuickPartner = async (values: any) => {
        setQuickPartnerLoading(true);
        try {
            await api.post('/external-companies', {
                ...values,
                isCustomer: false,
                isCarrier: true,
                type: 'FORWARDER'
            });
            message.success('Контрагент успешно добавлен');
            setQuickPartnerModalOpen(false);
            quickPartnerForm.resetFields();
            await fetchPartners();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка при создании контрагента');
        } finally {
            setQuickPartnerLoading(false);
        }
    };

    const fetchDrivers = async () => {
        setDriversLoading(true);
        try {
            const response = await api.get('/company/drivers');
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
            const partnersList = partnersRes.data.filter((p: any) => p.isCarrier);
            const externalList = externalRes.data
                .filter((e: any) => e.isCarrier)
                .map((e: any) => ({
                    id: e.id,
                    name: e.name,
                }));
            const combined = [...partnersList, ...externalList];
            setPartners(combined);
            setForwarders(combined);
        } catch { } finally {
            setPartnersLoading(false);
        }
    };

    const fetchForwarders = async () => {};

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch { }
    };

    const fetchCargoTypes = async () => {
        try {
            const response = await api.get('/cargo-types');
            setCargoCategories(response.data);
        } catch { }
    };

    // Check profile completeness and load data on mount
    useEffect(() => {
        api.get('/company/profile-status').then(res => {
            setProfileComplete(res.data.isComplete);
        }).catch(() => {});
        fetchLocations();
        fetchCargoTypes();
        fetchPartners();
    }, []);

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
            setRoutePointsState([
                 { city: '', address: '', pointType: 'PICKUP' },
                 { city: '', address: '', pointType: 'DELIVERY' }
            ]);
            setIsMarketplace(false);
            setAppliedTariff(null);
            setCreatorRole('CUSTOMER');
            setShowCustomerField(false);
            setShowForwarderField(true);
        }
    }, [createModalOpen]);

    // =================== UNIQUE VALUES FOR FILTERS ===================
    const uniqueIncomingCompanies = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => { if (o.customerCompany?.name) set.add(o.customerCompany.name); });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueOutgoingCompanies = useMemo(() => {
        const set = new Set<string>();
        outgoingOrders.forEach(o => { if (o.forwarder?.name) set.add(o.forwarder.name); });
        return Array.from(set).sort();
    }, [outgoingOrders]);

    const uniqueArchiveCompanies = useMemo(() => {
        const set = new Set<string>();
        archiveOrders.forEach(o => {
            if (o.customerCompany?.name) set.add(o.customerCompany.name);
            if (o.forwarder?.name) set.add(o.forwarder.name);
        });
        return Array.from(set).sort();
    }, [archiveOrders]);

    const uniqueIncomingDrivers = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => { if (o.assignedDriverName) set.add(o.assignedDriverName); });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueOutgoingDrivers = useMemo(() => {
        const set = new Set<string>();
        outgoingOrders.forEach(o => { if (o.assignedDriverName) set.add(o.assignedDriverName); });
        return Array.from(set).sort();
    }, [outgoingOrders]);

    const uniqueArchiveDrivers = useMemo(() => {
        const set = new Set<string>();
        archiveOrders.forEach(o => { if (o.assignedDriverName) set.add(o.assignedDriverName); });
        return Array.from(set).sort();
    }, [archiveOrders]);

    const uniqueIncomingStatuses = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => set.add(o.status));
        return Array.from(set);
    }, [orders]);

    const uniqueOutgoingStatuses = useMemo(() => {
        const set = new Set<string>();
        outgoingOrders.forEach(o => set.add(o.status));
        return Array.from(set);
    }, [outgoingOrders]);

    const uniqueIncomingFromCities = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => {
            const city = extractCity(o, 'pickup');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueOutgoingFromCities = useMemo(() => {
        const set = new Set<string>();
        outgoingOrders.forEach(o => {
            const city = extractCity(o, 'pickup');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [outgoingOrders]);

    const uniqueArchiveFromCities = useMemo(() => {
        const set = new Set<string>();
        archiveOrders.forEach(o => {
            const city = extractCity(o, 'pickup');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [archiveOrders]);

    const uniqueIncomingToCities = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => {
            const city = extractCity(o, 'delivery');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueOutgoingToCities = useMemo(() => {
        const set = new Set<string>();
        outgoingOrders.forEach(o => {
            const city = extractCity(o, 'delivery');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [outgoingOrders]);

    const uniqueArchiveToCities = useMemo(() => {
        const set = new Set<string>();
        archiveOrders.forEach(o => {
            const city = extractCity(o, 'delivery');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [archiveOrders]);

    // =================== FILTERED DATA ===================
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            if (o.status === 'CANCELLED') return false;
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

    const filteredOutgoingOrders = useMemo(() => {
        return outgoingOrders.filter(o => {
            if (o.status === 'CANCELLED') return false;
            if (filterCompany && o.forwarder?.name !== filterCompany) return false;
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
    }, [outgoingOrders, filterCompany, filterDriver, filterStatus, filterFrom, filterTo, filterSumMin, filterSumMax]);

    const filteredArchiveOrders = useMemo(() => {
        return archiveOrders.filter(o => {
            if (filterCompany && o.customerCompany?.name !== filterCompany && o.forwarder?.name !== filterCompany) return false;
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
    }, [archiveOrders, filterCompany, filterDriver, filterStatus, filterFrom, filterTo, filterSumMin, filterSumMax]);

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

    useEffect(() => {
        clearFilters();
    }, [activeTab]);

    // =================== HELPER ===================
    function extractCity(order: Order, type: 'pickup' | 'delivery'): string {
        if (type === 'pickup') {
            const pt = order.routePoints?.find(p => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
            const loc = pt?.location;
            if (loc?.city) return loc.city;
            if (loc?.address) {
                const m = loc.address.match(/г\.\s*([^,]+)/);
                if (m?.[1]) return m[1].trim();
            }
            return loc?.name || '';
        } else {
            const pts = order.routePoints?.filter(p => p.pointType === 'DELIVERY') || [];
            const pt = pts.length > 0 ? pts[pts.length - 1] : null;
            const loc = pt?.location;
            if (loc?.city) return loc.city;
            if (loc?.address) {
                const m = loc.address.match(/г\.\s*([^,]+)/);
                if (m?.[1]) return m[1].trim();
            }
            return loc?.name || '';
        }
    }

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

    // =================== INCOMING HANDLERS ===================

    const showOrderDetail = (order: Order) => { setSelectedOrder(order); setDetailDrawerOpen(true); };

    const openEditModal = (order: Order) => {
        setSelectedOrder(order);
        const hasExternalCustomer = !!(order.customerCompanyId && order.customerCompanyId !== user?.companyId);
        
        let currentRole: 'CUSTOMER' | 'FORWARDER' = 'CUSTOMER';
        if (hasExternalCustomer) {
            currentRole = 'FORWARDER';
        } else {
            currentRole = 'CUSTOMER';
        }
        setEditCreatorRole(currentRole);

        const isFwdAssigned = !!(order.forwarderId && order.forwarderId !== user?.companyId);
        const isMkt = !order.forwarderId && (!!order.driverCost || order.status === 'PENDING');

        setShowCustomerField(hasExternalCustomer);
        if (currentRole === 'CUSTOMER' && !isFwdAssigned && !isMkt) {
            setShowForwarderField(true);
            setIsMarketplace(false);
        } else {
            setShowForwarderField(isFwdAssigned);
            setIsMarketplace(isMkt);
        }
        editForm.setFieldsValue({
            cargoDescription: order.cargoDescription,
            cargoWeight: order.cargoWeight,
            cargoVolume: order.cargoVolume,
            cargoType: order.cargoType,
            natureOfCargo: order.natureOfCargo,
            requirements: order.requirements,
            customerPrice: order.customerPrice,
            customerPriceType: order.customerPriceType || 'FIXED',
            driverCost: order.driverCost,
            pickupDate: (order.routePoints?.find(p => p.pointType === 'PICKUP') as any)?.expectedDate ? dayjs((order.routePoints?.find(p => p.pointType === 'PICKUP') as any)?.expectedDate) : undefined,
            forwarderId: order.forwarderId || order.forwarder?.id || undefined,
            customerCompanyId: order.customerCompanyId || order.customerCompany?.id || undefined,
        });
        if (order.routePoints && order.routePoints.length > 0) {
             setRoutePointsState(order.routePoints.map(p => ({
                 id: p.location.id,
                 city: p.location.city || '',
                 address: p.location.address,
                 pointType: p.pointType
             })));
        } else {
             setRoutePointsState([
                 { city: '', address: '', pointType: 'PICKUP' },
                 { city: '', address: '', pointType: 'DELIVERY' }
             ]);
        }
        const fwdId = order.forwarderId || order.forwarder?.id;
        if (fwdId && order.forwarder?.name && !forwarders.some(f => f.id === fwdId)) {
            setForwarders(prev => [...prev, { id: fwdId, name: order.forwarder!.name }]);
        }
        setEditModalOpen(true);
    };

    const handleEditOrder = async (values: any) => {
        if (!selectedOrder) return;
        try {
            const getLocId = async (loc: LocationState) => {
                if (loc.id) return loc.id;
                const res = await api.post('/locations', { name: `${loc.city}, ${loc.address}`, address: `${loc.city}, ${loc.address}`, latitude: 0, longitude: 0, city: loc.city || '' });
                return res.data.id;
            };
            const updateData: any = { ...values };
            const routePoints = [];
            for (let i = 0; i < routePointsState.length; i++) {
                const p = routePointsState[i];
                if (!p.city && !p.address && !p.id) continue;
                const locId = await getLocId(p);
                routePoints.push({
                    locationId: locId,
                    pointType: p.pointType,
                    sequence: routePoints.length + 1,
                    expectedDate: p.pointType === 'PICKUP' ? values.pickupDate : undefined
                });
            }
            
            delete updateData.pickupDate;
            delete updateData.isMarketplace;
            if (routePoints.length > 0) {
                updateData.routePoints = routePoints;
            }

            if (editCreatorRole === 'CUSTOMER') {
                updateData.customerCompanyId = user?.companyId;
                if (!showForwarderField) {
                    updateData.forwarderId = null;
                    if (!isMarketplace) {
                        updateData.driverCost = null;
                    }
                }
            } else { // FORWARDER
                if (!showForwarderField) {
                    updateData.forwarderId = user?.companyId;
                    updateData.driverCost = null;
                }
            }

            await api.put(`/orders/${selectedOrder.id}`, updateData);
            message.success('Заявка обновлена');
            mutateAll();
            setEditModalOpen(false);
            setDetailDrawerOpen(false);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка обновления');
        }
    };

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
                await api.put(`/company/orders/${selectedOrder.id}/assign-driver`, { ...values, driverId: selectedDriverId });
                message.success('Водитель назначен');
            } else if (assignType === 'partner_manual') {
                await api.put(`/company/orders/${selectedOrder.id}/assign-driver`, {
                    partnerId: values.partnerId,
                    assignedDriverName: values.assignedDriverName,
                    assignedDriverPhone: values.assignedDriverPhone,
                    assignedDriverPlate: values.assignedDriverPlate,
                    assignedDriverTrailer: values.assignedDriverTrailer,
                });
                message.success('Водитель контрагента назначен');
            } else {
                await api.put(`/company/orders/${selectedOrder.id}/assign-forwarder`, { partnerId: values.partnerId, price: values.price });
                message.success('Заявка передана партнеру');
            }
            mutateAll();
            setAssignModalOpen(false); form.resetFields(); setSelectedDriverId(null);
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
            await api.put(`/company/orders/${selectedOrder.id}/status`, values);
            message.success('Статус обновлён');
            mutateAll();
            setStatusModalOpen(false); setDetailDrawerOpen(false);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        } finally { setStatusLoading(false); }
    };

    const handleAccept = async (orderId: string) => {
        try {
            await api.put(`/company/orders/${orderId}/accept`);
            message.success('Заявка принята в работу');
            mutateAll();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка принятия заявки');
        }
    };

    const handleReject = async (orderId: string) => {
        Modal.confirm({
            title: 'Отклонить заявку?',
            content: 'Вы уверены, что хотите отклонить эту заявку? Она будет возвращена заказчику.',
            okText: 'Да, отклонить',
            cancelText: 'Нет',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api.put(`/company/orders/${orderId}/reject`);
                    message.success('Заявка отклонена');
                    mutateAll();
                } catch (error: any) {
                    message.error(error.response?.data?.message || 'Ошибка отклонения заявки');
                }
            }
        });
    };

    // =================== CREATE ORDER ===================

    const handleCreateOrder = async (values: any) => {
        try {
            const getLocId = async (loc: LocationState) => {
                if (loc.id) return loc.id;
                const res = await api.post('/locations', { name: `${loc.city}, ${loc.address}`, address: `${loc.city}, ${loc.address}`, latitude: 0, longitude: 0, city: loc.city || '' });
                return res.data.id;
            };
            const routePoints = [];
            for (let i = 0; i < routePointsState.length; i++) {
                const p = routePointsState[i];
                if (!p.city && !p.address && !p.id) {
                    if (p.pointType === 'PICKUP') { message.error('Заполните адрес погрузки'); return; }
                    if (p.pointType === 'DELIVERY') { message.error('Заполните адрес выгрузки'); return; }
                    continue;
                }
                const locId = await getLocId(p);
                routePoints.push({
                    locationId: locId,
                    pointType: p.pointType,
                    sequence: routePoints.length + 1,
                    expectedDate: p.pointType === 'PICKUP' ? values.pickupDate : undefined
                });
            }
            if (routePoints.length < 2) {
                message.error('Укажите минимум 2 точки маршрута');
                return;
            }

            const ov = { ...values };
            delete ov.pickupDate;
            delete ov.isMarketplace;

            if (creatorRole === 'CUSTOMER') {
                ov.customerCompanyId = user?.companyId;
                if (!showForwarderField) {
                    ov.forwarderId = null;
                    if (!isMarketplace) {
                        ov.driverCost = null;
                    }
                }
            } else { // FORWARDER
                if (!showForwarderField) {
                    ov.forwarderId = user?.companyId;
                    ov.driverCost = null;
                }
            }

            await api.post('/orders', { ...ov, routePoints, customerId: user?.id, appliedTariffId: appliedTariff?.id || undefined });
            message.success('Заявка создана');
            mutateAll();
            
            // Автоматически переключаемся на нужную вкладку, чтобы пользователь сразу увидел созданную заявку
            if (ov.customerCompanyId && ov.customerCompanyId !== user?.companyId) {
                setActiveTab('incoming');
            } else {
                setActiveTab('outgoing');
            }

            setCreateModalOpen(false); createForm.resetFields();
        } catch (error: any) { message.error(error.response?.data?.message || 'Ошибка создания'); }
    };

    // =================== COLUMNS ===================

    const columns = [
        {
            title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 60,
            render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span>,
        },
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80,
            render: (d: string) => <span style={{ fontSize: 11, color: '#666' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>,
        },
        {
            title: 'Заказчик', key: 'company', width: 130, ellipsis: true,
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.customerCompany?.name || '—'}</span>,
        },
        {
            title: 'Груз', key: 'cargo', ellipsis: true, width: 130,
            render: (_: any, r: Order) => {
                const parts = [];
                if (r.natureOfCargo) parts.push(r.natureOfCargo);
                if (r.cargoDescription) parts.push(r.cargoDescription);
                return <span style={{ fontSize: 12 }}>{parts.join(' / ') || '—'}</span>;
            }
        },
        {
            title: 'Откуда', key: 'from', width: 110, ellipsis: true,
            render: (_: any, r: Order) => <span style={{ fontSize: 12, fontWeight: 500 }}>{extractCity(r, 'pickup') || '—'}</span>,
        },
        {
            title: 'Куда', key: 'to', width: 110, ellipsis: true,
            render: (_: any, r: Order) => <span style={{ fontSize: 12, fontWeight: 500 }}>{extractCity(r, 'delivery') || '—'}</span>,
        },
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 100,
            render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, margin: 0, lineHeight: '18px' }}>{statusLabels[s] || s}</Tag>,
        },
        {
            title: 'Сумма ₸', key: 'price', width: 90, align: 'right' as const,
            render: (_: any, r: Order) => {
                const isExecutor = r.forwarderId === user?.companyId;
                const price = (isExecutor && r.driverCost) ? r.driverCost : r.customerPrice;
                return price ? <span style={{ fontSize: 12, fontWeight: 600 }}>{price.toLocaleString('ru-RU')}</span> : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: '', key: 'actions', width: 120, fixed: 'right' as const,
            render: (_: any, r: Order) => (
                <Space size={4}>
                    <Tooltip title="Подробнее"><Button size="small" icon={<EyeOutlined />} onClick={() => showOrderDetail(r)} style={{ fontSize: 12 }} /></Tooltip>
                    <Tooltip title="Редактировать"><Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)} /></Tooltip>
                </Space>
            ),
        },
    ];

    const outgoingColumns = [
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 60, render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span> },
        { title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80, render: (d: string) => <span style={{ fontSize: 11, color: '#666' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span> },
        {
            title: 'Груз', key: 'cargo', ellipsis: true, width: 140,
            render: (_: any, r: Order) => {
                const parts = [];
                if (r.natureOfCargo) parts.push(r.natureOfCargo);
                if (r.cargoDescription) parts.push(r.cargoDescription);
                return <span style={{ fontSize: 12 }}>{parts.join(' / ') || '—'}</span>;
            }
        },
        {
            title: 'Откуда', key: 'from', width: 110,
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{extractCity(r, 'pickup') || '—'}</span>,
        },
        {
            title: 'Куда', key: 'to', width: 110,
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{extractCity(r, 'delivery') || '—'}</span>,
        },
        { title: 'Статус', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <Tag color={statusColors[s] || 'default'} style={{ fontSize: 11, margin: 0 }}>{statusLabels[s] || s}</Tag> },
        {
            title: 'Ответств.', key: 'manager', width: 110, ellipsis: true,
            render: (_: any, r: Order) => r.responsibleManager 
                ? <span style={{ fontSize: 12 }}>{r.responsibleManager.firstName} {r.responsibleManager.lastName}</span> 
                : <span style={{ fontSize: 12, color: '#999' }}>—</span>,
        },
        { title: 'Экспедитор', key: 'fwd', width: 120, ellipsis: true, render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.forwarder?.name || '—'}</span> },
        { title: 'Водитель', key: 'drv', width: 110, render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.assignedDriverName || '—'}</span> },
        {
            title: 'Сумма ₸', key: 'price', width: 90, align: 'right' as const,
            render: (_: any, r: Order) => {
                const isClient = r.customerCompanyId === user?.companyId;
                if (isClient) {
                    return r.customerPrice ? <span style={{ fontSize: 12, fontWeight: 600 }}>{r.customerPrice.toLocaleString('ru-RU')}</span> : '—';
                }
                // If we are the subcontractor / middleman
                if (r.driverCost) {
                    return (
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#3f8600' }}>{r.customerPrice?.toLocaleString('ru-RU')}</span>
                            <div style={{ fontSize: 10, color: '#cf1322', marginTop: -2 }}>{r.driverCost.toLocaleString('ru-RU')}</div>
                        </div>
                    );
                }
                return r.customerPrice ? <span style={{ fontSize: 12, fontWeight: 600 }}>{r.customerPrice.toLocaleString('ru-RU')}</span> : '—';
            }
        },
        { title: '', key: 'actions', width: 80, render: (_: any, r: Order) => (
            <Space size={4}>
                <Button size="small" icon={<EyeOutlined />} onClick={() => showOrderDetail(r)} />
                <Tooltip title="Редактировать"><Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)} /></Tooltip>
            </Space>
        ) },
    ];

    const archiveColumns = [
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 60, render: (t: string) => <span style={{ fontWeight: 600, fontSize: 12 }}>{t}</span> },
        { title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80, render: (d: string) => <span style={{ fontSize: 11, color: '#666' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span> },
        { title: 'Заказчик', key: 'company', width: 130, ellipsis: true, render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.customerCompany?.name || '—'}</span> },
        {
            title: 'Груз', key: 'cargo', ellipsis: true, width: 140,
            render: (_: any, r: Order) => {
                const parts = [];
                if (r.natureOfCargo) parts.push(r.natureOfCargo);
                if (r.cargoDescription) parts.push(r.cargoDescription);
                return <span style={{ fontSize: 12 }}>{parts.join(' / ') || '—'}</span>;
            }
        },
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
        {
            title: 'Сумма ₸', key: 'price', width: 90, align: 'right' as const,
            render: (_: any, r: Order) => {
                const price = r.customerPrice;
                return price ? <span style={{ fontSize: 12, fontWeight: 600 }}>{price.toLocaleString('ru-RU')}</span> : '—';
            }
        },
        { title: '', key: 'actions', width: 60, render: (_: any, r: Order) => (
            <Space size={4}>
                <Tooltip title="Подробнее"><Button size="small" icon={<EyeOutlined />} onClick={() => showOrderDetail(r)} style={{ fontSize: 12 }} /></Tooltip>
            </Space>
        ) },
    ];

    // =================== RENDER ===================

    return (
        <div style={{ height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Title level={4} style={{ margin: 0 }}>Заявки</Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setShowCustomerField(false); setShowForwarderField(true); setCreateModalOpen(true); }} disabled={!profileComplete}>
                    Новая заявка
                </Button>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                size="small"
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
                                        {uniqueIncomingCompanies.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Водитель" style={{ width: 140 }}
                                        value={filterDriver} onChange={setFilterDriver}
                                    >
                                        {uniqueIncomingDrivers.map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear
                                        placeholder="Статус" style={{ width: 120 }}
                                        value={filterStatus} onChange={setFilterStatus}
                                    >
                                        {uniqueIncomingStatuses.map(s => <Select.Option key={s} value={s}>{statusLabels[s] || s}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Откуда" style={{ width: 120 }}
                                        value={filterFrom} onChange={setFilterFrom}
                                    >
                                        {uniqueIncomingFromCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Куда" style={{ width: 120 }}
                                        value={filterTo} onChange={setFilterTo}
                                    >
                                        {uniqueIncomingToCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
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
                                    columns={columns}
                                    dataSource={filteredOrders}
                                    rowKey="id"
                                    loading={loading}
                                    size="small"
                                    scroll={{ x: 1200 }}
                                    pagination={{
                                        current: incomingPage,
                                        pageSize: incomingPageSize,
                                        total: totalOrders,
                                        onChange: (p, ps) => { setIncomingPage(p); setIncomingPageSize(ps); },
                                        showSizeChanger: true,
                                        pageSizeOptions: ['20', '50', '100'],
                                    }}
                                    style={{ fontSize: 12 }}
                                    onRow={(record) => ({
                                        style: { cursor: 'pointer' },
                                        onClick: () => {
                                            if (clickTimeoutRef.current && lastClickedOrderIdRef.current === record.id) {
                                                clearTimeout(clickTimeoutRef.current);
                                                clickTimeoutRef.current = null;
                                                lastClickedOrderIdRef.current = null;
                                                router.push(`/company/orders/${record.id}`);
                                            } else {
                                                if (clickTimeoutRef.current) {
                                                    clearTimeout(clickTimeoutRef.current);
                                                }
                                                lastClickedOrderIdRef.current = record.id;
                                                clickTimeoutRef.current = setTimeout(() => {
                                                    setSelectedOrder(record);
                                                    setDetailDrawerOpen(true);
                                                    clickTimeoutRef.current = null;
                                                    lastClickedOrderIdRef.current = null;
                                                }, 250);
                                            }
                                        }
                                    })}
                                    rowClassName={(record) => {
                                        if (record.status === 'COMPLETED') return 'row-completed';
                                        if (record.status === 'PROBLEM') return 'row-problem';
                                        if (record.status === 'CANCELLED') return 'row-cancelled';
                                        return '';
                                    }}
                                />
                            </div>
                        ),
                    },
                    {
                        key: 'outgoing',
                        label: <span>Исходящие <Tag style={{ marginLeft: 4, fontSize: 11 }}>{filteredOutgoingOrders.length}{hasActiveFilters ? `/${outgoingOrders.length}` : ''}</Tag></span>,
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
                                        placeholder="Экспедитор" style={{ width: 150 }}
                                        value={filterCompany} onChange={setFilterCompany}
                                    >
                                        {uniqueOutgoingCompanies.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Водитель" style={{ width: 140 }}
                                        value={filterDriver} onChange={setFilterDriver}
                                    >
                                        {uniqueOutgoingDrivers.map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear
                                        placeholder="Статус" style={{ width: 120 }}
                                        value={filterStatus} onChange={setFilterStatus}
                                    >
                                        {uniqueOutgoingStatuses.map(s => <Select.Option key={s} value={s}>{statusLabels[s] || s}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Откуда" style={{ width: 120 }}
                                        value={filterFrom} onChange={setFilterFrom}
                                    >
                                        {uniqueOutgoingFromCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Куда" style={{ width: 120 }}
                                        value={filterTo} onChange={setFilterTo}
                                    >
                                        {uniqueOutgoingToCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
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
                                    columns={outgoingColumns}
                                    dataSource={filteredOutgoingOrders}
                                    rowKey="id"
                                    loading={outgoingLoading}
                                    size="small"
                                    scroll={{ x: 1000 }}
                                    pagination={{
                                        current: outgoingPage,
                                        pageSize: outgoingPageSize,
                                        total: totalOutgoingOrders,
                                        onChange: (p, ps) => { setOutgoingPage(p); setOutgoingPageSize(ps); },
                                        showSizeChanger: true,
                                        pageSizeOptions: ['20', '50', '100'],
                                        size: 'small',
                                        showTotal: (t) => `Всего: ${t}`
                                    }}
                                    onRow={(record) => ({
                                        style: { cursor: 'pointer' },
                                        onClick: () => {
                                            if (clickTimeoutRef.current && lastClickedOrderIdRef.current === record.id) {
                                                clearTimeout(clickTimeoutRef.current);
                                                clickTimeoutRef.current = null;
                                                lastClickedOrderIdRef.current = null;
                                                router.push(`/company/orders/${record.id}`);
                                            } else {
                                                if (clickTimeoutRef.current) {
                                                    clearTimeout(clickTimeoutRef.current);
                                                }
                                                lastClickedOrderIdRef.current = record.id;
                                                clickTimeoutRef.current = setTimeout(() => {
                                                    setSelectedOrder(record);
                                                    setDetailDrawerOpen(true);
                                                    clickTimeoutRef.current = null;
                                                    lastClickedOrderIdRef.current = null;
                                                }, 250);
                                            }
                                        }
                                    })}
                                    rowClassName={(record) => {
                                        if (record.status === 'COMPLETED') return 'row-completed';
                                        if (record.status === 'PROBLEM') return 'row-problem';
                                        if (record.status === 'CANCELLED') return 'row-cancelled';
                                        return '';
                                    }}
                                />
                            </div>
                        ),
                    },
                    {
                        key: 'archive',
                        label: <span>Архив <Tag style={{ marginLeft: 4, fontSize: 11 }}>{filteredArchiveOrders.length}{hasActiveFilters ? `/${archiveOrders.length}` : ''}</Tag></span>,
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
                                        placeholder="Контрагент" style={{ width: 150 }}
                                        value={filterCompany} onChange={setFilterCompany}
                                    >
                                        {uniqueArchiveCompanies.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Водитель" style={{ width: 140 }}
                                        value={filterDriver} onChange={setFilterDriver}
                                    >
                                        {uniqueArchiveDrivers.map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Откуда" style={{ width: 120 }}
                                        value={filterFrom} onChange={setFilterFrom}
                                    >
                                        {uniqueArchiveFromCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Куда" style={{ width: 120 }}
                                        value={filterTo} onChange={setFilterTo}
                                    >
                                        {uniqueArchiveToCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
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
                                    columns={archiveColumns}
                                    dataSource={filteredArchiveOrders}
                                    rowKey="id"
                                    loading={archiveLoading}
                                    size="small"
                                    scroll={{ x: 1000 }}
                                    pagination={{
                                        current: archivePage,
                                        pageSize: archivePageSize,
                                        total: totalArchiveOrders,
                                        onChange: (p, ps) => { setArchivePage(p); setArchivePageSize(ps); },
                                        showSizeChanger: true,
                                        pageSizeOptions: ['20', '50', '100'],
                                        size: 'small',
                                        showTotal: (t) => `Всего: ${t}`
                                    }}
                                    onRow={(record) => ({
                                        style: { cursor: 'pointer' },
                                        onClick: () => {
                                            if (clickTimeoutRef.current && lastClickedOrderIdRef.current === record.id) {
                                                clearTimeout(clickTimeoutRef.current);
                                                clickTimeoutRef.current = null;
                                                lastClickedOrderIdRef.current = null;
                                                router.push(`/company/orders/${record.id}`);
                                            } else {
                                                if (clickTimeoutRef.current) {
                                                    clearTimeout(clickTimeoutRef.current);
                                                }
                                                lastClickedOrderIdRef.current = record.id;
                                                clickTimeoutRef.current = setTimeout(() => {
                                                    setSelectedOrder(record);
                                                    setDetailDrawerOpen(true);
                                                    clickTimeoutRef.current = null;
                                                    lastClickedOrderIdRef.current = null;
                                                }, 250);
                                            }
                                        }
                                    })}
                                    rowClassName={() => 'row-cancelled'}
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
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td {
                    background: #fafafa !important;
                    color: #bbbbbb !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td span,
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td div,
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td a {
                    color: #bbbbbb !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td .ant-tag {
                    background: #f5f5f5 !important;
                    color: #bbbbbb !important;
                    border-color: #d9d9d9 !important;
                }
                .ant-table-small .ant-pagination {
                    margin: 8px 0 !important;
                }
            `}</style>

            {/* ========== CREATE ORDER MODAL ========== */}
            <Modal title="Новая заявка" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={() => createForm.submit()} okText="Создать" cancelText="Отмена" width={900} style={{ top: 20 }}>
                <Form form={createForm} layout="vertical" onFinish={handleCreateOrder}>
                    <div style={{ marginBottom: 20, background: '#fafafa', padding: '12px 16px', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13, color: '#333' }}>Ваша роль в этой сделке:</div>
                        <Radio.Group 
                            value={creatorRole} 
                            onChange={e => handleCreatorRoleChange(e.target.value)}
                            optionType="button"
                            buttonStyle="solid"
                            style={{ width: '100%', display: 'flex' }}
                        >
                            <Radio.Button value="CUSTOMER" style={{ flex: 1, textAlign: 'center' }}>Заказчик</Radio.Button>
                            <Radio.Button value="FORWARDER" style={{ flex: 1, textAlign: 'center' }}>Экспедитор</Radio.Button>
                        </Radio.Group>
                    </div>
                    <Row gutter={24}>
                        <Col span={12}>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Маршрут</Title>
                            <Form.Item name="pickupDate" label="Дата погрузки" rules={[{ required: true, message: 'Укажите дату' }]}>
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY HH:mm" showTime={{ format: 'HH:mm' }} placeholder="Дата и время" />
                            </Form.Item>
                            {routePointsState.map((pt, i) => (
                                <div key={i} style={{ padding: '8px 12px', background: pt.pointType === 'DELIVERY' ? '#f6ffed' : '#f0f5ff', borderRadius: 8, marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                         <Select value={pt.pointType} onChange={val => { const newPts = [...routePointsState]; newPts[i].pointType = val; setRoutePointsState(newPts); }} size="small" style={{ width: 140, fontWeight: 600 }} variant="borderless">
                                              <Select.Option value="PICKUP"><EnvironmentOutlined style={{ color: '#1890ff', marginRight: 4 }}/> Погрузка</Select.Option>
                                              <Select.Option value="ADDITIONAL_PICKUP"><EnvironmentOutlined style={{ color: '#1890ff', marginRight: 4 }}/> Доп. погрузка</Select.Option>
                                              <Select.Option value="DELIVERY"><FlagOutlined style={{ color: '#52c41a', marginRight: 4 }}/> Выгрузка</Select.Option>
                                         </Select>
                                         <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => { const newPts = [...routePointsState]; newPts.splice(i, 1); setRoutePointsState(newPts); }} />
                                    </div>
                                    <Select
                                        placeholder="Выберите адрес" allowClear showSearch optionFilterProp="children" style={{ width: '100%' }}
                                        value={pt.id || undefined}
                                        onChange={(val) => {
                                            const newPts = [...routePointsState];
                                            if (!val) { newPts[i] = { ...newPts[i], city: '', address: '', id: undefined }; }
                                            else {
                                                const loc = locations.find(l => l.id === val);
                                                if (loc) {
                                                    newPts[i] = { ...newPts[i], city: loc.city || '', address: loc.address, id: loc.id };
                                                    // Trigger tariff lookup if we have at least one pickup and delivery city
                                                    const firstPickup = newPts.find(p => p.pointType === 'PICKUP');
                                                    const lastDelivery = [...newPts].reverse().find(p => p.pointType === 'DELIVERY');
                                                    if (firstPickup?.city && lastDelivery?.city) {
                                                        lookupTariff(firstPickup.city, lastDelivery.city);
                                                    } else {
                                                        setAppliedTariff(null);
                                                    }
                                                }
                                            }
                                            setRoutePointsState(newPts);
                                        }}
                                    >
                                        {locations.map(l => <Select.Option key={l.id} value={l.id}>{l.name} ({l.address})</Select.Option>)}
                                    </Select>
                                </div>
                            ))}
                            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setRoutePointsState([...routePointsState, { city: '', address: '', pointType: 'ADDITIONAL_PICKUP' }])} style={{ width: '100%', marginBottom: 12 }}>
                                Добавить точку
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
                                        <Select 
                                            placeholder="Тент, Реф..." 
                                            allowClear
                                            showSearch
                                            optionFilterProp="children"
                                            filterOption={(input, option) =>
                                                (option?.children as unknown as string ?? '').toLowerCase().includes(input.toLowerCase())
                                            }
                                        >
                                            {VEHICLE_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="cargoDescription" label="Описание груза" style={{ marginBottom: 12 }}>
                                <TextArea rows={2} placeholder="Мебель, 20 коробок..." />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={12}><Form.Item name="cargoWeight" label="Вес (кг)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
                                <Col span={12}><Form.Item name="cargoVolume" label="Объём (м³)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="customerPrice" label="Сумма ₸"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
                                    {appliedTariff && <div style={{ marginTop: -12, marginBottom: 8, padding: '3px 6px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, fontSize: 11 }}>✅ Тариф ДС №{appliedTariff.agreement?.agreementNumber || '—'}</div>}
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                                        <Select style={{ width: '100%' }}>
                                            <Select.Option value="FIXED">За рейс</Select.Option>
                                            <Select.Option value="PER_KM">За км</Select.Option>
                                            <Select.Option value="PER_TON">За тонну</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            {creatorRole === 'CUSTOMER' && (
                                <Row style={{ marginBottom: 12 }}>
                                    <Col span={12}>
                                        <Checkbox 
                                            checked={isMarketplace} 
                                            onChange={e => {
                                                const val = e.target.checked;
                                                setIsMarketplace(val);
                                                if (val) {
                                                    setShowForwarderField(false);
                                                    createForm.setFieldsValue({ forwarderId: null });
                                                } else {
                                                    setShowForwarderField(true);
                                                    createForm.setFieldsValue({ driverCost: null });
                                                }
                                            }}
                                        >
                                            Отправить на биржу
                                        </Checkbox>
                                    </Col>
                                    <Col span={12}>
                                        <Checkbox 
                                            checked={showForwarderField} 
                                            onChange={e => {
                                                const val = e.target.checked;
                                                setShowForwarderField(val);
                                                if (val) {
                                                    setIsMarketplace(false);
                                                } else {
                                                    setIsMarketplace(true);
                                                    createForm.setFieldsValue({ forwarderId: null, driverCost: null });
                                                }
                                            }}
                                        >
                                            Назначить контрагента
                                        </Checkbox>
                                    </Col>
                                </Row>
                            )}

                            {creatorRole === 'FORWARDER' && (
                                <Row style={{ marginBottom: 12 }}>
                                    <Col span={24}>
                                        <Checkbox 
                                            checked={showForwarderField} 
                                            onChange={e => {
                                                const val = e.target.checked;
                                                setShowForwarderField(val);
                                                if (!val) {
                                                    createForm.setFieldsValue({ forwarderId: null, driverCost: null });
                                                }
                                            }}
                                        >
                                            Назначить исполнителя (субподряд)
                                        </Checkbox>
                                    </Col>
                                </Row>
                            )}

                            {showCustomerField && (
                                <Row gutter={12}>
                                    <Col span={24}>
                                        <Form.Item 
                                            name="customerCompanyId" 
                                            label="Заказчик" 
                                            rules={[{ required: creatorRole === 'FORWARDER', message: 'Укажите компанию заказчика' }]}
                                            style={{ marginBottom: 12 }}
                                            help={
                                                <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => setQuickPartnerModalOpen(true)}>
                                                    + Создать нового контрагента
                                                </Button>
                                            }
                                        >
                                            <Select placeholder="Выберите компанию заказчика" allowClear showSearch optionFilterProp="children">
                                                {partners.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            )}

                            {(showForwarderField || isMarketplace) && (
                                <Row gutter={12} style={{ marginBottom: 12 }}>
                                    {!isMarketplace && (
                                        <Col span={creatorRole === 'CUSTOMER' ? 24 : 12}>
                                            <Form.Item 
                                                name="forwarderId" 
                                                label="Исполнитель" 
                                                rules={[{ required: true, message: 'Выберите исполнителя' }]}
                                                style={{ marginBottom: 8 }}
                                                help={
                                                    <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => setQuickPartnerModalOpen(true)}>
                                                        + Создать нового контрагента
                                                    </Button>
                                                }
                                            >
                                                <Select placeholder="Выберите компанию исполнителя" allowClear showSearch optionFilterProp="children">
                                                    {forwarders.map(f => <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>)}
                                                </Select>
                                            </Form.Item>
                                        </Col>
                                    )}
                                    {creatorRole !== 'CUSTOMER' && (
                                        <Col span={isMarketplace ? 24 : 12}>
                                            <Form.Item name="driverCost" label="Ставка перевозчику (₸)">
                                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                                            </Form.Item>
                                        </Col>
                                    )}
                                </Row>
                            )}
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
                            key: 'partner_manual', label: 'Водитель контрагента (вручную)',
                            children: (
                                <>
                                    <Form.Item name="partnerId" label="Компания-контрагент (перевозчик)" rules={[{ required: assignType === 'partner_manual', message: 'Выберите контрагента' }]}>
                                        <Select placeholder="Выберите контрагента" size="large" loading={partnersLoading} options={partners.map(p => ({ label: p.name, value: p.id }))} showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} />
                                    </Form.Item>
                                    <Form.Item name="assignedDriverName" label="ФИО водителя" rules={[{ required: assignType === 'partner_manual', message: 'Введите ФИО водителя' }]}>
                                        <Input placeholder="Иванов Иван Иванович" size="large" />
                                    </Form.Item>
                                    <Form.Item name="assignedDriverPhone" label="Телефон водителя">
                                        <Input placeholder="+7 (700) 123-45-67" size="large" />
                                    </Form.Item>
                                    <Form.Item name="assignedDriverPlate" label="Госномер авто">
                                        <Input placeholder="123 ABC 01" size="large" />
                                    </Form.Item>
                                    <Form.Item name="assignedDriverTrailer" label="Госномер прицепа">
                                        <Input placeholder="1234 XX 01" size="large" />
                                    </Form.Item>
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

            {/* ========== SHARE POWER OF ATTORNEY MODAL ========== */}
            <Modal
                title="Отправить доверенность по email"
                open={sharePoAModalOpen}
                onCancel={() => setSharePoAModalOpen(false)}
                onOk={handleSharePoA}
                okText="Отправить"
                cancelText="Отмена"
                confirmLoading={sharePoALoading}
                width={480}
            >
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">
                        Выберите получателей для отправки доверенности (в формате PDF):
                    </Text>
                </div>

                {shareEmailsList.length > 0 ? (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                        {shareEmailsList.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                <Checkbox
                                    checked={item.checked}
                                    onChange={(e) => {
                                        const newList = [...shareEmailsList];
                                        newList[idx].checked = e.target.checked;
                                        setShareEmailsList(newList);
                                    }}
                                >
                                    <Text style={{ fontSize: 13 }}>{item.label}</Text>
                                    <div style={{ fontSize: 11, color: '#999', paddingLeft: 24 }}>{item.email}</div>
                                </Checkbox>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 24, background: '#fafafa', borderRadius: 8, marginBottom: 16 }}>
                        <Text type="secondary">В заявке нет сохраненных email-адресов.</Text>
                    </div>
                )}

                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                        Добавить получателя вручную:
                    </Text>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input
                            placeholder="example@mail.com"
                            value={customEmailInput}
                            onChange={(e) => setCustomEmailInput(e.target.value)}
                            onPressEnter={handleAddCustomEmail}
                        />
                        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddCustomEmail}>
                            Добавить
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ========== ORDER DETAIL DRAWER ========== */}
            <Drawer title={`Заявка ${selectedOrder?.orderNumber}`} open={detailDrawerOpen} onClose={() => setDetailDrawerOpen(false)} width={500}>
                {selectedOrder && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <Tag color={statusColors[selectedOrder.status]} style={{ fontSize: 13 }}>{statusLabels[selectedOrder.status]}</Tag>
                        </div>

                        <Title level={5}>Заказчик и Ответственный</Title>
                        <Descriptions size="small" column={1}>
                            <Descriptions.Item label="Компания">{selectedOrder.customerCompany?.name || '—'}</Descriptions.Item>
                            <Descriptions.Item label="Контакт">{selectedOrder.customer?.firstName} {selectedOrder.customer?.lastName}</Descriptions.Item>
                            <Descriptions.Item label="Телефон">{selectedOrder.customer?.phone}</Descriptions.Item>
                            {selectedOrder.responsibleManager && (
                                <Descriptions.Item label="Ответственный">{selectedOrder.responsibleManager.firstName} {selectedOrder.responsibleManager.lastName}</Descriptions.Item>
                            )}
                        </Descriptions>

                        <Title level={5} style={{ marginTop: 16 }}>Груз</Title>
                        <Text>{selectedOrder.cargoDescription}</Text>
                        {selectedOrder.natureOfCargo && <div>Характер: <strong>{selectedOrder.natureOfCargo}</strong></div>}
                        {selectedOrder.cargoWeight && <div>Вес: {selectedOrder.cargoWeight} кг</div>}
                        {selectedOrder.cargoVolume && <div>Объём: {selectedOrder.cargoVolume} м³</div>}
                        {selectedOrder.cargoType && <div>Кузов: <strong>{selectedOrder.cargoType}</strong></div>}
                        {selectedOrder.requirements && <div>Треб.: {selectedOrder.requirements}</div>}
                        {(selectedOrder.customerPrice || selectedOrder.driverCost) && (
                            <div style={{ marginTop: 8 }}>
                                {selectedOrder.customerPrice && (
                                    <div style={{ fontSize: 14 }}>
                                        <span>Ставка заказчика: </span>
                                        <Text type="success" strong>{selectedOrder.customerPrice.toLocaleString('ru-RU')} ₸</Text>
                                    </div>
                                )}
                                {selectedOrder.driverCost && selectedOrder.customerCompanyId !== user?.companyId && (
                                    <div style={{ fontSize: 14, marginTop: 4 }}>
                                        <span>Ставка перевозчику: </span>
                                        <Text type="danger" strong>{selectedOrder.driverCost.toLocaleString('ru-RU')} ₸</Text>
                                    </div>
                                )}
                            </div>
                        )}

                        <Title level={5} style={{ marginTop: 16 }}>Маршрут</Title>
                        {selectedOrder.routePoints?.map((pt, i) => (
                            <div key={i} style={{ marginTop: 8 }}>
                                <strong>
                                    {pt.pointType === 'PICKUP' ? 'Погрузка' : 
                                     pt.pointType === 'ADDITIONAL_PICKUP' ? 'Доп. погрузка' : 'Выгрузка'}:
                                </strong> {pt.location.name}
                                <div style={{ color: '#666' }}>{pt.location.address}</div>
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
                            {(selectedOrder.assignedDriverName || selectedOrder.driverId) && (
                                <>
                                    <Button
                                        icon={<FileTextOutlined />}
                                        style={{ marginTop: 8 }}
                                        onClick={async () => {
                                            try {
                                                const res = await api.get(`/orders/${selectedOrder.id}/power-of-attorney`, { responseType: 'blob' });
                                                const blob = new Blob([res.data], { type: 'application/pdf' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `Доверенность_${selectedOrder.orderNumber}.pdf`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            } catch {
                                                message.error('Ошибка скачивания доверенности');
                                            }
                                        }}
                                        block
                                    >
                                        Скачать доверенность
                                    </Button>
                                    <Button
                                        icon={<MailOutlined />}
                                        style={{ marginTop: 8 }}
                                        onClick={() => openSharePoAModal(selectedOrder)}
                                        block
                                    >
                                        Отправить по email
                                    </Button>
                                </>
                            )}
                            <Button icon={<EditOutlined />} style={{ marginTop: 8 }} onClick={() => openEditModal(selectedOrder)} block>
                                Редактировать заявку
                            </Button>
                            {getNextStatuses(selectedOrder.status).length > 0 && (
                                <Button type="primary" style={{ marginTop: 8 }} onClick={() => { statusForm.resetFields(); setStatusModalOpen(true); }} block>
                                    Изменить статус
                                </Button>
                            )}
                            {selectedOrder.status !== 'CANCELLED' && selectedOrder.status !== 'COMPLETED' && (
                                <Popconfirm
                                    title="Отменить заявку?"
                                    description="Вы уверены, что хотите отменить эту заявку?"
                                    onConfirm={async () => {
                                        try {
                                            await api.put(`/orders/${selectedOrder.id}/status`, { status: 'CANCELLED', comment: 'Отменено пользователем' });
                                            message.success('Заявка отменена');
                                            mutateAll();
                                            setDetailDrawerOpen(false);
                                        } catch (error: any) {
                                            try {
                                                await api.put(`/company/orders/${selectedOrder.id}/status`, { status: 'CANCELLED', comment: 'Отменено пользователем' });
                                                message.success('Заявка отменена');
                                                mutateAll();
                                                setDetailDrawerOpen(false);
                                            } catch (err: any) {
                                                message.error(err.response?.data?.message || 'Ошибка отмены');
                                            }
                                        }
                                    }}
                                    okText="Да, отменить"
                                    cancelText="Нет"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button danger style={{ marginTop: 8 }} block>
                                        Отменить заявку
                                    </Button>
                                </Popconfirm>
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

            {/* ========== EDIT ORDER MODAL ========== */}
            <Modal
                title={`Редактировать заявку ${selectedOrder?.orderNumber || ''}`}
                open={editModalOpen}
                onCancel={() => setEditModalOpen(false)}
                onOk={() => editForm.submit()}
                okText="Сохранить"
                cancelText="Отмена"
                width={900}
                style={{ top: 20 }}
            >
                <Form form={editForm} layout="vertical" onFinish={handleEditOrder}>
                    <div style={{ marginBottom: 20, background: '#fafafa', padding: '12px 16px', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13, color: '#333' }}>Ваша роль в этой сделке:</div>
                        <Radio.Group 
                            value={editCreatorRole} 
                            onChange={e => handleEditCreatorRoleChange(e.target.value)}
                            optionType="button"
                            buttonStyle="solid"
                            style={{ width: '100%', display: 'flex' }}
                        >
                            <Radio.Button value="CUSTOMER" style={{ flex: 1, textAlign: 'center' }}>Заказчик</Radio.Button>
                            <Radio.Button value="FORWARDER" style={{ flex: 1, textAlign: 'center' }}>Экспедитор</Radio.Button>
                        </Radio.Group>
                    </div>
                    <Row gutter={24}>
                        <Col span={12}>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Маршрут</Title>
                            <Form.Item name="pickupDate" label="Дата погрузки">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY HH:mm" showTime={{ format: 'HH:mm' }} placeholder="Дата и время" />
                            </Form.Item>
                            {routePointsState.map((pt, i) => (
                                <div key={i} style={{ padding: '8px 12px', background: pt.pointType === 'DELIVERY' ? '#f6ffed' : '#f0f5ff', borderRadius: 8, marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                         <Select value={pt.pointType} onChange={val => { const newPts = [...routePointsState]; newPts[i].pointType = val; setRoutePointsState(newPts); }} size="small" style={{ width: 140, fontWeight: 600 }} variant="borderless">
                                              <Select.Option value="PICKUP"><EnvironmentOutlined style={{ color: '#1890ff', marginRight: 4 }}/> Погрузка</Select.Option>
                                              <Select.Option value="ADDITIONAL_PICKUP"><EnvironmentOutlined style={{ color: '#1890ff', marginRight: 4 }}/> Доп. погрузка</Select.Option>
                                              <Select.Option value="DELIVERY"><FlagOutlined style={{ color: '#52c41a', marginRight: 4 }}/> Выгрузка</Select.Option>
                                         </Select>
                                         <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => { const newPts = [...routePointsState]; newPts.splice(i, 1); setRoutePointsState(newPts); }} />
                                    </div>
                                    <Select
                                        placeholder="Выберите адрес" allowClear showSearch optionFilterProp="children" style={{ width: '100%' }}
                                        value={pt.id || undefined}
                                        onChange={(val) => {
                                            const newPts = [...routePointsState];
                                            if (!val) { newPts[i] = { ...newPts[i], city: '', address: '', id: undefined }; }
                                            else {
                                                const loc = locations.find(l => l.id === val);
                                                if (loc) newPts[i] = { ...newPts[i], city: loc.city || '', address: loc.address, id: loc.id };
                                            }
                                            setRoutePointsState(newPts);
                                        }}
                                    >
                                        {locations.map(l => <Select.Option key={l.id} value={l.id}>{l.name} ({l.address})</Select.Option>)}
                                    </Select>
                                </div>
                            ))}
                            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setRoutePointsState([...routePointsState, { city: '', address: '', pointType: 'ADDITIONAL_PICKUP' }])} style={{ width: '100%', marginBottom: 12 }}>
                                Добавить точку
                            </Button>
                        </Col>
                        <Col span={12}>
                            <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>Груз</Title>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="natureOfCargo" label="Характер груза">
                                        <Select placeholder="Выберите..." showSearch optionFilterProp="children" allowClear>
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
                                        <Select 
                                            placeholder="Тент, Реф..." 
                                            allowClear
                                            showSearch
                                            optionFilterProp="children"
                                            filterOption={(input, option) =>
                                                (option?.children as unknown as string ?? '').toLowerCase().includes(input.toLowerCase())
                                            }
                                        >
                                            {VEHICLE_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Form.Item name="cargoDescription" label="Описание груза">
                                <Input.TextArea rows={2} />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={12}><Form.Item name="cargoWeight" label="Вес (кг)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                <Col span={12}><Form.Item name="cargoVolume" label="Объём (м³)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}><Form.Item name="customerPrice" label="Сумма ₸"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                                <Col span={12}>
                                    <Form.Item name="customerPriceType" label="Тип оплаты">
                                        <Select style={{ width: '100%' }}>
                                            <Select.Option value="FIXED">За рейс (всего)</Select.Option>
                                            <Select.Option value="PER_KM">За км</Select.Option>
                                            <Select.Option value="PER_TON">За тонну</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            {editCreatorRole === 'CUSTOMER' && (
                                <Row style={{ marginBottom: 12 }}>
                                    <Col span={12}>
                                        <Checkbox 
                                            checked={isMarketplace} 
                                            onChange={e => {
                                                const val = e.target.checked;
                                                setIsMarketplace(val);
                                                if (val) {
                                                    setShowForwarderField(false);
                                                    editForm.setFieldsValue({ forwarderId: null });
                                                } else {
                                                    setShowForwarderField(true);
                                                    editForm.setFieldsValue({ driverCost: null });
                                                }
                                            }}
                                        >
                                            Отправить на биржу
                                        </Checkbox>
                                    </Col>
                                    <Col span={12}>
                                        <Checkbox 
                                            checked={showForwarderField} 
                                            onChange={e => {
                                                const val = e.target.checked;
                                                setShowForwarderField(val);
                                                if (val) {
                                                    setIsMarketplace(false);
                                                } else {
                                                    setIsMarketplace(true);
                                                    editForm.setFieldsValue({ forwarderId: null, driverCost: null });
                                                }
                                            }}
                                        >
                                            Назначить контрагента
                                        </Checkbox>
                                    </Col>
                                </Row>
                            )}

                            {editCreatorRole === 'FORWARDER' && (
                                <Row style={{ marginBottom: 12 }}>
                                    <Col span={24}>
                                        <Checkbox 
                                            checked={showForwarderField} 
                                            onChange={e => {
                                                const val = e.target.checked;
                                                setShowForwarderField(val);
                                                if (!val) {
                                                    editForm.setFieldsValue({ forwarderId: null, driverCost: null });
                                                }
                                            }}
                                        >
                                            Назначить исполнителя (субподряд)
                                        </Checkbox>
                                    </Col>
                                </Row>
                            )}

                            {showCustomerField && (
                                <Row gutter={12}>
                                    <Col span={24}>
                                        <Form.Item 
                                            name="customerCompanyId" 
                                            label="Заказчик" 
                                            rules={[{ required: editCreatorRole === 'FORWARDER', message: 'Укажите компанию заказчика' }]}
                                            style={{ marginBottom: 12 }}
                                            help={
                                                <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => setQuickPartnerModalOpen(true)}>
                                                    + Создать нового контрагента
                                                </Button>
                                            }
                                        >
                                            <Select placeholder="Выберите компанию заказчика" allowClear showSearch optionFilterProp="children">
                                                {partners.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            )}

                            {(showForwarderField || isMarketplace) && (
                                <Row gutter={12}>
                                    {!isMarketplace && (
                                        <Col span={editCreatorRole === 'CUSTOMER' ? 24 : 12}>
                                            <Form.Item 
                                                name="forwarderId" 
                                                label="Исполнитель" 
                                                rules={[{ required: true, message: 'Выберите исполнителя' }]}
                                                style={{ marginBottom: 12 }}
                                                help={
                                                    <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => setQuickPartnerModalOpen(true)}>
                                                        + Создать нового контрагента
                                                    </Button>
                                                }
                                            >
                                                <Select placeholder="Выберите компанию исполнителя" allowClear showSearch optionFilterProp="children">
                                                    {forwarders.map(f => <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>)}
                                                </Select>
                                            </Form.Item>
                                        </Col>
                                    )}
                                    {editCreatorRole !== 'CUSTOMER' && (
                                        <Col span={isMarketplace ? 24 : 12}>
                                            <Form.Item name="driverCost" label="Ставка перевозчику (₸)">
                                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                                            </Form.Item>
                                        </Col>
                                    )}
                                </Row>
                            )}
                            <Form.Item name="requirements" label="Доп. требования">
                                <Input.TextArea rows={2} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            <Modal
                title="Новый контрагент (офлайн)"
                open={quickPartnerModalOpen}
                onCancel={() => { setQuickPartnerModalOpen(false); quickPartnerForm.resetFields(); }}
                onOk={() => quickPartnerForm.submit()}
                confirmLoading={quickPartnerLoading}
                okText="Создать"
                cancelText="Отмена"
            >
                <Form 
                    form={quickPartnerForm} 
                    layout="vertical" 
                    onFinish={handleCreateQuickPartner}
                    onValuesChange={async (changedValues) => {
                        if (changedValues.bin && /^\d{12}$/.test(changedValues.bin)) {
                            try {
                                const res = await api.get(`/auth/company-lookup/${changedValues.bin}`);
                                if (res.data) {
                                    const updateObj: any = {};
                                    if (res.data.name) updateObj.name = res.data.name;
                                    if (res.data.phone) updateObj.phone = res.data.phone;
                                    if (res.data.email) updateObj.email = res.data.email;
                                    
                                    quickPartnerForm.setFieldsValue(updateObj);
                                    message.success('Реквизиты компании подтянуты');
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }}
                >
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="ТОО Пример" />
                    </Form.Item>
                    <Form.Item 
                        name="bin" 
                        label="БИН/ИИН" 
                        rules={[
                            { required: true, message: 'Введите БИН/ИИН' },
                            { pattern: /^\d{12}$/, message: 'БИН/ИИН должен состоять ровно из 12 цифр' }
                        ]}
                    >
                        <Input placeholder="123456789012" maxLength={12} />
                    </Form.Item>
                    <Form.Item name="phone" label="Телефон">
                        <Input placeholder="+77001234567" />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input placeholder="company@example.com" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
