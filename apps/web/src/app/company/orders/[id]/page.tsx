'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Typography, Tag, Button, Descriptions, Card, Row, Col, Statistic, Table,
    Modal, Form, Input, InputNumber, Select, DatePicker, message, Timeline,
    Space, Spin, Divider, Popconfirm, Upload, Tabs, Checkbox, Radio, Tooltip,
    Alert, theme, AutoComplete
} from 'antd';
import {
    ArrowLeftOutlined, PlusOutlined, EnvironmentOutlined, FlagOutlined,
    DollarOutlined, WalletOutlined, CheckCircleOutlined, ClockCircleOutlined,
    EditOutlined, DeleteOutlined, FilePdfOutlined, UploadOutlined,
    UserAddOutlined, MailOutlined, FileTextOutlined, SwapOutlined,
    CloseCircleOutlined, CarOutlined, InboxOutlined, TeamOutlined,
    ExclamationCircleOutlined, CopyOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/auth';
import { resolveCompanyName, prepareCompanyOptions, shortenCompanyName } from '@/lib/company-helper';

const { Title, Text } = Typography;
const { TextArea } = Input;
import AssignDriverModal from '@/components/AssignDriverModal';
import QuickCreateLocationModal from '@/components/ui/QuickCreateLocationModal';
import StatusPill from '@/components/ui/StatusPill';

const MARKETPLACE_VALUE = '__MARKETPLACE__';
const MY_COMPANY_VALUE = '__MY_COMPANY__';

const statusColors: Record<string, string> = {
    DRAFT: 'default', PENDING: 'orange', ASSIGNED: 'blue',
    EN_ROUTE_PICKUP: 'gold', AT_PICKUP: 'lime', LOADING: 'purple',
    IN_TRANSIT: 'cyan', AT_DELIVERY: 'lime', UNLOADING: 'purple',
    COMPLETED: 'green', PROBLEM: 'red', CANCELLED: '#f5222d',
};

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик', PENDING: 'Ожидает', ASSIGNED: 'Назначен',
    EN_ROUTE_PICKUP: 'Едет на погр.', AT_PICKUP: 'На погрузке', LOADING: 'Загрузка',
    IN_TRANSIT: 'В пути', AT_DELIVERY: 'На выгрузке', UNLOADING: 'Разгрузка',
    COMPLETED: 'Завершён', PROBLEM: 'Проблема', CANCELLED: 'Отменён',
};

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

    const idx = chain.findIndex(item => item.value === s);
    if (idx === -1) return [];
    return chain.slice(idx + 1);
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

    // Unified payment states & role checks
    const canEditFinance = user?.role === 'COMPANY_ADMIN' || user?.role === 'ACCOUNTANT';
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [editingPayment, setEditingPayment] = useState<any>(null);
    const [paymentForm] = Form.useForm();
    const [paymentLoading, setPaymentLoading] = useState(false);

    useEffect(() => {
        const fetchFinanceSettings = async () => {
            try {
                const [accRes, catRes] = await Promise.all([
                    api.get('/accounting/finance-accounts'),
                    api.get('/accounting/finance-categories'),
                ]);
                setAccounts(accRes.data || []);
                setCategories(catRes.data || []);
            } catch (err) {
                console.error('Failed to load accounts/categories', err);
            }
        };
        fetchFinanceSettings();
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

    // Income modal
    const [incomeModalOpen, setIncomeModalOpen] = useState(false);
    const [incomeForm] = Form.useForm();
    const [incomeLoading, setIncomeLoading] = useState(false);

    // Expense modal
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [expenseForm] = Form.useForm();
    const [expenseLoading, setExpenseLoading] = useState(false);

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
    const [selectedCustomer, setSelectedCustomer] = useState<string>('');
    const [selectedCarrier, setSelectedCarrier] = useState<string>('');
    const [myCompanyName, setMyCompanyName] = useState('');
    const [routePointsState, setRoutePointsState] = useState<Array<LocationState & { pointType: string }>>([]);

    const isMeCust = selectedCustomer === MY_COMPANY_VALUE;
    const isMeCarr = selectedCarrier === MY_COMPANY_VALUE;
    const isMkt = selectedCarrier === MARKETPLACE_VALUE;

    const showCustomerPriceField = !isMeCust || (isMeCust && isMeCarr);
    const showDriverCostField = (isMeCust && !isMeCarr) || (!isMeCust && !isMeCarr);

    const customerPriceLabel = (isMeCust && isMeCarr) ? "Ставка (₸)" : "Ставка от заказчика (₸)";
    const driverCostLabel = isMkt ? "Ставка для биржи (₸)" : "Ставка перевозчику (₸)";

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

    const getCustomerOptions = () => {
        const list = [...partners];
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

    // =================== DATA FETCHING ===================

    const fetchData = async () => {
        try {
            const res = await api.get(`/accounting/orders/${orderId}/financials`);
            setData(res.data);
        } catch (err: any) {
            message.error('Не удалось загрузить заявку');
        } finally {
            setLoading(false);
        }
    };

    const fetchDocuments = async () => {
        try {
            const res = await api.get(`/documents/order/${orderId}`);
            setDocuments(res.data);
        } catch { }
    };

    // Передать заявку другому менеджеру своей компании
    const openTransferModal = async () => {
        setTransferModalOpen(true);
        try {
            const res = await api.get('/company/users', { params: { segment: 'office' } });
            const raw = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            setTransferUsers(raw);
        } catch {
            message.error('Не удалось загрузить список сотрудников');
        }
    };

    const handleTransferResponsible = async () => {
        if (!transferUserId) return;
        setTransferLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/responsible`, { userId: transferUserId });
            message.success('Заявка передана другому менеджеру');
            setTransferModalOpen(false);
            setTransferUserId(undefined);
            fetchData();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось передать заявку');
        } finally {
            setTransferLoading(false);
        }
    };

    const fetchDrivers = async () => {
        setDriversLoading(true);
        try {
            const response = await api.get('/users/drivers');
            setDrivers(response.data);
        } catch { } finally { setDriversLoading(false); }
    };

    const fetchVehicles = async () => {
        setVehiclesLoading(true);
        try {
            const response = await api.get('/company/vehicles');
            setVehicles(response.data || []);
        } catch { } finally { setVehiclesLoading(false); }
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
            const partnersList = partnersRes.data.filter((p: any) => p.isCarrier);
            const externalList = externalRes.data
                .filter((e: any) => e.isCarrier)
                .map((e: any) => ({ id: e.id, name: e.name }));
            
            const ownCompanies = (myCompaniesRes.data || []).map((c: any) => ({
                id: c.id,
                name: `${c.name} (Моя компания)`
            }));

            if (profileRes.data && !ownCompanies.some((c: any) => c.id === profileRes.data.id)) {
                ownCompanies.push({
                    id: profileRes.data.id,
                    name: `${profileRes.data.name} (Моя компания)`
                });
            }

            const combined = [...ownCompanies, ...partnersList, ...externalList];
            setPartners(combined);
            setForwarders(combined);
            if (profileRes.data?.name) {
                setMyCompanyName(profileRes.data.name);
            }
        } catch { } finally { setPartnersLoading(false); }
    };

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch { }
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
        } catch { }
    };

    useEffect(() => {
        fetchData();
        fetchDocuments();
        fetchPartners();
        fetchLocations();
        fetchCargoTypes();
    }, [orderId]);

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
            message.success('ТТН успешно загружена');
            onSuccess("ok");
            fetchDocuments();
        } catch (err) {
            message.error('Ошибка загрузки документа');
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
        } catch { message.error('Ошибка при скачивании файла'); }
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
            if (editingPayment) {
                await api.put(`/accounting/payments/${editingPayment.id}`, payload);
                message.success('Платеж обновлен');
            } else {
                await api.post('/accounting/payments', payload);
                message.success('Платеж добавлен');
            }
            setPaymentModalOpen(false);
            fetchData();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка сохранения платежа');
        } finally {
            setPaymentLoading(false);
        }
    };

    const handleDeletePayment = async (id: string) => {
        try {
            await api.delete(`/accounting/payments/${id}`);
            message.success('Платеж удален');
            fetchData();
        } catch (err: any) {
            message.error(err.response?.data?.message || 'Ошибка удаления платежа');
        }
    };

    // =================== INCOME / EXPENSE HANDLERS ===================

    const handleAddIncome = async (values: any) => {
        setIncomeLoading(true);
        try {
            await api.post('/accounting/incomes', { ...values, date: values.date.toISOString(), orderId });
            message.success('Поступление добавлено');
            setIncomeModalOpen(false);
            incomeForm.resetFields();
            fetchData();
        } catch { message.error('Ошибка'); } finally { setIncomeLoading(false); }
    };

    const handleAddExpense = async (values: any) => {
        setExpenseLoading(true);
        try {
            await api.post('/accounting/expenses', { ...values, date: values.date.toISOString(), orderId });
            message.success('Расход добавлен');
            setExpenseModalOpen(false);
            expenseForm.resetFields();
            fetchData();
        } catch { message.error('Ошибка'); } finally { setExpenseLoading(false); }
    };

    const handleDeleteIncome = async (id: string) => {
        try { await api.delete(`/accounting/incomes/${id}`); message.success('Удалено'); fetchData(); }
        catch { message.error('Ошибка удаления'); }
    };

    const handleDeleteExpense = async (id: string) => {
        try { await api.delete(`/accounting/expenses/${id}`); message.success('Удалено'); fetchData(); }
        catch { message.error('Ошибка удаления'); }
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
            message.success('Статус обновлён');
            setStatusModalOpen(false);
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        } finally { setStatusLoading(false); }
    };

    // =================== COMPLETION CONFIRMATION ===================

    const handleConfirmCompletion = async () => {
        setCompletionActionLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/confirm-completion`);
            message.success('Завершение рейса подтверждено');
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка подтверждения');
        } finally { setCompletionActionLoading(false); }
    };

    const handleRejectCompletion = async () => {
        setCompletionActionLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/reject-completion`, { reason: rejectReason || undefined });
            message.success('Запрос на завершение отклонён');
            setRejectReasonModalOpen(false);
            setRejectReason('');
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка отклонения');
        } finally { setCompletionActionLoading(false); }
    };

    const handleCancelCompletionRequest = async () => {
        setCompletionActionLoading(true);
        try {
            await api.put(`/company/orders/${orderId}/cancel-completion`);
            message.success('Запрос на завершение отменён');
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка отмены');
        } finally { setCompletionActionLoading(false); }
    };

    const handleCancelOrder = async () => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: 'CANCELLED', comment: 'Отменено пользователем' });
            message.success('Заявка отменена');
            fetchData();
        } catch {
            try {
                await api.put(`/company/orders/${orderId}/status`, { status: 'CANCELLED', comment: 'Отменено пользователем' });
                message.success('Заявка отменена');
                fetchData();
            } catch (err: any) {
                message.error(err.response?.data?.message || 'Ошибка отмены');
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
            pickupDate: order.routePoints?.find((p: any) => p.pointType === 'PICKUP')?.expectedDate
                ? dayjs(order.routePoints.find((p: any) => p.pointType === 'PICKUP').expectedDate)
                : undefined,
            forwarderId: order.subForwarderId || (order.forwarderId !== user?.companyId ? order.forwarderId : undefined),
            customerCompanyId: order.customerCompanyId || order.customerCompany?.id || undefined,
            vatRate: order.vatRate ?? 0,
            hasVat: order.hasVat ?? false,
            executorVatRate: order.executorVatRate ?? 0,
            executorHasVat: order.executorHasVat ?? false,
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
        setIsEditing(true);
    };

    const handleEditCreatorRoleChange = (role: 'CUSTOMER' | 'FORWARDER') => {
        // Obsolete but keep placeholder or remove since we removed role states. We'll delete unused functions below.
    };

    const handleEditOrder = async (values: any) => {
        if (!selectedCustomer) { message.error('Укажите заказчика'); return; }
        if (!selectedCarrier) { message.error('Укажите перевозчика'); return; }

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
                message.error('Укажите минимум 2 точки маршрута');
                return;
            }

            const finalCustomerPrice = showCustomerPriceField ? values.customerPrice : values.driverCost;
            const finalDriverCost = showDriverCostField ? values.driverCost : null;

            const updateData: any = {
                cargoDescription: values.cargoDescription,
                natureOfCargo: values.natureOfCargo,
                cargoWeight: values.cargoWeight,
                cargoVolume: values.cargoVolume,
                cargoType: values.cargoType,
                requirements: values.requirements,
                customerPrice: finalCustomerPrice,
                customerPriceType: values.customerPriceType || 'FIXED',
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
            message.success('Заявка обновлена');
            setIsEditing(false);
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка обновления');
        }
    };

    // =================== POWER OF ATTORNEY ===================

    const handleDownloadPoA = async () => {
        try {
            const res = await api.get(`/orders/${orderId}/power-of-attorney`, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Доверенность_${data?.order?.orderNumber || orderId}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch { message.error('Ошибка скачивания доверенности'); }
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
        if (selectedEmails.length === 0) { message.warning('Выберите хотя бы один email'); return; }
        const uniqueEmails = Array.from(new Set(selectedEmails));
        setSharePoALoading(true);
        try {
            await api.post(`/orders/${orderId}/share-power-of-attorney`, { emails: uniqueEmails });
            message.success('Доверенность отправлена');
            setSharePoAModalOpen(false);
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка отправки');
        } finally { setSharePoALoading(false); }
    };

    const handleAddCustomEmail = () => {
        const email = customEmailInput.trim();
        if (!email) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { message.error('Некорректный email'); return; }
        if (shareEmailsList.some(item => item.email === email)) { message.warning('Email уже добавлен'); return; }
        if (shareEmailsList.length >= 15) { message.warning('Максимум 15 получателей'); return; }
        setShareEmailsList([...shareEmailsList, { email, checked: true, label: `Вручную: ${email}` }]);
        setCustomEmailInput('');
    };

    // =================== QUICK PARTNER ===================

    const handleCreateQuickPartner = async (values: any) => {
        setQuickPartnerLoading(true);
        try {
            await api.post('/external-companies', { ...values, isCustomer: false, isCarrier: true, type: 'FORWARDER' });
            message.success('Контрагент добавлен');
            setQuickPartnerModalOpen(false);
            quickPartnerForm.resetFields();
            await fetchPartners();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка');
        } finally { setQuickPartnerLoading(false); }
    };

    // =================== RENDER ===================

    if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
    if (!data) return <div style={{ textAlign: 'center', padding: 80 }}>Заявка не найдена</div>;

    const { order, incomes, expenses, payments = [], summary } = data;
    const fmt = (n: number) => n.toLocaleString('ru-RU');

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
            title: 'Счет / Касса',
            dataIndex: 'account',
            key: 'account',
            width: 140,
            render: (_: any, r: any) => r.account?.name || (r.method === 'CASH' ? 'Наличные' : 'Расчетный счет'),
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
                        <Button size="small" icon={<EditOutlined />} onClick={() => handleEditPaymentClick(r)} />
                        <Popconfirm title="Удалить платеж?" onConfirm={() => handleDeletePayment(r.id)} okText="Да" cancelText="Нет">
                            <Button size="small" danger icon={<DeleteOutlined />} />
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
            !r.isDeleted && <Popconfirm title="Удалить?" onConfirm={() => handleDeleteIncome(r.id)} okText="Да" cancelText="Нет"><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        )},
    ];

    const expenseColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{dayjs(d).format('DD.MM.YY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'cat', width: 140, render: (c: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{expenseCategories.find(x => x.value === c)?.label || c}</Text> },
        { title: 'Описание', dataIndex: 'description', key: 'desc', ellipsis: true, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{d}</Text> },
        { title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const, render: (a: number, r: any) => <Text delete={r.isDeleted} strong style={{ color: r.isDeleted ? 'var(--lc-text-ter)' : '#cf1322' }}>{fmt(a)}</Text> },
        { title: '', key: 'actions', width: 50, render: (_: any, r: any) => (
            !r.isDeleted && <Popconfirm title="Удалить?" onConfirm={() => handleDeleteExpense(r.id)} okText="Да" cancelText="Нет"><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        )},
    ];

    const docColumns = [
        { title: 'Тип', dataIndex: 'type', key: 'type', width: 100, render: (t: string) => t === 'TTN' ? 'ТТН' : t },
        { title: 'Файл', dataIndex: 'fileName', key: 'fileName' },
        { title: 'Размер', dataIndex: 'fileSize', key: 'size', width: 100, render: (s: number) => `${(s / 1024).toFixed(1)} KB` },
        { title: 'Дата', dataIndex: 'createdAt', key: 'date', width: 130, render: (d: string) => dayjs(d).format('DD.MM.YY HH:mm') },
        { title: '', key: 'action', width: 80, render: (_: any, r: any) => (
            <Button size="small" type="link" onClick={() => handleDownloadDoc(r)}>Скачать</Button>
        )}
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* =================== HEADER =================== */}
            <div className="lc2-hero" style={{ borderBottom: '1px solid var(--lc-border)', paddingBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} />
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
                            <Button type="primary" icon={<SwapOutlined />} onClick={() => { statusForm.resetFields(); setStatusModalOpen(true); }}>
                                {order.status === 'COMPLETED' ? 'Вернуть / изменить статус' : 'Изменить статус'}
                            </Button>
                        )}
                        {isNotFinished && (
                            <Button icon={<EditOutlined />} onClick={startEditing}>
                                Редактировать
                            </Button>
                        )}
                        <Button icon={<CopyOutlined />} onClick={() => router.push(`/company/orders/create?from=${orderId}`)}>
                            Дублировать
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
                                <Button danger icon={<CloseCircleOutlined />}>
                                    Отменить заявку
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
                                    type="primary"
                                    icon={<CheckCircleOutlined />}
                                    loading={completionActionLoading}
                                    onClick={handleConfirmCompletion}
                                >
                                    Подтвердить завершение
                                </Button>
                                <Button
                                    danger
                                    icon={<CloseCircleOutlined />}
                                    loading={completionActionLoading}
                                    onClick={() => setRejectReasonModalOpen(true)}
                                >
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
                                    icon={<CloseCircleOutlined />}
                                    loading={completionActionLoading}
                                >
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
                                <Form form={editForm} layout="vertical" onFinish={handleEditOrder}>
                                    <Row gutter={[24, 24]}>
                                        <Col xs={24} lg={15}>
                                            {/* Route Card (Editable) */}
                                            <Card
                                                title={<span style={{ fontWeight: 600 }}><EnvironmentOutlined style={{ marginRight: 8, color: '#1677ff' }} />Маршрут следования</span>}
                                                bordered={false}
                                                className="premium-card"
                                                style={{ marginBottom: 20 }}
                                            >
                                                <Form.Item name="pickupDate" label="Дата погрузки" rules={[{ required: true, message: 'Укажите дату' }]}>
                                                    <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY HH:mm" showTime={{ format: 'HH:mm' }} placeholder="Дата и время" />
                                                </Form.Item>
                                                {routePointsState.map((pt, i) => (
                                                    <div key={i} style={{
                                                        padding: '12px 16px',
                                                        background: pt.pointType === 'DELIVERY' ? '#f6ffed' : '#f0f5ff',
                                                        borderRadius: 10,
                                                        marginBottom: 12,
                                                        border: pt.pointType === 'DELIVERY' ? '1px solid #b7eb8f' : '1px solid #adc6ff',
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                            <Select
                                                                value={pt.pointType}
                                                                onChange={val => { const newPts = [...routePointsState]; newPts[i].pointType = val; setRoutePointsState(newPts); }}
                                                                size="small"
                                                                style={{ width: 160, fontWeight: 600 }}
                                                                variant="borderless"
                                                            >
                                                                <Select.Option value="PICKUP"><EnvironmentOutlined style={{ color: '#1890ff', marginRight: 4 }} /> Погрузка</Select.Option>
                                                                <Select.Option value="ADDITIONAL_PICKUP"><EnvironmentOutlined style={{ color: '#1890ff', marginRight: 4 }} /> Доп. погрузка</Select.Option>
                                                                <Select.Option value="DELIVERY"><FlagOutlined style={{ color: '#52c41a', marginRight: 4 }} /> Выгрузка</Select.Option>
                                                            </Select>
                                                            {routePointsState.length > 2 && (
                                                                <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => {
                                                                    const newPts = [...routePointsState]; newPts.splice(i, 1); setRoutePointsState(newPts);
                                                                }} />
                                                            )}
                                                        </div>
                                                        <Select
                                                            placeholder="Выберите адрес"
                                                            allowClear showSearch optionFilterProp="children"
                                                            style={{ width: '100%' }}
                                                            value={pt.id || undefined}
                                                            onChange={(val) => {
                                                                const newPts = [...routePointsState];
                                                                if (!val) { newPts[i] = { ...newPts[i], city: '', address: '', id: undefined }; }
                                                                else {
                                                                    const loc = locations.find(l => l.id === val);
                                                                    if (loc) {
                                                                        newPts[i] = { ...newPts[i], city: loc.city || '', address: loc.address, id: loc.id };
                                                                    }
                                                                }
                                                                setRoutePointsState(newPts);
                                                            }}
                                                        >
                                                            {getLocationOptions().map(group => (
                                                                <Select.OptGroup key={group.label} label={group.label}>
                                                                    {group.options.map(l => (
                                                                        <Select.Option key={l.id} value={l.id}>
                                                                            {l.city ? `[${l.city}] ` : ''}{l.name} ({l.address})
                                                                        </Select.Option>
                                                                    ))}
                                                                </Select.OptGroup>
                                                            ))}
                                                        </Select>
                                                    </div>
                                                ))}
                                                <Button
                                                    type="dashed"
                                                    icon={<PlusOutlined />}
                                                    onClick={() => setRoutePointsState([...routePointsState, { city: '', address: '', pointType: 'ADDITIONAL_PICKUP' }])}
                                                    style={{ width: '100%' }}
                                                >
                                                    Добавить точку
                                                </Button>
                                            </Card>

                                            {/* Cargo Card (Editable) */}
                                            <Card
                                                title={<span style={{ fontWeight: 600 }}><InboxOutlined style={{ marginRight: 8, color: '#1677ff' }} />Информация о грузе</span>}
                                                bordered={false}
                                                className="premium-card"
                                            >
                                                <Row gutter={12}>
                                                    <Col span={12}>
                                                        <Form.Item name="natureOfCargo" label="Характер груза" rules={[{ required: true, message: 'Выберите из списка или впишите свой вариант' }]}>
                                                            <AutoComplete
                                                                placeholder="Выберите или впишите свой вариант..."
                                                                size="large"
                                                                options={cargoCategories.map(cat => ({
                                                                    label: cat.name,
                                                                    options: (cat.types || []).map((t: any) => ({ value: t.name, label: t.name })),
                                                                }))}
                                                                filterOption={(input, option: any) =>
                                                                    String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                                                                }
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item name="cargoType" label="Тип кузова">
                                                            <Select placeholder="Тент, Реф..." allowClear showSearch optionFilterProp="children" size="large">
                                                                {VEHICLE_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                                            </Select>
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                                <Form.Item name="cargoDescription" label="Описание груза">
                                                    <TextArea rows={2} placeholder="Мебель, 20 коробок, палеты..." />
                                                </Form.Item>
                                                <Row gutter={12}>
                                                    <Col span={12}>
                                                        <Form.Item name="cargoWeight" label="Вес (кг)">
                                                            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col span={12}>
                                                        <Form.Item name="cargoVolume" label="Объём (м³)">
                                                            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                                <Form.Item name="requirements" label="Доп. требования">
                                                    <TextArea rows={2} placeholder="Ремни, коники, гидроборт..." />
                                                </Form.Item>
                                            </Card>
                                        </Col>

                                        <Col xs={24} lg={9}>
                                            {/* Role & Parties Card (Editable) */}
                                            <Card
                                                title={<span style={{ fontWeight: 600 }}><TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />Участники и Ставки</span>}
                                                bordered={false}
                                                className="premium-card"
                                            >
                                                {/* Role info text */}
                                                <div style={{
                                                    padding: '10px 16px',
                                                    background: `${roleInfo.color}10`,
                                                    border: `1px solid ${roleInfo.color}40`,
                                                    borderRadius: 8,
                                                    marginBottom: 20,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                }}>
                                                    <CheckCircleOutlined style={{ color: roleInfo.color, fontSize: 16 }} />
                                                    <Text style={{ color: roleInfo.color, fontWeight: 500, fontSize: 13 }}>{roleInfo.text}</Text>
                                                </div>

                                                <div style={{ marginBottom: 16 }}>
                                                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Кто заказчик?</div>
                                                    <Select
                                                        placeholder="Выберите заказчика"
                                                        style={{ width: '100%' }}
                                                        size="large"
                                                        value={selectedCustomer || undefined}
                                                        onChange={setSelectedCustomer}
                                                        showSearch
                                                        optionLabelProp="label"
                                                        options={[
                                                            { value: MY_COMPANY_VALUE, label: `${myCompanyName || 'Моя компания'} (Моя компания)` },
                                                            ...prepareCompanyOptions(getCustomerOptions(), selectedCustomer)
                                                        ]}
                                                        dropdownRender={(menu) => (
                                                            <>
                                                                <Button
                                                                    type="text"
                                                                    icon={<PlusOutlined />}
                                                                    block
                                                                    onClick={() => {
                                                                        setQuickPartnerTarget('CUSTOMER');
                                                                        setQuickPartnerModalOpen(true);
                                                                    }}
                                                                    style={{ textAlign: 'left', padding: '8px 12px', height: 'auto', color: '#1677ff', fontWeight: 500 }}
                                                                >
                                                                    + Добавить контрагента
                                                                </Button>
                                                                <Divider style={{ margin: '4px 0' }} />
                                                                {menu}
                                                            </>
                                                        )}
                                                    />
                                                </div>

                                                <div style={{ marginBottom: 20 }}>
                                                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Кто перевозчик?</div>
                                                    <Select
                                                        placeholder="Выберите перевозчика"
                                                        style={{ width: '100%' }}
                                                        size="large"
                                                        value={selectedCarrier || undefined}
                                                        onChange={setSelectedCarrier}
                                                        showSearch
                                                        optionLabelProp="label"
                                                        options={[
                                                            { value: MY_COMPANY_VALUE, label: `${myCompanyName || 'Моя компания'} (Моя компания)` },
                                                            ...(selectedCarrier === MARKETPLACE_VALUE ? [{ value: MARKETPLACE_VALUE, label: '📢 Опубликовать на бирже' }] : []),
                                                            ...prepareCompanyOptions(getCustomerOptions(), selectedCarrier)
                                                        ]}
                                                        dropdownRender={(menu) => (
                                                            <>
                                                                <Button
                                                                    type="text"
                                                                    icon={<PlusOutlined />}
                                                                    block
                                                                    onClick={() => {
                                                                        setQuickPartnerTarget('CARRIER');
                                                                        setQuickPartnerModalOpen(true);
                                                                    }}
                                                                    style={{ textAlign: 'left', padding: '8px 12px', height: 'auto', color: '#1677ff', fontWeight: 500 }}
                                                                >
                                                                    + Добавить контрагента
                                                                </Button>
                                                                <Divider style={{ margin: '4px 0' }} />
                                                                {menu}
                                                            </>
                                                        )}
                                                    />
                                                </div>

                                                <Divider style={{ margin: '8px 0 16px' }}>Ставки</Divider>

                                                {showCustomerPriceField && (
                                                    <Row gutter={12}>
                                                        <Col span={12}>
                                                            <Form.Item name="customerPrice" label={customerPriceLabel}>
                                                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" disabled={!canEditFinance} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={6}>
                                                            <Form.Item name="hasVat" label="НДС" initialValue={false}>
                                                                <Select size="large" disabled={!canEditFinance}>
                                                                    <Select.Option value={false}>Без</Select.Option>
                                                                    <Select.Option value={true}>С НДС</Select.Option>
                                                                </Select>
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={6}>
                                                            <Form.Item name="vatRate" label="Ставка" initialValue={12}>
                                                                <Select size="large" disabled={!canEditFinance}>
                                                                    <Select.Option value={0}>0%</Select.Option>
                                                                    <Select.Option value={12}>12%</Select.Option>
                                                                </Select>
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                )}

                                                {showDriverCostField && (
                                                    <Row gutter={12}>
                                                        <Col span={12}>
                                                            <Form.Item name="driverCost" label={driverCostLabel}>
                                                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" disabled={!canEditFinance} />
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={6}>
                                                            <Form.Item name="executorHasVat" label="НДС" initialValue={false}>
                                                                <Select size="large" disabled={!canEditFinance}>
                                                                    <Select.Option value={false}>Без</Select.Option>
                                                                    <Select.Option value={true}>С НДС</Select.Option>
                                                                </Select>
                                                            </Form.Item>
                                                        </Col>
                                                        <Col span={6}>
                                                            <Form.Item name="executorVatRate" label="Ставка" initialValue={12}>
                                                                <Select size="large" disabled={!canEditFinance}>
                                                                    <Select.Option value={0}>0%</Select.Option>
                                                                    <Select.Option value={12}>12%</Select.Option>
                                                                </Select>
                                                            </Form.Item>
                                                        </Col>
                                                    </Row>
                                                )}

                                                <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                                                    <Select style={{ width: '100%' }} size="large">
                                                        <Select.Option value="FIXED">За рейс</Select.Option>
                                                        <Select.Option value="PER_KM">За км</Select.Option>
                                                        <Select.Option value="PER_TON">За тонну</Select.Option>
                                                    </Select>
                                                </Form.Item>

                                                {/* Margin preview */}
                                                <Form.Item noStyle dependencies={['customerPrice', 'driverCost', 'hasVat', 'vatRate', 'executorHasVat', 'executorVatRate']}>
                                                    {({ getFieldValue }) => {
                                                        const cp = getFieldValue('customerPrice') || 0;
                                                        const dc = getFieldValue('driverCost') || 0;
                                                        const hasVat = getFieldValue('hasVat') ?? false;
                                                        const vatRate = getFieldValue('vatRate') ?? 0;
                                                        const executorHasVat = getFieldValue('executorHasVat') ?? false;
                                                        const executorVatRate = getFieldValue('executorVatRate') ?? 0;

                                                        if (cp && dc && showCustomerPriceField && showDriverCostField) {
                                                            const cpNet = hasVat ? (cp / (1 + vatRate / 100)) : cp;
                                                            const dcNet = executorHasVat ? (dc / (1 + executorVatRate / 100)) : dc;
                                                            const margin = Math.round((cpNet - dcNet) * 100) / 100;
                                                            const marginPercent = cpNet > 0 ? Math.round((margin / cpNet) * 100) : 0;

                                                            return (
                                                                <div style={{
                                                                    padding: '10px 16px',
                                                                    background: margin >= 0 ? '#ecfdf5' : '#fef2f2',
                                                                    border: `1px solid ${margin >= 0 ? '#a7f3d0' : '#fca5a5'}`,
                                                                    borderRadius: 10,
                                                                    fontSize: 13,
                                                                    fontWeight: 500,
                                                                    marginTop: 12,
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center'
                                                                }}>
                                                                    <span>Чистая маржа: <strong style={{ color: margin >= 0 ? '#059669' : '#dc2626', fontSize: 15 }}>{margin.toLocaleString('ru-RU')} ₸</strong></span>
                                                                    <Tag color={margin >= 0 ? 'green' : 'red'}>{marginPercent}%</Tag>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                </Form.Item>
                                            </Card>

                                            {/* Action buttons for saving the inline form */}
                                            <div style={{ marginTop: 20, background: 'var(--lc-card-2)', padding: 16, borderRadius: 8, border: '1px solid var(--lc-border)', display: 'flex', gap: 12 }}>
                                                <Button type="primary" onClick={() => editForm.submit()} style={{ flex: 1 }} disabled={!selectedCustomer || !selectedCarrier}>
                                                    Сохранить
                                                </Button>
                                                <Button onClick={() => setIsEditing(false)} style={{ flex: 1 }}>
                                                    Отмена
                                                </Button>
                                            </div>
                                        </Col>
                                    </Row>
                                </Form>
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
                                                                <a href={`tel:${driverPhone}`} style={{ color: '#1677ff' }}>{driverPhone}</a>
                                                            ) : '—'}
                                                        </Descriptions.Item>
                                                        <Descriptions.Item label="Автомобиль">{driverPlate || '—'}</Descriptions.Item>
                                                        <Descriptions.Item label="Прицеп">{driverTrailer || '—'}</Descriptions.Item>
                                                    </Descriptions>

                                                    <Divider style={{ margin: '12px 0' }} />

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        <Button
                                                            type="primary"
                                                            icon={<UserAddOutlined />}
                                                            onClick={openAssignModal}
                                                            block
                                                        >
                                                            Изменить водителя
                                                        </Button>
                                                        <Button
                                                            icon={<FileTextOutlined />}
                                                            onClick={handleDownloadPoA}
                                                            block
                                                        >
                                                            Скачать доверенность (PDF)
                                                        </Button>
                                                        <Button
                                                            icon={<MailOutlined />}
                                                            onClick={openSharePoAModal}
                                                            block
                                                        >
                                                            Отправить доверенность по email
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                                                    <div style={{ marginBottom: 12 }}>
                                                        <Tag color="warning" style={{ fontSize: 13, padding: '4px 16px', borderRadius: 4 }}>Водитель не назначен</Tag>
                                                    </div>
                                                    <Button
                                                        type="primary"
                                                        icon={<UserAddOutlined />}
                                                        onClick={openAssignModal}
                                                        block
                                                    >
                                                        Назначить водителя
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
                                                            <Button size="small" type="link" onClick={openTransferModal}>
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
                                {/* Financial Summary */}
                                <Card bordered={false} className="premium-card" style={{ marginBottom: 20 }}>
                                    {(() => {
                                        const isClient = order.customerCompanyId === user?.companyId;
                                        const isExecutorPaid = order.subForwarderId ? order.isSubForwarderPaid : order.isDriverPaid;
                                        const executorDebt = summary.executorDebt !== undefined
                                            ? summary.executorDebt
                                            : (order.subForwarderId
                                                ? (order.isSubForwarderPaid ? 0 : order.subForwarderPrice || 0)
                                                : (order.isDriverPaid ? 0 : (order.driverCost || 0) - summary.totalExpenses));

                                        if (isClient) {
                                            return (
                                                <div>
                                                    <Row gutter={[16, 16]}>
                                                        <Col xs={12} sm={6}>
                                                            <Statistic title="Стоимость перевозки" value={summary.customerPrice} suffix="₸" valueStyle={{ fontSize: 18, fontWeight: 600 }} />
                                                            <Tag color={order.isCustomerPaid ? 'green' : 'orange'} style={{ marginTop: 4 }}>
                                                                {order.isCustomerPaid ? 'Оплачено экспедитору' : 'Не оплачено экспедитору'}
                                                            </Tag>
                                                        </Col>
                                                        <Col xs={12} sm={6}>
                                                            <Statistic title="Ваши Поступления" value={summary.totalIncomes} suffix="₸" valueStyle={{ fontSize: 18, color: '#389e0d' }} prefix={<WalletOutlined />} />
                                                        </Col>
                                                        <Col xs={12} sm={6}>
                                                            <Statistic title="Ваши Расходы" value={summary.totalExpenses} suffix="₸" valueStyle={{ fontSize: 18, color: '#cf1322' }} prefix={<DollarOutlined />} />
                                                        </Col>
                                                        <Col xs={12} sm={6}>
                                                            <Statistic title="Долг экспедитору" value={summary.customerDebt} suffix="₸" valueStyle={{ fontSize: 18, color: summary.customerDebt > 0 ? '#faad14' : '#389e0d' }} />
                                                        </Col>
                                                    </Row>
                                                    <Row gutter={[16, 16]} style={{ marginTop: 16, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16 }}>
                                                        <Col xs={24} md={12}>
                                                            <div style={{ padding: 12, borderRadius: 8, background: '#f6ffed', border: `1px solid ${token.colorSuccessBorder}` }}>
                                                                <div style={{ fontWeight: 600, marginBottom: 8, color: token.colorSuccess }}>Расчеты с экспедитором</div>
                                                                <Row gutter={[8, 8]}>
                                                                    <Col span={12}><Text type="secondary">Всего (Gross):</Text></Col>
                                                                    <Col span={12} style={{ textAlign: 'right' }}><Text strong>{fmt(summary.customerPrice)} ₸</Text></Col>
                                                                    <Col span={12}><Text type="secondary">Без НДС (Net):</Text></Col>
                                                                    <Col span={12} style={{ textAlign: 'right' }}><Text>{fmt(summary.revenueNet || 0)} ₸</Text></Col>
                                                                    <Col span={12}><Text type="secondary">НДС ({order.vatRate || 0}%):</Text></Col>
                                                                    <Col span={12} style={{ textAlign: 'right' }}><Text>{fmt(summary.revenueVat || 0)} ₸</Text></Col>
                                                                    <Col span={12}><Text strong style={{ color: token.colorError }}>Оставшийся долг:</Text></Col>
                                                                    <Col span={12} style={{ textAlign: 'right' }}><Text strong style={{ color: token.colorError }}>{fmt(summary.customerDebt || 0)} ₸</Text></Col>
                                                                </Row>
                                                            </div>
                                                        </Col>
                                                    </Row>
                                                </div>
                                            );
                                        }
                                        return (
                                            <div>
                                                <Row gutter={[16, 16]}>
                                                    <Col xs={12} md={5}>
                                                        <Statistic title="Стоимость от заказчика" value={summary.customerPrice} suffix="₸" valueStyle={{ fontSize: 18, fontWeight: 600 }} />
                                                        <Tag color={order.isCustomerPaid ? 'green' : 'orange'} style={{ marginTop: 4 }}>
                                                            {order.isCustomerPaid ? 'Оплачено заказчиком' : 'Не оплачено заказчиком'}
                                                        </Tag>
                                                    </Col>
                                                    <Col xs={12} md={5}>
                                                        <Statistic title="Ставка исполнителю" value={summary.executorCost} suffix="₸" valueStyle={{ fontSize: 18, fontWeight: 600 }} />
                                                        <Tag color={isExecutorPaid ? 'green' : 'orange'} style={{ marginTop: 4 }}>
                                                            {isExecutorPaid ? 'Оплачено исполнителю' : 'Не оплачено исполнителю'}
                                                        </Tag>
                                                    </Col>
                                                    <Col xs={12} md={5}>
                                                        <Statistic title="Долг заказчика" value={summary.customerDebt} suffix="₸" valueStyle={{ fontSize: 18, color: summary.customerDebt > 0 ? '#cf1322' : '#389e0d' }} />
                                                    </Col>
                                                    <Col xs={12} md={5}>
                                                        <Statistic title="Наш долг исполнителю" value={executorDebt} suffix="₸" valueStyle={{ fontSize: 18, color: executorDebt > 0 ? '#cf1322' : '#389e0d' }} />
                                                    </Col>
                                                    <Col xs={12} md={4}>
                                                        <Statistic title="Ожидаемая маржа" value={summary.margin} suffix="₸" valueStyle={{ fontSize: 18, fontWeight: 700, color: summary.margin >= 0 ? '#389e0d' : '#cf1322' }} prefix={<DollarOutlined />} />
                                                    </Col>
                                                </Row>
                                                <Row gutter={[16, 16]} style={{ marginTop: 16, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16 }}>
                                                    <Col xs={24} md={12}>
                                                        <div style={{ padding: 12, borderRadius: 8, background: '#f6ffed', border: `1px solid ${token.colorSuccessBorder}` }}>
                                                            <div style={{ fontWeight: 600, marginBottom: 8, color: token.colorSuccess }}>Расчеты с Заказчиком</div>
                                                            <Row gutter={[8, 8]}>
                                                                <Col span={12}><Text type="secondary">Всего (Gross):</Text></Col>
                                                                <Col span={12} style={{ textAlign: 'right' }}><Text strong>{fmt(summary.customerPrice)} ₸</Text></Col>
                                                                <Col span={12}><Text type="secondary">Без НДС (Net):</Text></Col>
                                                                <Col span={12} style={{ textAlign: 'right' }}><Text>{fmt(summary.revenueNet || 0)} ₸</Text></Col>
                                                                <Col span={12}><Text type="secondary">НДС ({order.vatRate || 0}%):</Text></Col>
                                                                <Col span={12} style={{ textAlign: 'right' }}><Text>{fmt(summary.revenueVat || 0)} ₸</Text></Col>
                                                                <Col span={12}><Text strong style={{ color: token.colorError }}>Оставшийся долг:</Text></Col>
                                                                <Col span={12} style={{ textAlign: 'right' }}><Text strong style={{ color: token.colorError }}>{fmt(summary.customerDebt || 0)} ₸</Text></Col>
                                                            </Row>
                                                        </div>
                                                    </Col>
                                                    <Col xs={24} md={12}>
                                                        <div style={{ padding: 12, borderRadius: 8, background: '#fff7e6', border: `1px solid ${token.colorWarningBorder}` }}>
                                                            <div style={{ fontWeight: 600, marginBottom: 8, color: token.colorWarning }}>Расчеты с Исполнителем</div>
                                                            <Row gutter={[8, 8]}>
                                                                <Col span={12}><Text type="secondary">Всего (Gross):</Text></Col>
                                                                <Col span={12} style={{ textAlign: 'right' }}><Text strong>{fmt(summary.executorCost)} ₸</Text></Col>
                                                                <Col span={12}><Text type="secondary">Без НДС (Net):</Text></Col>
                                                                <Col span={12} style={{ textAlign: 'right' }}><Text>{fmt(summary.executorCostNet || 0)} ₸</Text></Col>
                                                                <Col span={12}><Text type="secondary">НДС ({order.executorVatRate || 0}%):</Text></Col>
                                                                <Col span={12} style={{ textAlign: 'right' }}><Text>{fmt(summary.executorCostVat || 0)} ₸</Text></Col>
                                                                <Col span={12}><Text strong style={{ color: token.colorError }}>Оставшийся долг:</Text></Col>
                                                                <Col span={12} style={{ textAlign: 'right' }}><Text strong style={{ color: token.colorError }}>{fmt(executorDebt || 0)} ₸</Text></Col>
                                                            </Row>
                                                        </div>
                                                    </Col>
                                                </Row>
                                            </div>
                                        );
                                    })()}
                                </Card>

                                {/* Unified Payments Card */}
                                <Card
                                    size="small"
                                    title={<span style={{ fontWeight: 600 }}><WalletOutlined style={{ color: token.colorPrimary, marginRight: 6 }} />Платежи по заявке ({payments.length})</span>}
                                    extra={canEditFinance && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleAddPaymentClick}>Зарегистрировать платеж</Button>}
                                    bordered={false}
                                    className="premium-card"
                                    style={{ marginBottom: 20 }}
                                >
                                    <Table columns={paymentColumns} dataSource={payments} rowKey="id" size="small" pagination={false} locale={{ emptyText: 'Нет зарегистрированных платежей' }} scroll={{ x: true }} />
                                </Card>

                                <Row gutter={[24, 24]}>
                                    <Col xs={24} lg={12}>
                                        {/* Incomes Card */}
                                        <Card
                                            size="small"
                                            title={<span style={{ fontWeight: 600 }}><WalletOutlined style={{ color: '#389e0d', marginRight: 6 }} />Поступления ({incomes.length})</span>}
                                            extra={canEditFinance && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { incomeForm.resetFields(); incomeForm.setFieldsValue({ date: dayjs() }); setIncomeModalOpen(true); }}>Добавить</Button>}
                                            bordered={false}
                                            className="premium-card"
                                        >
                                            <Table columns={incomeColumns} dataSource={incomes} rowKey="id" size="small" pagination={false} locale={{ emptyText: 'Нет поступлений' }} scroll={{ x: true }} />
                                        </Card>
                                    </Col>
                                    <Col xs={24} lg={12}>
                                        {/* Expenses Card */}
                                        <Card
                                            size="small"
                                            title={<span style={{ fontWeight: 600 }}><DollarOutlined style={{ color: '#cf1322', marginRight: 6 }} />Расходы ({expenses.length})</span>}
                                            extra={canEditFinance && <Button size="small" type="primary" danger icon={<PlusOutlined />} onClick={() => { expenseForm.resetFields(); expenseForm.setFieldsValue({ date: dayjs() }); setExpenseModalOpen(true); }}>Добавить</Button>}
                                            bordered={false}
                                            className="premium-card"
                                        >
                                            <Table columns={expenseColumns} dataSource={expenses} rowKey="id" size="small" pagination={false} locale={{ emptyText: 'Нет расходов' }} scroll={{ x: true }} />
                                        </Card>
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
                                        <Button size="small" type="primary" icon={<UploadOutlined />} loading={uploadingDoc}>
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
                                История ({order.statusHistory?.length || 0})
                            </span>
                        ),
                        children: (
                            <Card
                                title={<span style={{ fontWeight: 600 }}><ClockCircleOutlined style={{ color: '#1677ff', marginRight: 8 }} />История изменения статусов</span>}
                                bordered={false}
                                className="premium-card"
                            >
                                {order.statusHistory && order.statusHistory.length > 0 ? (
                                    <Timeline
                                        style={{ marginTop: 16, paddingLeft: 8 }}
                                        items={order.statusHistory.map((h: any) => ({
                                            color: h.status === 'COMPLETED' ? 'green' : h.status === 'PROBLEM' ? 'red' : 'blue',
                                            children: (
                                                <div style={{ marginBottom: 12 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        <Tag color={statusColors[h.status]} style={{ margin: 0 }}>
                                                            {statusLabels[h.status] || h.status}
                                                        </Tag>
                                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                                            {dayjs(h.changedAt).format('DD.MM.YYYY HH:mm:ss')}
                                                        </Text>
                                                    </div>
                                                    {h.comment && (
                                                        <div style={{ fontSize: 13, color: 'var(--lc-text-sec)', marginTop: 4, background: 'var(--lc-hover)', padding: '6px 12px', borderRadius: 4, display: 'inline-block' }}>
                                                            {h.comment}
                                                        </div>
                                                    )}
                                                </div>
                                            ),
                                        }))}
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                        <Text type="secondary">История статусов пуста</Text>
                                    </div>
                                )}
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
            <Modal title="Изменить статус" open={statusModalOpen} onCancel={() => { setStatusModalOpen(false); setSelectedStatusInModal(null); }} onOk={() => statusForm.submit()} okText="Обновить" cancelText="Отмена" confirmLoading={statusLoading}>
                <Form form={statusForm} layout="vertical" onFinish={handleStatusChange}>
                    <div style={{ marginBottom: 16 }}>Текущий: <Tag color={statusColors[order.status]}>{statusLabels[order.status]}</Tag></div>
                    <Form.Item name="status" label="Новый статус" rules={[{ required: true }]}>
                        <Select placeholder="Статус" size="large" onChange={(val: string) => setSelectedStatusInModal(val)}>
                            {getNextStatuses(order.status).map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
                        </Select>
                    </Form.Item>
                    {selectedStatusInModal === 'COMPLETED' && (() => {
                        const participantIds = [order.customerCompanyId, order.forwarderId, order.partnerId, order.subForwarderId].filter(Boolean);
                        const uniqueIds = Array.from(new Set(participantIds));
                        const hasOtherRegistered = uniqueIds.some((id: string) => {
                            if (id === user?.companyId) return false;
                            const c = [order.customerCompany, order.forwarder, order.subForwarder, order.partner].find((comp: any) => comp?.id === id);
                            return c && c.isExternal === false;
                        });
                        return hasOtherRegistered ? (
                            <Alert
                                type="info"
                                showIcon
                                style={{ marginBottom: 16 }}
                                message="Будет отправлен запрос на подтверждение завершения второй стороне"
                                description="Статус не изменится сразу — потребуется подтверждение от другого зарегистрированного участника."
                            />
                        ) : null;
                    })()}
                    <Form.Item name="comment" label="Комментарий">
                        <TextArea rows={3} placeholder="Причина..." />
                    </Form.Item>
                </Form>
            </Modal>

            {/* =================== REJECT COMPLETION MODAL =================== */}
            <Modal
                title="Отклонить завершение рейса"
                open={rejectReasonModalOpen}
                onCancel={() => { setRejectReasonModalOpen(false); setRejectReason(''); }}
                onOk={handleRejectCompletion}
                okText="Отклонить"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                confirmLoading={completionActionLoading}
            >
                <div style={{ marginBottom: 12 }}>
                    <Text>Укажите причину отклонения (необязательно):</Text>
                </div>
                <TextArea
                    rows={3}
                    placeholder="Причина отклонения..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                />
            </Modal>



            {/* =================== SHARE POA MODAL =================== */}
            <Modal
                title="Передать заявку другому менеджеру"
                open={transferModalOpen}
                onCancel={() => { setTransferModalOpen(false); setTransferUserId(undefined); }}
                onOk={handleTransferResponsible}
                okText="Передать"
                cancelText="Отмена"
                confirmLoading={transferLoading}
                okButtonProps={{ disabled: !transferUserId }}
                width={420}
            >
                <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--lc-text-ter)' }}>
                    Заявка перейдёт в «Мои заявки» выбранного менеджера. Смена ответственного записывается в журнал действий.
                </div>
                <Select
                    style={{ width: '100%' }}
                    placeholder="Выберите менеджера"
                    showSearch
                    optionFilterProp="label"
                    value={transferUserId}
                    onChange={setTransferUserId}
                    options={transferUsers
                        .filter((u: any) => !['DRIVER', 'RECIPIENT'].includes(u.role))
                        .map((u: any) => ({ value: u.id, label: `${u.lastName} ${u.firstName}${u.position ? ` — ${u.position}` : ''}` }))}
                />
            </Modal>

            <Modal title="Отправить доверенность по email" open={sharePoAModalOpen} onCancel={() => setSharePoAModalOpen(false)} onOk={handleSharePoA} okText="Отправить" cancelText="Отмена" confirmLoading={sharePoALoading} width={480}>
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">Выберите получателей для отправки доверенности (PDF):</Text>
                </div>
                {shareEmailsList.length > 0 ? (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid var(--lc-border)', borderRadius: 8, padding: 12 }}>
                        {shareEmailsList.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                <Checkbox
                                    checked={item.checked}
                                    onChange={(e) => { const newList = [...shareEmailsList]; newList[idx].checked = e.target.checked; setShareEmailsList(newList); }}
                                >
                                    <Text style={{ fontSize: 13 }}>{item.label}</Text>
                                    <div style={{ fontSize: 11, color: 'var(--lc-text-ter)', paddingLeft: 24 }}>{item.email}</div>
                                </Checkbox>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 24, background: 'var(--lc-card-2)', borderRadius: 8, marginBottom: 16 }}>
                        <Text type="secondary">Нет email-адресов.</Text>
                    </div>
                )}
                <div style={{ borderTop: '1px solid var(--lc-border)', paddingTop: 16 }}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Добавить получателя вручную:</Text>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input placeholder="example@mail.com" value={customEmailInput} onChange={(e) => setCustomEmailInput(e.target.value)} onPressEnter={handleAddCustomEmail} />
                        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddCustomEmail}>Добавить</Button>
                    </div>
                </div>
            </Modal>

            {/* =================== INCOME MODAL =================== */}
            <Modal title="Добавить поступление" open={incomeModalOpen} onCancel={() => setIncomeModalOpen(false)} onOk={() => incomeForm.submit()} okText="Добавить" cancelText="Отмена" confirmLoading={incomeLoading}>
                <Form form={incomeForm} layout="vertical" onFinish={handleAddIncome}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}><Select options={incomeCategories} /></Form.Item>
                    <Form.Item name="description" label="Описание" rules={[{ required: true }]}><Input placeholder="Описание" /></Form.Item>
                    <Form.Item name="amount" label="Сумма ₸" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
                    <Form.Item name="note" label="Примечание"><TextArea rows={2} /></Form.Item>
                </Form>
            </Modal>

            {/* =================== EXPENSE MODAL =================== */}
            <Modal title="Добавить расход" open={expenseModalOpen} onCancel={() => setExpenseModalOpen(false)} onOk={() => expenseForm.submit()} okText="Добавить" cancelText="Отмена" confirmLoading={expenseLoading}>
                <Form form={expenseForm} layout="vertical" onFinish={handleAddExpense}>
                    <Form.Item name="date" label="Дата" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" /></Form.Item>
                    <Form.Item name="category" label="Категория" rules={[{ required: true }]}><Select options={expenseCategories} /></Form.Item>
                    <Form.Item name="description" label="Описание" rules={[{ required: true }]}><Input placeholder="Описание" /></Form.Item>
                    <Form.Item name="amount" label="Сумма ₸" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
                    <Form.Item name="note" label="Примечание"><TextArea rows={2} /></Form.Item>
                </Form>
            </Modal>

            {/* =================== UNIFIED PAYMENT MODAL =================== */}
            <Modal
                title={editingPayment ? "Редактировать платеж" : "Зарегистрировать платеж"}
                open={paymentModalOpen}
                onCancel={() => setPaymentModalOpen(false)}
                onOk={() => paymentForm.submit()}
                okText={editingPayment ? "Сохранить" : "Добавить"}
                cancelText="Отмена"
                confirmLoading={paymentLoading}
                destroyOnClose
            >
                <Form form={paymentForm} layout="vertical" onFinish={handleSavePayment}>
                    <Form.Item name="direction" label="Направление платежа" rules={[{ required: true }]}>
                        <Select disabled={!!editingPayment}>
                            <Select.Option value="IN">Поступление (IN)</Select.Option>
                            <Select.Option value="OUT">Расход (OUT)</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item name="amount" label="Сумма (₸)" rules={[{ required: true, message: 'Укажите сумму' }]}>
                        <InputNumber min={0.01} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>

                    <Form.Item name="date" label="Дата платежа" rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>

                    <Form.Item name="method" label="Способ оплаты" rules={[{ required: true }]}>
                        <Select>
                            <Select.Option value="BANK">Безналичный (Банк)</Select.Option>
                            <Select.Option value="CASH">Наличные</Select.Option>
                            <Select.Option value="CARD">Карта</Select.Option>
                            <Select.Option value="OTHER">Другой способ</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item name="accountId" label="Счет / Касса">
                        <Select placeholder="По умолчанию" allowClear>
                            {accounts.map(acc => (
                                <Select.Option key={acc.id} value={acc.id}>
                                    {acc.name} ({acc.kind === 'CASH' ? 'Касса' : 'Банк'})
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item noStyle dependencies={['direction']}>
                        {({ getFieldValue }) => {
                            const dir = getFieldValue('direction') || 'IN';
                            const filteredCats = categories.filter(c => c.direction === dir && c.isActive);
                            return (
                                <Form.Item name="categoryId" label="Статья расходов/доходов">
                                    <Select placeholder="По умолчанию" allowClear>
                                        {filteredCats.map(cat => (
                                            <Select.Option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>

                    <Form.Item name="counterpartyId" label="Контрагент">
                        <Select placeholder="Выберите контрагента" allowClear>
                            {partners.map(p => (
                                <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="note" label="Примечание">
                        <TextArea rows={2} placeholder="Примечание или детали платежа" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* =================== QUICK PARTNER MODAL =================== */}
            <Modal title="Новый контрагент" open={quickPartnerModalOpen} onCancel={() => { setQuickPartnerModalOpen(false); quickPartnerForm.resetFields(); }} onOk={() => quickPartnerForm.submit()} confirmLoading={quickPartnerLoading} okText="Создать" cancelText="Отмена">
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
                                    message.success('Реквизиты подтянуты');
                                }
                            } catch { }
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
