'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Typography, Tag, Descriptions, Card, Row, Col, Table, Modal, Form, Input, InputNumber, Select, DatePicker, Timeline, Space, Spin, Divider, Popconfirm, Upload, Tabs, Checkbox, Radio, Tooltip, Alert, theme, AutoComplete, Dropdown } from 'antd';
import {
    EnvironmentOutlined, FlagOutlined, DollarOutlined, WalletOutlined, ClockCircleOutlined, FilePdfOutlined, FileTextOutlined, SwapOutlined, CarOutlined, InboxOutlined, TeamOutlined, ExclamationCircleOutlined, CopyOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import {
    ArrowLeft, ArrowLeftRight, CheckCircle2, Copy, FileDown, FileText,
    Loader2, Mail, MapPin, Pencil, Plus, Trash2, Upload as UploadIcon,
    UserPlus, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, Location } from '@/lib/api';
import { reportLoadFailure } from '@/lib/load';
import { VEHICLE_TYPES } from '@/lib/constants';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/auth';
import { resolveCompanyName, prepareCompanyOptions, shortenCompanyName } from '@/lib/company-helper';

const { Title, Text } = Typography;
const { TextArea } = Input;
import AssignDriverModal from '@/components/AssignDriverModal';
import QuickCreateLocationModal from '@/components/ui/QuickCreateLocationModal';
import StatusPill from '@/components/ui/StatusPill';
import OrderFinanceModals from '@/components/orders/OrderFinanceModals';
import OrderOperationModals from '@/components/orders/OrderOperationModals';
import OrderEditForm from '@/components/orders/OrderEditForm';
import OrderDocumentChain from '@/components/orders/OrderDocumentChain';
import OrderHistory from '@/components/orders/OrderHistory';
import { ORDER_STATUS_LABELS } from '@/lib/vocabulary';
import {
    adrLabel, EMPTY_CARGO, loadingLabel, packagingLabel, palletsSummary, totalPallets,
    type CargoState, type PalletLine,
} from '@/lib/cargo';
import {
    accountingDocumentHref,
    applyAllocations,
    findOrCreateOrderDocument,
    type OrderChainDocumentType,
} from '@/lib/accounting-documents';
import { toast } from 'sonner';
import { lookupCompanyByBin, companyFieldsFromLookup } from '@/lib/company-lookup';

const MARKETPLACE_VALUE = '__MARKETPLACE__';
const MY_COMPANY_VALUE = '__MY_COMPANY__';

const statusColors: Record<string, string> = {
    DRAFT: 'default', PENDING: 'orange', ASSIGNED: 'blue',
    EN_ROUTE_PICKUP: 'gold', AT_PICKUP: 'lime', LOADING: 'purple',
    IN_TRANSIT: 'cyan', AT_DELIVERY: 'lime', UNLOADING: 'purple',
    COMPLETED: 'green', PROBLEM: 'red', CANCELLED: '#f5222d',
};

// Подписи статусов — из общего словаря `lib/vocabulary`,
// чтобы один и тот же статус везде назывался одинаково.
const statusLabels = ORDER_STATUS_LABELS;

const expenseCategories = [
    { value: 'fuel', label: 'Топливо' },
    { value: 'repair', label: 'Ремонт' },
    { value: 'salary', label: 'Зарплата' },
    { value: 'insurance', label: 'Страховка' },
    { value: 'penalties', label: 'Штрафы' },
    { value: 'driver_payment', label: 'Оплата водителю' },
    { value: 'other', label: 'Прочее' },
];

const incomeCategories = [
    { value: 'order_payment', label: 'Оплата по заявке' },
    { value: 'prepayment', label: 'Предоплата' },
    { value: 'refund', label: 'Возврат' },
    { value: 'other', label: 'Прочее' },
];

interface Driver {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone: string;
    iin?: string;
    companyId?: string;
    vehicleType?: string;
    vehiclePlate?: string;
    vehicleModel?: string;
    trailerNumber?: string;
    docType?: string;
    docNumber?: string;
    docIssuedAt?: string;
    docExpiresAt?: string;
    docIssuedBy?: string;
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
    latitude?: number;
    longitude?: number;
}

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

    // Завершённую заявку можно «вернуть» на любой активный этап (переоткрыть).
    // Бэкенд разрешит это, если контрагентов нет на платформе; иначе — через согласование.
    if (s === 'COMPLETED') {
        return chain.slice(0, chain.length - 1);
    }

    // Отменённую заявку можно вернуть в работу (кроме сразу «Завершён»)
    if (s === 'CANCELLED') {
        return chain.slice(0, chain.length - 1);
    }

    const idx = chain.findIndex(item => item.value === s);
    if (idx === -1) return [];
    // На любом активном этапе (погрузка/выгрузка и т.д.) можно отметить «Проблема»
    return [...chain.slice(idx + 1), { value: 'PROBLEM', label: '⚠ Проблема' }];
};

export default function OrderDetailPage() {
    const { token } = theme.useToken();
    const { user } = useAuthStore();
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [documents, setDocuments] = useState<any[]>([]);
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [actLoading, setActLoading] = useState(false);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    /** Меняется, когда оплата по рейсу изменилась и цепочку надо перечитать. */
    const [documentChainKey, setDocumentChainKey] = useState(0);
    /** Разнесение платежа по счетам — суммы редактируются в окне платежа. */
    const [allocations, setAllocations] = useState<Record<string, number>>({});

    // Unified payment states & role checks
    const canEditFinance = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [editingPayment, setEditingPayment] = useState<any>(null);
    const [paymentForm] = Form.useForm();
    const [paymentLoading, setPaymentLoading] = useState(false);

    /**
     * Счета и статьи нужны только в модалке платежа. Раньше грузились при
     * открытии карточки и просто задерживали первый показ.
     */
    const financeLoadedRef = useRef(false);
    const loadFinanceSettings = useCallback(async () => {
        if (financeLoadedRef.current) return;
        financeLoadedRef.current = true;
        try {
            const [accRes, catRes] = await Promise.all([
                api.get('/accounting/finance-accounts'),
                api.get('/accounting/finance-categories'),
            ]);
            setAccounts(accRes.data || []);
            setCategories(catRes.data || []);
        } catch (err) {
            financeLoadedRef.current = false;
            console.error('Failed to load accounts/categories', err);
        }
    }, []);

    // Reference data
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [vehiclesLoading, setVehiclesLoading] = useState(false);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [partnersLoading, setPartnersLoading] = useState(false);
    const [forwarders, setForwarders] = useState<{ id: string; name: string }[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [cargoCategories, setCargoCategories] = useState<any[]>([]);
    const [paymentConditions, setPaymentConditions] = useState<{ id: string; name: string }[]>([]);
    const [paymentForms, setPaymentForms] = useState<{ id: string; name: string }[]>([]);

    // Income modal
    const [incomeModalOpen, setIncomeModalOpen] = useState(false);
    const [incomeForm] = Form.useForm();
    const [incomeLoading, setIncomeLoading] = useState(false);

    // Expense modal
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [expenseForm] = Form.useForm();
    const [expenseLoading, setExpenseLoading] = useState(false);

    // Ссылка для водителя
    const [driverLinkModalOpen, setDriverLinkModalOpen] = useState(false);
    const [driverLinkLoading, setDriverLinkLoading] = useState(false);
    const [driverLinkToken, setDriverLinkToken] = useState<string>('');

    // Assign driver modal
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assignForm] = Form.useForm();
    const [assignLoading, setAssignLoading] = useState(false);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [selectedAssignCompanyId, setSelectedAssignCompanyId] = useState<string>('');
    const [selectedAssignDriverId, setSelectedAssignDriverId] = useState<string>('');

    // Status modal
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusForm] = Form.useForm();
    const [statusLoading, setStatusLoading] = useState(false);

    // Completion confirmation
    const [completionActionLoading, setCompletionActionLoading] = useState(false);
    const [rejectReasonModalOpen, setRejectReasonModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [selectedStatusInModal, setSelectedStatusInModal] = useState<string | null>(null);

    // Edit order inline
    const [isEditing, setIsEditing] = useState(false);
    const [editForm] = Form.useForm();
    // Состав груза правится отдельным состоянием — как в мастере создания.
    const [cargoState, setCargoState] = useState<CargoState>(EMPTY_CARGO);
    const [selectedCustomer, setSelectedCustomer] = useState<string>('');
    const [selectedCarrier, setSelectedCarrier] = useState<string>('');
    const [myCompanyName, setMyCompanyName] = useState('');
    const [routePointsState, setRoutePointsState] = useState<Array<LocationState & { pointType: string }>>([]);

    const isMeCust = selectedCustomer === MY_COMPANY_VALUE;
    const isMeCarr = selectedCarrier === MY_COMPANY_VALUE;
    const isMkt = selectedCarrier === MARKETPLACE_VALUE;

    const showCustomerPriceField = !isMeCust || (isMeCust && isMeCarr);
    const showDriverCostField = (isMeCust && !isMeCarr) || (!isMeCust && !isMeCarr);

    const customerPriceLabel = (isMeCust && isMeCarr) ? "Ставка" : "Ставка от заказчика";
    const driverCostLabel = isMkt ? "Ставка для биржи" : "Ставка перевозчику";

    const getRoleDescription = () => {
        if (isMeCust && isMeCarr) return { text: 'Вы и заказчик, и перевозчик — перевозка своими силами', color: '#1890ff' };
        if (isMeCust && isMkt) return { text: 'Вы — заказчик. Заявка будет опубликована на бирже', color: '#722ed1' };
        if (isMeCust && selectedCarrier) return { text: 'Вы — заказчик. Перевозку выполняет контрагент', color: '#389e0d' };
        if (isMeCust && !selectedCarrier) return { text: 'Вы — заказчик. Выберите перевозчика', color: '#faad14' };
        if (isMeCarr && selectedCustomer) return { text: 'Вы — перевозчик. Заказ от контрагента', color: '#389e0d' };
        if (!isMeCust && !isMeCarr && selectedCustomer && selectedCarrier) return { text: 'Вы — посредник между заказчиком и перевозчиком', color: '#eb2f96' };
        if (selectedCustomer && !selectedCarrier) return { text: 'Выберите перевозчика', color: '#faad14' };
        return { text: 'Укажите стороны сделки', color: 'var(--lc-text-ter)' };
    };

    const roleInfo = getRoleDescription();

    const getPartyOptions = (role: 'customer' | 'carrier') => {
        const list = partners.filter((p: any) => role === 'customer' ? p.isCustomer !== false : p.isCarrier !== false);
        const order = data?.order;
        if (order) {
            const candidates = [
                { id: order.customerCompanyId, name: order.customerCompany?.name },
                { id: order.forwarderId, name: order.forwarder?.name },
                { id: order.subForwarderId, name: order.subForwarder?.name },
                { id: order.partnerId, name: order.partner?.name }
            ].filter(c => c.id);
            for (const c of candidates) {
                if (c.id && !list.some(p => p.id === c.id)) {
                    list.push({ id: c.id, name: c.name || `Компания (${c.id.substring(0, 8)})` });
                }
            }
        }
        return list;
    };

    // Share PoA modal
    const [sharePoAModalOpen, setSharePoAModalOpen] = useState(false);
    const [sharePoALoading, setSharePoALoading] = useState(false);
    const [shareEmailsList, setShareEmailsList] = useState<{ email: string; checked: boolean; label: string }[]>([]);
    const [customEmailInput, setCustomEmailInput] = useState('');

    // Передача заявки другому менеджеру (админ компании)
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [transferUsers, setTransferUsers] = useState<any[]>([]);
    const [transferUserId, setTransferUserId] = useState<string | undefined>(undefined);
    const [transferLoading, setTransferLoading] = useState(false);

    // Quick partner modal
    const [quickPartnerModalOpen, setQuickPartnerModalOpen] = useState(false);
    const [quickPartnerForm] = Form.useForm();
    const [quickPartnerLoading, setQuickPartnerLoading] = useState(false);
    const [quickPartnerTarget, setQuickPartnerTarget] = useState<'CUSTOMER' | 'CARRIER' | null>(null);
    const [quickLocationModalOpen, setQuickLocationModalOpen] = useState(false);
    const [activeRoutePointIndex, setActiveRoutePointIndex] = useState<number | null>(null);

    /**
     * «Ввод на основании» из карточки рейса: счёт на оплату и акт
     * выполненных работ.
     *
     * Раньше акт открывался страницей, которая считала его из ТЕКУЩЕЙ
     * заявки: правка заявки задним числом меняла уже отданный контрагенту
     * документ. Теперь оба документа — сохранённые, со своим номером и
     * снимком реквизитов. Если документ по рейсу уже есть, открываем его,
     * а не плодим второй.
     */
    const openOrCreateOrderDocument = async (type: OrderChainDocumentType) => {
        // Заявку берём из data напрямую: одноимённая переменная объявлена
        // ниже по файлу, и опираться на неё отсюда было бы неочевидно.
        const current = data?.order;
        const counterpartyId = current?.customerCompanyId;
        if (!counterpartyId) {
            toast.warning('У заявки не указана компания-заказчик');
            return;
        }
        const isInvoice = type === 'PAYMENT_INVOICE';
        const setLoading = isInvoice ? setInvoiceLoading : setActLoading;
        try {
            setLoading(true);
            const { document, created } = await findOrCreateOrderDocument(type, {
                orderId,
                counterpartyId,
                amount: Number(current?.customerPrice || 0),
                hasVat: current?.hasVat,
                vatRate: current?.vatRate,
            });
            if (created) {
                toast.success(
                    `Черновик ${isInvoice ? 'счёта' : 'акта'} № ${document.number} создан`,
                );
            }
            router.push(accountingDocumentHref({ id: document.id, type }));
        } catch (e: any) {
            toast.error(
                e.response?.data?.message || `Не удалось открыть ${isInvoice ? 'счёт' : 'акт'}`,
            );
        } finally {
            setLoading(false);
        }
    };

    // =================== DATA FETCHING ===================

    const fetchData = async () => {
        try {
            const res = await api.get(`/accounting/orders/${orderId}/financials`);
            setData(res.data);
        } catch (err: any) {
            toast.error('Не удалось загрузить заявку');
        } finally {
            setLoading(false);
        }
    };

    const fetchDocuments = async () => {
        try {
            const res = await api.get(`/documents/order/${orderId}`);
            setDocuments(res.data);
        } catch (e: any) { reportLoadFailure('документы рейса', e); }
    };

    // Передать заявку другому менеджеру своей компании
    const openTransferModal = async () => {
        setTransferModalOpen(true);
        try {
            const res = await api.get('/company/users', { params: { segment: 'office' } });
            const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            setTransferUsers(raw);
        } catch {
            toast.error('Не удалось загрузить список сотрудников');
        }
    };

    const handleTransferResponsible = async () => {
        if (!transferUserId) return;
        setTransferLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/responsible`, { userId: transferUserId });
            toast.success('Заявка передана другому менеджеру');
            setTransferModalOpen(false);
            setTransferUserId(undefined);
            fetchData();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось передать заявку');
        } finally {
            setTransferLoading(false);
        }
    };

    const fetchDrivers = async () => {
        setDriversLoading(true);
        try {
            const response = await api.get('/users/drivers');
            setDrivers(response.data);
        } catch (e: any) { reportLoadFailure('список водителей', e); } finally { setDriversLoading(false); }
    };

    const fetchVehicles = async () => {
        setVehiclesLoading(true);
        try {
            const response = await api.get('/company/vehicles');
            setVehicles(response.data || []);
        } catch (e: any) { reportLoadFailure('список машин', e); } finally { setVehiclesLoading(false); }
    };

    const fetchPartners = async () => {
        setPartnersLoading(true);
        try {
            const [partnersRes, externalRes, profileRes, myCompaniesRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
                api.get('/company/profile'),
                api.get('/company/my-companies'),
            ]);
            const partnersList = partnersRes.data.map((p: any) => ({
                ...p,
                isCustomer: p.isCustomer ?? true,
                isCarrier: p.isCarrier ?? true,
            }));
            const externalList = externalRes.data
                .map((e: any) => ({ id: e.id, name: e.name, isExternal: true, isCustomer: !!e.isCustomer, isCarrier: !!e.isCarrier }));

            const ownCompanies = (myCompaniesRes.data || []).map((c: any) => ({
                id: c.id,
                name: `${c.name} (Моя компания)`,
                isCustomer: true,
                isCarrier: true,
            }));

            if (profileRes.data && !ownCompanies.some((c: any) => c.id === profileRes.data.id)) {
                ownCompanies.push({
                    id: profileRes.data.id,
                    name: `${profileRes.data.name} (Моя компания)`,
                    isCustomer: true,
                    isCarrier: true,
                });
            }

            const combined = [...ownCompanies, ...partnersList, ...externalList];
            setPartners(combined);
            setForwarders(combined);
            if (profileRes.data?.name) {
                setMyCompanyName(profileRes.data.name);
            }
        } catch (e: any) { reportLoadFailure('список контрагентов', e); } finally { setPartnersLoading(false); }
    };

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch (e: any) { reportLoadFailure('справочник адресов', e); }
    };

    const handleNewLocationSuccess = async (newLoc: Location) => {
        setQuickLocationModalOpen(false);
        await fetchLocations();

        if (activeRoutePointIndex !== null) {
            const newPts = [...routePointsState];
            newPts[activeRoutePointIndex] = {
                ...newPts[activeRoutePointIndex],
                city: newLoc.city || '',
                address: newLoc.address,
                id: newLoc.id,
                latitude: newLoc.latitude,
                longitude: newLoc.longitude
            };
            setRoutePointsState(newPts);
        }
        setActiveRoutePointIndex(null);
    };

    const fetchCargoTypes = async () => {
        try {
            const response = await api.get('/cargo-types');
            setCargoCategories(response.data);
        } catch (e: any) { reportLoadFailure('виды груза', e); }
    };

    useEffect(() => {
        // На первый показ нужны сама заявка, её документы и контрагенты
        // (по ним подставляются названия компаний). Остальные справочники
        // относятся к форме правки и грузятся, когда её открывают.
        fetchData();
        fetchDocuments();
        fetchPartners();
        loadContracts();
    }, [orderId]);

    /**
     * Справочники формы правки: точки маршрута, характер груза, условия и
     * формы оплаты. Загружаются один раз при первом входе в режим правки.
     */
    const editReferenceLoadedRef = useRef(false);
    const loadEditReference = useCallback(async () => {
        if (editReferenceLoadedRef.current) return;
        editReferenceLoadedRef.current = true;
        const activeOnly = (arr: any[]) => (arr || []).filter((x: any) => x.isActive !== false);
        try {
            await Promise.all([
                fetchLocations(),
                fetchCargoTypes(),
                api.get('/accounting/dictionaries/payment-condition')
                    .then(r => setPaymentConditions(activeOnly(r.data))).catch(() => { }),
                api.get('/accounting/dictionaries/payment-form')
                    .then(r => setPaymentForms(activeOnly(r.data))).catch(() => { }),
            ]);
        } catch {
            editReferenceLoadedRef.current = false;
        }
    }, []);

    // =================== LOCATION OPTIONS ===================

    const getLocationOptions = () => {
        if (!locations || locations.length === 0) return [];
        const customerCompanyId = selectedCustomer === MY_COMPANY_VALUE ? user?.companyId : selectedCustomer;
        const carrierCompanyId = selectedCarrier === MY_COMPANY_VALUE ? user?.companyId : 
            (selectedCarrier === MARKETPLACE_VALUE || !selectedCarrier) ? undefined : selectedCarrier;

        const customerLocs = locations.filter(l => customerCompanyId && (l as any).companyId === customerCompanyId);
        const carrierLocs = locations.filter(l => carrierCompanyId && (l as any).companyId === carrierCompanyId);
        const categorizedIds = new Set([...customerLocs.map(l => l.id), ...carrierLocs.map(l => l.id)]);
        const otherLocs = locations.filter(l => !categorizedIds.has(l.id));

        const groups: Array<{ label: string; options: Location[] }> = [];

        if (customerLocs.length > 0) {
            const name = selectedCustomer === MY_COMPANY_VALUE ? myCompanyName : partners.find(p => p.id === selectedCustomer)?.name || 'Заказчик';
            groups.push({ label: `Склады заказчика [${name}]`, options: customerLocs });
        }
        if (carrierLocs.length > 0) {
            const name = selectedCarrier === MY_COMPANY_VALUE ? myCompanyName : partners.find(p => p.id === selectedCarrier)?.name || 'Перевозчик';
            groups.push({ label: `Склады перевозчика [${name}]`, options: carrierLocs });
        }
        if (otherLocs.length > 0) {
            groups.push({ label: 'Все остальные адреса', options: otherLocs });
        }
        return groups;
    };

    // =================== DOCUMENT HANDLERS ===================

    const customUploadTTN = async (options: any) => {
        const { file, onSuccess, onError } = options;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'TTN');
        setUploadingDoc(true);
        try {
            await api.post(`/documents/upload/${orderId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success('ТТН успешно загружена');
            onSuccess("ok");
            fetchDocuments();
        } catch (err) {
            toast.error('Ошибка загрузки документа');
            onError(err);
        } finally { setUploadingDoc(false); }
    };

    const handleDownloadDoc = async (doc: any) => {
        try {
            const response = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', doc.fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
        } catch { toast.error('Ошибка при скачивании файла'); }
    };

    // =================== UNIFIED PAYMENT HANDLERS ===================

    const handleAddPaymentClick = () => {
        setEditingPayment(null);
        paymentForm.resetFields();
        paymentForm.setFieldsValue({
            direction: 'IN',
            date: dayjs(),
            method: 'BANK',
            counterpartyId: data?.order?.customerCompanyId || undefined,
        });
        loadFinanceSettings();
        setPaymentModalOpen(true);
    };

    const handleEditPaymentClick = (record: any) => {
        setEditingPayment(record);
        paymentForm.resetFields();
        paymentForm.setFieldsValue({
            direction: record.direction,
            amount: record.amount,
            date: dayjs(record.date),
            method: record.method,
            accountId: record.accountId || undefined,
            categoryId: record.categoryId || undefined,
            counterpartyId: record.counterpartyId || undefined,
            note: record.note,
        });
        loadFinanceSettings();
        setPaymentModalOpen(true);
    };

    const handleSavePayment = async (values: any) => {
        setPaymentLoading(true);
        try {
            const payload = {
                ...values,
                date: values.date.toISOString(),
                orderId,
            };
            const saved = editingPayment
                ? (await api.put(`/accounting/payments/${editingPayment.id}`, payload)).data
                : (await api.post('/accounting/payments', payload)).data;
            toast.success(editingPayment ? 'Платёж обновлён' : 'Платёж добавлен');

            // Разносим после сохранения: до этого у платежа нет id. Ошибка
            // разнесения не отменяет сам платёж — деньги уже учтены.
            const rows = Object.entries(allocations)
                .filter(([, amount]) => Number(amount) > 0)
                .map(([documentId, amount]) => ({ documentId, amount: Number(amount).toFixed(2) }));
            if (saved?.id && rows.length) {
                try {
                    const result = await applyAllocations(saved.id, rows);
                    toast.success(`Разнесено по счетам: ${result.documents}`);
                } catch (e: any) {
                    toast.warning(e.response?.data?.message || 'Платёж сохранён, но не разнесён по счетам');
                }
            }

            setAllocations({});
            setPaymentModalOpen(false);
            fetchData();
            // Платёж разнесён по счетам — «Оплата» в цепочке документов устарела
            setDocumentChainKey((key) => key + 1);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Ошибка сохранения платежа');
        } finally {
            setPaymentLoading(false);
        }
    };

    const handleDeletePayment = async (id: string) => {
        try {
            await api.delete(`/accounting/payments/${id}`);
            toast.success('Платёж удалён');
            fetchData();
            setDocumentChainKey((key) => key + 1);
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Ошибка удаления платежа');
        }
    };

    // =================== INCOME / EXPENSE HANDLERS ===================

    const handleAddIncome = async (values: any) => {
        setIncomeLoading(true);
        try {
            await api.post('/accounting/incomes', { ...values, date: values.date.toISOString(), orderId });
            toast.success('Поступление добавлено');
            setIncomeModalOpen(false);
            incomeForm.resetFields();
            fetchData();
        } catch { toast.error('Ошибка'); } finally { setIncomeLoading(false); }
    };

    const handleAddExpense = async (values: any) => {
        setExpenseLoading(true);
        try {
            await api.post('/accounting/expenses', { ...values, date: values.date.toISOString(), orderId });
            toast.success('Расход добавлен');
            setExpenseModalOpen(false);
            expenseForm.resetFields();
            fetchData();
        } catch { toast.error('Ошибка'); } finally { setExpenseLoading(false); }
    };

    const handleDeleteIncome = async (id: string) => {
        try { await api.delete(`/accounting/incomes/${id}`); toast.success('Удалено'); fetchData(); }
        catch { toast.error('Ошибка удаления'); }
    };

    const handleDeleteExpense = async (id: string) => {
        try { await api.delete(`/accounting/expenses/${id}`); toast.success('Удалено'); fetchData(); }
        catch { toast.error('Ошибка удаления'); }
    };

    // =================== ASSIGN DRIVER ===================

    const openAssignModal = () => {
        setAssignModalOpen(true);
    };

    // =================== STATUS CHANGE ===================

    const handleStatusChange = async (values: { status: string; comment?: string }) => {
        setStatusLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/status`, values);
            toast.success('Статус обновлён');
            setStatusModalOpen(false);
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка');
        } finally { setStatusLoading(false); }
    };

    // =================== COMPLETION CONFIRMATION ===================

    const handleConfirmCompletion = async () => {
        setCompletionActionLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/confirm-completion`);
            toast.success('Завершение рейса подтверждено');
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка подтверждения');
        } finally { setCompletionActionLoading(false); }
    };

    const handleRejectCompletion = async () => {
        setCompletionActionLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/reject-completion`, { reason: rejectReason || undefined });
            toast.success('Запрос на завершение отклонён');
            setRejectReasonModalOpen(false);
            setRejectReason('');
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка отклонения');
        } finally { setCompletionActionLoading(false); }
    };

    const handleCancelCompletionRequest = async () => {
        setCompletionActionLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/cancel-completion`);
            toast.success('Запрос на завершение отменён');
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка отмены');
        } finally { setCompletionActionLoading(false); }
    };

    const handleCancelOrder = async () => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: 'CANCELLED', comment: 'Отменено пользователем' });
            toast.success('Заявка отменена');
            fetchData();
        } catch {
            try {
                await api.put(`/company/orders/${orderId}/status`, { status: 'CANCELLED', comment: 'Отменено пользователем' });
                toast.success('Заявка отменена');
                fetchData();
            } catch (err: any) {
                toast.error(err.response?.data?.message || 'Ошибка отмены');
            }
        }
    };

    // =================== EDIT ORDER ===================

    const startEditing = () => {
        const order = data?.order;
        if (!order) return;

        const isMeCustomer = order.customerCompanyId === user?.companyId;
        let initCust = '';
        let initCarr = '';

        if (isMeCustomer) {
            initCust = MY_COMPANY_VALUE;
            if (order.subForwarderId) {
                initCarr = order.subForwarderId;
            } else if (order.forwarderId === user?.companyId) {
                initCarr = MY_COMPANY_VALUE;
            } else if (!order.forwarderId) {
                initCarr = MARKETPLACE_VALUE;
            } else {
                initCarr = order.forwarderId;
            }
        } else {
            initCust = order.customerCompanyId || '';
            if (order.forwarderId === user?.companyId) {
                if (order.subForwarderId) {
                    initCarr = order.subForwarderId;
                } else {
                    initCarr = MY_COMPANY_VALUE;
                }
            } else if (order.subForwarderId === user?.companyId) {
                if (!order.forwarderId) {
                    initCarr = MARKETPLACE_VALUE;
                } else {
                    initCarr = order.forwarderId;
                }
            } else {
                initCarr = order.forwarderId || '';
            }
        }

        setSelectedCustomer(initCust);
        setSelectedCarrier(initCarr);
        setCargoState({
            pallets: Array.isArray(order.pallets) ? order.pallets : [],
            loadingTypes: order.loadingTypes || [],
            packagingTypes: order.packagingTypes || [],
            placesCount: order.placesCount ?? undefined,
            stackable: order.stackable ?? undefined,
            tempMin: order.tempMin ?? undefined,
            tempMax: order.tempMax ?? undefined,
            adr: order.adr ?? undefined,
            adrClass: order.adrClass ?? undefined,
            cargoValue: order.cargoValue ?? undefined,
        });

        editForm.setFieldsValue({
            cargoDescription: order.cargoDescription,
            cargoWeight: order.cargoWeight,
            cargoVolume: order.cargoVolume,
            cargoLength: order.cargoLength,
            cargoWidth: order.cargoWidth,
            cargoHeight: order.cargoHeight,
            palletCount: order.palletCount,
            cargoType: order.cargoType,
            natureOfCargo: order.natureOfCargo,
            requirements: order.requirements,
            customerPrice: order.customerPrice,
            currency: (order as any).currency || 'KZT',
            driverCostCurrency: (order as any).driverCostCurrency || 'KZT',
            customerPriceType: order.customerPriceType || 'FIXED',
            driverCost: order.driverCost || order.subForwarderPrice,
            pickupDate: order.routePoints?.find((p: any) => p.pointType === 'PICKUP')?.expectedDate
                ? dayjs(order.routePoints.find((p: any) => p.pointType === 'PICKUP').expectedDate)
                : undefined,
            forwarderId: order.subForwarderId || (order.forwarderId !== user?.companyId ? order.forwarderId : undefined),
            customerCompanyId: order.customerCompanyId || order.customerCompany?.id || undefined,
            vatRate: order.vatRate ?? 0,
            hasVat: order.hasVat ?? false,
            executorVatRate: order.executorVatRate ?? 0,
            executorHasVat: order.executorHasVat ?? false,
            customerPaymentCondition: order.customerPaymentCondition || undefined,
            customerPaymentForm: order.customerPaymentForm || undefined,
            driverPaymentCondition: order.driverPaymentCondition || undefined,
            driverPaymentForm: order.driverPaymentForm || undefined,
        });

        if (order.routePoints && order.routePoints.length > 0) {
            setRoutePointsState(order.routePoints.map((p: any) => ({
                id: p.location.id,
                city: p.location.city || '',
                address: p.location.address,
                pointType: p.pointType,
                latitude: p.location.latitude,
                longitude: p.location.longitude
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
        // Справочники подтягиваем в момент открытия правки, а не при
        // загрузке карточки.
        loadEditReference();
        setIsEditing(true);
    };

    const handleEditCreatorRoleChange = (role: 'CUSTOMER' | 'FORWARDER') => {
        // Obsolete but keep placeholder or remove since we removed role states. We'll delete unused functions below.
    };

    const handleEditOrder = async (values: any) => {
        if (!selectedCustomer) { toast.error('Укажите заказчика'); return; }
        if (!selectedCarrier) { toast.error('Укажите перевозчика'); return; }

        try {
            const getLocId = async (loc: LocationState) => {
                if (loc.id) return loc.id;
                const res = await api.post('/locations', {
                    name: `${loc.city}, ${loc.address}`,
                    address: `${loc.city}, ${loc.address}`,
                    latitude: loc.latitude ?? 0,
                    longitude: loc.longitude ?? 0,
                    city: loc.city || ''
                });
                return res.data.id;
            };

            const routePoints = [];
            const pickupDateStr = values.pickupDate 
                ? (dayjs.isDayjs(values.pickupDate) ? values.pickupDate.toISOString() : new Date(values.pickupDate).toISOString()) 
                : undefined;

            for (let i = 0; i < routePointsState.length; i++) {
                const p = routePointsState[i];
                if (!p.city && !p.address && !p.id) continue;
                const locId = await getLocId(p);
                routePoints.push({
                    locationId: locId,
                    pointType: p.pointType,
                    sequence: routePoints.length + 1,
                    expectedDate: p.pointType === 'PICKUP' ? pickupDateStr : undefined
                });
            }

            if (routePoints.length < 2) {
                toast.error('Укажите минимум 2 точки маршрута');
                return;
            }

            const finalCustomerPrice = showCustomerPriceField ? values.customerPrice : values.driverCost;
            const finalDriverCost = showDriverCostField ? values.driverCost : null;

            const updateData: any = {
                cargoDescription: values.cargoDescription,
                natureOfCargo: values.natureOfCargo,
                cargoWeight: values.cargoWeight,
                cargoVolume: values.cargoVolume,
                cargoLength: values.cargoLength,
                cargoWidth: values.cargoWidth,
                cargoHeight: values.cargoHeight,
                // Есть состав — общее число считается по нему, чтобы карточка,
                // кабинет водителя и печатные формы не разошлись с составом.
                palletCount: cargoState.pallets.length ? totalPallets(cargoState.pallets) : values.palletCount,
                pallets: cargoState.pallets,
                loadingTypes: cargoState.loadingTypes,
                packagingTypes: cargoState.packagingTypes,
                // Здесь именно null, а не undefined: undefined Prisma пропускает,
                // и снятое условие возвращалось бы обратно при следующем
                // открытии карточки. Стёрли — значит стёрли.
                placesCount: cargoState.placesCount ?? null,
                stackable: cargoState.stackable ?? null,
                tempMin: cargoState.tempMin ?? null,
                tempMax: cargoState.tempMax ?? null,
                adr: cargoState.adr ?? null,
                adrClass: cargoState.adrClass ?? null,
                cargoValue: cargoState.cargoValue ?? null,
                cargoType: values.cargoType,
                requirements: values.requirements,
                customerPrice: finalCustomerPrice,
                customerPriceType: values.customerPriceType || 'FIXED',
                customerPaymentCondition: values.customerPaymentCondition ?? null,
                customerPaymentForm: values.customerPaymentForm ?? null,
                driverPaymentCondition: values.driverPaymentCondition ?? null,
                driverPaymentForm: values.driverPaymentForm ?? null,
                routePoints,
                customerCompanyId: null,
                forwarderId: null,
                subForwarderId: null,
                subForwarderPrice: null,
                driverCost: null,
                vatRate: values.vatRate ?? 0,
                hasVat: values.hasVat ?? false,
                executorVatRate: values.executorVatRate ?? 0,
                executorHasVat: values.executorHasVat ?? false,
            };

            if (isMeCust) {
                updateData.customerCompanyId = user?.companyId;
                if (isMkt) {
                    updateData.driverCost = finalDriverCost || null;
                } else if (isMeCarr) {
                    updateData.forwarderId = user?.companyId;
                } else {
                    updateData.forwarderId = selectedCarrier;
                    updateData.driverCost = finalDriverCost || null;
                }
            } else if (isMeCarr) {
                updateData.customerCompanyId = selectedCustomer;
                updateData.forwarderId = user?.companyId;
            } else {
                updateData.customerCompanyId = selectedCustomer;
                if (isMkt) {
                    updateData.subForwarderId = user?.companyId;
                    updateData.subForwarderPrice = finalDriverCost || null;
                } else {
                    updateData.forwarderId = user?.companyId;
                    updateData.subForwarderId = selectedCarrier;
                    updateData.subForwarderPrice = finalDriverCost || null;
                }
            }

            await api.put(`/orders/${orderId}`, updateData);
            toast.success('Заявка обновлена');
            setIsEditing(false);
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка обновления');
        }
    };

    // =================== POWER OF ATTORNEY ===================

    const driverLinkUrl = driverLinkToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/driver/${driverLinkToken}` : '';

    const openDriverLink = async () => {
        setDriverLinkLoading(true);
        try {
            const res = await api.post(`/orders/${orderId}/driver-link`, {});
            setDriverLinkToken(res.data?.token || '');
            setDriverLinkModalOpen(true);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось создать ссылку');
        } finally {
            setDriverLinkLoading(false);
        }
    };

    const regenerateDriverLink = async () => {
        setDriverLinkLoading(true);
        try {
            const res = await api.post(`/orders/${orderId}/driver-link`, { regenerate: true });
            setDriverLinkToken(res.data?.token || '');
            toast.success('Ссылка обновлена, старая больше не работает');
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось обновить ссылку');
        } finally {
            setDriverLinkLoading(false);
        }
    };

    /**
     * Документы по рейсу: договор-заявка и доверенность.
     *
     * Сформированные версии хранят снимок данных заявки — подписанный
     * документ не меняется, если заявку потом правят. Исправление
     * добавляет версию рядом, прежняя остаётся.
     */
    type OrderDocKind = 'CONTRACT' | 'POWER_OF_ATTORNEY';
    const DOC_TITLE: Record<OrderDocKind, string> = {
        CONTRACT: 'Договор-заявка',
        POWER_OF_ATTORNEY: 'Доверенность',
    };

    const [contracts, setContracts] = useState<any[]>([]);
    const [poaDocuments, setPoaDocuments] = useState<any[]>([]);
    const [docBusy, setDocBusy] = useState<OrderDocKind | null>(null);

    const applyDocumentRows = (kind: OrderDocKind, rows: any[]) => {
        if (kind === 'CONTRACT') setContracts(rows);
        else setPoaDocuments(rows);
    };

    const loadDocuments = async (kind: OrderDocKind) => {
        try {
            const res = await api.get(`/orders/${orderId}/documents`, { params: { kind } });
            applyDocumentRows(kind, res.data || []);
        } catch { applyDocumentRows(kind, []); }
    };

    const loadContracts = async () => {
        await Promise.all([loadDocuments('CONTRACT'), loadDocuments('POWER_OF_ATTORNEY')]);
    };

    const formDocument = async (kind: OrderDocKind) => {
        try {
            setDocBusy(kind);
            // Тело пустое, но не `null`: с общим заголовком application/json
            // строка «null» не проходит разбор JSON на сервере.
            const res = await api.post(`/orders/${orderId}/documents`, {}, { params: { kind } });
            toast.success(res.data.version > 1
                ? `${DOC_TITLE[kind]}: сформирована версия ${res.data.version}, прежняя сохранена`
                : `${DOC_TITLE[kind]} сформирован${kind === 'CONTRACT' ? '' : 'а'}`);
            await loadDocuments(kind);
        } catch (e: any) {
            toast.error(e.response?.data?.message || `Не удалось сформировать: ${DOC_TITLE[kind]}`);
        } finally {
            setDocBusy(null);
        }
    };

    const downloadDocument = async (kind: OrderDocKind, documentId: string, withStamp = false) => {
        try {
            const res = await api.get(`/orders/documents/${documentId}/pdf`, {
                params: withStamp ? { withStamp: 'true' } : undefined,
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${DOC_TITLE[kind]}_${data?.order?.orderNumber || orderId}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось скачать документ');
        }
    };

    /** Список сохранённых версий с кнопкой печати каждой. */
    const renderDocumentVersions = (kind: OrderDocKind, rows: any[]) => rows.map((row) => (
        <div
            key={row.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12 }}
        >
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Дату, время и сумму не разрываем: в узкой колонке они
                    иначе переносятся по кускам и читаются как мусор. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ whiteSpace: 'nowrap' }}>
                        от {dayjs(row.createdAt).format('DD.MM.YYYY HH:mm')}
                    </span>
                    {row.isCurrent && <Tag color="green" style={{ margin: 0 }}>действующий</Tag>}
                </div>
                <div style={{
                    color: 'var(--lc-text-ter)', fontSize: 11,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {kind === 'CONTRACT'
                        ? `ставка ${(row.amount || 0).toLocaleString('ru-RU')} ₸`
                        : row.driverName || '—'}
                </div>
            </div>
            {/* Кнопка не сжимается — иначе она отъедает ширину у текста. */}
            <Dropdown.Button
                size="small"
                style={{ flexShrink: 0, width: 'auto' }}
                onClick={() => downloadDocument(kind, row.id)}
                menu={{
                    items: [{
                        key: 'stamp',
                        label: 'С подписью и печатью',
                        onClick: () => downloadDocument(kind, row.id, true),
                    }],
                }}
            >
                Скачать
            </Dropdown.Button>
        </div>
    ));

    /** withStamp — флажок «Подпись и печать»; по умолчанию бланк чистый. */
    const handleDownloadPoA = async (withStamp = false) => {
        try {
            const res = await api.get(`/orders/${orderId}/power-of-attorney`, {
                params: withStamp ? { withStamp: 'true' } : undefined,
                responseType: 'blob',
            });
            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Доверенность_${data?.order?.orderNumber || orderId}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch { toast.error('Ошибка скачивания доверенности'); }
    };

    const openSharePoAModal = () => {
        const order = data?.order;
        if (!order) return;
        const list: { email: string; checked: boolean; label: string }[] = [];
        const addEmails = (emailStr: string | null | undefined, label: string) => {
            if (!emailStr) return;
            emailStr.split(',').map(e => e.trim()).filter(Boolean).forEach(email => {
                list.push({ email, checked: true, label });
            });
        };
        addEmails(order.customerCompany?.email, `Компания-заказчик (${order.customerCompany?.name})`);
        addEmails(order.customer?.email, `Заказчик (${order.customer?.firstName} ${order.customer?.lastName})`);
        addEmails(order.forwarder?.email, `Экспедитор (${order.forwarder?.name})`);
        addEmails(order.subForwarder?.email, `Перевозчик (${order.subForwarder?.name})`);
        addEmails(order.partner?.email, `Партнер (${order.partner?.name})`);
        order.routePoints?.forEach((pt: any) => {
            if (pt.location?.emails) {
                pt.location.emails.split(',').map((e: string) => e.trim()).filter(Boolean).forEach((email: string) => {
                    list.push({ email, checked: true, label: `Склад/Адрес (${pt.location.name})` });
                });
            }
        });
        // Deduplicate
        const uniqueList: typeof list = [];
        const seen = new Set<string>();
        for (const item of list) {
            const key = `${item.email}||${item.label}`;
            if (!seen.has(key)) { seen.add(key); uniqueList.push(item); }
        }
        setShareEmailsList(uniqueList);
        setCustomEmailInput('');
        setSharePoAModalOpen(true);
    };

    const handleSharePoA = async () => {
        const selectedEmails = shareEmailsList.filter(item => item.checked).map(item => item.email);
        if (selectedEmails.length === 0) { toast.warning('Выберите хотя бы один email'); return; }
        const uniqueEmails = Array.from(new Set(selectedEmails));
        setSharePoALoading(true);
        try {
            await api.post(`/orders/${orderId}/share-power-of-attorney`, { emails: uniqueEmails });
            toast.success('Доверенность отправлена');
            setSharePoAModalOpen(false);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка отправки');
        } finally { setSharePoALoading(false); }
    };

    const handleAddCustomEmail = () => {
        const email = customEmailInput.trim();
        if (!email) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('Некорректный email'); return; }
        if (shareEmailsList.some(item => item.email === email)) { toast.warning('Email уже добавлен'); return; }
        // Потолка в получателях нет. У крупного склада приёмка, охрана и
        // бухгалтерия — это уже три адреса, а таких складов в рейсе бывает
        // несколько. Прежний предел в 15 обрывал список на полуслове.
        setShareEmailsList([...shareEmailsList, { email, checked: true, label: `Вручную: ${email}` }]);
        setCustomEmailInput('');
    };

    // =================== QUICK PARTNER ===================

    const handleCreateQuickPartner = async (values: any) => {
        setQuickPartnerLoading(true);
        try {
            await api.post('/external-companies', { ...values, isCustomer: false, isCarrier: true, type: 'FORWARDER' });
            toast.success('Контрагент добавлен');
            setQuickPartnerModalOpen(false);
            quickPartnerForm.resetFields();
            await fetchPartners();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка');
        } finally { setQuickPartnerLoading(false); }
    };

    // =================== RENDER ===================

    if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
    if (!data) return <div style={{ textAlign: 'center', padding: 80 }}>Заявка не найдена</div>;

    const { order, incomes, expenses, payments = [], summary } = data;
    const fmt = (n: number) => n.toLocaleString('ru-RU');

    // Состав паллет приходит из базы как JSON — у старых заявок его нет
    // вовсе, поэтому нормализуем к списку и не полагаемся на форму записи.
    const palletLines: PalletLine[] = Array.isArray(order.pallets) ? order.pallets : [];

    const paymentColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, render: (d: string) => dayjs(d).format('DD.MM.YY') },
        {
            title: 'Направление',
            dataIndex: 'direction',
            key: 'direction',
            width: 120,
            render: (dir: string) => (
                dir === 'IN' ? (
                    <Tag color="green">Поступление</Tag>
                ) : (
                    <Tag color="volcano">Расход</Tag>
                )
            ),
        },
        {
            title: 'Сумма ₸',
            dataIndex: 'amount',
            key: 'amount',
            width: 120,
            align: 'right' as const,
            render: (a: number, r: any) => (
                <Text strong style={{ color: r.direction === 'IN' ? '#389e0d' : '#cf1322' }}>
                    {fmt(a)}
                </Text>
            ),
        },
        {
            title: 'Способ',
            dataIndex: 'method',
            key: 'method',
            width: 100,
            render: (m: string) => {
                const labels: Record<string, string> = {
                    CASH: 'Наличные',
                    BANK: 'Банк',
                    CARD: 'Карта',
                    OTHER: 'Прочее',
                };
                return labels[m] || m;
            },
        },
        {
            title: 'Счёт / Касса',
            dataIndex: 'account',
            key: 'account',
            width: 140,
            render: (_: any, r: any) => r.account?.name || (r.method === 'CASH' ? 'Наличные' : 'Расчетный счёт'),
        },
        {
            title: 'Статья',
            dataIndex: 'category',
            key: 'category',
            width: 140,
            render: (_: any, r: any) => r.category?.name || '—',
        },
        {
            title: 'Контрагент',
            dataIndex: 'counterparty',
            key: 'counterparty',
            width: 140,
            render: (_: any, r: any) => r.counterparty?.name || '—',
        },
        {
            title: 'Примечание',
            dataIndex: 'note',
            key: 'note',
            ellipsis: true,
        },
        {
            title: '',
            key: 'actions',
            width: 100,
            render: (_: any, r: any) => (
                canEditFinance && (
                    <Space size={4}>
                        <Button variant="outline" size="icon" aria-label="Изменить платёж" className="h-7 w-7" onClick={() => handleEditPaymentClick(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Popconfirm title="Удалить платёж?" onConfirm={() => handleDeletePayment(r.id)} okText="Да" cancelText="Нет">
                            <Button variant="outline" size="icon" aria-label="Удалить платёж" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </Popconfirm>
                    </Space>
                )
            ),
        },
    ];

    const hasDriver = !!(order.assignedDriverName || order.driverId || order.driver);
    const driverName = order.assignedDriverName || (order.driver ? `${order.driver.lastName} ${order.driver.firstName} ${order.driver.middleName || ''}`.trim() : null);
    const driverPhone = order.assignedDriverPhone || order.driver?.phone;
    const driverPlate = order.assignedDriverPlate || order.driver?.vehiclePlate;
    const driverTrailer = order.assignedDriverTrailer || order.driver?.trailerNumber;
    const canChangeStatus = getNextStatuses(order.status).length > 0;
    const isNotFinished = order.status !== 'CANCELLED' && order.status !== 'COMPLETED';

    // Completion confirmation helpers
    const hasPendingCompletion = order.pendingStatus === 'COMPLETED';
    const isCompletionInitiator = hasPendingCompletion && order.pendingStatusById === user?.companyId;
    const isCompletionApprover = hasPendingCompletion && order.pendingStatusById !== user?.companyId;

    const getCompanyNameById = (companyId: string | null | undefined) => {
        if (!companyId) return '—';
        const candidates = [
            { id: order.customerCompanyId, name: order.customerCompany?.name },
            { id: order.forwarderId, name: order.forwarder?.name },
            { id: order.subForwarderId, name: order.subForwarder?.name },
            { id: order.partnerId, name: order.partner?.name }
        ];
        const found = candidates.find(c => c.id === companyId);
        return found?.name || `Организация (${companyId.substring(0, 8)})`;
    };

    const pickupPt = order.routePoints?.find((p: any) => p.pointType === 'PICKUP');

    const incomeColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{dayjs(d).format('DD.MM.YY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'cat', width: 140, render: (c: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{incomeCategories.find(x => x.value === c)?.label || c}</Text> },
        { title: 'Описание', dataIndex: 'description', key: 'desc', ellipsis: true, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{d}</Text> },
        { title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const, render: (a: number, r: any) => <Text delete={r.isDeleted} strong style={{ color: r.isDeleted ? 'var(--lc-text-ter)' : '#389e0d' }}>{fmt(a)}</Text> },
        { title: '', key: 'actions', width: 50, render: (_: any, r: any) => (
            !r.isDeleted && <Popconfirm title="Удалить?" onConfirm={() => handleDeleteIncome(r.id)} okText="Да" cancelText="Нет"><Button variant="outline" size="icon" aria-label="Удалить поступление" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></Popconfirm>
        )},
    ];

    const expenseColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{dayjs(d).format('DD.MM.YY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'cat', width: 140, render: (c: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{expenseCategories.find(x => x.value === c)?.label || c}</Text> },
        { title: 'Описание', dataIndex: 'description', key: 'desc', ellipsis: true, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{d}</Text> },
        { title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const, render: (a: number, r: any) => <Text delete={r.isDeleted} strong style={{ color: r.isDeleted ? 'var(--lc-text-ter)' : '#cf1322' }}>{fmt(a)}</Text> },
        { title: '', key: 'actions', width: 50, render: (_: any, r: any) => (
            !r.isDeleted && <Popconfirm title="Удалить?" onConfirm={() => handleDeleteExpense(r.id)} okText="Да" cancelText="Нет"><Button variant="outline" size="icon" aria-label="Удалить расход" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></Popconfirm>
        )},
    ];

    const docColumns = [
        { title: 'Тип', dataIndex: 'type', key: 'type', width: 100, render: (t: string) => t === 'TTN' ? 'ТТН' : t },
        { title: 'Файл', dataIndex: 'fileName', key: 'fileName' },
        { title: 'Размер', dataIndex: 'fileSize', key: 'size', width: 100, render: (s: number) => `${(s / 1024).toFixed(1)} KB` },
        { title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 130, render: (d: string) => dayjs(d).format('DD.MM.YY HH:mm') },
        { title: '', key: 'action', width: 80, render: (_: any, r: any) => (
            <Button variant="link" size="sm" onClick={() => handleDownloadDoc(r)}>Скачать</Button>
        )}
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* =================== HEADER =================== */}
            <div className="lc2-hero" style={{ borderBottom: '1px solid var(--lc-border)', paddingBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button variant="outline" size="icon" aria-label="Назад" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                    <div>
                        <div className="lc-eyebrow">Заявки · Детали</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <h1 className="lc2-title" style={{ margin: 0 }}>
                                Заявка {order.orderNumber}
                            </h1>
                            <StatusPill status={order.status} />
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Создана {dayjs(order.createdAt).format('DD.MM.YYYY в HH:mm')}
                        </Text>
                    </div>
                </div>

                {isEditing && (
                    <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, margin: 0 }}>Режим редактирования</Tag>
                )}
                {!isEditing && (
                    <Space wrap size="small">
                        {canChangeStatus && (
                            <Button onClick={() => { statusForm.resetFields(); setStatusModalOpen(true); }}>
                                <ArrowLeftRight className="h-4 w-4" />
                                {order.status === 'CANCELLED' ? 'Вернуть заявку в работу' : order.status === 'COMPLETED' ? 'Вернуть / изменить статус' : 'Изменить статус'}
                            </Button>
                        )}
                        {isNotFinished && (
                            <Button variant="outline" onClick={startEditing}>
                                <Pencil className="h-4 w-4" /> Редактировать
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => router.push(`/company/orders/create?from=${orderId}`)}>
                            <Copy className="h-4 w-4" /> Дублировать
                        </Button>
                        {isNotFinished && (
                            <Popconfirm
                                title="Отменить заявку?"
                                description="Заявка будет отменена."
                                onConfirm={handleCancelOrder}
                                okText="Да, отменить"
                                cancelText="Нет"
                                okButtonProps={{ danger: true }}
                            >
                                <Button variant="destructive">
                                    <XCircle className="h-4 w-4" /> Отменить заявку
                                </Button>
                            </Popconfirm>
                        )}
                    </Space>
                )}
            </div>

            {/* =================== PENDING COMPLETION BANNER =================== */}
            {hasPendingCompletion && isCompletionApprover && (
                <Alert
                    type="warning"
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                    style={{ marginBottom: 20, borderRadius: 8 }}
                    message={
                        <span style={{ fontWeight: 600 }}>
                            Компания «{getCompanyNameById(order.pendingStatusById)}» запросила завершение рейса
                        </span>
                    }
                    description={
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                Запрос создан {order.pendingStatusAt ? dayjs(order.pendingStatusAt).format('DD.MM.YYYY в HH:mm') : ''}.
                                Подтвердите или отклоните завершение рейса.
                            </Text>
                            <Space>
                                <Button
                                    disabled={completionActionLoading}
                                    onClick={handleConfirmCompletion}
                                >
                                    {completionActionLoading
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <CheckCircle2 className="h-4 w-4" />}
                                    Подтвердить завершение
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={completionActionLoading}
                                    onClick={() => setRejectReasonModalOpen(true)}
                                >
                                    {completionActionLoading
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <XCircle className="h-4 w-4" />}
                                    Отклонить
                                </Button>
                            </Space>
                        </div>
                    }
                />
            )}
            {hasPendingCompletion && isCompletionInitiator && (
                <Alert
                    type="info"
                    showIcon
                    icon={<ClockCircleOutlined />}
                    style={{ marginBottom: 20, borderRadius: 8 }}
                    message={
                        <span style={{ fontWeight: 600 }}>
                            Ожидается подтверждение завершения рейса
                        </span>
                    }
                    description={
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                Запрос на завершение отправлен {order.pendingStatusAt ? dayjs(order.pendingStatusAt).format('DD.MM.YYYY в HH:mm') : ''}.
                                Ожидаем подтверждения от другой стороны.
                            </Text>
                            <Popconfirm
                                title="Отменить запрос на завершение?"
                                onConfirm={handleCancelCompletionRequest}
                                okText="Да, отменить"
                                cancelText="Нет"
                            >
                                <Button
                                    variant="outline"
                                    disabled={completionActionLoading}
                                >
                                    {completionActionLoading
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <XCircle className="h-4 w-4" />}
                                    Отменить запрос
                                </Button>
                            </Popconfirm>
                        </div>
                    }
                />
            )}

            {/* =================== MAIN TABS =================== */}
            <Tabs
                defaultActiveKey="details"
                size="large"
                type="line"
                style={{ marginBottom: 24 }}
                items={[
                    {
                        key: 'details',
                        label: (
                            <span>
                                <FileTextOutlined style={{ marginRight: 6 }} />
                                Основная информация
                            </span>
                        ),
                        children: (
                            isEditing ? (
                                <OrderEditForm
                                    editForm={editForm}
                                    handleEditOrder={handleEditOrder}
                                    routePointsState={routePointsState}
                                    setRoutePointsState={setRoutePointsState}
                                    getLocationOptions={getLocationOptions}
                                    locations={locations}
                                    selectedCustomer={selectedCustomer}
                                    setSelectedCustomer={setSelectedCustomer}
                                    selectedCarrier={selectedCarrier}
                                    setSelectedCarrier={setSelectedCarrier}
                                    getPartyOptions={getPartyOptions}
                                    myCompanyName={myCompanyName}
                                    roleInfo={roleInfo}
                                    setQuickPartnerModalOpen={setQuickPartnerModalOpen}
                                    setQuickPartnerTarget={setQuickPartnerTarget}
                                    cargoCategories={cargoCategories}
                                    paymentConditions={paymentConditions}
                                    paymentForms={paymentForms}
                                    showCustomerPriceField={showCustomerPriceField}
                                    showDriverCostField={showDriverCostField}
                                    customerPriceLabel={customerPriceLabel}
                                    driverCostLabel={driverCostLabel}
                                    canEditFinance={canEditFinance}
                                    setIsEditing={setIsEditing}
                                    cargo={cargoState}
                                    setCargo={setCargoState}
                                />
                            ) : (
                                <Row gutter={[24, 24]}>
                                    <Col xs={24} lg={15}>
                                        {/* Route Card */}
                                        <Card
                                            title={<span style={{ fontWeight: 600 }}><EnvironmentOutlined style={{ marginRight: 8, color: '#1677ff' }} />Маршрут следования</span>}
                                            bordered={false}
                                            className="premium-card"
                                            style={{ marginBottom: 20 }}
                                        >
                                            <Timeline
                                                style={{ marginTop: 16, paddingLeft: 8 }}
                                                items={order.routePoints?.map((pt: any, i: number) => {
                                                    const isDelivery = pt.pointType === 'DELIVERY';
                                                    const isAdditional = pt.pointType === 'ADDITIONAL_PICKUP';
                                                    const icon = isDelivery ? (
                                                        <FlagOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                                                    ) : (
                                                        <EnvironmentOutlined style={{ color: isAdditional ? '#faad14' : '#1677ff', fontSize: 16 }} />
                                                    );
                                                    const labelText = isDelivery ? 'Выгрузка' : isAdditional ? 'Доп. погрузка' : 'Погрузка';
                                                    
                                                    return {
                                                        dot: icon,
                                                        children: (
                                                            <div style={{ marginBottom: 12 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                                                                    <Text strong style={{ fontSize: 15 }}>
                                                                        {labelText}: {pt.location?.city || pt.location?.name}
                                                                    </Text>
                                                                    {pt.expectedDate && (
                                                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                                                            {dayjs(pt.expectedDate).format('DD.MM.YYYY HH:mm')}
                                                                        </Text>
                                                                    )}
                                                                </div>
                                                                <div style={{ marginTop: 4 }}>
                                                                    <Text type="secondary" style={{ fontSize: 13 }}>
                                                                        {pt.location?.address}
                                                                    </Text>
                                                                </div>
                                                            </div>
                                                        )
                                                    };
                                                })}
                                            />
                                        </Card>

                                        {/* Cargo Card */}
                                        <Card
                                            title={<span style={{ fontWeight: 600 }}><InboxOutlined style={{ marginRight: 8, color: '#1677ff' }} />Информация о грузе</span>}
                                            bordered={false}
                                            className="premium-card"
                                        >
                                            <Descriptions column={{ xs: 1, sm: 2 }} size="middle">
                                                <Descriptions.Item label="Груз">{order.cargoDescription || '—'}</Descriptions.Item>
                                                <Descriptions.Item label="Характер груза">{order.natureOfCargo || '—'}</Descriptions.Item>
                                                <Descriptions.Item label="Вес">{order.cargoWeight ? `${fmt(order.cargoWeight)} кг` : '—'}</Descriptions.Item>
                                                <Descriptions.Item label="Объем">{order.cargoVolume ? `${order.cargoVolume} м³` : '—'}</Descriptions.Item>
                                                {(order.cargoLength || order.cargoWidth || order.cargoHeight) && (
                                                    <Descriptions.Item label="Габариты (Д×Ш×В)">
                                                        {`${order.cargoLength ?? '—'} × ${order.cargoWidth ?? '—'} × ${order.cargoHeight ?? '—'} м`}
                                                    </Descriptions.Item>
                                                )}
                                                {/* Раньше здесь стояло голое число «Палет: 15» — а рейс почти
                                                    всегда смешанный, и водителю с логистом важно именно чем
                                                    именно. Состав вводят при создании заявки, и до этого места
                                                    он не доезжал. */}
                                                {order.palletCount || palletLines.length ? (
                                                    <Descriptions.Item label="Палеты">
                                                        {palletLines.length
                                                            ? `${order.palletCount ?? totalPallets(palletLines)} — ${palletsSummary(palletLines)}`
                                                            : order.palletCount}
                                                    </Descriptions.Item>
                                                ) : null}
                                                {order.placesCount ? (
                                                    <Descriptions.Item label="Мест">{order.placesCount}</Descriptions.Item>
                                                ) : null}
                                                {order.loadingTypes?.length ? (
                                                    <Descriptions.Item label="Способ погрузки">
                                                        {order.loadingTypes.map(loadingLabel).join(', ')}
                                                    </Descriptions.Item>
                                                ) : null}
                                                {order.packagingTypes?.length ? (
                                                    <Descriptions.Item label="Упаковка">
                                                        {order.packagingTypes.map(packagingLabel).join(', ')}
                                                    </Descriptions.Item>
                                                ) : null}
                                                {order.tempMin != null || order.tempMax != null ? (
                                                    <Descriptions.Item label="Температура">
                                                        {`${order.tempMin ?? '—'} … ${order.tempMax ?? '—'} °C`}
                                                    </Descriptions.Item>
                                                ) : null}
                                                {order.stackable != null ? (
                                                    <Descriptions.Item label="Штабелирование">
                                                        {order.stackable ? 'Допускается' : 'Запрещено'}
                                                    </Descriptions.Item>
                                                ) : null}
                                                {order.adr ? (
                                                    <Descriptions.Item label="Опасный груз">
                                                        {/* Полная расшифровка класса длинная и ломает колонку —
                                                            держим её в подсказке. */}
                                                        <Tooltip title={order.adrClass ? adrLabel(order.adrClass) : 'Класс не указан'}>
                                                            <Tag color="red" style={{ marginInlineEnd: 0 }}>
                                                                ДОПОГ{order.adrClass ? ` · класс ${order.adrClass}` : ''}
                                                            </Tag>
                                                        </Tooltip>
                                                    </Descriptions.Item>
                                                ) : null}
                                                {order.cargoValue ? (
                                                    <Descriptions.Item label="Объявленная стоимость">
                                                        {`${fmt(order.cargoValue)} ₸`}
                                                    </Descriptions.Item>
                                                ) : null}
                                                <Descriptions.Item label="Тип кузова">{order.cargoType || '—'}</Descriptions.Item>
                                                <Descriptions.Item label="Доп. требования">{order.requirements || '—'}</Descriptions.Item>
                                            </Descriptions>
                                        </Card>
                                    </Col>

                                    <Col xs={24} lg={9}>
                                        {/* Driver & Power of Attorney Card */}
                                        <Card
                                            title={<span style={{ fontWeight: 600 }}><CarOutlined style={{ marginRight: 8, color: '#1677ff' }} />Исполнитель и Водитель</span>}
                                            bordered={false}
                                            className="premium-card"
                                            style={{ marginBottom: 20 }}
                                        >
                                            {hasDriver ? (
                                                <div>
                                                    <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
                                                        <Descriptions.Item label="ФИО">{driverName || '—'}</Descriptions.Item>
                                                        <Descriptions.Item label="Телефон">
                                                            {driverPhone ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                                                                    <a href={`tel:${driverPhone}`} style={{ color: '#1677ff' }}>{driverPhone}</a>
                                                                    <Tooltip title="Написать в WhatsApp">
                                                                        <a href={`https://wa.me/${String(driverPhone).replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" style={{ color: '#25D366', fontSize: 16 }}>
                                                                            <WhatsAppOutlined />
                                                                        </a>
                                                                    </Tooltip>
                                                                    <Tooltip title="Скопировать номер">
                                                                        <a
                                                                            onClick={() => { navigator.clipboard?.writeText(String(driverPhone)); toast.success('Номер водителя скопирован'); }}
                                                                            style={{ color: 'var(--lc-text-ter)', cursor: 'pointer', fontSize: 15 }}
                                                                        >
                                                                            <CopyOutlined />
                                                                        </a>
                                                                    </Tooltip>
                                                                </span>
                                                            ) : '—'}
                                                        </Descriptions.Item>
                                                        <Descriptions.Item label="Автомобиль">{driverPlate || '—'}</Descriptions.Item>
                                                        <Descriptions.Item label="Прицеп">{driverTrailer || '—'}</Descriptions.Item>
                                                    </Descriptions>

                                                    <Divider style={{ margin: '12px 0' }} />

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        <Button
                                                            className="w-full"
                                                            onClick={openDriverLink}
                                                            disabled={driverLinkLoading}
                                                        >
                                                            {driverLinkLoading
                                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                                : <MapPin className="h-4 w-4" />}
                                                            Ссылка для водителя
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            className="w-full"
                                                            onClick={openAssignModal}
                                                        >
                                                            <UserPlus className="h-4 w-4" /> Изменить водителя
                                                        </Button>
                                                        <Dropdown.Button
                                                            style={{ width: '100%' }}
                                                            buttonsRender={([left, right]) => [left, right]}
                                                            onClick={() => handleDownloadPoA()}
                                                            menu={{
                                                                items: [{
                                                                    key: 'stamp',
                                                                    label: 'С подписью и печатью',
                                                                    onClick: () => handleDownloadPoA(true),
                                                                }],
                                                            }}
                                                        >
                                                            <FileTextOutlined /> Доверенность (PDF)
                                                        </Dropdown.Button>
                                                        <Button
                                                            variant="outline"
                                                            className="w-full"
                                                            disabled={docBusy === 'POWER_OF_ATTORNEY'}
                                                            onClick={() => formDocument('POWER_OF_ATTORNEY')}
                                                        >
                                                            {docBusy === 'POWER_OF_ATTORNEY'
                                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                                : <FileDown className="h-4 w-4" />}
                                                            {poaDocuments.length
                                                                ? 'Выдать исправленную доверенность'
                                                                : 'Выдать доверенность (в журнал)'}
                                                        </Button>
                                                        {renderDocumentVersions('POWER_OF_ATTORNEY', poaDocuments)}
                                                        <Button
                                                            variant="outline"
                                                            className="w-full"
                                                            disabled={docBusy === 'CONTRACT'}
                                                            onClick={() => formDocument('CONTRACT')}
                                                        >
                                                            {docBusy === 'CONTRACT'
                                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                                : <FileDown className="h-4 w-4" />}
                                                            {contracts.length
                                                                ? 'Сформировать исправленный договор'
                                                                : 'Сформировать договор-заявку'}
                                                        </Button>
                                                        {renderDocumentVersions('CONTRACT', contracts)}
                                                        <Button
                                                            variant="outline"
                                                            className="w-full"
                                                            onClick={openSharePoAModal}
                                                        >
                                                            <Mail className="h-4 w-4" /> Отправить доверенность по email
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                                                    <div style={{ marginBottom: 12 }}>
                                                        <Tag color="warning" style={{ fontSize: 13, padding: '4px 16px', borderRadius: 4 }}>Водитель не назначен</Tag>
                                                    </div>
                                                    <Button
                                                        className="w-full"
                                                        onClick={openAssignModal}
                                                    >
                                                        <UserPlus className="h-4 w-4" /> Назначить водителя
                                                    </Button>
                                                </div>
                                            )}
                                        </Card>

                                        {/* Participants Card */}
                                        <Card
                                            title={<span style={{ fontWeight: 600 }}><TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />Участники перевозки</span>}
                                            bordered={false}
                                            className="premium-card"
                                        >
                                            <Descriptions column={1} size="small">
                                                <Descriptions.Item label="Заказчик">
                                                    <Text strong>{resolveCompanyName(order.customerCompanyId, partners, order.customerCompany?.name)}</Text>
                                                </Descriptions.Item>
                                                <Descriptions.Item label="Контактное лицо">
                                                    {order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : '—'}
                                                </Descriptions.Item>
                                                <Descriptions.Item label="Телефон заказчика">
                                                    {order.customer?.phone ? (
                                                        <a href={`tel:${order.customer.phone}`} style={{ color: '#1677ff' }}>{order.customer.phone}</a>
                                                    ) : '—'}
                                                </Descriptions.Item>
                                                
                                                <Divider style={{ margin: '8px 0' }} />
                                                
                                                <Descriptions.Item label="Экспедитор">
                                                    <Text strong>{resolveCompanyName(order.forwarderId || order.partnerId, partners, order.forwarder?.name || order.partner?.name)}</Text>
                                                </Descriptions.Item>
                                                {order.subForwarder && (
                                                    <Descriptions.Item label="Перевозчик">
                                                        <Text strong>{resolveCompanyName(order.subForwarderId, partners, order.subForwarder.name)}</Text>
                                                    </Descriptions.Item>
                                                )}
                                                {order.responsibleManager && (
                                                    <Descriptions.Item label="Менеджер">
                                                        {order.responsibleManager.firstName} {order.responsibleManager.lastName}
                                                    </Descriptions.Item>
                                                )}
                                                {(order.responsibles || []).map((r: any) => (
                                                    <Descriptions.Item
                                                        key={r.id}
                                                        label={`Ответственный · ${r.company?.name ? shortenCompanyName(r.company.name) : 'компания'}`}
                                                    >
                                                        <Text strong>{r.user?.lastName} {r.user?.firstName}</Text>
                                                        {r.companyId === user?.companyId && ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '') && (
                                                            <Button variant="link" size="sm" onClick={openTransferModal}>
                                                                Передать
                                                            </Button>
                                                        )}
                                                    </Descriptions.Item>
                                                ))}
                                            </Descriptions>
                                        </Card>
                                    </Col>
                                </Row>
                            )
                        )
                    },
                    {
                        key: 'finances',
                        label: (
                            <span>
                                <DollarOutlined style={{ marginRight: 6 }} />
                                Финансы
                            </span>
                        ),
                        children: (
                            <div>
                                {order.customerCompanyId !== user?.companyId && order.customerCompanyId && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                        <Space size={8}>
                                            <Button
                                                disabled={invoiceLoading}
                                                onClick={() => openOrCreateOrderDocument('PAYMENT_INVOICE')}
                                            >
                                                {invoiceLoading
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <FileText className="h-4 w-4" />}
                                                Выставить счёт
                                            </Button>
                                            <Button
                                                variant="outline"
                                                disabled={actLoading}
                                                onClick={() => openOrCreateOrderDocument('SERVICE_ACT')}
                                            >
                                                {actLoading
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : <FileText className="h-4 w-4" />}
                                                Акт выполненных работ
                                            </Button>
                                            <Tooltip title="Расчёт по текущим данным заявки — меняется вместе с ней">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => window.open(`/company/accounting/act-of-work?order=${orderId}`, '_blank')}
                                                >
                                                    Предпросмотр
                                                </Button>
                                            </Tooltip>
                                        </Space>
                                    </div>
                                )}
                                {order.customerCompanyId !== user?.companyId && order.customerCompanyId && (
                                    <OrderDocumentChain
                                        orderId={orderId}
                                        orderNumber={order.orderNumber}
                                        orderStatus={order.status}
                                        onCreate={openOrCreateOrderDocument}
                                        creating={
                                            invoiceLoading
                                                ? 'PAYMENT_INVOICE'
                                                : actLoading
                                                    ? 'SERVICE_ACT'
                                                    : null
                                        }
                                        reloadKey={documentChainKey}
                                    />
                                )}
                                {/* Условия и формы оплаты */}
                                {(order.customerPaymentCondition || order.customerPaymentForm || order.driverPaymentCondition || order.driverPaymentForm) && (
                                    <div className="lc-card" style={{ padding: 16, marginBottom: 16 }}>
                                        <Row gutter={[16, 12]}>
                                            {(order.customerPaymentCondition || order.customerPaymentForm) && (
                                                <Col xs={24} md={12}>
                                                    <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Оплата от заказчика</div>
                                                    <div>
                                                        {order.customerPaymentCondition && <Tag color="blue">{order.customerPaymentCondition}</Tag>}
                                                        {order.customerPaymentForm && <Tag>{order.customerPaymentForm}</Tag>}
                                                    </div>
                                                </Col>
                                            )}
                                            {(order.driverPaymentCondition || order.driverPaymentForm) && (
                                                <Col xs={24} md={12}>
                                                    <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Оплата перевозчику</div>
                                                    <div>
                                                        {order.driverPaymentCondition && <Tag color="blue">{order.driverPaymentCondition}</Tag>}
                                                        {order.driverPaymentForm && <Tag>{order.driverPaymentForm}</Tag>}
                                                    </div>
                                                </Col>
                                            )}
                                        </Row>
                                    </div>
                                )}

                                {/* Financial Summary */}
                                {(() => {
                                    const isClient = order.customerCompanyId === user?.companyId;
                                    const isExecutorPaid = order.subForwarderId ? order.isSubForwarderPaid : order.isDriverPaid;
                                    const executorDebt = summary.executorDebt !== undefined
                                        ? summary.executorDebt
                                        : (order.subForwarderId
                                            ? (order.isSubForwarderPaid ? 0 : order.subForwarderPrice || 0)
                                            : (order.isDriverPaid ? 0 : (order.driverCost || 0) - summary.totalExpenses));

                                    const Metric = ({ label, value, color, bg, icon, sub }: any) => (
                                        <div className="lc2-metric">
                                            <div className="lc2-mic" style={{ background: bg, color }}>{icon}</div>
                                            <div>
                                                <div className="lc2-mlabel">{label}</div>
                                                <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color }}>{fmt(value)} ₸</div>
                                                {sub && <div className="lc2-msub">{sub}</div>}
                                            </div>
                                        </div>
                                    );

                                    const Breakdown = ({ title, accent, gross, net, vat, vatRate, debt }: any) => (
                                        <div className="lc-card" style={{ padding: 14, height: '100%' }}>
                                            <div style={{ fontWeight: 600, marginBottom: 10, color: accent, fontSize: 13 }}>{title}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">Всего с НДС</Text><Text strong>{fmt(gross)} ₸</Text></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">Без НДС</Text><Text>{fmt(net)} ₸</Text></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><Text type="secondary">НДС ({vatRate}%)</Text><Text>{fmt(vat)} ₸</Text></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--lc-border)', paddingTop: 6, marginTop: 2 }}><Text strong style={{ color: '#dc2626' }}>Остаток долга</Text><Text strong style={{ color: '#dc2626' }}>{fmt(debt)} ₸</Text></div>
                                            </div>
                                        </div>
                                    );

                                    /**
                                     * Всё, что подписано знаком тенге, показывается в тенге.
                                     *
                                     * Ставка заказчика может быть в рублях, и «100 000 ₸» рядом с
                                     * тенговыми долгами читается как сто тысяч тенге — а это шестьсот.
                                     * Поэтому в плитках и расчётах стоит пересчёт, а исходная сумма с
                                     * её валютой показана выше отдельной подсказкой.
                                     */
                                    const customerGross = summary.currency && summary.currency !== 'KZT'
                                        ? (summary.customerPriceBase ?? 0)
                                        : summary.customerPrice;
                                    const executorGross = summary.driverCostCurrency && summary.driverCostCurrency !== 'KZT'
                                        ? (summary.driverCostBase ?? 0)
                                        : summary.executorCost;

                                    return (
                                        <div style={{ marginBottom: 16 }}>
                                            {/* Суммы рейса в валюте: показываем и валюту, и пересчёт.
                                                Без этого «100 000» рядом с тенговыми цифрами читается
                                                как тенге, а это рубли. */}
                                            {(summary.currency && summary.currency !== 'KZT') || (summary.driverCostCurrency && summary.driverCostCurrency !== 'KZT') ? (
                                                <Alert
                                                    type="info"
                                                    showIcon
                                                    style={{ marginBottom: 12 }}
                                                    message="Рейс в валюте"
                                                    description={(
                                                        <div style={{ fontSize: 12 }}>
                                                            {summary.currency !== 'KZT' && (
                                                                <div>Ставка заказчика: {fmt(summary.customerPrice)} {summary.currency}
                                                                    {summary.customerPriceBase ? ` — это ${fmt(summary.customerPriceBase)} ₸ по курсу на дату погрузки` : ''}</div>
                                                            )}
                                                            {summary.driverCostCurrency !== 'KZT' && (
                                                                <div>Ставка перевозчику: {fmt(summary.driverCost)} {summary.driverCostCurrency}
                                                                    {summary.driverCostBase ? ` — это ${fmt(summary.driverCostBase)} ₸` : ''}</div>
                                                            )}
                                                            <div style={{ color: 'var(--lc-text-ter)', marginTop: 4 }}>
                                                                Прибыль и долги считаются в тенге: складывать разные валюты нельзя.
                                                            </div>
                                                        </div>
                                                    )}
                                                />
                                            ) : null}

                                            {summary.unconvertedCurrencies?.length ? (
                                                <Alert
                                                    type="warning"
                                                    showIcon
                                                    style={{ marginBottom: 12 }}
                                                    message={`Нет курса: ${summary.unconvertedCurrencies.join(', ')}`}
                                                    description="Пока курс не загружен, эта сумма в прибыль и долги не входит — цифры ниже неполные. Загрузите курс в разделе «Финансы → Курсы валют» и сохраните заявку заново."
                                                />
                                            ) : null}

                                            <div className="lc2-metrics" style={{ marginBottom: 14 }}>
                                                {isClient ? (
                                                    <>
                                                        <Metric label="Стоимость перевозки" value={customerGross} color="#0369a1" bg="#e0f2fe" icon={<WalletOutlined />} sub={<Tag color={order.isCustomerPaid ? 'green' : 'orange'} style={{ margin: 0 }}>{order.isCustomerPaid ? 'Оплачено' : 'Не оплачено'}</Tag>} />
                                                        <Metric label="Поступления" value={summary.totalIncomes} color="#16a34a" bg="#e6ffed" icon={<WalletOutlined />} />
                                                        <Metric label="Расходы" value={summary.totalExpenses} color="#dc2626" bg="#ffeef0" icon={<DollarOutlined />} />
                                                        <Metric label="Долг экспедитору" value={summary.customerDebt} color="#e67e22" bg="#fff3e0" icon={<DollarOutlined />} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <Metric label="Стоимость от заказчика" value={customerGross} color="#0369a1" bg="#e0f2fe" icon={<WalletOutlined />} sub={<Tag color={order.isCustomerPaid ? 'green' : 'orange'} style={{ margin: 0 }}>{order.isCustomerPaid ? 'Оплачено заказчиком' : 'Не оплачено'}</Tag>} />
                                                        <Metric label="Ставка исполнителю" value={executorGross} color="#5f6672" bg="#f1f2f5" icon={<CarOutlined />} sub={<Tag color={isExecutorPaid ? 'green' : 'orange'} style={{ margin: 0 }}>{isExecutorPaid ? 'Оплачено' : 'Не оплачено'}</Tag>} />
                                                        <Metric label="Долг заказчика" value={summary.customerDebt} color="#e67e22" bg="#fff3e0" icon={<DollarOutlined />} />
                                                        <Metric label="Наш долг исполнителю" value={executorDebt} color="#e67e22" bg="#fff3e0" icon={<DollarOutlined />} />
                                                        <Metric label="Ожидаемая маржа" value={summary.margin} color={summary.margin >= 0 ? '#16a34a' : '#dc2626'} bg="#e6ffed" icon={<SwapOutlined />} />
                                                    </>
                                                )}
                                            </div>
                                            <Row gutter={[16, 16]}>
                                                {isClient ? (
                                                    <Col xs={24} md={12}>
                                                        <Breakdown title="Расчёты с экспедитором" accent="#16a34a" gross={customerGross} net={summary.revenueNet || 0} vat={summary.revenueVat || 0} vatRate={order.vatRate || 0} debt={summary.customerDebt || 0} />
                                                    </Col>
                                                ) : (
                                                    <>
                                                        <Col xs={24} md={12}>
                                                            <Breakdown title="Расчёты с заказчиком" accent="#16a34a" gross={customerGross} net={summary.revenueNet || 0} vat={summary.revenueVat || 0} vatRate={order.vatRate || 0} debt={summary.customerDebt || 0} />
                                                        </Col>
                                                        <Col xs={24} md={12}>
                                                            <Breakdown title="Расчёты с исполнителем" accent="#e67e22" gross={executorGross} net={summary.executorCostNet || 0} vat={summary.executorCostVat || 0} vatRate={order.executorVatRate || 0} debt={executorDebt || 0} />
                                                        </Col>
                                                    </>
                                                )}
                                            </Row>
                                        </div>
                                    );
                                })()}

                                {/* Платежи по заявке */}
                                <div className="lc-card" style={{ padding: 0, marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--lc-border)' }}>
                                        <span style={{ fontWeight: 600 }}><WalletOutlined style={{ color: token.colorPrimary, marginRight: 6 }} />Платежи по заявке ({payments.length})</span>
                                        {canEditFinance && <Button size="sm" onClick={handleAddPaymentClick}><Plus className="h-3.5 w-3.5" /> Зарегистрировать платёж</Button>}
                                    </div>
                                    <Table columns={paymentColumns} dataSource={payments} rowKey="id" size="small" pagination={false} locale={{ emptyText: 'Нет зарегистрированных платежей' }} scroll={{ x: true }} />
                                </div>

                                <Row gutter={[16, 16]}>
                                    <Col xs={24} lg={12}>
                                        <div className="lc-card" style={{ padding: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--lc-border)' }}>
                                                <span style={{ fontWeight: 600 }}><WalletOutlined style={{ color: '#16a34a', marginRight: 6 }} />Поступления ({incomes.length})</span>
                                                {canEditFinance && <Button size="sm" onClick={() => { incomeForm.resetFields(); incomeForm.setFieldsValue({ date: dayjs() }); loadFinanceSettings(); setIncomeModalOpen(true); }}><Plus className="h-3.5 w-3.5" /> Добавить</Button>}
                                            </div>
                                            <Table columns={incomeColumns} dataSource={incomes} rowKey="id" size="small" pagination={false} locale={{ emptyText: 'Нет поступлений' }} scroll={{ x: true }} />
                                        </div>
                                    </Col>
                                    <Col xs={24} lg={12}>
                                        <div className="lc-card" style={{ padding: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--lc-border)' }}>
                                                <span style={{ fontWeight: 600 }}><DollarOutlined style={{ color: '#dc2626', marginRight: 6 }} />Расходы ({expenses.length})</span>
                                                {canEditFinance && <Button size="sm" variant="destructive" onClick={() => { expenseForm.resetFields(); expenseForm.setFieldsValue({ date: dayjs() }); loadFinanceSettings(); setExpenseModalOpen(true); }}><Plus className="h-3.5 w-3.5" /> Добавить</Button>}
                                            </div>
                                            <Table columns={expenseColumns} dataSource={expenses} rowKey="id" size="small" pagination={false} locale={{ emptyText: 'Нет расходов' }} scroll={{ x: true }} />
                                        </div>
                                    </Col>
                                </Row>
                            </div>
                        )
                    },
                    {
                        key: 'documents',
                        label: (
                            <span>
                                <FilePdfOutlined style={{ marginRight: 6 }} />
                                Документы ({documents.length})
                            </span>
                        ),
                        children: (
                            <Card
                                size="small"
                                title={<span style={{ fontWeight: 600 }}><FilePdfOutlined style={{ color: '#1890ff', marginRight: 6 }} />Документы ({documents.length})</span>}
                                extra={
                                    <Upload customRequest={customUploadTTN} showUploadList={false}>
                                        <Button size="sm" disabled={uploadingDoc}>
                                            {uploadingDoc
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <UploadIcon className="h-3.5 w-3.5" />}
                                            Загрузить ТТН
                                        </Button>
                                    </Upload>
                                }
                                bordered={false}
                                className="premium-card"
                            >
                                <Table columns={docColumns} dataSource={documents} rowKey="id" size="small" pagination={false} locale={{ emptyText: 'Нет документов' }} scroll={{ x: true }} />
                            </Card>
                        )
                    },
                    {
                        key: 'history',
                        label: (
                            <span>
                                <ClockCircleOutlined style={{ marginRight: 6 }} />
                                История
                            </span>
                        ),
                        children: (
                            <Card
                                title={<span style={{ fontWeight: 600 }}><ClockCircleOutlined style={{ color: '#1677ff', marginRight: 8 }} />Что происходило с рейсом</span>}
                                bordered={false}
                                className="premium-card"
                            >
                                {/* Смены статуса и действия людей — одной лентой.
                                    Раньше здесь были только статусы, и даже они без
                                    автора: «кто вложил этот документ» узнать было
                                    негде. */}
                                <OrderHistory orderId={orderId} />
                            </Card>
                        )
                    }
                ]}
            />

            {/* =================== ASSIGN DRIVER MODAL =================== */}
            {data?.order && (
                <AssignDriverModal
                    open={assignModalOpen}
                    onCancel={() => setAssignModalOpen(false)}
                    orderId={orderId as string}
                    onSuccess={() => fetchData()}
                    initialValues={{
                        driverId: data.order.driverId || undefined,
                        partnerId: data.order.partnerId || undefined,
                        assignedDriverName: data.order.assignedDriverName || undefined,
                        assignedDriverPhone: data.order.assignedDriverPhone || undefined,
                        assignedDriverPlate: data.order.assignedDriverPlate || undefined,
                        assignedDriverTrailer: data.order.assignedDriverTrailer || undefined,
                    }}
                />
            )}

            {/* =================== STATUS MODAL =================== */}
            <OrderOperationModals
                order={order}
                user={user}
                payments={payments}
                statusColors={statusColors}
                statusLabels={statusLabels}
                getNextStatuses={getNextStatuses}
                statusModalOpen={statusModalOpen}
                setStatusModalOpen={setStatusModalOpen}
                statusForm={statusForm}
                statusLoading={statusLoading}
                handleStatusChange={handleStatusChange}
                selectedStatusInModal={selectedStatusInModal}
                setSelectedStatusInModal={setSelectedStatusInModal}
                rejectReasonModalOpen={rejectReasonModalOpen}
                setRejectReasonModalOpen={setRejectReasonModalOpen}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                handleRejectCompletion={handleRejectCompletion}
                completionActionLoading={completionActionLoading}
                transferModalOpen={transferModalOpen}
                setTransferModalOpen={setTransferModalOpen}
                transferUsers={transferUsers}
                transferUserId={transferUserId}
                setTransferUserId={setTransferUserId}
                transferLoading={transferLoading}
                handleTransferResponsible={handleTransferResponsible}
                sharePoAModalOpen={sharePoAModalOpen}
                setSharePoAModalOpen={setSharePoAModalOpen}
                sharePoALoading={sharePoALoading}
                handleSharePoA={handleSharePoA}
                shareEmailsList={shareEmailsList}
                setShareEmailsList={setShareEmailsList}
                customEmailInput={customEmailInput}
                setCustomEmailInput={setCustomEmailInput}
                handleAddCustomEmail={handleAddCustomEmail}
                driverLinkModalOpen={driverLinkModalOpen}
                setDriverLinkModalOpen={setDriverLinkModalOpen}
                driverLinkUrl={driverLinkUrl}
                driverLinkLoading={driverLinkLoading}
                regenerateDriverLink={regenerateDriverLink}
                driverPhone={driverPhone}
            />

            <OrderFinanceModals
                incomeModalOpen={incomeModalOpen}
                setIncomeModalOpen={setIncomeModalOpen}
                incomeForm={incomeForm}
                incomeLoading={incomeLoading}
                incomeCategories={incomeCategories}
                handleAddIncome={handleAddIncome}
                expenseModalOpen={expenseModalOpen}
                setExpenseModalOpen={setExpenseModalOpen}
                expenseForm={expenseForm}
                expenseLoading={expenseLoading}
                expenseCategories={expenseCategories}
                handleAddExpense={handleAddExpense}
                paymentModalOpen={paymentModalOpen}
                setPaymentModalOpen={setPaymentModalOpen}
                paymentForm={paymentForm}
                paymentLoading={paymentLoading}
                editingPayment={editingPayment}
                handleSavePayment={handleSavePayment}
                accounts={accounts}
                categories={categories}
                partners={partners}
                allocations={allocations}
                setAllocations={setAllocations}
            />

            {/* =================== QUICK PARTNER MODAL =================== */}
            <Modal title="Новый контрагент" open={quickPartnerModalOpen} onCancel={() => { setQuickPartnerModalOpen(false); quickPartnerForm.resetFields(); }} onOk={() => quickPartnerForm.submit()} confirmLoading={quickPartnerLoading} okText="Создать" cancelText="Отмена">
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
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}><Input placeholder="ТОО Пример" /></Form.Item>
                    <Form.Item name="bin" label="БИН/ИИН" rules={[{ required: true, message: 'Введите БИН' }, { pattern: /^\d{12}$/, message: 'Ровно 12 цифр' }]}><Input placeholder="123456789012" maxLength={12} /></Form.Item>
                    <Form.Item name="phone" label="Телефон"><Input placeholder="+77001234567" /></Form.Item>
                    <Form.Item name="email" label="Email"><Input placeholder="company@example.com" /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
