'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Table, Button, Typography, Space, Tag, Avatar, Descriptions, Modal, Form, Input, Select, Row, Col, Divider, DatePicker, Popconfirm, Empty, theme } from 'antd';
import {
    ShopOutlined, EditOutlined, DeleteOutlined,
    PlusOutlined, UserOutlined, UserAddOutlined, CarOutlined,
    FileTextOutlined, IdcardOutlined, EnvironmentOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { VEHICLE_TYPES } from '@/lib/constants';
import LocationForm from '@/components/ui/LocationForm';
import { QuoteRequestsPanel } from '@/components/quotes/QuoteRequestsPanel';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import Loader from '@/components/ui/Loader';
import PillTabs from '@/components/ui/PillTabs';
import PartnerSettlementTerms from '@/components/partners/PartnerSettlementTerms';
import { useAuthStore } from '@/store/auth';
import { canAccounting } from '@/lib/permissions';
import { vatLabel } from '@/lib/settlement-terms';
import nova from '@/components/nova/nova.module.css';
import StatusPill from '@/components/ui/StatusPill';

const { Title, Text } = Typography;

export default function PartnerDetailPage() {
    const { token } = theme.useToken();
    const { user } = useAuthStore();
    const params = useParams();
    const router = useRouter();
    const partnerId = params.id as string;

    // Partner data
    const [partner, setPartner] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isExternal, setIsExternal] = useState(false);

    // Edit partner modal
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editForm] = Form.useForm();
    const [editSubmitting, setEditSubmitting] = useState(false);

    // Drivers
    const [drivers, setDrivers] = useState<any[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [driverModalOpen, setDriverModalOpen] = useState(false);
    const [editingDriver, setEditingDriver] = useState<any | null>(null);
    const [driverForm] = Form.useForm();
    const [driverSubmitting, setDriverSubmitting] = useState(false);

    // Contracts
    const [contracts, setContracts] = useState<any[]>([]);
    const [contractsLoading, setContractsLoading] = useState(false);

    // Addresses (адреса этого контрагента)
    const [addresses, setAddresses] = useState<any[]>([]);
    const [addressesLoading, setAddressesLoading] = useState(false);
    const [addressesLoaded, setAddressesLoaded] = useState(false);
    const [addressModalOpen, setAddressModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState<any | null>(null);
    const [addressForm] = Form.useForm();

    // Active tab
    const [activeTab, setActiveTab] = useState('profile');

    useEffect(() => {
        fetchPartner();
    }, [partnerId]);

    useEffect(() => {
        if (partner?.isCarrier) {
            fetchDrivers();
        }
    }, [partner]);

    useEffect(() => {
        if (activeTab === 'contracts' && contracts.length === 0) {
            fetchContracts();
        }
        if (activeTab === 'addresses' && !addressesLoaded) {
            fetchAddresses();
        }
    }, [activeTab]);

    const fetchPartner = async () => {
        setLoading(true);
        try {
            // Try external company first
            const externalRes = await api.get('/external-companies');
            const found = externalRes.data.find((e: any) => e.id === partnerId);
            if (found) {
                setPartner(found);
                setIsExternal(true);
            } else {
                // Try system partner
                const partnersRes = await api.get('/partners');
                const systemPartner = partnersRes.data.find((p: any) => p.id === partnerId);
                if (systemPartner) {
                    setPartner(systemPartner);
                    setIsExternal(false);
                } else {
                    toast.error('Контрагент не найден');
                    router.push('/company/partners');
                }
            }
        } catch (error) {
            console.error('Failed to fetch partner:', error);
            toast.error('Ошибка загрузки контрагента');
        } finally {
            setLoading(false);
        }
    };

    const fetchDrivers = async () => {
        setDriversLoading(true);
        try {
            const res = await api.get('/company/drivers', { params: { companyId: partnerId } });
            setDrivers(res.data);
        } catch (error) {
            console.error('Failed to fetch drivers:', error);
            toast.error('Ошибка загрузки водителей');
        } finally {
            setDriversLoading(false);
        }
    };

    const fetchContracts = async () => {
        setContractsLoading(true);
        try {
            const res = await api.get('/contracts');
            const filtered = res.data.filter((c: any) =>
                c.forwarderCompany?.id === partnerId ||
                c.customerCompany?.id === partnerId
            );
            setContracts(filtered);
        } catch (error) {
            console.error('Failed to fetch contracts:', error);
        } finally {
            setContractsLoading(false);
        }
    };

    // ===== Addresses =====
    const fetchAddresses = async () => {
        setAddressesLoading(true);
        try {
            const res = await api.get('/locations');
            setAddresses((res.data || []).filter((l: any) => l.companyId === partnerId));
            setAddressesLoaded(true);
        } catch (error) {
            toast.error('Ошибка загрузки адресов');
        } finally {
            setAddressesLoading(false);
        }
    };

    const openAddressCreate = () => {
        setEditingAddress(null);
        addressForm.resetFields();
        setAddressModalOpen(true);
    };

    const openAddressEdit = (record: any) => {
        setEditingAddress(record);
        setAddressModalOpen(true);
    };

    const handleAddressSubmit = async (values: any) => {
        try {
            const payload = { ...values, emails: values.emails ? values.emails.join(',') : null };
            if (editingAddress) {
                await api.put(`/locations/${editingAddress.id}`, payload);
                toast.success('Адрес обновлён');
            } else {
                await api.post('/locations', payload);
                toast.success('Адрес добавлен');
            }
            setAddressModalOpen(false);
            setEditingAddress(null);
            addressForm.resetFields();
            fetchAddresses();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка сохранения адреса');
        }
    };

    const handleAddressDelete = async (id: string) => {
        try {
            await api.delete(`/locations/${id}`);
            toast.success('Адрес удалён');
            fetchAddresses();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка удаления адреса');
        }
    };

    // ===== Partner Edit =====
    const handleEditPartner = () => {
        editForm.setFieldsValue(partner);
        setEditModalOpen(true);
    };

    const handleSavePartner = async (values: any) => {
        setEditSubmitting(true);
        try {
            await api.patch(`/external-companies/${partnerId}`, values);
            toast.success('Данные контрагента обновлены');
            setEditModalOpen(false);
            fetchPartner();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка сохранения');
        } finally {
            setEditSubmitting(false);
        }
    };

    // ===== Driver CRUD =====
    const openDriverCreate = () => {
        setEditingDriver(null);
        driverForm.resetFields();
        setDriverModalOpen(true);
    };

    const openDriverEdit = (driver: any) => {
        setEditingDriver(driver);
        driverForm.setFieldsValue({
            ...driver,
            docIssuedAt: driver.docIssuedAt ? dayjs(driver.docIssuedAt) : null,
            docExpiresAt: driver.docExpiresAt ? dayjs(driver.docExpiresAt) : null,
        });
        setDriverModalOpen(true);
    };

    const handleDriverSave = async (values: any) => {
        setDriverSubmitting(true);
        const body = {
            ...values,
            docIssuedAt: values.docIssuedAt ? values.docIssuedAt.toISOString() : undefined,
            docExpiresAt: values.docExpiresAt ? values.docExpiresAt.toISOString() : undefined,
        };

        try {
            if (editingDriver) {
                await api.put(`/company/drivers/${editingDriver.id}`, body);
                toast.success('Данные водителя обновлены');
            } else {
                const res = await api.post('/company/drivers', {
                    ...body,
                    companyId: partnerId,
                });
                if (res.data?.alreadyExists) {
                    toast.info('Использован существующий водитель');
                } else {
                    toast.success('Водитель добавлен');
                }
            }
            setDriverModalOpen(false);
            driverForm.resetFields();
            setEditingDriver(null);
            fetchDrivers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка сохранения водителя');
        } finally {
            setDriverSubmitting(false);
        }
    };

    const handleDriverDeactivate = async (driverId: string) => {
        try {
            await api.delete(`/company/drivers/${driverId}`);
            toast.success('Водитель деактивирован');
            fetchDrivers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка деактивации водителя');
        }
    };

    // ===== Status labels =====
    const statusColors: Record<string, string> = {
        DRAFT: 'default', PENDING: 'orange', ACTIVE: 'green',
        APPROVED: 'green', EXPIRED: 'red', TERMINATED: 'red', REJECTED: 'red',
    };
    const statusLabels: Record<string, string> = {
        DRAFT: 'Черновик', PENDING: 'На согласовании', ACTIVE: 'Активен',
        APPROVED: 'Утверждено', EXPIRED: 'Истёк', TERMINATED: 'Расторгнут', REJECTED: 'Отклонено',
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <Loader size="large" />
            </div>
        );
    }

    if (!partner) return null;

    // ===== Profile Tab =====
    const profileContent = (
        <div>
            <Descriptions
                column={{ xs: 1, sm: 2, md: 2 }}
                bordered
                size="middle"
                title={
                    <Space>
                        <Text strong style={{ fontSize: 16 }}>Данные контрагента</Text>
                        {partner.isCustomer && <span className={nova.chip}>Заказчик</span>}
                        {partner.isCarrier && <span className={nova.chip}>Перевозчик</span>}
                        {!isExternal && <span className={nova.chip}>В системе</span>}
                    </Space>
                }
                extra={
                    isExternal && (
                        <Button icon={<EditOutlined />} onClick={handleEditPartner}>
                            Редактировать
                        </Button>
                    )
                }
            >
                <Descriptions.Item label="Название">{partner.name || '—'}</Descriptions.Item>
                <Descriptions.Item label="БИН/ИИН">{partner.bin || '—'}</Descriptions.Item>
                <Descriptions.Item label="Телефон">{partner.phone || '—'}</Descriptions.Item>
                <Descriptions.Item label="Email">{partner.email || '—'}</Descriptions.Item>
                <Descriptions.Item label="Адрес" span={2}>{partner.address || '—'}</Descriptions.Item>
                {partner.directorName && (
                    <Descriptions.Item label="ФИО руководителя" span={2}>{partner.directorName}</Descriptions.Item>
                )}
            </Descriptions>
        </div>
    );

    // ===== Contracts Tab =====
    const contractColumns = [
        {
            title: '№ Договора',
            dataIndex: 'contractNumber',
            key: 'contractNumber',
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: 'Контрагент',
            key: 'counterparty',
            render: (_: any, record: any) => {
                const other = record.forwarderCompany?.id === partnerId
                    ? record.customerCompany
                    : record.forwarderCompany;
                return other?.name || '—';
            }
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <StatusPill status={status} />
            )
        },
        {
            title: 'Период',
            key: 'period',
            render: (_: any, record: any) => {
                if (!record.startDate) return '—';
                return `${dayjs(record.startDate).format('DD.MM.YYYY')}${record.endDate ? ` — ${dayjs(record.endDate).format('DD.MM.YYYY')}` : ''}`;
            }
        },
    ];

    const contractsContent = (
        <div>
            <Table
                columns={contractColumns}
                dataSource={contracts}
                rowKey="id"
                loading={contractsLoading}
                locale={{ emptyText: <Empty description="Нет договоров с этим контрагентом" /> }}
                onRow={(record) => ({
                    onClick: () => router.push('/company/contracts'),
                    style: { cursor: 'pointer' },
                })}
            />
        </div>
    );

    // ===== Drivers Tab =====
    const driverColumns = [
        {
            title: 'ФИО водителя',
            key: 'fullName',
            render: (_: any, record: any) => (
                <Space>
                    <Avatar size="small" icon={<UserOutlined />} style={{ backgroundColor: '#8c8c8c' }} />
                    <Text strong>{`${record.lastName} ${record.firstName} ${record.middleName || ''}`.trim()}</Text>
                </Space>
            )
        },
        {
            title: 'Телефон',
            dataIndex: 'phone',
            key: 'phone',
            render: (text: string) => text || '—'
        },
        {
            title: 'ИИН',
            dataIndex: 'iin',
            key: 'iin',
            render: (text: string) => text || '—'
        },
        {
            title: 'Транспорт',
            key: 'vehicle',
            render: (_: any, record: any) => {
                if (!record.vehiclePlate && !record.vehicleModel) return '—';
                return (
                    <Space direction="vertical" size={0}>
                        <Text>{record.vehicleModel || 'Без модели'}</Text>
                        <span className={nova.chip}>{record.vehiclePlate}</span>
                        {record.trailerNumber && <span className={nova.chip}>Прицеп: {record.trailerNumber}</span>}
                    </Space>
                );
            }
        },
        {
            title: 'Тип кузова',
            dataIndex: 'vehicleType',
            key: 'vehicleType',
            render: (text: string) => text ? <span className={nova.chip}>{text}</span> : '—'
        },
        {
            title: 'Действия',
            key: 'actions',
            width: 180,
            render: (_: any, record: any) => (
                <Space>
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openDriverEdit(record)}
                        style={{ padding: 0 }}
                    >
                        Изменить
                    </Button>
                    <Popconfirm
                        title="Деактивировать водителя?"
                        onConfirm={() => handleDriverDeactivate(record.id)}
                        okText="Да"
                        cancelText="Нет"
                    >
                        <Button
                            type="link"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            style={{ padding: 0 }}
                        >
                            Деактивировать
                        </Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const driversContent = (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text strong style={{ fontSize: 15 }}>
                    Водители перевозчика «{partner.name}»
                </Text>
                <Button
                    type="primary"
                    icon={<UserAddOutlined />}
                    onClick={openDriverCreate}
                >
                    Добавить водителя
                </Button>
            </div>
            <Table
                columns={driverColumns}
                dataSource={drivers}
                rowKey="id"
                loading={driversLoading}
                locale={{ emptyText: <Empty description="У этого перевозчика пока нет водителей" /> }}
            />
        </div>
    );

    // ===== Transport Tab =====
    const transportData = drivers
        .filter((d: any) => d.vehiclePlate || d.vehicleModel)
        .map((d: any) => ({
            id: d.id,
            model: d.vehicleModel || '—',
            plate: d.vehiclePlate || '—',
            trailerNumber: d.trailerNumber,
            type: d.vehicleType || '—',
            driverName: `${d.lastName} ${d.firstName}`.trim(),
        }));

    const transportColumns = [
        {
            title: 'Модель ТС',
            dataIndex: 'model',
            key: 'model',
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: 'Госномер авто',
            dataIndex: 'plate',
            key: 'plate',
            render: (text: string) => (
                <Text type="danger" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{text}</Text>
            ),
        },
        {
            title: 'Номер прицепа',
            dataIndex: 'trailerNumber',
            key: 'trailerNumber',
            render: (text: string) => text ? <Text style={{ fontFamily: 'monospace' }}>{text}</Text> : <Text type="secondary">—</Text>,
        },
        {
            title: 'Тип транспорта',
            dataIndex: 'type',
            key: 'type',
        },
        {
            title: 'Водитель',
            dataIndex: 'driverName',
            key: 'driverName',
        },
    ];

    const transportContent = (
        <div>
            <Table
                columns={transportColumns}
                dataSource={transportData}
                rowKey="id"
                loading={driversLoading}
                locale={{ emptyText: <Empty description="У этого перевозчика нет транспорта" /> }}
            />
        </div>
    );

    // ===== Addresses Tab =====
    const addressColumns = [
        {
            title: 'Адрес',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: any) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Space size={6}>
                        <EnvironmentOutlined style={{ color: '#1677ff' }} />
                        <Text strong>{text}</Text>
                    </Space>
                    {record.address && (
                        <span style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>
                            {record.city ? `${record.city}, ` : ''}{record.address}
                        </span>
                    )}
                </div>
            ),
        },
        {
            title: 'Контакт',
            key: 'contact',
            render: (_: any, r: any) => (r.contactName || r.contactPhone) ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {r.contactName && <span style={{ fontSize: 13 }}>{r.contactName}</span>}
                    {r.contactPhone && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{r.contactPhone}</span>}
                </div>
            ) : <Text type="secondary">—</Text>,
        },
        {
            title: '',
            key: 'actions',
            width: 100,
            align: 'right' as const,
            render: (_: any, r: any) => (
                <Space>
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openAddressEdit(r)} style={{ padding: 0 }} />
                    <Popconfirm title="Удалить адрес?" onConfirm={() => handleAddressDelete(r.id)} okText="Да" cancelText="Нет">
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ padding: 0 }} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const addressesContent = (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                <Text strong style={{ fontSize: 15 }}>Адреса контрагента «{partner.name}»</Text>
                <Button type="primary" icon={<PlusOutlined />} onClick={openAddressCreate}>
                    Добавить адрес контрагенту
                </Button>
            </div>
            <Table
                columns={addressColumns}
                dataSource={addresses}
                rowKey="id"
                loading={addressesLoading}
                locale={{ emptyText: <Empty description="У этого контрагента пока нет адресов" /> }}
            />
        </div>
    );

    // ===== Tab items =====
    // «Запросы» стоят сразу после профиля намеренно: менеджер приходит в
    // карточку клиента именно тогда, когда тот прислал запрос на расчёт,
    // и лезть за этим в отдельный раздел ему незачем.
    // Право «Бухгалтерия» — та самая галочка сотруднику. Условия расчётов
    // видны всем, кто открыл карточку (менеджеру полезно знать, с НДС
    // контрагент или нет), а менять их может только бухгалтер.
    const mayAccount = canAccounting(user);

    const settlementsContent = (
        <PartnerSettlementTerms
            partner={partner}
            canEdit={mayAccount && isExternal}
            onSaved={(terms) => setPartner((prev: any) => ({ ...prev, ...terms }))}
        />
    );

    const tabItems: any[] = [
        { key: 'profile', label: 'Профиль', children: profileContent },
        { key: 'settlements', label: 'Расчёты', children: settlementsContent },
        { key: 'quotes', label: 'Запросы', children: <QuoteRequestsPanel customerCompanyId={partnerId} /> },
        { key: 'contracts', label: 'Договоры', children: contractsContent },
        { key: 'addresses', label: `Адреса${addressesLoaded ? ` (${addresses.length})` : ''}`, children: addressesContent },
    ];

    if (partner.isCarrier) {
        tabItems.push(
            { key: 'drivers', label: `Водители (${drivers.length})`, children: driversContent },
            { key: 'transport', label: `Транспорт (${transportData.length})`, children: transportContent },
        );
    }

    return (
        <div className={nova.page}>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Справочники · Контрагенты</div>
                    <h1 className={nova.title}>{partner.name}</h1>
                    <p className={nova.subtitle}>
                        {[
                            partner.bin ? `БИН ${partner.bin}` : null,
                            [
                                partner.isCustomer ? 'заказчик' : null,
                                partner.isCarrier ? 'перевозчик' : null,
                            ].filter(Boolean).join(' и ') || null,
                            isExternal ? null : 'работает на платформе',
                            // Условия расчётов — первое, что о контрагенте
                            // нужно знать в работе, поэтому они в подписи, а
                            // не спрятаны во вкладке.
                            vatLabel(partner.vatPayer, partner.vatPayer ? Number(partner.vatRate) : null),
                        ].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <div className={nova.heroActions}>
                    <button
                        type="button"
                        className={nova.action}
                        onClick={() => router.push('/company/partners')}
                    >
                        Назад к списку
                    </button>
                    {isExternal && (
                        <button
                            type="button"
                            className={`${nova.action} ${nova.actionPrimary}`}
                            onClick={handleEditPartner}
                        >
                            Редактировать
                        </button>
                    )}
                </div>
            </div>

            <PillTabs active={activeTab} onChange={setActiveTab} items={tabItems} />

            {/* Edit Partner Modal */}
            <Modal
                title="Редактировать контрагента"
                open={editModalOpen}
                onCancel={() => { setEditModalOpen(false); editForm.resetFields(); }}
                onOk={() => editForm.submit()}
                confirmLoading={editSubmitting}
                okText="Сохранить"
                cancelText="Отмена"
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    onFinish={handleSavePartner}
                    onValuesChange={async (changedValues) => {
                        if (changedValues.bin && /^\d{12}$/.test(changedValues.bin)) {
                            try {
                                const res = await api.get(`/auth/company-lookup/${changedValues.bin}`);
                                if (res.data) {
                                    const updateObj: any = {};
                                    if (res.data.name) updateObj.name = res.data.name;
                                    if (res.data.phone) updateObj.phone = res.data.phone;
                                    if (res.data.email) updateObj.email = res.data.email;
                                    if (res.data.address) updateObj.address = res.data.address;
                                    if (res.data.directorName) updateObj.directorName = res.data.directorName;
                                    editForm.setFieldsValue(updateObj);
                                    toast.success('Реквизиты компании подтянуты');
                                }
                            } catch {}
                        }
                    }}
                >
                    <Form.Item name="name" label="Название компании" rules={[{ required: true, message: 'Введите название' }]}>
                        <Input placeholder="ТОО Пример" />
                    </Form.Item>
                    <Form.Item
                        name="bin" label="БИН/ИИН"
                        rules={[
                            { required: true, message: 'Введите БИН/ИИН' },
                            { pattern: /^\d{12}$/, message: 'Должен состоять ровно из 12 цифр' }
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
                    <Form.Item name="address" label="Юридический адрес">
                        <Input placeholder="г. Алматы, ул. Толе би 50" />
                    </Form.Item>
                    <Form.Item name="directorName" label="ФИО руководителя">
                        <Input placeholder="Иванов Иван Иванович" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Driver Add/Edit Modal */}
            <Modal
                title={editingDriver ? 'Редактировать водителя' : 'Новый водитель'}
                open={driverModalOpen}
                onCancel={() => { setDriverModalOpen(false); setEditingDriver(null); driverForm.resetFields(); }}
                onOk={() => driverForm.submit()}
                confirmLoading={driverSubmitting}
                okText="Сохранить"
                cancelText="Отмена"
                width={700}
                style={{ top: 40 }}
            >
                <Form
                    form={driverForm}
                    layout="vertical"
                    onFinish={handleDriverSave}
                >
                    <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary, marginTop: 0 }}>Данные водителя</Divider>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="lastName" label="Фамилия" rules={[{ required: true, message: 'Введите фамилию' }]}>
                                <Input placeholder="Иванов" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="firstName" label="Имя" rules={[{ required: true, message: 'Введите имя' }]}>
                                <Input placeholder="Иван" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="middleName" label="Отчество">
                                <Input placeholder="Иванович" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="phone" label="Телефон" rules={[{ required: true, message: 'Введите телефон' }]}>
                                <Input placeholder="+77001234567" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="iin" label="ИИН">
                                <Input placeholder="123456789012" maxLength={12} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Транспортное средство</Divider>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="vehicleType" label="Тип транспорта">
                                <Select
                                    placeholder="Выберите тип кузова"
                                    options={VEHICLE_TYPES.map(t => ({ label: t, value: t }))}
                                    showSearch
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="vehicleModel" label="Модель автомобиля">
                                <Input placeholder="Volvo FH12" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="vehiclePlate" label="Госномер автомобиля" rules={[{ required: true, message: 'Введите госномер' }]}>
                                <Input placeholder="123 ABC 01" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="trailerNumber" label="Госномер прицепа">
                                <Input placeholder="1234 XX 01" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Divider orientation="left" style={{ fontSize: 13, color: token.colorPrimary }}>Документы</Divider>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="docType" label="Тип документа">
                                <Select placeholder="Выберите документ">
                                    <Select.Option value="ID_CARD">Удостоверение личности</Select.Option>
                                    <Select.Option value="PASSPORT">Паспорт</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="docNumber" label="Номер документа">
                                <Input placeholder="012345678" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="docIssuedAt" label="Дата выдачи">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="ДД.ММ.ГГГГ" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="docExpiresAt" label="Срок действия">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" placeholder="ДД.ММ.ГГГГ" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="docIssuedBy" label="Кем выдан">
                                <Input placeholder="МВД РК" />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>

            {/* Address Add/Edit Modal */}
            <Modal
                title={editingAddress ? 'Редактирование адреса' : 'Добавление нового адреса'}
                open={addressModalOpen}
                onCancel={() => { setAddressModalOpen(false); setEditingAddress(null); addressForm.resetFields(); }}
                onOk={() => addressForm.submit()}
                okText="Сохранить адрес"
                cancelText="Отмена"
                width={850}
                centered
                destroyOnClose
            >
                <div style={{ marginTop: 16 }}>
                    <LocationForm
                        form={addressForm}
                        editingLocation={editingAddress}
                        defaultCompanyId={editingAddress ? undefined : partnerId}
                        onFinish={handleAddressSubmit}
                        showCompanySelect={true}
                    />
                </div>
            </Modal>
        </div>
    );
}
