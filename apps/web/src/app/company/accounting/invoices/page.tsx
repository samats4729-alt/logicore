'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    Typography,
    Card,
    Tabs,
    Table,
    Tag,
    Button,
    Space,
    Input,
    Select,
    message,
    theme,
    Tooltip,
    Modal,
    Popconfirm
} from 'antd';
import {
    SearchOutlined,
    PlusOutlined,
    CopyOutlined,
    EyeOutlined,
    DeleteOutlined,
    CheckCircleOutlined,
    ExclamationCircleOutlined,
    LinkOutlined,
    DollarOutlined
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import dayjs from 'dayjs';
import StatusPill from '@/components/ui/StatusPill';

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

export default function InvoicesPage() {
    const router = useRouter();
    const { token } = theme.useToken();
    const { user } = useAuthStore();

    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [activeTab, setActiveTab] = useState<'INCOMING' | 'OUTGOING'>('OUTGOING');

    const cardStyle = {
        borderRadius: 8,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    };

    const isAccountantOrAdmin = useMemo(() => {
        return ['ACCOUNTANT', 'FORWARDER', 'COMPANY_ADMIN'].includes(user?.role || '');
    }, [user]);

    const loadInvoices = async () => {
        try {
            setLoading(true);
            const res = await api.get('/invoices');
            setInvoices(res.data);
        } catch (e) {
            message.error('Ошибка загрузки счетов');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadInvoices();
    }, []);

    const handleCopyLink = (shareToken: string) => {
        const url = `${window.location.origin}/shared/invoice/${shareToken}`;
        navigator.clipboard.writeText(url);
        message.success('Публичная ссылка скопирована!');
    };

    const handleDeleteInvoice = async (id: string) => {
        try {
            await api.delete(`/invoices/${id}`);
            message.success('Счет успешно удален');
            loadInvoices();
        } catch (e) {
            message.error('Не удалось удалить счет');
        }
    };

    const handleMarkAsPaid = async (id: string) => {
        try {
            await api.put(`/invoices/${id}/status`, { status: 'PAID' });
            message.success('Счет помечен как оплаченный');
            loadInvoices();
        } catch (e) {
            message.error('Не удалось обновить статус счета');
        }
    };

    const filteredInvoices = useMemo(() => {
        return invoices.filter((inv) => {
            // Направление счёта — относительно нашей компании (мы выставили или нам выставили)
            const isOutgoingForMe = inv.issuerId === user?.companyId;
            const matchesTab = activeTab === 'OUTGOING' ? isOutgoingForMe : !isOutgoingForMe;
            const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
            const counterpartyName = isOutgoingForMe ? (inv.recipient?.name || '') : (inv.issuer?.name || '');
            const matchesSearch =
                inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
                counterpartyName.toLowerCase().includes(search.toLowerCase());
            return matchesTab && matchesStatus && matchesSearch;
        });
    }, [invoices, activeTab, statusFilter, search, user?.companyId]);

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
            title: 'Номер счета',
            dataIndex: 'invoiceNumber',
            key: 'invoiceNumber',
            render: (text: string, record: any) => (
                <div style={{ fontWeight: 600 }}>
                    {text}
                    {record.note && (
                        <div style={{ fontSize: 11, fontWeight: 400, color: token.colorTextSecondary }}>
                            {record.note}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: activeTab === 'OUTGOING' ? 'Получатель (клиент)' : 'Отправитель (партнер)',
            key: 'counterparty',
            render: (_: any, record: any) => {
                const comp = record.issuerId === user?.companyId ? record.recipient : record.issuer;
                const name = comp?.name || 'Внешняя компания';
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="lc2-avatar lc2-avatar-sm" style={{ background: activeTab === 'OUTGOING' ? '#e0f2fe' : '#f1f2f5', color: activeTab === 'OUTGOING' ? '#0369a1' : '#5f6672', flexShrink: 0 }}>
                            {getInitials(name) || 'CO'}
                        </span>
                        <div>
                            <div style={{ fontWeight: 500 }}>{name}</div>
                            {comp?.bin && <div style={{ fontSize: 11, color: token.colorTextSecondary }}>БИН: {comp.bin}</div>}
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Дата выставления',
            dataIndex: 'date',
            key: 'date',
            render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
        },
        {
            title: 'Срок оплаты',
            dataIndex: 'dueDate',
            key: 'dueDate',
            render: (d: string) => d ? dayjs(d).format('DD.MM.YYYY') : '—',
        },
        {
            title: 'Рейсы',
            key: 'orders',
            width: 140,
            render: (_: any, record: any) => {
                const orders = [...(record.incomingOrders || []), ...(record.outgoingOrders || [])];
                if (orders.length === 0) return '—';
                const listContent = (
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {orders.map((o: any) => (
                            <div key={o.id} style={{ fontSize: 11, padding: '2px 0' }}>
                                Рейс №{o.orderNumber}
                            </div>
                        ))}
                    </div>
                );
                return (
                    <Tooltip title={listContent} overlayInnerStyle={{ padding: '8px 12px' }}>
                        <span style={{ cursor: 'pointer', color: token.colorPrimary, fontWeight: 500, borderBottom: `1px dashed ${token.colorPrimary}` }}>
                            {orders.length === 1 ? `1 рейс` : `${orders.length} рейса(ов)`}
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Сумма',
            key: 'amount',
            align: 'right' as const,
            render: (_: any, record: any) => {
                const hasDisputedAmount = record.adjustedAmount !== null && record.adjustedAmount !== undefined;
                return (
                    <div style={{ textAlign: 'right' }}>
                        {hasDisputedAmount ? (
                            <>
                                <div style={{ textDecoration: 'line-through', fontSize: 11, color: token.colorTextDisabled }}>
                                    {record.amount.toLocaleString('ru-RU')} ₸
                                </div>
                                <div style={{ fontWeight: 700, color: token.colorError }}>
                                    {record.adjustedAmount.toLocaleString('ru-RU')} ₸
                                </div>
                            </>
                        ) : (
                            <div style={{ fontWeight: 700 }}>
                                {record.amount.toLocaleString('ru-RU')} ₸
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => <StatusPill status={status} />,
        },
        {
            title: 'Действия',
            key: 'actions',
            render: (_: any, record: any) => (
                <Space size={8}>
                    <Tooltip title="Открыть детали">
                        <Button
                            type="primary"
                            ghost
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => router.push(`/company/accounting/invoices/${record.id}`)}
                        />
                    </Tooltip>

                    <Tooltip title="Скопировать ссылку для партнера">
                        <Button
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => handleCopyLink(record.shareToken)}
                        />
                    </Tooltip>

                    {isAccountantOrAdmin && record.status !== 'PAID' && record.status !== 'CANCELLED' && (
                        <Popconfirm
                            title="Отметить счет как оплаченный?"
                            description="Связанные рейсы также будут автоматически помечены оплаченными."
                            onConfirm={() => handleMarkAsPaid(record.id)}
                            okText="Да"
                            cancelText="Нет"
                        >
                            <Tooltip title="Отметить оплату">
                                <Button
                                    size="small"
                                    type="default"
                                    style={{ color: token.colorSuccess, borderColor: token.colorSuccess }}
                                    icon={<DollarOutlined />}
                                />
                            </Tooltip>
                        </Popconfirm>
                    )}

                    {isAccountantOrAdmin && record.status === 'DRAFT' && (
                        <Popconfirm
                            title="Удалить этот счет?"
                            description="Рейсы будут отвязаны и возвращены в реестр для перевыставления."
                            onConfirm={() => handleDeleteInvoice(record.id)}
                            okText="Да"
                            cancelText="Нет"
                        >
                            <Tooltip title="Удалить">
                                <Button
                                    danger
                                    size="small"
                                    icon={<DeleteOutlined />}
                                />
                            </Tooltip>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            {/* ===== HERO 2026 ===== */}
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Бухгалтерия · Документы</div>
                    <h1 className="lc2-title">Реестр счетов</h1>
                    <p style={{ color: '#8a91a0', fontSize: 13, margin: '6px 0 14px' }}>
                        Группировка выполненных рейсов и сделок для взаимных расчетов с заказчиками и партнерами
                    </p>
                    {isAccountantOrAdmin && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => router.push('/company/accounting/invoices/create')}
                            className="lc-cta"
                        >
                            Выставить счет
                        </Button>
                    )}
                </div>
            </div>

            {/* ===== TABLE CARD ===== */}
            <div className="lc-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Input
                        placeholder="Поиск по номеру счета или контрагенту..."
                        prefix={<SearchOutlined style={{ color: token.colorTextDescription }} />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: 320 }}
                        allowClear
                    />
                    <Select
                        value={statusFilter}
                        onChange={setStatusFilter}
                        style={{ width: 180 }}
                        options={[
                            { value: 'all', label: 'Все статусы' },
                            { value: 'DRAFT', label: 'Черновик' },
                            { value: 'PENDING', label: 'Ожидает оплаты' },
                            { value: 'DISPUTED', label: 'Спор' },
                            { value: 'APPROVED', label: 'Согласован' },
                            { value: 'PAID', label: 'Оплачен' },
                            { value: 'CANCELLED', label: 'Отменен' },
                        ]}
                    />
                </div>

                <Tabs
                    activeKey={activeTab}
                    onChange={(key: any) => setActiveTab(key)}
                    items={[
                        {
                            key: 'OUTGOING',
                            label: `Исходящие (Доходы / От нас клиентам)`,
                        },
                        {
                            key: 'INCOMING',
                            label: `Входящие (Расходы / От партнеров нам)`,
                        },
                    ]}
                    style={{ marginBottom: 16 }}
                />

                <Table
                    columns={columns}
                    dataSource={filteredInvoices}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: 1000 }}
                    size="small"
                />
            </div>
        </div>
    );
}
