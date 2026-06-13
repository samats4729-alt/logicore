'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Typography, Button, Form, Input, InputNumber, Select, DatePicker,
    message, Row, Col, Checkbox, Radio, Card, Modal, Divider
} from 'antd';
import {
    ArrowLeftOutlined, PlusOutlined, EnvironmentOutlined, FlagOutlined,
    DeleteOutlined
} from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface LocationState {
    city: string;
    address: string;
    id?: string;
}

interface Partner {
    id: string;
    name: string;
}

export default function CreateOrderPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const [createForm] = Form.useForm();
    const [quickPartnerForm] = Form.useForm();

    const [locations, setLocations] = useState<Location[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [forwarders, setForwarders] = useState<{ id: string; name: string }[]>([]);
    const [cargoCategories, setCargoCategories] = useState<any[]>([]);
    const [profileComplete, setProfileComplete] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [routePointsState, setRoutePointsState] = useState<Array<LocationState & { pointType: string; expectedDate?: string }>>([
        { city: '', address: '', pointType: 'PICKUP' },
        { city: '', address: '', pointType: 'DELIVERY' }
    ]);

    const [creatorRole, setCreatorRole] = useState<'CUSTOMER' | 'FORWARDER'>('CUSTOMER');
    const [isMarketplace, setIsMarketplace] = useState(false);
    const [showCustomerField, setShowCustomerField] = useState(false);
    const [showForwarderField, setShowForwarderField] = useState(true);
    const [appliedTariff, setAppliedTariff] = useState<any>(null);
    const [tariffLoading, setTariffLoading] = useState(false);

    // Quick partner modal
    const [quickPartnerModalOpen, setQuickPartnerModalOpen] = useState(false);
    const [quickPartnerLoading, setQuickPartnerLoading] = useState(false);

    // Form watches
    const createCustomerCompanyId = Form.useWatch('customerCompanyId', createForm);
    const createForwarderId = Form.useWatch('forwarderId', createForm);

    useEffect(() => {
        api.get('/company/profile-status').then(res => {
            setProfileComplete(res.data.isComplete);
        }).catch(() => {});
        fetchLocations();
        fetchCargoTypes();
        fetchPartners();
    }, []);

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
            const partnersList = partnersRes.data.filter((p: any) => p.isCarrier);
            const externalList = externalRes.data
                .filter((e: any) => e.isCarrier)
                .map((e: any) => ({ id: e.id, name: e.name }));
            const ownCompany = profileRes.data ? [{ id: profileRes.data.id, name: `${profileRes.data.name} (Моя компания)` }] : [];
            const combined = [...ownCompany, ...partnersList, ...externalList];
            setPartners(combined);
            setForwarders(combined);
        } catch { }
    };

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

    const getLocationOptions = (customerCompanyId?: string, executorCompanyId?: string) => {
        if (!locations || locations.length === 0) return [];
        const customerLocs = locations.filter(l => customerCompanyId && (l as any).companyId === customerCompanyId);
        const executorLocs = locations.filter(l => executorCompanyId && (l as any).companyId === executorCompanyId);
        const categorizedIds = new Set([...customerLocs.map(l => l.id), ...executorLocs.map(l => l.id)]);
        const otherLocs = locations.filter(l => !categorizedIds.has(l.id));
        const groups: Array<{ label: string; options: Location[] }> = [];
        const groupByCity = (locs: Location[], prefixLabel: string) => {
            const cityMap = new Map<string, Location[]>();
            const noCity: Location[] = [];
            locs.forEach(l => {
                if (l.city) { if (!cityMap.has(l.city)) cityMap.set(l.city, []); cityMap.get(l.city)!.push(l); }
                else { noCity.push(l); }
            });
            Array.from(cityMap.keys()).sort().forEach(city => {
                groups.push({ label: `${prefixLabel} (${city})`, options: cityMap.get(city)! });
            });
            if (noCity.length > 0) groups.push({ label: `${prefixLabel} (Без города)`, options: noCity });
        };
        if (customerLocs.length > 0) {
            const custName = partners.find(p => p.id === customerCompanyId)?.name || 'Заказчик';
            groupByCity(customerLocs, `Склады заказчика [${custName}]`);
        }
        if (executorLocs.length > 0) {
            const execName = partners.find(p => p.id === executorCompanyId)?.name || 'Исполнитель';
            groupByCity(executorLocs, `Склады исполнителя [${execName}]`);
        }
        if (otherLocs.length > 0) groups.push({ label: 'Все остальные адреса', options: otherLocs });
        return groups;
    };

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

    const handleCreateOrder = async (values: any) => {
        setSubmitting(true);
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
                    if (p.pointType === 'PICKUP') { message.error('Заполните адрес погрузки'); setSubmitting(false); return; }
                    if (p.pointType === 'DELIVERY') { message.error('Заполните адрес выгрузки'); setSubmitting(false); return; }
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
                setSubmitting(false);
                return;
            }

            const ov = { ...values };
            delete ov.pickupDate;
            delete ov.isMarketplace;

            if (creatorRole === 'CUSTOMER') {
                ov.customerCompanyId = user?.companyId;
                if (!showForwarderField) {
                    ov.forwarderId = null;
                    if (!isMarketplace) { ov.driverCost = null; }
                }
            } else {
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
            router.push('/company/orders');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} />
                <Title level={4} style={{ margin: 0 }}>Создать заявку</Title>
            </div>

            {!profileComplete && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8, fontSize: 13 }}>
                    ⚠️ Заполните профиль компании перед созданием заявок
                </div>
            )}

            <Form form={createForm} layout="vertical" onFinish={handleCreateOrder} disabled={!profileComplete}>
                {/* Role selector */}
                <Card size="small" style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13, color: '#333' }}>Ваша роль в этой сделке:</div>
                    <Radio.Group
                        value={creatorRole}
                        onChange={e => handleCreatorRoleChange(e.target.value)}
                        optionType="button"
                        buttonStyle="solid"
                        style={{ width: '100%', display: 'flex' }}
                    >
                        <Radio.Button value="CUSTOMER" style={{ flex: 1, textAlign: 'center' }}>Заказчик</Radio.Button>
                        <Radio.Button value="FORWARDER" style={{ flex: 1, textAlign: 'center' }}>Экспедитор</Radio.Button>
                    </Radio.Group>
                </Card>

                <Row gutter={24}>
                    {/* LEFT COLUMN — Route */}
                    <Col xs={24} md={12}>
                        <Card size="small" title="Маршрут" style={{ marginBottom: 16 }}>
                            <Form.Item name="pickupDate" label="Дата погрузки" rules={[{ required: true, message: 'Укажите дату' }]}>
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY HH:mm" showTime={{ format: 'HH:mm' }} placeholder="Дата и время" />
                            </Form.Item>
                            {routePointsState.map((pt, i) => (
                                <div key={i} style={{ padding: '8px 12px', background: pt.pointType === 'DELIVERY' ? '#f6ffed' : '#f0f5ff', borderRadius: 8, marginBottom: 12 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Select value={pt.pointType} onChange={val => { const newPts = [...routePointsState]; newPts[i].pointType = val; setRoutePointsState(newPts); }} size="small" style={{ width: 150, fontWeight: 600 }} variant="borderless">
                                            <Select.Option value="PICKUP"><EnvironmentOutlined style={{ color: '#1890ff', marginRight: 4 }} /> Погрузка</Select.Option>
                                            <Select.Option value="ADDITIONAL_PICKUP"><EnvironmentOutlined style={{ color: '#1890ff', marginRight: 4 }} /> Доп. погрузка</Select.Option>
                                            <Select.Option value="DELIVERY"><FlagOutlined style={{ color: '#52c41a', marginRight: 4 }} /> Выгрузка</Select.Option>
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
                                                if (loc) {
                                                    newPts[i] = { ...newPts[i], city: loc.city || '', address: loc.address, id: loc.id };
                                                    const firstPickup = newPts.find(p => p.pointType === 'PICKUP');
                                                    const lastDelivery = [...newPts].reverse().find(p => p.pointType === 'DELIVERY');
                                                    if (firstPickup?.city && lastDelivery?.city) {
                                                        lookupTariff(firstPickup.city, lastDelivery.city);
                                                    } else {
                                                        setAppliedTariff(null);
                                                    }
                                                }
                                            }
                                            setRoutePointsState(newPts);
                                        }}
                                    >
                                        {(() => {
                                            const activeCustomerCompanyId = creatorRole === 'CUSTOMER' ? user?.companyId : createCustomerCompanyId;
                                            const activeExecutorCompanyId = creatorRole === 'FORWARDER'
                                                ? (showForwarderField ? createForwarderId : user?.companyId)
                                                : (isMarketplace ? undefined : createForwarderId);
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
                            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => setRoutePointsState([...routePointsState, { city: '', address: '', pointType: 'ADDITIONAL_PICKUP' }])} style={{ width: '100%' }}>
                                Добавить точку
                            </Button>
                        </Card>
                    </Col>

                    {/* RIGHT COLUMN — Cargo & Conditions */}
                    <Col xs={24} md={12}>
                        <Card size="small" title="Груз и Условия" style={{ marginBottom: 16 }}>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="natureOfCargo" label="Характер груза" rules={[{ required: true }]}>
                                        <Select placeholder="Выберите..." showSearch optionFilterProp="children">
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
                            <Form.Item name="cargoDescription" label="Описание груза" style={{ marginBottom: 12 }}>
                                <TextArea rows={2} placeholder="Мебель, 20 коробок..." />
                            </Form.Item>
                            <Row gutter={12}>
                                <Col span={12}><Form.Item name="cargoWeight" label="Вес (кг)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
                                <Col span={12}><Form.Item name="cargoVolume" label="Объём (м³)"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item></Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="customerPrice" label="Сумма ₸"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
                                    {appliedTariff && <div style={{ marginTop: -12, marginBottom: 8, padding: '3px 6px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, fontSize: 11 }}>✅ Тариф ДС №{appliedTariff.agreement?.agreementNumber || '—'}</div>}
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="customerPriceType" label="Тип оплаты" initialValue="FIXED">
                                        <Select style={{ width: '100%' }}>
                                            <Select.Option value="FIXED">За рейс</Select.Option>
                                            <Select.Option value="PER_KM">За км</Select.Option>
                                            <Select.Option value="PER_TON">За тонну</Select.Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Card>

                        {/* Marketplace / Contractor options */}
                        <Card size="small" title="Контрагенты" style={{ marginBottom: 16 }}>
                            {creatorRole === 'CUSTOMER' && (
                                <Row style={{ marginBottom: 12 }}>
                                    <Col span={12}>
                                        <Checkbox
                                            checked={isMarketplace}
                                            onChange={e => {
                                                const val = e.target.checked;
                                                setIsMarketplace(val);
                                                if (val) { setShowForwarderField(false); createForm.setFieldsValue({ forwarderId: null }); }
                                                else { setShowForwarderField(true); createForm.setFieldsValue({ driverCost: null }); }
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
                                                if (val) { setIsMarketplace(false); }
                                                else { setIsMarketplace(true); createForm.setFieldsValue({ forwarderId: null, driverCost: null }); }
                                            }}
                                        >
                                            Назначить контрагента
                                        </Checkbox>
                                    </Col>
                                </Row>
                            )}

                            {creatorRole === 'FORWARDER' && (
                                <Row style={{ marginBottom: 12 }}>
                                    <Col span={24}>
                                        <Checkbox
                                            checked={showForwarderField}
                                            onChange={e => {
                                                const val = e.target.checked;
                                                setShowForwarderField(val);
                                                if (!val) { createForm.setFieldsValue({ forwarderId: null, driverCost: null }); }
                                            }}
                                        >
                                            Назначить исполнителя (субподряд)
                                        </Checkbox>
                                    </Col>
                                </Row>
                            )}

                            {showCustomerField && (
                                <Form.Item
                                    name="customerCompanyId"
                                    label="Заказчик"
                                    rules={[{ required: creatorRole === 'FORWARDER', message: 'Укажите компанию заказчика' }]}
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
                            )}

                            {(showForwarderField || isMarketplace) && (
                                <Row gutter={12} style={{ marginBottom: 12 }}>
                                    {!isMarketplace && (
                                        <Col span={creatorRole === 'CUSTOMER' ? 24 : 12}>
                                            <Form.Item
                                                name="forwarderId"
                                                label="Исполнитель"
                                                rules={[{ required: true, message: 'Выберите исполнителя' }]}
                                                style={{ marginBottom: 8 }}
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
                                    {creatorRole !== 'CUSTOMER' && (
                                        <Col span={isMarketplace ? 24 : 12}>
                                            <Form.Item name="driverCost" label="Ставка перевозчику (₸)">
                                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                                            </Form.Item>
                                        </Col>
                                    )}
                                </Row>
                            )}

                            <Form.Item name="requirements" label="Доп. требования" style={{ marginBottom: 0 }}>
                                <TextArea rows={2} placeholder="Ремни, коники..." />
                            </Form.Item>
                        </Card>
                    </Col>
                </Row>

                {/* Submit buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8, marginBottom: 24 }}>
                    <Button size="large" onClick={() => router.back()}>
                        Отмена
                    </Button>
                    <Button type="primary" size="large" htmlType="submit" loading={submitting} disabled={!profileComplete}>
                        Создать заявку
                    </Button>
                </div>
            </Form>

            {/* Quick Partner Modal */}
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
                            } catch (e) { }
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
