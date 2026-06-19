'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, Table, Card, Input, Button, Tag, Space, Typography, Avatar, Badge, message, List, Modal, Form, Select, Popconfirm, Checkbox } from 'antd';
import {
    SearchOutlined, UserAddOutlined, TeamOutlined,
    CheckCircleOutlined, CloseCircleOutlined, ShopOutlined,
    PlusOutlined, EditOutlined, DeleteOutlined, CarOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const { Title, Text } = Typography;

export default function PartnersPage() {
    const { user } = useAuthStore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab') === 'carriers' ? 'carriers' : 'customers';
    const [activeTab, setActiveTab] = useState(initialTab);

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
        const { roles, ...rest } = values;
        const isCustomer = roles?.includes('customer') ?? true;
        const isCarrier = roles?.includes('carrier') ?? false;
        
        const body = {
            ...rest,
            isCustomer,
            isCarrier,
            type: isCustomer ? 'CUSTOMER' : 'FORWARDER'
        };

        try {
            if (editingCompany) {
                await api.patch(`/external-companies/${editingCompany.id}`, body);
                message.success('Контрагент обновлен');
            } else {
                await api.post('/external-companies', body);
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
        const roles = [];
        if (company.isCustomer) roles.push('customer');
        if (company.isCarrier) roles.push('carrier');
        form.setFieldsValue({
            ...company,
            roles
        });
        setModalOpen(true);
    };

    const openCreate = () => {
        setEditingCompany(null);
        form.resetFields();
        form.setFieldsValue({ roles: ['customer'] });
        setModalOpen(true);
    };

    const columns = [
        {
            title: 'Компания',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: any) => (
                <Space direction="vertical" size={2}>
                    <Space>
                        <Avatar icon={<ShopOutlined />} style={{ backgroundColor: record.isExternal ? '#8c8c8c' : '#1890ff' }} />
                        <Text strong>{text}</Text>
                    </Space>
                    <Space size={4}>
                        {record.isCustomer && <Tag color="blue" style={{ fontSize: '10px', lineHeight: '14px', margin: 0 }}>Заказчик</Tag>}
                        {record.isCarrier && <Tag color="green" style={{ fontSize: '10px', lineHeight: '14px', margin: 0 }}>Перевозчик</Tag>}
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

    const renderPartnersTable = (data: any[], tabType: 'customers' | 'carriers') => {
        const filteredData = data.filter(c => tabType === 'customers' ? c.isCustomer : c.isCarrier);
        
        return (
            <Card style={{ minHeight: 400 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
                    <Title level={4} style={{ margin: 0 }}>
                        {tabType === 'customers' ? 'Список заказчиков' : 'Список перевозчиков'}
                    </Title>
                    <Space>
                        <Button 
                            type="primary" 
                            icon={<PlusOutlined />} 
                            onClick={() => {
                                setEditingCompany(null);
                                form.resetFields();
                                form.setFieldsValue({ roles: [tabType === 'customers' ? 'customer' : 'carrier'] });
                                setModalOpen(true);
                            }}
                        >
                            Добавить {tabType === 'customers' ? 'заказчика' : 'перевозчика'}
                        </Button>
                        <Button onClick={fetchCounterparties}>Обновить</Button>
                    </Space>
                </div>
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="id"
                    loading={loading}
                    locale={{ emptyText: tabType === 'customers' ? 'У вас пока нет заказчиков' : 'У вас пока нет перевозчиков' }}
                    onRow={(record) => ({
                        onClick: () => router.push(`/company/partners/${record.id}`),
                        style: { cursor: 'pointer' },
                    })}
                />
            </Card>
        );
    };

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
                                    <Avatar size={48} icon={<ShopOutlined />} style={{ backgroundColor: '#1890ff' }} />
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 'bold' }}>{company.name}</div>
                                        {company.city && <Text type="secondary">{company.city}</Text>}
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
                        key: 'customers',
                        label: (
                            <Space>
                                <TeamOutlined />
                                Заказчики
                            </Space>
                        ),
                        children: renderPartnersTable(counterparties, 'customers')
                    },
                    {
                        key: 'carriers',
                        label: (
                            <Space>
                                <CarOutlined />
                                Перевозчики
                            </Space>
                        ),
                        children: renderPartnersTable(counterparties, 'carriers')
                    },
                    {
                        key: 'requests',
                        label: (
                            <Space>
                                <TeamOutlined />
                                Запросы
                                {requests.length > 0 && <Badge count={requests.length} size="small" />}
                            </Space>
                        ),
                        children: (
                            <Space direction="vertical" style={{ width: '100%' }} size="large">
                                <Card title="Входящие запросы">
                                    {requests.length > 0 ? (
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
                                    ) : (
                                        <Text type="secondary">Нет входящих запросов</Text>
                                    )}
                                </Card>
                                <Card title="Исходящие запросы">
                                    {sentRequests.length > 0 ? (
                                        <List
                                            itemLayout="horizontal"
                                            dataSource={sentRequests}
                                            renderItem={(item: any) => (
                                                <List.Item>
                                                    <List.Item.Meta
                                                        avatar={<Avatar icon={<UserAddOutlined />} />}
                                                        title={item.recipient.name}
                                                        description={`Запрос отправлен. Дата: ${new Date(item.createdAt).toLocaleDateString()}`}
                                                    />
                                                    <Tag color="orange">Ожидает подтверждения</Tag>
                                                </List.Item>
                                            )}
                                        />
                                    ) : (
                                        <Text type="secondary">Нет исходящих запросов</Text>
                                    )}
                                </Card>
                            </Space>
                        )
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
                <Form 
                    form={form} 
                    layout="vertical" 
                    onFinish={handleSave}
                    onValuesChange={async (changedValues) => {
                        if (changedValues.bin && /^\d{12}$/.test(changedValues.bin)) {
                            try {
                                const res = await api.get(`/auth/company-lookup/${changedValues.bin}`);
                                if (res.data) {
                                    const updateObj: any = {};
                                    if (res.data.name) updateObj.name = res.data.name;
                                    if (res.data.address) updateObj.address = res.data.address;
                                    if (res.data.directorName) updateObj.directorName = res.data.directorName;
                                    if (res.data.phone) updateObj.phone = res.data.phone;
                                    if (res.data.email) updateObj.email = res.data.email;
                                    
                                    form.setFieldsValue(updateObj);
                                    message.success('Реквизиты компании подтянуты');
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }}
                >
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="ТОО Пример" />
                    </Form.Item>
                    <Form.Item 
                        name="roles" 
                        label="Роль контрагента" 
                        rules={[{ required: true, message: 'Выберите хотя бы одну роль' }]}
                    >
                        <Checkbox.Group style={{ width: '100%' }}>
                            <Space direction="horizontal" size="large">
                                <Checkbox value="customer">Заказчик</Checkbox>
                                <Checkbox value="carrier">Перевозчик</Checkbox>
                            </Space>
                        </Checkbox.Group>
                    </Form.Item>
                    {/* Тип скрыт, т.к. компании универсальны */}
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
