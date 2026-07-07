'use client';
// Trigger redeployment
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import {
    Typography, Button, Form, Input, InputNumber, Select, DatePicker,
    message, Row, Col, Card, Modal, Steps, Divider, theme, Tag
} from 'antd';
import {
    ArrowLeftOutlined, PlusOutlined, EnvironmentOutlined, FlagOutlined,
    DeleteOutlined, SendOutlined, CheckCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import QuickCreateLocationModal from '@/components/ui/QuickCreateLocationModal';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Partner {
    id: string;
    name: string;
    isExternal?: boolean;
}

interface LocationState {
    city: string;
    address: string;
    id?: string;
    latitude?: number;
    longitude?: number;
}

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
    const [partners, setPartners] = useState<Partner[]>([]);
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
    const [selectedCustomer, setSelectedCustomer] = useState<string>(MY_COMPANY_VALUE);
    const [selectedCarrier, setSelectedCarrier] = useState<string>('');
    const [quickPartnerTarget, setQuickPartnerTarget] = useState<'CUSTOMER' | 'CARRIER' | null>(null);

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
                .catch(() => message.error('Ошибка загрузки водителей'))
                .finally(() => setDriversLoading(false));
        } else {
            setDrivers([]);
        }

        if (selectedCarrier === MY_COMPANY_VALUE) {
            setVehiclesLoading(true);
            api.get('/company/vehicles', { params: { companyId: selectedMyCompanyId } })
                .then(res => setVehicles(res.data))
                .catch(() => message.error('Ошибка загрузки автопарка'))
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
    const [routePointsState, setRoutePointsState] = useState<Array<LocationState & { pointType: string }>>([
        { city: '', address: '', pointType: 'PICKUP' },
        { city: '', address: '', pointType: 'DELIVERY' }
    ]);



    const isMeCustomer = selectedCustomer === MY_COMPANY_VALUE;
    const isMeCarrier = selectedCarrier === MY_COMPANY_VALUE;
    const isMarketplace = selectedCarrier === MARKETPLACE_VALUE;

    const showCustomerPriceField = !isMeCustomer || (isMeCustomer && isMeCarrier);
    const showDriverCostField = (isMeCustomer && !isMeCarrier) || (!isMeCustomer && !isMeCarrier);

    const customerPriceLabel = (isMeCustomer && isMeCarrier) ? "Ставка (₸)" : "Ставка от заказчика (₸)";
    const driverCostLabel = isMarketplace ? "Ставка для биржи (₸)" : "Ставка перевозчику (₸)";

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
    }, [user]);

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

    const fetchPartners = async () => {
        try {
            const [partnersRes, externalRes, profileRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
                api.get('/company/profile'),
            ]);
            const partnersList = partnersRes.data.filter((p: any) => p.isCarrier).map((p: any) => ({ ...p, isExternal: false }));
            const externalList = externalRes.data
                .filter((e: any) => e.isCarrier)
                .map((e: any) => ({ id: e.id, name: e.name, isExternal: true }));
            const combined = [...partnersList, ...externalList];
            setPartners(combined);
            if (profileRes.data?.name) {
                setMyCompanyName(profileRes.data.name);
            }
        } catch { }
    };

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
            const name = selectedCarrier === MY_COMPANY_VALUE ? myCompanyName : partners.find(p => p.id === selectedCarrier)?.name || 'Перевозчик';
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
                message.success(`Тариф найден: ${response.data.price.toLocaleString('ru-RU')} ₸`);
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
            message.success('Контрагент добавлен');
            setQuickPartnerModalOpen(false);
            quickPartnerForm.resetFields();
            await fetchPartners();
            if (quickPartnerTarget === 'CUSTOMER') {
                setSelectedCustomer(res.data.id);
            } else if (quickPartnerTarget === 'CARRIER') {
                setSelectedCarrier(res.data.id);
            }
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка при создании контрагента');
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
                message.error('Укажите заказчика');
                return false;
            }
            if (!selectedCarrier) {
                message.error('Укажите перевозчика');
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
                message.error('Укажите дату погрузки');
                return false;
            }
            const hasPickup = routePointsState.some(p => p.pointType === 'PICKUP' && (p.id || p.city));
            const hasDelivery = routePointsState.some(p => p.pointType === 'DELIVERY' && (p.id || p.city));
            if (!hasPickup) { message.error('Укажите точку погрузки'); return false; }
            if (!hasDelivery) { message.error('Укажите точку выгрузки'); return false; }
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
        if (!selectedCustomer) { message.error('Укажите заказчика'); return; }
        if (!selectedCarrier) { message.error('Укажите перевозчика'); return; }

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
                        message.info('Использован существующий водитель');
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
                    latitude: loc.latitude ?? 0,
                    longitude: loc.longitude ?? 0,
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
                message.error('Укажите минимум 2 точки маршрута');
                setSubmitting(false);
                return;
            }

            // Build order payload based on selected parties
            const finalCustomerPrice = showCustomerPriceField ? values.customerPrice : values.driverCost;
            const finalDriverCost = showDriverCostField ? values.driverCost : null;

            const orderData: any = {
                cargoDescription: values.cargoDescription,
                natureOfCargo: values.natureOfCargo,
                cargoWeight: values.cargoWeight,
                cargoVolume: values.cargoVolume,
                cargoType: values.cargoType,
                requirements: values.requirements,
                customerPrice: finalCustomerPrice,
                customerPriceType: values.customerPriceType || 'FIXED',
                routePoints,
                customerId: user?.id,
                appliedTariffId: appliedTariff?.id || undefined,
                vatRate: values.vatRate ?? 0,
                hasVat: values.hasVat ?? false,
                executorVatRate: values.executorVatRate ?? 0,
                executorHasVat: values.executorHasVat ?? false,
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
                } else {
                    orderData.forwarderId = selectedMyCompanyId;
                    orderData.subForwarderId = selectedCarrier;
                    orderData.subForwarderPrice = finalDriverCost || null;
                }
            }

            await api.post('/orders', orderData);
            message.success('Заявка создана!');
            router.push('/company/orders');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания заявки');
        } finally {
            setSubmitting(false);
        }
    };

    const roleInfo = getRoleDescription();

    // =================== STEP CONTENT ===================

    const stepRoute = (
        <Card size="small" style={{ marginTop: 16 }}>
            {myCompanies.length > 1 && (
                <Form.Item label="Организация" required style={{ marginBottom: 16 }}>
                    <Select
                        size="large"
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
            <Form.Item name="pickupDate" label="Дата и время погрузки" rules={[{ required: true, message: 'Укажите дату' }]}>
                <DatePicker
                    style={{ width: '100%' }}
                    format="DD.MM.YYYY HH:mm"
                    showTime={{ format: 'HH:mm' }}
                    placeholder="Выберите дату и время"
                    size="large"
                />
            </Form.Item>

            <Divider style={{ margin: '16px 0 12px' }}>Точки маршрута</Divider>

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
                        placeholder="Выберите адрес / склад"
                        allowClear showSearch optionFilterProp="children"
                        style={{ width: '100%' }}
                        size="large"
                        value={pt.id || undefined}
                        onChange={(val) => {
                            const newPts = [...routePointsState];
                            if (!val) { newPts[i] = { ...newPts[i], city: '', address: '', id: undefined, latitude: undefined, longitude: undefined }; }
                            else {
                                const loc = locations.find(l => l.id === val);
                                if (loc) {
                                    newPts[i] = { 
                                        ...newPts[i], 
                                        city: loc.city || '', 
                                        address: loc.address, 
                                        id: loc.id,
                                        latitude: loc.latitude,
                                        longitude: loc.longitude
                                    };
                                    const firstPickup = newPts.find(p => p.pointType === 'PICKUP');
                                    const lastDelivery = [...newPts].reverse().find(p => p.pointType === 'DELIVERY');
                                    if (firstPickup?.city && lastDelivery?.city) {
                                        lookupTariff(firstPickup.city, lastDelivery.city);
                                    }
                                }
                            }
                            setRoutePointsState(newPts);
                        }}
                        dropdownRender={(menu) => (
                            <>
                                {menu}
                                <Divider style={{ margin: '4px 0' }} />
                                <Button
                                    type="text"
                                    icon={<PlusOutlined />}
                                    block
                                    onClick={() => {
                                        setActiveRoutePointIndex(i);
                                        setQuickLocationModalOpen(true);
                                    }}
                                    style={{ textAlign: 'left', padding: '4px 12px', height: 'auto', color: '#1677ff' }}
                                >
                                    + Добавить новый адрес
                                </Button>
                            </>
                        )}
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
    );

    const stepCargo = (
        <Card size="small" style={{ marginTop: 16 }}>
            <Row gutter={16}>
                <Col xs={24} md={12}>
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
                <Col xs={24} md={12}>
                    <Form.Item name="cargoType" label="Тип кузова">
                        <Select
                            placeholder="Тент, Реф..."
                            allowClear showSearch optionFilterProp="children" size="large"
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
                <TextArea rows={2} placeholder="Мебель, 20 коробок, палеты..." />
            </Form.Item>
            <Row gutter={16}>
                <Col xs={12} md={8}>
                    <Form.Item name="cargoWeight" label="Вес (кг)">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                    </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                    <Form.Item name="cargoVolume" label="Объём (м³)">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                    </Form.Item>
                </Col>
            </Row>
            <Form.Item name="requirements" label="Доп. требования">
                <TextArea rows={2} placeholder="Ремни, коники, гидроборт..." />
            </Form.Item>
        </Card>
    );

    const stepParties = (
        <Card size="small" style={{ marginTop: 16 }}>
            {/* Role auto-detection indicator */}
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

            <Row gutter={24}>
                <Col xs={24} md={12}>
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Кто заказчик?</div>
                        <Select
                            placeholder="Выберите заказчика"
                            style={{ width: '100%' }}
                            size="large"
                            value={selectedCustomer || undefined}
                            onChange={setSelectedCustomer}
                            showSearch
                            optionFilterProp="children"
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
                        >
                            <Select.Option value={MY_COMPANY_VALUE}>
                                <span style={{ fontWeight: 600 }}>{myCompanyName || 'Моя компания'}</span>
                            </Select.Option>
                            <Select.OptGroup label="Контрагенты">
                                {partners.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                            </Select.OptGroup>
                        </Select>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Кто перевозчик?</div>
                        <Select
                            placeholder="Выберите перевозчика"
                            style={{ width: '100%' }}
                            size="large"
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
                        >
                            <Select.Option value={MY_COMPANY_VALUE}>
                                <span style={{ fontWeight: 600 }}>{myCompanyName || 'Моя компания'}</span>
                            </Select.Option>
                            {/* Биржа временно отключена до запуска (перевёрнутая цепочка ролей при takeOrder) */}
                            <Select.OptGroup label="Контрагенты">
                                {partners.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
                            </Select.OptGroup>
                        </Select>
                    </div>
                </Col>
            </Row>

            <Divider style={{ margin: '8px 0 16px' }}>Ставки и НДС</Divider>

            <Row gutter={24}>
                {showCustomerPriceField && (
                    <>
                        <Col xs={24} md={8}>
                            <Form.Item name="customerPrice" label={customerPriceLabel}>
                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                            </Form.Item>
                            {appliedTariff && (
                                <div style={{ marginTop: -12, marginBottom: 8, padding: '4px 8px', background: token.colorSuccessBg, border: `1px solid ${token.colorSuccessBorder}`, borderRadius: 6, fontSize: 11 }}>
                                    <CheckCircleOutlined style={{ color: token.colorSuccess, marginRight: 4 }} /> Тариф ДС №{appliedTariff.agreement?.agreementNumber || '—'}
                                </div>
                            )}
                        </Col>
                        <Col xs={12} md={8}>
                            <Form.Item name="hasVat" label="НДС заказчика" initialValue={false}>
                                <Select size="large">
                                    <Select.Option value={false}>Без НДС</Select.Option>
                                    <Select.Option value={true}>С НДС</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={8}>
                            <Form.Item name="vatRate" label="Ставка НДС" initialValue={12}>
                                <Select size="large">
                                    <Select.Option value={0}>0%</Select.Option>
                                    <Select.Option value={12}>12%</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </>
                )}
            </Row>

            <Row gutter={24}>
                {showDriverCostField && (
                    <>
                        <Col xs={24} md={8}>
                            <Form.Item name="driverCost" label={driverCostLabel}>
                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" size="large" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={8}>
                            <Form.Item name="executorHasVat" label="НДС перевозчика" initialValue={false}>
                                <Select size="large">
                                    <Select.Option value={false}>Без НДС</Select.Option>
                                    <Select.Option value={true}>С НДС</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={12} md={8}>
                            <Form.Item name="executorVatRate" label="Ставка НДС" initialValue={12}>
                                <Select size="large">
                                    <Select.Option value={0}>0%</Select.Option>
                                    <Select.Option value={12}>12%</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </>
                )}
            </Row>

            <Row gutter={24}>
                <Col xs={24} md={12}>
                    <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                        <Select style={{ width: '100%' }} size="large">
                            <Select.Option value="FIXED">За рейс</Select.Option>
                            <Select.Option value="PER_KM">За км</Select.Option>
                            <Select.Option value="PER_TON">За тонну</Select.Option>
                        </Select>
                    </Form.Item>
                </Col>
            </Row>

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

            {isOwnOrExternalCarrier && (
                <>
                    <Divider style={{ margin: '16px 0 12px' }}>Назначение водителя и ТС</Divider>
                    {selectedCarrier === MY_COMPANY_VALUE && vehicles.length > 0 && (
                        <Form.Item label="Выбрать ТС из автопарка (опционально)">
                            <Select
                                placeholder="Выберите транспортное средство"
                                size="large"
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
                            size="large"
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
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="lastName" label="Фамилия" rules={[{ required: selectedDriverId === '__NEW_DRIVER__', message: 'Введите фамилию' }]}>
                                        <Input size="large" placeholder="Иванов" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="firstName" label="Имя" rules={[{ required: selectedDriverId === '__NEW_DRIVER__', message: 'Введите имя' }]}>
                                        <Input size="large" placeholder="Иван" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="middleName" label="Отчество">
                                        <Input size="large" placeholder="Иванович" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="phone" label="Телефон" rules={[{ required: selectedDriverId === '__NEW_DRIVER__', message: 'Введите телефон' }]}>
                                        <Input size="large" placeholder="+77001234567" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="iin" label="ИИН">
                                        <Input size="large" placeholder="123456789012" maxLength={12} />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Транспортное средство</Divider>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="vehicleType" label="Тип транспорта">
                                        <Select
                                            placeholder="Выберите тип кузова"
                                            size="large"
                                            options={VEHICLE_TYPES.map(t => ({ label: t, value: t }))}
                                            showSearch
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="vehicleModel" label="Модель автомобиля">
                                        <Input size="large" placeholder="Volvo FH12" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="vehiclePlate" label="Госномер автомобиля" rules={[{ required: selectedDriverId === '__NEW_DRIVER__', message: 'Введите госномер' }]}>
                                        <Input size="large" placeholder="123 ABC 01" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="trailerNumber" label="Госномер прицепа">
                                        <Input size="large" placeholder="1234 XX 01" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Документы</Divider>
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item name="docType" label="Тип документа">
                                        <Select placeholder="Выберите документ" size="large">
                                            <Select.Option value="ID_CARD">Удостоверение личности</Select.Option>
                                            <Select.Option value="PASSPORT">Паспорт</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="docNumber" label="Номер документа">
                                        <Input size="large" placeholder="012345678" />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item name="docIssuedAt" label="Дата выдачи">
                                        <DatePicker style={{ width: '100%' }} size="large" format="DD.MM.YYYY" placeholder="ДД.ММ.ГГГГ" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="docExpiresAt" label="Срок действия">
                                        <DatePicker style={{ width: '100%' }} size="large" format="DD.MM.YYYY" placeholder="ДД.ММ.ГГГГ" />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item name="docIssuedBy" label="Кем выдан">
                                        <Input size="large" placeholder="МВД РК" />
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
        <div className="lc-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Заявки</div>
                    <h1 className="lc2-title">Новая заявка</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Создание заявки на перевозку — 3 шага
                    </p>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()}>
                        Назад к заявкам
                    </Button>
                </div>
            </div>

            {!profileComplete && (
                <div style={{
                    marginBottom: 16, padding: '12px 16px',
                    background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}`,
                    borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8
                }}>
                    <ExclamationCircleOutlined style={{ color: token.colorWarning }} />
                    <span>Заполните профиль компании перед созданием заявок</span>
                </div>
            )}

            {/* ===== WIZARD CARD ===== */}
            <div className="lc-card" style={{ padding: '8px 8px 4px' }}>
            {currentStep < steps.length - 1 && <div style={{ marginBottom: 16, color: 'var(--lc-text-ter)', fontSize: 13 }}>Шаг {currentStep + 1} из {steps.length}</div>}
            <Steps
                current={currentStep}
                items={steps.map(s => ({ title: s.title, icon: s.icon }))}
                style={{ marginBottom: 8 }}
            />

            {/* Form */}
            <Form form={form} layout="vertical" disabled={!profileComplete}>
                {steps.map((step, idx) => (
                    <div key={idx} style={{ display: currentStep === idx ? 'block' : 'none' }}>
                        {step.content}
                    </div>
                ))}
            </Form>
            </div>
{/* Navigation buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, marginBottom: 32 }}>
                <div>
                    {currentStep > 0 && (
                        <Button size="large" onClick={goBack}>
                            ← Назад
                        </Button>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <Button size="large" onClick={() => router.back()}>
                        Отмена
                    </Button>
                    {currentStep < steps.length - 1 ? (
                        <Button type="primary" size="large" onClick={goNext}>
                            Далее →
                        </Button>
                    ) : (
                        <Button
                            type="primary" size="large"
                            onClick={handleSubmit}
                            loading={submitting}
                            disabled={!profileComplete || !selectedCustomer || !selectedCarrier}
                        >
                            Создать заявку
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
