'use client';

import { useEffect, useState } from 'react';
import {
    Card, Button, Tag, Space, Modal, message, Typography,
    Collapse, Table, Empty, Badge, Input, Tooltip, Tabs,
    Form, Select, DatePicker, InputNumber, Row, Col, Popconfirm, Divider, theme
} from 'antd';
import {
    CheckCircleOutlined, CloseCircleOutlined, FileTextOutlined,
    ExclamationCircleOutlined, PlusOutlined, SendOutlined, DeleteOutlined, DownloadOutlined, EditOutlined
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
    proposedBy?: string;
    validFrom?: string;
    validTo?: string;
    notes?: string;
    tariffs: RouteTariff[];
    _count?: { tariffs: number };
    contract?: {
        forwarderCompany?: { id: string; name: string };
        customerCompany?: { id: string; name: string };
    };
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

export default function CompanyContractsPage() {
    const { token } = theme.useToken();
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [pendingAgreements, setPendingAgreements] = useState<Agreement[]>([]);
    const [loading, setLoading] = useState(true);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    // Создание договора
    const [contractModalOpen, setContractModalOpen] = useState(false);
    const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
    const [contractForm] = Form.useForm();

    // ДС и тарифы — создание
    const [agreementModalOpen, setAgreementModalOpen] = useState(false);
    const [tariffModalOpen, setTariffModalOpen] = useState(false);
    const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
    const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
    const [selectedAgreementStatus, setSelectedAgreementStatus] = useState<string>('DRAFT');
    const [agreementForm] = Form.useForm();
    const [tariffForm] = Form.useForm();

    // Каскадные селекты для тарифов
    const [countries, setCountries] = useState<any[]>([]);
    const [originRegions, setOriginRegions] = useState<any[]>([]);
    const [originCities, setOriginCities] = useState<any[]>([]);
    const [originCountryId, setOriginCountryId] = useState<string | undefined>();
    const [originRegionId, setOriginRegionId] = useState<string | undefined>();
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

    const fetchPendingAgreements = async () => {
        try {
            const response = await api.get('/contracts/pending-agreements');
            setPendingAgreements(response.data);
        } catch (error) {
            console.error('Failed to fetch pending agreements:', error);
        }
    };

    const fetchPartners = async () => {
        try {
            const [partnersRes, externalRes] = await Promise.all([
                api.get('/partners'),
                api.get('/external-companies'),
            ]);
            const partnersList = partnersRes.data.filter((p: any) => p.isCarrier);
            const externalList = externalRes.data
                .filter((e: any) => e.isCarrier)
                .map((e: any) => ({
                    id: e.id,
                    name: e.name,
                    isExternal: true,
                }));
            setPartners([...partnersList, ...externalList]);
        } catch (error) {
            console.error('Failed to fetch partners:', error);
        }
    };

    const fetchCountries = async () => {
        try {
            const res = await api.get('/cities/countries');
            setCountries(res.data);
        } catch (error) { console.error('Failed to fetch countries:', error); }
    };

    const fetchRegions = async (countryId: string, direction: 'origin' | 'dest') => {
        try {
            const res = await api.get(`/cities/regions?countryId=${countryId}`);
            if (direction === 'origin') setOriginRegions(res.data);
            else setDestRegions(res.data);
        } catch (error) { console.error('Failed to fetch regions:', error); }
    };

    const fetchCitiesByRegion = async (regionId: string, direction: 'origin' | 'dest') => {
        try {
            const res = await api.get('/cities', { params: { regionId } });
            const mapped = res.data.map((c: any) => ({ id: c.id, name: c.name }));
            if (direction === 'origin') setOriginCities(mapped);
            else setDestCities(mapped);
        } catch (error) { console.error('Failed to fetch cities:', error); }
    };

    useEffect(() => {
        fetchContracts();
        fetchPendingAgreements();
        fetchCountries();
        fetchPartners();
    }, []);

    // === Создание договора ===
    const handleCreateContract = async (values: any) => {
        try {
            await api.post('/contracts', {
                forwarderCompanyId: values.forwarderCompanyId,
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

    // === PDF ===
    const handleDownloadPdf = async (contractId: string, contractNumber: string) => {
        try {
            const res = await api.get(`/contracts/${contractId}/pdf`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.download = `Договор_${contractNumber}.pdf`;
            link.click();
            window.URL.revokeObjectURL(url);
            message.success('PDF скачан');
        } catch (error) {
            message.error('Ошибка скачивания PDF');
        }
    };

    // === Утверждение / Отклонение ===
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
            await api.put(`/contracts/agreements/${rejectingId}/reject`, {
                reason: rejectReason,
            });
            message.success('Доп. соглашение отклонено');
            setRejectModalOpen(false);
            fetchContracts();
            fetchPendingAgreements();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка при отклонении');
        }
    };

    // === Создание ДС от заказчика ===
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
                validFrom: values.dates?.[0]?.toISOString(),
                validTo: values.dates?.[1]?.toISOString(),
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

    // === Тарифы ===
    const openTariffModal = (agreementId: string, status?: string) => {
        setSelectedAgreementId(agreementId);
        setSelectedAgreementStatus(status || 'DRAFT');
        tariffForm.resetFields();
        setOriginCountryId(undefined); setOriginRegionId(undefined);
        setOriginRegions([]); setOriginCities([]);
        setDestCountryId(undefined); setDestRegionId(undefined);
        setDestRegions([]); setDestCities([]);
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
                message.success('Тариф добавлен. ДС отправлено на повторное согласование');
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

    const sendForApproval = async (agreementId: string) => {
        try {
            await api.put(`/contracts/agreements/${agreementId}/send`);
            message.success('Отправлено на согласование экспедитору');
            fetchContracts();
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Ошибка отправки');
        }
    };

    // Каскадные обработчики
    const handleOriginCountryChange = (countryId: string) => {
        setOriginCountryId(countryId); setOriginRegionId(undefined);
        setOriginRegions([]); setOriginCities([]);
        tariffForm.setFieldsValue({ originRegionId: undefined, originCityId: undefined });
        fetchRegions(countryId, 'origin');
    };
    const handleOriginRegionChange = (regionId: string) => {
        setOriginRegionId(regionId); setOriginCities([]);
        tariffForm.setFieldsValue({ originCityId: undefined });
        fetchCitiesByRegion(regionId, 'origin');
    };
    const handleDestCountryChange = (countryId: string) => {
        setDestCountryId(countryId); setDestRegionId(undefined);
        setDestRegions([]); setDestCities([]);
        tariffForm.setFieldsValue({ destRegionId: undefined, destinationCityId: undefined });
        fetchRegions(countryId, 'dest');
    };
    const handleDestRegionChange = (regionId: string) => {
        setDestRegionId(regionId); setDestCities([]);
        tariffForm.setFieldsValue({ destinationCityId: undefined });
        fetchCitiesByRegion(regionId, 'dest');
    };

    const tariffColumns = [
        {
            title: 'Откуда',
            dataIndex: 'originCity',
            key: 'originCity',
            render: (city: CityRef) => <strong>{city?.name}{city?.region ? <span style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}> ({city.region.name})</span> : ''}</strong>,
        },
        {
            title: 'Куда',
            dataIndex: 'destinationCity',
            key: 'destinationCity',
            render: (city: CityRef) => <strong>{city?.name}{city?.region ? <span style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}> ({city.region.name})</span> : ''}</strong>,
        },
        {
            title: 'Стоимость',
            dataIndex: 'price',
            key: 'price',
            render: (price: number) => (
                <span style={{ color: '#28a745', fontWeight: 600 }}>
                    {price.toLocaleString('ru-RU')} ₸
                </span>
            ),
        },
        {
            title: 'Тип кузова',
            dataIndex: 'vehicleType',
            key: 'vehicleType',
            render: (type: string) => type || <span style={{ color: 'var(--lc-text-ter)' }}>Любой</span>,
        },
    ];

    const pendingCount = pendingAgreements.length;
    const activeContracts = contracts.filter(c => c.status === 'ACTIVE' || c.status === 'APPROVED').length;

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Документы · Договоры</div>
                    <h1 className="lc2-title">Договоры и тарифы</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Управление договорами, доп. соглашениями и тарифными сетками
                    </p>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            contractForm.resetFields();
                            setContractModalOpen(true);
                        }}
                        className="lc-cta"
                    >
                        Новый договор
                    </Button>
                </div>
                <div className="lc2-metrics">
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <FileTextOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Договоры</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {contracts.length}
                            </div>
                            <div className="lc2-msub">всего</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: '#e6ffed', color: '#28a745' }}>
                            <CheckCircleOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">Активных</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {activeContracts}
                            </div>
                            <div className="lc2-msub">действующих</div>
                        </div>
                    </div>
                    <div className="lc2-metric">
                        <div className="lc2-mic" style={{ background: pendingCount > 0 ? '#fff3e0' : '#f1f2f5', color: pendingCount > 0 ? '#e67e22' : '#5f6672' }}>
                            <ExclamationCircleOutlined />
                        </div>
                        <div>
                            <div className="lc2-mlabel">На согласовании</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {pendingCount}
                            </div>
                            <div className="lc2-msub" style={{ color: pendingCount > 0 ? '#e67e22' : '#8a91a0' }}>
                                {pendingCount > 0 ? 'требуют внимания' : 'все согласованы'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== TABS CARD ===== */}
            <div className="lc-card" style={{ padding: 20 }}>
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
                                    <Empty description="Нет входящих доп. соглашений на согласование" />
                                ) : (
                                    <Space direction="vertical" style={{ width: '100%' }} size={16}>
                                        {pendingAgreements.map(agreement => (
                                            <Card
                                                key={agreement.id}
                                                title={
                                                    <Space>
                                                        <ExclamationCircleOutlined style={{ color: token.colorWarning }} />
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
                                                {agreement.notes && (
                                                    <div style={{ marginBottom: 8 }}>
                                                        <Text type="secondary">{agreement.notes}</Text>
                                                    </div>
                                                )}
                                                <Space>
                                                    <Button
                                                        size="small" type="primary"
                                                        style={{ background: token.colorSuccess, borderColor: token.colorSuccess }}
                                                        onClick={() => handleApprove(agreement.id)}
                                                    >
                                                        Утвердить
                                                    </Button>
                                                    <Button size="small" danger onClick={() => openRejectModal(agreement.id)}>
                                                        Отклонить
                                                    </Button>
                                                </Space>
                                            </Card>
                                        ))}
                                    </Space>
                                )}
                            </>
                        ),
                    },
                    {
                        key: 'contracts',
                        label: 'Договоры',
                        children: (
                            <>
                                {contracts.length === 0 ? (
                                    <Empty description="Нет договоров" />
                                ) : (
                                    <Collapse>
                                        {contracts.map(contract => (
                                            <Panel
                                                key={contract.id}
                                                header={
                                                    <Space>
                                                        <FileTextOutlined />
                                                        <span>Договор №{contract.contractNumber}</span>
                                                        <Tag color={statusColors[contract.status]}>
                                                            {statusLabels[contract.status]}
                                                        </Tag>
                                                    </Space>
                                                }
                                                extra={
                                                    <Space>
                                                        <Text type="secondary">
                                                            Экспедитор: <Text strong>{contract.forwarderCompany.name}</Text>
                                                        </Text>
                                                        <Button
                                                            size="small"
                                                            icon={<EditOutlined />}
                                                            onClick={() => window.location.href = `/company/contracts/${contract.id}/edit`}
                                                        >
                                                            Редактировать текст
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            icon={<DownloadOutlined />}
                                                            onClick={() => handleDownloadPdf(contract.id, contract.contractNumber)}
                                                        >
                                                            Скачать PDF
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            icon={<PlusOutlined />}
                                                            onClick={() => openAgreementModal(contract.id)}
                                                        >
                                                            Доп. соглашение
                                                        </Button>
                                                    </Space>
                                                }
                                            >
                                                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                                    {contract.agreements.map(agreement => (
                                                        <Card
                                                            key={agreement.id}
                                                            size="small"
                                                            title={
                                                                <Space>
                                                                    <span>ДС №{agreement.agreementNumber}</span>
                                                                    <Tag color={statusColors[agreement.status]}>
                                                                        {statusLabels[agreement.status]}
                                                                    </Tag>
                                                                    {agreement.proposedBy === 'CUSTOMER' && (
                                                                        <Tag color="blue">Ваше предложение</Tag>
                                                                    )}
                                                                    <Badge
                                                                        count={agreement.tariffs?.length || 0}
                                                                        style={{ backgroundColor: token.colorSuccess }}
                                                                    />
                                                                </Space>
                                                            }
                                                            extra={
                                                                <Space onClick={e => e.stopPropagation()}>
                                                                    {agreement.status === 'PENDING' && agreement.proposedBy === 'FORWARDER' && (
                                                                        <>
                                                                            <Button
                                                                                size="small" type="primary"
                                                                                style={{ background: token.colorSuccess, borderColor: token.colorSuccess }}
                                                                                onClick={() => handleApprove(agreement.id)}
                                                                            >
                                                                                Утвердить
                                                                            </Button>
                                                                            <Button size="small" danger onClick={() => openRejectModal(agreement.id)}>
                                                                                Отклонить
                                                                            </Button>
                                                                        </>
                                                                    )}
                                                                    {agreement.status === 'DRAFT' && agreement.proposedBy === 'CUSTOMER' && (
                                                                        <Tooltip title="Отправить на согласование экспедитору">
                                                                            <Button
                                                                                size="small" type="primary"
                                                                                icon={<SendOutlined />}
                                                                                onClick={() => sendForApproval(agreement.id)}
                                                                            >
                                                                                На согласование
                                                                            </Button>
                                                                        </Tooltip>
                                                                    )}
                                                                    <Button
                                                                        size="small"
                                                                        icon={<PlusOutlined />}
                                                                        onClick={() => openTariffModal(agreement.id, agreement.status)}
                                                                    >
                                                                        Тариф
                                                                    </Button>
                                                                </Space>
                                                            }
                                                        >
                                                            <Table
                                                                columns={tariffColumns}
                                                                dataSource={agreement.tariffs}
                                                                rowKey="id"
                                                                pagination={false}
                                                                size="small"
                                                                locale={{ emptyText: 'Нет тарифов' }}
                                                            />
                                                        </Card>
                                                    ))}
                                                </Space>
                                            </Panel>
                                        ))}
                                    </Collapse>
                                )}
                            </>
                        ),
                    },
                    {
                        key: 'agreements',
                        label: 'Все ДС',
                        children: (
                            <>
                                {contracts.length === 0 ? (
                                    <Empty description="Нет доп. соглашений" />
                                ) : (
                                    <Collapse>
                                        {contracts.flatMap(contract =>
                                            contract.agreements.map(agreement => ({ ...agreement, contract }))
                                        ).map(item => (
                                            <Panel
                                                key={item.id}
                                                header={
                                                    <Space>
                                                        <span>ДС №{item.agreementNumber}</span>
                                                        <Tag color={statusColors[item.status]}>
                                                            {statusLabels[item.status]}
                                                        </Tag>
                                                        {item.proposedBy === 'CUSTOMER' && (
                                                            <Tag color="blue">Ваше предложение</Tag>
                                                        )}
                                                    </Space>
                                                }
                                                extra={
                                                    <Space>
                                                        <Text type="secondary">
                                                            Договор №{item.contract.contractNumber}
                                                        </Text>
                                                    </Space>
                                                }
                                            >
                                                <Table
                                                    columns={tariffColumns}
                                                    dataSource={item.tariffs}
                                                    rowKey="id"
                                                    pagination={false}
                                                    size="small"
                                                    locale={{ emptyText: 'Нет тарифов' }}
                                                />
                                            </Panel>
                                        ))}
                                    </Collapse>
                                )}
                            </>
                        ),
                    },
                ]}
            />
            </div>

            {/* Modal: Создание договора */}
            <Modal
                title="Новый договор"
                open={contractModalOpen}
                onCancel={() => setContractModalOpen(false)}
                onOk={() => contractForm.submit()}
                okText="Создать"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={contractForm} layout="vertical" onFinish={handleCreateContract}>
                    <Form.Item
                        name="forwarderCompanyId"
                        label="Экспедитор (перевозчик)"
                        rules={[{ required: true, message: 'Выберите перевозчика' }]}
                    >
                        <Select
                            showSearch
                            placeholder="Выберите перевозчика"
                            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            options={partners.map(p => ({ label: p.name, value: p.id }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="contractNumber"
                        label="Номер договора"
                        rules={[{ required: true, message: 'Введите номер' }]}
                    >
                        <Input placeholder="Например: Д-2026/001" />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="startDate" label="Дата начала">
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="endDate" label="Дата окончания">
                                <DatePicker style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="notes" label="Примечания">
                        <Input.TextArea rows={3} placeholder="Особые условия..." />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal: Создание Доп. Соглашения */}
            <Modal
                title="Дополнительное соглашение"
                open={agreementModalOpen}
                onCancel={() => setAgreementModalOpen(false)}
                onOk={() => agreementForm.submit()}
                okText="Создать"
                cancelText="Отмена"
                destroyOnClose
            >
                <Form form={agreementForm} layout="vertical" onFinish={handleCreateAgreement}>
                    <Form.Item
                        name="agreementNumber"
                        label="Номер ДС"
                        rules={[{ required: true, message: 'Введите номер' }]}
                    >
                        <Input placeholder="Например: ДС-1" />
                    </Form.Item>
                    <Form.Item name="dates" label="Период действия">
                        <DatePicker.RangePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="notes" label="Примечания">
                        <Input.TextArea rows={3} placeholder="Особые условия..." />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Modal: Добавить тариф */}
            <Modal
                title="Добавить тариф"
                open={tariffModalOpen}
                onCancel={() => setTariffModalOpen(false)}
                onOk={() => tariffForm.submit()}
                okText="Добавить"
                cancelText="Отмена"
                destroyOnClose
                width={700}
            >
                <Form form={tariffForm} layout="vertical" onFinish={handleAddTariff}>
                    <div style={{ background: 'var(--lc-card)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontWeight: 600, marginBottom: 12, color: '#1f2937' }}>Откуда</div>
                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item name="originCountryId" label="Страна" style={{ marginBottom: 8 }}>
                                    <Select placeholder="Страна" onChange={handleOriginCountryChange} options={countries.map((c: any) => ({ label: c.name, value: c.id }))} />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="originRegionId" label="Область" style={{ marginBottom: 8 }}>
                                    <Select placeholder="Область" disabled={!originCountryId} onChange={handleOriginRegionChange} options={originRegions.map((r: any) => ({ label: r.name, value: r.id }))} />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="originCityId" label="Город" rules={[{ required: true, message: 'Выберите' }]} style={{ marginBottom: 8 }}>
                                    <Select showSearch placeholder="Город" disabled={!originRegionId} filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} options={originCities.map((c: any) => ({ label: c.name, value: c.id }))} />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>
                    <div style={{ background: 'var(--lc-card)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontWeight: 600, marginBottom: 12, color: '#1f2937' }}>Куда</div>
                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item name="destCountryId" label="Страна" style={{ marginBottom: 8 }}>
                                    <Select placeholder="Страна" onChange={handleDestCountryChange} options={countries.map((c: any) => ({ label: c.name, value: c.id }))} />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="destRegionId" label="Область" style={{ marginBottom: 8 }}>
                                    <Select placeholder="Область" disabled={!destCountryId} onChange={handleDestRegionChange} options={destRegions.map((r: any) => ({ label: r.name, value: r.id }))} />
                                </Form.Item>
                            </Col>
                            <Col span={8}>
                                <Form.Item name="destinationCityId" label="Город" rules={[{ required: true, message: 'Выберите' }]} style={{ marginBottom: 8 }}>
                                    <Select showSearch placeholder="Город" disabled={!destRegionId} filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} options={destCities.map((c: any) => ({ label: c.name, value: c.id }))} />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>

                    <Form.Item name="price" label="Стоимость (₸)" rules={[{ required: true, message: 'Введите стоимость' }]}>
                        <InputNumber
                            style={{ width: '100%' }} min={0}
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

            {/* Modal: Отклонение */}
            <Modal
                title="Отклонить доп. соглашение"
                open={rejectModalOpen}
                onCancel={() => setRejectModalOpen(false)}
                onOk={handleReject}
                okText="Отклонить"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                destroyOnClose
            >
                <div style={{ marginBottom: 12 }}>
                    <Text type="secondary">Укажите причину отклонения:</Text>
                </div>
                <Input.TextArea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    rows={4}
                    placeholder="Причина отклонения..."
                />
            </Modal>
        </div>
    );
}
