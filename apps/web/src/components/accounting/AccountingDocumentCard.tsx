'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, DatePicker, Dropdown, Input, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tooltip, theme } from 'antd';
import {
    ArrowLeftOutlined,
    CheckOutlined,
    DownOutlined,
    DeleteOutlined,
    FileTextOutlined,
    LinkOutlined,
    SendOutlined,
    MoreOutlined,
    PlusOutlined,
    PrinterOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
    ACCOUNTING_DOCUMENT_STATUS_LABELS,
    AccountingDocumentDetails,
    AccountingDocumentLine,
    BillableOrder,
    CompanyBankAccount,
    CreateAccountingDocumentLineInput,
    DocumentDelivery,
    accountingDocumentHref,
    cancelAccountingDocument,
    createServiceActFromInvoice,
    deleteAccountingDocumentDraft,
    fetchAccountingDocument,
    fetchBillableOrders,
    fetchDocumentDelivery,
    sendAccountingDocument,
    fetchCompanyBankAccounts,
    openAccountingDocumentPdf,
    orderRouteLabel,
    orderToInvoiceLines,
    routePointsLabel,
    postAccountingDocument,
    revokeAccountingDocumentShare,
    updateAccountingDocument,
} from '@/lib/accounting-documents';
import { toast } from 'sonner';
import { VAT_RATES } from '@/lib/tax';

/**
 * Сумма со знаком валюты документа.
 *
 * Знак тенге больше не зашит: счёт может быть в рублях или долларах, и
 * «100 000 ₸» на долларовом счёте — не опечатка, а другая сумма в четыреста
 * раз. Для валют без общеизвестного знака показываем код.
 */
const CURRENCY_SIGNS: Record<string, string> = {
    KZT: '₸', RUB: '₽', USD: '$', EUR: '€', GBP: '£', UAH: '₴', TRY: '₺', CNY: '¥', JPY: '¥',
};

const money = (value: number, currency = 'KZT') => {
    const amount = (value ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = CURRENCY_SIGNS[currency];
    return sign ? `${amount} ${sign}` : `${amount} ${currency}`;
};

/**
 * Ставки, которые бухгалтер выбирает в 1С в графе «% НДС».
 *
 * Берём из общего списка ставок, а не вписываем числом: с 2026 года в РК
 * действует 16%, заявка её уже подставляет, а здесь оставалось только 12% —
 * строка счёта по такой заявке приходила со ставкой, которой нет в списке.
 */
const VAT_OPTIONS = [
    { value: 'none', label: 'Без НДС' },
    ...VAT_RATES.map((rate) => ({ value: String(rate.value), label: `${rate.value} %` })),
];

/** Строка таблицы в карточке: то же, что строка документа, но редактируемая. */
interface EditableLine {
    key: string;
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    /** 'none' — без НДС, иначе ставка в процентах. */
    vat: string;
    orderId: string | null;
    orderNumber: string | null;
    orderDetails: string | null;
}

const toEditable = (
    line: AccountingDocumentLine,
    orderInfo: Map<string, { number: string; details: string | null }>,
): EditableLine => {
    const order = line.orderId ? orderInfo.get(line.orderId) : undefined;
    return {
        key: line.id,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        vat: line.vatTreatment === 'STANDARD' ? String(line.vatRate) : 'none',
        orderId: line.orderId,
        orderNumber: order?.number ?? null,
        orderDetails: order?.details ?? null,
    };
};

const toPayload = (line: EditableLine): CreateAccountingDocumentLineInput => ({
    name: line.name.trim(),
    description: line.description || undefined,
    quantity: String(line.quantity ?? 1),
    unit: line.unit?.trim() || 'усл',
    unitPrice: (line.unitPrice ?? 0).toFixed(2),
    // API отклоняет ставку без STANDARD и STANDARD без ставки, поэтому
    // «Без НДС» и «0 %» отправляются как разные наборы полей.
    ...(line.vat === 'none' || Number(line.vat) === 0
        ? {}
        : { vatTreatment: 'STANDARD' as const, vatCalculation: 'INCLUDED' as const, vatRate: line.vat }),
    orderId: line.orderId || undefined,
});

/**
 * Чем карточка счёта отличается от карточки акта. Всё остальное у них
 * общее — и это намеренно: один и тот же документ не должен выглядеть
 * по-разному в разных разделах.
 */
const DOCUMENT_KIND = {
    PAYMENT_INVOICE: {
        journalPath: '/company/accounting/invoices',
        journalLabel: 'Журнал счетов',
        eyebrow: (outgoing: boolean) => `Счёт на оплату · ${outgoing ? 'исходящий' : 'входящий'}`,
        cancelLabel: 'Отменить счёт',
        cancelledTitle: 'Счёт отменён',
        postedMessage: (number: string) => `Счёт № ${number} проведён`,
        // У акта нет ни срока оплаты, ни расчётов — он лишь фиксирует, что
        // услуга оказана. Деньги живут в счёте.
        showDueDate: true,
        showBankAccount: true,
        showPayment: true,
    },
    SERVICE_ACT: {
        journalPath: '/company/accounting/acts',
        journalLabel: 'Журнал актов',
        eyebrow: () => 'Акт выполненных работ · форма Р-1',
        cancelLabel: 'Отменить акт',
        cancelledTitle: 'Акт отменён',
        postedMessage: (number: string) => `Акт № ${number} проведён`,
        showDueDate: false,
        showBankAccount: false,
        showPayment: false,
    },
} as const;

type CardDocumentType = keyof typeof DOCUMENT_KIND;

interface AccountingDocumentCardProps {
    documentId: string;
    /** Вид документа — определяет заголовки и набор полей шапки. */
    type: CardDocumentType;
}

/**
 * Карточка бухгалтерского документа — второй уровень разделов «Счета» и
 * «Акты» после журнала.
 *
 * Построена по образцу карточки документа 1С: шапка с номером, датой,
 * организацией и банковским счётом; табличная часть со строками услуг и
 * документом-основанием; внизу — комментарий, итог с НДС и автор.
 *
 * Черновик редактируется прямо здесь и сохраняется кнопкой «Записать».
 * Проведённый документ показывается только на чтение: он уже у контрагента
 * на руках, и меняться задним числом не должен — для исправления его
 * отменяют и выставляют заново.
 */
export default function AccountingDocumentCard({ documentId: id, type }: AccountingDocumentCardProps) {
    const kind = DOCUMENT_KIND[type];
    const router = useRouter();
    const { token } = theme.useToken();
    const { user } = useAuthStore();

    const [document, setDocument] = useState<AccountingDocumentDetails | null>(null);
    const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
    const [services, setServices] = useState<{ id: string; name: string; unit: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [notFound, setNotFound] = useState(false);

    // Правки черновика до нажатия «Записать».
    const [documentDate, setDocumentDate] = useState<Dayjs | null>(null);
    const [dueDate, setDueDate] = useState<Dayjs | null>(null);
    const [bankAccountId, setBankAccountId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    // Номер и дата документа у контрагента. У входящего счёта это номер,
    // под которым перевозчик выставил его нам, — по нему он ищет платёж у
    // себя, и в платёжном поручении должен стоять именно он.
    const [externalNumber, setExternalNumber] = useState('');
    const [externalDate, setExternalDate] = useState<Dayjs | null>(null);
    const [lines, setLines] = useState<EditableLine[]>([]);
    const [dirty, setDirty] = useState(false);
    // Подбор рейсов в уже открытый документ. Раньше рейсы выбирались только
    // при создании: если счёт уже завели, а заказчик попросил добавить в него
    // ещё перевозки, оставалось набивать строки руками.
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerOrders, setPickerOrders] = useState<BillableOrder[]>([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickedIds, setPickedIds] = useState<string[]>([]);
    const [includeInProgress, setIncludeInProgress] = useState(false);
    // Кому можно отправить документ прямо на платформе. Определяется по БИН
    // контрагента: справочная копия — это не арендатор, доставлять ей некуда.
    const [delivery, setDelivery] = useState<DocumentDelivery | null>(null);

    const canChange = useMemo(
        () => ['ACCOUNTANT', 'COMPANY_ADMIN', 'ADMIN'].includes(user?.role || ''),
        [user],
    );
    const isDraft = document?.status === 'DRAFT';
    const editable = Boolean(isDraft && canChange);

    /** Номер и расшифровка заявки для графы «Документ-основание». */
    const orderInfo = useMemo(() => {
        const map = new Map<string, { number: string; details: string | null }>();
        for (const link of document?.orders || []) {
            const details = [
                orderRouteLabel(link.order),
                link.order.assignedDriverName,
                link.order.assignedDriverPlate,
            ].filter(Boolean).join(' · ');
            map.set(link.order.id, { number: link.order.orderNumber, details: details || null });
        }
        return map;
    }, [document]);

    const applyDocument = useCallback((data: AccountingDocumentDetails) => {
        setDocument(data);
        setDocumentDate(dayjs(data.documentDate));
        setDueDate(data.dueDate ? dayjs(data.dueDate) : null);
        setBankAccountId(data.bankAccountId);
        setNote(data.note || '');
        setExternalNumber(data.externalNumber || '');
        setExternalDate(data.externalDate ? dayjs(data.externalDate) : null);
        setDirty(false);
    }, []);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            applyDocument(await fetchAccountingDocument(id));
            // Молчим при ошибке намеренно: доставка — дополнительная
            // возможность, и её недоступность не должна мешать открыть
            // карточку документа.
            fetchDocumentDelivery(id).then(setDelivery).catch(() => setDelivery(null));
        } catch {
            setNotFound(true);
        } finally {
            setLoading(false);
        }
    }, [id, applyDocument]);

    const sendToCounterparty = async () => {
        try {
            await sendAccountingDocument(document!.id);
            toast.success('Документ отправлен контрагенту');
            load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось отправить');
        }
    };

    useEffect(() => {
        if (id) load();
    }, [id, load]);

    // Строки пересобираются из документа только когда пользователь ничего не
    // правит — иначе перезагрузка справочников затёрла бы незаписанное.
    useEffect(() => {
        if (document && !dirty) {
            setLines(document.lines.map((line) => toEditable(line, orderInfo)));
        }
    }, [document, orderInfo, dirty]);

    useEffect(() => {
        fetchCompanyBankAccounts().then(setBankAccounts).catch(() => setBankAccounts([]));
        api.get('/accounting/service-catalog')
            .then((res) => setServices((res.data || []).filter((s: any) => s.isActive)))
            .catch(() => setServices([]));
    }, []);

    const totals = useMemo(() => {
        // Итог в карточке считается по строкам на экране, чтобы правка цены
        // сразу меняла «Всего» — окончательный расчёт всё равно за сервером.
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

    const touch = () => setDirty(true);

    const updateLine = (key: string, patch: Partial<EditableLine>) => {
        setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
        touch();
    };

    const addLine = () => {
        const preset = services.find((s) => s.name);
        setLines((prev) => [...prev, {
            key: `new-${Date.now()}-${prev.length}`,
            name: preset?.name || 'Транспортные услуги',
            description: null,
            quantity: 1,
            unit: preset?.unit || 'усл',
            unitPrice: 0,
            vat: 'none',
            orderId: null,
            orderNumber: null,
            orderDetails: null,
        }]);
        touch();
    };

    const removeLine = (key: string) => {
        setLines((prev) => prev.filter((line) => line.key !== key));
        touch();
    };

    /**
     * Подбор рейсов в открытый документ.
     *
     * Список тот же, что при создании: сервер отдаёт только те рейсы этого
     * контрагента, на которые счёт ещё не выставлен, — уже попавшие в этот
     * документ в нём не появятся.
     */
    const openPicker = async () => {
        if (!document?.counterparty?.id) {
            toast.warning('У документа не указан контрагент');
            return;
        }
        setPickerOpen(true);
        setPickedIds([]);
        setPickerLoading(true);
        try {
            setPickerOrders(await fetchBillableOrders({
                type,
                direction: document.direction,
                counterpartyId: document.counterparty.id,
                includeInProgress,
            }));
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось загрузить рейсы');
            setPickerOrders([]);
        } finally {
            setPickerLoading(false);
        }
    };

    // Переключатель «рейсы в работе» перезапрашивает список, пока окно открыто.
    useEffect(() => {
        if (!pickerOpen || !document?.counterparty?.id) return;
        let cancelled = false;
        setPickerLoading(true);
        fetchBillableOrders({
            type,
            direction: document.direction,
            counterpartyId: document.counterparty.id,
            includeInProgress,
        })
            .then((data) => { if (!cancelled) setPickerOrders(data); })
            .catch(() => { if (!cancelled) setPickerOrders([]); })
            .finally(() => { if (!cancelled) setPickerLoading(false); });
        return () => { cancelled = true; };
    }, [includeInProgress, pickerOpen, document?.counterparty?.id, document?.direction, type]);

    const applyPicked = () => {
        const chosen = pickerOrders.filter((order) => pickedIds.includes(order.id));
        if (!chosen.length) {
            setPickerOpen(false);
            return;
        }
        setLines((prev) => [...prev, ...chosen.flatMap(orderToInvoiceLines)]);
        setPickerOpen(false);
        setPickedIds([]);
        touch();
        toast.success(`Добавлено рейсов: ${chosen.length}. Не забудьте «Записать»`);
    };

    /** «Записать» — сохранить черновик, не проводя его. */
    const save = async (): Promise<boolean> => {
        if (!document) return false;
        if (!lines.length) {
            toast.warning('В документе должна остаться хотя бы одна строка');
            return false;
        }
        const empty = lines.find((line) => !line.name.trim());
        if (empty) {
            toast.warning('У каждой строки должно быть наименование услуги');
            return false;
        }
        try {
            setSaving(true);
            const saved = await updateAccountingDocument(document.id, {
                documentDate: documentDate?.format('YYYY-MM-DD'),
                note: note.trim() || null,
                externalNumber: externalNumber.trim() || null,
                externalDate: externalDate ? externalDate.format('YYYY-MM-DD') : null,
                lines: lines.map(toPayload),
                // Срок оплаты и расчётный счёт есть только у счёта: у акта
                // этих полей нет в шапке, и слать их — значит переписывать
                // снимок реквизитов без причины.
                ...(kind.showDueDate ? { dueDate: dueDate ? dueDate.format('YYYY-MM-DD') : null } : {}),
                ...(kind.showBankAccount ? { bankAccountId } : {}),
            });
            applyDocument(saved);
            toast.success('Записано');
            return true;
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось записать документ');
            return false;
        } finally {
            setSaving(false);
        }
    };

    /** «Провести» — зафиксировать документ; дальше он только читается. */
    const post = async (closeAfter: boolean) => {
        if (!document) return;
        if (dirty && !(await save())) return;
        try {
            setSaving(true);
            const posted = await postAccountingDocument(document.id);
            applyDocument(posted);
            toast.success(kind.postedMessage(posted.number));
            if (closeAfter) router.push(kind.journalPath);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось провести документ');
        } finally {
            setSaving(false);
        }
    };

    /**
     * «Создать акт на основании» — строки и рейсы переносятся из счёта.
     * Проведённый счёт уже у контрагента, и акт закрывает ровно его.
     */
    const createServiceAct = async () => {
        if (!document) return;
        try {
            setSaving(true);
            const { document: act, created } = await createServiceActFromInvoice(document);
            toast.success(created
                ? `Черновик акта № ${act.number} создан`
                : `По рейсу счёта уже есть акт № ${act.number}`);
            router.push(accountingDocumentHref({ id: act.id, type: 'SERVICE_ACT' }));
        } catch (e: any) {
            toast.error(e.response?.data?.message || e.message || 'Не удалось создать акт');
        } finally {
            setSaving(false);
        }
    };

    const cancel = () => {
        let reason = '';
        Modal.confirm({
            title: `${kind.cancelLabel} № ${document?.number}?`,
            content: (
                <div>
                    <p style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                        Отменённый счёт остаётся в журнале с пометкой и причиной — так его видно при сверке.
                    </p>
                    <Input.TextArea
                        rows={2}
                        placeholder="Причина отмены"
                        onChange={(e) => { reason = e.target.value; }}
                    />
                </div>
            ),
            okText: kind.cancelLabel,
            okButtonProps: { danger: true },
            cancelText: 'Закрыть',
            onOk: async () => {
                if (!reason.trim()) {
                    toast.warning('Укажите причину отмены');
                    return Promise.reject();
                }
                await cancelAccountingDocument(document!.id, reason.trim());
                toast.success(kind.cancelledTitle);
                return load();
            },
        });
    };

    const removeDraft = () => {
        Modal.confirm({
            title: 'Удалить черновик?',
            content: 'Непроведённый документ удаляется без следа. Номер останется использованным.',
            okText: 'Удалить',
            okButtonProps: { danger: true },
            cancelText: 'Отмена',
            onOk: async () => {
                await deleteAccountingDocumentDraft(id);
                toast.success('Черновик удалён');
                router.push(kind.journalPath);
            },
        });
    };

    const copyShareLink = () => {
        if (!document) return;
        navigator.clipboard.writeText(`${window.location.origin}/shared/document/${document.shareToken}`);
        toast.success('Ссылка скопирована — по ней контрагент откроет счёт без входа');
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (notFound || !document) {
        return (
            <div className="lc-page" style={{ maxWidth: 720, margin: '0 auto' }}>
                <Alert
                    type="error"
                    showIcon
                    message={`Документ не найден`}
                    description="Документ удалён или относится к другой организации."
                    action={
                        <Button size="small" onClick={() => router.push(kind.journalPath)}>
                            К журналу
                        </Button>
                    }
                />
            </div>
        );
    }

    const issuer = document.issuerSnapshot || {};
    const recipient = document.recipientSnapshot || {};
    const outgoing = document.direction === 'OUTGOING';
    // «Организация» — наша сторона: в исходящем счёте мы исполнитель,
    // во входящем документ выставили нам.
    const own = outgoing ? issuer : recipient;
    const other = outgoing ? recipient : issuer;

    const statusColor = document.status === 'POSTED'
        ? token.colorSuccess
        : document.status === 'CANCELLED'
            ? token.colorTextDisabled
            : token.colorWarning;

    const lineColumns = [
        {
            title: '№',
            key: 'index',
            width: 40,
            render: (_: unknown, __: EditableLine, index: number) => (
                <span style={{ color: token.colorTextTertiary, fontSize: 12 }}>{index + 1}</span>
            ),
        },
        {
            // В 1С это графа «Документ-основание»: номер сделки, а под ним —
            // расшифровка рейса, чтобы не открывать заявку ради проверки.
            title: 'Документ-основание',
            key: 'basis',
            width: 190,
            render: (_: unknown, record: EditableLine) => {
                if (!record.orderNumber) {
                    return <span style={{ color: token.colorTextDisabled, fontSize: 12 }}>—</span>;
                }
                return (
                    <div>
                        <a
                            style={{ fontSize: 12, fontWeight: 500 }}
                            onClick={() => router.push(`/company/orders/${record.orderId}`)}
                        >
                            Заявка {record.orderNumber}
                        </a>
                        {record.orderDetails && (
                            <div style={{ fontSize: 11, color: token.colorTextSecondary, lineHeight: 1.35 }}>
                                {record.orderDetails}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Услуга',
            key: 'name',
            render: (_: unknown, record: EditableLine) => (
                editable ? (
                    <Select
                        size="small"
                        showSearch
                        allowClear={false}
                        style={{ width: '100%' }}
                        value={record.name}
                        onChange={(value) => updateLine(record.key, { name: value })}
                        options={Array.from(new Set([
                            record.name,
                            ...services.map((s) => s.name),
                        ])).filter(Boolean).map((name) => ({ value: name, label: name }))}
                        // Услугу можно и вписать руками — справочник не всегда полон.
                        onSearch={(value) => {
                            if (value.trim()) updateLine(record.key, { name: value });
                        }}
                        filterOption={(input, option) =>
                            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    />
                ) : (
                    <div>
                        <div style={{ fontSize: 13 }}>{record.name}</div>
                        {record.description && (
                            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>{record.description}</div>
                        )}
                    </div>
                )
            ),
        },
        {
            title: 'Кол-во',
            key: 'quantity',
            width: 90,
            align: 'right' as const,
            render: (_: unknown, record: EditableLine) => (
                editable ? (
                    <InputNumber
                        size="small"
                        min={0.001}
                        step={1}
                        style={{ width: '100%' }}
                        value={record.quantity}
                        onChange={(value) => updateLine(record.key, { quantity: Number(value) || 1 })}
                    />
                ) : record.quantity
            ),
        },
        {
            title: 'Ед.',
            key: 'unit',
            width: 60,
            render: (_: unknown, record: EditableLine) => (
                <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{record.unit}</span>
            ),
        },
        {
            title: 'Цена',
            key: 'unitPrice',
            width: 140,
            align: 'right' as const,
            render: (_: unknown, record: EditableLine) => (
                editable ? (
                    <InputNumber
                        size="small"
                        min={0}
                        style={{ width: '100%' }}
                        value={record.unitPrice}
                        onChange={(value) => updateLine(record.key, { unitPrice: Number(value) || 0 })}
                        formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                        parser={(value) => Number((value || '').replace(/\s/g, '')) as any}
                    />
                ) : money(record.unitPrice, document.currency)
            ),
        },
        {
            title: '% НДС',
            key: 'vat',
            width: 110,
            render: (_: unknown, record: EditableLine) => (
                editable ? (
                    <Select
                        size="small"
                        style={{ width: '100%' }}
                        value={record.vat}
                        onChange={(value) => updateLine(record.key, { vat: value })}
                        options={VAT_OPTIONS}
                    />
                ) : (
                    <span style={{ fontSize: 12 }}>
                        {record.vat === 'none' ? 'Без НДС' : `${record.vat} %`}
                    </span>
                )
            ),
        },
        {
            title: 'Сумма',
            key: 'amount',
            width: 140,
            align: 'right' as const,
            render: (_: unknown, record: EditableLine) => (
                <span style={{ fontWeight: 600 }}>
                    {money((record.quantity || 0) * (record.unitPrice || 0), document.currency)}
                </span>
            ),
        },
        ...(editable ? [{
            title: '',
            key: 'remove',
            width: 40,
            render: (_: unknown, record: EditableLine) => (
                <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeLine(record.key)}
                />
            ),
        }] : []),
    ];

    const headerField = (label: string, content: React.ReactNode) => (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minHeight: 30 }}>
            <div style={{ width: 132, flexShrink: 0, fontSize: 12, color: token.colorTextSecondary }}>
                {label}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{content}</div>
        </div>
    );

    const partyLine = (party: Record<string, any>) => (
        <div>
            <div style={{ fontWeight: 500 }}>{party.name || '—'}</div>
            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                {[party.bin && `БИН ${party.bin}`, party.address].filter(Boolean).join(', ') || '—'}
            </div>
        </div>
    );

    return (
        <div className="lc-page" style={{ maxWidth: 1180, margin: '0 auto' }}>
            <div className="lc2-hero" style={{ alignItems: 'flex-start' }}>
                <div>
                    <Button
                        type="link"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => router.push(kind.journalPath)}
                        style={{ padding: 0, color: 'var(--lc-text-ter)', marginBottom: 4 }}
                    >
                        {kind.journalLabel}
                    </Button>
                    <div className="lc-eyebrow">
                        {kind.eyebrow(outgoing)}
                    </div>
                    <h1 className="lc2-title" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                        № {document.number}
                        <span style={{ fontSize: 13, fontWeight: 500, color: statusColor }}>
                            {ACCOUNTING_DOCUMENT_STATUS_LABELS[document.status]}
                        </span>
                    </h1>
                </div>

                {/* Порядок кнопок как в 1С: сначала завершающее действие. */}
                <Space size={8} wrap style={{ flexShrink: 0, paddingTop: 4 }}>
                    {editable && (
                        <>
                            <Button type="primary" loading={saving} onClick={() => post(true)}>
                                Провести и закрыть
                            </Button>
                            <Button icon={<CheckOutlined />} loading={saving} onClick={() => post(false)}>
                                Провести
                            </Button>
                            <Tooltip title={dirty ? 'Есть несохранённые правки' : undefined}>
                                <Button
                                    icon={<SaveOutlined />}
                                    loading={saving}
                                    onClick={save}
                                    type={dirty ? 'default' : 'text'}
                                >
                                    Записать
                                </Button>
                            </Tooltip>
                        </>
                    )}
                    {/* Как флажок «Подпись и печать» в 1С: обычная печать —
                        чистый бланк, вариант из меню — со своей печатью. */}
                    <Dropdown.Button
                        icon={<DownOutlined />}
                        onClick={() => openAccountingDocumentPdf(document.id)}
                        menu={{
                            items: [{
                                key: 'stamp',
                                label: 'С подписью и печатью',
                                disabled: !outgoing,
                                onClick: () => openAccountingDocumentPdf(document.id, true),
                            }],
                        }}
                    >
                        <PrinterOutlined /> Печать
                    </Dropdown.Button>
                    <Dropdown
                        trigger={['click']}
                        menu={{
                            items: [
                                // «Ввод на основании» из 1С: акт закрывает то,
                                // что выставлено счётом. У акта основания нет —
                                // он сам конец цепочки.
                                ...(type === 'PAYMENT_INVOICE' ? [
                                    {
                                        key: 'act',
                                        icon: <FileTextOutlined />,
                                        label: 'Создать акт на основании',
                                        disabled: !canChange || document.status !== 'POSTED',
                                        onClick: createServiceAct,
                                    },
                                    { type: 'divider' as const },
                                ] : []),
                                {
                                    key: 'send',
                                    icon: <SendOutlined />,
                                    label: delivery?.recipient
                                        ? `Отправить: ${delivery.recipient.name}`
                                        : 'Отправить контрагенту на платформе',
                                    disabled: !canChange || !delivery?.available,
                                    onClick: sendToCounterparty,
                                },
                                {
                                    key: 'link',
                                    icon: <LinkOutlined />,
                                    label: 'Скопировать ссылку для контрагента',
                                    disabled: document.status !== 'POSTED' || Boolean(document.shareRevokedAt),
                                    onClick: copyShareLink,
                                },
                                {
                                    key: 'revoke',
                                    label: 'Отозвать ссылку',
                                    disabled: !canChange || Boolean(document.shareRevokedAt),
                                    onClick: async () => {
                                        await revokeAccountingDocumentShare(document.id);
                                        toast.success('Ссылка отозвана');
                                        load();
                                    },
                                },
                                { type: 'divider' as const },
                                {
                                    key: 'cancel',
                                    label: kind.cancelLabel,
                                    danger: true,
                                    disabled: !canChange || document.status !== 'POSTED',
                                    onClick: cancel,
                                },
                                {
                                    key: 'delete',
                                    label: 'Удалить черновик',
                                    danger: true,
                                    disabled: !editable,
                                    onClick: removeDraft,
                                },
                            ],
                        }}
                    >
                        <Button icon={<MoreOutlined />} />
                    </Dropdown>
                </Space>
            </div>

            {document.status === 'CANCELLED' && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={kind.cancelledTitle}
                    description={document.cancellationReason || undefined}
                />
            )}

            {/* Судьба отправленного документа. Без неё «Отправить» было
                действием в пустоту: контрагент отклонял счёт с причиной, а
                тот, кто его выставил, узнавал об этом по телефону. */}
            {delivery?.sent && (
                <Alert
                    showIcon
                    style={{ marginBottom: 16 }}
                    type={delivery.sent.status === 'REJECTED'
                        ? 'error'
                        : delivery.sent.status === 'ACCEPTED' ? 'success' : 'info'}
                    message={
                        delivery.sent.status === 'REJECTED'
                            ? `Контрагент отклонил документ${delivery.sent.to ? `: ${delivery.sent.to.name}` : ''}`
                            : delivery.sent.status === 'ACCEPTED'
                                ? `Контрагент принял документ${delivery.sent.to ? `: ${delivery.sent.to.name}` : ''}`
                                : `Отправлен контрагенту${delivery.sent.to ? `: ${delivery.sent.to.name}` : ''} — ждём решения`
                    }
                    description={[
                        delivery.sent.reason,
                        `Отправлен ${dayjs(delivery.sent.at).format('DD.MM.YYYY HH:mm')}`,
                        delivery.sent.reviewedAt
                            ? `решение ${dayjs(delivery.sent.reviewedAt).format('DD.MM.YYYY HH:mm')}`
                            : null,
                    ].filter(Boolean).join(' · ')}
                />
            )}

            {/* ===== Шапка документа ===== */}
            <div className="lc-card" style={{ padding: 20, marginBottom: 14 }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                        gap: '4px 32px',
                    }}
                >
                    {headerField('Дата', editable ? (
                        <DatePicker
                            size="small"
                            format="DD.MM.YYYY"
                            allowClear={false}
                            style={{ width: 150 }}
                            value={documentDate}
                            onChange={(value) => { setDocumentDate(value); touch(); }}
                        />
                    ) : dayjs(document.documentDate).format('DD.MM.YYYY'))}

                    {kind.showDueDate && headerField('Срок оплаты', editable ? (
                        <DatePicker
                            size="small"
                            format="DD.MM.YYYY"
                            placeholder="Не указан"
                            style={{ width: 150 }}
                            value={dueDate}
                            onChange={(value) => { setDueDate(value); touch(); }}
                        />
                    ) : (document.dueDate ? dayjs(document.dueDate).format('DD.MM.YYYY') : '—'))}

                    {/* Номер контрагента. Показывается у входящего документа:
                        свой номер мы присваиваем сами, а этот — чужой, и без
                        него бухгалтер не сведёт наш счёт со счётом перевозчика. */}
                    {document.direction === 'INCOMING' && headerField(
                        'Номер у контрагента',
                        editable ? (
                            <Input
                                size="small"
                                style={{ width: 200 }}
                                maxLength={100}
                                placeholder="Как в его счёте"
                                value={externalNumber}
                                onChange={(e) => { setExternalNumber(e.target.value); touch(); }}
                            />
                        ) : (document.externalNumber || '—'),
                    )}

                    {document.direction === 'INCOMING' && headerField(
                        'Дата у контрагента',
                        editable ? (
                            <DatePicker
                                size="small"
                                format="DD.MM.YYYY"
                                placeholder="Не указана"
                                style={{ width: 150 }}
                                value={externalDate}
                                onChange={(value) => { setExternalDate(value); touch(); }}
                            />
                        ) : (document.externalDate ? dayjs(document.externalDate).format('DD.MM.YYYY') : '—'),
                    )}

                    {headerField('Организация', partyLine(own))}
                    {headerField('Контрагент', partyLine(other))}

                    {kind.showBankAccount && headerField('Банковский счёт', editable ? (
                        <Select
                            size="small"
                            style={{ width: '100%', maxWidth: 320 }}
                            placeholder="Счёт по умолчанию"
                            value={bankAccountId}
                            onChange={(value) => { setBankAccountId(value ?? null); touch(); }}
                            options={bankAccounts.map((account) => ({
                                value: account.id,
                                label: [account.name, account.iban].filter(Boolean).join(' · '),
                                disabled: !account.isActive,
                            }))}
                            notFoundContent="Банковские счета не заведены"
                        />
                    ) : (
                        <div>
                            <div>{own.bankName || '—'}</div>
                            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
                                {[own.bankAccount, own.bankBic && `БИК ${own.bankBic}`, own.kbe && `Кбе ${own.kbe}`]
                                    .filter(Boolean).join(' · ') || 'Реквизиты не заполнены'}
                            </div>
                        </div>
                    ))}

                    {kind.showPayment && headerField('Оплачено', (
                        <span>
                            {money(document.amountPaid, document.currency)}
                            {document.balanceDue > 0 && (
                                <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
                                    {' '}· остаток {money(document.balanceDue, document.currency)}
                                </span>
                            )}
                        </span>
                    ))}
                </div>

                {kind.showBankAccount && editable && !bankAccounts.length && (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginTop: 12 }}
                        message="Банковские реквизиты не заполнены"
                        description={
                            <span>
                                В печатной форме будут реквизиты из карточки организации.
                                Заполните их в разделе{' '}
                                <a onClick={() => router.push('/company/accounting/settings?tab=accounts')}>
                                    Финансы → Настройки → Счета и кассы
                                </a>.
                            </span>
                        }
                    />
                )}
            </div>

            {/* ===== Табличная часть ===== */}
            <div className="lc-card" style={{ padding: 20 }}>
                <Table
                    columns={lineColumns}
                    dataSource={lines}
                    rowKey="key"
                    size="small"
                    pagination={false}
                    scroll={{ x: 900 }}
                />

                {editable && (
                    <Space size={4} style={{ marginTop: 8 }}>
                        <Button
                            type="link"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={openPicker}
                            style={{ paddingLeft: 0 }}
                        >
                            Добавить заявки
                        </Button>
                        <Button
                            type="link"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={addLine}
                        >
                            Добавить услугу
                        </Button>
                    </Space>
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
                        {editable ? (
                            <Input.TextArea
                                rows={2}
                                maxLength={4000}
                                placeholder="Виден только вашей компании"
                                value={note}
                                onChange={(e) => { setNote(e.target.value); touch(); }}
                            />
                        ) : (
                            <div style={{ fontSize: 13 }}>
                                {document.note || <span style={{ color: token.colorTextDisabled }}>—</span>}
                            </div>
                        )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                            В том числе НДС: {money(dirty ? totals.vat : document.vatTotal, document.currency)}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                            Всего: {money(dirty ? totals.total : document.total, document.currency)}
                        </div>
                        {/* Валютный счёт: курс виден прямо здесь. Он
                            зафиксирован в документе и больше не изменится —
                            завтрашний курс этот счёт не трогает. */}
                        {document.currency !== 'KZT' && document.exchangeRate ? (
                            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>
                                {document.totalBase
                                    ? `${money(document.totalBase)} по курсу ${Number(document.exchangeRate).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₸ за 1 ${document.currency}`
                                    : `Курс ${document.currency} не найден — счёт нельзя провести`}
                            </div>
                        ) : null}
                        {dirty && (
                            <div style={{ fontSize: 11, color: token.colorWarning, marginTop: 2 }}>
                                Предварительный расчёт — нажмите «Записать»
                            </div>
                        )}
                    </div>
                </div>

                {/* Чем закрыт счёт. Здесь же курсовая разница: счёт выставили
                    по одному курсу, деньги пришли по другому, и расхождение в
                    тенге обязано быть названо. Без этой строки бухгалтер видит
                    «оплачено полностью», а в банке лежит другая сумма. */}
                {(document.paymentAllocations?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary, marginBottom: 8 }}>
                            Оплаты по счёту
                        </div>
                        {document.paymentAllocations!.map((allocation) => {
                            const diff = allocation.exchangeDiff ?? 0;
                            // По нашему счёту лишние тенге — доход, по счёту
                            // поставщика те же лишние тенге — расход.
                            const gain = document.direction === 'OUTGOING' ? diff > 0 : diff < 0;
                            return (
                                <div
                                    key={allocation.id}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', gap: 16,
                                        fontSize: 12.5, padding: '5px 0',
                                        borderBottom: `1px dashed ${token.colorBorderSecondary}`,
                                    }}
                                >
                                    <span>
                                        {dayjs(allocation.payment.date).format('DD.MM.YYYY')}
                                        {allocation.payment.currency !== document.currency && (
                                            <span style={{ color: token.colorTextTertiary }}>
                                                {' '}· пришло {money(allocation.payment.amount, allocation.payment.currency)}
                                            </span>
                                        )}
                                        {allocation.payment.note && (
                                            <span style={{ color: token.colorTextTertiary }}> · {allocation.payment.note}</span>
                                        )}
                                    </span>
                                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                            {money(allocation.amount, document.currency)}
                                        </span>
                                        {allocation.amountBase != null && document.currency !== 'KZT' && (
                                            <span style={{ color: token.colorTextTertiary }}>
                                                {' '}({money(allocation.amountBase)})
                                            </span>
                                        )}
                                        {diff !== 0 && (
                                            <div style={{ fontSize: 11, color: gain ? token.colorSuccess : token.colorError }}>
                                                Курсовая разница: {diff > 0 ? '+' : '−'}{money(Math.abs(diff))}
                                                {' '}— {gain ? 'доход' : 'расход'}
                                            </div>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                        {(() => {
                            const total = document.paymentAllocations!.reduce((sum, a) => sum + (a.exchangeDiff ?? 0), 0);
                            if (total === 0) return null;
                            const gain = document.direction === 'OUTGOING' ? total > 0 : total < 0;
                            return (
                                <div style={{ fontSize: 12, marginTop: 8, color: gain ? token.colorSuccess : token.colorError }}>
                                    Итого курсовая разница: {total > 0 ? '+' : '−'}{money(Math.abs(total))}
                                    {' '}— {gain ? 'доход' : 'расход'} по этому счёту
                                </div>
                            );
                        })()}
                    </div>
                )}

                <div
                    style={{
                        marginTop: 16,
                        paddingTop: 12,
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                        fontSize: 11,
                        color: token.colorTextTertiary,
                        display: 'flex',
                        gap: 20,
                        flexWrap: 'wrap',
                    }}
                >
                    {document.createdBy && (
                        <span>Создал: {document.createdBy.firstName} {document.createdBy.lastName}</span>
                    )}
                    {document.postedBy && document.postedAt && (
                        <span>
                            Провёл: {document.postedBy.firstName} {document.postedBy.lastName},{' '}
                            {dayjs(document.postedAt).format('DD.MM.YYYY HH:mm')}
                        </span>
                    )}
                    {document.cancelledBy && document.cancelledAt && (
                        <span>
                            Отменил: {document.cancelledBy.firstName} {document.cancelledBy.lastName},{' '}
                            {dayjs(document.cancelledAt).format('DD.MM.YYYY HH:mm')}
                        </span>
                    )}
                </div>
            </div>

            <Modal
                title="Добавить заявки"
                open={pickerOpen}
                onCancel={() => setPickerOpen(false)}
                onOk={applyPicked}
                okText={`Добавить в документ (${pickedIds.length})`}
                cancelText="Отмена"
                width={980}
                destroyOnClose
            >
                {kind.showDueDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
                        <Switch size="small" checked={includeInProgress} onChange={setIncludeInProgress} />
                        <span style={{ fontSize: 13 }}>Показать рейсы в работе — счёт на аванс</span>
                    </div>
                )}

                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="Показаны рейсы этого контрагента, на которые счёт ещё не выставлен."
                    description="Строки соберутся так же, как при создании документа. После добавления нажмите «Записать»."
                />

                {pickerLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
                ) : (
                    <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        scroll={{ y: 420 }}
                        dataSource={pickerOrders}
                        rowSelection={{
                            selectedRowKeys: pickedIds,
                            onChange: (keys) => setPickedIds(keys as string[]),
                        }}
                        locale={{ emptyText: 'Нет рейсов без документа у этого контрагента' }}
                        columns={[
                            {
                                title: 'Заявка',
                                dataIndex: 'orderNumber',
                                width: 140,
                                render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
                            },
                            {
                                title: 'Рейс',
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
