import { useEffect, useState } from 'react';
import {
    Modal, Form, Radio, Select, Button, Row, Col, Divider,
    Input, DatePicker, message, Steps, theme
} from 'antd';
import {
    CarOutlined, UserOutlined, FileTextOutlined, PlusOutlined,
    CheckCircleOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';

interface AssignDriverModalProps {
    open: boolean;
    onCancel: () => void;
    orderId: string;
    onSuccess: () => void;
    initialValues?: {
        driverId?: string;
        partnerId?: string;
        assignedDriverName?: string;
        assignedDriverPhone?: string;
        assignedDriverPlate?: string;
        assignedDriverTrailer?: string;
    };
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
    const [drivers, setDrivers] = useState<any[]>([]);
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

    const isCarrierExternal = carriers.find(c => c.id === selectedCarrierId)?.isExternal ?? false;

    // Load initial configuration
    useEffect(() => {
        if (open) {
            setCurrentStep(0);
            form.resetFields();
            setSelectedCarrierId('');
            setSelectedDriverId('');
            fetchCarriers();
            fetchOwnVehicles();

            if (initialValues) {
                const isOwn = !initialValues.partnerId;
                setTransportType(isOwn ? 'own' : 'carrier');
                
                form.setFieldsValue({
                    transportType: isOwn ? 'own' : 'carrier',
                    partnerId: initialValues.partnerId || undefined,
                });

                if (initialValues.partnerId) {
                    setSelectedCarrierId(initialValues.partnerId);
                }
            } else {
                setTransportType('own');
                form.setFieldsValue({ transportType: 'own' });
            }
        }
    }, [open, initialValues]);

    // Fetch drivers when company selection changes
    useEffect(() => {
        if (open) {
            const targetCompanyId = transportType === 'own' ? user?.companyId : selectedCarrierId;
            if (targetCompanyId) {
                fetchDrivers(targetCompanyId);
            } else {
                setDrivers([]);
            }
        }
    }, [transportType, selectedCarrierId, open]);

    const fetchCarriers = async () => {
        setCarriersLoading(true);
        try {
            const [partnersRes, externalRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
            ]);
            const regular = partnersRes.data.filter((p: any) => p.isCarrier).map((p: any) => ({ ...p, isExternal: false }));
            const external = externalRes.data.filter((e: any) => e.isCarrier).map((e: any) => ({ ...e, isExternal: true }));
            setCarriers([...regular, ...external]);
        } catch (error) {
            message.error('Ошибка загрузки перевозчиков');
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
            message.error('Ошибка загрузки автопарка');
        } finally {
            setVehiclesLoading(false);
        }
    };

    const fetchDrivers = async (companyId: string) => {
        setDriversLoading(true);
        try {
            const response = await api.get('/company/drivers', { params: { companyId } });
            setDrivers(response.data);

            // If we have initial values and are in initial load, pre-populate driver details
            if (initialValues?.driverId && drivers.length === 0) {
                const found = response.data.find((d: any) => d.id === initialValues.driverId);
                if (found) {
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
                        vehiclePlate: found.vehiclePlate,
                        trailerNumber: found.trailerNumber,
                        docType: found.docType,
                        docNumber: found.docNumber,
                        docIssuedAt: found.docIssuedAt ? dayjs(found.docIssuedAt) : undefined,
                        docExpiresAt: found.docExpiresAt ? dayjs(found.docExpiresAt) : undefined,
                        docIssuedBy: found.docIssuedBy,
                    });
                }
            } else if (initialValues && !initialValues.driverId && initialValues.assignedDriverName) {
                // Manual data pre-population
                setSelectedDriverId('__NEW_DRIVER__');
                form.setFieldsValue({
                    driverId: '__NEW_DRIVER__',
                    lastName: initialValues.assignedDriverName.split(' ')[0] || '',
                    firstName: initialValues.assignedDriverName.split(' ')[1] || '',
                    middleName: initialValues.assignedDriverName.split(' ').slice(2).join(' ') || '',
                    phone: initialValues.assignedDriverPhone,
                    vehiclePlate: initialValues.assignedDriverPlate,
                    trailerNumber: initialValues.assignedDriverTrailer,
                });
            }
        } catch (error) {
            message.error('Ошибка загрузки водителей');
        } finally {
            setDriversLoading(false);
        }
    };

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

    const handleCreateQuickCarrier = async (values: any) => {
        setQuickCarrierLoading(true);
        try {
            const res = await api.post('/external-companies', {
                ...values,
                isCustomer: false,
                isCarrier: true,
                type: 'FORWARDER'
            });
            message.success('Перевозчик успешно добавлен');
            setQuickCarrierModalOpen(false);
            quickCarrierForm.resetFields();
            await fetchCarriers();
            setSelectedCarrierId(res.data.id);
            form.setFieldsValue({ partnerId: res.data.id });
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания перевозчика');
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
                if (!isCarrierExternal) {
                    // Carrier is on platform, assign driver is not required, proceed to submit
                    handleAssignSubmit();
                } else {
                    setCurrentStep(2);
                }
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

                if (selectedDriverId === '__NEW_DRIVER__' || !selectedDriverId) {
                    const res = await api.post('/company/drivers', {
                        ...driverData,
                        companyId: targetCompanyId,
                    });
                    finalDriverId = res.data.id;
                    if (res.data.alreadyExists) {
                        message.info('Использован существующий водитель');
                    }
                } else {
                    // Update details for our own drivers, ignore/skip for carrier drivers if forbidden
                    if (transportType === 'own') {
                        try {
                            await api.put(`/company/drivers/${selectedDriverId}`, driverData);
                        } catch (err) {
                            // Non-critical update failure
                        }
                    }
                }
            }

            const payload = {
                driverId: (transportType === 'own' || isCarrierExternal) ? finalDriverId : null,
                partnerId: transportType === 'own' ? null : selectedCarrierId,
                assignedDriverName: (transportType === 'own' || isCarrierExternal) ? undefined : null,
                assignedDriverPhone: (transportType === 'own' || isCarrierExternal) ? undefined : null,
                assignedDriverPlate: (transportType === 'own' || isCarrierExternal) ? undefined : null,
                assignedDriverTrailer: (transportType === 'own' || isCarrierExternal) ? undefined : null,
            };

            await api.put(`/company/orders/${orderId}/assign-driver`, payload);
            message.success('Водитель успешно назначен');
            onSuccess();
            onCancel();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка при сохранении назначения');
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
                                size="large"
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
                        {isOwn && vehicles.length > 0 && (
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

                        <Form.Item name="driverId" label="Водитель" rules={[{ required: true, message: 'Выберите водителя' }]}>
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
                                        <Form.Item name="lastName" label="Фамилия" rules={[{ required: true, message: 'Введите фамилию' }]}>
                                            <Input size="large" placeholder="Иванов" />
                                        </Form.Item>
                                    </Col>
                                    <Col span={8}>
                                        <Form.Item name="firstName" label="Имя" rules={[{ required: true, message: 'Введите имя' }]}>
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
                                        <Form.Item name="phone" label="Телефон" rules={[{ required: true, message: 'Введите телефон' }]}>
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
                                        <Form.Item name="vehiclePlate" label="Госномер автомобиля" rules={[{ required: true, message: 'Введите госномер' }]}>
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
                footer={[
                    currentStep > 0 && (
                        <Button key="back" size="large" onClick={handlePrev}>
                            Назад
                        </Button>
                    ),
                    (currentStep === 0 || (currentStep === 1 && isCarrierExternal)) ? (
                        <Button key="next" type="primary" size="large" onClick={handleNext}>
                            Далее
                        </Button>
                    ) : (
                        <Button key="submit" type="primary" size="large" loading={loading} onClick={handleAssignSubmit}>
                            Назначить
                        </Button>
                    )
                ]}
                width={currentStep === 2 ? 700 : 500}
                style={{ top: 40 }}
            >
                <Steps
                    size="small"
                    current={currentStep}
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

                <Form form={form} layout="vertical">
                    {renderStepContent()}
                </Form>

                {currentStep === 1 && !isCarrierExternal && selectedCarrierId && (
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
                            try {
                                const res = await api.get(`/auth/company-lookup/${changedValues.bin}`);
                                if (res.data) {
                                    const updateObj: any = {};
                                    if (res.data.name) updateObj.name = res.data.name;
                                    if (res.data.phone) updateObj.phone = res.data.phone;
                                    if (res.data.email) updateObj.email = res.data.email;
                                    quickCarrierForm.setFieldsValue(updateObj);
                                    message.success('Реквизиты подтянуты');
                                }
                            } catch { }
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
