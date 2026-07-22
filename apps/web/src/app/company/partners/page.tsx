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
    // Офисные сотрудники — для назначения ответственного менеджера (только админ)
    const [officeUsers, setOfficeUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
    const isCompanyAdmin = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    const [form] = Form.useForm();

    // Loading States
    const [loading, setLoading] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        fetchCounterparties();
        fetchRequests();
        api.get('/company/managers')
            .then(res => setOfficeUsers(res.data || []))
            .catch(() => { });
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
        
        const body: any = {
            ...rest,
            isCustomer,
            isCarrier,
            type: isCustomer ? 'CUSTOMER' : 'FORWARDER'
        };
        // Пустое значение = снять ответственного (иначе undefined не уйдёт на сервер)
        if (isCompanyAdmin && editingCompany) {
            body.responsibleManagerId = rest.responsibleManagerId ?? null;
        }

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

    const getInitials = (name: string) => {
        if (!name || name === '—') return '';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    const columns = [
        {
            title: 'Компания',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="lc2-avatar lc2-avatar-sm" style={{ background: record.isCarrier ? '#e6ffed' : '#e0f2fe', color: record.isCarrier ? '#28a745' : '#0369a1', flexShrink: 0 }}>
                        {getInitials(text) || 'КГ'}
                    </span>
                    <div>
                        <div style={{ fontWeight: 600 }}>{text}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                            {record.isCustomer && <Tag color="blue" style={{ fontSize: '10px', lineHeight: '14px', margin: 0 }}>Заказчик</Tag>}
                            {record.isCarrier && <Tag color="green" style={{ fontSize: '10px', lineHeight: '14px', margin: 0 }}>Перевозчик</Tag>}
                        </div>
                    </div>
                </div>
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
            title: 'Ответственный',
            key: 'responsible',
            render: (_: any, record: any) => {
                if (!record.isExternal) return <span style={{ color: 'var(--lc-text-ter)' }}>—</span>;
                const m = record.responsibleManager;
                return m
                    ? <span style={{ fontSize: 12 }}>{m.lastName} {m.firstName?.[0] ? `${m.firstName[0]}.` : ''}</span>
                    : <span style={{ color: 'var(--lc-text-ter)', fontSize: 12 }}>не назначен</span>;
            }
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: any) => (
                record.isExternal ? (
                    <Space>
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEdit(record); }}>
                            Изменить
                        </Button>
                        <Popconfirm
                            title="Удалить контрагента?"
                            onConfirm={() => handleDelete(record.id)}
                            okText="Да"
                            cancelText="Нет"
                        >
                            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()}>
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
            <div style={{ minHeight: 400, paddingTop: 8 }}>
                <div style={{ marginBottom: 16 }}>
                    <Title level={4} style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                        {tabType === 'customers' ? 'Список заказчиков' : 'Список перевозчиков'}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Нажмите на строку — откроется карточка контрагента. «Изменить» — правка данных и роли.
                    </Text>
                </div>
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    locale={{ emptyText: tabType === 'customers' ? 'У вас пока нет заказчиков' : 'У вас пока нет перевозчиков' }}
                    onRow={(record) => ({
                        onClick: () => router.push(`/company/partners/${record.id}`),
                        style: { cursor: 'pointer' },
                    })}
                />
            </div>
        );
    };

    const searchContent = (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ marginBottom: 32, textAlign: 'center', paddingTop: 16 }}>
                <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--lc-text)' }}>Поиск компаний</h3>
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
                <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--lc-text-ter)' }}>
                    {searchQuery ? 'Ничего не найдено' : 'Нет доступных компаний для партнерства'}
                </div>
            )}
        </div>
    );

    const customersCount = counterparties.filter(c => c.isCustomer).length;
    const carriersCount = counterparties.filter(c => c.isCarrier).length;
    const requestsCount = requests.length;

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Справочники · Контрагенты</div>
                    <h1 className="lc2-title">Контрагенты</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Управление заказчиками, перевозчиками и входящими запросами на партнерство
                    </p>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={openCreate}
                        className="lc-cta"
                    >
                        Добавить контрагента
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <TeamOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Заказчики</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {customersCount}
                            </div>
                            <div className="lc2-msub">в системе</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#28a745' }}>
                            <CarOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Перевозчики</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {carriersCount}
                            </div>
                            <div className="lc2-msub">в системе</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: requestsCount > 0 ? '#ffeef0' : '#f1f2f5', color: requestsCount > 0 ? '#dc3545' : '#5f6672' }}>
                            <TeamOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Запросы</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {requestsCount}
                            </div>
                            <div className="lc2-msub" style={{ color: requestsCount > 0 ? '#dc3545' : '#8a91a0' }}>
                                {requestsCount > 0 ? 'требуют ответа' : 'нет новых'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== TABS CARD ===== */}
            <div className="lc-card" style={{ padding: '20px' }}>
                <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
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
            </div> {/* Close lc-card */}

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
                    {isCompanyAdmin && (
                        <Form.Item
                            name="responsibleManagerId"
                            label="Ответственный менеджер"
                            help="Кто ведёт этого контрагента. Если включена настройка «менеджеры видят только своих контрагентов», его будет видеть только ответственный"
                        >
                            <Select
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                filterOption={(input, option) =>
                                    String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                placeholder="Не назначен (виден всем менеджерам)"
                                options={officeUsers.map(u => ({ value: u.id, label: `${u.lastName} ${u.firstName}` }))}
                            />
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </div>
    );
}
