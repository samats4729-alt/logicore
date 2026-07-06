'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
    Alert
} from 'antd';
import {
    ArrowLeftOutlined,
    CopyOutlined,
    CheckOutlined,
    CloseOutlined,
    WarningOutlined,
    FileTextOutlined,
    DollarOutlined,
    ClockCircleOutlined,
    TeamOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const statusLabels: Record<string, string> = {
    DRAFT: 'Черновик',
    PENDING: 'Ожидает оплаты',
    DISPUTED: 'Спор',
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

export default function InvoiceDetailPage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const { token } = theme.useToken();
    const { user } = useAuthStore();

    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [acceptingDispute, setAcceptingDispute] = useState(false);

    const cardStyle = {
        borderRadius: 8,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    };

    const isAccountantOrAdmin = useMemo(() => {
        return ['ACCOUNTANT', 'FORWARDER', 'COMPANY_ADMIN'].includes(user?.role || '');
    }, [user]);

    const loadInvoiceDetails = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/invoices/${id}`);
            setInvoice(res.data);
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Ошибка загрузки деталей счета');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) {
            loadInvoiceDetails();
        }
    }, [id]);

    const handleCopyLink = () => {
        if (!invoice) return;
        const url = `${window.location.origin}/shared/invoice/${invoice.shareToken}`;
        navigator.clipboard.writeText(url);
        message.success('Публичная ссылка скопирована!');
    };

    const handleAcceptDispute = async () => {
        try {
            setAcceptingDispute(true);
            await api.post(`/invoices/${id}/accept-dispute`);
            message.success('Предложенные корректировки приняты. Новые цены применены к сделкам.');
            loadInvoiceDetails();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось принять корректировки');
        } finally {
            setAcceptingDispute(false);
        }
    };

    const handleMarkAsPaid = async () => {
        try {
            await api.put(`/invoices/${id}/status`, { status: 'PAID' });
            message.success('Счет помечен как оплаченный');
            loadInvoiceDetails();
        } catch (e) {
            message.error('Не удалось обновить статус счета');
        }
    };

    const getRoute = (order: any): string => {
        const pts = order.routePoints || [];
        const pickup = pts.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
        const delivery = pts.find((p: any) => p.pointType === 'DELIVERY');
        const from = pickup?.location?.city || pickup?.location?.address || '—';
        const to = delivery?.location?.city || delivery?.location?.address || '—';
        return `${from} → ${to}`;
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (!invoice) {
        return (
            <Alert
                message="Ошибка"
                description="Счет не найден или у вас нет доступа к нему."
                type="error"
                showIcon
            />
        );
    }

    const orders = [...(invoice.outgoingOrders || []), ...(invoice.incomingOrders || [])];
    
    // Check if there are disputes
    const hasDisputes = invoice.status === 'DISPUTED';

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
            title: 'Изначальная цена',
            key: 'originalPrice',
            align: 'right' as const,
            render: (_: any, record: any) => {
                const price = invoice.type === 'OUTGOING'
                    ? record.customerPrice
                    : (record.subForwarderId === invoice.issuerId ? record.subForwarderPrice : record.driverCost);
                return <span>{(price || 0).toLocaleString('ru-RU')} ₸</span>;
            },
        },
        ...(hasDisputes ? [{
            title: 'Предложенная партнером цена',
            key: 'proposedPrice',
            align: 'right' as const,
            render: (_: any, record: any) => {
                const proposed = invoice.type === 'OUTGOING'
                    ? record.proposedCustomerPrice
                    : (record.subForwarderId === invoice.issuerId ? record.proposedSubForwarderPrice : record.proposedDriverCost);
                
                const original = invoice.type === 'OUTGOING'
                    ? record.customerPrice
                    : (record.subForwarderId === invoice.issuerId ? record.subForwarderPrice : record.driverCost);

                if (proposed === null || proposed === undefined || proposed === original) {
                    return <span style={{ color: token.colorTextDescription }}>Без изменений</span>;
                }

                const diff = proposed - original;

                return (
                    <div>
                        <span style={{ fontWeight: 700, color: token.colorError }}>
                            {proposed.toLocaleString('ru-RU')} ₸
                        </span>
                        <div style={{ fontSize: 11, color: diff > 0 ? token.colorSuccess : token.colorError }}>
                            {diff > 0 ? '+' : ''}{diff.toLocaleString('ru-RU')} ₸
                        </div>
                    </div>
                );
            },
        }] : []),
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1200, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <Button
                        type="link"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => router.push('/company/accounting/invoices')}
                        style={{ padding: 0, color: 'var(--lc-text-ter)', marginBottom: 8 }}
                    >
                        Назад к реестру
                    </Button>
                    <div className="lc-eyebrow">Бухгалтерия · Счета</div>
                    <h1 className="lc2-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                        Счет {invoice.invoiceNumber}
                        <Tag color={statusColors[invoice.status]} style={{ fontSize: 13, padding: '2px 8px', verticalAlign: 'middle' }}>
                            {statusLabels[invoice.status] || invoice.status}
                        </Tag>
                    </h1>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Button icon={<CopyOutlined />} onClick={handleCopyLink}>
                        Публичная ссылка
                    </Button>
                    {isAccountantOrAdmin && invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && (
                        <Button type="primary" icon={<CheckOutlined />} onClick={handleMarkAsPaid}>
                            Отметить оплату
                        </Button>
                    )}
                </div>
            </div>

            {hasDisputes && (
                <Alert
                    style={{ marginBottom: 20 }}
                    message="Внимание: По счету получен встречный запрос (Спор)"
                    description={
                        <div style={{ marginTop: 8 }}>
                            <p>Внешний партнер оспорил цены по некоторым рейсам в данном счете. Вы можете ознакомиться с предложенными ценами в таблице ниже.</p>
                            {isAccountantOrAdmin && (
                                <Button
                                    type="primary"
                                    danger
                                    icon={<CheckOutlined />}
                                    loading={acceptingDispute}
                                    onClick={handleAcceptDispute}
                                    style={{ marginTop: 8 }}
                                >
                                    Принять предложенные корректировки и согласовать счет
                                </Button>
                            )}
                        </div>
                    }
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                />
            )}

            <div className="lc-card" style={{ padding: '24px' }}>
            <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col xs={24} md={8}>
                    <div className="lc2-metric" style={{ padding: 16, border: '1px solid var(--lc-border)', borderRadius: 16 }}>
                        <div className="lc2-mlabel">Сумма счета</div>
                        <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: token.colorPrimary }}>
                            {invoice.amount.toLocaleString('ru-RU')} ₸
                        </div>
                    </div>
                </Col>
                
                {invoice.adjustedAmount !== null && invoice.adjustedAmount !== undefined && (
                    <Col xs={24} md={8}>
                        <div className="lc2-metric" style={{ padding: 16, border: '1px solid var(--lc-border)', borderRadius: 16 }}>
                            <div className="lc2-mlabel">Сумма с корректировками</div>
                            <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums', color: token.colorError }}>
                                {invoice.adjustedAmount.toLocaleString('ru-RU')} ₸
                            </div>
                        </div>
                    </Col>
                )}

                <Col xs={24} md={8}>
                    <div className="lc2-metric" style={{ padding: 16, border: '1px solid var(--lc-border)', borderRadius: 16 }}>
                        <div className="lc2-mlabel">Рейсов в счете</div>
                        <div className="lc2-mvalue" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {orders.length}
                        </div>
                    </div>
                </Col>
            </Row>

            <Row gutter={16}>
                <Col xs={24} lg={10}>
                    <div>
                        <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>Информация о счете</Text>
                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Тип счета">
                                {invoice.issuerId === user?.companyId ? 'Исходящий (нам заплатят)' : 'Входящий (мы платим)'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Дата выставления">
                                {dayjs(invoice.date).format('DD.MM.YYYY')}
                            </Descriptions.Item>
                            <Descriptions.Item label="Срок оплаты">
                                {invoice.dueDate ? dayjs(invoice.dueDate).format('DD.MM.YYYY') : 'Не указан'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Создатель">
                                {invoice.createdBy ? `${invoice.createdBy.firstName} ${invoice.createdBy.lastName}` : '—'}
                            </Descriptions.Item>
                            {invoice.note && (
                                <Descriptions.Item label="Примечание">
                                    {invoice.note}
                                </Descriptions.Item>
                            )}
                        </Descriptions>

                        <Divider style={{ margin: '16px 0' }} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', marginBottom: 4 }}>Отправитель счета</Text>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <TeamOutlined style={{ color: token.colorPrimary }} />
                                    <Text strong>{invoice.issuer?.name}</Text>
                                </div>
                                {invoice.issuer?.bin && <div style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 22 }}>БИН: {invoice.issuer.bin}</div>}
                                {invoice.issuer?.address && <div style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 22 }}>Адрес: {invoice.issuer.address}</div>}
                            </div>

                            <div>
                                <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', marginBottom: 4 }}>Получатель счета</Text>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <TeamOutlined style={{ color: token.colorPrimary }} />
                                    <Text strong>{invoice.recipient?.name}</Text>
                                </div>
                                {invoice.recipient?.bin && <div style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 22 }}>БИН: {invoice.recipient.bin}</div>}
                                {invoice.recipient?.address && <div style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 22 }}>Адрес: {invoice.recipient.address}</div>}
                            </div>
                        </div>
                    </div>
                </Col>

                <Col xs={24} lg={14}>
                    <div>
                        <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>Содержимое счета (рейсы)</Text>
                        <Table
                            columns={columns}
                            dataSource={orders}
                            rowKey="id"
                            pagination={false}
                            size="small"
                        />
                    </div>
                </Col>
            </Row>
            </div>
        </div>
    );
}
