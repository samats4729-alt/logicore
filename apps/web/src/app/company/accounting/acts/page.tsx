'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, DatePicker, Dropdown, Input, Modal, Select, Space, Spin, Table, Tabs, Tooltip, theme } from 'antd';
import {
    EyeOutlined,
    MoreOutlined,
    PlusOutlined,
    PrinterOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
    ACCOUNTING_DOCUMENT_STATUS_LABELS,
    AccountingDocumentDirection,
    AccountingDocumentListItem,
    AccountingDocumentStatus,
    BillableOrder,
    createAccountingDocument,
    fetchAccountingDocuments,
    fetchBillableOrders,
    openAccountingDocumentPdf,
    revokeAccountingDocumentShare,
    routePointsLabel,
} from '@/lib/accounting-documents';
import { toast } from 'sonner';

const { RangePicker } = DatePicker;

const DEFAULT_PERIOD: [Dayjs, Dayjs] = [dayjs().startOf('year'), dayjs().endOf('day')];

const money = (value: number) =>
    `${(value ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;

/**
 * Журнал актов выполненных работ — первый уровень раздела, как журнал
 * документов в 1С.
 *
 * Раньше здесь были перечислены ЗАЯВКИ, а акт печатался из живой заявки:
 * номер акта совпадал с номером заявки, а правка заявки задним числом
 * меняла уже отданный контрагенту документ. Теперь это список настоящих
 * актов со своей нумерацией и снимком реквизитов.
 */
export default function ActsJournalPage() {
    const router = useRouter();
    const { token } = theme.useToken();
    const { user } = useAuthStore();

    const [documents, setDocuments] = useState<AccountingDocumentListItem[]>([]);
    const [totals, setTotals] = useState({ amount: 0, paid: 0, due: 0 });
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const [direction, setDirection] = useState<AccountingDocumentDirection>('OUTGOING');
    const [status, setStatus] = useState<AccountingDocumentStatus | 'all'>('all');
    const [counterpartyId, setCounterpartyId] = useState<string | undefined>();
    const [period, setPeriod] = useState<[Dayjs, Dayjs]>(DEFAULT_PERIOD);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    // БИН держим рядом с названием: у контрагентов бывают почти одинаковые
    // имена, и бухгалтер различает их именно по БИН.
    const [counterparties, setCounterparties] = useState<{ id: string; name: string; bin?: string }[]>([]);

    // Окно «Создать акт»: контрагент → завершённые рейсы без акта.
    const [createOpen, setCreateOpen] = useState(false);
    const [createCounterparty, setCreateCounterparty] = useState<string | undefined>();
    const [orders, setOrders] = useState<BillableOrder[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [pickedIds, setPickedIds] = useState<string[]>([]);
    const [creating, setCreating] = useState(false);

    const canChange = useMemo(
        () => ['ACCOUNTANT', 'COMPANY_ADMIN', 'ADMIN'].includes(user?.role || ''),
        [user],
    );

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await fetchAccountingDocuments({
                type: 'SERVICE_ACT',
                direction,
                status: status === 'all' ? undefined : status,
                counterpartyId,
                from: period[0].format('YYYY-MM-DD'),
                to: period[1].format('YYYY-MM-DD'),
                page,
                limit: 30,
            });
            setDocuments(result.data);
            setTotals(result.totals);
            setTotalCount(result.total);
        } catch {
            toast.error('Не удалось загрузить журнал актов');
        } finally {
            setLoading(false);
        }
    }, [direction, status, counterpartyId, period, page]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        Promise.all([api.get('/partners'), api.get('/external-companies')])
            .then(([partners, external]) => setCounterparties([
                ...(partners.data || []).map((p: any) => ({ id: p.id, name: p.name || 'Без названия' })),
                ...(external.data || []).map((e: any) => ({ id: e.id, name: `${e.name} (офлайн)` })),
            ]))
            .catch(() => setCounterparties([]));
    }, []);

    const loadOrders = useCallback(async () => {
        if (!createCounterparty) { setOrders([]); return; }
        try {
            setLoadingOrders(true);
            setPickedIds([]);
            setOrders(await fetchBillableOrders({
                type: 'SERVICE_ACT',
                direction,
                counterpartyId: createCounterparty,
            }));
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось загрузить заявки');
            setOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    }, [createCounterparty, direction]);

    useEffect(() => { if (createOpen) loadOrders(); }, [createOpen, loadOrders]);

    const createAct = async () => {
        if (!createCounterparty) { toast.warning('Выберите контрагента'); return; }
        if (!pickedIds.length) { toast.warning('Выберите хотя бы один рейс'); return; }
        try {
            setCreating(true);
            const picked = orders.filter((order) => pickedIds.includes(order.id));
            const created = await createAccountingDocument({
                type: 'SERVICE_ACT',
                direction,
                counterpartyId: createCounterparty,
                documentDate: dayjs().format('YYYY-MM-DD'),
                lines: picked.map((order) => ({
                    name: 'Транспортные услуги',
                    description: [routePointsLabel(order.routePoints), order.assignedDriverName]
                        .filter(Boolean).join(', ') || undefined,
                    quantity: '1',
                    unit: 'усл',
                    unitPrice: (order.amount ?? 0).toFixed(2),
                    ...(order.hasVat && order.vatRate > 0
                        ? {
                            vatTreatment: 'STANDARD' as const,
                            vatCalculation: 'INCLUDED' as const,
                            vatRate: String(order.vatRate),
                        }
                        : {}),
                    orderId: order.id,
                })),
            });
            toast.success(`Черновик акта № ${created.number} создан`);
            setCreateOpen(false);
            router.push(`/company/accounting/acts/${created.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось создать акт');
        } finally {
            setCreating(false);
        }
    };

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return documents;
        return documents.filter((doc) =>
            doc.number.toLowerCase().includes(term)
            || (doc.counterparty?.name || '').toLowerCase().includes(term));
    }, [documents, search]);

    const columns = [
        {
            title: '№ акта',
            dataIndex: 'number',
            key: 'number',
            width: 150,
            render: (value: string, record: AccountingDocumentListItem) => (
                <a onClick={() => router.push(`/company/accounting/acts/${record.id}`)} style={{ fontWeight: 600 }}>
                    {value}
                </a>
            ),
        },
        {
            title: 'Дата',
            dataIndex: 'documentDate',
            key: 'documentDate',
            width: 100,
            render: (value: string) => dayjs(value).format('DD.MM.YYYY'),
        },
        {
            title: 'Контрагент',
            key: 'counterparty',
            render: (_: unknown, record: AccountingDocumentListItem) => (
                <div>
                    <div style={{ fontWeight: 500 }}>{record.counterparty?.name || '—'}</div>
                    {record.counterparty?.bin && (
                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                            БИН {record.counterparty.bin}
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Сделка',
            key: 'orders',
            width: 150,
            render: (_: unknown, record: AccountingDocumentListItem) => {
                const linked = record.orders || [];
                if (!linked.length) return <span style={{ color: token.colorTextDisabled }}>—</span>;
                const rest = (record._count?.orders ?? linked.length) - linked.length;
                return (
                    <Tooltip title={linked.map((o) => o.order.orderNumber).join(', ')}>
                        <span style={{ fontSize: 12 }}>
                            {linked[0].order.orderNumber}
                            {rest > 0 && <span style={{ color: token.colorTextSecondary }}> +{rest}</span>}
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Сумма',
            dataIndex: 'total',
            key: 'total',
            width: 150,
            align: 'right' as const,
            render: (value: number) => <span style={{ fontWeight: 600 }}>{money(value)}</span>,
        },
        {
            title: 'Статус',
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (value: AccountingDocumentStatus) => {
                const color = value === 'POSTED'
                    ? token.colorSuccess
                    : value === 'CANCELLED'
                        ? token.colorTextDisabled
                        : token.colorWarning;
                return (
                    <span style={{ color, fontWeight: 500, fontSize: 12 }}>
                        {ACCOUNTING_DOCUMENT_STATUS_LABELS[value]}
                    </span>
                );
            },
        },
        {
            title: '',
            key: 'actions',
            width: 100,
            render: (_: unknown, record: AccountingDocumentListItem) => (
                <Space size={4}>
                    <Tooltip title="Открыть">
                        <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => router.push(`/company/accounting/acts/${record.id}`)}
                        />
                    </Tooltip>
                    <Tooltip title="Печать">
                        <Button
                            type="text"
                            size="small"
                            icon={<PrinterOutlined />}
                            onClick={() => openAccountingDocumentPdf(record.id)}
                        />
                    </Tooltip>
                    <Dropdown
                        trigger={['click']}
                        menu={{
                            items: [
                                {
                                    key: 'copy',
                                    label: 'Скопировать ссылку',
                                    disabled: record.status !== 'POSTED' || Boolean(record.shareRevokedAt),
                                    onClick: () => {
                                        navigator.clipboard.writeText(
                                            `${window.location.origin}/shared/document/${record.shareToken}`);
                                        toast.success('Ссылка скопирована');
                                    },
                                },
                                {
                                    key: 'revoke',
                                    label: 'Отозвать ссылку',
                                    danger: true,
                                    disabled: !canChange || Boolean(record.shareRevokedAt),
                                    onClick: async () => {
                                        await revokeAccountingDocumentShare(record.id);
                                        toast.success('Ссылка отозвана');
                                        load();
                                    },
                                },
                            ],
                        }}
                    >
                        <Button type="text" size="small" icon={<MoreOutlined />} />
                    </Dropdown>
                </Space>
            ),
        },
    ];

    return (
        <div className="lc-page" style={{ maxWidth: 1600, margin: '0 auto' }}>
            <div className="lc2-hero">
                <div>
                    <div className="lc-eyebrow">Финансы · Документы</div>
                    <h1 className="lc2-title">Акты выполненных работ</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Акт подтверждает, что услуга оказана. Проведённый акт не меняется при правке заявки —
                        он хранит реквизиты и суммы на момент подписания.
                    </p>
                    {canChange && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => { setCreateCounterparty(undefined); setCreateOpen(true); }}
                            className="lc-cta"
                        >
                            Создать акт
                        </Button>
                    )}
                </div>
            </div>

            <div className="lc-card" style={{ padding: 20 }}>
                <Tabs
                    activeKey={direction}
                    onChange={(key) => { setDirection(key as AccountingDocumentDirection); setPage(1); }}
                    items={[
                        { key: 'OUTGOING', label: 'Исходящие' },
                        { key: 'INCOMING', label: 'Входящие' },
                    ]}
                    style={{ marginBottom: 12 }}
                />

                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Контрагент"
                        style={{ width: 240 }}
                        value={counterpartyId}
                        onChange={(value) => { setCounterpartyId(value); setPage(1); }}
                        options={counterparties.map((c) => ({ value: c.id, label: c.bin ? `${c.name} · БИН ${c.bin}` : c.name }))}
                    />
                    <RangePicker
                        value={period}
                        onChange={(value) => {
                            if (value?.[0] && value?.[1]) { setPeriod([value[0], value[1]]); setPage(1); }
                        }}
                        format="DD.MM.YYYY"
                        allowClear={false}
                    />
                    <Select
                        value={status}
                        onChange={(value) => { setStatus(value); setPage(1); }}
                        style={{ width: 150 }}
                        options={[
                            { value: 'all', label: 'Все статусы' },
                            { value: 'DRAFT', label: 'Черновик' },
                            { value: 'POSTED', label: 'Проведён' },
                            { value: 'CANCELLED', label: 'Отменён' },
                        ]}
                    />
                    <Input
                        placeholder="Номер или контрагент"
                        prefix={<SearchOutlined style={{ color: token.colorTextDescription }} />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: 220 }}
                        allowClear
                    />
                </div>

                <Table
                    columns={columns}
                    dataSource={visible}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    scroll={{ x: 1000 }}
                    locale={{ emptyText: 'За период актов нет. Создайте акт по завершённому рейсу.' }}
                    pagination={{
                        current: page,
                        pageSize: 30,
                        total: totalCount,
                        showSizeChanger: false,
                        onChange: setPage,
                        showTotal: (t) => `Всего актов: ${t}`,
                    }}
                    summary={() => (
                        <Table.Summary fixed>
                            <Table.Summary.Row style={{ background: token.colorFillAlter, fontWeight: 600 }}>
                                <Table.Summary.Cell index={0} colSpan={4}>Итого за период</Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="right">{money(totals.amount)}</Table.Summary.Cell>
                                <Table.Summary.Cell index={5} colSpan={2} />
                            </Table.Summary.Row>
                        </Table.Summary>
                    )}
                />
            </div>

            <Modal
                title="Создать акт выполненных работ"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={createAct}
                confirmLoading={creating}
                okText={`Создать акт (${pickedIds.length})`}
                cancelText="Отмена"
                width={900}
                destroyOnClose
            >
                <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Контрагент"
                    style={{ width: '100%', marginBottom: 12 }}
                    value={createCounterparty}
                    onChange={setCreateCounterparty}
                    options={counterparties.map((c) => ({ value: c.id, label: c.bin ? `${c.name} · БИН ${c.bin}` : c.name }))}
                />

                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="Показаны только завершённые рейсы, по которым акта ещё нет."
                    description="Акт подтверждает оказанную услугу, поэтому рейсы «в работе» сюда не попадают."
                />

                {!createCounterparty ? (
                    <div style={{ textAlign: 'center', padding: 32, color: token.colorTextDescription }}>
                        Выберите контрагента
                    </div>
                ) : loadingOrders ? (
                    <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
                ) : (
                    <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        scroll={{ y: 360 }}
                        dataSource={orders}
                        rowSelection={{
                            selectedRowKeys: pickedIds,
                            onChange: (keys) => setPickedIds(keys as string[]),
                        }}
                        locale={{ emptyText: 'Нет завершённых рейсов без акта у этого контрагента' }}
                        columns={[
                            { title: 'Заявка', dataIndex: 'orderNumber', width: 140 },
                            {
                                title: 'Маршрут',
                                key: 'route',
                                render: (_: unknown, record: BillableOrder) => (
                                    <div>
                                        <div style={{ fontSize: 12 }}>
                                            {routePointsLabel(record.routePoints) || '—'}
                                        </div>
                                        {record.assignedDriverName && (
                                            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                                {[record.assignedDriverName, record.assignedDriverPlate]
                                                    .filter(Boolean).join(' · ')}
                                            </div>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                title: 'Сумма',
                                key: 'amount',
                                width: 150,
                                align: 'right' as const,
                                render: (_: unknown, record: BillableOrder) => (
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{money(record.amount)}</div>
                                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                            {record.hasVat && record.vatRate > 0
                                                ? `НДС ${record.vatRate} %`
                                                : 'без НДС'}
                                        </div>
                                    </div>
                                ),
                            },
                        ]}
                    />
                )}
            </Modal>
        </div>
    );
}
