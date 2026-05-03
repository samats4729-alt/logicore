'use client';

import { useEffect, useState } from 'react';
import {
    Table, Card, Button, Space, Modal, Form,
    Input, Typography, App, InputNumber, Row, Col, Select
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { api, Location, City, Country, Region } from '@/lib/api';
import MapPicker from '@/components/ui/MapPicker';
import AddressAutocomplete from '@/components/ui/AddressAutocomplete';

const { Title, Text } = Typography;
const { Option } = Select;

const MAPBOX_TOKEN = 'pk.eyJ1IjoicG9udGlwaWxhdCIsImEiOiJjbWtybWQ1b3UwemdhM2NzOWkxZjJqeGZ6In0.iKSM05aqs4Wpx4B-CBscjg';

export default function CompanyLocationsPage() {
    const { message } = App.useApp();
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form] = Form.useForm();

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

    useEffect(() => {
        fetchLocations();
        fetchCountries();
    }, []);

    const fetchCountries = async () => {
        try {
            const res = await api.get('/cities/countries');
            setCountries(res.data);

            // Auto-select Kazakhstan if it's the only one or default
            const kz = res.data.find((c: Country) => c.code === 'KZ');
            if (kz) {
                // We could auto-select, but let's let user choose to be explicit or auto-select on open
            }
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

    const handleCreate = async (values: any) => {
        try {
            await api.post('/locations', {
                ...values,
                address: addressValue,
                latitude: lat,
                longitude: lng
            });
            message.success('Адрес добавлен');
            setModalOpen(false);
            form.resetFields();
            setLat(undefined);
            setLng(undefined);
            setAddressValue('');
            fetchLocations();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания');
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

    const columns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => (
                <Space>
                    <EnvironmentOutlined style={{ color: '#1677ff' }} />
                    <strong>{text}</strong>
                </Space>
            ),
        },
        {
            title: 'Адрес',
            dataIndex: 'address',
            key: 'address',
            ellipsis: true,
        },
        {
            title: 'Контакт',
            dataIndex: 'contactName',
            key: 'contactName',
            render: (name: string, record: Location) =>
                name ? `${name} (${record.contactPhone})` : '—',
        },
        {
            title: 'Координаты',
            key: 'coords',
            render: (_: any, record: Location) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.latitude?.toFixed(4)}, {record.longitude?.toFixed(4)}
                </Text>
            ),
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: Location) => (
                <Space>
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
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
                <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    Добавить новый адрес
                </Button>
            </div>

            <Card bordered={false} style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Table
                    columns={columns}
                    dataSource={locations}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            <Modal
                title="Добавление нового адреса"
                open={modalOpen}
                onCancel={() => {
                    setModalOpen(false);
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
                        <Form form={form} layout="vertical" onFinish={handleCreate}>
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
                                    // disabled={!selectedCityName && !addressValue} // Removed blocking logic to prevent UX issues
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
