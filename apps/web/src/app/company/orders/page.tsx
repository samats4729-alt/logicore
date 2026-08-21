'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Tag, Space, Modal, Form, Input, Typography, Drawer, Descriptions, Select, Tooltip, InputNumber, Row, Col, DatePicker, Checkbox, Slider, Alert, Popconfirm, Radio } from 'antd';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
import {
    CheckCircleOutlined,
    EnvironmentOutlined, FlagOutlined, SearchOutlined,
    CloseCircleOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { ArrowUpDown, ChevronRight, Download, Eraser, FileText, Loader2, Mail, Pencil, Plus, Search, SlidersHorizontal, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FeaturedOrderCard from '@/components/ui/FeaturedOrderCard';
import journal from './orders-journal.module.css';
import { api, Location } from '@/lib/api';
import { reportLoadFailure } from '@/lib/load';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import { shortenCompanyName } from '@/lib/company-helper';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import AssignDriverModal from '@/components/AssignDriverModal';
import OrdersMobileList from '@/components/OrdersMobileList';
import { ExportColumnsDialog } from '@/components/orders/ExportColumnsDialog';
import StatusPill, { STATUS_LABELS } from '@/components/ui/StatusPill';

import { useIsMobile } from '@/lib/useIsMobile';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import { lookupCompanyByBin, companyFieldsFromLookup } from '@/lib/company-lookup';
import {
    DEBT_RED,
    getNextStatuses,
    ORDER_STATUS_COLORS as statusColors,
    ORDER_STATUS_PROGRESS as STATUS_PROGRESS,
    isCustomerSettled,
    isExecutorSettled,
    isOrderSettled,
    nameInitials,
    progressColor,
} from '@/lib/order-status';

const { Title, Text } = Typography;
const { TextArea } = Input;


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
    isExternal?: boolean;
    isCustomer?: boolean;
    isCarrier?: boolean;
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
    /** Счета, выставленные заказчику по этому рейсу. Пусто — счёта ещё нет. */
    accountingDocuments?: { document: { id: string; number: string; status: string } }[];
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
    /** Свёрнута ли карточка рейса. Выбор запоминается: логист открывает
     *  этот экран десятки раз в день, и разворачивать её каждый раз заново —
     *  это работа, которую он делать не просил. */
    const [featuredOpen, setFeaturedOpen] = useState(false);
    useEffect(() => {
        try {
            if (localStorage.getItem('lc_orders_featured') === 'open') setFeaturedOpen(true);
        } catch {}
    }, []);
    useEffect(() => {
        try { localStorage.setItem('lc_orders_featured', featuredOpen ? 'open' : 'closed'); } catch {}
    }, [featuredOpen]);

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
    const { data: ordersData, isLoading: loading, error: ordersError, mutate: mutateOrders } = useSWR(
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
            toast.warning('Выберите хотя бы один email для отправки');
            return;
        }

        // Deduplicate emails before sending to prevent duplicate messages
        const uniqueEmails = Array.from(new Set(selectedEmails));

        setSharePoALoading(true);
        try {
            await api.post(`/orders/${selectedOrder?.id}/share-power-of-attorney`, {
                emails: uniqueEmails,
            });
            toast.success('Доверенность успешно отправлена на выбранные email-адреса');
            setSharePoAModalOpen(false);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка отправки доверенности');
        } finally {
            setSharePoALoading(false);
        }
    };

    const handleAddCustomEmail = () => {
        const email = customEmailInput.trim();
        if (!email) return;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            toast.error('Некорректный формат email');
            return;
        }
        
        if (shareEmailsList.some(item => item.email === email)) {
            toast.warning('Этот email уже добавлен');
            return;
        }
        
        if (shareEmailsList.length >= 15) {
            toast.warning('Максимум 15 получателей');
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
    const [createForm] = Form.useForm();
    const [locations, setLocations] = useState<Location[]>([]);
    const [cargoCategories, setCargoCategories] = useState<any[]>([]);
    const [routePointsState, setRoutePointsState] = useState<Array<LocationState & { pointType: string, expectedDate?: string }>>([
        { city: '', address: '', pointType: 'PICKUP' },
        { city: '', address: '', pointType: 'DELIVERY' }
    ]);
    const [forwarders, setForwarders] = useState<Partner[]>([]);
    const [isMarketplace, setIsMarketplace] = useState(false);
    const [appliedTariff, setAppliedTariff] = useState<any>(null);
    const [tariffLoading, setTariffLoading] = useState(false);
    const [profileComplete, setProfileComplete] = useState(true);
    const [showCustomerField, setShowCustomerField] = useState(false);
    const [showForwarderField, setShowForwarderField] = useState(true);
    const [creatorRole, setCreatorRole] = useState<'CUSTOMER' | 'FORWARDER'>('CUSTOMER');

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
            toast.success('Контрагент успешно добавлен');
            setQuickPartnerModalOpen(false);
            quickPartnerForm.resetFields();
            await fetchPartners();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка при создании контрагента');
        } finally {
            setQuickPartnerLoading(false);
        }
    };

    // Watches for create form
    const createCustomerCompanyId = Form.useWatch('customerCompanyId', createForm);
    const createForwarderId = Form.useWatch('forwarderId', createForm);

    // Watches for edit form

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
            toast.error('Ошибка загрузки водителей');
        } finally {
            setDriversLoading(false);
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
            const partnersList = partnersRes.data.map((p: any) => ({
                ...p,
                isCustomer: p.isCustomer ?? true,
                isCarrier: p.isCarrier ?? true,
            }));
            const externalList = externalRes.data.map((e: any) => ({
                id: e.id,
                name: e.name,
                isExternal: true,
                isCustomer: !!e.isCustomer,
                isCarrier: !!e.isCarrier,
            }));
            const ownCompany = profileRes.data ? [{ id: profileRes.data.id, name: `${profileRes.data.name} (Моя компания)`, isCustomer: true, isCarrier: true }] : [];
            const combined = [...ownCompany, ...partnersList, ...externalList];
            setPartners(combined);
            setForwarders(combined);
        } catch (e: any) { reportLoadFailure('список контрагентов', e); } finally {
            setPartnersLoading(false);
        }
    };

    const fetchForwarders = async () => {};

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch (e: any) { reportLoadFailure('справочник адресов', e); }
    };

    const fetchCargoTypes = async () => {
        try {
            const response = await api.get('/cargo-types');
            setCargoCategories(response.data);
        } catch (e: any) { reportLoadFailure('виды груза', e); }
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
    // Период: по какой дате и с какой по какую. Отдельно от «Откуда/Куда» —
    // те фильтры про города, несмотря на похожие имена.
    const [periodField, setPeriodField] = useState<'pickup' | 'created'>('pickup');
    const [periodFrom, setPeriodFrom] = useState<dayjs.Dayjs | null>(null);
    const [periodTo, setPeriodTo] = useState<dayjs.Dayjs | null>(null);
    const [filterSumMin, setFilterSumMin] = useState<number | undefined>(undefined);
    const [filterSumMax, setFilterSumMax] = useState<number | undefined>(undefined);
    const [query, setQuery] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [sortDesc, setSortDesc] = useState(true);
    const searchRef = useRef<HTMLInputElement>(null);

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

    /**
     * Отбор по периоду.
     *
     * Дат у рейса две, и они про разное: когда заявку завели и когда машина
     * грузилась. Бухгалтер закрывает месяц по второй, логист ищет свежие
     * заявки по первой — поэтому какую считать, выбирается рядом, а не
     * решено за них. По умолчанию погрузка: ею живёт работа.
     *
     * Рейс без даты погрузки в отбор по ней не попадает — и это честно:
     * молча подставлять вместо неё дату создания значило бы показать в
     * августе рейс, который никто в августе не грузил.
     */
    const inPeriod = useCallback((o: Order) => {
        if (!periodFrom && !periodTo) return true;
        const raw = periodField === 'pickup'
            ? (o.routePoints?.find(p => p.pointType === 'PICKUP') as any)?.expectedDate
            : o.createdAt;
        if (!raw) return false;
        const day = dayjs(raw);
        if (periodFrom && day.isBefore(periodFrom, 'day')) return false;
        if (periodTo && day.isAfter(periodTo, 'day')) return false;
        return true;
    }, [periodFrom, periodTo, periodField]);

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
            if (!inPeriod(o)) return false;
            return true;
        });
    }, [orders, filterCompany, filterForwarder, filterExpeditor, filterDriver, filterStatus, filterFrom, filterTo, filterSumMin, filterSumMax, inPeriod]);

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
            if (!inPeriod(o)) return false;
            return true;
        });
    }, [archiveOrders, filterCompany, filterDriver, filterStatus, filterFrom, filterTo, filterSumMin, filterSumMax, inPeriod]);

    const hasActiveFilters = filterCompany || filterForwarder || filterExpeditor || filterDriver || filterStatus || filterFrom || filterTo || filterSumMin !== undefined || filterSumMax !== undefined || !!periodFrom || !!periodTo;

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
        setPeriodFrom(null);
        setPeriodTo(null);
    };

    useEffect(() => {
        clearFilters();
    }, [activeTab]);

    // =================== ПОИСК И ПОРЯДОК ===================
    // Поиск и порядок наложены поверх готовых списков, а не встроены в
    // фильтры: условия фильтров задаёт панель, а это — два отдельных органа
    // управления в полосе, и смешивать их состояние незачем.

    const searchable = (o: Order) => [
        o.orderNumber,
        o.customerCompany?.name,
        o.forwarder?.name,
        o.subForwarder?.name,
        o.partner?.name,
        o.assignedDriverName,
        o.assignedDriverPlate,
        extractCity(o, 'pickup'),
        extractCity(o, 'delivery'),
    ].filter(Boolean).join(' ').toLowerCase();

    const applyQueryAndSort = (list: Order[]) => {
        const q = query.trim().toLowerCase();
        const found = q ? list.filter(o => searchable(o).includes(q)) : list;
        return [...found].sort((a, b) => {
            const d = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            return sortDesc ? d : -d;
        });
    };

    const visibleOrders = useMemo(
        () => applyQueryAndSort(filteredOrders),
        [filteredOrders, query, sortDesc],
    );
    const visibleArchiveOrders = useMemo(
        () => applyQueryAndSort(filteredArchiveOrders),
        [filteredArchiveOrders, query, sortDesc],
    );

    const activeFilterCount = [
        filterCompany, filterForwarder, filterExpeditor, filterDriver, filterStatus,
        filterFrom, filterTo,
        filterSumMin !== undefined ? 'min' : undefined,
        filterSumMax !== undefined ? 'max' : undefined,
        periodFrom || periodTo ? 'период' : undefined,
    ].filter(Boolean).length;

    const isArchive = activeTab === 'archive';
    const totalCount = isArchive ? totalArchiveOrders : totalOrders;
    const shownCount = isArchive ? visibleArchiveOrders.length : visibleOrders.length;

    /**
     * Выгрузить в Excel то, что сейчас отобрано.
     *
     * Список уходит на сервер поимённо: отбор живёт в браузере, и повторять
     * его условия на сервере значило бы завести вторую правду — рано или
     * поздно файл разошёлся бы с тем, что человек видит на экране.
     */
    const [exporting, setExporting] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    /** Кнопка открывает выбор колонок: файл собирается по нему. */
    const openExport = () => {
        const rows = isArchive ? visibleArchiveOrders : visibleOrders;
        if (!rows.length) {
            toast.warning('Нечего выгружать: в списке нет заявок');
            return;
        }
        setExportOpen(true);
    };

    const handleExport = async (columns: string[]) => {
        const rows = isArchive ? visibleArchiveOrders : visibleOrders;
        if (!rows.length) {
            toast.warning('Нечего выгружать: в списке нет заявок');
            return;
        }
        setExporting(true);
        try {
            const res = await api.post(
                '/orders/export',
                { orderIds: rows.map((row: any) => row.id), columns },
                { responseType: 'blob' },
            );
            const url = window.URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Заявки_${dayjs().format('YYYY-MM-DD')}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success(`Выгружено заявок: ${rows.length}`);
            // Закрываем только когда файл ушёл: после отказа окно остаётся
            // с уже отмеченными колонками, чтобы не собирать отбор заново.
            setExportOpen(false);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось выгрузить в Excel');
        } finally {
            setExporting(false);
        }
    };
    const isNarrowed = activeFilterCount > 0 || query.trim().length > 0;

    const clearAllFilters = () => {
        clearFilters();
        setQuery('');
    };

    // Подсказка «⌘K» в поле поиска обязана работать: нарисованная клавиша,
    // которая ничего не делает, — обман.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
            e.preventDefault();
            searchRef.current?.focus();
            searchRef.current?.select();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

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
                toast.success(`Тариф: ${response.data.price.toLocaleString('ru-RU')} ₸`);
            } else { setAppliedTariff(null); }
        } catch { setAppliedTariff(null); } finally { setTariffLoading(false); }
    };

    // =================== INCOMING HANDLERS ===================

    const showOrderDetail = (order: Order) => { setSelectedOrder(order); setDetailDrawerOpen(true); };



    const openAssignModal = (order: Order) => {
        setSelectedOrder(order);
        setAssignModalOpen(true);
    };


    const handleStatusChange = async (values: { status: string; comment?: string }) => {
        if (!selectedOrder) return;
        setStatusLoading(true);
        try {
            await api.put(`/company/orders/${selectedOrder.id}/status`, values);
            toast.success('Статус обновлён');
            mutateAll();
            setStatusModalOpen(false); setDetailDrawerOpen(false);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка');
        } finally { setStatusLoading(false); }
    };

    const handleAccept = async (orderId: string) => {
        try {
            await api.put(`/company/orders/${orderId}/accept`);
            toast.success('Заявка принята в работу');
            mutateAll();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка принятия заявки');
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
                    toast.success('Заявка отклонена');
                    mutateAll();
                } catch (error: any) {
                    toast.error(error.response?.data?.message || 'Ошибка отклонения заявки');
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
                    if (p.pointType === 'PICKUP') { toast.error('Заполните адрес погрузки'); return; }
                    if (p.pointType === 'DELIVERY') { toast.error('Заполните адрес выгрузки'); return; }
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
                toast.error('Укажите минимум 2 точки маршрута');
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
            toast.success('Заявка создана');
            mutateAll();
            
            // Автоматически переключаемся на вкладку «Все заявки»
            setActiveTab('all');

            setCreateModalOpen(false); createForm.resetFields();
        } catch (error: any) { toast.error(error.response?.data?.message || 'Ошибка создания'); }
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

    /**
     * Номера, по которым заказчик находит рейс у себя: накладная и его
     * собственный номер.
     *
     * Одной графой, а не двумя: журнал и так широкий, а номера читают
     * вместе — бухгалтер сверяет по ним счёт, не открывая заявку. Пустых
     * подписей в ячейке нет, поэтому у обычного рейса это просто прочерк.
     */
    const numbersColumn = {
        title: 'Номера', key: 'transportNumbers', width: 116, ellipsis: true,
        render: (_: any, r: Order) => {
            const ttn = (r as any).ttnNumber?.trim();
            const ref = (r as any).customerRefNumber?.trim();
            if (!ttn && !ref) return <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
            const полностью = [ttn && `ТТН ${ttn}`, ref && `№ заказчика ${ref}`].filter(Boolean).join(' · ');
            return (
                <Tooltip title={полностью}>
                    <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--nova-fg-2)' }}>
                        {[ttn, ref].filter(Boolean).join(' · ')}
                    </span>
                </Tooltip>
            );
        },
    };

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
            // `ellipsis` обязателен: без него длинный номер выезжал в соседний
            // столбец. Подсказка возвращает то, что обрезано.
            title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 124, ellipsis: true,
            render: (t: string) => <Tooltip title={t}><span className="lc-ordernum">{t}</span></Tooltip>,
        },
        ...orgColumn,
        numbersColumn,
        {
            title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80,
            render: (d: string) => <span style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span>,
        },
        {
            title: 'Дата погр.', key: 'pickupDate', width: 90,
            render: (_: any, r: Order) => {
                const pickupPt = r.routePoints?.find(p => p.pointType === 'PICKUP');
                const date = (pickupPt as any)?.expectedDate;
                return date
                    ? <span style={{ fontSize: 11, color: 'var(--nova-fg-2)' }}>{dayjs(date).format('DD.MM.YY')}</span>
                    : <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Заказчик', key: 'customer', width: 130, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = r.customerCompany?.name || '—';
                const owesUs = !isCustomerSettled(r);
                return (
                    <Tooltip title={owesUs ? `${name} — не оплатил` : name}>
                        <span style={{ fontSize: 12, fontWeight: owesUs ? 600 : (r.customerCompanyId === user?.companyId ? 600 : undefined), color: owesUs ? DEBT_RED : undefined }}>{shortenCompanyName(name)}</span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Перевозчик', key: 'forwarder', width: 130, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = (r.forwarderId === user?.companyId && r.subForwarder) ? r.subForwarder.name : (r.forwarder?.name || r.subForwarder?.name || r.partner?.name || '—');
                const weOwe = !isExecutorSettled(r);
                return (
                    <Tooltip title={weOwe ? `${name} — не оплачено` : name}>
                        <span style={{ fontSize: 12, fontWeight: weOwe ? 600 : (r.forwarderId === user?.companyId ? 600 : undefined), color: weOwe ? DEBT_RED : undefined }}>{shortenCompanyName(name)}</span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Водитель', key: 'drv', width: 140, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = r.assignedDriverName || (r.driver ? `${r.driver.lastName} ${r.driver.firstName.substring(0, 1)}.` : '');
                if (!name) return <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
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
                if (!from && !to) return <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
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
                return <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Ставка зак.', key: 'customerPrice', width: 100, align: 'right' as const,
            render: (_: any, r: Order) => {
                return r.customerPrice
                    ? <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.customerPrice.toLocaleString('ru-RU')}</span>
                    : <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Ставка перев.', key: 'carrierPrice', width: 100, align: 'right' as const,
            render: (_: any, r: Order) => {
                const cost = r.driverCost || (r as any).subForwarderPrice;
                return cost
                    ? <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--nova-neg)' }}>{cost.toLocaleString('ru-RU')}</span>
                    : <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
            },
        },
        {
            // Выставлен ли счёт. Раньше понять это можно было, только сверяя
            // список заявок с журналом счетов вручную — и рейсы забывались.
            title: 'Счёт', key: 'invoice', width: 92,
            render: (_: any, r: Order) => {
                const invoice = r.accountingDocuments?.[0]?.document;
                if (!invoice) {
                    return <span style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>не выставлен</span>;
                }
                return (
                    <Tooltip title={`Счёт № ${invoice.number}`}>
                        <span
                            style={{ fontSize: 11, fontWeight: 600, color: 'var(--nova-accent)', cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); router.push(`/company/accounting/invoices/${invoice.id}`); }}
                        >
                            № {invoice.number}
                        </span>
                    </Tooltip>
                );
            },
        },
        /* Правка прямо из строки.
           Изменить ставку можно было и раньше, но путь был неочевидный:
           щёлкнуть по строке, дождаться боковой панели и найти там
           «Редактировать заявку». Бухгалтер этого не нашла и решила, что
           править нечем. Карандаш стоит там, где его ищут. */
        {
            title: '', key: 'actions', width: 80, fixed: 'right' as const,
            render: (_: any, r: Order) => (
                <div style={{ display: 'flex', gap: 2 }}>
                    <Tooltip title="Изменить заявку и суммы">
                        <Button
                            variant="link"
                            size="sm"
                            aria-label="Изменить заявку и суммы"
                            className="h-7 w-7 px-0"
                            /* Правка — той же формой, что и заведение: отдельное
                               окно было второй формой той же заявки и отставало
                               от неё полями. */
                            onClick={(e) => { e.stopPropagation(); router.push(`/company/orders/create?edit=${r.id}`); }}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    </Tooltip>
                    <Tooltip title="Открыть заявку">
                        <Button variant="link" size="sm" aria-label="Открыть заявку" className="h-7 w-7 px-0" onClick={(e) => { e.stopPropagation(); router.push(`/company/orders/${r.id}`); }}><ChevronRight className="h-4 w-4" /></Button>
                    </Tooltip>
                </div>
            ),
        },
    ];

    const archiveColumns = [
        {
            title: 'Статус', dataIndex: 'status', key: 'status', width: 110, fixed: 'left' as const,
            render: (s: string) => <StatusPill status={s} />,
        },
        { title: '№', dataIndex: 'orderNumber', key: 'orderNumber', width: 124, ellipsis: true, render: (t: string) => <Tooltip title={t}><span className="lc-ordernum">{t}</span></Tooltip> },
        ...orgColumn,
        numbersColumn,
        { title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 80, render: (d: string) => <span style={{ fontSize: 11, color: 'var(--nova-fg-3)' }}>{new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</span> },
        {
            title: 'Дата погр.', key: 'pickupDate', width: 90,
            render: (_: any, r: Order) => {
                const pickupPt = r.routePoints?.find(p => p.pointType === 'PICKUP');
                const date = (pickupPt as any)?.expectedDate;
                return date ? <span style={{ fontSize: 11, color: 'var(--nova-fg-2)' }}>{dayjs(date).format('DD.MM.YY')}</span> : <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Заказчик', key: 'customer', width: 130, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = r.customerCompany?.name || '—';
                const owesUs = !isCustomerSettled(r);
                return (
                    <Tooltip title={owesUs ? `${name} — не оплатил` : name}>
                        <span style={{ fontSize: 12, fontWeight: owesUs ? 600 : (r.customerCompanyId === user?.companyId ? 600 : undefined), color: owesUs ? DEBT_RED : undefined }}>{shortenCompanyName(name)}</span>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Перевозчик', key: 'forwarder', width: 130, ellipsis: true,
            render: (_: any, r: Order) => {
                const name = (r.forwarderId === user?.companyId && r.subForwarder) ? r.subForwarder.name : (r.forwarder?.name || r.subForwarder?.name || r.partner?.name || '—');
                const weOwe = !isExecutorSettled(r);
                return (
                    <Tooltip title={weOwe ? `${name} — не оплачено` : name}>
                        <span style={{ fontSize: 12, fontWeight: weOwe ? 600 : (r.forwarderId === user?.companyId ? 600 : undefined), color: weOwe ? DEBT_RED : undefined }}>{shortenCompanyName(name)}</span>
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
                if (!from && !to) return <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
                return <span style={{ fontSize: 12, fontWeight: 500 }}>{from || '?'} → {to || '?'}</span>;
            },
        },
        {
            title: 'Менеджер', key: 'manager', width: 110, ellipsis: true,
            render: (_: any, r: Order) => {
                if (r.responsibleManager) {
                    return <span style={{ fontSize: 12 }}>{r.responsibleManager.lastName} {r.responsibleManager.firstName?.substring(0, 1)}.</span>;
                }
                return <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
            },
        },
        {
            title: 'Ставка зак.', key: 'customerPrice', width: 100, align: 'right' as const,
            render: (_: any, r: Order) => r.customerPrice ? <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.customerPrice.toLocaleString('ru-RU')}</span> : <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>,
        },
        {
            title: 'Ставка перев.', key: 'carrierPrice', width: 100, align: 'right' as const,
            render: (_: any, r: Order) => {
                const cost = r.driverCost || (r as any).subForwarderPrice;
                return cost ? <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--nova-neg)' }}>{cost.toLocaleString('ru-RU')}</span> : <span style={{ color: 'var(--nova-fg-3)', fontSize: 11 }}>—</span>;
            },
        },
        { title: '', key: 'actions', width: 50, fixed: 'right' as const, render: (_: any, r: Order) => (
            <Tooltip title="Открыть заявку">
                <Button variant="link" size="sm" aria-label="Открыть заявку" className="h-7 w-7 px-0" onClick={(e) => { e.stopPropagation(); router.push(`/company/orders/${r.id}`); }}><ChevronRight className="h-4 w-4" /></Button>
            </Tooltip>
        ) },
    ];

    // =================== RENDER ===================

    // Карточка рейса показывает то, что видно в списке первой строкой: если
    // список сужен условиями, показывать рейс не из него — сбивать с толку.
    const featured = previewOrder || visibleOrders[0] || orders[0] || null;

    // Один клик по строке — показать заявку на карте (не проваливаться внутрь)
    const handleRowSelect = (record: Order) => {
        setPreviewOrder(record);
        featuredCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    return (
        <div className={journal.page}>
            {/* ===== HERO =====
                Плитки показателей («Всего заявок», «Сейчас в пути»,
                «Ожидают назначения», «Проблемы») убраны по решению владельца:
                они занимали верх экрана, а отвечали на вопросы, ради которых
                на журнал не заходят. Их место занял сам список. */}
            <div className={journal.hero}>
                <div>
                    <div className={journal.eyebrow}>Заявки · журнал</div>
                    <h1 className={journal.title}>Заявки компании</h1>
                </div>
                <Button
                    data-guide="orders-create"
                    className="lc-cta lc-cta-shine"
                    onClick={() => router.push('/company/orders/create')}
                >
                    <Plus className="h-4 w-4" /> Создать заявку
                </Button>
            </div>

            {/* ===== FEATURED: выбранная / последняя заявка =====
                Карточка занимала треть экрана и показывала один рейс, который
                и так есть первой строкой в таблице ниже. Свёрнута по умолчанию,
                выбор запоминается: экран открывается на списке, а не на
                украшении. Стрелка сворачивания живёт в шапке самой карточки. */}
            <div ref={featuredCardRef}>
                <FeaturedOrderCard
                    order={featured}
                    onOpen={(id) => router.push(`/company/orders/${id}`)}
                    collapsed={!featuredOpen}
                    onToggle={() => setFeaturedOpen(!featuredOpen)}
                />
            </div>

            {/* ===== КАРТОЧКА СПИСКА =====
                Полоса управления живёт первой строкой внутри карточки, а не
                над ней: она управляет списком, а не страницей. */}
            <div className={journal.tablecard}>
                <div className={journal.controls}>
                    <div className={journal.tabs}>
                        <button
                            type="button"
                            className={activeTab === 'all' ? `${journal.tab} ${journal.tabActive}` : journal.tab}
                            onClick={() => setActiveTab('all')}
                        >
                            Все заявки <span>{totalOrders}</span>
                        </button>
                        <button
                            type="button"
                            className={activeTab === 'archive' ? `${journal.tab} ${journal.tabActive}` : journal.tab}
                            onClick={() => setActiveTab('archive')}
                        >
                            Архив <span>{totalArchiveOrders}</span>
                        </button>
                    </div>

                    <div className={journal.search}>
                        <Search className={journal.searchIcon} size={14} />
                        <input
                            ref={searchRef}
                            className={journal.searchInput}
                            placeholder="Номер, город, заказчик…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            aria-label="Поиск по заявкам"
                        />
                        <span className={journal.searchKey}>⌘K</span>
                    </div>

                    <button
                        type="button"
                        className={journal.control}
                        aria-expanded={filtersOpen}
                        onClick={() => setFiltersOpen(!filtersOpen)}
                    >
                        <SlidersHorizontal size={14} /> Фильтры
                        {activeFilterCount > 0 && <span className={journal.badge}>{activeFilterCount}</span>}
                    </button>

                    <Tooltip title={sortDesc ? 'Сначала новые' : 'Сначала старые'}>
                        <button
                            type="button"
                            className={journal.iconControl}
                            aria-label={sortDesc ? 'Порядок: сначала новые' : 'Порядок: сначала старые'}
                            onClick={() => setSortDesc(!sortDesc)}
                        >
                            <ArrowUpDown size={14} />
                        </button>
                    </Tooltip>

                    {/* Отвечает на вопрос, ради которого раньше смотрели на ряд
                        плашек с условиями: почему в списке 10 строк, а не 37.
                        Сами плашки владелец отверг — они переползали на вторую
                        строку и создавали кашу. */}
                    <span className={journal.selected}>
                        {isNarrowed ? (
                            <>
                                Отобрано <b>{shownCount}</b> из {totalCount}
                                {' · '}
                                <button type="button" className={journal.reset} onClick={clearAllFilters}>сбросить</button>
                            </>
                        ) : (
                            <>Всего {totalCount}</>
                        )}
                    </span>
                    {/* Выгрузка стоит рядом со счётчиком отобранного: это
                        действие над списком, а не над страницей. */}
                    <Button
                        variant="outline"
                        size="sm"
                        className={journal.exportBtn}
                        disabled={exporting || shownCount === 0}
                        onClick={openExport}
                    >
                        {exporting
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Download className="h-4 w-4" />}
                        Выгрузить в Excel
                    </Button>
                </div>

                {filtersOpen && (
                    <div className={journal.filters}>
                        <Select
                            size="small" allowClear showSearch optionFilterProp="children"
                            placeholder={isArchive ? 'Контрагент' : 'Заказчик'} style={{ width: 150 }}
                            value={filterCompany} onChange={setFilterCompany}
                        >
                            {(isArchive ? uniqueArchiveCompanies : uniqueCompanies).map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                        </Select>
                        {!isArchive && (
                            <Select
                                size="small" allowClear showSearch optionFilterProp="children"
                                placeholder="Исполнитель" style={{ width: 140 }}
                                value={filterForwarder} onChange={setFilterForwarder}
                            >
                                {uniqueForwarders.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                            </Select>
                        )}
                        {!isArchive && (
                            <Select
                                size="small" allowClear showSearch optionFilterProp="children"
                                placeholder="Экспедитор" style={{ width: 140 }}
                                value={filterExpeditor} onChange={setFilterExpeditor}
                            >
                                {uniqueExpeditors.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                            </Select>
                        )}
                        <Select
                            size="small" allowClear showSearch optionFilterProp="children"
                            placeholder="Водитель" style={{ width: 140 }}
                            value={filterDriver} onChange={setFilterDriver}
                        >
                            {(isArchive ? uniqueArchiveDrivers : uniqueDrivers).map(d => <Select.Option key={d} value={d}>{d}</Select.Option>)}
                        </Select>
                        {!isArchive && (
                            <Select
                                size="small" allowClear
                                placeholder="Статус" style={{ width: 130 }}
                                value={filterStatus} onChange={setFilterStatus}
                            >
                                {uniqueStatuses.map(s => <Select.Option key={s} value={s}>{STATUS_LABELS[s] || s}</Select.Option>)}
                            </Select>
                        )}
                        <Select
                            size="small" allowClear showSearch optionFilterProp="children"
                            placeholder="Откуда" style={{ width: 120 }}
                            value={filterFrom} onChange={setFilterFrom}
                        >
                            {(isArchive ? uniqueArchiveFromCities : uniqueFromCities).map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                        </Select>
                        <Select
                            size="small" allowClear showSearch optionFilterProp="children"
                            placeholder="Куда" style={{ width: 120 }}
                            value={filterTo} onChange={setFilterTo}
                        >
                            {(isArchive ? uniqueArchiveToCities : uniqueToCities).map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                        </Select>
                        {/* Период. Какую дату считать — рядом, а не решено за
                            человека: бухгалтер закрывает месяц по погрузке,
                            логист ищет свежие заявки по дате заведения. */}
                        <Select
                            size="small" style={{ width: 128 }}
                            value={periodField} onChange={setPeriodField}
                            aria-label="По какой дате отбирать"
                        >
                            <Select.Option value="pickup">По погрузке</Select.Option>
                            <Select.Option value="created">По заведению</Select.Option>
                        </Select>
                        <RangePicker
                            size="small" style={{ width: 220 }} format="DD.MM.YYYY"
                            placeholder={['Дата с', 'Дата по']}
                            value={periodFrom || periodTo ? [periodFrom, periodTo] as any : null}
                            onChange={(range) => {
                                setPeriodFrom(range?.[0] ?? null);
                                setPeriodTo(range?.[1] ?? null);
                            }}
                        />
                        <InputNumber
                            size="small" placeholder="Сумма от" style={{ width: 100 }}
                            value={filterSumMin} onChange={v => setFilterSumMin(v ?? undefined)}
                            min={0} controls={false}
                        />
                        <InputNumber
                            size="small" placeholder="Сумма до" style={{ width: 100 }}
                            value={filterSumMax} onChange={v => setFilterSumMax(v ?? undefined)}
                            min={0} controls={false}
                        />
                        {hasActiveFilters && (
                            <Button variant="link" size="sm" className="text-destructive" onClick={clearFilters}>
                                <Eraser className="h-3.5 w-3.5" /> Сбросить условия
                            </Button>
                        )}
                    </div>
                )}

                <div className={journal.tableWrap}>
                    {isArchive ? (
                        isMobile ? (
                            <OrdersMobileList
                                orders={visibleArchiveOrders}
                                loading={archiveLoading}
                                userCompanyId={user?.companyId}
                                extractCity={extractCity}
                                onOpen={(id) => router.push(`/company/orders/${id}`)}
                                pagination={{
                                    current: archivePage,
                                    pageSize: archivePageSize,
                                    total: isNarrowed ? visibleArchiveOrders.length : totalArchiveOrders,
                                    onChange: (p, ps) => { setArchivePage(p); setArchivePageSize(ps); },
                                }}
                            />
                        ) : (
                            <Table
                                columns={archiveColumns}
                                dataSource={visibleArchiveOrders}
                                rowKey="id"
                                loading={archiveLoading}
                                size="small"
                                scroll={{ x: 1400 }}
                                pagination={{
                                    current: archivePage,
                                    pageSize: archivePageSize,
                                    total: totalArchiveOrders,
                                    onChange: (p, ps) => { setArchivePage(p); setArchivePageSize(ps); },
                                    showSizeChanger: true,
                                    pageSizeOptions: ['20', '50', '100'],
                                    size: 'small',
                                    showTotal: (t, range) => `Показаны ${range[0]}–${range[1]} из ${t}`,
                                }}
                                onRow={(record) => ({
                                    style: { cursor: 'pointer' },
                                    onClick: () => handleRowSelect(record),
                                    onDoubleClick: () => router.push(`/company/orders/${record.id}`),
                                })}
                                rowClassName={(record) => (previewOrder?.id === record.id ? 'row-selected row-cancelled' : 'row-cancelled')}
                            />
                        )
                    ) : (
                        isMobile ? (
                            <OrdersMobileList
                                orders={visibleOrders}
                                loading={loading}
                                userCompanyId={user?.companyId}
                                extractCity={extractCity}
                                onOpen={(id) => router.push(`/company/orders/${id}`)}
                                pagination={{
                                    current: ordersPage,
                                    pageSize: ordersPageSize,
                                    /* Считаем то, что осталось после условий, а не
                                       сколько заявок всего. Иначе под пустой
                                       таблицей стоит «Показаны 1–8 из 8», и человек
                                       решает, что список сломался. */
                                    total: isNarrowed ? visibleOrders.length : totalOrders,
                                    onChange: (p, ps) => { setOrdersPage(p); setOrdersPageSize(ps); },
                                }}
                            />
                        ) : (
                            <Table
                                columns={columns}
                                dataSource={visibleOrders}
                                rowKey="id"
                                loading={loading}
                                size="small"
                                scroll={{ x: 1400 }}
                                /* «Нет данных» при упавшем запросе — это неправда,
                                   и именно на неё человек и опирается. */
                                locale={{
                                    emptyText: ordersError
                                        ? 'Список не загрузился. Обновите страницу.'
                                        : (isNarrowed ? 'Под условия ничего не подошло' : 'Заявок пока нет'),
                                }}
                                pagination={{
                                    current: ordersPage,
                                    pageSize: ordersPageSize,
                                    total: totalOrders,
                                    onChange: (p, ps) => { setOrdersPage(p); setOrdersPageSize(ps); },
                                    showSizeChanger: true,
                                    pageSizeOptions: ['20', '50', '100'],
                                    size: 'small',
                                    showTotal: (t, range) => `Показаны ${range[0]}–${range[1]} из ${t}`,
                                }}
                                onRow={(record) => ({
                                    style: { cursor: 'pointer' },
                                    onClick: () => handleRowSelect(record),
                                    onDoubleClick: () => router.push(`/company/orders/${record.id}`),
                                })}
                                rowClassName={(record) => {
                                    const sel = previewOrder?.id === record.id ? 'row-selected ' : '';
                                    // Завершённую заявку строкой не подсвечиваем — статус виден по плашке,
                                    // а долг (если есть) горит красным на названии контрагента.
                                    if (record.status === 'PROBLEM') return sel + 'row-problem';
                                    if (record.status === 'CANCELLED') return sel + 'row-cancelled';
                                    return sel;
                                }}
                            />
                        )
                    )}
                </div>
            </div>





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
                                    <div style={{ fontSize: 11, color: 'var(--nova-fg-3)', paddingLeft: 24 }}>{item.email}</div>
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
                        <Button variant="outline" className="border-dashed" onClick={handleAddCustomEmail}>
                            <Plus className="h-4 w-4" /> Добавить
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* ========== ORDER DETAIL DRAWER ========== */}
            <Drawer title={`Заявка ${selectedOrder?.orderNumber}`} open={detailDrawerOpen} onClose={() => setDetailDrawerOpen(false)} width={500}>
                {selectedOrder && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <StatusPill status={selectedOrder.status} />
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
                                <div style={{ color: 'var(--nova-fg-3)' }}>{pt.location.address}</div>
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
                        ) : <span className={`${nova.chip} ${nova.chipWarn}`}>Не назначен</span>}

                        <div style={{ marginTop: 24 }}>
                            <Button className="w-full" onClick={() => { setDetailDrawerOpen(false); openAssignModal(selectedOrder); }}>
                                <UserPlus className="h-4 w-4" /> {selectedOrder.assignedDriverName ? 'Изменить водителя' : 'Назначить водителя'}
                            </Button>
                            {(selectedOrder.assignedDriverName || selectedOrder.driverId) && (
                                <>
                                    <Button
                                        variant="outline"
                                        className="mt-2 w-full"
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
                                                toast.error('Ошибка скачивания доверенности');
                                            }
                                        }}
                                    >
                                        <FileText className="h-4 w-4" /> Скачать доверенность
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="mt-2 w-full"
                                        onClick={() => openSharePoAModal(selectedOrder)}
                                    >
                                        <Mail className="h-4 w-4" /> Отправить по email
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="outline"
                                className="mt-2 w-full"
                                onClick={() => router.push(`/company/orders/create?edit=${selectedOrder.id}`)}
                            >
                                <Pencil className="h-4 w-4" /> Редактировать заявку
                            </Button>
                            {getNextStatuses(selectedOrder.status).length > 0 && (
                                <Button className="mt-2 w-full" onClick={() => { statusForm.resetFields(); setStatusModalOpen(true); }}>
                                    Изменить статус
                                </Button>
                            )}
                            {selectedOrder.status !== 'CANCELLED' && selectedOrder.status !== 'COMPLETED' && (
                                <Popconfirm
                                    title="Отменить заявку?"
                                    description={((selectedOrder as any).isCustomerPaid || (selectedOrder as any).isExecutorPaid)
                                        ? 'По заявке есть проведённые оплаты. При отмене они останутся в учёте — при необходимости оформите возврат или спишите как убыток.'
                                        : 'Вы уверены, что хотите отменить эту заявку?'}
                                    onConfirm={async () => {
                                        try {
                                            await api.put(`/orders/${selectedOrder.id}/status`, { status: 'CANCELLED', comment: 'Отменено пользователем' });
                                            toast.success('Заявка отменена');
                                            mutateAll();
                                            setDetailDrawerOpen(false);
                                        } catch (error: any) {
                                            try {
                                                await api.put(`/company/orders/${selectedOrder.id}/status`, { status: 'CANCELLED', comment: 'Отменено пользователем' });
                                                toast.success('Заявка отменена');
                                                mutateAll();
                                                setDetailDrawerOpen(false);
                                            } catch (err: any) {
                                                toast.error(err.response?.data?.message || 'Ошибка отмены');
                                            }
                                        }
                                    }}
                                    okText="Да, отменить"
                                    cancelText="Нет"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button variant="destructive" className="mt-2 w-full">
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
                        <div style={{ marginBottom: 16 }}>Текущий: <StatusPill status={selectedOrder.status} /></div>
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
                            const found = await lookupCompanyByBin(changedValues.bin);
                            if (found) quickPartnerForm.setFieldsValue(companyFieldsFromLookup(found));
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
        <ExportColumnsDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            count={(isArchive ? visibleArchiveOrders : visibleOrders).length}
            exporting={exporting}
            onExport={handleExport}
        />
        </div>
    );
}