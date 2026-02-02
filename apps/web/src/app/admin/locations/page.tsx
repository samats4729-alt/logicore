'use client';

import { useState, useEffect } from 'react';
import { Table, Card, Button, Input, Space, Typography, Tag, Tabs, message, Modal, Form, Select } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import {
    PlusOutlined, SearchOutlined, EnvironmentOutlined,
    GlobalOutlined, AppstoreOutlined, EditOutlined, DeleteOutlined
} from '@ant-design/icons';
import { api, City, Country, Region } from '@/lib/api';

const { Title } = Typography;
const { Option } = Select;

export default function AdminLocationsPage() {
    const router = useRouter();
    const pathname = usePathname();

    // Cities State
    const [cities, setCities] = useState<City[]>([]);
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
            message.error('Ошибка загрузки городов');
        } finally {
            setLoading(false);
        }
    };

    const fetchCountries = async () => {
        try {
            const res = await api.get('/cities/countries');
            setCountries(res.data);
        } catch (error) { message.error('Ошибка загрузки стран'); }
    };

    const fetchRegions = async (countryId: string) => {
        try {
            const res = await api.get(`/cities/regions?countryId=${countryId}`);
            setRegions(res.data);
        } catch (error) { message.error('Ошибка загрузки регионов'); }
    };

    const handleCountryChange = (val: string) => {
        setSelectedCountryId(val);
        form.setFieldValue('regionId', undefined);
        fetchRegions(val);
    };

    const handleSave = async (values: any) => {
        try {
            // Check if API supports creating cities. For now mockup or basic endpoint
            if (editingId) {
                // await api.patch(`/cities/${editingId}`, values);
                message.info('Редактирование пока не реализовано на API');
            } else {
                await api.post('/cities', values);
                message.success('Город создан');
            }
            setModalOpen(false);
            form.resetFields();
            fetchCities();
        } catch (error) {
            message.error('Ошибка сохранения');
        }
    };

    const tabsItems = [
        { key: '/admin/locations', label: 'Города', icon: <EnvironmentOutlined /> },
        { key: '/admin/locations/regions', label: 'Регионы', icon: <AppstoreOutlined /> },
        { key: '/admin/locations/countries', label: 'Страны', icon: <GlobalOutlined /> },
    ];

    // Handle tab change
    const onTabChange = (key: string) => {
        if (key !== pathname) {
            router.push(key);
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
                    {record.country && <Tag>{record.country.code}</Tag>}
                </Space>
            )
        },
        {
            title: 'Координаты',
            key: 'coords',
            render: (_: any, record: City) => (
                <span style={{ fontSize: 12, color: '#888' }}>
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
        //                 message.info('Удаление пока не реализовано');
        //             }} />
        //         </Space>
        //     )
        // }
    ];

    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <Title level={2} style={{ marginTop: 0 }}>Управление географией</Title>
                <Tabs
                    activeKey="/admin/locations"
                    onChange={onTabChange}
                    items={tabsItems}
                />
            </div>

            <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                    <Input prefix={<SearchOutlined />} placeholder="Поиск города..." style={{ width: 300 }} />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                        setEditingId(null);
                        form.resetFields();
                        setModalOpen(true);
                    }}>
                        Добавить город
                    </Button>
                </div>

                <Table
                    dataSource={cities}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                />
            </Card>

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
