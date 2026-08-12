'use client';

import { useState, useEffect } from 'react';
import { Table, Input, Modal, Form, Select, Space } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { MapPin } from 'lucide-react';
import { api, City, Country, Region } from '@/lib/api';
import { toast } from 'sonner';
import GeographyHeader from './GeographyHeader';
import nova from '@/components/nova/nova.module.css';

const { Option } = Select;

export default function AdminLocationsPage() {
    // Cities State
    const [cities, setCities] = useState<City[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form] = Form.useForm();

    // Dropdown Data
    const [countries, setCountries] = useState<Country[]>([]);
    const [regions, setRegions] = useState<Region[]>([]);
    const [selectedCountryId, setSelectedCountryId] = useState<string | undefined>(undefined);

    useEffect(() => {
        fetchCities();
        fetchCountries();
    }, []);

    const fetchCities = async () => {
        setLoading(true);
        try {
            const res = await api.get('/cities');
            setCities(res.data);
        } catch (error) {
            toast.error('Ошибка загрузки городов');
        } finally {
            setLoading(false);
        }
    };

    const fetchCountries = async () => {
        try {
            const res = await api.get('/cities/countries');
            setCountries(res.data);
        } catch (error) { toast.error('Ошибка загрузки стран'); }
    };

    const fetchRegions = async (countryId: string) => {
        try {
            const res = await api.get(`/cities/regions?countryId=${countryId}`);
            setRegions(res.data);
        } catch (error) { toast.error('Ошибка загрузки регионов'); }
    };

    const handleCountryChange = (val: string) => {
        setSelectedCountryId(val);
        form.setFieldValue('regionId', undefined);
        fetchRegions(val);
    };

    const prepareNewCity = () => {
        const defaultCountryId = countries.find(country =>
            country.code === 'KZ' || /казах/i.test(country.name),
        )?.id;
        setEditingId(null);
        form.resetFields();
        form.setFieldValue('countryId', defaultCountryId);
        setSelectedCountryId(defaultCountryId);
        setRegions([]);
        if (defaultCountryId) void fetchRegions(defaultCountryId);
        setModalOpen(true);
    };

    const handleSave = async (values: any) => {
        try {
            // Check if API supports creating cities. For now mockup or basic endpoint
            if (editingId) {
                // await api.patch(`/cities/${editingId}`, values);
                toast.info('Редактирование пока не реализовано на API');
            } else {
                await api.post('/cities', values);
                toast.success('Город создан');
            }
            setModalOpen(false);
            form.resetFields();
            fetchCities();
        } catch (error) {
            toast.error('Ошибка сохранения');
        }
    };

    const columns = [
        {
            title: 'Название',
            dataIndex: 'name',
            key: 'name',
            fontWeight: 'bold',
            render: (text: string, record: City) => (
                <Space>
                    <strong>{text}</strong>
                    {record.country && <span className={nova.chip}>{record.country.code}</span>}
                </Space>
            )
        },
        {
            title: 'Координаты',
            key: 'coords',
            render: (_: any, record: City) => (
                <span style={{ fontSize: 12, color: 'var(--nova-fg-3)' }}>
                    {record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}
                </span>
            )
        },
        // {
        //     title: 'Действия',
        //     key: 'actions',
        //     render: (_: any, record: City) => (
        //         <Space>
        //             <Button icon={<EditOutlined />} onClick={() => { 
        //                 setEditingId(record.id); 
        //                 form.setFieldsValue(record); 
        //                 if(record.countryId) {
        //                     setSelectedCountryId(record.countryId);
        //                     fetchRegions(record.countryId); 
        //                 }
        //                 setModalOpen(true); 
        //             }} />
        //             <Button danger icon={<DeleteOutlined />} onClick={() => {
        //                 // api.delete...
        //                 toast.info('Удаление пока не реализовано');
        //             }} />
        //         </Space>
        //     )
        // }
    ];

    // Поиск раньше был нарисован, но не работал: поле стояло без состояния,
    // человек печатал название и получал тот же список.
    const shown = search.trim()
        ? cities.filter((city) => city.name.toLowerCase().includes(search.trim().toLowerCase()))
        : cities;

    return (
        <div>
            <GeographyHeader
                actions={(
                    <button
                        type="button"
                        className={`${nova.action} ${nova.actionPrimary}`}
                        onClick={prepareNewCity}
                    >
                        <PlusOutlined /> Город
                    </button>
                )}
            />

            <section className={nova.card}>
                <div className={nova.cardHead}>
                    <MapPin size={14} />
                    <h2 className={nova.cardTitle}>Города</h2>
                    <span className={nova.cardCount}>{shown.length}</span>
                    <Input
                        prefix={<SearchOutlined />}
                        placeholder="Поиск города"
                        allowClear
                        style={{ width: 240 }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Table
                    dataSource={shown}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{ emptyText: search ? 'Такого города в справочнике нет' : 'Справочник пуст' }}
                />
            </section>

            <Modal
                title={editingId ? "Редактировать город" : "Новый город"}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="countryId" label="Страна" rules={[{ required: true }]}>
                        <Select onChange={handleCountryChange} placeholder="Выберите страну">
                            {countries.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="regionId" label="Регион">
                        <Select placeholder="Выберите регион" disabled={!selectedCountryId}>
                            {regions.map(r => <Option key={r.id} value={r.id}>{r.name}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="name" label="Название" rules={[{ required: true }]}>
                        <Input placeholder="Алматы" />
                    </Form.Item>
                    <Space>
                        <Form.Item name="latitude" label="Широта" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="longitude" label="Долгота" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>
        </div>
    );
}
