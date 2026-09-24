import { useEffect, useRef, useState } from 'react';
import { Modal, Form, Radio, Select, Button, Row, Col, Divider, Input, Steps, Spin, theme } from 'antd';
import {
    CarOutlined, UserOutlined, FileTextOutlined, PlusOutlined,
    CheckCircleOutlined
} from '@ant-design/icons';
import { Info } from 'lucide-react';
import { api } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { lookupCompanyByBin, companyFieldsFromLookup } from '@/lib/company-lookup';
import { DateField } from '@/components/ui/DateField';
import DriverPoolSelect, { NEW_DRIVER } from '@/components/orders/DriverPoolSelect';
import { DRIVER_CARD_FIELDS, alreadyExistsMessage, fetchDriverPool, tripVehicle, type PoolDriver } from '@/lib/driver-pool';

interface AssignDriverModalProps {
    open: boolean;
    onCancel: () => void;
    orderId: string;
    onSuccess: () => void;
    initialValues?: {
        driverId?: string;
        partnerId?: string;
        /** Стороны заявки: по ним окно понимает, кто везёт рейс. */
        forwarderId?: string;
        subForwarderId?: string;
        assignedDriverName?: string;
        assignedDriverPhone?: string;
        assignedDriverPlate?: string;
        assignedDriverTrailer?: string;
    };
}

type Старт = {
    transportType: 'own' | 'carrier';
    carrierId: string;
    step: number;
    /** Кто везёт — взято из заявки, а не выбрано в окне. */
    изЗаявки: boolean;
};

/**
 * С какого шага открыть окно.
 *
 * Перевозчика выбирают ещё при заведении заявки. Раньше окно всё равно
 * начинало с вопроса «свой транспорт или перевозчик» — с ответом «свой» по
 * умолчанию, потому что смотрело только на поле, которое заполняет само, —
 * и просило выбрать перевозчика заново. Теперь, если из заявки понятно, кто
 * везёт, окно сразу открывается на выборе водителя; вернуться к перевозчику
 * можно кнопкой «Назад».
 *
 * Кто везёт — глазами нашей компании, по порядку:
 * - перевозчик, которого уже выбирали в этом окне (`partnerId`);
 * - мы сами, если рейс передали нам (мы в заявке субэкспедитор или партнёр);
 * - перевозчик, которому рейс передали мы (`subForwarderId`);
 * - экспедитор, если мы в заявке заказчик (`forwarderId`);
 * - мы сами, если мы экспедитор без перевозчика.
 *
 * Не понять (биржа, чужая организация холдинга) — как раньше, с первого
 * вопроса.
 */
function стартОкна(
    iv: AssignDriverModalProps['initialValues'],
    мы: string | undefined,
    перевозчики: Array<{ id: string; isExternal: boolean }>,
): Старт {
    const { partnerId, subForwarderId, forwarderId } = iv ?? {};
    let перевозчик = '';
    let сами = false;
    if (partnerId && partnerId !== мы) перевозчик = partnerId;
    else if (мы && (partnerId === мы || subForwarderId === мы)) сами = true;
    else if (subForwarderId) перевозчик = subForwarderId;
    else if (forwarderId && forwarderId !== мы) перевозчик = forwarderId;
    else if (мы && forwarderId === мы) сами = true;

    if (сами) return { transportType: 'own', carrierId: '', step: 2, изЗаявки: true };

    const известный = перевозчики.find((c) => c.id === перевозчик);
    if (известный) {
        // Внешнему водителя ставим мы. Перевозчик на платформе назначает
        // его сам — окно так и скажет на шаге перевозчика.
        return { transportType: 'carrier', carrierId: перевозчик, step: известный.isExternal ? 2 : 1, изЗаявки: true };
    }
    // Перевозчика заявки нет в нашем списке — не подставляем его: в поле
    // выбора он показался бы голым кодом, а назначить на него всё равно
    // нельзя.
    return { transportType: partnerId ? 'carrier' : 'own', carrierId: '', step: 0, изЗаявки: false };
}

export default function AssignDriverModal({
    open,
    onCancel,
    orderId,
    onSuccess,
    initialValues
}: AssignDriverModalProps) {
    const { token } = theme.useToken();
    const { user } = useAuthStore();
    const [form] = Form.useForm();
    const [quickCarrierForm] = Form.useForm();

    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);

    // Data lists
    const [carriers, setCarriers] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<PoolDriver[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);

    // Loading states
    const [carriersLoading, setCarriersLoading] = useState(false);
    const [driversLoading, setDriversLoading] = useState(false);
    const [vehiclesLoading, setVehiclesLoading] = useState(false);

    // Selections
    const [transportType, setTransportType] = useState<'own' | 'carrier'>('own');
    const [selectedCarrierId, setSelectedCarrierId] = useState<string>('');
    const [selectedDriverId, setSelectedDriverId] = useState<string>('');
    const [quickCarrierModalOpen, setQuickCarrierModalOpen] = useState(false);
    const [quickCarrierLoading, setQuickCarrierLoading] = useState(false);
    // Перевозчик, записанный в заявке. И готово ли окно: с какого шага его
    // открыть, понятно только после загрузки перевозчиков.
    const [перевозчикЗаявки, setПеревозчикЗаявки] = useState('');
    const [готово, setГотово] = useState(false);

    const isCarrierExternal = carriers.find(c => c.id === selectedCarrierId)?.isExternal ?? false;
    // Перевозчик на платформе назначает водителя сам: в окне назначать нечего.
    const carrierOnPlatform = !!selectedCarrierId && carriers.some(c => c.id === selectedCarrierId && !c.isExternal);

    /**
     * Заявка — такой, какой её передали при открытии окна.
     *
     * Страница передаёт `initialValues` новым объектом на каждую
     * перерисовку, а список заявок перерисовывается сам раз в минуту. Окно
     * собиралось заново на каждую — и заполненная форма сбрасывалась на
     * первый шаг. Теперь окно собирается один раз, при открытии.
     */
    const исходные = useRef(initialValues);
    исходные.current = initialValues;
    // Номер открытия: ответ сервера, пришедший после закрытия окна, не
    // должен заполнить форму следующего.
    const открытие = useRef(0);

    useEffect(() => {
        if (!open) return;
        const моё = ++открытие.current;
        const iv = исходные.current;
        setГотово(false);
        setCurrentStep(0);
        form.resetFields();
        setSelectedCarrierId('');
        setSelectedDriverId('');
        setПеревозчикЗаявки('');
        fetchOwnVehicles();
        // Водители — общей базой компании: свои и всех своих перевозчиков.
        // Тот, кто вчера ехал от другого ИП, сегодня может ехать от этого, и
        // список выбранного перевозчика его не показал бы. Порядок — у
        // `DriverPoolSelect`.
        fetchDrivers(моё);
        fetchCarriers().then((список) => {
            if (моё !== открытие.current) return;
            const старт = стартОкна(iv, user?.companyId, список);
            setTransportType(старт.transportType);
            setSelectedCarrierId(старт.carrierId);
            setПеревозчикЗаявки(старт.изЗаявки ? старт.carrierId : '');
            form.setFieldsValue({ transportType: старт.transportType, partnerId: старт.carrierId || undefined });
            setCurrentStep(старт.step);
            setГотово(true);
        });
        return () => { открытие.current++; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const fetchCarriers = async (): Promise<any[]> => {
        setCarriersLoading(true);
        try {
            const [partnersRes, externalRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
            ]);
            const regular = partnersRes.data.filter((p: any) => p.isCarrier).map((p: any) => ({ ...p, isExternal: false }));
            const external = externalRes.data.filter((e: any) => e.isCarrier).map((e: any) => ({ ...e, isExternal: true }));
            const список = [...regular, ...external];
            setCarriers(список);
            return список;
        } catch (error) {
            toast.error('Ошибка загрузки перевозчиков');
            return [];
        } finally {
            setCarriersLoading(false);
        }
    };

    const fetchOwnVehicles = async () => {
        setVehiclesLoading(true);
        try {
            const response = await api.get('/company/vehicles');
            setVehicles(response.data);
        } catch (error) {
            toast.error('Ошибка загрузки автопарка');
        } finally {
            setVehiclesLoading(false);
        }
    };

    /**
     * Машина из заявки — если окно открыли на уже назначенном водителе.
     *
     * Машина рейса живёт в заявке: водитель мог с тех пор пересесть на другую,
     * и в окне должна стоять та, на которой едут в этом рейсе, а не последняя
     * из его карточки.
     */
    const машинаРейса = (driverId: string) => {
        const iv = исходные.current;
        return iv?.driverId === driverId && iv.assignedDriverPlate
            ? { plate: iv.assignedDriverPlate, trailer: iv.assignedDriverTrailer ?? '' }
            : null;
    };

    const fetchDrivers = async (моё: number) => {
        const initialValues = исходные.current;
        setDriversLoading(true);
        try {
            const pool = await fetchDriverPool();
            if (моё !== открытие.current) return;
            setDrivers(pool);

            // If we have initial values and are in initial load, pre-populate driver details
            if (initialValues?.driverId) {
                const found = pool.find((d) => d.id === initialValues.driverId);
                if (found) {
                    const рейс = машинаРейса(found.id);
                    setSelectedDriverId(found.id);
                    form.setFieldsValue({
                        driverId: found.id,
                        firstName: found.firstName,
                        lastName: found.lastName,
                        middleName: found.middleName,
                        phone: found.phone,
                        iin: found.iin,
                        vehicleType: found.vehicleType,
                        vehicleModel: found.vehicleModel,
                        vehiclePlate: рейс ? рейс.plate : found.vehiclePlate,
                        trailerNumber: рейс ? рейс.trailer : found.trailerNumber,
                        docType: found.docType,
                        docNumber: found.docNumber,
                        docIssuedAt: found.docIssuedAt ? dayjs(found.docIssuedAt) : undefined,
                        docExpiresAt: found.docExpiresAt ? dayjs(found.docExpiresAt) : undefined,
                        docIssuedBy: found.docIssuedBy,
                    });
                }
            } else if (initialValues && !initialValues.driverId && initialValues.assignedDriverName) {
                // Manual data pre-population
                setSelectedDriverId(NEW_DRIVER);
                form.setFieldsValue({
                    driverId: NEW_DRIVER,
                    lastName: initialValues.assignedDriverName.split(' ')[0] || '',
                    firstName: initialValues.assignedDriverName.split(' ')[1] || '',
                    middleName: initialValues.assignedDriverName.split(' ').slice(2).join(' ') || '',
                    phone: initialValues.assignedDriverPhone,
                    vehiclePlate: initialValues.assignedDriverPlate,
                    trailerNumber: initialValues.assignedDriverTrailer,
                });
            }
        } catch (error) {
            toast.error('Ошибка загрузки водителей');
        } finally {
            setDriversLoading(false);
        }
    };

    const handleDriverSelect = (value: string) => {
        setSelectedDriverId(value);
        if (value === NEW_DRIVER) {
            form.setFieldsValue({
                firstName: '', lastName: '', middleName: '', phone: '', iin: '',
                vehicleType: undefined, vehicleModel: '', vehiclePlate: '', trailerNumber: '',
                docType: undefined, docNumber: '', docIssuedAt: null, docExpiresAt: null, docIssuedBy: ''
            });
        } else {
            const d = drivers.find(drv => drv.id === value);
            if (d) {
                const рейс = машинаРейса(d.id);
                form.setFieldsValue({
                    firstName: d.firstName,
                    lastName: d.lastName,
                    middleName: d.middleName || '',
                    phone: d.phone,
                    iin: d.iin || '',
                    vehicleType: d.vehicleType || undefined,
                    vehicleModel: d.vehicleModel || '',
                    vehiclePlate: (рейс ? рейс.plate : d.vehiclePlate) || '',
                    trailerNumber: (рейс ? рейс.trailer : d.trailerNumber) || '',
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

    const handleCreateQuickCarrier = async (values: any) => {
        setQuickCarrierLoading(true);
        try {
            const res = await api.post('/external-companies', {
                ...values,
                isCustomer: false,
                isCarrier: true,
                type: 'FORWARDER'
            });
            toast.success('Перевозчик успешно добавлен');
            setQuickCarrierModalOpen(false);
            quickCarrierForm.resetFields();
            await fetchCarriers();
            setSelectedCarrierId(res.data.id);
            form.setFieldsValue({ partnerId: res.data.id });
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка создания перевозчика');
        } finally {
            setQuickCarrierLoading(false);
        }
    };

    const handleNext = async () => {
        try {
            if (currentStep === 0) {
                await form.validateFields(['transportType']);
                if (transportType === 'own') {
                    setCurrentStep(2); // Skip Step 2
                } else {
                    setCurrentStep(1);
                }
            } else if (currentStep === 1) {
                await form.validateFields(['partnerId']);
                // Перевозчику на платформе «Далее» не показывается — водителя
                // он назначает сам (см. кнопку «Понятно»). Раньше здесь
                // уходил запрос без водителя, и сервер отвечал ошибкой.
                if (isCarrierExternal) setCurrentStep(2);
            }
        } catch (err) {
            // Form validation failed
        }
    };

    const handlePrev = () => {
        if (currentStep === 2 && transportType === 'own') {
            setCurrentStep(0);
        } else {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleAssignSubmit = async () => {
        setLoading(true);
        try {
            const values = await form.validateFields();
            const targetCompanyId = transportType === 'own' ? user?.companyId : selectedCarrierId;

            let finalDriverId = selectedDriverId;

            if (transportType === 'own' || isCarrierExternal) {
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

                if (selectedDriverId === NEW_DRIVER || !selectedDriverId) {
                    const res = await api.post('/company/drivers', {
                        ...driverData,
                        companyId: targetCompanyId,
                    });
                    finalDriverId = res.data.id;
                    if (res.data.alreadyExists) {
                        toast.info(alreadyExistsMessage(res.data));
                    }
                } else {
                    // Правку данных водителя сохраняем в его карточку — у любого
                    // водителя базы, а не только у штатного: раньше у водителя
                    // перевозчика исправленный номер молча терялся. И только
                    // если поля правили: открыть окно и нажать «Назначить» —
                    // не повод переписывать карточку.
                    if (drivers.some((d) => d.id === selectedDriverId) && form.isFieldsTouched([...DRIVER_CARD_FIELDS])) {
                        try {
                            await api.put(`/company/drivers/${selectedDriverId}`, driverData);
                        } catch (err: any) {
                            // Молчать здесь нельзя. Человек правит номер машины
                            // или документы водителя, видит «водитель назначен»
                            // и уходит — а правка не сохранилась. Назначение при
                            // этом состоялось, поэтому не ошибка, а
                            // предупреждение: рейс поехал, данные — нет.
                            toast.warning(
                                err?.response?.data?.message
                                || 'Водитель назначен, но его данные сохранить не удалось',
                            );
                        }
                    }
                }
            }

            const свойВодитель = transportType === 'own' || isCarrierExternal;
            // Рейс, который передали нам партнёром, везём сами — партнёром и
            // остаёмся. Раньше «свой транспорт» стирал партнёра, и рейс
            // выпадал из заявок нашей же компании.
            const мыПартнёр = !!user?.companyId && исходные.current?.partnerId === user.companyId;
            const payload = {
                // Машина этого рейса — в заявку: у каждого ИП своя, и
                // доверенность должна показать ту, на которой едут сейчас.
                ...(свойВодитель && finalDriverId ? tripVehicle(values) : {}),
                driverId: свойВодитель ? finalDriverId : null,
                partnerId: transportType === 'own' ? (мыПартнёр ? user?.companyId : null) : selectedCarrierId,
                assignedDriverName: свойВодитель ? undefined : null,
                assignedDriverPhone: свойВодитель ? undefined : null,
                assignedDriverPlate: свойВодитель ? undefined : null,
                assignedDriverTrailer: свойВодитель ? undefined : null,
            };

            await api.put(`/company/orders/${orderId}/assign-driver`, payload);
            toast.success('Водитель успешно назначен');
            onSuccess();
            onCancel();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка при сохранении назначения');
        } finally {
            setLoading(false);
        }
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 0:
                return (
                    <div style={{ padding: '24px 0' }}>
                        <Form.Item name="transportType" label="Кто выполняет перевозку?" rules={[{ required: true }]}>
                            <Radio.Group
                                size="large"
                                style={{ width: '100%' }}
                                onChange={(e) => setTransportType(e.target.value)}
                            >
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Radio.Button value="own" style={{ width: '100%', height: 100, borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                                            <CarOutlined style={{ fontSize: 24 }} />
                                            <span>Свой транспорт</span>
                                        </Radio.Button>
                                    </Col>
                                    <Col span={12}>
                                        <Radio.Button value="carrier" style={{ width: '100%', height: 100, borderRadius: 8, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                                            <UserOutlined style={{ fontSize: 24 }} />
                                            <span>Передаю перевозчику</span>
                                        </Radio.Button>
                                    </Col>
                                </Row>
                            </Radio.Group>
                        </Form.Item>
                    </div>
                );
            case 1:
                return (
                    <div style={{ padding: '24px 0' }}>
                        <Form.Item name="partnerId" label="Выберите перевозчика" rules={[{ required: true, message: 'Укажите перевозчика' }]}>
                            <Select
                                placeholder="Название компании перевозчика"
                                loading={carriersLoading}
                                onChange={(val) => {
                                    setSelectedCarrierId(val);
                                    setSelectedDriverId('');
                                }}
                                options={carriers.map(c => ({
                                    label: `${c.name} ${c.isExternal ? '(внешний)' : '(на платформе)'}`,
                                    value: c.id
                                }))}
                                showSearch
                                filterOption={(input, option) =>
                                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                            />
                        </Form.Item>
                        <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={() => setQuickCarrierModalOpen(true)}
                            size="large"
                            block
                        >
                            Новый перевозчик
                        </Button>
                    </div>
                );
            case 2:
                const isOwn = transportType === 'own';
                return (
                    <div style={{ padding: '12px 0' }}>
                        {/* За кого ставим водителя. Шаги с перевозчиком окно
                            могло пропустить, взяв его из заявки, — здесь видно,
                            кто это; сменить можно кнопкой «Назад». */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 12, fontSize: 13 }}>
                            <span style={{ color: token.colorTextSecondary }}>Кто везёт:</span>
                            <b>{isOwn ? 'свой транспорт' : (carriers.find(c => c.id === selectedCarrierId)?.name || '—')}</b>
                        </div>

                        {isOwn && vehicles.length > 0 && (
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

                        {/* Вся база водителей, а не только водители этого ИП:
                            сверху — кто уже ездил за него, ниже — остальные. */}
                        <Form.Item name="driverId" label="Водитель" rules={[{ required: true, message: 'Выберите водителя' }]}>
                            <DriverPoolSelect
                                drivers={drivers}
                                carrierId={transportType === 'own' ? (user?.companyId ?? null) : selectedCarrierId}
                                ownTransport={transportType === 'own'}
                                loading={driversLoading}
                                onChange={handleDriverSelect}
                            />
                        </Form.Item>

                        {selectedDriverId && (
                            <div>
                                <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Данные водителя</Divider>
                                <Row gutter={12}>
                                    <Col span={8}>
                                        <Form.Item name="lastName" label="Фамилия" rules={[{ required: true, message: 'Введите фамилию' }]}>
                                            <Input placeholder="Иванов" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={8}>
                                        <Form.Item name="firstName" label="Имя" rules={[{ required: true, message: 'Введите имя' }]}>
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
                                        <Form.Item name="phone" label="Телефон" rules={[{ required: true, message: 'Введите телефон' }]}>
                                            <Input placeholder="+77001234567" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item name="iin" label="ИИН">
                                            <Input placeholder="123456789012" maxLength={12} />
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
                                            <DateField style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={8}>
                                        <Form.Item name="docExpiresAt" label="Срок действия">
                                            <DateField style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={8}>
                                        <Form.Item name="docIssuedBy" label="Кем выдан">
                                            <Input placeholder="МВД РК" />
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
                                        <Form.Item name="vehiclePlate" label="Госномер автомобиля" rules={[{ required: true, message: 'Введите госномер' }]}>
                                            <Input placeholder="123 ABC 01" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item name="trailerNumber" label="Госномер прицепа">
                                            <Input placeholder="1234 XX 01" />
                                        </Form.Item>
                                    </Col>
                                </Row>

                            </div>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    const getStepTitle = () => {
        if (transportType === 'own') {
            return currentStep === 0 ? 'Тип транспорта' : 'Выбор водителя';
        }
        return currentStep === 0 ? 'Тип транспорта' : currentStep === 1 ? 'Выбор перевозчика' : 'Выбор водителя';
    };

    return (
        <>
            <Modal
                title="Назначить перевозчика и водителя"
                open={open}
                onCancel={onCancel}
                footer={готово ? [
                    currentStep > 0 && (
                        <Button key="back" size="large" onClick={handlePrev}>
                            Назад
                        </Button>
                    ),
                    currentStep === 1 && carrierOnPlatform ? (
                        // Водителя перевозчик на платформе назначит сам —
                        // сохранять здесь нечего.
                        <Button key="ok" type="primary" size="large" onClick={onCancel}>
                            Понятно
                        </Button>
                    ) : currentStep < 2 ? (
                        <Button key="next" type="primary" size="large" onClick={handleNext}>
                            Далее
                        </Button>
                    ) : (
                        <Button key="submit" type="primary" size="large" loading={loading} onClick={handleAssignSubmit}>
                            Назначить
                        </Button>
                    )
                ] : null}
                width={currentStep === 2 || !готово ? 700 : 500}
                style={{ top: 40 }}
            >
                {готово && (
                    <Steps
                        size="small"
                        // Со своим транспортом шагов два, а номер у шага
                        // водителя тот же, что с перевозчиком, — третий.
                        current={transportType === 'own' && currentStep === 2 ? 1 : currentStep}
                        items={
                            transportType === 'own' ? [
                                { title: 'Тип транспорта' },
                                { title: 'Водитель & ТС' }
                            ] : [
                                { title: 'Тип транспорта' },
                                { title: 'Перевозчик' },
                                { title: 'Водитель & ТС' }
                            ]
                        }
                        style={{ marginBottom: 20 }}
                    />
                )}

                <Form form={form} layout="vertical">
                    {готово ? renderStepContent() : (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                            <Spin />
                        </div>
                    )}
                </Form>

                {готово && currentStep === 1 && carrierOnPlatform && (
                    selectedCarrierId === перевозчикЗаявки ? (
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
                    ) : (
                        // Другой перевозчик на платформе: в этом окне рейс ему
                        // не передать — раньше «Назначить» здесь заканчивалось
                        // ошибкой сервера. Говорим, где это делается.
                        <div style={{
                            padding: '14px 16px',
                            background: token.colorFillAlter,
                            border: `1px solid ${token.colorBorderSecondary}`,
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            marginTop: 16,
                            fontSize: 13,
                            color: token.colorText,
                        }}>
                            <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                            <div>
                                Этот перевозчик работает на платформе и назначает водителя сам.
                                Чтобы передать ему рейс, смените перевозчика в самой заявке — кнопкой «Редактировать».
                            </div>
                        </div>
                    )
                )}
            </Modal>

            {/* Quick Carrier Add Modal */}
            <Modal
                title="Новый перевозчик"
                open={quickCarrierModalOpen}
                onCancel={() => {
                    setQuickCarrierModalOpen(false);
                    quickCarrierForm.resetFields();
                }}
                onOk={() => quickCarrierForm.submit()}
                confirmLoading={quickCarrierLoading}
                okText="Создать"
                cancelText="Отмена"
                width={480}
            >
                <Form
                    form={quickCarrierForm}
                    layout="vertical"
                    onFinish={handleCreateQuickCarrier}
                    onValuesChange={async (changedValues) => {
                        if (changedValues.bin && /^\d{12}$/.test(changedValues.bin)) {
                            const found = await lookupCompanyByBin(changedValues.bin);
                            if (found) quickCarrierForm.setFieldsValue(companyFieldsFromLookup(found));
                        }
                    }}
                >
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="ИП/ТОО Перевозчик" />
                    </Form.Item>
                    <Form.Item
                        name="bin" label="БИН/ИИН"
                        rules={[
                            { required: true, message: 'Введите БИН/ИИН' },
                            { pattern: /^\d{12}$/, message: 'Должен состоять из 12 цифр' }
                        ]}
                    >
                        <Input placeholder="123456789012" maxLength={12} />
                    </Form.Item>
                    <Form.Item name="phone" label="Телефон">
                        <Input placeholder="+77001234567" />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input placeholder="carrier@example.com" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}
