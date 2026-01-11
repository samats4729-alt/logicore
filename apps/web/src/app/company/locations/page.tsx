'use client';

import { useEffect, useState } from 'react';
import {
    Table, Card, Button, Space, Modal, Form,
    Input, Typography, App, InputNumber, Row, Col
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { api, Location } from '@/lib/api';
import MapPicker from '@/components/ui/MapPicker'; // Dynamic import

const { Title, Text } = Typography;

export default function CompanyLocationsPage() {
    const { message } = App.useApp();
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form] = Form.useForm();

    // Coordinates managed manually to sync with Map
    const [lat, setLat] = useState<number | undefined>();
    const [lng, setLng] = useState<number | undefined>();

    useEffect(() => {
        fetchLocations();
    }, []);

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
                latitude: lat,
                longitude: lng
            });
            message.success('Адрес добавлен');
            setModalOpen(false);
            form.resetFields();
            setLat(undefined);
            setLng(undefined);
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
                } catch {
                    message.error('Ошибка удаления');
                }
            },
        });
    };

    const handleMapSelect = (latitude: number, longitude: number) => {
        setLat(latitude);
        setLng(longitude);
        form.setFieldsValue({ latitude, longitude });
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
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
                width={800} // Шире для карты
                centered
            >
                <Row gutter={24}>
                    <Col span={10}>
                        <Form form={form} layout="vertical" onFinish={handleCreate}>
                            <Form.Item
                                name="name"
                                label="Название точки"
                                rules={[{ required: true, message: 'Например: Склад Алматы 1' }]}
                            >
                                <Input placeholder="Склад №1" size="large" />
                            </Form.Item>
                            <Form.Item
                                name="address"
                                label="Текстовый адрес"
                                rules={[{ required: true, message: 'Введите адрес' }]}
                            >
                                <Input.TextArea rows={2} placeholder="г. Алматы, ул. Гоголя 1" />
                            </Form.Item>

                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item name="latitude" label="Широта" rules={[{ required: true, message: 'Укажите на карте' }]}>
                                        <InputNumber style={{ width: '100%' }} value={lat} readOnly />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="longitude" label="Долгота" rules={[{ required: true, message: 'Укажите на карте' }]}>
                                        <InputNumber style={{ width: '100%' }} value={lng} readOnly />
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
                        <div style={{ marginBottom: 8 }}><Text strong>Укажите точку на карте:</Text></div>
                        <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, overflow: 'hidden' }}>
                            <MapPicker onLocationSelect={handleMapSelect} />
                        </div>
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Нажмите на карту, чтобы установить маркер. Координаты заполнятся автоматически.
                            </Text>
                        </div>
                    </Col>
                </Row>
            </Modal>
        </div>
    );
}
