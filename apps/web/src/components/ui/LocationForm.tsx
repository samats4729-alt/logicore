'use client';

import { useEffect, useState } from 'react';
import {
    Form, Input, InputNumber, Row, Col, Select, Typography, App, Button, FormInstance, Radio
} from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import dynamic from 'next/dynamic';
import AddressAutocomplete from './AddressAutocomplete';

const MapPicker = dynamic(() => import('./MapPicker'), {
    ssr: false,
    loading: () => <div style={{ height: 400, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Загрузка карты...</div>
});

const { Text } = Typography;
const { Option } = Select;

export interface LocationFormProps {
    form: FormInstance;
    onFinish: (values: any) => Promise<void> | void;
    editingLocation?: Location | null;
    defaultCompanyId?: string;
    showCompanySelect?: boolean;
    customerCompany?: { id: string; name: string };
    carrierCompany?: { id: string; name: string };
}

export default function LocationForm({
    form,
    onFinish,
    editingLocation,
    defaultCompanyId,
    showCompanySelect = true,
    customerCompany,
    carrierCompany
}: LocationFormProps) {
    const { message } = App.useApp();

    // Coordinates managed manually to sync with Map
    const [lat, setLat] = useState<number | undefined>();
    const [lng, setLng] = useState<number | undefined>();
    const [addressValue, setAddressValue] = useState('');

    // Город определяется автоматически из ответа 2ГИС (нужен для тарифов и подписей маршрута)
    const [city, setCity] = useState<string | undefined>(undefined);

    // Companies/Partners for linking
    const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
    const [companiesLoading, setCompaniesLoading] = useState(false);
    const [isFetchingAddress, setIsFetchingAddress] = useState(false);

    useEffect(() => {
        if (showCompanySelect) {
            fetchCompanies();
        }
    }, [showCompanySelect]);

    useEffect(() => {
        if (editingLocation) {
            setAddressValue(editingLocation.address || '');
            setLat(editingLocation.latitude);
            setLng(editingLocation.longitude);
            form.setFieldsValue({
                address: editingLocation.address,
                latitude: editingLocation.latitude,
                longitude: editingLocation.longitude,
                name: editingLocation.name,
                contactName: editingLocation.contactName,
                contactPhone: editingLocation.contactPhone,
                emails: editingLocation.emails ? editingLocation.emails.split(',').map((e: string) => e.trim()).filter(Boolean) : [],
                companyId: editingLocation.companyId || undefined
            });

            setCity(editingLocation.city || undefined);
        } else {
            setAddressValue('');
            setLat(undefined);
            setLng(undefined);
            setCity(undefined);
            form.resetFields();
            if (defaultCompanyId) {
                form.setFieldsValue({ companyId: defaultCompanyId });
            }
            form.setFieldsValue({ bindingType: 'none' });
        }
    }, [editingLocation, defaultCompanyId]);

    const fetchCompanies = async () => {
        setCompaniesLoading(true);
        try {
            const [partnersRes, externalRes, profileRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
                api.get('/company/profile'),
            ]);
            const partnersList = partnersRes.data;
            const externalList = externalRes.data.map((e: any) => ({
                id: e.id,
                name: e.name,
            }));
            const ownCompany = profileRes.data ? [{ id: profileRes.data.id, name: `${profileRes.data.name} (Моя компания)` }] : [];
            const combined = [...ownCompany, ...partnersList, ...externalList];

            // Deduplicate
            const seen = new Set();
            const unique = combined.filter(c => {
                if (!c.id) return false;
                if (seen.has(c.id)) return false;
                seen.add(c.id);
                return true;
            });
            setCompanies(unique);
        } catch (e) {
            console.error('Failed to fetch companies', e);
        } finally {
            setCompaniesLoading(false);
        }
    };

    const handleAddressSelect = (address: string, latitude: number, longitude: number) => {
        setAddressValue(address);
        setLat(latitude);
        setLng(longitude);
        form.setFieldsValue({ address, latitude, longitude });

        // full_name у 2ГИС начинается с города: «Алматы, Сатпаева, 90/1»
        const cityCandidate = address.includes(',') ? address.split(',')[0].trim() : '';
        if (cityCandidate) setCity(cityCandidate);
    };

    const handleMapSelect = async (latitude: number, longitude: number, pickedName?: string) => {
        setLat(latitude);
        setLng(longitude);
        form.setFieldsValue({ latitude, longitude });

        if (pickedName) {
            setAddressValue(pickedName);
            form.setFieldsValue({ address: pickedName });
            message.success({ content: `Выбрано: ${pickedName}`, key: 'geo' });
            return;
        }

        const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        setAddressValue(coords);
        form.setFieldsValue({ address: coords });
        message.info({ content: 'Точка выбрана. Нажмите "Определить адрес", если нужно.', key: 'geo' });
    };

    const handleManualGeocode = async () => {
        if (!lat || !lng) return;

        setIsFetchingAddress(true);
        try {
            // Обратный геокодинг через наш API (/geo/reverse) с кэшем
            const res = await api.get('/geo/reverse', { params: { lat, lon: lng } });
            if (res.data?.configured === false) {
                message.warning('Геокодер не настроен: задайте DGIS_API_KEY на api-сервисе');
                return;
            }
            const data2gis = { result: { items: res.data?.items || [] } };

            let finalName = '';
            if (data2gis && data2gis.result && data2gis.result.items && data2gis.result.items.length > 0) {
                const bestItem = data2gis.result.items[0];
                if (bestItem.building_name) {
                    finalName = bestItem.address_name ? `${bestItem.building_name} (${bestItem.address_name})` : bestItem.building_name;
                } else {
                    finalName = bestItem.address_name || bestItem.full_name;
                }
                if (!finalName && bestItem.name) finalName = bestItem.name;
            }

            if (finalName) {
                setAddressValue(finalName);
                form.setFieldsValue({ address: finalName });
                message.success({ content: `Адрес: ${finalName}`, key: 'geo' });
            } else {
                message.warning('Не удалось определить точный адрес. Введите вручную.');
            }

            if (data2gis?.result?.items?.length > 0) {
                const bestItem = data2gis.result.items[0];
                const cityFromGeo = (bestItem.adm_div || []).find((d: any) => d.type === 'city')?.name
                    || (bestItem.full_name ? String(bestItem.full_name).split(',')[0].trim() : '');
                if (cityFromGeo) setCity(cityFromGeo);
            }
        } catch (e) {
            console.error('Manual geocode error', e);
            message.error('Ошибка соединения с 2GIS');
        } finally {
            setIsFetchingAddress(false);
        }
    };

    return (
        <Form form={form} layout="vertical" onFinish={(values) => {
            let finalCompanyId = values.companyId;
            if (customerCompany || carrierCompany) {
                if (values.bindingType === 'customer') {
                    finalCompanyId = customerCompany?.id;
                } else if (values.bindingType === 'carrier') {
                    finalCompanyId = carrierCompany?.id;
                } else {
                    finalCompanyId = undefined;
                }
            }
            // Include dynamic state values not managed natively by form fields if any
            const { bindingType, ...rest } = values;
            void onFinish({
                ...rest,
                companyId: finalCompanyId,
                address: addressValue,
                latitude: lat,
                longitude: lng,
                city: city || null
            });
        }}>
            <Row gutter={24}>
                <Col span={10}>
                    <Form.Item
                        name="name"
                        label="Название точки"
                        rules={[{ required: true, message: 'Например: Склад Алматы 1' }]}
                    >
                        <Input placeholder="Склад №1" size="large" />
                    </Form.Item>

                    <Form.Item
                        label="Адрес"
                        required
                        help={city
                            ? `Город: ${city} (определён автоматически)`
                            : 'Начните вводить адрес — он найдётся автоматически'}
                    >
                        <AddressAutocomplete
                            value={addressValue}
                            onChange={(val) => {
                                setAddressValue(val);
                                form.setFieldsValue({ address: val });
                            }}
                            onSelect={handleAddressSelect}
                            placeholder="Например: Алматы, Сатпаева 90/1"
                        />
                    </Form.Item>

                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="latitude" label="Широта" rules={[{ required: true, message: 'Выберите адрес или укажите на карте' }]}>
                                <InputNumber style={{ width: '100%' }} value={lat} readOnly placeholder="—" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="longitude" label="Долгота" rules={[{ required: true, message: '' }]}>
                                <InputNumber style={{ width: '100%' }} value={lng} readOnly placeholder="—" />
                            </Form.Item>
                        </Col>
                    </Row>

                    { (customerCompany?.id || carrierCompany?.id) ? (
                        <Form.Item name="bindingType" label="Привязать адрес к участнику заявки" initialValue="none">
                            <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <Radio value="none">Без привязки (разовый общий адрес)</Radio>
                                {customerCompany?.id && (
                                    <Radio value="customer">Заказчик: {customerCompany.name}</Radio>
                                )}
                                {carrierCompany?.id && (
                                    <Radio value="carrier">Исполнитель: {carrierCompany.name}</Radio>
                                )}
                            </Radio.Group>
                        </Form.Item>
                    ) : showCompanySelect && (
                        <Form.Item name="companyId" label="Привязать к контрагенту (компании)">
                            <Select placeholder="Без привязки (общий)" allowClear showSearch optionFilterProp="children" loading={companiesLoading}>
                                {companies.map(c => (
                                    <Option key={c.id} value={c.id}>{c.name}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    )}

                    <Form.Item name="emails" label="Email-адреса склада" help="Введите email и нажмите Enter">
                        <Select mode="tags" placeholder="warehouse@company.com" tokenSeparators={[',', ' ']} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item name="contactName" label="Контактное лицо">
                        <Input placeholder="Иван Иванов" />
                    </Form.Item>
                    <Form.Item name="contactPhone" label="Телефон">
                        <Input placeholder="+7..." />
                    </Form.Item>
                </Col>
                <Col span={14}>
                    <div style={{ marginBottom: 8 }}>
                        <Text strong>Или укажите точку на карте:</Text>
                    </div>
                    <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                        <MapPicker
                            onLocationSelect={handleMapSelect}
                            initialLat={lat}
                            initialLng={lng}
                        />
                        <div style={{
                            position: 'absolute',
                            bottom: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 1000,
                            background: 'white',
                            padding: 4,
                            borderRadius: 6,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                        }}>
                            <Button
                                type="primary"
                                onClick={handleManualGeocode}
                                loading={isFetchingAddress}
                                disabled={!lat || !lng}
                                icon={<EnvironmentOutlined />}
                            >
                                Определить адрес
                            </Button>
                        </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            При выборе адреса карта автоматически переместится к нужной точке
                        </Text>
                    </div>
                </Col>
            </Row>
        </Form>
    );
}
