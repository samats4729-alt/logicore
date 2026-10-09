'use client';

import { Suspense, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Modal, Form, Input, Typography, Drawer, Descriptions, Select, Checkbox, Popconfirm } from 'antd';
import dayjs from 'dayjs';

import { ArrowUpDown, Download, FileText, KanbanSquare, Loader2, Mail, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Table2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, Location } from '@/lib/api';
import { reportLoadFailure } from '@/lib/load';
import { useAuthStore } from '@/store/auth';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import AssignDriverModal from '@/components/AssignDriverModal';
import OrdersMobileList from '@/components/OrdersMobileList';
import { ExportColumnsDialog } from '@/components/orders/ExportColumnsDialog';
import { TableColumnsButton } from '@/components/orders/TableColumnsButton';
import { DEFAULT_REF_LABEL } from '@/components/orders/TransportNumbers';
import { AllFiltersSheet } from '@/components/orders/journal/AllFiltersSheet';
import { buildColumns } from '@/components/orders/journal/columns';
import { FacetFilter } from '@/components/orders/journal/FacetFilter';
import { OrderPreviewDialog } from '@/components/orders/journal/OrderPreviewDialog';
import { OrdersBoard } from '@/components/orders/journal/OrdersBoard';
import { JournalPagination, OrdersTable, useFillHeight } from '@/components/orders/journal/OrdersTable';
import type { JournalOrder } from '@/components/orders/journal/types';
import { OrderWizardDialog, type WizardRequest } from '@/components/orders/wizard/OrderWizardDialog';
import { needsCompletionReview } from '@/lib/completion-review';
import StatusPill, { STATUS_LABELS } from '@/components/ui/StatusPill';

import { useIsMobile } from '@/lib/useIsMobile';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import { lookupCompanyByBin, companyFieldsFromLookup } from '@/lib/company-lookup';
import { cn } from '@/lib/utils';
import { getNextStatuses } from '@/lib/order-status';

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

/** Заявка журнала — тип общий с таблицей и доской. */
type Order = JournalOrder;

// ============================================================
// Component
// ============================================================

/**
 * Журнал заявок. Обёртка — ради `useSearchParams`: адрес
 * «/company/orders?create=1» (и «?edit=…», «?from=…») открывает мастер
 * заявки окном поверх журнала, а Next просит ждать параметры адреса в
 * Suspense.
 */
export default function CompanyOrdersPage() {
    return (
        <Suspense fallback={null}>
            <OrdersJournal />
        </Suspense>
    );
}

function OrdersJournal() {
    const { user } = useAuthStore();
    const router = useRouter();
    const isMobile = useIsMobile();

    const [activeTab, setActiveTab] = useState('all');
    /**
     * Вид списка: таблица или доска по этапам (макет «shadcn Nova»). Карточки
     * рейса над списком больше нет (владелец, 08.10.2026): рейс смотрят по
     * значку глаза в строке — в окне с картой.
     */
    const [view, setView] = useState<'table' | 'board'>('table');
    const [previewOpen, setPreviewOpen] = useState(false);
    /**
     * Мастер заявки — окном поверх журнала (владелец, 08.10.2026). Открыть
     * его можно отсюда («Создать заявку», карандаш в строке) и по адресу:
     * меню «Новая заявка», дашборд, «Копировать» в карточке рейса ведут на
     * «/company/orders/create», а тот — сюда с параметром.
     */
    const [wizard, setWizard] = useState<WizardRequest | null>(null);
    const searchParams = useSearchParams();
    useEffect(() => {
        const edit = searchParams.get('edit');
        const from = searchParams.get('from');
        const quote = searchParams.get('quoteRequestId');
        if (!searchParams.get('create') && !edit && !from && !quote) return;
        setWizard({ key: Date.now(), editId: edit || undefined, fromId: from || undefined, quoteRequestId: quote || undefined });
        // Адрес — обратно чистый: обновил страницу — мастер не открывается снова сам.
        router.replace('/company/orders', { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

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
    /**
     * Список сам перечитывается раз в минуту.
     *
     * Без этого журнал был мёртвой картинкой: водитель закрывал рейс, а
     * менеджер, сидя на открытой странице, не узнавал об этом, пока не
     * перезагрузит. Метка «проверьте ТТН» на такой странице бесполезна —
     * она бы просто никогда не появилась вовремя.
     */
    const { data: ordersData, isLoading: loading, error: ordersError, mutate: mutateOrders } = useSWR(
        `/company/orders?page=${ordersPage}&limit=${ordersPageSize}&type=active`,
        fetcher,
        { refreshInterval: 60_000 },
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
    /** Скрытые колонки журнала — читаются из браузера при первой отрисовке. */
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
    /** Показывать только рейсы, ждущие проверки накладной. */
    const [reviewOnly, setReviewOnly] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    // Заявка, открытая по значку глаза — в окне с картой, без перехода внутрь.
    const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
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
                // Как этот заказчик называет свой номер перевозки: этим же
                // словом называется колонка в журнале и графа в выгрузке.
                customerRefLabel: e.customerRefLabel ?? null,
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
        () => {
            const строки = applyQueryAndSort(filteredOrders);
            // Отдельным шагом, а не в общем фильтре: это не признак заявки,
            // а срочное «посмотрите вот эти» поверх любого другого отбора.
            return reviewOnly ? строки.filter(needsCompletionReview) : строки;
        },
        [filteredOrders, query, sortDesc, reviewOnly],
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

    /**
     * Рейсы, закрытые водителем, которых ещё никто не смотрел.
     *
     * Считаем по всему загруженному списку, а не по отобранному на экране:
     * фильтр по заказчику не должен прятать рейс, где водитель прямо сейчас
     * стоит на выгрузке с нечитаемой накладной.
     */
    const awaitingReview = useMemo(() => orders.filter(needsCompletionReview), [orders]);

    /**
     * Сообщение — один раз на каждый новый непроверенный рейс.
     *
     * Не на каждую перечитку списка: рейс, который висит непроверенным
     * полчаса, не должен напоминать о себе каждую минуту. Помним, о чём уже
     * сообщили.
     *
     * Звука здесь намеренно нет (решение владельца от 25.08.2026): рейс
     * видно меткой в строке и полосой над списком, и этого достаточно.
     */
    const оповещённые = useRef<Set<string> | null>(null);
    useEffect(() => {
        const сейчас = new Set(awaitingReview.map((o) => o.id));
        // Первый список за сессию — только запоминаем: пищать при входе на
        // страницу о том, что случилось вчера, незачем.
        if (оповещённые.current === null) {
            оповещённые.current = сейчас;
            return;
        }
        const новые = awaitingReview.filter((o) => !оповещённые.current!.has(o.id));
        оповещённые.current = сейчас;
        if (!новые.length) return;

        toast.warning(
            новые.length === 1
                ? `Водитель закрыл рейс ${новые[0].orderNumber} — проверьте фото накладной`
                : `Водители закрыли рейсов: ${новые.length}. Проверьте фото накладных`,
            { id: 'completion-review', duration: 10_000 },
        );
    }, [awaitingReview]);

    const isArchive = activeTab === 'archive';
    const totalCount = isArchive ? totalArchiveOrders : totalOrders;
    const shownCount = isArchive ? visibleArchiveOrders.length : visibleOrders.length;

    /**
     * Как назвать колонку с номером заказчика.
     *
     * У каждого заказчика графа называется по-своему — «ID», «Номер ТТН»,
     * «Номер заказа», — а заголовок в таблице один на все строки. Пока на
     * экране рейсы одного заказчика, ставим его название: бухгалтер
     * отбирает журнал по клиенту и хочет видеть его слово. Как только
     * заказчиков несколько, возвращаем общее — иначе заголовок врал бы про
     * часть строк.
     */
    const customerRefTitle = useMemo(() => {
        const рейсы = isArchive ? visibleArchiveOrders : visibleOrders;
        const названия = new Set(
            рейсы
                .map((o) => (partners.find((p: any) => p.id === o.customerCompanyId) as any)?.customerRefLabel?.trim())
                .filter(Boolean) as string[],
        );
        return названия.size === 1 ? Array.from(названия)[0] : DEFAULT_REF_LABEL;
    }, [isArchive, visibleOrders, visibleArchiveOrders, partners]);

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

    /**
     * Колонки журнала — в `components/orders/journal/columns`: те же 13, что
     * были, в оформлении макета. Ключи прежние — по ним в браузере запомнено,
     * какие колонки человек спрятал.
     */
    const openPreview = (o: Order) => { setPreviewOrder(o); setPreviewOpen(true); };
    const { active: columns, archive: archiveColumns } = buildColumns({
        userCompanyId: user?.companyId,
        myCompanies,
        customerRefTitle,
        extractCity,
        onPreview: openPreview,
        onEdit: (o) => setWizard({ key: Date.now(), editId: o.id }),
        onOpen: (o) => router.push(`/company/orders/${o.id}`),
        onInvoice: (id) => router.push(`/company/accounting/invoices/${id}`),
    });

    /**
     * Колонки, которые журнал показывает сейчас.
     *
     * Прячется по ключу, а не по месту в списке: колонки перетасовываются,
     * а ключ у графы один. Статус и номер заявки скрыть нельзя — без них
     * строку не узнать.
     */
    const applyHidden = <C extends { key: string }>(list: C[]) => list.filter((c) => !hiddenColumns.has(c.key));

    /**
     * Что предложить в окне выбора колонок.
     *
     * Берём из той таблицы, что сейчас на экране: у архива свой набор, и
     * показывать там графы текущих заявок значило бы предлагать спрятать
     * то, чего и так нет.
     */
    const columnChoices = useMemo(() => {
        const list = isArchive ? archiveColumns : columns;
        return list
            // Колонка действий без заголовка — прятать в списке нечего.
            .filter((c: any) => typeof c.title === 'string' && c.title.trim())
            .map((c: any) => ({
                key: c.key as string,
                title: c.title as string,
                // Статус и номер держат строку узнаваемой: без них журнал
                // превращается в набор цифр без принадлежности.
                locked: c.key === 'status' || c.key === 'orderNumber',
            }));
    }, [isArchive, columns, archiveColumns]);

    // =================== RENDER ===================

    const showBoard = view === 'board' && !isArchive && !isMobile;
    // Таблица и доска прокручиваются внутри себя, подвал со страницами всегда
    // виден. Запас снизу — под подвал и отступ страницы.
    const [fillRef, fillHeight] = useFillHeight<HTMLDivElement>(72, `${showBoard}-${isArchive}-${isMobile}`);
    const chooseView = (v: 'table' | 'board') => {
        setView(v);
        // На доске видна вся страница сразу: двадцать заявок на шесть колонок
        // — это почти пустая доска.
        if (v === 'board' && ordersPageSize < 100) { setOrdersPage(1); setOrdersPageSize(100); }
    };

    const paging = isArchive
        ? {
            current: archivePage,
            pageSize: archivePageSize,
            total: totalArchiveOrders,
            onChange: (p: number, ps: number) => { setArchivePage(p); setArchivePageSize(ps); },
        }
        : {
            current: ordersPage,
            pageSize: ordersPageSize,
            total: totalOrders,
            onChange: (p: number, ps: number) => { setOrdersPage(p); setOrdersPageSize(ps); },
        };
    const options = (list: string[]) => list.map((v) => ({ value: v, label: v }));
    const statusOptions = uniqueStatuses.map((v) => ({ value: v, label: STATUS_LABELS[v] || v }));
    /* «Нет данных» при упавшем запросе — неправда, и именно на неё человек
       и опирается. */
    const emptyText = ordersError && !isArchive
        ? 'Список не загрузился. Обновите страницу.'
        : isNarrowed
            ? <>Под условия ничего не подошло. <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-foreground underline [font-family:inherit]" onClick={clearAllFilters}>Сбросить условия</button></>
            : 'Заявок пока нет';

    return (
        <div className="flex min-w-0 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5" data-orders-journal>
            {/* ===== Шапка =====
                Заголовка и строки-сводки нет (владелец, 08.10.2026): где
                человек — видно в верхней полосе, а место отдано списку.
                Вкладки и действия — одной строкой. Плитки показателей убраны
                ещё в августе: их место занимает сам список. */}
            <h1 className="sr-only">Заявки</h1>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div role="tablist" aria-label="Какие заявки" className="inline-flex h-8 w-fit items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                        {([['all', 'Все заявки', totalOrders], ['archive', 'Архив', totalArchiveOrders]] as const).map(([id, label, n]) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === id}
                                onClick={() => setActiveTab(id)}
                                className={cn(
                                    'inline-flex h-full cursor-pointer items-center gap-1.5 rounded-md border-0 px-2.5 text-[13px] font-medium [font-family:inherit] transition-colors',
                                    activeTab === id ? 'bg-card text-foreground shadow-sm' : 'bg-transparent text-foreground/60 hover:text-foreground',
                                )}
                            >
                                {label}
                                <span className="rounded bg-background/60 px-1 text-[10.5px] tabular-nums text-muted-foreground">{n}</span>
                            </button>
                        ))}
                    </div>

                    {/* Рейсы, закрытые водителем и никем не просмотренные. Раньше —
                        полоса во всю ширину над списком; владелец (08.10.2026)
                        попросил компактнее: кнопка рядом со вкладками. Нажал — в
                        списке только эти рейсы, нажал ещё раз — все. Точка пульсирует:
                        водитель стоит на выгрузке считаные минуты. */}
                    {awaitingReview.length > 0 && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    data-review-chip
                                    aria-pressed={reviewOnly}
                                    onClick={() => { setQuery(''); setActiveTab('all'); setReviewOnly((v) => !v); }}
                                    className={cn(
                                        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-solid px-2.5 text-[13px] font-medium [font-family:inherit] transition-colors',
                                        reviewOnly
                                            ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-500/90'
                                            : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70',
                                    )}
                                >
                                    <span className="relative flex size-2 shrink-0">
                                        {!reviewOnly && <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-70 motion-safe:animate-ping" />}
                                        <span className={cn('relative inline-flex size-2 rounded-full', reviewOnly ? 'bg-white' : 'bg-amber-500')} />
                                    </span>
                                    {awaitingReview.length === 1 ? 'Накладная на проверку' : 'Накладные на проверку'}
                                    <span className={cn('rounded px-1 text-[11.5px] font-semibold tabular-nums', reviewOnly ? 'bg-white/25' : 'bg-amber-500/15')}>
                                        {awaitingReview.length}
                                    </span>
                                    {reviewOnly && <X className="size-3.5" />}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-72 text-xs">
                                {awaitingReview.length === 1
                                    ? `Водитель закрыл рейс ${awaitingReview[0].orderNumber} — проверьте фото накладной, пока он не уехал.`
                                    : `Водители закрыли рейсов: ${awaitingReview.length}. Проверьте фото накладных, пока они не уехали.`}
                                {' '}
                                {reviewOnly ? 'Нажмите — снова все заявки.' : 'Нажмите — в списке останутся только они.'}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {!isMobile && !isArchive && (
                        <div role="radiogroup" aria-label="Вид списка" className="inline-flex h-8 items-center rounded-lg border border-solid border-input p-0.5">
                            {([['table', 'Таблица', Table2], ['board', 'Доска', KanbanSquare]] as const).map(([v, label, Icon]) => (
                                <button
                                    key={v}
                                    type="button"
                                    role="radio"
                                    aria-checked={view === v}
                                    onClick={() => chooseView(v)}
                                    className={cn(
                                        'inline-flex h-full cursor-pointer items-center gap-1.5 rounded-md border-0 px-2.5 text-[13px] [font-family:inherit] transition-colors',
                                        view === v ? 'bg-muted font-medium text-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <Icon className="size-3.5" /> {label}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Выгрузка — то, что сейчас отобрано: файл не расходится с экраном. */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg px-3 text-[13px] font-normal"
                        disabled={exporting || shownCount === 0}
                        onClick={openExport}
                    >
                        {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                        Выгрузить в Excel
                    </Button>
                    <Button
                        data-guide="orders-create"
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg px-3 text-[13px]"
                        onClick={() => setWizard({ key: Date.now() })}
                    >
                        <Plus className="size-3.5" /> Создать заявку
                    </Button>
                </div>
            </div>

            {/* ===== Полоса управления ===== */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                        ref={searchRef}
                        className="h-8 w-80 max-w-[calc(100vw-32px)] rounded-lg border border-solid border-input bg-transparent pl-8 pr-12 text-[13px] text-foreground outline-none [font-family:inherit] placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Номер, город, заказчик, водитель…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Поиск по заявкам"
                    />
                    <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-solid border-border px-1 text-[10.5px] text-muted-foreground [font-family:inherit]">⌘K</kbd>
                </div>

                <FacetFilter
                    title={isArchive ? 'Контрагент' : 'Заказчик'}
                    options={options(isArchive ? uniqueArchiveCompanies : uniqueCompanies)}
                    value={filterCompany}
                    onChange={setFilterCompany}
                />
                {!isArchive && <FacetFilter title="Статус" options={statusOptions} value={filterStatus} onChange={setFilterStatus} />}
                <FacetFilter
                    title="Водитель"
                    options={options(isArchive ? uniqueArchiveDrivers : uniqueDrivers)}
                    value={filterDriver}
                    onChange={setFilterDriver}
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 rounded-lg px-2.5 text-[13px] font-normal"
                    aria-expanded={filtersOpen}
                    onClick={() => setFiltersOpen(true)}
                >
                    <SlidersHorizontal className="size-3.5" /> Все фильтры
                    {activeFilterCount > 0 && (
                        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10.5px] font-semibold tabular-nums text-primary-foreground">{activeFilterCount}</span>
                    )}
                </Button>
                {isNarrowed && (
                    <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-lg px-2 text-[13px] font-normal" onClick={clearAllFilters}>
                        Сбросить <X className="size-3.5" />
                    </Button>
                )}

                <div className="ml-auto flex items-center gap-2">
                    {/* Отвечает на вопрос, ради которого раньше смотрели на ряд
                        плашек с условиями: почему в списке 10 строк, а не 37. */}
                    {isNarrowed && (
                        <span className="text-[13px] text-muted-foreground" data-narrowed>
                            Отобрано <b className="font-semibold text-foreground">{shownCount}</b> из {totalCount}
                        </span>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-8 rounded-lg"
                                aria-label={sortDesc ? 'Порядок: сначала новые' : 'Порядок: сначала старые'}
                                onClick={() => setSortDesc(!sortDesc)}
                            >
                                <ArrowUpDown className="size-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{sortDesc ? 'Сначала новые' : 'Сначала старые'}</TooltipContent>
                    </Tooltip>
                    {!showBoard && (
                        <TableColumnsButton
                            storageKey="lc-orders-hidden-columns"
                            choices={columnChoices}
                            hidden={hiddenColumns}
                            onChange={setHiddenColumns}
                        />
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" className="size-8 rounded-lg" aria-label="Обновить список" onClick={() => mutateAll()}>
                                <RefreshCw className="size-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Обновить</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* ===== Список ===== */}
            {isMobile ? (
                <OrdersMobileList
                    orders={isArchive ? visibleArchiveOrders : visibleOrders}
                    loading={isArchive ? archiveLoading : loading}
                    userCompanyId={user?.companyId}
                    extractCity={extractCity}
                    onOpen={(id) => router.push(`/company/orders/${id}`)}
                    pagination={{
                        ...paging,
                        /* Считаем то, что осталось после условий, а не сколько
                           заявок всего. Иначе под пустым списком стоит «Показаны
                           1–8 из 8», и человек решает, что список сломался. */
                        total: isNarrowed ? shownCount : paging.total,
                    }}
                />
            ) : showBoard ? (
                <div className="flex min-w-0 flex-col">
                    <div ref={fillRef} className="min-w-0">
                        <OrdersBoard rows={visibleOrders} loading={loading} extractCity={extractCity} onPreview={openPreview} height={fillHeight} />
                    </div>
                    <JournalPagination paging={paging} sizes={[20, 50, 100]} />
                </div>
            ) : (
                <OrdersTable
                    columns={applyHidden(isArchive ? archiveColumns : columns)}
                    rows={isArchive ? visibleArchiveOrders : visibleOrders}
                    loading={isArchive ? archiveLoading : loading}
                    empty={emptyText}
                    tone={(r) => (r.status === 'PROBLEM' ? 'problem' : r.status === 'CANCELLED' ? 'cancelled' : undefined)}
                    selectedId={previewOpen ? previewOrder?.id : null}
                    onRowDoubleClick={(r) => router.push(`/company/orders/${r.id}`)}
                    paging={paging}
                    height={fillHeight}
                    scrollRef={fillRef}
                />
            )}

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
                        forwarderId: selectedOrder.forwarderId || undefined,
                        subForwarderId: selectedOrder.subForwarderId || undefined,
                        status: selectedOrder.status || undefined,
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

            <OrderWizardDialog
                request={wizard}
                onClose={() => setWizard(null)}
                // Заявка заведена — окно закрывается, список показывает её первой строкой.
                onCreated={() => { setWizard(null); setActiveTab('all'); mutateAll(); }}
                // Правку сохранили — в карточку рейса, как и было.
                onSaved={(id) => { setWizard(null); router.push(`/company/orders/${id}`); }}
            />

            <OrderPreviewDialog
                order={previewOrder}
                open={previewOpen}
                onOpenChange={setPreviewOpen}
                onOpen={(id) => router.push(`/company/orders/${id}`)}
            />

            <AllFiltersSheet
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                isArchive={isArchive}
                fields={{
                    company: { value: filterCompany, set: setFilterCompany, options: options(isArchive ? uniqueArchiveCompanies : uniqueCompanies) },
                    forwarder: { value: filterForwarder, set: setFilterForwarder, options: options(uniqueForwarders) },
                    expeditor: { value: filterExpeditor, set: setFilterExpeditor, options: options(uniqueExpeditors) },
                    driver: { value: filterDriver, set: setFilterDriver, options: options(isArchive ? uniqueArchiveDrivers : uniqueDrivers) },
                    status: { value: filterStatus, set: setFilterStatus, options: statusOptions },
                    from: { value: filterFrom, set: setFilterFrom, options: options(isArchive ? uniqueArchiveFromCities : uniqueFromCities) },
                    to: { value: filterTo, set: setFilterTo, options: options(isArchive ? uniqueArchiveToCities : uniqueToCities) },
                }}
                period={{
                    field: periodField,
                    setField: setPeriodField,
                    from: periodFrom,
                    to: periodTo,
                    setFrom: setPeriodFrom,
                    setTo: setPeriodTo,
                }}
                sum={{ min: filterSumMin, max: filterSumMax, setMin: setFilterSumMin, setMax: setFilterSumMax }}
                onReset={clearFilters}
                shown={shownCount}
            />
        </div>
    );
}