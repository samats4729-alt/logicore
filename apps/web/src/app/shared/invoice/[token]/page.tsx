'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
    Typography,
    Card,
    Row,
    Col,
    Tag,
    Button,
    Space,
    Table,
    Descriptions,
    Divider,
    message,
    theme,
    Spin,
    Statistic,
    Alert,
    InputNumber
} from 'antd';
import {
    CheckOutlined,
    CloseOutlined,
    EditOutlined,
    WarningOutlined,
    FileTextOutlined,
    DollarOutlined,
    TeamOutlined,
    SaveOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает оплаты',
    DISPUTED: 'Спор (на согласовании)',
    APPROVED: 'Согласован',
    PAID: 'Оплачен',
    CANCELLED: 'Отменен',
};

const statusColors: Record<string, string> = {
    DRAFT: 'default',
    PENDING: 'orange',
    DISPUTED: 'red',
    APPROVED: 'blue',
    PAID: 'green',
    CANCELLED: 'magenta',
};

export default function PublicInvoicePage() {
    const { token: shareToken } = useParams() as { token: string };
    const { token: themeToken } = theme.useToken();

    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [proposedPrices, setProposedPrices] = useState<Record<string, number>>({});
    const [submittingDispute, setSubmittingDispute] = useState(false);

    const cardStyle = {
        borderRadius: 8,
        background: themeToken.colorBgContainer,
        border: `1px solid ${themeToken.colorBorderSecondary}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    };

    const loadInvoice = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/public/invoice/${shareToken}`);
            setInvoice(res.data);
            
            // Initialize proposed prices map
            const orders = res.data.type === 'OUTGOING' ? res.data.outgoingOrders : res.data.incomingOrders;
            const pricesMap: Record<string, number> = {};
            orders.forEach((o: any) => {
                const original = res.data.type === 'OUTGOING'
                    ? o.customerPrice
                    : (o.subForwarderId === res.data.issuerId ? o.subForwarderPrice : o.driverCost);
                
                const existingProposed = res.data.type === 'OUTGOING'
                    ? o.proposedCustomerPrice
                    : (o.subForwarderId === res.data.issuerId ? o.proposedSubForwarderPrice : o.proposedDriverCost);

                pricesMap[o.id] = existingProposed !== null && existingProposed !== undefined ? existingProposed : (original || 0);
            });
            setProposedPrices(pricesMap);
        } catch (e: any) {
            message.error('Счет не найден или срок действия ссылки истек');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (shareToken) {
            loadInvoice();
        }
    }, [shareToken]);

    const getRoute = (order: any): string => {
        const pts = order.routePoints || [];
        const pickup = pts.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
        const delivery = pts.find((p: any) => p.pointType === 'DELIVERY');
        const from = pickup?.location?.city || pickup?.location?.address || '—';
        const to = delivery?.location?.city || delivery?.location?.address || '—';
        return `${from} → ${to}`;
    };

    const orders = useMemo(() => {
        if (!invoice) return [];
        return invoice.type === 'OUTGOING' ? invoice.outgoingOrders : invoice.incomingOrders;
    }, [invoice]);

    // Live recalculation of the total proposed amount
    const liveProposedTotal = useMemo(() => {
        return orders.reduce((sum: number, o: any) => {
            return sum + (proposedPrices[o.id] || 0);
        }, 0);
    }, [orders, proposedPrices]);

    const handlePriceChange = (orderId: string, val: number | null) => {
        if (val === null) return;
        setProposedPrices((prev) => ({
            ...prev,
            [orderId]: val,
        }));
    };

    const handleSubmitDispute = async () => {
        try {
            setSubmittingDispute(true);
            const payload = orders.map((o: any) => {
                const item: any = { orderId: o.id };
                const propVal = proposedPrices[o.id];

                if (invoice.type === 'OUTGOING') {
                    item.proposedCustomerPrice = propVal;
                } else {
                    if (o.subForwarderId === invoice.issuerId) {
                        item.proposedSubForwarderPrice = propVal;
                    } else {
                        item.proposedDriverCost = propVal;
                    }
                }
                return item;
            });

            await api.put(`/public/invoice/${shareToken}/dispute`, { proposedPrices: payload });
            message.success('Ваши ценовые корректировки успешно отправлены на согласование бухгалтеру!');
            setIsEditing(false);
            loadInvoice();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось отправить корректировку');
        } finally {
            setSubmittingDispute(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8f9fa' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!invoice) {
        return (
            <div style={{ padding: 40, maxWidth: 600, margin: '40px auto' }}>
                <Alert
                    message="Ссылка недействительна"
                    description="Запрошенный счет не найден или срок действия ссылки истек."
                    type="error"
                    showIcon
                />
            </div>
        );
    }

    const isLocked = ['APPROVED', 'PAID', 'CANCELLED'].includes(invoice.status);

    const columns = [
        {
            title: 'Рейс №',
            dataIndex: 'orderNumber',
            key: 'orderNumber',
            render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
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
        },
        {
            title: 'Исходная цена',
            key: 'originalPrice',
            align: 'right' as const,
            render: (_: any, record: any) => {
                const price = invoice.type === 'OUTGOING'
                    ? record.customerPrice
                    : (record.subForwarderId === invoice.issuerId ? record.subForwarderPrice : record.driverCost);
                return <span>{(price || 0).toLocaleString('ru-RU')} ₸</span>;
            },
        },
        ...(isEditing ? [{
            title: 'Ваше ценовое предложение',
            key: 'editPrice',
            align: 'right' as const,
            width: 180,
            render: (_: any, record: any) => (
                <InputNumber
                    min={0}
                    value={proposedPrices[record.id]}
                    onChange={(val) => handlePriceChange(record.id, val)}
                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                    parser={(value) => parseFloat(value!.replace(/\s?₸?/g, '')) || 0}
                    style={{ width: '100%' }}
                    suffix="₸"
                />
            ),
        }] : (invoice.status === 'DISPUTED' ? [{
            title: 'Предложенная вами цена',
            key: 'disputedPrice',
            align: 'right' as const,
            render: (_: any, record: any) => {
                const proposed = invoice.type === 'OUTGOING'
                    ? record.proposedCustomerPrice
                    : (record.subForwarderId === invoice.issuerId ? record.proposedSubForwarderPrice : record.proposedDriverCost);
                
                const original = invoice.type === 'OUTGOING'
                    ? record.customerPrice
                    : (record.subForwarderId === invoice.issuerId ? record.subForwarderPrice : record.driverCost);

                if (proposed === null || proposed === undefined || proposed === original) {
                    return <span style={{ color: themeToken.colorTextDescription }}>Без изменений</span>;
                }

                return (
                    <span style={{ fontWeight: 700, color: themeToken.colorError }}>
                        {proposed.toLocaleString('ru-RU')} ₸
                    </span>
                );
            },
        }] : [])),
    ];

    return (
        <div style={{ background: '#f8f9fa', minHeight: '100vh', padding: '24px 16px' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <Card style={{ ...cardStyle, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <Text type="secondary" style={{ fontSize: 13, textTransform: 'uppercase' }}>
                                Публичный интерактивный счет
                            </Text>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                                <Title level={2} style={{ margin: 0 }}>Счет {invoice.invoiceNumber}</Title>
                                <Tag color={statusColors[invoice.status]} style={{ fontSize: 13, padding: '2px 8px' }}>
                                    {statusLabels[invoice.status] || invoice.status}
                                </Tag>
                            </div>
                        </div>

                        {!isLocked && (
                            <Space>
                                {isEditing ? (
                                    <>
                                        <Button
                                            type="primary"
                                            icon={<SaveOutlined />}
                                            loading={submittingDispute}
                                            onClick={handleSubmitDispute}
                                        >
                                            Отправить корректировку
                                        </Button>
                                        <Button icon={<CloseOutlined />} onClick={() => setIsEditing(false)}>
                                            Отмена
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        type="primary"
                                        danger
                                        icon={<EditOutlined />}
                                        onClick={() => setIsEditing(true)}
                                    >
                                        Оспорить цены / Корректировка
                                    </Button>
                                )}
                            </Space>
                        )}
                    </div>
                </Card>

                {isLocked && (
                    <Alert
                        style={{ marginBottom: 20 }}
                        message="Счет согласован или оплачен"
                        description="Этот счет уже прошел стадию согласования, согласован или оплачен бухгалтерией. Внесение изменений невозможно."
                        type="info"
                        showIcon
                    />
                )}

                {invoice.status === 'DISPUTED' && !isEditing && (
                    <Alert
                        style={{ marginBottom: 20 }}
                        message="Ожидание согласования корректировок"
                        description="Вы предложили новые цены по некоторым рейсам. Наши бухгалтеры проверяют предложенные вами изменения."
                        type="warning"
                        showIcon
                        icon={<WarningOutlined />}
                    />
                )}

                <Row gutter={16} style={{ marginBottom: 20 }}>
                    <Col xs={24} md={8}>
                        <Card style={cardStyle} styles={{ body: { padding: '16px' } }}>
                            <Statistic
                                title="Исходная сумма счета"
                                value={invoice.amount}
                                suffix="₸"
                                valueStyle={{ fontWeight: 800, color: themeToken.colorPrimary }}
                            />
                        </Card>
                    </Col>

                    {(isEditing || invoice.adjustedAmount !== null) && (
                        <Col xs={24} md={8}>
                            <Card style={cardStyle} styles={{ body: { padding: '16px' } }}>
                                <Statistic
                                    title={isEditing ? "Новая предложенная сумма" : "Предложенная сумма счета"}
                                    value={isEditing ? liveProposedTotal : invoice.adjustedAmount}
                                    suffix="₸"
                                    valueStyle={{ fontWeight: 800, color: themeToken.colorError }}
                                />
                            </Card>
                        </Col>
                    )}

                    <Col xs={24} md={8}>
                        <Card style={cardStyle} styles={{ body: { padding: '16px' } }}>
                            <Statistic
                                title="Количество рейсов в счете"
                                value={orders.length}
                                valueStyle={{ fontWeight: 800 }}
                            />
                        </Card>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col xs={24} lg={9}>
                        <Card style={{ ...cardStyle, marginBottom: 16 }} title="Реквизиты и детали">
                            <Descriptions column={1} size="small" bordered>
                                <Descriptions.Item label="Дата выставления">
                                    {dayjs(invoice.date).format('DD.MM.YYYY')}
                                </Descriptions.Item>
                                <Descriptions.Item label="Срок оплаты">
                                    {invoice.dueDate ? dayjs(invoice.dueDate).format('DD.MM.YYYY') : 'Не указан'}
                                </Descriptions.Item>
                            </Descriptions>

                            <Divider style={{ margin: '16px 0' }} />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', marginBottom: 4 }}>Исполнитель (эмитент)</Text>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <TeamOutlined style={{ color: themeToken.colorPrimary }} />
                                        <Text strong>{invoice.issuer?.name}</Text>
                                    </div>
                                    {invoice.issuer?.bin && <div style={{ fontSize: 12, color: themeToken.colorTextSecondary, marginLeft: 22 }}>БИН: {invoice.issuer.bin}</div>}
                                    {invoice.issuer?.address && <div style={{ fontSize: 12, color: themeToken.colorTextSecondary, marginLeft: 22 }}>Адрес: {invoice.issuer.address}</div>}
                                </div>

                                <div>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', marginBottom: 4 }}>Заказчик (получатель)</Text>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <TeamOutlined style={{ color: themeToken.colorPrimary }} />
                                        <Text strong>{invoice.recipient?.name}</Text>
                                    </div>
                                    {invoice.recipient?.bin && <div style={{ fontSize: 12, color: themeToken.colorTextSecondary, marginLeft: 22 }}>БИН: {invoice.recipient.bin}</div>}
                                    {invoice.recipient?.address && <div style={{ fontSize: 12, color: themeToken.colorTextSecondary, marginLeft: 22 }}>Адрес: {invoice.recipient.address}</div>}
                                </div>
                            </div>
                        </Card>
                    </Col>

                    <Col xs={24} lg={15}>
                        <Card style={cardStyle} title="Спецификация сделок и цен">
                            <Table
                                columns={columns}
                                dataSource={orders}
                                rowKey="id"
                                pagination={false}
                                size="small"
                            />
                        </Card>
                    </Col>
                </Row>
            </div>
        </div>
    );
}
