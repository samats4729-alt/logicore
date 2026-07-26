'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Button,
    DatePicker,
    Dropdown,
    Input,
    Select,
    Space,
    Table,
    Tabs,
    Tooltip,
    message,
    theme,
} from 'antd';
import {
    EyeOutlined,
    MoreOutlined,
    PlusOutlined,
    PrinterOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import dayjs, { Dayjs } from 'dayjs';
import {
    ACCOUNTING_DOCUMENT_STATUS_LABELS,
    AccountingDocumentListItem,
    AccountingDocumentStatus,
    accountingDocumentHref,
    createServiceActFromInvoice,
    fetchAccountingDocument,
    fetchAccountingDocuments,
    openAccountingDocumentPdf,
    openAccountingRegistryPdf,
    revokeAccountingDocumentShare,
} from '@/lib/accounting-documents';

const { RangePicker } = DatePicker;

/** Журнал ведётся за период — как в 1С, где список всегда ограничен датами. */
const DEFAULT_PERIOD: [Dayjs, Dayjs] = [dayjs().startOf('year'), dayjs().endOf('day')];

const money = (value: number) => `${(value ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;

export default function InvoicesRegistryPage() {
    const router = useRouter();
    const { token } = theme.useToken();
    const { user } = useAuthStore();

    const [documents, setDocuments] = useState<AccountingDocumentListItem[]>([]);
    const [totals, setTotals] = useState({ amount: 0, paid: 0, due: 0 });
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const [direction, setDirection] = useState<'OUTGOING' | 'INCOMING'>('OUTGOING');
    const [status, setStatus] = useState<AccountingDocumentStatus | 'all'>('all');
    const [counterpartyId, setCounterpartyId] = useState<string | undefined>();
    const [period, setPeriod] = useState<[Dayjs, Dayjs]>(DEFAULT_PERIOD);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const [counterparties, setCounterparties] = useState<{ id: string; name: string }[]>([]);
    /** Отмеченные строки — печать реестра только по ним. */
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [actFromId, setActFromId] = useState<string | null>(null);

    const canChange = useMemo(
        () => ['ACCOUNTANT', 'FORWARDER', 'COMPANY_ADMIN', 'ADMIN'].includes(user?.role || ''),
        [user],
    );

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const result = await fetchAccountingDocuments({
                type: 'PAYMENT_INVOICE',
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
            message.error('Не удалось загрузить журнал счетов');
        } finally {
            setLoading(false);
        }
    }, [direction, status, counterpartyId, period, page]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        api.get('/partners')
            .then((res) => setCounterparties(
                (res.data || []).map((p: any) => ({ id: p.id, name: p.name || 'Без названия' })),
            ))
            .catch(() => setCounterparties([]));
    }, []);

    // Поиск по номеру и контрагенту — по загруженной странице. Отбор по
    // контрагенту целиком делает фильтр выше, он работает по всей базе.
    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return documents;
        return documents.filter((doc) =>
            doc.number.toLowerCase().includes(term)
            || (doc.counterparty?.name || '').toLowerCase().includes(term));
    }, [documents, search]);

    const copyShareLink = (doc: AccountingDocumentListItem) => {
        const url = `${window.location.origin}/shared/document/${doc.shareToken}`;
        navigator.clipboard.writeText(url);
        message.success('Ссылка скопирована');
    };

    /**
     * «Ввод на основании» прямо из журнала: по проведённому счёту сразу
     * создаётся акт. Карточка счёта для этого открывается запросом — в
     * списке приходят не все поля, а акт собирается из строк документа.
     */
    const createActFrom = async (doc: AccountingDocumentListItem) => {
        try {
            setActFromId(doc.id);
            const invoice = await fetchAccountingDocument(doc.id);
            const { document, created } = await createServiceActFromInvoice(invoice);
            message.success(created
                ? `Черновик акта № ${document.number} создан`
                : `По рейсу счёта уже есть акт № ${document.number}`);
            router.push(accountingDocumentHref({ id: document.id, type: 'SERVICE_ACT' }));
        } catch (e: any) {
            message.error(e.response?.data?.message || e.message || 'Не удалось создать акт');
        } finally {
            setActFromId(null);
        }
    };

    const printRegistry = () => {
        openAccountingRegistryPdf({
            type: 'PAYMENT_INVOICE',
            direction,
            status: status === 'all' ? undefined : status,
            counterpartyId,
            from: period[0].format('YYYY-MM-DD'),
            to: period[1].format('YYYY-MM-DD'),
            // Пусто — печатается вся выборка фильтров, как на экране.
            ids: selectedIds,
        });
    };

    const revokeShare = async (doc: AccountingDocumentListItem) => {
        try {
            await revokeAccountingDocumentShare(doc.id);
            message.success('Ссылка отозвана — прежняя больше не откроется');
            load();
        } catch {
            message.error('Не удалось отозвать ссылку');
        }
    };

    const columns = [
        {
            title: 'Номер',
            dataIndex: 'number',
            key: 'number',
            width: 150,
            render: (value: string, record: AccountingDocumentListItem) => (
                <a onClick={() => router.push(`/company/accounting/invoices/${record.id}`)} style={{ fontWeight: 600 }}>
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
                        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>БИН {record.counterparty.bin}</div>
                    )}
                </div>
            ),
        },
        {
            // «Сделка» в терминах 1С — заявка, по которой выставлен документ.
            title: 'Сделка',
            key: 'orders',
            width: 150,
            render: (_: unknown, record: AccountingDocumentListItem) => {
                const orders = record.orders || [];
                if (!orders.length) return <span style={{ color: token.colorTextDisabled }}>—</span>;
                const rest = (record._count?.orders ?? orders.length) - orders.length;
                return (
                    <Tooltip title={orders.map((o) => o.order.orderNumber).join(', ')}>
                        <span style={{ fontSize: 12 }}>
                            {orders[0].order.orderNumber}
                            {rest > 0 && <span style={{ color: token.colorTextSecondary }}> +{rest}</span>}
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Срок оплаты',
            dataIndex: 'dueDate',
            key: 'dueDate',
            width: 110,
            render: (value: string | null, record: AccountingDocumentListItem) => {
                if (!value) return <span style={{ color: token.colorTextDisabled }}>—</span>;
                const overdue = record.balanceDue > 0
                    && dayjs(value).isBefore(dayjs(), 'day')
                    && record.status === 'POSTED';
                return (
                    <span style={{ color: overdue ? token.colorError : undefined, fontWeight: overdue ? 600 : 400 }}>
                        {dayjs(value).format('DD.MM.YYYY')}
                    </span>
                );
            },
        },
        {
            title: 'Сумма',
            dataIndex: 'total',
            key: 'total',
            width: 140,
            align: 'right' as const,
            render: (value: number) => <span style={{ fontWeight: 600 }}>{money(value)}</span>,
        },
        {
            // Частичные оплаты видны сразу: «оплачено из суммы».
            title: 'Оплачено',
            key: 'amountPaid',
            width: 150,
            align: 'right' as const,
            render: (_: unknown, record: AccountingDocumentListItem) => {
                if (!record.amountPaid) return <span style={{ color: token.colorTextDisabled }}>—</span>;
                const full = record.balanceDue <= 0;
                return (
                    <div>
                        <div style={{ color: full ? token.colorSuccess : undefined }}>{money(record.amountPaid)}</div>
                        {!full && (
                            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                остаток {money(record.balanceDue)}
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
            width: 110,
            render: (value: AccountingDocumentStatus) => {
                const color = value === 'POSTED'
                    ? token.colorSuccess
                    : value === 'CANCELLED'
                        ? token.colorTextDisabled
                        : token.colorWarning;
                return <span style={{ color, fontWeight: 500, fontSize: 12 }}>{ACCOUNTING_DOCUMENT_STATUS_LABELS[value]}</span>;
            },
        },
        {
            title: '',
            key: 'actions',
            width: 100,
            render: (_: unknown, record: AccountingDocumentListItem) => (
                // Для бухгалтера первичны «Открыть» и «Печать»; всё остальное —
                // в меню, чтобы строка журнала оставалась спокойной.
                <Space size={4}>
                    <Tooltip title="Открыть">
                        <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => router.push(`/company/accounting/invoices/${record.id}`)}
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
                                    key: 'act',
                                    label: 'Создать акт на основании',
                                    // Черновик контрагенту не отдан — актировать
                                    // по нему нечего; входящий счёт выставил он.
                                    // Пока акт создаётся, второй запуск закрыт:
                                    // иначе по двойному клику уедут два акта.
                                    disabled: !canChange
                                        || record.status !== 'POSTED'
                                        || record.direction !== 'OUTGOING'
                                        || Boolean(actFromId),
                                    onClick: () => createActFrom(record),
                                },
                                { type: 'divider' as const },
                                {
                                    key: 'copy',
                                    label: 'Скопировать ссылку',
                                    disabled: record.status !== 'POSTED' || Boolean(record.shareRevokedAt),
                                    onClick: () => copyShareLink(record),
                                },
                                {
                                    key: 'revoke',
                                    label: 'Отозвать ссылку',
                                    danger: true,
                                    disabled: !canChange || Boolean(record.shareRevokedAt),
                                    onClick: () => revokeShare(record),
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
                    <div className="lc-eyebrow">Финансы · Счета</div>
                    <h1 className="lc2-title">Журнал счетов</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 14px' }}>
                        Исходящие — покупателям, входящие — от поставщиков. Это документы на оплату, а не сами деньги.
                    </p>
                    {canChange && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => router.push('/company/accounting/invoices/create')}
                            className="lc-cta"
                        >
                            Выставить счёт
                        </Button>
                    )}
                </div>
            </div>

            <div className="lc-card" style={{ padding: 20 }}>
                <Tabs
                    activeKey={direction}
                    onChange={(key) => { setDirection(key as 'OUTGOING' | 'INCOMING'); setPage(1); }}
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
                        options={counterparties.map((c) => ({ value: c.id, label: c.name }))}
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
                    {/* Печать журнала — как меню Печать → Реестр документов в 1С.
                        Без отметок печатается вся выборка фильтров. */}
                    <Tooltip
                        title={selectedIds.length
                            ? `Печать реестра по отмеченным строкам: ${selectedIds.length}`
                            : 'Печать реестра по текущему отбору'}
                    >
                        <Button icon={<PrinterOutlined />} onClick={printRegistry}>
                            {selectedIds.length ? `Реестр (${selectedIds.length})` : 'Реестр'}
                        </Button>
                    </Tooltip>
                </div>

                <Table
                    columns={columns}
                    dataSource={visible}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    scroll={{ x: 1100 }}
                    rowSelection={{
                        selectedRowKeys: selectedIds,
                        onChange: (keys) => setSelectedIds(keys as string[]),
                        // Отметки живут только внутри страницы: реестр за
                        // период печатается фильтрами, а не перелистыванием.
                        preserveSelectedRowKeys: false,
                    }}
                    pagination={{
                        current: page,
                        pageSize: 30,
                        total: totalCount,
                        showSizeChanger: false,
                        onChange: setPage,
                        showTotal: (t) => `Всего документов: ${t}`,
                    }}
                    summary={() => (
                        // Итоги считаются по всей выборке фильтров, а не по
                        // странице: «сколько выставлено за период» не должно
                        // зависеть от листания.
                        <Table.Summary fixed>
                            <Table.Summary.Row style={{ background: token.colorFillAlter, fontWeight: 600 }}>
                                {/* +1 колонка на галочки выбора строк, иначе
                                    итоги съезжают под «Сумму» и «Оплачено». */}
                                <Table.Summary.Cell index={0} colSpan={6}>
                                    Итого за период
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={6} align="right">{money(totals.amount)}</Table.Summary.Cell>
                                <Table.Summary.Cell index={7} align="right">
                                    <div>{money(totals.paid)}</div>
                                    {totals.due > 0 && (
                                        <div style={{ fontSize: 11, fontWeight: 400, color: token.colorTextSecondary }}>
                                            долг {money(totals.due)}
                                        </div>
                                    )}
                                </Table.Summary.Cell>
                                <Table.Summary.Cell index={8} colSpan={2} />
                            </Table.Summary.Row>
                        </Table.Summary>
                    )}
                />
            </div>
        </div>
    );
}
