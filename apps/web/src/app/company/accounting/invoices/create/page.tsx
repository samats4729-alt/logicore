'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    Typography,
    Card,
    Form,
    Input,
    Select,
    DatePicker,
    Table,
    Button,
    Space,
    Row,
    Col,
    message,
    theme,
    Spin
} from 'antd';
import {
    ArrowLeftOutlined,
    CheckOutlined,
    FileTextOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function CreateInvoicePage() {
    const router = useRouter();
    const { token } = theme.useToken();
    const { user } = useAuthStore();
    const [form] = Form.useForm();

    const [counterparties, setCounterparties] = useState<any[]>([]);
    const [loadingCounterparties, setLoadingCounterparties] = useState(true);
    
    const [orders, setOrders] = useState<any[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    // Form watch values
    const [invoiceType, setInvoiceType] = useState<'OUTGOING' | 'INCOMING'>('OUTGOING');
    const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<string>('');

    const cardStyle = {
        borderRadius: 8,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    };

    const getRoute = (order: any): string => {
        const pts = order.routePoints || [];
        const pickup = pts.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
        const delivery = pts.find((p: any) => p.pointType === 'DELIVERY');
        const from = pickup?.location?.city || pickup?.location?.address || '—';
        const to = delivery?.location?.city || delivery?.location?.address || '—';
        return `${from} → ${to}`;
    };

    // Load registered partners and offline companies
    useEffect(() => {
        const loadCounterparties = async () => {
            try {
                setLoadingCounterparties(true);
                const [partnersRes, externalRes] = await Promise.all([
                    api.get('/partners'),
                    api.get('/external-companies')
                ]);

                const formattedPartners = (partnersRes.data || []).map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    isExternal: false,
                }));

                const formattedExternal = (externalRes.data || []).map((e: any) => ({
                    id: e.id,
                    name: `${e.name} (Офлайн)`,
                    isExternal: true,
                }));

                setCounterparties([...formattedPartners, ...formattedExternal]);
            } catch (e) {
                message.error('Ошибка загрузки списка контрагентов');
            } finally {
                setLoadingCounterparties(false);
            }
        };

        loadCounterparties();
    }, []);

    // Load uninvoiced orders when type or counterparty changes
    useEffect(() => {
        if (!selectedCounterpartyId) {
            setOrders([]);
            setSelectedOrderIds([]);
            return;
        }

        const loadUninvoicedOrders = async () => {
            try {
                setLoadingOrders(true);
                setSelectedOrderIds([]);
                const res = await api.get('/invoices/uninvoiced-orders', {
                    params: {
                        type: invoiceType,
                        counterpartyId: selectedCounterpartyId,
                    }
                });
                setOrders(res.data || []);
            } catch (e) {
                message.error('Ошибка загрузки готовых к оплате рейсов');
            } finally {
                setLoadingOrders(false);
            }
        };

        loadUninvoicedOrders();
    }, [invoiceType, selectedCounterpartyId]);

    // Calculate sum of selected orders
    const selectedAmount = useMemo(() => {
        return orders
            .filter((o) => selectedOrderIds.includes(o.id))
            .reduce((sum, o) => {
                if (invoiceType === 'OUTGOING') {
                    return sum + (o.customerPrice || 0);
                } else {
                    if (o.subForwarderId === selectedCounterpartyId) {
                        return sum + (o.subForwarderPrice || 0);
                    }
                    return sum + (o.driverCost || 0);
                }
            }, 0);
    }, [orders, selectedOrderIds, invoiceType, selectedCounterpartyId]);

    const handleSubmit = async (values: any) => {
        if (selectedOrderIds.length === 0) {
            message.warning('Необходимо выбрать хотя бы один рейс');
            return;
        }

        try {
            setSubmitting(true);
            const ourCompanyId = user?.companyId || '';

            const issuerId = invoiceType === 'OUTGOING' ? ourCompanyId : selectedCounterpartyId;
            const recipientId = invoiceType === 'OUTGOING' ? selectedCounterpartyId : ourCompanyId;

            await api.post('/invoices', {
                invoiceNumber: values.invoiceNumber,
                type: invoiceType,
                date: values.date.format('YYYY-MM-DD'),
                dueDate: values.dueDate ? values.dueDate.format('YYYY-MM-DD') : undefined,
                issuerId,
                recipientId,
                orderIds: selectedOrderIds,
                note: values.note,
            });

            message.success('Счет успешно сформирован');
            router.push('/company/accounting/invoices');
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось сформировать счет');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: 'Номер заявки',
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            render: (t: string) => <span style={{ fontWeight: 600 }}>{t}</span>,
        },
        {
            title: 'Дата создания',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
        },
        {
            title: 'Маршрут',
            key: 'route',
            render: (_: any, record: any) => getRoute(record),
        },
        {
            title: 'Груз',
            dataIndex: 'cargoDescription',
            key: 'cargoDescription',
            ellipsis: true,
        },
        {
            title: 'Сумма рейса',
            key: 'price',
            align: 'right' as const,
            render: (_: any, record: any) => {
                const amount = invoiceType === 'OUTGOING'
                    ? record.customerPrice
                    : (record.subForwarderId === selectedCounterpartyId ? record.subForwarderPrice : record.driverCost);
                return (
                    <span style={{ fontWeight: 600 }}>
                        {(amount || 0).toLocaleString('ru-RU')} ₸
                    </span>
                );
            },
        },
    ];

    const rowSelection = {
        selectedRowKeys: selectedOrderIds,
        onChange: (selectedKeys: any) => {
            setSelectedOrderIds(selectedKeys);
        },
    };

    return (
        <div className="lc-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Финансы · Счета</div>
                    <h1 className="lc2-title">Новый счёт</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Выставление счета для взаиморасчётов с заказчиками и партнёрами
                    </p>
                    <Button
                        type="link"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => router.push('/company/accounting/invoices')}
                        style={{ padding: 0, color: 'var(--lc-text-ter)' }}
                    >
                        Назад к реестру
                    </Button>
                </div>
            </div>

            {/* ===== FORM CARD ===== */}
            <div className="lc-card" style={{ padding: '24px' }}>
                <Row gutter={16}>
                    <Col xs={24} lg={8}>
                        <div style={{ marginBottom: 16 }}>
                            <Text strong style={{ fontSize: 15 }}>Параметры счета</Text>
                        </div>
                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={handleSubmit}
                            initialValues={{
                                type: 'OUTGOING',
                                date: dayjs(),
                            }}
                        >
                            <Form.Item
                                name="invoiceNumber"
                                label="Номер счета"
                                rules={[{ required: true, message: 'Введите номер счета' }]}
                            >
                                <Input placeholder="Например, СЧ-105" />
                            </Form.Item>

                            <Form.Item
                                name="type"
                                label="Направление счета"
                                rules={[{ required: true }]}
                            >
                                <Select
                                    onChange={(val: any) => {
                                        setInvoiceType(val);
                                        setSelectedCounterpartyId('');
                                        form.setFieldsValue({ counterpartyId: undefined });
                                    }}
                                    options={[
                                        { value: 'OUTGOING', label: 'Исходящий (доход заказчику)' },
                                        { value: 'INCOMING', label: 'Входящий (расход от партнера)' },
                                    ]}
                                />
                            </Form.Item>

                            <Form.Item
                                name="counterpartyId"
                                label="Контрагент"
                                rules={[{ required: true, message: 'Выберите контрагента' }]}
                            >
                                <Select
                                    showSearch
                                    loading={loadingCounterparties}
                                    placeholder="Выберите компанию..."
                                    optionFilterProp="label"
                                    onChange={(val) => setSelectedCounterpartyId(val)}
                                    options={counterparties.map((c) => ({
                                        value: c.id,
                                        label: c.name,
                                    }))}
                                />
                            </Form.Item>

                            <Form.Item
                                name="date"
                                label="Дата счета"
                                rules={[{ required: true, message: 'Выберите дату' }]}
                            >
                                <DatePicker style={{ width: 'full' }} format="DD.MM.YYYY" />
                            </Form.Item>

                            <Form.Item
                                name="dueDate"
                                label="Срок оплаты (dueDate)"
                            >
                                <DatePicker style={{ width: 'full' }} format="DD.MM.YYYY" />
                            </Form.Item>

                            <Form.Item
                                name="note"
                                label="Примечание"
                            >
                                <Input.TextArea placeholder="Дополнительная информация по счету..." rows={3} />
                            </Form.Item>

                            <div style={{ marginTop: 24, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <Text type="secondary">Выбрано рейсов:</Text>
                                    <Text strong>{selectedOrderIds.length}</Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                                    <Text type="secondary">Итоговая сумма:</Text>
                                    <Text strong style={{ fontSize: 18, color: token.colorPrimary }}>
                                        {selectedAmount.toLocaleString('ru-RU')} ₸
                                    </Text>
                                </div>

                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    block
                                    loading={submitting}
                                    disabled={selectedOrderIds.length === 0}
                                    icon={<CheckOutlined />}
                                >
                                    Сформировать счет
                                </Button>
                            </div>
                        </Form>
                </Col>

                <Col xs={24} lg={16}>
                    <div style={{ marginBottom: 16 }}>
                        <Text strong style={{ fontSize: 15 }}>Доступные рейсы для включения в счет</Text>
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
                            Показываются только завершенные (COMPLETED) рейсы
                        </Text>
                    </div>
                        {!selectedCounterpartyId ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: token.colorTextDescription }}>
                                <FileTextOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                                Выберите контрагента для загрузки доступных рейсов
                            </div>
                        ) : loadingOrders ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                <Spin size="large" />
                            </div>
                        ) : orders.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: token.colorTextDescription }}>
                                Нет завершенных рейсов без выставленного счета для данного контрагента
                            </div>
                        ) : (
                            <Table
                                rowSelection={rowSelection}
                                columns={columns}
                                dataSource={orders}
                                rowKey="id"
                                pagination={false}
                                size="small"
                                scroll={{ y: 500 }}
                            />
                        )}
                </Col>
            </Row>
            </div>

            <style jsx global>{`
                .ant-picker {
                    width: 100% !important;
                }
            `}</style>
        </div>
    );
}
