'use client';

import { useEffect, useState, useMemo } from 'react';
import {
    Table, Card, Button, Space, Modal, Form,
    Input, Typography, App, InputNumber, Row, Col, Select, Tag, Tooltip
} from 'antd';
import { 
    PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined,
    SearchOutlined, ClearOutlined, MailOutlined, UserOutlined, GlobalOutlined
} from '@ant-design/icons';
import { api, Location, City, Country, Region } from '@/lib/api';
import dynamic from 'next/dynamic';
import AddressAutocomplete from '@/components/ui/AddressAutocomplete';

const MapPicker = dynamic(() => import('@/components/ui/MapPicker'), {
    ssr: false,
    loading: () => <div style={{ height: 400, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Загрузка карты...</div>
});

const { Title, Text } = Typography;
const { Option } = Select;

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG9udGlwaWxhdCIsImEiOiJjbWtybWQ1b3UwemdhM2NzOWkxZjJqeGZ6In0.iKSM05aqs4Wpx4B-CBscjg';

export default function CompanyLocationsPage() {
    const { message } = App.useApp();
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<Location | null>(null);
    const [form] = Form.useForm();

    const [searchText, setSearchText] = useState('');
    const [filterCompanyId, setFilterCompanyId] = useState<string | undefined>(undefined);

    // Coordinates managed manually to sync with Map
    const [lat, setLat] = useState<number | undefined>();
    const [lng, setLng] = useState<number | undefined>();
    const [addressValue, setAddressValue] = useState('');

    // City management
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

    useEffect(() => {
        fetchLocations();
        fetchCountries();
        fetchCompanies();
    }, []);

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
            console.error('Failed to fetch countries');
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

    const fetchLocations = async () => {
        try {
            const response = await api.get('/locations');
            setLocations(response.data);
        } catch (error) {
            message.error('Ошибка загрузки адресов');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            const payload = {
                ...values,
                address: addressValue,
                latitude: lat,
                longitude: lng,
                emails: values.emails ? values.emails.join(',') : null
            };
            if (editingLocation) {
                await api.put(`/locations/${editingLocation.id}`, payload);
                message.success('Адрес обновлен');
            } else {
                await api.post('/locations', payload);
                message.success('Адрес добавлен');
            }
            setModalOpen(false);
            setEditingLocation(null);
            form.resetFields();
            setLat(undefined);
            setLng(undefined);
            setAddressValue('');
            fetchLocations();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения');
        }
    };

    const handleEditClick = async (record: Location) => {
        setEditingLocation(record);
        setModalOpen(true);
        setAddressValue(record.address);
        setLat(record.latitude);
        setLng(record.longitude);
        
        // Prefill form basic fields
        form.setFieldsValue({
            name: record.name,
            latitude: record.latitude,
            longitude: record.longitude,
            contactName: record.contactName,
            contactPhone: record.contactPhone,
            emails: (record as any).emails ? (record as any).emails.split(',').map((e: string) => e.trim()).filter(Boolean) : [],
            companyId: (record as any).companyId || undefined
        });

        if (record.city) {
            try {
                const res = await api.get(`/cities?search=${encodeURIComponent(record.city)}`);
                const foundCity = res.data.find((c: any) => c.name.toLowerCase() === record.city?.toLowerCase());
                if (foundCity) {
                    const countryId = foundCity.countryId;
                    const regionId = foundCity.regionId;
                    
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
                    
                    form.setFieldsValue({
                        countryId,
                        regionId,
                        city: foundCity.name
                    });
                }
            } catch (e) {
                console.error('Failed to prefill city details', e);
            }
        }
    };

    const handleDelete = async (id: string) => {
        Modal.confirm({
            title: 'Удалить адрес?',
            content: 'Вы уверены, что хотите удалить этот адрес из списка?',
            okText: 'Удалить',
            cancelText: 'Отмена',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    await api.delete(`/locations/${id}`);
                    message.success('Адрес удалён');
                    fetchLocations();
                } catch (error: any) {
                    message.error(error.response?.data?.message || 'Ошибка удаления');
                }
            },
        });
    };

    const onCityChange = (cityName: string) => {
        const city = cities.find(c => c.name === cityName);
        if (city) {
            const coords = { lat: city.latitude, lng: city.longitude };
            setSelectedCityCoords(coords);
            setSelectedCityName(city.name);
            // Move map to city center
            setLat(city.latitude);
            setLng(city.longitude);
        }
    };

    // Когда выбирают адрес из автодополнения
    const handleAddressSelect = (address: string, latitude: number, longitude: number) => {
        setAddressValue(address);
        setLat(latitude);
        setLng(longitude);
        form.setFieldsValue({ latitude, longitude });
    };

    // State for manual address fetching
    const [isFetchingAddress, setIsFetchingAddress] = useState(false);

    // Когда кликают на карту - ТОЛЬКО обновляем координаты (экономия 2GIS)
    const handleMapSelect = async (latitude: number, longitude: number, pickedName?: string) => {
        setLat(latitude);
        setLng(longitude);
        form.setFieldsValue({ latitude, longitude });

        // Если есть "подсказка" с карты (векторная плитка) - используем её БЕСПЛАТНО
        if (pickedName) {
            setAddressValue(pickedName);
            message.success({ content: `Выбрано: ${pickedName}`, key: 'geo' });
            return;
        }

        // Иначе просто показываем координаты. Запрос НЕ шлем.
        const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        setAddressValue(coords); // Временно пишем координаты в поле
        message.info({ content: 'Точка выбрана. Нажмите "Определить адрес", если нужно.', key: 'geo' });
    };

    // ФУНКЦИЯ РУЧНОГО ОПРЕДЕЛЕНИЯ (Тратит 1 запрос 2GIS)
    const handleManualGeocode = async () => {
        if (!lat || !lng) return;

        setIsFetchingAddress(true);
        try {
            const params = new URLSearchParams({
                key: 'b018aa68-a110-494a-aa01-26991bd6b4a3',
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
                message.success({ content: `Адрес: ${finalName}`, key: 'geo' });
            } else {
                message.warning('Не удалось определить точный адрес. Введите вручную.');
            }
        } catch (e) {
            console.error('Manual geocode error', e);
            message.error('Ошибка соединения с 2GIS');
        } finally {
            setIsFetchingAddress(false);
        }
    };

    const filteredLocations = useMemo(() => {
        return locations.filter(loc => {
            const matchesSearch = !searchText || 
                loc.name.toLowerCase().includes(searchText.toLowerCase()) || 
                loc.address.toLowerCase().includes(searchText.toLowerCase()) ||
                (loc.city && loc.city.toLowerCase().includes(searchText.toLowerCase())) ||
                (loc.contactName && loc.contactName.toLowerCase().includes(searchText.toLowerCase()));

            const matchesCompany = filterCompanyId === undefined || 
                (filterCompanyId === 'global' && !loc.companyId) ||
                (loc.companyId === filterCompanyId);

            return matchesSearch && matchesCompany;
        });
    }, [locations, searchText, filterCompanyId]);

    const columns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            width: 170,
            render: (text: string) => (
                <Space>
                    <EnvironmentOutlined style={{ color: '#1677ff' }} />
                    <strong style={{ whiteSpace: 'nowrap' }}>{text}</strong>
                </Space>
            ),
        },
        {
            title: 'Адрес',
            dataIndex: 'address',
            key: 'address',
            width: 250,
            render: (text: string) => (
                <Tooltip title={text} placement="topLeft">
                    <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {text || '—'}
                    </span>
                </Tooltip>
            ),
        },
        {
            title: 'Контрагент',
            dataIndex: 'company',
            key: 'company',
            width: 170,
            render: (company: any) => {
                if (!company) return <Tag icon={<GlobalOutlined />} color="default" style={{ margin: 0 }}>Общий адрес</Tag>;
                return (
                    <Tooltip title={company.name}>
                        <Tag color="geekblue" style={{ fontWeight: 500, margin: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            🏢 {company.name}
                        </Tag>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Email',
            dataIndex: 'emails',
            key: 'emails',
            width: 90,
            render: (emails: string) => {
                if (!emails) return '—';
                const list = emails.split(',').map(e => e.trim()).filter(Boolean);
                if (list.length === 0) return '—';
                
                const tooltipContent = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {list.map(email => (
                            <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <MailOutlined style={{ fontSize: 12 }} />
                                <span>{email}</span>
                            </div>
                        ))}
                    </div>
                );

                return (
                    <Tooltip title={tooltipContent} placement="top" color="#1c2536">
                        <Tag icon={<MailOutlined />} color="blue" style={{ cursor: 'pointer', margin: 0, fontWeight: 500 }}>
                            {list.length}
                        </Tag>
                    </Tooltip>
                );
            }
        },
        {
            title: 'Контакт',
            dataIndex: 'contactName',
            key: 'contactName',
            width: 170,
            render: (name: string, record: Location) => {
                if (!name && !record.contactPhone) return '—';
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {name && (
                            <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <UserOutlined style={{ marginRight: 4, color: '#8c8c8c' }} />
                                {name}
                            </span>
                        )}
                        {record.contactPhone && (
                            <span style={{ color: '#8c8c8c', fontSize: 12, whiteSpace: 'nowrap' }}>
                                {record.contactPhone}
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Координаты',
            key: 'coords',
            width: 120,
            render: (_: any, record: Location) => (
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {record.latitude?.toFixed(4)}, {record.longitude?.toFixed(4)}
                </Text>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 100,
            render: (_: any, record: Location) => (
                <Space size="middle">
                    <Button
                        type="text"
                        icon={<EditOutlined style={{ color: '#1677ff' }} />}
                        onClick={() => handleEditClick(record)}
                        style={{ padding: 0 }}
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                        style={{ padding: 0 }}
                    />
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>Адреса</Title>
                    <Text type="secondary">Управление точками погрузки и выгрузки</Text>
                </div>
                <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => {
                    setEditingLocation(null);
                    form.resetFields();
                    setAddressValue('');
                    setLat(undefined);
                    setLng(undefined);
                    setModalOpen(true);
                }}>
                    Добавить новый адрес
                </Button>
            </div>

            <Card bordered={false} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                {/* Search & Filter Panel */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    <Input
                        placeholder="Поиск по названию, адресу или городу..."
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        style={{ maxWidth: 350, flex: 1 }}
                        allowClear
                    />
                    <Select
                        placeholder="Фильтр по контрагенту"
                        value={filterCompanyId}
                        onChange={setFilterCompanyId}
                        style={{ width: 250 }}
                        allowClear
                    >
                        <Option value="global">📍 Общие адреса (без контрагента)</Option>
                        {companies.map(c => (
                            <Option key={c.id} value={c.id}>🏢 {c.name}</Option>
                        ))}
                    </Select>
                    {(searchText || filterCompanyId !== undefined) && (
                        <Button 
                            icon={<ClearOutlined />} 
                            onClick={() => {
                                setSearchText('');
                                setFilterCompanyId(undefined);
                            }}
                        >
                            Сбросить
                        </Button>
                    )}
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredLocations}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 'max-content' }}
                />
            </Card>

            <Modal
                title={editingLocation ? "Редактирование адреса" : "Добавление нового адреса"}
                open={modalOpen}
                onCancel={() => {
                    setModalOpen(false);
                    setEditingLocation(null);
                    form.resetFields();
                    setAddressValue('');
                    setLat(undefined);
                    setLng(undefined);
                }}
                onOk={() => form.submit()}
                width={800}
                centered
            >
                <Row gutter={24}>
                    <Col span={10}>
                        <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
                                    onChange={setAddressValue}
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

                            <Form.Item name="companyId" label="Привязать к контрагенту (компании)">
                                <Select placeholder="Без привязки (общий)" allowClear showSearch optionFilterProp="children" loading={companiesLoading}>
                                    {companies.map(c => (
                                        <Option key={c.id} value={c.id}>{c.name}</Option>
                                    ))}
                                </Select>
                            </Form.Item>

                            <Form.Item name="emails" label="Email-адреса склада" help="Введите email и нажмите Enter">
                                <Select mode="tags" placeholder="warehouse@company.com" tokenSeparators={[',', ' ']} style={{ width: '100%' }} />
                            </Form.Item>

                            <Form.Item name="contactName" label="Контактное лицо">
                                <Input placeholder="Иван Иванов" />
                            </Form.Item>
                            <Form.Item name="contactPhone" label="Телефон">
                                <Input placeholder="+7..." />
                            </Form.Item>
                        </Form>
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
                            {/* Floating Button Overlay */}
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
            </Modal>
        </div>
    );
}
