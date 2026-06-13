'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Typography, Tag, Button, Descriptions, Card, Row, Col, Statistic, Table,
    Modal, Form, Input, InputNumber, Select, DatePicker, message, Timeline,
    Space, Spin, Divider, Popconfirm, Upload, Tabs, Checkbox, Radio, Tooltip
} from 'antd';
import {
    ArrowLeftOutlined, PlusOutlined, EnvironmentOutlined, FlagOutlined,
    DollarOutlined, WalletOutlined, CheckCircleOutlined, ClockCircleOutlined,
    EditOutlined, DeleteOutlined, FilePdfOutlined, UploadOutlined,
    UserAddOutlined, MailOutlined, FileTextOutlined, SwapOutlined,
    CloseCircleOutlined, CarOutlined, InboxOutlined, TeamOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/auth';

const { Title, Text } = Typography;
const { TextArea } = Input;

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

export default function OrderDetailPage() {
    const { user } = useAuthStore();
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [documents, setDocuments] = useState<any[]>([]);
    const [uploadingDoc, setUploadingDoc] = useState(false);

    // Reference data
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
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
    const [assignType, setAssignType] = useState<'driver' | 'partner' | 'partner_manual'>('driver');
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

    // Status modal
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusForm] = Form.useForm();
    const [statusLoading, setStatusLoading] = useState(false);

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
        return { text: 'Укажите стороны сделки', color: '#999' };
    };

    const roleInfo = getRoleDescription();

    // Share PoA modal
    const [sharePoAModalOpen, setSharePoAModalOpen] = useState(false);
    const [sharePoALoading, setSharePoALoading] = useState(false);
    const [shareEmailsList, setShareEmailsList] = useState<{ email: string; checked: boolean; label: string }[]>([]);
    const [customEmailInput, setCustomEmailInput] = useState('');

    // Quick partner modal
    const [quickPartnerModalOpen, setQuickPartnerModalOpen] = useState(false);
    const [quickPartnerForm] = Form.useForm();
    const [quickPartnerLoading, setQuickPartnerLoading] = useState(false);

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

    const fetchDrivers = async () => {
        setDriversLoading(true);
        try {
            const response = await api.get('/company/drivers');
            setDrivers(response.data);
        } catch { } finally { setDriversLoading(false); }
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
                .map((e: any) => ({ id: e.id, name: e.name }));
            const ownCompany = profileRes.data ? [{ id: profileRes.data.id, name: `${profileRes.data.name} (Моя компания)` }] : [];
            const combined = [...ownCompany, ...partnersList, ...externalList];
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
        const order = data?.order;
        if (!order) return;
        setSelectedDriverId(order.driverId || null);
        assignForm.resetFields();
        const initialAssignType = order.assignedDriverName ? 'partner_manual' : 'driver';
        setAssignType(initialAssignType as any);
        assignForm.setFieldsValue({
            driverId: order.driverId || undefined,
            driverPhone: order.driver?.phone || undefined,
            driverPlate: order.driver?.vehiclePlate || undefined,
            trailerNumber: order.trailerNumber || undefined,
            partnerId: order.partnerId || order.forwarderId || order.subForwarderId || undefined,
            assignedDriverName: order.assignedDriverName || undefined,
            assignedDriverPhone: order.assignedDriverPhone || undefined,
            assignedDriverPlate: order.assignedDriverPlate || undefined,
            assignedDriverTrailer: order.assignedDriverTrailer || undefined,
        });
        fetchDrivers();
        setAssignModalOpen(true);
    };

    const handleDriverSelect = (driverId: string) => {
        setSelectedDriverId(driverId);
        const driver = drivers.find(d => d.id === driverId);
        if (driver) {
            assignForm.setFieldsValue({
                driverName: `${driver.lastName} ${driver.firstName} ${driver.middleName || ''}`.trim(),
                driverPhone: driver.phone,
                driverPlate: driver.vehiclePlate || '',
                trailerNumber: driver.trailerNumber || '',
            });
        }
    };

    const handleAssign = async (values: any) => {
        setAssignLoading(true);
        try {
            if (assignType === 'driver') {
                await api.put(`/company/orders/${orderId}/assign-driver`, { driverId: selectedDriverId || values.driverId });
                message.success('Водитель назначен');
            } else if (assignType === 'partner_manual') {
                await api.put(`/company/orders/${orderId}/assign-driver`, {
                    partnerId: values.partnerId,
                    assignedDriverName: values.assignedDriverName,
                    assignedDriverPhone: values.assignedDriverPhone,
                    assignedDriverPlate: values.assignedDriverPlate,
                    assignedDriverTrailer: values.assignedDriverTrailer,
                });
                message.success('Водитель контрагента назначен');
            } else {
                await api.put(`/company/orders/${orderId}/assign-forwarder`, { partnerId: values.partnerId, price: values.price });
                message.success('Заявка передана партнеру');
            }
            setAssignModalOpen(false);
            assignForm.resetFields();
            setSelectedDriverId(null);
            fetchData();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка назначения');
        } finally { setAssignLoading(false); }
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
            if (order.forwarderId === user?.companyId) {
                initCarr = MY_COMPANY_VALUE;
            } else if (!order.forwarderId) {
                initCarr = MARKETPLACE_VALUE;
            } else {
                initCarr = order.forwarderId;
            }
        } else {
            initCust = order.customerCompanyId || '';
            if (order.forwarderId === user?.companyId) {
                initCarr = MY_COMPANY_VALUE;
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
            driverCost: order.driverCost,
            pickupDate: order.routePoints?.find((p: any) => p.pointType === 'PICKUP')?.expectedDate
                ? dayjs(order.routePoints.find((p: any) => p.pointType === 'PICKUP').expectedDate)
                : undefined,
            forwarderId: order.forwarderId || order.forwarder?.id || undefined,
            customerCompanyId: order.customerCompanyId || order.customerCompany?.id || undefined,
        });

        if (order.routePoints && order.routePoints.length > 0) {
            setRoutePointsState(order.routePoints.map((p: any) => ({
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
                const res = await api.post('/locations', { name: `${loc.city}, ${loc.address}`, address: `${loc.city}, ${loc.address}`, latitude: 0, longitude: 0, city: loc.city || '' });
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
                updateData.subForwarderId = user?.companyId;
                updateData.subForwarderPrice = finalDriverCost || null;
                if (!isMkt) {
                    updateData.forwarderId = selectedCarrier;
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
        addEmails(order.subForwarder?.email, `Суб-экспедитор (${order.subForwarder?.name})`);
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

    const { order, incomes, expenses, summary } = data;
    const fmt = (n: number) => n.toLocaleString('ru-RU');

    const hasDriver = !!(order.assignedDriverName || order.driverId || order.driver);
    const driverName = order.assignedDriverName || (order.driver ? `${order.driver.lastName} ${order.driver.firstName} ${order.driver.middleName || ''}`.trim() : null);
    const driverPhone = order.assignedDriverPhone || order.driver?.phone;
    const driverPlate = order.assignedDriverPlate || order.driver?.vehiclePlate;
    const driverTrailer = order.assignedDriverTrailer || order.driver?.trailerNumber;
    const canChangeStatus = getNextStatuses(order.status).length > 0;
    const isNotFinished = order.status !== 'CANCELLED' && order.status !== 'COMPLETED';

    const pickupPt = order.routePoints?.find((p: any) => p.pointType === 'PICKUP');

    const incomeColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{dayjs(d).format('DD.MM.YY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'cat', width: 140, render: (c: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{incomeCategories.find(x => x.value === c)?.label || c}</Text> },
        { title: 'Описание', dataIndex: 'description', key: 'desc', ellipsis: true, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{d}</Text> },
        { title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const, render: (a: number, r: any) => <Text delete={r.isDeleted} strong style={{ color: r.isDeleted ? '#bfbfbf' : '#389e0d' }}>{fmt(a)}</Text> },
        { title: '', key: 'actions', width: 50, render: (_: any, r: any) => (
            !r.isDeleted && <Popconfirm title="Удалить?" onConfirm={() => handleDeleteIncome(r.id)} okText="Да" cancelText="Нет"><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        )},
    ];

    const expenseColumns = [
        { title: 'Дата', dataIndex: 'date', key: 'date', width: 100, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{dayjs(d).format('DD.MM.YY')}</Text> },
        { title: 'Категория', dataIndex: 'category', key: 'cat', width: 140, render: (c: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{expenseCategories.find(x => x.value === c)?.label || c}</Text> },
        { title: 'Описание', dataIndex: 'description', key: 'desc', ellipsis: true, render: (d: string, r: any) => <Text delete={r.isDeleted} type={r.isDeleted ? "secondary" : undefined}>{d}</Text> },
        { title: 'Сумма ₸', dataIndex: 'amount', key: 'amount', width: 120, align: 'right' as const, render: (a: number, r: any) => <Text delete={r.isDeleted} strong style={{ color: r.isDeleted ? '#bfbfbf' : '#cf1322' }}>{fmt(a)}</Text> },
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
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {/* =================== HEADER =================== */}
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16, 
                marginBottom: 24,
                borderBottom: '1px solid #f0f0f0',
                paddingBottom: 16
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} />
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Title level={4} style={{ margin: 0 }}>
                                Заявка {order.orderNumber}
                            </Title>
                            <Tag color={statusColors[order.status]} style={{ fontSize: 13, padding: '2px 10px', borderRadius: 4, margin: 0 }}>
                                {statusLabels[order.status] || order.status}
                            </Tag>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Создана {dayjs(order.createdAt).format('DD.MM.YYYY в HH:mm')}
                        </Text>
                    </div>
                </div>

                {isEditing && (
                    <Tag color="blue" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, margin: 0 }}>Режим редактирования</Tag>
                )}
                {isNotFinished && !isEditing && (
                    <Space wrap size="small">
                        {canChangeStatus && (
                            <Button type="primary" icon={<SwapOutlined />} onClick={() => { statusForm.resetFields(); setStatusModalOpen(true); }}>
                                Изменить статус
                            </Button>
                        )}
                        <Button icon={<EditOutlined />} onClick={startEditing}>
                            Редактировать
                        </Button>
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
                    </Space>
                )}
            </div>

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
                                                        <Form.Item name="natureOfCargo" label="Характер груза" rules={[{ required: true, message: 'Выберите характер груза' }]}>
                                                            <Select placeholder="Выберите..." showSearch optionFilterProp="children" size="large">
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
                                                        optionFilterProp="children"
                                                    >
                                                        <Select.Option value={MY_COMPANY_VALUE}>
                                                            <span style={{ fontWeight: 600 }}>🏢 {myCompanyName || 'Моя компания'}</span>
                                                        </Select.Option>
                                                        <Select.OptGroup label="Контрагенты">
                                                            {partners.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                                                        </Select.OptGroup>
                                                    </Select>
                                                    <Button
                                                        type="link" size="small"
                                                        style={{ padding: 0, height: 'auto', fontSize: 12, marginTop: 4 }}
                                                        onClick={() => setQuickPartnerModalOpen(true)}
                                                    >
                                                        + Добавить нового контрагента
                                                    </Button>
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
                                                        optionFilterProp="children"
                                                    >
                                                        <Select.Option value={MY_COMPANY_VALUE}>
                                                            <span style={{ fontWeight: 600 }}>🏢 {myCompanyName || 'Моя компания'}</span>
                                                        </Select.Option>
                                                        <Select.Option value={MARKETPLACE_VALUE}>
                                                            <span style={{ color: '#722ed1', fontWeight: 500 }}>📢 Опубликовать на бирже</span>
                                                        </Select.Option>
                                                        <Select.OptGroup label="Контрагенты">
                                                            {partners.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                                                        </Select.OptGroup>
                                                    </Select>
                                                    <Button
                                                        type="link" size="small"
                                                        style={{ padding: 0, height: 'auto', fontSize: 12, marginTop: 4 }}
                                                        onClick={() => setQuickPartnerModalOpen(true)}
                                                    >
                                                        + Добавить нового контрагента
                                                    </Button>
                                                </div>

                                                <Divider style={{ margin: '8px 0 16px' }}>Ставки</Divider>

                                                {showCustomerPriceField && (
                                                    <Form.Item name="customerPrice" label={customerPriceLabel}>
                                                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                                                    </Form.Item>
                                                )}

                                                {showDriverCostField && (
                                                    <Form.Item name="driverCost" label={driverCostLabel}>
                                                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                                                    </Form.Item>
                                                )}

                                                <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                                                    <Select style={{ width: '100%' }} size="large">
                                                        <Select.Option value="FIXED">За рейс</Select.Option>
                                                        <Select.Option value="PER_KM">За км</Select.Option>
                                                        <Select.Option value="PER_TON">За тонну</Select.Option>
                                                    </Select>
                                                </Form.Item>

                                                {/* Margin preview */}
                                                <Form.Item noStyle dependencies={['customerPrice', 'driverCost']}>
                                                    {({ getFieldValue }) => {
                                                        const cp = getFieldValue('customerPrice');
                                                        const dc = getFieldValue('driverCost');
                                                        if (cp && dc && showCustomerPriceField && showDriverCostField) {
                                                            const margin = cp - dc;
                                                            return (
                                                                <div style={{
                                                                    padding: '8px 16px',
                                                                    background: margin >= 0 ? '#f6ffed' : '#fff2f0',
                                                                    border: `1px solid ${margin >= 0 ? '#b7eb8f' : '#ffa39e'}`,
                                                                    borderRadius: 8,
                                                                    fontSize: 13,
                                                                    fontWeight: 500,
                                                                    marginTop: 12,
                                                                }}>
                                                                    Маржа: <span style={{ color: margin >= 0 ? '#389e0d' : '#cf1322', fontWeight: 700 }}>
                                                                        {margin.toLocaleString('ru-RU')} ₸
                                                                    </span>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                </Form.Item>
                                            </Card>

                                            {/* Action buttons for saving the inline form */}
                                            <div style={{ marginTop: 20, background: '#fafafa', padding: 16, borderRadius: 8, border: '1px solid #f0f0f0', display: 'flex', gap: 12 }}>
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
                                                    <Text strong>{order.customerCompany?.name || '—'}</Text>
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
                                                    <Text strong>{order.forwarder?.name || order.partner?.name || '—'}</Text>
                                                </Descriptions.Item>
                                                {order.subForwarder && (
                                                    <Descriptions.Item label="Суб-экспедитор">
                                                        <Text strong>{order.subForwarder.name}</Text>
                                                    </Descriptions.Item>
                                                )}
                                                {order.responsibleManager && (
                                                    <Descriptions.Item label="Менеджер">
                                                        {order.responsibleManager.firstName} {order.responsibleManager.lastName}
                                                    </Descriptions.Item>
                                                )}
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
                                            );
                                        }
                                        return (
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
                                        );
                                    })()}
                                </Card>

                                <Row gutter={[24, 24]}>
                                    <Col xs={24} lg={12}>
                                        {/* Incomes Card */}
                                        <Card
                                            size="small"
                                            title={<span style={{ fontWeight: 600 }}><WalletOutlined style={{ color: '#389e0d', marginRight: 6 }} />Поступления ({incomes.length})</span>}
                                            extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { incomeForm.resetFields(); incomeForm.setFieldsValue({ date: dayjs() }); setIncomeModalOpen(true); }}>Добавить</Button>}
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
                                            extra={<Button size="small" type="primary" danger icon={<PlusOutlined />} onClick={() => { expenseForm.resetFields(); expenseForm.setFieldsValue({ date: dayjs() }); setExpenseModalOpen(true); }}>Добавить</Button>}
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
                                                        <div style={{ fontSize: 13, color: '#555', marginTop: 4, background: '#f5f5f5', padding: '6px 12px', borderRadius: 4, display: 'inline-block' }}>
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
            <Modal title="Назначить водителя" open={assignModalOpen} onCancel={() => { setAssignModalOpen(false); setSelectedDriverId(null); assignForm.resetFields(); }} onOk={() => assignForm.submit()} okText="Назначить" cancelText="Отмена" confirmLoading={assignLoading}>
                <Form form={assignForm} layout="vertical" onFinish={handleAssign}>
                    <Tabs activeKey={assignType} onChange={(k) => setAssignType(k as any)} items={[
                        {
                            key: 'driver',
                            label: 'Собственный транспорт',
                            children: (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ marginBottom: 16, padding: '8px 12px', background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 6, fontSize: 12 }}>
                                        💡 Назначьте водителя и транспортное средство из штата вашей собственной компании.
                                    </div>
                                    <Form.Item name="driverId" label="Водитель" rules={[{ required: assignType === 'driver', message: 'Выберите водителя' }]}>
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
                                </div>
                            )
                        },
                        {
                            key: 'partner_manual',
                            label: 'Привлечённый (вне платформы)',
                            children: (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 6, fontSize: 12 }}>
                                        💡 Используйте этот вариант, если вы наняли стороннюю компанию/водителя вне платформы Logicore и хотите вручную вписать их данные.
                                    </div>
                                    <Form.Item
                                        name="partnerId"
                                        label="Компания-перевозчик (контрагент)"
                                        rules={[{ required: assignType === 'partner_manual', message: 'Выберите компанию' }]}
                                        help={
                                            <Button
                                                type="link"
                                                size="small"
                                                style={{ padding: 0, height: 'auto', fontSize: 12, marginTop: 2 }}
                                                onClick={() => setQuickPartnerModalOpen(true)}
                                            >
                                                + Добавить нового контрагента
                                            </Button>
                                        }
                                    >
                                        <Select placeholder="Выберите контрагента" size="large" loading={partnersLoading} options={partners.map(p => ({ label: p.name, value: p.id }))} showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} />
                                    </Form.Item>
                                    <Form.Item name="assignedDriverName" label="ФИО водителя" rules={[{ required: assignType === 'partner_manual', message: 'Введите ФИО' }]}>
                                        <Input placeholder="Иванов Иван Иванович" size="large" />
                                    </Form.Item>
                                    <Form.Item name="assignedDriverPhone" label="Телефон водителя"><Input placeholder="+7 (700) 123-45-67" size="large" /></Form.Item>
                                    <Form.Item name="assignedDriverPlate" label="Госномер авто"><Input placeholder="123 ABC 01" size="large" /></Form.Item>
                                    <Form.Item name="assignedDriverTrailer" label="Госномер прицепа"><Input placeholder="1234 XX 01" size="large" /></Form.Item>
                                </div>
                            )
                        },
                        {
                            key: 'partner',
                            label: 'Субподряд на платформе',
                            children: (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 6, fontSize: 12 }}>
                                        💡 Передайте выполнение заказа компании-партнеру на платформе Logicore. Они получат заявку и сами назначат водителя.
                                    </div>
                                    <Form.Item
                                        name="partnerId"
                                        label="Компания-партнер"
                                        rules={[{ required: assignType === 'partner', message: 'Выберите компанию' }]}
                                        help={
                                            <Button
                                                type="link"
                                                size="small"
                                                style={{ padding: 0, height: 'auto', fontSize: 12, marginTop: 2 }}
                                                onClick={() => setQuickPartnerModalOpen(true)}
                                            >
                                                + Добавить нового контрагента
                                            </Button>
                                        }
                                    >
                                        <Select placeholder="Компания-партнер" size="large" loading={partnersLoading} options={partners.map(p => ({ label: p.name, value: p.id }))} showSearch filterOption={(i, o) => (o?.label ?? '').toLowerCase().includes(i.toLowerCase())} />
                                    </Form.Item>
                                    <Form.Item name="price" label="Стоимость для партнера (₸)" rules={[{ required: assignType === 'partner', message: 'Укажите стоимость' }]}>
                                        <InputNumber style={{ width: '100%' }} size="large" formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} parser={v => v!.replace(/\s/g, '')} />
                                    </Form.Item>
                                </div>
                            )
                        }
                    ]} />
                </Form>
            </Modal>

            {/* =================== STATUS MODAL =================== */}
            <Modal title="Изменить статус" open={statusModalOpen} onCancel={() => setStatusModalOpen(false)} onOk={() => statusForm.submit()} okText="Обновить" cancelText="Отмена" confirmLoading={statusLoading}>
                <Form form={statusForm} layout="vertical" onFinish={handleStatusChange}>
                    <div style={{ marginBottom: 16 }}>Текущий: <Tag color={statusColors[order.status]}>{statusLabels[order.status]}</Tag></div>
                    <Form.Item name="status" label="Новый статус" rules={[{ required: true }]}>
                        <Select placeholder="Статус" size="large">
                            {getNextStatuses(order.status).map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="comment" label="Комментарий">
                        <TextArea rows={3} placeholder="Причина..." />
                    </Form.Item>
                </Form>
            </Modal>



            {/* =================== SHARE POA MODAL =================== */}
            <Modal title="Отправить доверенность по email" open={sharePoAModalOpen} onCancel={() => setSharePoAModalOpen(false)} onOk={handleSharePoA} okText="Отправить" cancelText="Отмена" confirmLoading={sharePoALoading} width={480}>
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">Выберите получателей для отправки доверенности (PDF):</Text>
                </div>
                {shareEmailsList.length > 0 ? (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                        {shareEmailsList.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                                <Checkbox
                                    checked={item.checked}
                                    onChange={(e) => { const newList = [...shareEmailsList]; newList[idx].checked = e.target.checked; setShareEmailsList(newList); }}
                                >
                                    <Text style={{ fontSize: 13 }}>{item.label}</Text>
                                    <div style={{ fontSize: 11, color: '#999', paddingLeft: 24 }}>{item.email}</div>
                                </Checkbox>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: 24, background: '#fafafa', borderRadius: 8, marginBottom: 16 }}>
                        <Text type="secondary">Нет email-адресов.</Text>
                    </div>
                )}
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
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
