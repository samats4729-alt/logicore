'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, DatePicker, Empty, Input, InputNumber, Modal, Segmented, Select, Space, Spin, Switch, Table, Tooltip, theme } from 'antd';
import {
    ArrowLeftOutlined,
    DeleteOutlined,
    PlusOutlined,
    SelectOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/lib/api';
import StatusPill from '@/components/ui/StatusPill';
import {
    AccountingDocumentDirection,
    BillableOrder,
    CompanyBankAccount,
    CreateAccountingDocumentLineInput,
    createAccountingDocument,
    fetchBillableOrders,
    fetchCompanyBankAccounts,
    routePointsLabel,
} from '@/lib/accounting-documents';
import { toast } from 'sonner';
import CurrencySelect from '@/components/orders/CurrencySelect';

const money = (value: number) =>
    `${(value ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;

const VAT_OPTIONS = [
    { value: 'none', label: 'Без НДС' },
    { value: '12', label: '12 %' },
    { value: '0', label: '0 %' },
];

/** Строка будущего документа — до создания живёт только на клиенте. */
interface DraftLine {
    key: string;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    /** 'none' — без НДС, иначе ставка в процентах. */
    vat: string;
    orderId: string | null;
    orderNumber: string | null;
    orderDetails: string | null;
}

const lineFromOrder = (order: BillableOrder): DraftLine => ({
    key: `order-${order.id}`,
    name: 'Транспортные услуги',
    quantity: 1,
    unit: 'усл',
    unitPrice: order.amount ?? 0,
    vat: order.hasVat && order.vatRate > 0 ? String(order.vatRate) : 'none',
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderDetails: [
        routePointsLabel(order.routePoints),
        order.assignedDriverName,
        order.assignedDriverPlate,
    ].filter(Boolean).join(' · ') || null,
});

const toPayload = (line: DraftLine): CreateAccountingDocumentLineInput => ({
    name: line.name.trim(),
    quantity: String(line.quantity ?? 1),
    unit: line.unit?.trim() || 'усл',
    unitPrice: (line.unitPrice ?? 0).toFixed(2),
    ...(line.vat === 'none' || Number(line.vat) === 0
        ? {}
        : { vatTreatment: 'STANDARD' as const, vatCalculation: 'INCLUDED' as const, vatRate: line.vat }),
    orderId: line.orderId || undefined,
});

/**
 * Создание счёта — первый шаг раздела «Счета» перед карточкой документа.
 *
 * Поток сохранён прежний и привычный по 1С: выбрать контрагента, затем
 * «Подобрать по заявкам» — рейсы превращаются в строки счёта. Дополнительно
 * строку можно добавить руками из справочника услуг, как в 1С.
 *
 * Номер документа не спрашивается: его выдаёт нумератор при создании — так
 * два бухгалтера не выставят два счёта с одним номером.
 */
export default function CreateInvoicePage() {
    const router = useRouter();
    const { token } = theme.useToken();

    const [direction, setDirection] = useState<AccountingDocumentDirection>('OUTGOING');
    const [counterpartyId, setCounterpartyId] = useState<string | undefined>();
    const [documentDate, setDocumentDate] = useState<Dayjs>(dayjs());
    /**
     * Валюта счёта. По умолчанию тенге — так выставляют почти все счета.
     *
     * Менять её можно только пока счёт черновик: у проведённого документа
     * валюта и курс уже стали частью обязательства.
     */
    const [currency, setCurrency] = useState('KZT');
    const [dueDate, setDueDate] = useState<Dayjs | null>(null);
    const [bankAccountId, setBankAccountId] = useState<string | undefined>();
    const [note, setNote] = useState('');
    const [lines, setLines] = useState<DraftLine[]>([]);
    const [submitting, setSubmitting] = useState(false);

    // БИН держим рядом с названием: у контрагентов бывают почти одинаковые
    // имена, и бухгалтер различает их именно по БИН.
    const [counterparties, setCounterparties] = useState<{ id: string; name: string; bin?: string }[]>([]);
    const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
    const [services, setServices] = useState<{ id: string; name: string; unit: string }[]>([]);

    // Окно «Подобрать по заявкам».
    const [pickerOpen, setPickerOpen] = useState(false);
    const [orders, setOrders] = useState<BillableOrder[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [pickedIds, setPickedIds] = useState<string[]>([]);
    const [includeInProgress, setIncludeInProgress] = useState(false);

    useEffect(() => {
        Promise.all([api.get('/partners'), api.get('/external-companies')])
            .then(([partners, external]) => setCounterparties([
                ...(partners.data || []).map((p: any) => ({ id: p.id, name: p.name || 'Без названия' })),
                ...(external.data || []).map((e: any) => ({ id: e.id, name: `${e.name} (офлайн)` })),
            ]))
            .catch(() => toast.error('Не удалось загрузить список контрагентов'));

        fetchCompanyBankAccounts()
            .then((accounts) => {
                setBankAccounts(accounts);
                setBankAccountId(accounts.find((a) => a.isDefault && a.isActive)?.id);
            })
            .catch(() => setBankAccounts([]));

        api.get('/accounting/service-catalog')
            .then((res) => setServices((res.data || []).filter((s: any) => s.isActive)))
            .catch(() => setServices([]));
    }, []);

    // Смена направления или контрагента обнуляет подбор: строки прежнего
    // контрагента к новому отношения не имеют.
    useEffect(() => {
        setLines([]);
        setOrders([]);
        setPickedIds([]);
    }, [direction, counterpartyId]);

    const loadOrders = useCallback(async () => {
        if (!counterpartyId) return;
        try {
            setLoadingOrders(true);
            const data = await fetchBillableOrders({ direction, counterpartyId, includeInProgress });
            setOrders(data);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось загрузить заявки');
            setOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    }, [direction, counterpartyId, includeInProgress]);

    useEffect(() => {
        if (pickerOpen) loadOrders();
    }, [pickerOpen, loadOrders]);

    const totals = useMemo(() => {
        let total = 0;
        let vat = 0;
        for (const line of lines) {
            const amount = Math.round((line.quantity || 0) * (line.unitPrice || 0) * 100) / 100;
            total += amount;
            const rate = line.vat === 'none' ? 0 : Number(line.vat);
            if (rate > 0) vat += Math.round((amount * rate / (100 + rate)) * 100) / 100;
        }
        return { total, vat };
    }, [lines]);

    const updateLine = (key: string, patch: Partial<DraftLine>) =>
        setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));

    const openPicker = () => {
        if (!counterpartyId) {
            toast.warning('Сначала выберите контрагента');
            return;
        }
        // Уже добавленные рейсы отмечены — окно показывает текущий выбор.
        setPickedIds(lines.map((l) => l.orderId).filter((id): id is string => Boolean(id)));
        setPickerOpen(true);
    };

    const applyPicked = () => {
        const manual = lines.filter((line) => !line.orderId);
        const picked = orders
            .filter((order) => pickedIds.includes(order.id))
            .map(lineFromOrder);
        // Ручные строки сохраняются: подбор управляет только строками заявок.
        setLines([...picked, ...manual]);
        setPickerOpen(false);
    };

    const addManualLine = () => {
        const preset = services[0];
        setLines((prev) => [...prev, {
            key: `manual-${Date.now()}-${prev.length}`,
            name: preset?.name || 'Транспортные услуги',
            quantity: 1,
            unit: preset?.unit || 'усл',
            unitPrice: 0,
            vat: 'none',
            orderId: null,
            orderNumber: null,
            orderDetails: null,
        }]);
    };

    const submit = async () => {
        if (!counterpartyId) {
            toast.warning('Выберите контрагента');
            return;
        }
        if (!lines.length) {
            toast.warning('Добавьте хотя бы одну строку — подбором по заявкам или вручную');
            return;
        }
        if (lines.some((line) => !line.name.trim())) {
            toast.warning('У каждой строки должно быть наименование услуги');
            return;
        }
        try {
            setSubmitting(true);
            const created = await createAccountingDocument({
                type: 'PAYMENT_INVOICE',
                direction,
                counterpartyId,
                documentDate: documentDate.format('YYYY-MM-DD'),
                currency,
                dueDate: dueDate ? dueDate.format('YYYY-MM-DD') : undefined,
                bankAccountId,
                note: note.trim() || undefined,
                lines: lines.map(toPayload),
            });
            toast.success(`Черновик счёта № ${created.number} создан`);
            // Дальше работа идёт в карточке: там документ проводят и печатают.
            router.push(`/company/accounting/invoices/${created.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось создать счёт');
        } finally {
            setSubmitting(false);
        }
    };

    const lineColumns = [
        {
            title: '№',
            key: 'index',
            width: 40,
            render: (_: unknown, __: DraftLine, index: number) => (
                <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>{index + 1}</span>
            ),
        },
        {
            title: 'Документ-основание',
            key: 'basis',
            width: 190,
            render: (_: unknown, record: DraftLine) => (
                record.orderNumber ? (
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>Заявка {record.orderNumber}</div>
                        {record.orderDetails && (
                            <div style={{ fontSize: 11, color: token.colorTextSecondary, lineHeight: 1.35 }}>
                                {record.orderDetails}
                            </div>
                        )}
                    </div>
                ) : <span style={{ color: token.colorTextDisabled, fontSize: 12 }}>—</span>
            ),
        },
        {
            title: 'Услуга',
            key: 'name',
            render: (_: unknown, record: DraftLine) => (
                <Select
                    size="small"
                    showSearch
                    style={{ width: '100%' }}
                    value={record.name}
                    onChange={(value) => updateLine(record.key, { name: value })}
                    onSearch={(value) => { if (value.trim()) updateLine(record.key, { name: value }); }}
                    options={Array.from(new Set([record.name, ...services.map((s) => s.name)]))
                        .filter(Boolean)
                        .map((name) => ({ value: name, label: name }))}
                    filterOption={(input, option) =>
                        String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                />
            ),
        },
        {
            title: 'Кол-во',
            key: 'quantity',
            width: 90,
            align: 'right' as const,
            render: (_: unknown, record: DraftLine) => (
                <InputNumber
                    size="small"
                    min={0.001}
                    style={{ width: '100%' }}
                    value={record.quantity}
                    onChange={(value) => updateLine(record.key, { quantity: Number(value) || 1 })}
                />
            ),
        },
        {
            title: 'Цена',
            key: 'unitPrice',
            width: 140,
            align: 'right' as const,
            render: (_: unknown, record: DraftLine) => (
                <InputNumber
                    size="small"
                    min={0}
                    style={{ width: '100%' }}
                    value={record.unitPrice}
                    onChange={(value) => updateLine(record.key, { unitPrice: Number(value) || 0 })}
                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                    parser={(value) => Number((value || '').replace(/\s/g, '')) as any}
                />
            ),
        },
        {
            title: '% НДС',
            key: 'vat',
            width: 110,
            render: (_: unknown, record: DraftLine) => (
                <Select
                    size="small"
                    style={{ width: '100%' }}
                    value={record.vat}
                    onChange={(value) => updateLine(record.key, { vat: value })}
                    options={VAT_OPTIONS}
                />
            ),
        },
        {
            title: 'Сумма',
            key: 'amount',
            width: 140,
            align: 'right' as const,
            render: (_: unknown, record: DraftLine) => (
                <span style={{ fontWeight: 600 }}>
                    {money((record.quantity || 0) * (record.unitPrice || 0))}
                </span>
            ),
        },
        {
            title: '',
            key: 'remove',
            width: 40,
            render: (_: unknown, record: DraftLine) => (
                <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => setLines((prev) => prev.filter((line) => line.key !== record.key))}
                />
            ),
        },
    ];

    const headerField = (label: string, content: React.ReactNode) => (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minHeight: 34 }}>
            <div style={{ width: 132, flexShrink: 0, fontSize: 12, color: token.colorTextSecondary }}>
                {label}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{content}</div>
        </div>
    );

    return (
        <div className="lc-page" style={{ maxWidth: 1180, margin: '0 auto' }}>
            <div className="lc2-hero" style={{ alignItems: 'flex-start' }}>
                <div>
                    <Button
                        type="link"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => router.push('/company/accounting/invoices')}
                        style={{ padding: 0, color: 'var(--lc-text-ter)', marginBottom: 4 }}
                    >
                        Журнал счетов
                    </Button>
                    <div className="lc-eyebrow">Финансы · Счета</div>
                    <h1 className="lc2-title">Новый счёт</h1>
                    <p style={{ color: 'var(--lc-text-ter)', fontSize: 13, margin: '6px 0 0' }}>
                        Номер присвоится автоматически при создании. Документ создаётся черновиком —
                        провести его можно в карточке.
                    </p>
                </div>

                <Space size={8} style={{ flexShrink: 0, paddingTop: 4 }}>
                    <Button type="primary" loading={submitting} onClick={submit}>
                        Создать черновик
                    </Button>
                </Space>
            </div>

            {/* ===== Шапка документа ===== */}
            <div className="lc-card" style={{ padding: 20, marginBottom: 14 }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                        gap: '4px 32px',
                    }}
                >
                    {headerField('Вид счёта', (
                        <Segmented
                            size="small"
                            value={direction}
                            onChange={(value) => setDirection(value as AccountingDocumentDirection)}
                            options={[
                                { value: 'OUTGOING', label: 'Исходящий' },
                                { value: 'INCOMING', label: 'Входящий' },
                            ]}
                        />
                    ))}

                    {headerField('Контрагент', (
                        <Select
                            size="small"
                            showSearch
                            style={{ width: '100%', maxWidth: 340 }}
                            placeholder={direction === 'OUTGOING' ? 'Кому выставляем' : 'Кто выставил нам'}
                            optionFilterProp="label"
                            value={counterpartyId}
                            onChange={setCounterpartyId}
                            options={counterparties.map((c) => ({ value: c.id, label: c.bin ? `${c.name} · БИН ${c.bin}` : c.name }))}
                        />
                    ))}

                    {headerField('Дата', (
                        <DatePicker
                            size="small"
                            format="DD.MM.YYYY"
                            allowClear={false}
                            style={{ width: 150 }}
                            value={documentDate}
                            onChange={(value) => value && setDocumentDate(value)}
                        />
                    ))}

                    {headerField('Валюта', (
                        <CurrencySelect value={currency} onChange={setCurrency} width={110} />
                    ))}

                    {headerField('Срок оплаты', (
                        <DatePicker
                            size="small"
                            format="DD.MM.YYYY"
                            placeholder="Не указан"
                            style={{ width: 150 }}
                            value={dueDate}
                            onChange={setDueDate}
                        />
                    ))}

                    {headerField('Банковский счёт', (
                        <Select
                            size="small"
                            allowClear
                            style={{ width: '100%', maxWidth: 340 }}
                            placeholder="Счёт по умолчанию"
                            value={bankAccountId}
                            onChange={(value) => setBankAccountId(value)}
                            options={bankAccounts.map((account) => ({
                                value: account.id,
                                label: [account.name, account.iban].filter(Boolean).join(' · '),
                                disabled: !account.isActive,
                            }))}
                            notFoundContent="Банковские счета не заведены"
                        />
                    ))}
                </div>
            </div>

            {/* ===== Табличная часть ===== */}
            <div className="lc-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <Tooltip title={counterpartyId ? undefined : 'Сначала выберите контрагента'}>
                        <Button icon={<SelectOutlined />} onClick={openPicker}>
                            Подобрать по заявкам
                        </Button>
                    </Tooltip>
                    <Button icon={<PlusOutlined />} onClick={addManualLine}>
                        Добавить услугу
                    </Button>
                </div>

                {lines.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
                                Строк пока нет. Подберите рейсы по заявкам или добавьте услугу вручную.
                            </span>
                        }
                        style={{ padding: '24px 0' }}
                    />
                ) : (
                    <Table
                        columns={lineColumns}
                        dataSource={lines}
                        rowKey="key"
                        size="small"
                        pagination={false}
                        scroll={{ x: 900 }}
                    />
                )}

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        gap: 32,
                        marginTop: 18,
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ flex: '1 1 320px', minWidth: 260 }}>
                        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 4 }}>
                            Комментарий
                        </div>
                        <Input.TextArea
                            rows={2}
                            maxLength={4000}
                            placeholder="Виден только вашей компании"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                            В том числе НДС: {money(totals.vat)}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                            Всего: {money(totals.total)}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== Подбор по заявкам ===== */}
            <Modal
                title="Подобрать по заявкам"
                open={pickerOpen}
                onCancel={() => setPickerOpen(false)}
                onOk={applyPicked}
                okText={`Перенести в счёт (${pickedIds.length})`}
                cancelText="Отмена"
                width={980}
                destroyOnClose
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
                    <Switch size="small" checked={includeInProgress} onChange={setIncludeInProgress} />
                    <span style={{ fontSize: 13 }}>Показать рейсы в работе — счёт на аванс</span>
                </div>

                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="Показаны только рейсы, на которые счёт ещё не выставлен."
                    description="Цена и ставка НДС подставляются из заявки — в строках счёта их можно поправить."
                />

                {loadingOrders ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
                ) : (
                    <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        scroll={{ y: 420 }}
                        dataSource={orders}
                        rowSelection={{
                            selectedRowKeys: pickedIds,
                            onChange: (keys) => setPickedIds(keys as string[]),
                        }}
                        locale={{
                            emptyText: includeInProgress
                                ? 'Нет рейсов без счёта у этого контрагента'
                                : 'Нет завершённых рейсов без счёта. Включите «рейсы в работе» для аванса.',
                        }}
                        columns={[
                            {
                                title: 'Заявка',
                                dataIndex: 'orderNumber',
                                width: 140,
                                render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
                            },
                            {
                                title: 'Статус',
                                dataIndex: 'status',
                                width: 130,
                                render: (value: string) => <StatusPill status={value} />,
                            },
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
                                title: 'Груз',
                                dataIndex: 'cargoDescription',
                                ellipsis: true,
                                render: (value: string | null) => (
                                    <span style={{ fontSize: 12 }}>{value || '—'}</span>
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
