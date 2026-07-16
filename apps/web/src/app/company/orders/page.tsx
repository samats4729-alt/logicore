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
    UserAddOutlined, CheckCircleOutlined, PlusOutlined,
    EnvironmentOutlined, FlagOutlined, DeleteOutlined, SearchOutlined,
    FilterOutlined, ClearOutlined, FileTextOutlined, CloseCircleOutlined,
    MailOutlined, RightOutlined, EditOutlined, ExclamationCircleOutlined,
    ClockCircleOutlined, TruckOutlined
} from '@ant-design/icons';
import FeaturedOrderCard from '@/components/ui/FeaturedOrderCard';
import { api, Location } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import { shortenCompanyName } from '@/lib/company-helper';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import AssignDriverModal from '@/components/AssignDriverModal';
import OrdersMobileList from '@/components/OrdersMobileList';
import StatusPill, { STATUS_PILL, STATUS_LABELS } from '@/components/ui/StatusPill';
import { useIsMobile } from '@/lib/useIsMobile';

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

// Грубый прогресс рейса по позиции статуса в цепочке (точный % по GPS — этап 5 плана редизайна)
const STATUS_PROGRESS: Record<string, number> = {
    DRAFT: 4, PENDING: 8, ASSIGNED: 18, EN_ROUTE_PICKUP: 30, AT_PICKUP: 42,
    LOADING: 52, IN_TRANSIT: 68, AT_DELIVERY: 82, UNLOADING: 92,
    COMPLETED: 100, PROBLEM: 50, CANCELLED: 100,
};

const progressColor = (s: string) =>
    s === 'PROBLEM' ? '#dc2626' : s === 'COMPLETED' ? '#16a34a' : s === 'CANCELLED' ? '#9ca3af' : '#1677ff';

const nameInitials = (name?: string) => {
    if (!name) return '—';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '—';
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
    routePoints?: { pointType: string; sequence: number; location: { id?: string; name: string; address: string; city?: string; emails?: string } }[];
    customer?: { firstName: string; lastName: string; phone: string; email?: string };
    customerCompany?: { id?: string; name: string; phone?: string; email?: string };
    customerCompanyId?: string;
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedDriverPlate?: string;
    assignedDriverTrailer?: string;
    assignedAt?: string;
    driver?: { firstName: string; lastName: string; middleName?: string; phone: string; vehiclePlate?: string; vehicleModel?: string; trailerNumber?: string };
    subForwarder?: { name: string; email?: string };
    forwarder?: { id?: string; name: string; email?: string };
    partner?: { name: string; email?: string };
    forwarderId?: string;
    subForwarderId?: string;
    subForwarderPrice?: number;
    partnerId?: string;
    isConfirmed?: boolean;
    driverId?: string;
    responsibleManager?: { firstName: string; lastName: string; };
    pendingStatus?: string;
    pendingStatusById?: string;
}

// ============================================================
// Component
// ============================================================

export default function CompanyOrdersPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const isMobile = useIsMobile();

    const [activeTab, setActiveTab] = useState('all');
    const [ordersPage, setOrdersPage] = useState(1);
    const [ordersPageSize, setOrdersPageSize] = useState(20);
    
    const [myCompanies, setMyCompanies] = useState<any[]>([]);
    useEffect(() => {
        api.get('/company/my-companies')
            .then(res => setMyCompanies(res.data || []))
            .catch(() => {});
    }, []);
    const [archivePage, setArchivePage] = useState(1);
    const [archivePageSize, setArchivePageSize] = useState(20);

    // Fetch all active orders with SWR (unified — no incoming/outgoing split)
    const { data: ordersData, isLoading: loading, mutate: mutateOrders } = useSWR(
        `/company/orders?page=${ordersPage}&limit=${ordersPageSize}&type=active`,
        fetcher
    );
    const orders: Order[] = ordersData?.data || [];
    const totalOrders = ordersData?.total || 0;

    // Archive orders
    const { data: archiveData, isLoading: archiveLoading, mutate: mutateArchive } = useSWR(
        `/company/orders?page=${archivePage}&limit=${archivePageSize}&type=archive`,
        fetcher
    );
    const archiveOrders: Order[] = archiveData?.data || [];
    const totalArchiveOrders = archiveData?.total || 0;

    const mutateAll = () => {
        mutateOrders();
        mutateArchive();
    };

    // Common
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [vehiclesLoading, setVehiclesLoading] = useState(false);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [partnersLoading, setPartnersLoading] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    // Заявка, выбранная одним кликом для предпросмотра на карте (без перехода внутрь)
    const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
    const featuredCardRef = useRef<HTMLDivElement>(null);
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
        
        const addEmails = (emailStr: string | null | undefined, label: string) => {
            if (!emailStr) return;
            const emails = emailStr.split(',').map(e => e.trim()).filter(Boolean);
            emails.forEach(email => {
                list.push({ email, checked: true, label });
            });
        };

        addEmails(order.customerCompany?.email, `Компания-заказчик (${order.customerCompany?.name})`);
        addEmails(order.customer?.email, `Заказчик (${order.customer?.firstName} ${order.customer?.lastName})`);
        addEmails(order.forwarder?.email, `Экспедитор (${order.forwarder?.name})`);
        addEmails(order.subForwarder?.email, `Перевозчик (${order.subForwarder?.name})`);
        addEmails(order.partner?.email, `Партнер (${order.partner?.name})`);
        
        // Add emails from route points/warehouses
        order.routePoints?.forEach(pt => {
            if (pt.location?.emails) {
                const emails = pt.location.emails.split(',').map(e => e.trim()).filter(Boolean);
                emails.forEach(email => {
                    list.push({
                        email,
                        checked: true,
                        label: `Склад/Адрес (${pt.location.name})`
                    });
                });
            }
        });
        
        // Remove duplicate rows only if they have the exact same email AND label
        const uniqueList: typeof list = [];
        const seenCombination = new Set<string>();
        for (const item of list) {
            const key = `${item.email}||${item.label}`;
            if (!seenCombination.has(key)) {
                seenCombination.add(key);
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

        // Deduplicate emails before sending to prevent duplicate messages
        const uniqueEmails = Array.from(new Set(selectedEmails));

        setSharePoALoading(true);
        try {
            await api.post(`/orders/${selectedOrder?.id}/share-power-of-attorney`, {
                emails: uniqueEmails,
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

    // Watches for create form
    const createCustomerCompanyId = Form.useWatch('customerCompanyId', createForm);
    const createForwarderId = Form.useWatch('forwarderId', createForm);

    // Watches for edit form
    const editCustomerCompanyId = Form.useWatch('customerCompanyId', editForm);
    const editForwarderId = Form.useWatch('forwarderId', editForm);

    // Function to group and recommend locations based on selected customer and carrier/executor
    const getLocationOptions = (customerCompanyId?: string, executorCompanyId?: string) => {
        if (!locations || locations.length === 0) return [];

        const customerLocs = locations.filter(l => customerCompanyId && (l as any).companyId === customerCompanyId);
        const executorLocs = locations.filter(l => executorCompanyId && (l as any).companyId === executorCompanyId);
        
        // Deduplicate so we don't show the same warehouse in multiple groups
        const categorizedIds = new Set([
            ...customerLocs.map(l => l.id),
            ...executorLocs.map(l => l.id)
        ]);
        
        const otherLocs = locations.filter(l => !categorizedIds.has(l.id));

        const groups: Array<{ label: string; options: Location[] }> = [];

        // Helper to group items by city
        const groupByCity = (locs: Location[], prefixLabel: string) => {
            const cityMap = new Map<string, Location[]>();
            const noCity: Location[] = [];
            
            locs.forEach(l => {
                if (l.city) {
                    if (!cityMap.has(l.city)) cityMap.set(l.city, []);
                    cityMap.get(l.city)!.push(l);
                } else {
                    noCity.push(l);
                }
            });
            
            // Add city groups sorted alphabetically
            const sortedCities = Array.from(cityMap.keys()).sort();
            sortedCities.forEach(city => {
                groups.push({
                    label: `${prefixLabel} (${city})`,
                    options: cityMap.get(city)!
                });
            });
            
            // Add no-city group if not empty
            if (noCity.length > 0) {
                groups.push({
                    label: `${prefixLabel} (Без города)`,
                    options: noCity
                });
            }
        };

        if (customerLocs.length > 0) {
            const custName = partners.find(p => p.id === customerCompanyId)?.name || 'Заказчик';
            groupByCity(customerLocs, `Склады заказчика [${custName}]`);
        }

        if (executorLocs.length > 0) {
            const execName = partners.find(p => p.id === executorCompanyId)?.name || 'Исполнитель';
            groupByCity(executorLocs, `Склады исполнителя [${execName}]`);
        }

        if (otherLocs.length > 0) {
            groups.push({
                label: 'Все остальные адреса',
                options: otherLocs
            });
        }

        return groups;
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

    const fetchVehicles = async () => {
        setVehiclesLoading(true);
        try {
            const response = await api.get('/company/vehicles');
            setVehicles(response.data || []);
        } catch {
            // silent fail
        } finally {
            setVehiclesLoading(false);
        }
    };

    const fetchPartners = async () => {
        setPartnersLoading(true);
        try {
            const [partnersRes, externalRes, profileRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
                api.get('/company/profile'),
            ]);
            const partnersList = partnersRes.data.filter((p: any) => p.isCarrier);
            const externalList = externalRes.data
                .filter((e: any) => e.isCarrier)
                .map((e: any) => ({
                    id: e.id,
                    name: e.name,
                }));
            const ownCompany = profileRes.data ? [{ id: profileRes.data.id, name: `${profileRes.data.name} (Моя компания)` }] : [];
            const combined = [...ownCompany, ...partnersList, ...externalList];
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
    const [filterForwarder, setFilterForwarder] = useState<string | undefined>(undefined);
    const [filterExpeditor, setFilterExpeditor] = useState<string | undefined>(undefined);
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
    const uniqueCompanies = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => { if (o.customerCompany?.name) set.add(o.customerCompany.name); });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueForwarders = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => { if (o.forwarder?.name) set.add(o.forwarder.name); });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueExpeditors = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => {
            const name = o.subForwarder?.name || o.partner?.name;
            if (name) set.add(name);
        });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueArchiveCompanies = useMemo(() => {
        const set = new Set<string>();
        archiveOrders.forEach(o => {
            if (o.customerCompany?.name) set.add(o.customerCompany.name);
            if (o.forwarder?.name) set.add(o.forwarder.name);
        });
        return Array.from(set).sort();
    }, [archiveOrders]);

    const uniqueDrivers = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => { if (o.assignedDriverName) set.add(o.assignedDriverName); });
        return Array.from(set).sort();
    }, [orders]);

    const uniqueArchiveDrivers = useMemo(() => {
        const set = new Set<string>();
        archiveOrders.forEach(o => { if (o.assignedDriverName) set.add(o.assignedDriverName); });
        return Array.from(set).sort();
    }, [archiveOrders]);

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

    const uniqueArchiveFromCities = useMemo(() => {
        const set = new Set<string>();
        archiveOrders.forEach(o => {
            const city = extractCity(o, 'pickup');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [archiveOrders]);

    const uniqueToCities = useMemo(() => {
        const set = new Set<string>();
        orders.forEach(o => {
            const city = extractCity(o, 'delivery');
            if (city) set.add(city);
        });
        return Array.from(set).sort();
    }, [orders]);

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
            if (filterForwarder && o.forwarder?.name !== filterForwarder) return false;
            if (filterExpeditor) {
                const expName = o.subForwarder?.name || o.partner?.name;
                if (expName !== filterExpeditor) return false;
            }
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
    }, [orders, filterCompany, filterForwarder, filterExpeditor, filterDriver, filterStatus, filterFrom, filterTo, filterSumMin, filterSumMax]);

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

    const hasActiveFilters = filterCompany || filterForwarder || filterExpeditor || filterDriver || filterStatus || filterFrom || filterTo || filterSumMin !== undefined || filterSumMax !== undefined;

    const clearFilters = () => {
        setFilterCompany(undefined);
        setFilterForwarder(undefined);
        setFilterExpeditor(undefined);
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

        const isFwdAssigned = !!(order.forwarderId && order.forwarderId !== user?.companyId) || !!order.subForwarderId;
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
            driverCost: order.driverCost || order.subForwarderPrice,
            pickupDate: (order.routePoints?.find(p => p.pointType === 'PICKUP') as any)?.expectedDate ? dayjs((order.routePoints?.find(p => p.pointType === 'PICKUP') as any)?.expectedDate) : undefined,
            forwarderId: order.subForwarderId || (order.forwarderId !== user?.companyId ? order.forwarderId : undefined),
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
        const fwdId = order.subForwarderId || order.forwarderId || order.forwarder?.id;
        const fwdName = order.subForwarder?.name || order.forwarder?.name;
        if (fwdId && fwdName && !forwarders.some(f => f.id === fwdId)) {
            setForwarders(prev => [...prev, { id: fwdId, name: fwdName }]);
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
                    updateData.subForwarderId = null;
                    updateData.subForwarderPrice = null;
                } else {
                    updateData.forwarderId = user?.companyId;
                    updateData.subForwarderId = values.forwarderId;
                    updateData.subForwarderPrice = values.driverCost;
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
        setAssignModalOpen(true);
    };

    const getNextStatuses = (s: string) => {
        const chain = [
            { value: 'ASSIGNED', label: 'Назначен' },
            { value: 'EN_ROUTE_PICKUP', label: 'Едет на погрузку' },
            { value: 'AT_PICKUP', label: 'На погрузке' },
            { value: 'LOADING', label: 'Загружается' },
            { value: 'IN_TRANSIT', label: 'В пути' },
            { value: 'AT_DELIVERY', label: 'На выгрузке' },
            { value: 'UNLOADING', label: 'Разгружается' },
            { value: 'COMPLETED', label: 'Завершён' },
        ];
        
        if (s === 'PROBLEM') {
            return chain;
        }
        
        const idx = chain.findIndex(item => item.value === s);
        if (idx === -1) return [];
        return chain.slice(idx + 1);
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
                    ov.subForwarderId = null;
                    ov.subForwarderPrice = null;
                } else {
                    ov.subForwarderId = user?.companyId;
                    ov.subForwarderPrice = values.driverCost;
                }
            }

            await api.post('/orders', { ...ov, routePoints, customerId: user?.id, appliedTariffId: appliedTariff?.id || undefined });
            message.success('Заявка создана');
            mutateAll();
            
            // Автоматически переключаемся на вкладку «Все заявки»
            setActiveTab('all');

            setCreateModalOpen(false); createForm.resetFields();
        } catch (error: any) { message.error(error.response?.data?.message || 'Ошибка создания'); }
    };

    // =================== COLUMNS ===================

    const orgColumn = myCompanies.length > 1 ? [{
        title: 'Организация', key: 'ourOrg', width: 120, ellipsis: true,
        render: (_: any, r: Order) => {
            const matched = myCompanies.find(c => c.id === r.customerCompanyId || c.id === r.forwarderId || c.id === (r as any).subForwarderId);
            const name = matched?.name || '—';
            return (
                <Tooltip title={name}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#1677ff' }}>{shortenCompanyName(name)}</span>
                </Tooltip>
            );
        }
    }] : [];

    const columns = [
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 110, fixed: 'left' as const,
            render: (s: string, r: Order) => (
                <div>
                    <StatusPill status={s} />
                    {r.pendingStatus === 'COMPLETED' && r.pendingStatusById !== user?.companyId && (
                        <Tooltip title="Ожидает вашего подтверждения завершения">
                            <ExclamationCircleOutlined style={{ color: '#faad14', marginLeft: 4, fontSize: 13 }} />
                        </Tooltip>
                    )}
                    {r.pendingStatus === 'COMPLETED' && r.pendingStatusById === user?.companyId && (
                        <Tooltip title="Вы запросили завершение, ожидаем подтверждения">
                            <ExclamationCircleOutlined style={{ color: '#1890ff', marginLeft: 4, fontSize: 13 }} />
                        </Tooltip>
                    )}
                </div>
            ),
        },
        {
            title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 104,
            render: (t: string) => <span className="lc-ordernum">{t}</span>,
        },
        ...orgColumn,
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80,
            render: (d: string) => <span style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>,
        },
        {
            title: 'Дата погр.', key: 'pickupDate', width: 90,
            render: (_: any, r: Order) => {
                const pickupPt = r.routePoints?.find(p => p.pointType === 'PICKUP');
                const date = (pickupPt as any)?.expectedDate;
                return date
                    ? <span style={{ fontSize: 11, color: 'var(--lc-text-sec)' }}>{dayjs(date).format('DD.MM.YY')}</span>
                    : <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Заказчик', key: 'customer', width: 130, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = r.customerCompany?.name || '—';
                return (
                    <Tooltip title={name}>
                        <span style={{ fontSize: 12, fontWeight: r.customerCompanyId === user?.companyId ? 600 : undefined }}>{shortenCompanyName(name)}</span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Перевозчик', key: 'forwarder', width: 130, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = (r.forwarderId === user?.companyId && r.subForwarder) ? r.subForwarder.name : (r.forwarder?.name || r.subForwarder?.name || r.partner?.name || '—');
                return (
                    <Tooltip title={name}>
                        <span style={{ fontSize: 12, fontWeight: r.forwarderId === user?.companyId ? 600 : undefined }}>{shortenCompanyName(name)}</span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Водитель', key: 'drv', width: 140, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = r.assignedDriverName || (r.driver ? `${r.driver.lastName} ${r.driver.firstName.substring(0, 1)}.` : '');
                if (!name) return <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
                        <span className="lc2-avatar lc2-avatar-sm">{nameInitials(name)}</span>
                        <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    </span>
                );
            },
        },
        {
            title: 'Транспорт', key: 'vehicle', width: 100, ellipsis: true,
            render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.assignedDriverPlate || r.driver?.vehiclePlate || '—'}</span>,
        },
        {
            title: 'Маршрут', key: 'route', width: 170,
            render: (_: any, r: Order) => {
                const from = extractCity(r, 'pickup');
                const to = extractCity(r, 'delivery');
                if (!from && !to) return <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
                return (
                    <div style={{ minWidth: 120 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{from || '?'} → {to || '?'}</span>
                        <div className="lc2-rowbar">
                            <i style={{ width: `${STATUS_PROGRESS[r.status] ?? 0}%`, background: progressColor(r.status) }} />
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Менеджер', key: 'manager', width: 110, ellipsis: true,
            render: (_: any, r: Order) => {
                if (r.responsibleManager) {
                    return <span style={{ fontSize: 12 }}>{r.responsibleManager.lastName} {r.responsibleManager.firstName?.substring(0, 1)}.</span>;
                }
                return <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Ставка зак.', key: 'customerPrice', width: 100, align: 'right' as const,
            render: (_: any, r: Order) => {
                return r.customerPrice
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: '#389e0d' }}>{r.customerPrice.toLocaleString('ru-RU')}</span>
                    : <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Ставка перев.', key: 'carrierPrice', width: 100, align: 'right' as const,
            render: (_: any, r: Order) => {
                const cost = r.driverCost || (r as any).subForwarderPrice;
                return cost
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: '#cf1322' }}>{cost.toLocaleString('ru-RU')}</span>
                    : <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: '', key: 'actions', width: 50, fixed: 'right' as const,
            render: (_: any, r: Order) => (
                <Tooltip title="Открыть заявку">
                    <Button size="small" type="link" icon={<RightOutlined />} onClick={(e) => { e.stopPropagation(); router.push(`/company/orders/${r.id}`); }} style={{ fontSize: 12, color: '#1890ff' }} />
                </Tooltip>
            ),
        },
    ];

    const archiveColumns = [
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 110, fixed: 'left' as const,
            render: (s: string) => <StatusPill status={s} />,
        },
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 104, render: (t: string) => <span className="lc-ordernum">{t}</span> },
        ...orgColumn,
        { title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80, render: (d: string) => <span style={{ fontSize: 11, color: 'var(--lc-text-ter)' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span> },
        {
            title: 'Дата погр.', key: 'pickupDate', width: 90,
            render: (_: any, r: Order) => {
                const pickupPt = r.routePoints?.find(p => p.pointType === 'PICKUP');
                const date = (pickupPt as any)?.expectedDate;
                return date ? <span style={{ fontSize: 11, color: 'var(--lc-text-sec)' }}>{dayjs(date).format('DD.MM.YY')}</span> : <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Заказчик', key: 'customer', width: 130, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = r.customerCompany?.name || '—';
                return (
                    <Tooltip title={name}>
                        <span style={{ fontSize: 12, fontWeight: r.customerCompanyId === user?.companyId ? 600 : undefined }}>{shortenCompanyName(name)}</span>
                    </Tooltip>
                );
            }
        },
        { 
            title: 'Перевозчик', key: 'forwarder', width: 130, ellipsis: true, 
            render: (_: any, r: Order) => {
                const name = (r.forwarderId === user?.companyId && r.subForwarder) ? r.subForwarder.name : (r.forwarder?.name || r.subForwarder?.name || r.partner?.name || '—');
                return (
                    <Tooltip title={name}>
                        <span style={{ fontSize: 12, fontWeight: r.forwarderId === user?.companyId ? 600 : undefined }}>{shortenCompanyName(name)}</span>
                    </Tooltip>
                );
            }
        },
        { title: 'Водитель', key: 'drv', width: 120, ellipsis: true, render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.assignedDriverName || (r.driver ? `${r.driver.lastName} ${r.driver.firstName.substring(0, 1)}.` : '—')}</span> },
        { title: 'Транспорт', key: 'vehicle', width: 100, ellipsis: true, render: (_: any, r: Order) => <span style={{ fontSize: 12 }}>{r.assignedDriverPlate || r.driver?.vehiclePlate || '—'}</span> },
        {
            title: 'Маршрут', key: 'route', width: 160, ellipsis: true,
            render: (_: any, r: Order) => {
                const from = extractCity(r, 'pickup');
                const to = extractCity(r, 'delivery');
                if (!from && !to) return <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
                return <span style={{ fontSize: 12, fontWeight: 500 }}>{from || '?'} → {to || '?'}</span>;
            },
        },
        {
            title: 'Менеджер', key: 'manager', width: 110, ellipsis: true,
            render: (_: any, r: Order) => {
                if (r.responsibleManager) {
                    return <span style={{ fontSize: 12 }}>{r.responsibleManager.lastName} {r.responsibleManager.firstName?.substring(0, 1)}.</span>;
                }
                return <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Ставка зак.', key: 'customerPrice', width: 100, align: 'right' as const,
            render: (_: any, r: Order) => r.customerPrice ? <span style={{ fontSize: 12, fontWeight: 600, color: '#389e0d' }}>{r.customerPrice.toLocaleString('ru-RU')}</span> : <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>,
        },
        {
            title: 'Ставка перев.', key: 'carrierPrice', width: 100, align: 'right' as const,
            render: (_: any, r: Order) => {
                const cost = r.driverCost || (r as any).subForwarderPrice;
                return cost ? <span style={{ fontSize: 12, fontWeight: 600, color: '#cf1322' }}>{cost.toLocaleString('ru-RU')}</span> : <span style={{ color: 'var(--lc-text-ter)', fontSize: 11 }}>—</span>;
            },
        },
        { title: '', key: 'actions', width: 50, render: (_: any, r: Order) => (
            <Tooltip title="Открыть заявку">
                <Button size="small" type="link" icon={<RightOutlined />} onClick={(e) => { e.stopPropagation(); router.push(`/company/orders/${r.id}`); }} style={{ fontSize: 12, color: '#1890ff' }} />
            </Tooltip>
        ) },
    ];

    // =================== RENDER ===================

    const inTransitCount = orders.filter(o => ['IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'].includes(o.status)).length;
    const pendingCount = orders.filter(o => o.status === 'PENDING').length;
    const problemCount = orders.filter(o => o.status === 'PROBLEM').length;
    const featured = previewOrder || filteredOrders[0] || orders[0] || null;

    // Один клик по строке — показать заявку на карте (не проваливаться внутрь)
    const handleRowSelect = (record: Order) => {
        setPreviewOrder(record);
        featuredCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    return (
        <div className="lc-page" style={{ height: '100%' }}>
            {/* ===== HERO ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">LogiCore — перевозки</div>
                    <h1 className="lc2-title">Заявки компании</h1>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <span className="lc2-mic"><FileTextOutlined /></span>
                        <div>
                            <div className="lc2-mlabel">Всего заявок</div>
                            <div className="lc2-mvalue">{orders.length}</div>
                            <div className="lc2-msub" style={{ color: '#16a34a' }}>активная база</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <span className="lc2-mic"><TruckOutlined /></span>
                        <div>
                            <div className="lc2-mlabel">Сейчас в пути</div>
                            <div className="lc2-mvalue">{inTransitCount}</div>
                            <div className="lc2-msub" style={{ color: '#16a34a' }}>по графику</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <span className="lc2-mic"><ClockCircleOutlined /></span>
                        <div>
                            <div className="lc2-mlabel">Ожидают назначения</div>
                            <div className="lc2-mvalue">{pendingCount}</div>
                            <div className="lc2-msub" style={{ color: pendingCount > 0 ? '#b45309' : '#16a34a' }}>
                                {pendingCount > 0 ? 'внимание ⚠' : 'всё назначено'}
                            </div>
                        </div>
                    </div>
                    {problemCount > 0 && (
                        <div className="lc2-metric lc2-metric-alert">
                            <span className="lc2-mic" style={{ background: '#fee2e2', color: '#dc2626' }}><ExclamationCircleOutlined /></span>
                            <div>
                                <div className="lc2-mlabel">Проблемы</div>
                                <div className="lc2-mvalue" style={{ color: '#dc2626' }}>{problemCount}</div>
                                <div className="lc2-msub" style={{ color: '#dc2626' }}>требуют решения</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== ACTION BAR ===== */}
            <div className="lc2-actionbar">
                <div className="lc2-ab-left">
                    <span className="lc2-ab-ic"><EnvironmentOutlined /></span>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--lc-text)' }}>База заявок</div>
                        <div style={{ fontSize: 11.5, color: 'var(--lc-text-ter)' }}>Сегодня · {dayjs().format('DD.MM.YYYY')}</div>
                    </div>
                </div>
                <div className="lc2-ab-right">
                    {pendingCount > 0 && (
                        <span className="lc2-ab-warn">
                            <ExclamationCircleOutlined /> {pendingCount} {pendingCount === 1 ? 'заявка ожидает' : 'заявки ожидают'} назначения
                        </span>
                    )}
                    <Button data-guide="orders-create" type="primary" icon={<PlusOutlined />} className="lc-cta lc-cta-shine" onClick={() => router.push('/company/orders/create')}>
                        Создать заявку
                    </Button>
                </div>
            </div>

            {/* ===== FEATURED: выбранная / последняя заявка ===== */}
            <div ref={featuredCardRef}>
                <FeaturedOrderCard order={featured} onOpen={(id) => router.push(`/company/orders/${id}`)} />
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                size="small"
                items={[
                    {
                        key: 'all',
                        label: <span>Все заявки <Tag style={{ marginLeft: 4, fontSize: 11 }}>{filteredOrders.length}{hasActiveFilters ? `/${orders.length}` : ''}</Tag></span>,
                        children: (
                            <div>
                                {/* FILTER BAR */}
                                <div className="lc-filterbar" style={{
                                    display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12,
                                    alignItems: 'center'
                                }}>
                                    <FilterOutlined style={{ color: 'var(--lc-text-ter)', fontSize: 13 }} />
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Заказчик" style={{ width: 140 }}
                                        value={filterCompany} onChange={setFilterCompany}
                                    >
                                        {uniqueCompanies.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Исполнитель" style={{ width: 140 }}
                                        value={filterForwarder} onChange={setFilterForwarder}
                                    >
                                        {uniqueForwarders.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Экспедитор" style={{ width: 140 }}
                                        value={filterExpeditor} onChange={setFilterExpeditor}
                                    >
                                        {uniqueExpeditors.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Водитель" style={{ width: 130 }}
                                        value={filterDriver} onChange={setFilterDriver}
                                    >
                                        {uniqueDrivers.map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear
                                        placeholder="Статус" style={{ width: 120 }}
                                        value={filterStatus} onChange={setFilterStatus}
                                    >
                                        {uniqueStatuses.map(s => <Select.Option key={s} value={s}>{STATUS_LABELS[s] || s}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Откуда" style={{ width: 110 }}
                                        value={filterFrom} onChange={setFilterFrom}
                                    >
                                        {uniqueFromCities.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                                    </Select>
                                    <Select
                                        size="small" allowClear showSearch optionFilterProp="children"
                                        placeholder="Куда" style={{ width: 110 }}
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

                                {/* TABLE / MOBILE CARDS */}
                                {isMobile ? (
                                    <OrdersMobileList
                                        orders={filteredOrders}
                                        loading={loading}
                                        userCompanyId={user?.companyId}
                                        extractCity={extractCity}
                                        onOpen={(id) => router.push(`/company/orders/${id}`)}
                                        pagination={{
                                            current: ordersPage,
                                            pageSize: ordersPageSize,
                                            total: totalOrders,
                                            onChange: (p, ps) => { setOrdersPage(p); setOrdersPageSize(ps); },
                                        }}
                                    />
                                ) : (
                                <Table
                                    columns={columns}
                                    dataSource={filteredOrders}
                                    rowKey="id"
                                    loading={loading}
                                    size="small"
                                    scroll={{ x: 1600 }}
                                    pagination={{
                                        current: ordersPage,
                                        pageSize: ordersPageSize,
                                        total: totalOrders,
                                        onChange: (p, ps) => { setOrdersPage(p); setOrdersPageSize(ps); },
                                        showSizeChanger: true,
                                        pageSizeOptions: ['20', '50', '100'],
                                        size: 'small',
                                        showTotal: (t) => `Всего: ${t}`
                                    }}
                                    style={{ fontSize: 12 }}
                                    onRow={(record) => ({
                                        style: { cursor: 'pointer' },
                                        onClick: () => handleRowSelect(record),
                                        onDoubleClick: () => router.push(`/company/orders/${record.id}`),
                                    })}
                                    rowClassName={(record) => {
                                        const sel = previewOrder?.id === record.id ? 'row-selected ' : '';
                                        if (record.status === 'COMPLETED') return sel + 'row-completed';
                                        if (record.status === 'PROBLEM') return sel + 'row-problem';
                                        if (record.status === 'CANCELLED') return sel + 'row-cancelled';
                                        return sel;
                                    }}
                                />
                                )}
                            </div>
                        ),
                    },
                    {
                        key: 'archive',
                        label: <span>Архив <Tag style={{ marginLeft: 4, fontSize: 11 }}>{filteredArchiveOrders.length}{hasActiveFilters ? `/${archiveOrders.length}` : ''}</Tag></span>,
                        children: (
                            <div>
                                {/* FILTER BAR */}
                                <div className="lc-filterbar" style={{
                                    display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12,
                                    alignItems: 'center'
                                }}>
                                    <FilterOutlined style={{ color: 'var(--lc-text-ter)', fontSize: 13 }} />
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

                                {/* TABLE / MOBILE CARDS */}
                                {isMobile ? (
                                    <OrdersMobileList
                                        orders={filteredArchiveOrders}
                                        loading={archiveLoading}
                                        userCompanyId={user?.companyId}
                                        extractCity={extractCity}
                                        onOpen={(id) => router.push(`/company/orders/${id}`)}
                                        pagination={{
                                            current: archivePage,
                                            pageSize: archivePageSize,
                                            total: totalArchiveOrders,
                                            onChange: (p, ps) => { setArchivePage(p); setArchivePageSize(ps); },
                                        }}
                                    />
                                ) : (
                                <Table
                                    columns={archiveColumns}
                                    dataSource={filteredArchiveOrders}
                                    rowKey="id"
                                    loading={archiveLoading}
                                    size="small"
                                    scroll={{ x: 1500 }}
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
                                        onClick: () => handleRowSelect(record),
                                        onDoubleClick: () => router.push(`/company/orders/${record.id}`),
                                    })}
                                    rowClassName={(record) => (previewOrder?.id === record.id ? 'row-selected row-cancelled' : 'row-cancelled')}
                                />
                                )}
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
                    background: var(--lc-hover) !important;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    color: var(--lc-text-sec) !important;
                    white-space: nowrap;
                    border-bottom: 1px solid var(--lc-border) !important;
                }
                .ant-table-small .ant-table-tbody > tr > td {
                    padding: 4px 8px !important;
                    font-size: 12px !important;
                    border-bottom: 1px solid var(--lc-border-soft) !important;
                }
                .ant-table-small .ant-table-tbody > tr:hover > td {
                    background: var(--lc-hover) !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-completed > td {
                    background: rgba(34, 197, 94, 0.12) !important;
                    color: #22c55e !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-completed > td span,
                .ant-table-small .ant-table-tbody > tr.row-completed > td div,
                .ant-table-small .ant-table-tbody > tr.row-completed > td a {
                    color: #22c55e !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-problem > td {
                    background: rgba(239, 68, 68, 0.12) !important;
                    color: #ef4444 !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-problem > td span,
                .ant-table-small .ant-table-tbody > tr.row-problem > td div,
                .ant-table-small .ant-table-tbody > tr.row-problem > td a {
                    color: #ef4444 !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td {
                    background: var(--lc-hover) !important;
                    color: var(--lc-text-ter) !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td span,
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td div,
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td a {
                    color: var(--lc-text-ter) !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-cancelled > td .ant-tag {
                    background: var(--lc-border-soft) !important;
                    color: var(--lc-text-ter) !important;
                    border-color: var(--lc-border) !important;
                }
                .ant-table-small .ant-table-tbody > tr.row-selected > td {
                    background: rgba(22, 119, 255, 0.10) !important;
                    box-shadow: inset 2px 0 0 #1677ff;
                }
                .ant-table-small .ant-pagination {
                    margin: 8px 0 !important;
                }
            `}</style>




            {/* ========== ASSIGN DRIVER MODAL ========== */}
            {selectedOrder && (
                <AssignDriverModal
                    open={assignModalOpen}
                    onCancel={() => {
                        setAssignModalOpen(false);
                        setSelectedOrder(null);
                    }}
                    orderId={selectedOrder.id}
                    onSuccess={() => mutateAll()}
                    initialValues={{
                        driverId: selectedOrder.driverId || undefined,
                        partnerId: selectedOrder.partnerId || undefined,
                        assignedDriverName: selectedOrder.assignedDriverName || undefined,
                        assignedDriverPhone: selectedOrder.assignedDriverPhone || undefined,
                        assignedDriverPlate: selectedOrder.assignedDriverPlate || undefined,
                        assignedDriverTrailer: selectedOrder.assignedDriverTrailer || undefined,
                    }}
                />
            )}

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
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--lc-border)', borderRadius: 8, padding: 12 }}>
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
                                    <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', paddingLeft: 24 }}>{item.email}</div>
                                </Checkbox>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 24, background: 'var(--lc-card-2)', borderRadius: 8, marginBottom: 16 }}>
                        <Text type="secondary">В заявке нет сохраненных email-адресов.</Text>
                    </div>
                )}

                <div style={{ borderTop: '1px solid var(--lc-border)', paddingTop: 16 }}>
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
                            <Tag color={statusColors[selectedOrder.status]} style={{ fontSize: 13 }}>{STATUS_LABELS[selectedOrder.status]}</Tag>
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
                                <div style={{ color: 'var(--lc-text-ter)' }}>{pt.location.address}</div>
                            </div>
                        ))}

                        <Title level={5} style={{ marginTop: 16 }}>Водитель</Title>
                        {selectedOrder.assignedDriverName || selectedOrder.driver ? (
                            <Descriptions size="small" column={1}>
                                <Descriptions.Item label="ФИО">
                                    {selectedOrder.assignedDriverName || 
                                     (selectedOrder.driver ? `${selectedOrder.driver.lastName} ${selectedOrder.driver.firstName} ${selectedOrder.driver.middleName || ''}`.trim() : '—')}
                                </Descriptions.Item>
                                <Descriptions.Item label="Телефон">
                                    {selectedOrder.assignedDriverPhone || selectedOrder.driver?.phone || '—'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Госномер">
                                    {selectedOrder.assignedDriverPlate || selectedOrder.driver?.vehiclePlate || '—'}
                                </Descriptions.Item>
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
                        <div style={{ marginBottom: 16 }}>Текущий: <Tag color={statusColors[selectedOrder.status]}>{STATUS_LABELS[selectedOrder.status]}</Tag></div>
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
                    <div style={{ marginBottom: 20, background: 'var(--lc-card-2)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--lc-border)' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13, color: 'var(--lc-text)' }}>Ваша роль в этой сделке:</div>
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
                                        {(() => {
                                            const activeCustomerCompanyId = editCreatorRole === 'CUSTOMER' ? user?.companyId : editCustomerCompanyId;
                                            const activeExecutorCompanyId = editCreatorRole === 'FORWARDER' 
                                                ? (showForwarderField ? editForwarderId : user?.companyId) 
                                                : (isMarketplace ? undefined : editForwarderId);
                                            const groupedOptions = getLocationOptions(activeCustomerCompanyId || undefined, activeExecutorCompanyId || undefined);
                                            return groupedOptions.map(group => (
                                                <Select.OptGroup key={group.label} label={group.label}>
                                                    {group.options.map(l => (
                                                        <Select.Option key={l.id} value={l.id}>
                                                            {l.city ? `[${l.city}] ` : ''}{l.name} ({l.address})
                                                        </Select.Option>
                                                    ))}
                                                </Select.OptGroup>
                                            ));
                                        })()}
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