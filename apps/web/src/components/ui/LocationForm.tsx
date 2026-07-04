'use client';

import { useEffect, useState } from 'react';
import {
    Form, Input, InputNumber, Row, Col, Select, Typography, App, Button, FormInstance
} from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import { api, Country, Region, City, Location } from '@/lib/api';
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
}

export default function LocationForm({
    form,
    onFinish,
    editingLocation,
    defaultCompanyId,
    showCompanySelect = true
}: LocationFormProps) {
    const { message } = App.useApp();

    // Coordinates managed manually to sync with Map
    const [lat, setLat] = useState<number | undefined>();
    const [lng, setLng] = useState<number | undefined>();
    const [addressValue, setAddressValue] = useState('');

    // Hierarchy state
    const [countries, setCountries] = useState<Country[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [cities, setCities] = useState<City[]>([]);

    const [selectedCountryId, setSelectedCountryId] = useState<string | undefined>();
    const [selectedRegionId, setSelectedRegionId] = useState<string | undefined>();

    const [selectedCityCoords, setSelectedCityCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
    const [selectedCityName, setSelectedCityName] = useState<string | undefined>(undefined);
    const [loadingData, setLoadingData] = useState(false);

    // Companies/Partners for linking
    const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
    const [companiesLoading, setCompaniesLoading] = useState(false);
    const [isFetchingAddress, setIsFetchingAddress] = useState(false);

    useEffect(() => {
        fetchCountries();
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

            if (editingLocation.city) {
                void prefillCascadeByCityName(editingLocation.city);
            }
        } else {
            setAddressValue('');
            setLat(undefined);
            setLng(undefined);
            form.resetFields();
            if (defaultCompanyId) {
                form.setFieldsValue({ companyId: defaultCompanyId });
            }
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

    const fetchCountries = async () => {
        try {
            const res = await api.get('/cities/countries');
            setCountries(res.data);
        } catch (e) {
            console.error('Failed to fetch countries', e);
        }
    };

    const handleCountryChange = async (countryId: string) => {
        setSelectedCountryId(countryId);
        setSelectedRegionId(undefined);
        setRegions([]);
        setCities([]);
        form.setFieldsValue({ regionId: undefined, city: undefined });

        setLoadingData(true);
        try {
            const res = await api.get(`/cities/regions?countryId=${countryId}`);
            setRegions(res.data);
        } finally {
            setLoadingData(false);
        }
    };

    const handleRegionChange = async (regionId: string) => {
        setSelectedRegionId(regionId);
        setCities([]);
        form.setFieldsValue({ city: undefined });

        setLoadingData(true);
        try {
            const res = await api.get(`/cities?regionId=${regionId}`);
            setCities(res.data);
        } finally {
            setLoadingData(false);
        }
    };

    const onCityChange = (cityName: string) => {
        const city = cities.find(c => c.name === cityName);
        if (city) {
            const coords = { lat: city.latitude, lng: city.longitude };
            setSelectedCityCoords(coords);
            setSelectedCityName(city.name);
            setLat(city.latitude);
            setLng(city.longitude);
            form.setFieldsValue({ latitude: city.latitude, longitude: city.longitude });
        }
    };

    const prefillCascadeByCityName = async (cityName?: string | null) => {
        if (!cityName) return;
        try {
            const res = await api.get(`/cities?search=${encodeURIComponent(cityName)}`);
            const foundCity = res.data.find((c: any) => c.name.toLowerCase() === cityName.toLowerCase());
            if (!foundCity) return;
            const { countryId, regionId } = foundCity;

            setSelectedCountryId(countryId);
            setSelectedRegionId(regionId);
            setSelectedCityName(foundCity.name);
            setSelectedCityCoords({ lat: foundCity.latitude, lng: foundCity.longitude });

            const [regionsRes, citiesRes] = await Promise.all([
                api.get(`/cities/regions?countryId=${countryId}`),
                api.get(`/cities?regionId=${regionId}`),
            ]);
            setRegions(regionsRes.data);
            setCities(citiesRes.data);

            form.setFieldsValue({ countryId, regionId, city: foundCity.name });
        } catch (e) {
            console.error('Failed to prefill city cascade', e);
        }
    };

    const handleAddressSelect = (address: string, latitude: number, longitude: number) => {
        setAddressValue(address);
        setLat(latitude);
        setLng(longitude);
        form.setFieldsValue({ address, latitude, longitude });

        const cityCandidate = address.includes(',') ? address.split(',')[0].trim() : '';
        void prefillCascadeByCityName(cityCandidate);
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
        const apiKey = process.env.NEXT_PUBLIC_2GIS_API_KEY;
        if (!apiKey) {
            message.warning('2GIS API key не сконфигурирован');
            return;
        }

        setIsFetchingAddress(true);
        try {
            const params = new URLSearchParams({
                key: apiKey,
                fields: 'items.point,items.address_name,items.building_name,items.full_name,items.adm_div',
                lon: lng.toString(),
                lat: lat.toString(),
                radius: '100'
            });

            const url = `https://catalog.api.2gis.com/3.0/items/geocode?${params}`;
            const res = await fetch(url);
            const data2gis = await res.json();

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
                void prefillCascadeByCityName(cityFromGeo);
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
            // Include dynamic state values not managed natively by form fields if any
            void onFinish({
                ...values,
                address: addressValue,
                latitude: lat,
                longitude: lng
            });
        }}>
            <Row gutter={24}>
                <Col span={10}>
                    <Row gutter={12}>
                        <Col span={24}>
                            <Form.Item
                                name="countryId"
                                label="Страна"
                                rules={[{ required: true, message: 'Выберите страну' }]}
                            >
                                <Select
                                    placeholder="Страна"
                                    onChange={handleCountryChange}
                                    loading={loadingData}
                                >
                                    {countries.map(c => (
                                        <Option key={c.id} value={c.id}>{c.name}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item
                                name="regionId"
                                label="Область"
                                rules={[{ required: true, message: 'Выберите область' }]}
                            >
                                <Select
                                    placeholder="Область"
                                    onChange={handleRegionChange}
                                    disabled={!selectedCountryId}
                                    loading={loadingData}
                                >
                                    {regions.map(r => (
                                        <Option key={r.id} value={r.id}>{r.name}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={24}>
                            <Form.Item
                                name="city"
                                label="Город"
                                rules={[{ required: true, message: 'Выберите город' }]}
                            >
                                <Select
                                    onChange={onCityChange}
                                    placeholder="Город"
                                    disabled={!selectedRegionId}
                                    showSearch
                                    optionFilterProp="children"
                                >
                                    {cities.map(city => (
                                        <Option key={city.id} value={city.name}>
                                            {city.name} {city.country?.code ? `(${city.country.code})` : ''}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

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
                        help="Начните вводить адрес — он найдётся автоматически"
                    >
                        <AddressAutocomplete
                            value={addressValue}
                            onChange={(val) => {
                                setAddressValue(val);
                                form.setFieldsValue({ address: val });
                            }}
                            onSelect={handleAddressSelect}
                            placeholder={selectedCityName ? "ул. Гоголя, 1" : "Выберите город или укажите точку на карте"}
                            proximity={selectedCityCoords}
                            city={selectedCityName}
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

                    {showCompanySelect && (
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
