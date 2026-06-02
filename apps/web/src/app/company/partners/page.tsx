'use client';

import { useState, useEffect } from 'react';
import { Tabs, Table, Card, Input, Button, Tag, Space, Typography, Avatar, Badge, message, List, Modal, Form, Select, Popconfirm } from 'antd';
import {
    SearchOutlined, UserAddOutlined, TeamOutlined,
    CheckCircleOutlined, CloseCircleOutlined, ShopOutlined,
    PlusOutlined, EditOutlined, DeleteOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const { Title, Text } = Typography;

export default function PartnersPage() {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = useState('my-partners');

    // Data States
    const [counterparties, setCounterparties] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [sentRequests, setSentRequests] = useState<any[]>([]);

    // Search & Pagination States
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Modal & Form States
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<any | null>(null);
    const [form] = Form.useForm();

    // Loading States
    const [loading, setLoading] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        fetchCounterparties();
        fetchRequests();
    }, []);

    // Initial load when switching to search tab
    useEffect(() => {
        if (activeTab === 'search' && searchResults.length === 0) {
            loadCompanies(true);
        }
    }, [activeTab]);

    const fetchCounterparties = async () => {
        setLoading(true);
        try {
            const [partnersRes, externalRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies')
            ]);
            
            const systemPartners = partnersRes.data.map((p: any) => ({
                ...p,
                isExternal: false
            }));
            
            const externalCompanies = externalRes.data.map((e: any) => ({
                ...e,
                isExternal: true
            }));
            
            setCounterparties([...systemPartners, ...externalCompanies]);
        } catch (error) {
            console.error('Failed to fetch counterparties:', error);
            message.error('Ошибка загрузки контрагентов');
        } finally {
            setLoading(false);
        }
    };

    const fetchRequests = async () => {
        try {
            const [inRes, outRes] = await Promise.all([
                api.get('/partners/requests'),
                api.get('/partners/sent')
            ]);
            setRequests(inRes.data);
            setSentRequests(outRes.data);
        } catch (error) {
            console.error('Failed to fetch requests');
        }
    };

    const loadCompanies = async (reset = false) => {
        const currentPage = reset ? 1 : page;
        setSearchLoading(true);
        try {
            const res = await api.get(`/partners/search`, {
                params: {
                    query: searchQuery,
                    page: currentPage,
                    limit: 20
                }
            });

            if (reset) {
                setSearchResults(res.data);
                setPage(2);
            } else {
                setSearchResults(prev => [...prev, ...res.data]);
                setPage(prev => prev + 1);
            }

            if (res.data.length < 20) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }
        } catch (error) {
            message.error('Ошибка загрузки');
        } finally {
            setSearchLoading(false);
        }
    };

    const handleSearch = () => {
        loadCompanies(true);
    };

    const sendInvite = async (companyId: string) => {
        try {
            await api.post('/partners/invite', { recipientId: companyId });
            message.success('Приглашение отправлено');
            setSearchResults(prev => prev.map(c =>
                c.id === companyId ? { ...c, partnershipStatus: 'PENDING' } : c
            ));
            fetchRequests();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка отправки');
        }
    };

    const acceptInvite = async (id: string) => {
        try {
            await api.put(`/partners/${id}/accept`);
            message.success('Приглашение принято');
            fetchRequests();
            fetchCounterparties();
        } catch (error) {
            message.error('Ошибка');
        }
    };

    const rejectInvite = async (id: string) => {
        try {
            await api.put(`/partners/${id}/reject`);
            message.success('Приглашение отклонено');
            fetchRequests();
        } catch (error) {
            message.error('Ошибка');
        }
    };

    const handleSave = async (values: any) => {
        try {
            if (editingCompany) {
                await api.patch(`/external-companies/${editingCompany.id}`, values);
                message.success('Контрагент обновлен');
            } else {
                await api.post('/external-companies', values);
                message.success('Контрагент добавлен');
            }
            setModalOpen(false);
            form.resetFields();
            setEditingCompany(null);
            fetchCounterparties();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка сохранения');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.delete(`/external-companies/${id}`);
            message.success('Контрагент удален');
            fetchCounterparties();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка удаления');
        }
    };

    const openEdit = (company: any) => {
        setEditingCompany(company);
        form.setFieldsValue(company);
        setModalOpen(true);
    };

    const openCreate = () => {
        setEditingCompany(null);
        form.resetFields();
        setModalOpen(true);
    };

    const columns = [
        {
            title: 'Компания',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: any) => (
                <Space>
                    <Avatar icon={<ShopOutlined />} style={{ backgroundColor: record.isExternal ? '#8c8c8c' : '#1890ff' }} />
                    <Space direction="vertical" size={0}>
                        <Text strong>{text}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{record.type === 'FORWARDER' ? 'Экспедитор' : 'Заказчик'}</Text>
                    </Space>
                </Space>
            )
        },
        {
            title: 'БИН/ИИН',
            dataIndex: 'bin',
            key: 'bin',
            render: (text: string) => text || '—'
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
            render: (text: string) => text || '—'
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            render: (text: string) => text || '—'
        },
        {
            title: 'Статус',
            key: 'status',
            render: (_: any, record: any) => (
                record.isExternal ? (
                    <Tag color="default">Офлайн</Tag>
                ) : (
                    <Tag color="green">В системе</Tag>
                )
            )
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: any) => (
                record.isExternal ? (
                    <Space>
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                            Изменить
                        </Button>
                        <Popconfirm 
                            title="Удалить контрагента?" 
                            onConfirm={() => handleDelete(record.id)}
                            okText="Да"
                            cancelText="Нет"
                        >
                            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                                Удалить
                            </Button>
                        </Popconfirm>
                    </Space>
                ) : null
            )
        }
    ];

    const myPartnersContent = (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Incoming Requests Section - Only show if there are requests */}
            {requests.length > 0 && (
                <Card
                    title={<Space><Badge count={requests.length} /> Входящие заявки</Space>}
                    style={{ borderColor: '#faad14' }}
                >
                    <List
                        itemLayout="horizontal"
                        dataSource={requests}
                        renderItem={(item: any) => (
                            <List.Item
                                actions={[
                                    <Button key="accept" type="primary" icon={<CheckCircleOutlined />} onClick={() => acceptInvite(item.id)}>Принять</Button>,
                                    <Button key="reject" danger icon={<CloseCircleOutlined />} onClick={() => rejectInvite(item.id)}>Отклонить</Button>
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={<Avatar icon={<TeamOutlined />} />}
                                    title={item.requester.name}
                                    description={`Хочет стать вашим партнером. Дата: ${new Date(item.createdAt).toLocaleDateString()}`}
                                />
                            </List.Item>
                        )}
                    />
                </Card>
            )}

            <Card style={{ minHeight: 400 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
                    <Title level={4} style={{ margin: 0 }}>Список контрагентов</Title>
                    <Space>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                            Добавить контрагента
                        </Button>
                        <Button onClick={fetchCounterparties}>Обновить</Button>
                    </Space>
                </div>
                <Table
                    columns={columns}
                    dataSource={counterparties}
                    rowKey="id"
                    loading={loading}
                    locale={{ emptyText: 'У вас пока нет контрагентов' }}
                />
            </Card>
        </Space>
    );

    const searchContent = (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ marginBottom: 32, textAlign: 'center' }}>
                <Title level={3}>Поиск компаний</Title>
                <Text type="secondary">Находите зарегистрированные компании для сотрудничества на платформе</Text>
                <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
                    <Input
                        size="large"
                        placeholder="Введите название компании или ИИН/БИН..."
                        prefix={<SearchOutlined />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onPressEnter={handleSearch}
                    />
                    <Button size="large" type="primary" onClick={handleSearch} loading={searchLoading && page === 1}>
                        Найти
                    </Button>
                </div>
            </div>

            <List
                grid={{ gutter: 16, column: 1 }}
                dataSource={searchResults}
                loading={searchLoading && page === 1}
                loadMore={
                    hasMore && !searchLoading && searchResults.length > 0 ? (
                        <div style={{ textAlign: 'center', marginTop: 12, height: 32, lineHeight: '32px' }}>
                            <Button onClick={() => loadCompanies(false)}>Загрузить еще</Button>
                        </div>
                    ) : null
                }
                renderItem={(company: any) => (
                    <List.Item>
                        <Card>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space>
                                    <Avatar size={48} icon={<ShopOutlined />} style={{ backgroundColor: company.type === 'FORWARDER' ? '#722ed1' : '#1890ff' }} />
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 'bold' }}>{company.name}</div>
                                        <Tag color={company.type === 'FORWARDER' ? 'purple' : 'blue'}>
                                            {company.type === 'FORWARDER' ? 'Экспедитор' : 'Заказчик'}
                                        </Tag>
                                        <Text type="secondary" style={{ marginLeft: 8 }}>{company.city || ''}</Text>
                                    </div>
                                </Space>

                                {company.partnershipStatus === 'ACCEPTED' ? (
                                    <Tag color="green" icon={<CheckCircleOutlined />}>Ваш контрагент</Tag>
                                ) : company.partnershipStatus === 'PENDING' ? (
                                    <Tag color="orange">Запрос отправлен</Tag>
                                ) : (
                                    <Button
                                        type="primary"
                                        ghost
                                        icon={<UserAddOutlined />}
                                        onClick={() => sendInvite(company.id)}
                                    >
                                        Добавить
                                    </Button>
                                )}
                            </div>
                        </Card>
                    </List.Item>
                )}
            />

            {searchResults.length === 0 && !searchLoading && (
                <div style={{ textAlign: 'center', marginTop: 40, color: '#999' }}>
                    {searchQuery ? 'Ничего не найдено' : 'Нет доступных компаний для партнерства'}
                </div>
            )}
        </div>
    );

    return (
        <div>
            <Title level={2} style={{ marginBottom: 24 }}>Контрагенты</Title>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                type="card"
                items={[
                    {
                        key: 'my-partners',
                        label: (
                            <Space>
                                <TeamOutlined />
                                Мои контрагенты
                                {requests.length > 0 && <Badge count={requests.length} size="small" />}
                            </Space>
                        ),
                        children: myPartnersContent
                    },
                    {
                        key: 'search',
                        label: (
                            <Space>
                                <SearchOutlined />
                                Поиск
                            </Space>
                        ),
                        children: searchContent
                    }
                ]}
            />

            <Modal
                title={editingCompany ? 'Редактировать контрагента' : 'Новый контрагент'}
                open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditingCompany(null); form.resetFields(); }}
                onOk={() => form.submit()}
                okText="Сохранить"
                cancelText="Отмена"
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="ТОО Пример" />
                    </Form.Item>
                    {!editingCompany && (
                        <Form.Item name="type" label="Тип" rules={[{ required: true, message: 'Выберите тип' }]}>
                            <Select placeholder="Выберите тип">
                                <Select.Option value="CUSTOMER">Заказчик</Select.Option>
                                <Select.Option value="FORWARDER">Экспедитор</Select.Option>
                            </Select>
                        </Form.Item>
                    )}
                    <Form.Item name="bin" label="БИН/ИИН">
                        <Input placeholder="123456789012" />
                    </Form.Item>
                    <Form.Item name="phone" label="Телефон">
                        <Input placeholder="+77001234567" />
                    </Form.Item>
                    <Form.Item name="email" label="Email">
                        <Input placeholder="company@example.com" />
                    </Form.Item>
                    <Form.Item name="address" label="Адрес">
                        <Input placeholder="г. Алматы, ул. Абая 1" />
                    </Form.Item>
                    <Form.Item name="directorName" label="ФИО директора">
                        <Input placeholder="Иванов Иван Иванович" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
