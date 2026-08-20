'use client';
// Trigger redeployment
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { Typography, Form, Input, InputNumber, Select, DatePicker, Row, Col, Card, Modal, Steps, Divider, theme, Tag, AutoComplete, Checkbox } from 'antd';
import {
    EnvironmentOutlined, FlagOutlined,
    DeleteOutlined, SendOutlined, CheckCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { Button } from '@/components/ui/button';
import { api, Location } from '@/lib/api';
import { reportLoadFailure } from '@/lib/load';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import QuickCreateLocationModal from '@/components/ui/QuickCreateLocationModal';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Partner {
    id: string;
    name: string;
    isExternal?: boolean;
    isCustomer?: boolean;
    isCarrier?: boolean;
    /** Условия расчётов из карточки: их заполнил бухгалтер. */
    vatPayer?: boolean | null;
    vatRate?: number | null;
    customerPaymentDays?: number | null;
    customerPaymentFrom?: string | null;
    carrierPaymentDays?: number | null;
    carrierPaymentFrom?: string | null;
}

import { RoutePointEmails, parseEmails } from '@/components/orders/RoutePointEmails';
import { CargoComposition } from '@/components/orders/CargoComposition';
import { AddressPicker } from '@/components/orders/AddressPicker';
import { cn } from '@/lib/utils';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';
import { EMPTY_CARGO, totalPallets, type CargoState } from '@/lib/cargo';
import { toast } from 'sonner';
import nova from '@/components/nova/nova.module.css';
import { paymentTermsLabel, vatLabel } from '@/lib/settlement-terms';
import { lookupCompanyByBin, companyFieldsFromLookup } from '@/lib/company-lookup';
import CurrencySelect from '@/components/orders/CurrencySelect';

interface LocationState {
    city: string;
    address: string;
    id?: string;
    latitude?: number;
    longitude?: number;
    /** Почта, закреплённая за адресом: куда слать доверенность. */
    emails?: string[];
}

/** Типы точек маршрута: их всего три, показываем пилюлями. */
const POINT_TYPES = [
    { key: 'PICKUP', label: 'Погрузка' },
    { key: 'ADDITIONAL_PICKUP', label: 'Доп. погрузка' },
    { key: 'DELIVERY', label: 'Выгрузка' },
];

const MARKETPLACE_VALUE = '__MARKETPLACE__';
const MY_COMPANY_VALUE = '__MY_COMPANY__';

export default function CreateOrderPage() {
    const { token } = theme.useToken();
    const { user } = useAuthStore();
    const router = useRouter();
    const [form] = Form.useForm();
    const [quickPartnerForm] = Form.useForm();

    // Wizard step
    const [currentStep, setCurrentStep] = useState(0);

    // Data
    const [locations, setLocations] = useState<Location[]>([]);
    const [fetchedPartners, setFetchedPartners] = useState<Partner[]>([]);
    /**
     * Стороны загруженной заявки — отдельно от справочника.
     *
     * В списке выбора только партнёрства платформы и справочник
     * контрагентов. Компания, с которой рейс уже сделан, может не оказаться
     * ни там, ни там — например, приглашение на платформе так и не приняли.
     * Тогда её id не находился в списке, поле оставалось пустым, а форма
     * отвечала «Укажите заказчика» по заявке, где он есть.
     *
     * Список именно вычисляемый, а не досбор в состоянии: справочник
     * догружается сам по себе и раньше затирал дособранное, а правка
     * успевала спросить про заказчика по неполному списку и решить, что
     * его нет.
     */
    const [orderParties, setOrderParties] = useState<Partner[]>([]);
    const partners = useMemo<Partner[]>(() => {
        if (!orderParties.length) return fetchedPartners;
        const known = new Set(fetchedPartners.map((p) => p.id));
        const add = orderParties.filter((p) => !known.has(p.id));
        return add.length ? [...fetchedPartners, ...add] : fetchedPartners;
    }, [fetchedPartners, orderParties]);
    const [cargoCategories, setCargoCategories] = useState<any[]>([]);
    const [profileComplete, setProfileComplete] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [myCompanyName, setMyCompanyName] = useState('');
    const [myCompanies, setMyCompanies] = useState<any[]>([]);
    const [selectedMyCompanyId, setSelectedMyCompanyId] = useState<string>('');

    // Driver & vehicle selection
    const [drivers, setDrivers] = useState<any[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [selectedDriverId, setSelectedDriverId] = useState<string>('');
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [vehiclesLoading, setVehiclesLoading] = useState(false);

    // Parties
    const [selectedCustomer, setSelectedCustomer] = useState<string>('');
    const [selectedCarrier, setSelectedCarrier] = useState<string>('');

    // Ответственный менеджер от нашей компании: SELF — я, NONE — не назначать, иначе userId
    const [responsibleChoice, setResponsibleChoice] = useState<string>('SELF');
    const [officeUsers, setOfficeUsers] = useState<{ id: string; firstName: string; lastName: string; role: string }[]>([]);
    const [quickPartnerTarget, setQuickPartnerTarget] = useState<'CUSTOMER' | 'CARRIER' | null>(null);
    // Справочники условий и форм оплаты (для заявки)

    const isOwnOrExternalCarrier = selectedCarrier === MY_COMPANY_VALUE || 
        (selectedCarrier && partners.find(p => p.id === selectedCarrier)?.isExternal === true);

    const isCarrierOnPlatform = selectedCarrier && selectedCarrier !== MY_COMPANY_VALUE && selectedCarrier !== MARKETPLACE_VALUE && !partners.find(p => p.id === selectedCarrier)?.isExternal;

    useEffect(() => {
        const targetCompanyId = selectedCarrier === MY_COMPANY_VALUE 
            ? selectedMyCompanyId 
            : partners.find(p => p.id === selectedCarrier)?.isExternal 
                ? selectedCarrier 
                : null;

        if (targetCompanyId) {
            setDriversLoading(true);
            api.get('/company/drivers', { params: { companyId: targetCompanyId } })
                .then(res => setDrivers(res.data))
                .catch(() => toast.error('Ошибка загрузки водителей'))
                .finally(() => setDriversLoading(false));
        } else {
            setDrivers([]);
        }

        if (selectedCarrier === MY_COMPANY_VALUE) {
            setVehiclesLoading(true);
            api.get('/company/vehicles', { params: { companyId: selectedMyCompanyId } })
                .then(res => setVehicles(res.data))
                .catch(() => toast.error('Ошибка загрузки автопарка'))
                .finally(() => setVehiclesLoading(false));
        } else {
            setVehicles([]);
        }
    }, [selectedCarrier, partners, user, selectedMyCompanyId]);

    const handleDriverSelect = (value: string) => {
        setSelectedDriverId(value);
        if (value === '__NEW_DRIVER__') {
            form.setFieldsValue({
                firstName: '', lastName: '', middleName: '', phone: '', iin: '',
                vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
                docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: ''
            });
        } else {
            const d = drivers.find(drv => drv.id === value);
            if (d) {
                form.setFieldsValue({
                    firstName: d.firstName,
                    lastName: d.lastName,
                    middleName: d.middleName || '',
                    phone: d.phone,
                    iin: d.iin || '',
                    vehicleType: d.vehicleType || undefined,
                    vehicleModel: d.vehicleModel || '',
                    vehiclePlate: d.vehiclePlate || '',
                    trailerNumber: d.trailerNumber || '',
                    docType: d.docType || undefined,
                    docNumber: d.docNumber || '',
                    docIssuedAt: d.docIssuedAt ? dayjs(d.docIssuedAt) : null,
                    docExpiresAt: d.docExpiresAt ? dayjs(d.docExpiresAt) : null,
                    docIssuedBy: d.docIssuedBy || '',
                });
            }
        }
    };

    const handleVehicleSelect = (value: string) => {
        const v = vehicles.find(veh => veh.id === value);
        if (v) {
            form.setFieldsValue({
                vehicleType: v.type,
                vehicleModel: v.model,
                vehiclePlate: v.plate,
                trailerNumber: v.trailerNumber || '',
            });
        }
    };

    // Route points
    // Состав груза: паллеты списком, способ погрузки и упаковка.
    const [cargo, setCargo] = useState<CargoState>(EMPTY_CARGO);

    const [routePointsState, setRoutePointsState] = useState<Array<LocationState & { pointType: string }>>([
        { city: '', address: '', pointType: 'PICKUP' },
        { city: '', address: '', pointType: 'DELIVERY' }
    ]);



    const isMeCustomer = selectedCustomer === MY_COMPANY_VALUE;
    /** Как выбранный заказчик называет свой номер перевозки. Пусто — графы нет. */
    const customerRefLabel = isMeCustomer
        ? null
        : (partners.find(p => p.id === selectedCustomer) as any)?.customerRefLabel || null;
    const isMeCarrier = selectedCarrier === MY_COMPANY_VALUE;
    const isMarketplace = selectedCarrier === MARKETPLACE_VALUE;

    const showCustomerPriceField = !isMeCustomer || (isMeCustomer && isMeCarrier);
    const showDriverCostField = (isMeCustomer && !isMeCarrier) || (!isMeCustomer && !isMeCarrier);

    // Знак валюты из подписи убран: валюта теперь выбирается рядом с суммой
    // и может быть не тенге.
    const customerPriceLabel = (isMeCustomer && isMeCarrier) ? "Ставка" : "Ставка от заказчика";
    const driverCostLabel = isMarketplace ? "Ставка для биржи" : "Ставка перевозчику";

    // Габариты груза (по галочке)
    const [showDims, setShowDims] = useState(false);

    // Tariff
    const [appliedTariff, setAppliedTariff] = useState<any>(null);

    // Quick partner modal
    const [quickPartnerModalOpen, setQuickPartnerModalOpen] = useState(false);
    const [quickPartnerLoading, setQuickPartnerLoading] = useState(false);

    // Quick create location modal
    const [quickLocationModalOpen, setQuickLocationModalOpen] = useState(false);
    const [activeRoutePointIndex, setActiveRoutePointIndex] = useState<number | null>(null);

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

            // Trigger tariff check
            const firstPickup = newPts.find(p => p.pointType === 'PICKUP');
            const lastDelivery = [...newPts].reverse().find(p => p.pointType === 'DELIVERY');
            if (firstPickup?.city && lastDelivery?.city) {
                lookupTariff(firstPickup.city, lastDelivery.city);
            }
        }
        setActiveRoutePointIndex(null);
    };

    useEffect(() => {
        api.get('/company/profile-status').then(res => {
            setProfileComplete(res.data.isComplete);
        }).catch(() => {});
        api.get('/company/my-companies').then(res => {
            const list = res.data || [];
            setMyCompanies(list);
            if (user?.companyId) {
                setSelectedMyCompanyId(user.companyId);
            } else if (list.length > 0) {
                setSelectedMyCompanyId(list[0].id);
            }
        }).catch(() => {});
        fetchLocations();
        fetchCargoTypes();
        fetchPartners();
        api.get('/company/managers')
            .then(res => setOfficeUsers(res.data || []))
            .catch(() => { });
    }, [user]);

    /**
     * Одна форма на заведение, дублирование и правку.
     *
     * `?from=<id>` — скопировать данные в новую заявку, `?edit=<id>` —
     * править существующую. Отдельного окна правки больше нет: оно было
     * второй формой той же заявки, с урезанным набором полей и вопросом
     * «Ваша роль в этой сделке», которого у существующего рейса быть не
     * может — роль там уже сыграна. Две формы неизбежно расходились, и
     * правка отставала от заведения.
     */
    const duplicateLoadedRef = useRef(false);
    const [pendingParties, setPendingParties] = useState<{ customer?: string; carrier?: string } | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingNumber, setEditingNumber] = useState<string>('');

    useEffect(() => {
        if (duplicateLoadedRef.current) return;
        const params = new URLSearchParams(window.location.search);
        const editId = params.get('edit');
        const fromId = editId || params.get('from');
        if (!fromId) return;
        duplicateLoadedRef.current = true;

        (async () => {
            try {
                const [orderRes, myRes] = await Promise.all([
                    api.get(`/orders/${fromId}`),
                    api.get('/company/my-companies'),
                ]);
                const o = orderRes.data;
                const myIds = new Set<string>((myRes.data || []).map((c: any) => c.id));

                if (o.cargoLength != null || o.cargoWidth != null || o.cargoHeight != null) {
                    setShowDims(true);
                }
                form.setFieldsValue({
                    natureOfCargo: o.natureOfCargo || undefined,
                    cargoDescription: o.cargoDescription || undefined,
                    cargoWeight: o.cargoWeight ?? undefined,
                    cargoVolume: o.cargoVolume ?? undefined,
                    cargoLength: o.cargoLength ?? undefined,
                    cargoWidth: o.cargoWidth ?? undefined,
                    cargoHeight: o.cargoHeight ?? undefined,
                    palletCount: o.palletCount ?? undefined,
                    cargoType: o.cargoType || undefined,
                    requirements: o.requirements || undefined,
                    customerPrice: o.customerPrice ?? undefined,
                    driverCost: (o.subForwarderPrice ?? o.driverCost) ?? undefined,
                    vatRate: o.vatRate ?? undefined,
                    hasVat: o.hasVat ?? undefined,
                    executorVatRate: o.executorVatRate ?? undefined,
                    executorHasVat: o.executorHasVat ?? undefined,
                });

                setCargo({
                    pallets: Array.isArray(o.pallets) ? o.pallets : [],
                    loadingTypes: o.loadingTypes || [],
                    packagingTypes: o.packagingTypes || [],
                });

                if (Array.isArray(o.routePoints) && o.routePoints.length > 0) {
                    setRoutePointsState(o.routePoints.map((rp: any) => ({
                        id: rp.locationId || rp.location?.id,
                        city: rp.location?.city || '',
                        address: rp.location?.address || '',
                        latitude: rp.location?.latitude,
                        longitude: rp.location?.longitude,
                        pointType: rp.pointType,
                        emails: parseEmails(rp.location?.emails),
                    })));
                }

                // Стороны сделки относительно моих организаций
                const customer = o.customerCompanyId
                    ? (myIds.has(o.customerCompanyId) ? MY_COMPANY_VALUE : o.customerCompanyId)
                    : undefined;
                let carrier: string | undefined;
                if (o.subForwarderId && !myIds.has(o.subForwarderId)) {
                    carrier = o.subForwarderId;
                } else if (o.forwarderId) {
                    carrier = myIds.has(o.forwarderId) ? MY_COMPANY_VALUE : o.forwarderId;
                }
                // Стороны самой заявки — в список выбора (см. `orderParties`).
                setOrderParties([o.customerCompany, o.subForwarder, o.partner, o.forwarder]
                    .filter((c: any) => c?.id && c?.name)
                    .map((c: any) => ({
                        id: c.id,
                        name: c.name,
                        isExternal: !!c.isExternal,
                        isCustomer: true,
                        isCarrier: true,
                    })) as Partner[]);

                setPendingParties({ customer, carrier });

                if (editId) {
                    setEditingId(editId);
                    setEditingNumber(o.orderNumber || '');
                    // При дублировании дату намеренно не переносят — рейс
                    // новый. При правке она часть заявки и должна стоять.
                    const pickup = (o.routePoints || []).find((rp: any) => rp.pointType === 'PICKUP');
                    if (pickup?.expectedDate) {
                        form.setFieldsValue({ pickupDate: dayjs(pickup.expectedDate) });
                    }
                    if (o.driverId) setSelectedDriverId(o.driverId);
                } else {
                    toast.success(`Скопированы данные заявки ${o.orderNumber}. Проверьте и укажите дату погрузки.`);
                }
            } catch {
                toast.error(editId
                    ? 'Не удалось загрузить заявку для правки'
                    : 'Не удалось загрузить заявку для дублирования');
            }
        })();
    }, []);

    // Стороны применяем после загрузки списка контрагентов (иначе в селекте показался бы «сырой» id)
    useEffect(() => {
        if (!pendingParties) return;
        const needsPartners = (v?: string) => !!v && v !== MY_COMPANY_VALUE;
        if ((needsPartners(pendingParties.customer) || needsPartners(pendingParties.carrier)) && partners.length === 0) return;
        const resolve = (v?: string) => (!v || v === MY_COMPANY_VALUE || partners.some(p => p.id === v)) ? v : undefined;
        const cust = resolve(pendingParties.customer);
        const carr = resolve(pendingParties.carrier);
        if (cust) setSelectedCustomer(cust);
        if (carr) setSelectedCarrier(carr);
        setPendingParties(null);
    }, [pendingParties, partners]);

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

    const fetchPartners = async () => {
        try {
            const [partnersRes, externalRes, profileRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
                api.get('/company/profile'),
            ]);
            // Зарегистрированные партнёры могут выступать и заказчиком, и перевозчиком
            const partnersList = partnersRes.data.map((p: any) => ({
                ...p,
                isExternal: false,
                isCustomer: p.isCustomer ?? true,
                isCarrier: p.isCarrier ?? true,
            }));
            // Офлайн-контрагенты — по своим ролям (заказчик/перевозчик), как заведены
            const externalList = externalRes.data.map((e: any) => ({
                id: e.id,
                name: e.name,
                isExternal: true,
                isCustomer: !!e.isCustomer,
                isCarrier: !!e.isCarrier,
                // Как заказчик называет свой номер перевозки. Без этого поля
                // графа в заявке не появлялась вовсе: список контрагентов
                // пересобирался по нескольким полям, и настройка терялась
                // по дороге.
                customerRefLabel: e.customerRefLabel ?? null,
                // Условия расчётов: по ним в мастере видно, с НДС контрагент
                // или без и когда он платит. Спрашивать это у логиста больше
                // не нужно — ответ уже есть в карточке.
                vatPayer: e.vatPayer ?? null,
                vatRate: e.vatRate ?? null,
                customerPaymentDays: e.customerPaymentDays ?? null,
                customerPaymentFrom: e.customerPaymentFrom ?? null,
                carrierPaymentDays: e.carrierPaymentDays ?? null,
                carrierPaymentFrom: e.carrierPaymentFrom ?? null,
            }));
            const combined = [...partnersList, ...externalList];
            setFetchedPartners(combined);
            if (profileRes.data?.name) {
                setMyCompanyName(profileRes.data.name);
            }
        } catch (e: any) { reportLoadFailure('список контрагентов', e); }
    };

    /**
     * Условия расчётов выбранных сторон — из их карточек.
     *
     * Своя компания карточкой не является: с самим собой не рассчитываются.
     */
    const termsOf = (id: string) => (
        !id || id === MY_COMPANY_VALUE || id === MARKETPLACE_VALUE
            ? null
            : partners.find((p) => p.id === id) ?? null
    );
    const customerTerms = termsOf(selectedCustomer);
    const carrierTerms = termsOf(selectedCarrier);

    // Location options grouped by company
    const getLocationOptions = () => {
        if (!locations || locations.length === 0) return [];
        const customerCompanyId = selectedCustomer === MY_COMPANY_VALUE ? selectedMyCompanyId : selectedCustomer;
        const carrierCompanyId = selectedCarrier === MY_COMPANY_VALUE ? selectedMyCompanyId : 
            (selectedCarrier === MARKETPLACE_VALUE || !selectedCarrier) ? undefined : selectedCarrier;

        const customerLocs = locations.filter(l => customerCompanyId && (l as any).companyId === customerCompanyId);
        const carrierLocs = locations.filter(l => carrierCompanyId && (l as any).companyId === carrierCompanyId);
        const categorizedIds = new Set([...customerLocs.map(l => l.id), ...carrierLocs.map(l => l.id)]);
        const otherLocs = locations.filter(l => !categorizedIds.has(l.id));

        const groups: Array<{ label: string; options: Location[] }> = [];

        if (customerLocs.length > 0) {
            const currentMyCompanyName = myCompanies.find(c => c.id === selectedMyCompanyId)?.name || myCompanyName;
            const name = selectedCustomer === MY_COMPANY_VALUE ? currentMyCompanyName : partners.find(p => p.id === selectedCustomer)?.name || 'Заказчик';
            groups.push({ label: `Склады заказчика [${name}]`, options: customerLocs });
        }
        if (carrierLocs.length > 0) {
            const name = selectedCarrier === MY_COMPANY_VALUE ? (myCompanies.find(c => c.id === selectedMyCompanyId)?.name?.trim() || myCompanyName) : partners.find(p => p.id === selectedCarrier)?.name || 'Перевозчик';
            groups.push({ label: `Склады перевозчика [${name}]`, options: carrierLocs });
        }
        if (otherLocs.length > 0) {
            groups.push({ label: 'Все остальные адреса', options: otherLocs });
        }
        return groups;
    };

    const lookupTariff = async (originCity: string, destCity: string) => {
        if (!originCity || !destCity) { setAppliedTariff(null); return; }
        try {
            const response = await api.get('/contracts/tariff-lookup', {
                params: { originCity, destinationCity: destCity }
            });
            if (response.data?.price) {
                setAppliedTariff(response.data);
                if (showCustomerPriceField) {
                    form.setFieldsValue({ customerPrice: response.data.price });
                } else {
                    form.setFieldsValue({ driverCost: response.data.price });
                }
                toast.success(`Тариф найден: ${response.data.price.toLocaleString('ru-RU')} ₸`);
            } else { setAppliedTariff(null); }
        } catch { setAppliedTariff(null); }
    };

    const handleCreateQuickPartner = async (values: any) => {
        setQuickPartnerLoading(true);
        try {
            const res = await api.post('/external-companies', {
                ...values,
                isCustomer: true,
                isCarrier: true,
                type: 'FORWARDER'
            });
            toast.success('Контрагент добавлен');
            setQuickPartnerModalOpen(false);
            quickPartnerForm.resetFields();
            await fetchPartners();
            if (quickPartnerTarget === 'CUSTOMER') {
                setSelectedCustomer(res.data.id);
            } else if (quickPartnerTarget === 'CARRIER') {
                setSelectedCarrier(res.data.id);
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка при создании контрагента');
        } finally {
            setQuickPartnerLoading(false);
            setQuickPartnerTarget(null);
        }
    };

    // Determine role description for the user
    const getRoleDescription = () => {

        if (isMeCustomer && isMeCarrier) return { text: 'Вы и заказчик, и перевозчик — перевозка своими силами', color: '#1890ff' };
        if (isMeCustomer && isMarketplace) return { text: 'Вы — заказчик. Заявка будет опубликована на бирже', color: '#722ed1' };
        if (isMeCustomer && selectedCarrier) return { text: 'Вы — заказчик. Перевозку выполняет контрагент', color: '#389e0d' };
        if (isMeCustomer && !selectedCarrier) return { text: 'Вы — заказчик. Выберите перевозчика', color: '#faad14' };
        if (isMeCarrier && selectedCustomer) return { text: 'Вы — перевозчик. Заказ от контрагента', color: '#389e0d' };
        if (!isMeCustomer && !isMeCarrier && selectedCustomer && selectedCarrier) return { text: 'Вы — посредник между заказчиком и перевозчиком', color: '#eb2f96' };
        if (selectedCustomer && !selectedCarrier) return { text: 'Выберите перевозчика', color: '#faad14' };
        return { text: 'Укажите стороны сделки', color: 'var(--lc-text-ter)' };
    };

    // Validate current step before proceeding
    const validateStep = async () => {
        if (currentStep === 0) { // Parties
            if (!selectedCustomer) {
                toast.error('Укажите заказчика');
                return false;
            }
            if (!selectedCarrier) {
                toast.error('Укажите перевозчика');
                return false;
            }
            if (isOwnOrExternalCarrier && selectedDriverId === '__NEW_DRIVER__') {
                try {
                    await form.validateFields(['lastName', 'firstName', 'phone', 'vehiclePlate']);
                    return true;
                } catch {
                    return false;
                }
            }
            return true;
        }
        if (currentStep === 1) { // Route
            // Validate route
            const pickupDate = form.getFieldValue('pickupDate');
            if (!pickupDate) {
                toast.error('Укажите дату погрузки');
                return false;
            }
            const hasPickup = routePointsState.some(p => p.pointType === 'PICKUP' && (p.id || p.city));
            const hasDelivery = routePointsState.some(p => p.pointType === 'DELIVERY' && (p.id || p.city));
            if (!hasPickup) { toast.error('Укажите точку погрузки'); return false; }
            if (!hasDelivery) { toast.error('Укажите точку выгрузки'); return false; }
            return true;
        }
        if (currentStep === 2) { // Cargo
            try {
                await form.validateFields(['natureOfCargo']);
                return true;
            } catch { return false; }
        }
        return true;
    };

    const goNext = async () => {
        const valid = await validateStep();
        if (valid) setCurrentStep(currentStep + 1);
    };

    const goBack = () => setCurrentStep(currentStep - 1);

    const handleSubmit = async () => {
        // Validate parties
        if (!selectedCustomer) { toast.error('Укажите заказчика'); return; }
        if (!selectedCarrier) { toast.error('Укажите перевозчика'); return; }

        setSubmitting(true);
        try {
            const values = await form.validateFields();
            const pickupDateStr = values.pickupDate 
                ? (dayjs.isDayjs(values.pickupDate) ? values.pickupDate.toISOString() : new Date(values.pickupDate).toISOString()) 
                : undefined;

            let finalDriverId: string | undefined = selectedDriverId || undefined;

            if (isOwnOrExternalCarrier) {
                const targetCompanyId = selectedCarrier === MY_COMPANY_VALUE 
                    ? selectedMyCompanyId 
                    : selectedCarrier;

                if (selectedDriverId === '__NEW_DRIVER__') {
                    const driverData = {
                        firstName: values.firstName,
                        lastName: values.lastName,
                        middleName: values.middleName,
                        phone: values.phone,
                        iin: values.iin,
                        vehicleType: values.vehicleType,
                        vehicleModel: values.vehicleModel,
                        vehiclePlate: values.vehiclePlate,
                        trailerNumber: values.trailerNumber,
                        docType: values.docType,
                        docNumber: values.docNumber,
                        docIssuedAt: values.docIssuedAt ? values.docIssuedAt.toISOString() : undefined,
                        docExpiresAt: values.docExpiresAt ? values.docExpiresAt.toISOString() : undefined,
                        docIssuedBy: values.docIssuedBy,
                    };

                    const res = await api.post('/company/drivers', {
                        ...driverData,
                        companyId: targetCompanyId,
                    });
                    finalDriverId = res.data.id;
                    if (res.data.alreadyExists) {
                        toast.info('Использован существующий водитель');
                    }
                } else if (selectedDriverId) {
                    // Update details for our own drivers
                    if (selectedCarrier === MY_COMPANY_VALUE) {
                        const driverData = {
                            firstName: values.firstName,
                            lastName: values.lastName,
                            middleName: values.middleName,
                            phone: values.phone,
                            iin: values.iin,
                            vehicleType: values.vehicleType,
                            vehicleModel: values.vehicleModel,
                            vehiclePlate: values.vehiclePlate,
                            trailerNumber: values.trailerNumber,
                            docType: values.docType,
                            docNumber: values.docNumber,
                            docIssuedAt: values.docIssuedAt ? values.docIssuedAt.toISOString() : undefined,
                            docExpiresAt: values.docExpiresAt ? values.docExpiresAt.toISOString() : undefined,
                            docIssuedBy: values.docIssuedBy,
                        };
                        try {
                            await api.put(`/company/drivers/${selectedDriverId}`, driverData);
                        } catch (err) {
                            // Non-critical update failure
                        }
                    }
                } else {
                    finalDriverId = undefined;
                }
            }

            const getLocId = async (loc: LocationState) => {
                if (loc.id) return loc.id;
                const res = await api.post('/locations', {
                    name: `${loc.city}, ${loc.address}`,
                    address: `${loc.city}, ${loc.address}`,
                    // Пусто, а не ноль: (0, 0) — это точка в океане у берегов
                    // Африки. Такой адрес выглядел бы найденным, в дозапись
                    // координат не попадал, а на карте тянул бы маршрут через
                    // половину мира.
                    latitude: loc.latitude ?? null,
                    longitude: loc.longitude ?? null,
                    city: loc.city || ''
                });
                return res.data.id;
            };

            const routePoints = [];
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
                setSubmitting(false);
                return;
            }

            // Build order payload based on selected parties
            const finalCustomerPrice = showCustomerPriceField ? values.customerPrice : values.driverCost;
            const finalDriverCost = showDriverCostField ? values.driverCost : null;

            const orderData: any = {
                customerRefNumber: customerRefLabel ? values.customerRefNumber || undefined : undefined,
                cargoDescription: values.cargoDescription,
                natureOfCargo: values.natureOfCargo,
                cargoWeight: values.cargoWeight,
                cargoVolume: values.cargoVolume,
                cargoLength: showDims ? values.cargoLength : undefined,
                cargoWidth: showDims ? values.cargoWidth : undefined,
                cargoHeight: showDims ? values.cargoHeight : undefined,
                // Итог по местам считаем из состава — на него смотрят
                // карточка рейса, кабинет водителя и печатные формы.
                palletCount: cargo.pallets.length ? totalPallets(cargo.pallets) : values.palletCount,
                pallets: cargo.pallets,
                loadingTypes: cargo.loadingTypes,
                packagingTypes: cargo.packagingTypes,
                placesCount: cargo.placesCount,
                stackable: cargo.stackable,
                tempMin: cargo.tempMin,
                tempMax: cargo.tempMax,
                adr: cargo.adr,
                adrClass: cargo.adrClass,
                cargoValue: cargo.cargoValue,
                cargoType: values.cargoType,
                requirements: values.requirements,
                customerPrice: finalCustomerPrice,
                // Валюты обеих ставок. Раньше поля в форме были, а в запрос
                // не попадали: логист выбирал доллары, а заявка сохранялась
                // тенговой — и расхождение всплывало только в отчётах.
                currency: values.currency || 'KZT',
                driverCostCurrency: values.driverCostCurrency || 'KZT',
                customerPriceType: values.customerPriceType || 'FIXED',
                routePoints,
                customerId: user?.id,
                responsibleUserId: responsibleChoice === 'SELF' ? undefined : responsibleChoice,
                appliedTariffId: appliedTariff?.id || undefined,
                // НДС и сроки оплаты в заявку кладёт сервер — из карточек
                // сторон, где их заполнил бухгалтер. Отправлять их отсюда
                // значило бы спрашивать у того, кто ведёт рейс, ответ, за
                // который он не отвечает.
                driverId: isOwnOrExternalCarrier ? finalDriverId : undefined,
            };

            if (isMeCustomer) {
                // I am the customer
                orderData.customerCompanyId = selectedMyCompanyId;
                if (isMarketplace) {
                    // On marketplace — no forwarder assigned
                    orderData.driverCost = finalDriverCost || null;
                } else if (isMeCarrier) {
                    // Self-delivery
                    orderData.forwarderId = selectedMyCompanyId;
                } else {
                    // External carrier
                    orderData.forwarderId = selectedCarrier;
                    orderData.driverCost = finalDriverCost || null;
                }
            } else if (isMeCarrier) {
                // I am the carrier, customer is external
                orderData.customerCompanyId = selectedCustomer;
                orderData.forwarderId = selectedMyCompanyId;
            } else {
                // I am a middleman — customer and carrier are both external
                orderData.customerCompanyId = selectedCustomer;
                if (isMarketplace) {
                    orderData.subForwarderId = selectedMyCompanyId;
                    orderData.subForwarderPrice = finalDriverCost || null;
                    // Ставка перевозчика ушла в поле суб-экспедитора — валюта
                    // из того же поля формы идёт следом.
                    orderData.subForwarderPriceCurrency = values.driverCostCurrency || 'KZT';
                } else {
                    orderData.forwarderId = selectedMyCompanyId;
                    orderData.subForwarderId = selectedCarrier;
                    orderData.subForwarderPrice = finalDriverCost || null;
                    orderData.subForwarderPriceCurrency = values.driverCostCurrency || 'KZT';
                }
            }

            if (editingId) {
                // Правка идёт тем же набором полей, что и заведение: одна
                // форма — один состав заявки.
                await api.put(`/orders/${editingId}`, orderData);
                toast.success('Заявка сохранена');
                router.push(`/company/orders/${editingId}`);
            } else {
                await api.post('/orders', orderData);
                toast.success('Заявка создана!');
                router.push('/company/orders');
            }
        } catch (error: any) {
            toast.error(error.response?.data?.message
                || (editingId ? 'Не удалось сохранить заявку' : 'Ошибка создания заявки'));
        } finally {
            setSubmitting(false);
        }
    };

    const roleInfo = getRoleDescription();

    // Название организации, от лица которой создаётся заявка (обновляется при смене организации)
    const myCompanyLabel = myCompanies.find(c => c.id === selectedMyCompanyId)?.name?.trim() || myCompanyName || 'Моя компания';

    // =================== STEP CONTENT ===================

    const stepRoute = (
        <Card size="small" className="lc-wiz-panel">
            <Form.Item name="pickupDate" label="Дата и время погрузки" rules={[{ required: true, message: 'Укажите дату' }]} data-guide="wizard-pickup-date">
                <DatePicker
                    style={{ width: '100%' }}
                    format="DD.MM.YYYY HH:mm"
                    showTime={{ format: 'HH:mm' }}
                    placeholder="Выберите дату и время"
                   
                />
            </Form.Item>

            <div className="lc-wiz-head">
                <div className="t">Точки маршрута</div>
                <div className="h">Погрузка, выгрузка и промежуточные точки по порядку</div>
            </div>

            <div className="flex flex-col gap-2">
                {routePointsState.map((pt, i) => {
                    const selected = locations.find((l) => l.id === pt.id);
                    const label = selected
                        ? `${selected.name}${selected.city ? `, ${selected.city}` : ''}, ${selected.address}`
                        : pt.address
                            ? `${pt.city ? `${pt.city}, ` : ''}${pt.address}`
                            : '';
                    return (
                        <div key={i} className="rounded-2xl bg-card p-3 shadow-soft">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                {/* Тип точки — пилюлями: вариантов три, выпадающий список тут лишний. */}
                                <div className="inline-flex items-center gap-0.5 rounded-full bg-secondary p-0.5">
                                    {POINT_TYPES.map((type) => {
                                        const active = pt.pointType === type.key;
                                        return (
                                            <button
                                                key={type.key}
                                                type="button"
                                                onClick={() => {
                                                    const next = [...routePointsState];
                                                    next[i].pointType = type.key;
                                                    setRoutePointsState(next);
                                                }}
                                                className={cn(
                                                    'rounded-full px-3 py-1.5 text-[12px] font-medium leading-none transition-colors',
                                                    active
                                                        ? 'bg-card text-foreground shadow-soft'
                                                        : 'text-muted-foreground hover:text-foreground',
                                                )}
                                            >
                                                {type.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {routePointsState.length > 2 && (
                                    <button
                                        type="button"
                                        aria-label="Убрать точку"
                                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                        onClick={() => {
                                            const next = [...routePointsState];
                                            next.splice(i, 1);
                                            setRoutePointsState(next);
                                        }}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            <AddressPicker
                                groups={getLocationOptions()}
                                valueId={pt.id}
                                valueLabel={label}
                                onCreateNew={() => {
                                    setActiveRoutePointIndex(i);
                                    setQuickLocationModalOpen(true);
                                }}
                                onSelect={(val) => {
                                    const newPts = [...routePointsState];
                                    if (!val) {
                                        newPts[i] = {
                                            ...newPts[i], city: '', address: '', id: undefined,
                                            latitude: undefined, longitude: undefined, emails: [],
                                        };
                                    } else {
                                        const loc = locations.find((l) => l.id === val);
                                        if (loc) {
                                            newPts[i] = {
                                                ...newPts[i],
                                                city: loc.city || '',
                                                address: loc.address,
                                                id: loc.id,
                                                latitude: loc.latitude,
                                                longitude: loc.longitude,
                                                // Подставляем почту, уже закреплённую за адресом.
                                                emails: parseEmails((loc as any).emails),
                                            };
                                            const firstPickup = newPts.find((p) => p.pointType === 'PICKUP');
                                            const lastDelivery = [...newPts].reverse().find((p) => p.pointType === 'DELIVERY');
                                            if (firstPickup?.city && lastDelivery?.city) {
                                                lookupTariff(firstPickup.city, lastDelivery.city);
                                            }
                                        }
                                    }
                                    setRoutePointsState(newPts);
                                }}
                            />

                            <RoutePointEmails
                                locationId={pt.id}
                                value={pt.emails ?? []}
                                onChange={(emails) => {
                                    const newPts = [...routePointsState];
                                    newPts[i] = { ...newPts[i], emails };
                                    setRoutePointsState(newPts);
                                }}
                            />
                        </div>
                    );
                })}
            </div>

            <button
                type="button"
                onClick={() => setRoutePointsState([...routePointsState, { city: '', address: '', pointType: 'ADDITIONAL_PICKUP' }])}
                className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
                <Plus className="h-4 w-4" /> Добавить точку
            </button>
        </Card>
    );

    const stepCargo = (
        <Card size="small" className="lc-wiz-panel">
            <Row gutter={12}>
                <Col xs={24} md={12}>
                    <Form.Item
                        name="natureOfCargo"
                        label="Характер груза"
                        /**
                         * У новой заявки характер груза спрашиваем, у правки —
                         * нет. Поле появилось позже самих заявок, на сервере
                         * оно необязательное, и ни в одной заведённой заявке
                         * его нет. Требовать его при правке значило бы: чтобы
                         * поправить ставку, придумай задним числом характер
                         * груза, которого никто не спрашивал.
                         */
                        rules={editingId ? [] : [{ required: true, message: 'Выберите из списка или впишите свой вариант' }]}
                    >
                        <AutoComplete
                            placeholder="Выберите или впишите свой вариант..."
                           
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
                <Col xs={24} md={12}>
                    <Form.Item name="cargoType" label="Тип кузова">
                        <Select
                            placeholder="Тент, Реф..."
                            allowClear showSearch optionFilterProp="children"
                            filterOption={(input, option) =>
                                (option?.children as unknown as string ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        >
                            {VEHICLE_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                        </Select>
                    </Form.Item>
                </Col>
            </Row>
            <Form.Item name="cargoDescription" label="Описание груза" data-guide="wizard-cargo">
                <TextArea rows={2} placeholder="Мебель, 20 коробок, палеты..." />
            </Form.Item>
            <Row gutter={12}>
                <Col xs={12} md={8}>
                    <Form.Item name="cargoWeight" label="Вес (кг)">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                    <Form.Item name="cargoVolume" label="Объём (м³)">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                    <Form.Item name="palletCount" label="Количество палет" hidden>
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                    </Form.Item>
                </Col>
            </Row>

            <Checkbox
                checked={showDims}
                onChange={e => setShowDims(e.target.checked)}
                style={{ marginBottom: showDims ? 12 : 16 }}
            >
                Указать габариты груза (Длина × Ширина × Высота, м)
            </Checkbox>
            {showDims && (
                <Row gutter={12}>
                    <Col xs={8}>
                        <Form.Item name="cargoLength" label="Длина, м">
                            <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" />
                        </Form.Item>
                    </Col>
                    <Col xs={8}>
                        <Form.Item name="cargoWidth" label="Ширина, м">
                            <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" />
                        </Form.Item>
                    </Col>
                    <Col xs={8}>
                        <Form.Item name="cargoHeight" label="Высота, м">
                            <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="0" />
                        </Form.Item>
                    </Col>
                </Row>
            )}

            <div className="mb-4 rounded-2xl bg-card p-4 shadow-soft">
                <CargoComposition value={cargo} onChange={setCargo} />
            </div>

            <Form.Item name="requirements" label="Дополнительная информация">
                <TextArea rows={2} placeholder="Ремни, коники, гидроборт, особые пожелания..." />
            </Form.Item>
        </Card>
    );

    const stepParties = (
        <Card size="small" className="lc-wiz-panel">
            {myCompanies.length > 1 && (
                <Form.Item label="Организация" required style={{ marginBottom: 16 }}>
                    <Select
                       
                        value={selectedMyCompanyId}
                        onChange={value => {
                            setSelectedMyCompanyId(value);
                            setSelectedDriverId('');
                            form.setFieldsValue({
                                firstName: '', lastName: '', middleName: '', phone: '', iin: '',
                                vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
                                docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: '',
                                vehicleSelect: undefined, driverSelect: undefined
                            });
                        }}
                        optionLabelProp="label"
                        options={myCompanies.map(c => ({ value: c.id, label: c.name?.trim() || 'Без названия' }))}
                    />
                </Form.Item>
            )}
            <div className={myCompanies.length > 1 ? 'lc-wiz-head' : 'lc-wiz-head is-first'}>
                <div className="t">Стороны сделки</div>
                <div className="h">Кто заказчик и кто выполняет перевозку</div>
            </div>

            {/* Role auto-detection indicator — слим-пилюля */}
            <div className="lc-wiz-role" style={{ background: `${roleInfo.color}14`, color: roleInfo.color, border: `1px solid ${roleInfo.color}33` }}>
                <CheckCircleOutlined style={{ fontSize: 14 }} />
                <span>{roleInfo.text}</span>
            </div>

            <Row gutter={12}>
                <Col xs={24} md={12}>
                    <div className="lc-wiz-field" data-guide="wizard-customer">
                        <div className="lc-wiz-lbl">Заказчик</div>
                        <Select
                            placeholder="Выберите заказчика"
                            style={{ width: '100%' }}
                           
                            value={selectedCustomer || undefined}
                            onChange={setSelectedCustomer}
                            showSearch
                            optionFilterProp="children"
                            dropdownRender={(menu) => (
                                <>
                                    <Button
                                        variant="ghost"
                                        className="h-auto w-full justify-start px-3 py-2 font-medium text-[#1677ff]"
                                        onClick={() => {
                                            setQuickPartnerTarget('CUSTOMER');
                                            setQuickPartnerModalOpen(true);
                                        }}
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Добавить контрагента
                                    </Button>
                                    <Divider style={{ margin: '4px 0' }} />
                                    {menu}
                                </>
                            )}
                        >
                            <Select.Option value={MY_COMPANY_VALUE}>
                                <span style={{ fontWeight: 600 }}>{myCompanyLabel}</span>
                            </Select.Option>
                            <Select.OptGroup label="Контрагенты">
                                {partners.filter(p => p.isCustomer).map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                            </Select.OptGroup>
                        </Select>
                        {/*
                          * Номер этой перевозки в системе заказчика. Графа
                          * появляется только у тех заказчиков, кто такой номер
                          * ведёт, и называется так, как называет её он сам —
                          * см. карточку контрагента. Раньше его вписывали в
                          * «Номер ТТН», и в одной графе оказывались настоящая
                          * накладная и чужой идентификатор.
                          */}
                        {customerRefLabel && (
                            <div style={{ marginTop: 10 }}>
                                <div className="lc-wiz-lbl">{customerRefLabel}</div>
                                <Form.Item name="customerRefNumber" noStyle>
                                    <Input placeholder={`${customerRefLabel} у заказчика`} />
                                </Form.Item>
                            </div>
                        )}
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div className="lc-wiz-field" data-guide="wizard-carrier">
                        <div className="lc-wiz-lbl">Перевозчик</div>
                        <Select
                            placeholder="Выберите перевозчика"
                            style={{ width: '100%' }}
                           
                            value={selectedCarrier || undefined}
                            onChange={(val) => {
                                setSelectedCarrier(val);
                                setSelectedDriverId('');
                                form.setFieldsValue({
                                    driverId: undefined,
                                    lastName: '', firstName: '', middleName: '', phone: '', iin: '',
                                    vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
                                    docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: ''
                                });
                            }}
                            showSearch
                            optionFilterProp="children"
                            dropdownRender={(menu) => (
                                <>
                                    <Button
                                        variant="ghost"
                                        className="h-auto w-full justify-start px-3 py-2 font-medium text-[#1677ff]"
                                        onClick={() => {
                                            setQuickPartnerTarget('CARRIER');
                                            setQuickPartnerModalOpen(true);
                                        }}
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Добавить контрагента
                                    </Button>
                                    <Divider style={{ margin: '4px 0' }} />
                                    {menu}
                                </>
                            )}
                        >
                            <Select.Option value={MY_COMPANY_VALUE}>
                                <span style={{ fontWeight: 600 }}>{myCompanyLabel}</span>
                            </Select.Option>
                            {/* Биржа временно отключена до запуска (перевёрнутая цепочка ролей при takeOrder) */}
                            <Select.OptGroup label="Контрагенты">
                                {partners.filter(p => p.isCarrier).map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                            </Select.OptGroup>
                        </Select>
                    </div>
                </Col>
            </Row>

            <div className="lc-wiz-field" style={{ marginTop: 4 }}>
                <div className="lc-wiz-lbl">Ответственный менеджер</div>
                <Select
                    style={{ width: '100%' }}
                   
                    value={responsibleChoice}
                    onChange={setResponsibleChoice}
                    showSearch
                    optionFilterProp="label"
                    filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={[
                        {
                            value: 'SELF',
                            label: user?.firstName
                                ? `${user.lastName || ''} ${user.firstName}`.trim()
                                : 'Текущий пользователь',
                        },
                        { value: 'NONE', label: 'Не назначать — заявку возьмёт любой менеджер' },
                        ...officeUsers
                            .filter(u => u.id !== user?.id)
                            .map(u => ({ value: u.id, label: `${u.lastName} ${u.firstName}${u.role === 'LOGISTICIAN' ? '' : ' (админ)'}` })),
                    ]}
                />
                {responsibleChoice !== 'SELF' && responsibleChoice !== 'NONE' && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                        Заявка будет закреплена за выбранным менеджером, вы останетесь её создателем и сохраните доступ
                    </Text>
                )}
            </div>

            <div className="lc-wiz-head">
                <div className="t">Ставки</div>
                <div className="h">Стоимость перевозки. НДС и сроки оплаты подставятся из карточек сторон</div>
            </div>

            <Row gutter={12}>
                {showCustomerPriceField && (
                    <>
                        <Col xs={24} md={8}>
                            <Form.Item name="customerPrice" label={customerPriceLabel}>
                                <InputNumber
                                    min={0}
                                    style={{ width: '100%' }}
                                    placeholder="0"
                                    addonAfter={(
                                        <Form.Item name="currency" noStyle initialValue="KZT">
                                            <CurrencySelect />
                                        </Form.Item>
                                    )}
                                />
                            </Form.Item>
                            {appliedTariff && (
                                <div style={{ marginTop: -12, marginBottom: 8, padding: '4px 8px', background: token.colorSuccessBg, border: `1px solid ${token.colorSuccessBorder}`, borderRadius: 6, fontSize: 11 }}>
                                    <CheckCircleOutlined style={{ color: token.colorSuccess, marginRight: 4 }} /> Тариф ДС №{appliedTariff.agreement?.agreementNumber || '—'}
                                </div>
                            )}
                        </Col>

                    </>
                )}
            </Row>

            <Row gutter={12}>
                {showDriverCostField && (
                    <>
                        <Col xs={24} md={8}>
                            <Form.Item name="driverCost" label={driverCostLabel}>
                                <InputNumber
                                    min={0}
                                    style={{ width: '100%' }}
                                    placeholder="0"
                                    addonAfter={(
                                        // Валюта перевозчика своя: рейс, где клиент платит
                                        // рублями, а перевозчик получает тенге, — обычное дело.
                                        <Form.Item name="driverCostCurrency" noStyle initialValue="KZT">
                                            <CurrencySelect />
                                        </Form.Item>
                                    )}
                                />
                            </Form.Item>
                        </Col>

                    </>
                )}
            </Row>

            <Row gutter={12}>
                <Col xs={24} md={12}>
                    <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                        <Select style={{ width: '100%' }}>
                            <Select.Option value="FIXED">За рейс</Select.Option>
                            <Select.Option value="PER_KM">За км</Select.Option>
                            <Select.Option value="PER_TON">За тонну</Select.Option>
                        </Select>
                    </Form.Item>
                </Col>
            </Row>

            {/* Плановые даты оплаты платформа считает сама — по срокам из
                карточек сторон. Спрашивать их у того, кто заводит рейс, значит
                просить его помнить договорённость, которая уже записана.

                Условия показываем строкой: логисту они нужны, чтобы
                разговаривать с перевозчиком, а менять их он не может. */}
            {(customerTerms || carrierTerms) && (
                <div className={nova.item} style={{ marginTop: 4 }}>
                    <span className={nova.itemText}>
                        <span className={nova.itemLabel}>Условия расчётов</span>
                        <span className={nova.itemDesc} style={{ whiteSpace: 'normal' }}>
                            {[
                                customerTerms && `заказчик — ${vatLabel(customerTerms.vatPayer, customerTerms.vatRate)}`
                                    + (paymentTermsLabel(customerTerms.customerPaymentDays, customerTerms.customerPaymentFrom)
                                        ? `, оплата ${paymentTermsLabel(customerTerms.customerPaymentDays, customerTerms.customerPaymentFrom)}`
                                        : ', срок оплаты не указан'),
                                carrierTerms && `перевозчик — ${vatLabel(carrierTerms.vatPayer, carrierTerms.vatRate)}`
                                    + (paymentTermsLabel(carrierTerms.carrierPaymentDays, carrierTerms.carrierPaymentFrom)
                                        ? `, платим ${paymentTermsLabel(carrierTerms.carrierPaymentDays, carrierTerms.carrierPaymentFrom)}`
                                        : ', срок оплаты не указан'),
                            ].filter(Boolean).join(' · ')}
                        </span>
                        <span className={nova.itemDesc} style={{ whiteSpace: 'normal' }}>
                            Заполняются в карточке контрагента, раздел «Расчёты». Не заполнены —
                            рейс дождётся бухгалтера, заводить его это не мешает.
                        </span>
                    </span>
                </div>
            )}

            {/* Margin preview */}
            <Form.Item noStyle dependencies={['customerPrice', 'driverCost']}>
                {({ getFieldValue }) => {
                    const cp = getFieldValue('customerPrice') || 0;
                    const dc = getFieldValue('driverCost') || 0;
                    // НДС берём из карточек сторон — там же, откуда его возьмёт
                    // сервер при сохранении. Иначе маржа в мастере и маржа в
                    // карточке рейса расходились бы на сумму налога.
                    const hasVat = !!customerTerms?.vatPayer;
                    const vatRate = Number(customerTerms?.vatRate ?? 0);
                    const executorHasVat = !!carrierTerms?.vatPayer;
                    const executorVatRate = Number(carrierTerms?.vatRate ?? 0);

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
                                <span className={`${nova.chip} ${margin >= 0 ? '' : nova.chipNeg}`}>{marginPercent}%</span>
                            </div>
                        );
                    }
                    return null;
                }}
            </Form.Item>

            {isOwnOrExternalCarrier && (
                <>
                    <div className="lc-wiz-head">
                        <div className="t">Водитель и транспорт</div>
                        <div className="h">Можно назначить сейчас или позже — это необязательно</div>
                    </div>
                    {selectedCarrier === MY_COMPANY_VALUE && vehicles.length > 0 && (
                        <Form.Item label="Выбрать ТС из автопарка (опционально)">
                            <Select
                                placeholder="Выберите транспортное средство"
                               
                                loading={vehiclesLoading}
                                onChange={handleVehicleSelect}
                                allowClear
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                options={vehicles.map(v => ({ value: v.id, label: `${v.model} (${v.plate})` }))}
                            />
                        </Form.Item>
                    )}

                    <Form.Item name="driverId" label="Водитель (не обязательно)">
                        <Select
                            placeholder="Выберите водителя из списка"
                           
                            loading={driversLoading}
                            onChange={handleDriverSelect}
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={[
                                ...drivers.map(d => ({
                                    value: d.id,
                                    label: `${d.lastName} ${d.firstName} ${d.middleName || ''} (${d.phone})`.trim()
                                })),
                                { value: '__NEW_DRIVER__', label: '+ Добавить нового водителя' }
                            ]}
                        />
                    </Form.Item>

                    {selectedDriverId && (
                        <div>
                            <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Данные водителя</Divider>
                            <Row gutter={12}>
                                <Col span={8}>
                                    <Form.Item name="lastName" label="Фамилия" rules={[{ required: selectedDriverId === '__NEW_DRIVER__', message: 'Введите фамилию' }]}>
                                        <Input placeholder="Иванов" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="firstName" label="Имя" rules={[{ required: selectedDriverId === '__NEW_DRIVER__', message: 'Введите имя' }]}>
                                        <Input placeholder="Иван" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="middleName" label="Отчество">
                                        <Input placeholder="Иванович" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="phone" label="Телефон" rules={[{ required: selectedDriverId === '__NEW_DRIVER__', message: 'Введите телефон' }]}>
                                        <Input placeholder="+77001234567" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="iin" label="ИИН">
                                        <Input placeholder="123456789012" maxLength={12} />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Транспортное средство</Divider>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="vehicleType" label="Тип транспорта">
                                        <Select
                                            placeholder="Выберите тип кузова"
                                           
                                            options={VEHICLE_TYPES.map(t => ({ label: t, value: t }))}
                                            showSearch
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="vehicleModel" label="Модель автомобиля">
                                        <Input placeholder="Volvo FH12" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="vehiclePlate" label="Госномер автомобиля" rules={[{ required: selectedDriverId === '__NEW_DRIVER__', message: 'Введите госномер' }]}>
                                        <Input placeholder="123 ABC 01" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="trailerNumber" label="Госномер прицепа">
                                        <Input placeholder="1234 XX 01" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Документы</Divider>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="docType" label="Тип документа">
                                        <Select placeholder="Выберите документ">
                                            <Select.Option value="ID_CARD">Удостоверение личности</Select.Option>
                                            <Select.Option value="PASSPORT">Паспорт</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="docNumber" label="Номер документа">
                                        <Input placeholder="012345678" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={8}>
                                    <Form.Item name="docIssuedAt" label="Дата выдачи">
                                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="ДД.ММ.ГГГГ" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="docExpiresAt" label="Срок действия">
                                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="ДД.ММ.ГГГГ" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="docIssuedBy" label="Кем выдан">
                                        <Input placeholder="МВД РК" />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>
                    )}
                </>
            )}

            {isCarrierOnPlatform && (
                <div style={{
                    padding: '16px 20px',
                    background: `${token.colorSuccessBg}`,
                    border: `1px solid ${token.colorSuccessBorder}`,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginTop: 16
                }}>
                    <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 20 }} />
                    <div style={{ color: token.colorSuccessText, fontSize: 13, fontWeight: 500 }}>
                        Перевозчик зарегистрирован на платформе. Он самостоятельно назначит водителя на эту заявку. Дальнейший ввод водителя не требуется.
                    </div>
                </div>
            )}
        </Card>
    );

    const steps = [
        { title: 'Стороны и ставки', content: stepParties, icon: <CheckCircleOutlined /> },
        { title: 'Маршрут', content: stepRoute, icon: <EnvironmentOutlined /> },
        { title: 'Груз', content: stepCargo, icon: <SendOutlined /> },
    ];

    return (
        <div className="lc-page lc-wizard" style={{ maxWidth: 1000, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Заявки</div>
                    <h1 className="lc2-title">
                        {editingId ? `Правка заявки ${editingNumber}`.trim() : 'Новая заявка'}
                    </h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Шаг {currentStep + 1} из {steps.length} · {steps[currentStep].title}
                    </p>
                    <Button variant="outline" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4" /> Назад к заявкам
                    </Button>
                </div>
            </div>

            {!profileComplete && (
                <div style={{
                    marginBottom: 16, padding: '12px 16px',
                    background: 'var(--nova-surface-2)', border: '1px solid var(--nova-border)',
                    borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                    color: 'var(--nova-fg-2)',
                }}>
                    <ExclamationCircleOutlined style={{ color: 'var(--nova-fg-3)' }} />
                    <span>
                        {editingId ? 'Заявку можно сохранить сейчас' : 'Заявку можно создать сейчас'}, но для формирования документов (доверенности, счета)
                        заполните <a onClick={() => router.push('/company/settings')} style={{ fontWeight: 600 }}>профиль компании</a>
                    </span>
                </div>
            )}

            {/* ===== WIZARD CARD ===== */}
            <div className="lc-wiz-shell">
            {/* Шаги — пилюли, как переключатели разделов в остальном
                кабинете. Синие «Steps» из antd рядом с ними читались как
                другой продукт. Пройденные шаги кликабельны: вернуться к
                сторонам сделки посреди груза — обычное дело. */}
            <div className={nova.pills} style={{ marginBottom: 18 }} role="tablist">
                {steps.map((step, idx) => (
                    <button
                        key={idx}
                        type="button"
                        role="tab"
                        aria-selected={idx === currentStep}
                        className={`${nova.pill} ${idx === currentStep ? nova.pillActive : ''}`}
                        onClick={() => { if (idx < currentStep) setCurrentStep(idx); }}
                        disabled={idx > currentStep}
                        // Якоря для ИИ-гида: он ведёт по мастеру шаг за шагом,
                        // и до сих пор ему нечего было показать внутри формы.
                        data-guide={`wizard-step-${idx}`}
                    >
                        {idx + 1}. {step.title}
                    </button>
                ))}
            </div>

            {/* Form */}
            <Form form={form} layout="vertical">
                {steps.map((step, idx) => (
                    <div key={idx} style={{ display: currentStep === idx ? 'block' : 'none' }}>
                        {step.content}
                    </div>
                ))}
            </Form>
            </div>
{/* Navigation buttons */}
            <div className="lc-wizard-nav" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, marginBottom: 32 }}>
                <div>
                    {currentStep > 0 && (
                        <Button variant="outline" onClick={goBack} data-guide="wizard-back">
                            ← Назад
                        </Button>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <Button variant="outline" onClick={() => router.back()}>
                        Отмена
                    </Button>
                    {currentStep < steps.length - 1 ? (
                        <Button onClick={goNext} data-guide="wizard-next">
                            Далее →
                        </Button>
                    ) : (
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting || !selectedCustomer || !selectedCarrier}
                            data-guide="wizard-submit"
                        >
                            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editingId ? 'Сохранить заявку' : 'Создать заявку'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Quick Partner Modal */}
            <Modal
                title="Новый контрагент"
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
                        name="bin" label="БИН/ИИН"
                        rules={[
                            { required: true, message: 'Введите БИН/ИИН' },
                            { pattern: /^\d{12}$/, message: 'Должен быть ровно 12 цифр' }
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

            {(() => {
                const currentCustomerCompany = selectedCustomer === MY_COMPANY_VALUE
                    ? { id: selectedMyCompanyId, name: myCompanies.find(c => c.id === selectedMyCompanyId)?.name || myCompanyName || 'Моя компания' }
                    : selectedCustomer
                        ? { id: selectedCustomer, name: partners.find(p => p.id === selectedCustomer)?.name || 'Заказчик' }
                        : undefined;

                const currentCarrierCompany = selectedCarrier === MY_COMPANY_VALUE
                    ? { id: selectedMyCompanyId, name: myCompanies.find(c => c.id === selectedMyCompanyId)?.name || myCompanyName || 'Моя компания' }
                    : (selectedCarrier && selectedCarrier !== MARKETPLACE_VALUE)
                        ? { id: selectedCarrier, name: partners.find(p => p.id === selectedCarrier)?.name || 'Исполнитель' }
                        : undefined;

                return (
                    <QuickCreateLocationModal
                        open={quickLocationModalOpen}
                        onCancel={() => {
                            setQuickLocationModalOpen(false);
                            setActiveRoutePointIndex(null);
                        }}
                        onSuccess={handleNewLocationSuccess}
                        customerCompany={currentCustomerCompany}
                        carrierCompany={currentCarrierCompany}
                    />
                );
            })()}
        </div>
    );
}
