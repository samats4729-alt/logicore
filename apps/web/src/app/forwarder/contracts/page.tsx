'use client';

import { useEffect, useState } from 'react';
import {
    Table, Card, Button, Tag, Space, Modal, Form, Input, InputNumber,
    Select, DatePicker, message, Typography, Collapse, Descriptions,
    Popconfirm, Divider, Empty, Badge, Row, Col, Tooltip, Tabs
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, SendOutlined, EditOutlined,
    FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Panel } = Collapse;

interface CityRef {
    id: string;
    name: string;
    region?: { name: string };
    country?: { name: string };
}

interface RouteTariff {
    id: string;
    originCity: CityRef;
    destinationCity: CityRef;
    price: number;
    vehicleType?: string;
    isActive: boolean;
}

interface Agreement {
    id: string;
    agreementNumber: string;
    status: string;
    validFrom?: string;
    validTo?: string;
    notes?: string;
    tariffs: RouteTariff[];
    _count?: { tariffs: number };
}

interface Contract {
    id: string;
    contractNumber: string;
    status: string;
    startDate?: string;
    endDate?: string;
    notes?: string;
    customerCompany: { id: string; name: string; bin?: string };
    forwarderCompany: { id: string; name: string; bin?: string };
    agreements: Agreement[];
}

const statusColors: Record<string, string> = {
    DRAFT: 'default',
    PENDING: 'orange',
    ACTIVE: 'green',
    APPROVED: 'green',
    EXPIRED: 'red',
    TERMINATED: 'red',
    REJECTED: 'red',
};

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'На согласовании',
    ACTIVE: 'Активен',
    APPROVED: 'Утверждено',
    EXPIRED: 'Истёк',
    TERMINATED: 'Расторгнут',
    REJECTED: 'Отклонено',
};

export default function ForwarderContractsPage() {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [contractModalOpen, setContractModalOpen] = useState(false);
    const [agreementModalOpen, setAgreementModalOpen] = useState(false);
    const [tariffModalOpen, setTariffModalOpen] = useState(false);
    const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
    const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
    const [selectedAgreementStatus, setSelectedAgreementStatus] = useState<string>('DRAFT');
    const [cities, setCities] = useState<{ id: string; name: string }[]>([]);
    // Входящие от заказчиков
    const [pendingAgreements, setPendingAgreements] = useState<any[]>([]);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [contractForm] = Form.useForm();
    const [agreementForm] = Form.useForm();
    const [tariffForm] = Form.useForm();

    // Каскадные списки для тарифов: Откуда
    const [countries, setCountries] = useState<any[]>([]);
    const [originRegions, setOriginRegions] = useState<any[]>([]);
    const [originCities, setOriginCities] = useState<any[]>([]);
    const [originCountryId, setOriginCountryId] = useState<string | undefined>();
    const [originRegionId, setOriginRegionId] = useState<string | undefined>();
    // Каскадные списки для тарифов: Куда
    const [destRegions, setDestRegions] = useState<any[]>([]);
    const [destCities, setDestCities] = useState<any[]>([]);
    const [destCountryId, setDestCountryId] = useState<string | undefined>();
    const [destRegionId, setDestRegionId] = useState<string | undefined>();

    const fetchContracts = async () => {
        try {
            const response = await api.get('/contracts');
            setContracts(response.data);
        } catch (error) {
            console.error('Failed to fetch contracts:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPartners = async () => {
        try {
            const response = await api.get('/partners');
            setPartners(response.data);
        } catch (error) {
            console.error('Failed to fetch partners:', error);
        }
    };

    const fetchCountries = async () => {
        try {
            const res = await api.get('/cities/countries');
            setCountries(res.data);
        } catch (error) {
            console.error('Failed to fetch countries:', error);
        }
    };

    const fetchRegions = async (countryId: string, direction: 'origin' | 'dest') => {
        try {
            const res = await api.get(`/cities/regions?countryId=${countryId}`);
            if (direction === 'origin') setOriginRegions(res.data);
            else setDestRegions(res.data);
        } catch (error) {
            console.error('Failed to fetch regions:', error);
        }
    };

    const fetchCitiesByRegion = async (regionId: string, direction: 'origin' | 'dest') => {
        try {
            const res = await api.get('/cities', { params: { regionId } });
            const mapped = res.data.map((c: any) => ({ id: c.id, name: c.name }));
            if (direction === 'origin') setOriginCities(mapped);
            else setDestCities(mapped);
        } catch (error) {
            console.error('Failed to fetch cities:', error);
        }
    };

    const fetchCities = async (search?: string) => {
        try {
            const response = await api.get('/cities', { params: { search } });
            setCities(response.data.map((c: any) => ({
                id: c.id,
                name: c.name + (c.region?.name ? `, ${c.region.name}` : ''),
            })));
        } catch (error) {
            console.error('Failed to fetch cities:', error);
        }
    };

    // Обработчики каскадного выбора — Откуда
    const handleOriginCountryChange = (countryId: string) => {
        setOriginCountryId(countryId);
        setOriginRegionId(undefined);
        setOriginRegions([]);
        setOriginCities([]);
        tariffForm.setFieldsValue({ originRegionId: undefined, originCityId: undefined });
        fetchRegions(countryId, 'origin');
    };

    const handleOriginRegionChange = (regionId: string) => {
        setOriginRegionId(regionId);
        setOriginCities([]);
        tariffForm.setFieldsValue({ originCityId: undefined });
        fetchCitiesByRegion(regionId, 'origin');
    };

    // Обработчики каскадного выбора — Куда
    const handleDestCountryChange = (countryId: string) => {
        setDestCountryId(countryId);
        setDestRegionId(undefined);
        setDestRegions([]);
        setDestCities([]);
        tariffForm.setFieldsValue({ destRegionId: undefined, destinationCityId: undefined });
        fetchRegions(countryId, 'dest');
    };

    const handleDestRegionChange = (regionId: string) => {
        setDestRegionId(regionId);
        setDestCities([]);
        tariffForm.setFieldsValue({ destinationCityId: undefined });
        fetchCitiesByRegion(regionId, 'dest');
    };

    const fetchPendingAgreements = async () => {
        try {
            const res = await api.get('/contracts/pending-agreements');
            setPendingAgreements(res.data);
        } catch (error) { console.error('Failed to fetch pending agreements:', error); }
    };

    const handleApprove = async (agreementId: string) => {
        try {
            await api.put(`/contracts/agreements/${agreementId}/approve`);
            message.success('Доп. соглашение утверждено!');
            fetchContracts();
            fetchPendingAgreements();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка утверждения');
        }
    };

    const openRejectModal = (agreementId: string) => {
        setRejectingId(agreementId);
        setRejectReason('');
        setRejectModalOpen(true);
    };

    const handleReject = async () => {
        if (!rejectingId) return;
        try {
            await api.put(`/contracts/agreements/${rejectingId}/reject`, { reason: rejectReason });
            message.success('Доп. соглашение отклонено');
            setRejectModalOpen(false);
            fetchContracts();
            fetchPendingAgreements();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка при отклонении');
        }
    };

    useEffect(() => {
        fetchContracts();
        fetchPartners();
        fetchCountries();
        fetchCities();
        fetchPendingAgreements();
    }, []);

    // ==================== CONTRACTS ====================
    const handleCreateContract = async (values: any) => {
        try {
            await api.post('/contracts', {
                customerCompanyId: values.customerCompanyId,
                contractNumber: values.contractNumber,
                startDate: values.startDate?.toISOString(),
                endDate: values.endDate?.toISOString(),
                notes: values.notes,
            });
            message.success('Договор создан');
            setContractModalOpen(false);
            contractForm.resetFields();
            fetchContracts();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания договора');
        }
    };

    // ==================== AGREEMENTS ====================
    const openAgreementModal = (contractId: string) => {
        setSelectedContractId(contractId);
        agreementForm.resetFields();
        setAgreementModalOpen(true);
    };

    const handleCreateAgreement = async (values: any) => {
        if (!selectedContractId) return;
        try {
            await api.post(`/contracts/${selectedContractId}/agreements`, {
                agreementNumber: values.agreementNumber,
                validFrom: values.validFrom?.toISOString(),
                validTo: values.validTo?.toISOString(),
                notes: values.notes,
            });
            message.success('Доп. соглашение создано');
            setAgreementModalOpen(false);
            agreementForm.resetFields();
            fetchContracts();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка создания');
        }
    };

    const sendForApproval = async (agreementId: string) => {
        try {
            await api.put(`/contracts/agreements/${agreementId}/send`);
            message.success('Отправлено на согласование заказчику');
            fetchContracts();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка отправки');
        }
    };

    // ==================== TARIFFS ====================
    const openTariffModal = (agreementId: string, agreementStatus?: string) => {
        setSelectedAgreementId(agreementId);
        setSelectedAgreementStatus(agreementStatus || 'DRAFT');
        tariffForm.resetFields();
        // Сброс каскадных стейтов
        setOriginCountryId(undefined);
        setOriginRegionId(undefined);
        setOriginRegions([]);
        setOriginCities([]);
        setDestCountryId(undefined);
        setDestRegionId(undefined);
        setDestRegions([]);
        setDestCities([]);
        setTariffModalOpen(true);
    };

    const handleAddTariff = async (values: any) => {
        if (!selectedAgreementId) return;
        try {
            await api.post(`/contracts/agreements/${selectedAgreementId}/tariffs`, {
                originCityId: values.originCityId,
                destinationCityId: values.destinationCityId,
                price: values.price,
                vehicleType: values.vehicleType,
            });
            if (selectedAgreementStatus === 'APPROVED') {
                message.success('Тариф добавлен. ДС отправлено на повторное согласование заказчику');
            } else {
                message.success('Тариф добавлен');
            }
            setTariffModalOpen(false);
            tariffForm.resetFields();
            fetchContracts();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка добавления тарифа');
        }
    };

    const handleDeleteTariff = async (tariffId: string) => {
        try {
            await api.delete(`/contracts/tariffs/${tariffId}`);
            message.success('Тариф удалён');
            fetchContracts();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка удаления');
        }
    };

    const tariffColumns = [
        {
            title: 'Откуда',
            dataIndex: 'originCity',
            key: 'originCity',
            render: (city: CityRef) => <Text strong>{city?.name}{city?.region ? <Text type="secondary" style={{ fontSize: 12 }}> ({city.region.name})</Text> : ''}</Text>,
        },
        {
            title: 'Куда',
            dataIndex: 'destinationCity',
            key: 'destinationCity',
            render: (city: CityRef) => <Text strong>{city?.name}{city?.region ? <Text type="secondary" style={{ fontSize: 12 }}> ({city.region.name})</Text> : ''}</Text>,
        },
        {
            title: 'Стоимость',
            dataIndex: 'price',
            key: 'price',
            render: (price: number) => (
                <Text type="success" strong>
                    {price.toLocaleString('ru-RU')} ₸
                </Text>
            ),
        },
        {
            title: 'Тип кузова',
            dataIndex: 'vehicleType',
            key: 'vehicleType',
            render: (type: string) => type || <Text type="secondary">Любой</Text>,
        },
        {
            title: '',
            key: 'actions',
            width: 50,
            render: (_: any, record: RouteTariff) => (
                <Popconfirm title="Удалить тариф?" onConfirm={() => handleDeleteTariff(record.id)}>
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>
            ),
        },
    ];

    const pendingCount = pendingAgreements.length;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0 }}>Договоры и тарифы</Title>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                        contractForm.resetFields();
                        setContractModalOpen(true);
                    }}
                >
                    Новый договор
                </Button>
            </div>

            <Tabs
                defaultActiveKey={pendingCount > 0 ? 'pending' : 'contracts'}
                items={[
                    {
                        key: 'pending',
                        label: (
                            <Badge count={pendingCount} offset={[10, 0]}>
                                <span>Входящие на согласование</span>
                            </Badge>
                        ),
                        children: (
                            <>
                                {pendingAgreements.length === 0 ? (
                                    <Empty description="Нет входящих доп. соглашений от заказчиков" />
                                ) : (
                                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                                        {pendingAgreements.map((agreement: any) => (
                                            <Card
                                                key={agreement.id}
                                                title={
                                                    <Space>
                                                        <ExclamationCircleOutlined style={{ color: '#faad14' }} />
                                                        <span>ДС №{agreement.agreementNumber}</span>
                                                        <Tag color="orange">На согласовании</Tag>
                                                        <Tag>{agreement.proposedBy === 'CUSTOMER' ? 'От заказчика' : 'От экспедитора'}</Tag>
                                                    </Space>
                                                }
                                                extra={
                                                    <Text type="secondary">
                                                        От: <Text strong>
                                                            {agreement.proposedBy === 'CUSTOMER'
                                                                ? agreement.contract?.customerCompany?.name
                                                                : agreement.contract?.forwarderCompany?.name}
                                                        </Text>
                                                    </Text>
                                                }
                                            >
                                                {agreement.validFrom && (
                                                    <div style={{ marginBottom: 8 }}>
                                                        <Text type="secondary">
                                                            Период: {dayjs(agreement.validFrom).format('DD.MM.YYYY')}
                                                            {agreement.validTo && ` — ${dayjs(agreement.validTo).format('DD.MM.YYYY')}`}
                                                        </Text>
                                                    </div>
                                                )}

                                                <Title level={5}>Предлагаемые тарифы</Title>
                                                <Table
                                                    columns={tariffColumns.filter(c => c.key !== 'actions')}
                                                    dataSource={agreement.tariffs}
                                                    rowKey="id"
                                                    pagination={false}
                                                    size="small"
                                                />

                                                <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                                                    <Button
                                                        type="primary"
                                                        icon={<CheckCircleOutlined />}
                                                        onClick={() => handleApprove(agreement.id)}
                                                        style={{ background: '#52c41a', borderColor: '#52c41a' }}
                                                    >
                                                        Утвердить
                                                    </Button>
                                                    <Button
                                                        danger
                                                        icon={<CloseCircleOutlined />}
                                                        onClick={() => openRejectModal(agreement.id)}
                                                    >
                                                        Отклонить
                                                    </Button>
                                                </div>
                                            </Card>
                                        ))}
                                    </Space>
                                )}
                            </>
                        ),
                    },
                    {
                        key: 'contracts',
                        label: 'Все договоры',
                        children: (
                            <>
                                {contracts.length === 0 && !loading ? (
                                    <Empty description="Нет договоров. Создайте первый договор с заказчиком." />
                                ) : (
                                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                                        {contracts.map(contract => (
                                            <Card
                                                key={contract.id}
                                                title={
                                                    <Space>
                                                        <FileTextOutlined />
                                                        <span>Договор №{contract.contractNumber}</span>
                                                        <Tag color={statusColors[contract.status]}>{statusLabels[contract.status]}</Tag>
                                                    </Space>
                                                }
                                                extra={
                                                    <Text type="secondary">
                                                        Заказчик: <Text strong>{contract.customerCompany.name}</Text>
                                                    </Text>
                                                }
                                            >
                                                {contract.startDate && (
                                                    <div style={{ marginBottom: 12 }}>
                                                        <Text type="secondary">
                                                            Период: {dayjs(contract.startDate).format('DD.MM.YYYY')}
                                                            {contract.endDate && ` — ${dayjs(contract.endDate).format('DD.MM.YYYY')}`}
                                                        </Text>
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                    <Title level={5} style={{ margin: 0 }}>Доп. соглашения</Title>
                                                    <Button
                                                        size="small"
                                                        icon={<PlusOutlined />}
                                                        onClick={() => openAgreementModal(contract.id)}
                                                    >
                                                        Добавить
                                                    </Button>
                                                </div>

                                                {contract.agreements.length === 0 ? (
                                                    <Empty
                                                        description="Нет доп. соглашений"
                                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                        style={{ margin: '12px 0' }}
                                                    />
                                                ) : (
                                                    <Collapse accordion>
                                                        {contract.agreements.map(agreement => (
                                                            <Panel
                                                                key={agreement.id}
                                                                header={
                                                                    <Space>
                                                                        <span>ДС №{agreement.agreementNumber}</span>
                                                                        <Tag color={statusColors[agreement.status]}>
                                                                            {statusLabels[agreement.status]}
                                                                        </Tag>
                                                                        <Badge
                                                                            count={agreement.tariffs?.length || agreement._count?.tariffs || 0}
                                                                            style={{ backgroundColor: '#52c41a' }}
                                                                            overflowCount={99}
                                                                        />
                                                                    </Space>
                                                                }
                                                                extra={
                                                                    agreement.status === 'DRAFT' ? (
                                                                        <Space onClick={e => e.stopPropagation()}>
                                                                            <Tooltip title="Отправить на согласование заказчику">
                                                                                <Button
                                                                                    size="small"
                                                                                    type="primary"
                                                                                    icon={<SendOutlined />}
                                                                                    onClick={() => sendForApproval(agreement.id)}
                                                                                >
                                                                                    Отправить
                                                                                </Button>
                                                                            </Tooltip>
                                                                        </Space>
                                                                    ) : null
                                                                }
                                                            >
                                                                {agreement.validFrom && (
                                                                    <div style={{ marginBottom: 8 }}>
                                                                        <Text type="secondary">
                                                                            Действует: {dayjs(agreement.validFrom).format('DD.MM.YYYY')}
                                                                            {agreement.validTo && ` — ${dayjs(agreement.validTo).format('DD.MM.YYYY')}`}
                                                                        </Text>
                                                                    </div>
                                                                )}

                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                                    <Text strong>Тарифы по направлениям</Text>
                                                                    {(agreement.status === 'DRAFT' || agreement.status === 'APPROVED') && (
                                                                        <Button
                                                                            size="small"
                                                                            icon={<PlusOutlined />}
                                                                            onClick={() => openTariffModal(agreement.id, agreement.status)}
                                                                        >
                                                                            Добавить тариф
                                                                        </Button>
                                                                    )}
                                                                </div>

                                                                {agreement.tariffs && agreement.tariffs.length > 0 ? (
                                                                    <Table
                                                                        columns={tariffColumns}
                                                                        dataSource={agreement.tariffs}
                                                                        rowKey="id"
                                                                        pagination={false}
                                                                        size="small"
                                                                    />
                                                                ) : (
                                                                    <Empty
                                                                        description="Нет тарифов. Добавьте хотя бы один тариф."
                                                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                                    />
                                                                )}
                                                            </Panel>
                                                        ))}
                                                    </Collapse>
                                                )}
                                            </Card>
                                        ))}
                                    </Space>
                                )}
                            </>
                        ),
                    },
                ]}
            />

            {/* Модал отклонения */}
            <Modal
                title="Отклонить доп. соглашение"
                open={rejectModalOpen}
                onCancel={() => setRejectModalOpen(false)}
                onOk={handleReject}
                okText="Отклонить"
                okButtonProps={{ danger: true }}
                cancelText="Отмена"
            >
                <div style={{ marginBottom: 12 }}>
                    <Text>Укажите причину отклонения (необязательно):</Text>
                </div>
                <Input.TextArea
                    rows={3}
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Причина отклонения..."
                />
            </Modal>
            {/* Модал создания договора */}
            <Modal
                title="Новый договор"
                open={contractModalOpen}
                onCancel={() => setContractModalOpen(false)}
                onOk={() => contractForm.submit()}
                okText="Создать"
                cancelText="Отмена"
            >
                <Form form={contractForm} layout="vertical" onFinish={handleCreateContract}>
                    <Form.Item
                        name="customerCompanyId"
                        label="Компания-заказчик"
                        rules={[{ required: true, message: 'Выберите заказчика' }]}
                    >
                        <Select
                            placeholder="Выберите компанию"
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={partners.map(p => ({ label: p.name, value: p.id }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="contractNumber"
                        label="Номер договора"
                        rules={[{ required: true, message: 'Введите номер' }]}
                    >
                        <Input placeholder="ДГ-001/2026" />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="startDate" label="Дата начала">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="endDate" label="Дата окончания">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="notes" label="Примечания">
                        <Input.TextArea rows={2} placeholder="Дополнительная информация..." />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Модал создания доп. соглашения */}
            <Modal
                title="Новое доп. соглашение"
                open={agreementModalOpen}
                onCancel={() => setAgreementModalOpen(false)}
                onOk={() => agreementForm.submit()}
                okText="Создать"
                cancelText="Отмена"
            >
                <Form form={agreementForm} layout="vertical" onFinish={handleCreateAgreement}>
                    <Form.Item
                        name="agreementNumber"
                        label="Номер доп. соглашения"
                        rules={[{ required: true, message: 'Введите номер' }]}
                    >
                        <Input placeholder="ДС-1" />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="validFrom" label="Действует с">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="validTo" label="Действует до">
                                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="notes" label="Примечания">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Модал добавления тарифа */}
            <Modal
                title="Добавить тариф по направлению"
                open={tariffModalOpen}
                onCancel={() => setTariffModalOpen(false)}
                onOk={() => tariffForm.submit()}
                okText="Добавить"
                cancelText="Отмена"
                width={600}
            >
                <Form form={tariffForm} layout="vertical" onFinish={handleAddTariff}>
                    {selectedAgreementStatus === 'APPROVED' && (
                        <div style={{
                            background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8,
                            padding: '8px 12px', marginBottom: 16, fontSize: 13
                        }}>
                            ⚠️ Это ДС уже утверждено. После добавления тарифа оно будет автоматически отправлено на повторное согласование заказчику.
                        </div>
                    )}
                    {/* ===== ОТКУДА ===== */}
                    <div style={{ background: '#f0f5ff', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
                        <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#1677ff' }}>📍 Откуда</Typography.Text>
                        <Row gutter={12}>
                            <Col span={8}>
                                <Form.Item
                                    name="originCountryId"
                                    label="Страна"
                                    rules={[{ required: true, message: 'Выберите' }]}
                                    style={{ marginBottom: 8 }}
                                >
                                    <Select
                                        placeholder="Страна"
                                        onChange={handleOriginCountryChange}
                                        options={countries.map((c: any) => ({ label: c.name, value: c.id }))}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    name="originRegionId"
                                    label="Область"
                                    style={{ marginBottom: 8 }}
                                >
                                    <Select
                                        placeholder="Область"
                                        disabled={!originCountryId}
                                        onChange={handleOriginRegionChange}
                                        options={originRegions.map((r: any) => ({ label: r.name, value: r.id }))}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    name="originCityId"
                                    label="Город"
                                    rules={[{ required: true, message: 'Выберите' }]}
                                    style={{ marginBottom: 8 }}
                                >
                                    <Select
                                        showSearch
                                        placeholder="Город"
                                        disabled={!originRegionId}
                                        filterOption={(input, option) =>
                                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                        }
                                        options={originCities.map((c: any) => ({ label: c.name, value: c.id }))}
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>

                    {/* ===== КУДА ===== */}
                    <div style={{ background: '#f6ffed', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
                        <Typography.Text strong style={{ display: 'block', marginBottom: 8, color: '#52c41a' }}>📍 Куда</Typography.Text>
                        <Row gutter={12}>
                            <Col span={8}>
                                <Form.Item
                                    name="destCountryId"
                                    label="Страна"
                                    rules={[{ required: true, message: 'Выберите' }]}
                                    style={{ marginBottom: 8 }}
                                >
                                    <Select
                                        placeholder="Страна"
                                        onChange={handleDestCountryChange}
                                        options={countries.map((c: any) => ({ label: c.name, value: c.id }))}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    name="destRegionId"
                                    label="Область"
                                    style={{ marginBottom: 8 }}
                                >
                                    <Select
                                        placeholder="Область"
                                        disabled={!destCountryId}
                                        onChange={handleDestRegionChange}
                                        options={destRegions.map((r: any) => ({ label: r.name, value: r.id }))}
                                    />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item
                                    name="destinationCityId"
                                    label="Город"
                                    rules={[{ required: true, message: 'Выберите' }]}
                                    style={{ marginBottom: 8 }}
                                >
                                    <Select
                                        showSearch
                                        placeholder="Город"
                                        disabled={!destRegionId}
                                        filterOption={(input, option) =>
                                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                        }
                                        options={destCities.map((c: any) => ({ label: c.name, value: c.id }))}
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>
                    <Form.Item
                        name="price"
                        label="Стоимость (₸)"
                        rules={[{ required: true, message: 'Введите стоимость' }]}
                    >
                        <InputNumber
                            style={{ width: '100%' }}
                            min={0}
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                            parser={value => value!.replace(/\s?|(,*)/g, '') as any}
                            placeholder="150 000"
                        />
                    </Form.Item>
                    <Form.Item name="vehicleType" label="Тип кузова (необязательно)">
                        <Input placeholder="Тент, Реф, Изотерм..." />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
