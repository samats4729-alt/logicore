'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Typography, Table, Tag, Empty, Button, Modal, Form, Input, DatePicker, Tooltip, Alert, Checkbox, Select } from 'antd';
import {
    CheckCircleFilled,
    ClockCircleFilled,
    ExclamationCircleOutlined,
    FileTextOutlined,
    MinusCircleFilled,
    PaperClipOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import Loader from '@/components/ui/Loader';

const { Title, Text } = Typography;

import { ORDER_STATUS_LABELS } from '@/lib/vocabulary';
import { toast } from 'sonner';
import { ORDER_STATUS_COLORS as statusColors } from '@/lib/order-status';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Подписи статусов — из общего словаря: контрагент по ссылке должен
// видеть ровно те же слова, что и мы внутри платформы.
const statusLabels = ORDER_STATUS_LABELS;

const C = {
    bg: '#f4f5f7',
    card: '#ffffff',
    border: '#e7e8ec',
    text: '#0b0d12',
    textSec: '#5f6672',
    textTer: '#8a91a0',
    blue: '#1677ff',
    green: '#16a34a',
    red: '#dc2626',
    amber: '#d97706',
};

const fmt = (n: number) => Math.round(n || 0).toLocaleString('ru-RU');
const money = (n: number) => `${fmt(n)} ₸`;

function cityFrom(loc: any): string {
    if (!loc) return '—';
    if (loc.city) return loc.city;
    if (loc.address) {
        const m = loc.address.match(/г\.\s*([^,]+)/);
        if (m?.[1]) return m[1].trim();
        return loc.address;
    }
    return '—';
}

function getRoute(order: any): string {
    const pts = order.routePoints || [];
    const pickup = pts.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
    // Конечная точка маршрута — ПОСЛЕДНЯЯ выгрузка, а не первая
    const deliveries = pts.filter((p: any) => p.pointType === 'DELIVERY');
    const delivery = deliveries.length ? deliveries[deliveries.length - 1] : null;
    return `${cityFrom(pickup?.location)} → ${cityFrom(delivery?.location)}`;
}

/** Состояние оплаты рейса одной подписью и цветом. */
const PAYMENT_VIEW: Record<string, { label: string; color: string; icon: any }> = {
    PAID: { label: 'Оплачено', color: C.green, icon: <CheckCircleFilled /> },
    PARTIAL: { label: 'Частично', color: C.amber, icon: <ClockCircleFilled /> },
    UNPAID: { label: 'Не оплачено', color: C.textTer, icon: <MinusCircleFilled /> },
};

/** Что контрагент может приложить к расчётам. */
const DOCUMENT_KINDS = [
    { value: 'TTN', label: 'Накладная' },
    { value: 'INVOICE', label: 'Счёт' },
    { value: 'ACT', label: 'Акт' },
    { value: 'OTHER', label: 'Прочее' },
];

const DOC_STATUS: Record<string, { label: string; color: string }> = {
    DRAFT: { label: 'Черновик', color: 'default' },
    POSTED: { label: 'Выставлен', color: 'blue' },
    PARTIALLY_PAID: { label: 'Оплачен частично', color: 'gold' },
    PAID: { label: 'Оплачен', color: 'green' },
    CANCELLED: { label: 'Отменён', color: 'red' },
};

/** Состояние присланного чека. */
const PROOF_VIEW: Record<string, { label: string; color: string }> = {
    PENDING: { label: 'На проверке', color: 'gold' },
    ACCEPTED: { label: 'Принят', color: 'green' },
    REJECTED: { label: 'Отклонён', color: 'red' },
};

/**
 * Подпись статуса счёта глазами читателя страницы.
 *
 * «Черновик» — наше внутреннее слово. Для контрагента его собственный
 * отправленный счёт находится на проверке у бухгалтерии, и подписать его
 * надо именно так, иначе он решит, что счёт не ушёл.
 */
function docStatusView(status: string, issuedByReader: boolean) {
    if (status === 'DRAFT' && issuedByReader) {
        return { label: 'На проверке', color: 'gold' };
    }
    return DOC_STATUS[status] || { label: status, color: 'default' };
}

/**
 * Узкий экран. Контрагенты открывают ссылку с телефона, а таблица со
 * сделками туда не помещается: сумма и оплата уезжают за горизонтальную
 * прокрутку, то есть ровно то, ради чего отчёт и открывали.
 */
function useIsNarrow() {
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(max-width: 767px)');
        const apply = () => setNarrow(query.matches);
        apply();
        query.addEventListener('change', apply);
        return () => query.removeEventListener('change', apply);
    }, []);
    return narrow;
}

/** Карточка-показатель в шапке отчёта. */
function StatCard({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
    return (
        <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 20,
            padding: '18px 20px', flex: '1 1 220px', minWidth: 0,
        }}>
            <div style={{ fontSize: 12, color: C.textSec, fontWeight: 600, letterSpacing: '0.01em' }}>{label}</div>
            <div style={{
                fontSize: 26, fontWeight: 700, color: color || C.text, marginTop: 6,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1.15,
                overflowWrap: 'anywhere',
            }}>
                {value}
            </div>
            {hint && <div style={{ fontSize: 12, color: C.textTer, marginTop: 6 }}>{hint}</div>}
        </div>
    );
}

export default function SharedReportPage() {
    const params = useParams();
    const token = params.token as string;
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [submittingInvoice, setSubmittingInvoice] = useState(false);
    const [form] = Form.useForm();
    const isNarrow = useIsNarrow();

    /** Суммы, которые контрагент назвал сам: ключ — рейс, значение — строка. */
    const [ownAmounts, setOwnAmounts] = useState<Record<string, string>>({});
    /** Файлы, приложенные к счёту до отправки. */
    const [invoiceFiles, setInvoiceFiles] = useState<{ file: File; type: string }[]>([]);
    const [withdrawing, setWithdrawing] = useState<string | null>(null);

    /** К каким сделкам прикладываем документ прямо сейчас. */
    const [docOrders, setDocOrders] = useState<any[] | null>(null);
    const [docFile, setDocFile] = useState<File | null>(null);
    const [docType, setDocType] = useState('TTN');
    const [uploadingDoc, setUploadingDoc] = useState(false);

    const [receiptOrder, setReceiptOrder] = useState<any>(null);
    const [submittingReceipt, setSubmittingReceipt] = useState(false);
    const [receiptForm] = Form.useForm();

    const [proofOrder, setProofOrder] = useState<any>(null);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [submittingProof, setSubmittingProof] = useState(false);
    const [proofForm] = Form.useForm();

    const loadReport = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/public/accounting/report/${token}`);
            setData(res.data);
            setError('');
        } catch (err: any) {
            if (err.response?.status === 404) {
                setError('Ссылка недействительна или срок её действия истёк. Запросите новую у отправителя.');
            } else {
                setError('Не удалось загрузить отчёт. Попробуйте обновить страницу.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            loadReport();
        }
    }, [token]);

    const orders = data?.counterparty?.orders ?? [];
    // «weOwe» — со стороны отправителя ссылки. Для читателя страницы это
    // его собственная выручка, и только по этим рейсам он вправе выставить
    // счёт: документы в свою пользу от чужого имени не выпускают.
    const billableOrders = useMemo(() => orders.filter((o: any) => o.direction === 'weOwe'), [orders]);
    const receivableOrders = useMemo(() => orders.filter((o: any) => o.direction === 'theyOwe'), [orders]);

    /** Сумма по рейсу: названная контрагентом, иначе наша. */
    const amountOf = (order: any) => {
        const own = (ownAmounts[order.id] || '').replace(/[\s ]/g, '').replace(',', '.');
        if (own && /^\d+(\.\d{1,2})?$/.test(own)) return Number(own);
        return order.amount || 0;
    };

    const selectedTotal = useMemo(
        () => billableOrders
            .filter((o: any) => selectedRowKeys.includes(o.id))
            .reduce((sum: number, o: any) => sum + amountOf(o), 0),
        [billableOrders, selectedRowKeys, ownAmounts],
    );

    /** По каким рейсам названная сумма расходится с нашей. */
    const disagreements = useMemo(
        () => billableOrders
            .filter((o: any) => selectedRowKeys.includes(o.id))
            .filter((o: any) => Math.round(amountOf(o)) !== Math.round(o.amount || 0)),
        [billableOrders, selectedRowKeys, ownAmounts],
    );

    const handleSubmitInvoice = async (values: any) => {
        try {
            setSubmittingInvoice(true);
            // Свои суммы уходят только по отмеченным рейсам и только там,
            // где их действительно вписали: пустое поле означает согласие
            // с нашей цифрой, а не ноль.
            const amounts = selectedRowKeys
                .filter((id) => (ownAmounts[id] || '').trim())
                .map((id) => ({ orderId: id, amount: ownAmounts[id].trim() }));

            const res = await axios.post(`${API_URL}/public/accounting-documents/from-shared-report/${token}`, {
                orderIds: selectedRowKeys,
                amounts: amounts.length ? amounts : undefined,
                externalNumber: values.externalNumber || undefined,
                externalDate: values.externalDate ? values.externalDate.format('YYYY-MM-DD') : undefined,
                dueDate: values.dueDate ? values.dueDate.format('YYYY-MM-DD') : undefined,
                note: values.note || undefined,
            });

            // Файлы отправляются после счёта: если счёт не прошёл, грузить
            // документы некуда, а показывать «часть отправилась» — худший
            // из возможных ответов.
            for (const attachment of invoiceFiles) {
                const payload = new FormData();
                payload.append('file', attachment.file);
                payload.append('type', attachment.type);
                payload.append('orderIds', selectedRowKeys.join(','));
                try {
                    await axios.post(`${API_URL}/public/shared-report/${token}/documents`, payload);
                } catch {
                    toast.warning(`Не удалось приложить «${attachment.file.name}» — пришлите его отдельно`);
                }
            }

            toast.success(`Счёт ${res.data.number} отправлен на проверку`);
            setModalOpen(false);
            form.resetFields();
            setSelectedRowKeys([]);
            setOwnAmounts({});
            setInvoiceFiles([]);
            await loadReport();
        } catch (e: any) {
            const detail = e.response?.data?.message;
            toast.error(Array.isArray(detail) ? detail[0] : detail || 'Не удалось выставить счёт');
        } finally {
            setSubmittingInvoice(false);
        }
    };

    /**
     * Отозвать свой счёт, пока бухгалтерия его не тронула.
     *
     * Без этого человек, ошибившийся суммой или отметивший не те рейсы,
     * оказывался заперт: рейсы из счёта больше не выбирались, а отменить
     * документ он не мог — оставалось звонить отправителю отчёта.
     */
    const withdrawInvoice = async (order: any) => {
        setWithdrawing(order.id);
        try {
            await axios.post(
                `${API_URL}/public/accounting-documents/from-shared-report/${token}/${order.invoice.id}/withdraw`,
            );
            toast.success(`Счёт ${order.invoice.number} отозван — рейсы снова можно отметить`);
            await loadReport();
        } catch (e: any) {
            const detail = e.response?.data?.message;
            toast.error(Array.isArray(detail) ? detail[0] : detail || 'Не удалось отозвать счёт');
        } finally {
            setWithdrawing(null);
        }
    };

    /**
     * Приложить документ к сделкам.
     *
     * Файл ложится в документы каждой указанной заявки — туда же, куда его
     * положил бы сотрудник отправителя. Раньше накладную и свой счёт
     * приходилось слать почтой или в мессенджере, то есть мимо платформы,
     * и в споре об оплате предъявить было нечего.
     */
    const uploadDocuments = async () => {
        if (!docFile || !docOrders?.length) {
            toast.error('Выберите файл');
            return;
        }
        setUploadingDoc(true);
        try {
            const payload = new FormData();
            payload.append('file', docFile);
            payload.append('type', docType);
            payload.append('orderIds', docOrders.map((o) => o.id).join(','));
            const res = await axios.post(`${API_URL}/public/shared-report/${token}/documents`, payload);
            toast.success(res.data?.message || 'Документ приложен');
            setDocOrders(null);
            setDocFile(null);
            await loadReport();
        } catch (e: any) {
            const detail = e.response?.data?.message;
            toast.error(Array.isArray(detail) ? detail[0] : detail || 'Не удалось приложить документ');
        } finally {
            setUploadingDoc(false);
        }
    };

    /** Сколько к вам на самом деле пришло — заявление получателя денег. */
    const handleSubmitReceipt = async (values: any) => {
        try {
            setSubmittingReceipt(true);
            const payload = new FormData();
            payload.append('orderId', receiptOrder.id);
            payload.append('kind', 'RECEIPT');
            payload.append('claimedAmount', String(values.claimedAmount ?? ''));
            if (values.claimedDate) payload.append('claimedDate', values.claimedDate.format('YYYY-MM-DD'));
            if (values.note) payload.append('note', values.note);

            await axios.post(`${API_URL}/public/payment-proofs/${token}`, payload);
            toast.success('Замечание отправлено бухгалтерии');
            setReceiptOrder(null);
            receiptForm.resetFields();
            await loadReport();
        } catch (e: any) {
            const detail = e.response?.data?.message;
            toast.error(Array.isArray(detail) ? detail[0] : detail || 'Не удалось отправить замечание');
        } finally {
            setSubmittingReceipt(false);
        }
    };

    const openProofModal = (order: any) => {
        setProofOrder(order);
        setProofFile(null);
        proofForm.setFieldsValue({
            claimedAmount: order.remaining ? String(Math.round(order.remaining)) : undefined,
            claimedDate: dayjs(),
        });
    };

    const handleSubmitProof = async (values: any) => {
        if (!proofFile) {
            toast.error('Приложите файл чека');
            return;
        }
        try {
            setSubmittingProof(true);
            const payload = new FormData();
            payload.append('file', proofFile);
            payload.append('orderId', proofOrder.id);
            if (values.claimedAmount) payload.append('claimedAmount', String(values.claimedAmount));
            if (values.claimedDate) payload.append('claimedDate', values.claimedDate.format('YYYY-MM-DD'));
            if (values.note) payload.append('note', values.note);

            await axios.post(`${API_URL}/public/payment-proofs/${token}`, payload);
            toast.success('Чек отправлен на проверку');
            setProofOrder(null);
            setProofFile(null);
            proofForm.resetFields();
            await loadReport();
        } catch (e: any) {
            const detail = e.response?.data?.message;
            toast.error(Array.isArray(detail) ? detail[0] : detail || 'Не удалось отправить чек');
        } finally {
            setSubmittingProof(false);
        }
    };

    /** Состояние присланных по рейсу чеков — одной строкой. */
    const proofSummary = (row: any) => {
        const proofs = row.paymentProofs ?? [];
        if (!proofs.length) return null;
        const latest = proofs[0];
        const view = PROOF_VIEW[latest.status] || PROOF_VIEW.PENDING;
        return { latest, view, count: proofs.length };
    };

    /**
     * Почему по рейсу нельзя выставить счёт.
     *
     * Пустая строка означает «можно». Молчаливо серая галочка — худший
     * вариант из возможных: человек считает, что сломалась страница, и
     * идёт звонить, вместо того чтобы прочитать одну строку.
     */
    const blockedReason = (row: any): string => {
        if (row.invoice) {
            const view = docStatusView(row.invoice.status, true);
            return `Счёт ${row.invoice.number} уже выставлен — ${view.label.toLowerCase()}`;
        }
        if (row.paymentState === 'PAID') return 'Рейс оплачен полностью — выставлять нечего';
        return '';
    };

    /** Счёт по рейсу ещё черновик — значит, его можно отозвать. */
    const canWithdraw = (row: any) => Boolean(row.invoice) && row.invoice.status === 'DRAFT';

    const orderColumns = (opts: { owedToReader: boolean }) => [
        {
            title: 'Заявка',
            key: 'order',
            width: 140,
            sorter: (a: any, b: any) => String(a.orderNumber).localeCompare(String(b.orderNumber)),
            render: (_: any, r: any) => (
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: C.text }}>{r.orderNumber}</div>
                    <div style={{ fontSize: 12, color: C.textTer }}>
                        {dayjs(r.completedAt || r.createdAt).format('DD.MM.YYYY')}
                    </div>
                </div>
            ),
        },
        {
            title: 'Маршрут и груз',
            key: 'route',
            width: 260,
            render: (_: any, r: any) => (
                <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getRoute(r)}
                    </div>
                    <div style={{
                        fontSize: 12, color: C.textTer,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {r.cargoDescription || '—'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Статус рейса',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            render: (s: string) => (
                <Tag color={statusColors[s] || 'default'} style={{ borderRadius: 6, fontWeight: 500, margin: 0 }}>
                    {statusLabels[s] || s}
                </Tag>
            ),
        },
        {
            title: 'Сумма',
            dataIndex: 'amount',
            key: 'amount',
            width: opts.owedToReader ? 170 : 130,
            align: 'right' as const,
            sorter: (a: any, b: any) => (a.amount || 0) - (b.amount || 0),
            render: (v: number, r: any) => {
                // По своим рейсам сумму можно назвать самому: у нас записана
                // цена из заявки, а в жизни бывает простой, догруз и
                // перевес. Наша цифра при этом не меняется — расхождение
                // увидит бухгалтер и решит сам.
                if (opts.owedToReader && !blockedReason(r)) {
                    const own = ownAmounts[r.id] ?? '';
                    const changed = own.trim() && Math.round(amountOf(r)) !== Math.round(v || 0);
                    return (
                        <div>
                            <Input
                                size="small"
                                inputMode="decimal"
                                maxLength={15}
                                value={own || (v ? String(Math.round(v)) : '')}
                                suffix="₸"
                                style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                                onChange={(e) => setOwnAmounts({ ...ownAmounts, [r.id]: e.target.value })}
                            />
                            {changed ? (
                                <div style={{ fontSize: 11, color: C.amber, marginTop: 3 }}>
                                    у нас {money(v)}
                                </div>
                            ) : (
                                <div style={{ fontSize: 11, color: C.textTer, marginTop: 3 }}>
                                    можно исправить
                                </div>
                            )}
                        </div>
                    );
                }
                return (
                    <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                        {v ? money(v) : '—'}
                    </span>
                );
            },
        },
        {
            title: 'Счёт',
            key: 'invoice',
            width: 170,
            render: (_: any, r: any) => {
                if (!r.invoice) {
                    return (
                        <span style={{ color: C.textTer, fontSize: 13 }}>
                            {opts.owedToReader
                                ? (r.paymentState === 'PAID' ? 'Рейс оплачен' : 'Не выставлен')
                                : '—'}
                        </span>
                    );
                }
                const view = docStatusView(r.invoice.status, opts.owedToReader);
                return (
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{r.invoice.number}</div>
                        <Tag color={view.color} style={{ borderRadius: 6, marginTop: 2, fontSize: 11, lineHeight: '18px' }}>
                            {view.label}
                        </Tag>
                        {/* Пока счёт не приняли в работу, ошибку можно
                            исправить самому — не звонком, а кнопкой. */}
                        {opts.owedToReader && canWithdraw(r) && (
                            <Button
                                type="link"
                                size="small"
                                loading={withdrawing === r.id}
                                style={{ padding: 0, height: 'auto', fontSize: 12, display: 'block' }}
                                onClick={() => withdrawInvoice(r)}
                            >
                                Отозвать счёт
                            </Button>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Оплата',
            key: 'payment',
            width: 160,
            render: (_: any, r: any) => {
                const view = PAYMENT_VIEW[r.paymentState] || PAYMENT_VIEW.UNPAID;
                return (
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: view.color, fontWeight: 500 }}>
                            {view.icon}
                            <span>{view.label}</span>
                        </div>
                        {r.paymentState === 'PARTIAL' && (
                            <div style={{ fontSize: 12, color: C.textTer, fontVariantNumeric: 'tabular-nums' }}>
                                {money(r.paidAmount)} из {money(r.amount)}
                            </div>
                        )}
                        {r.paymentState === 'UNPAID' && r.isOverdue && (
                            <div style={{ fontSize: 12, color: C.red }}>Просрочен</div>
                        )}
                        {/* Деньги идут читателю: только он знает, сколько
                            дошло. Раньше сказать об этом было негде. */}
                        {opts.owedToReader && r.paymentState !== 'UNPAID' && (
                            <Button
                                type="link"
                                size="small"
                                style={{ padding: 0, height: 'auto', fontSize: 12 }}
                                onClick={() => {
                                    setReceiptOrder(r);
                                    receiptForm.setFieldsValue({
                                        claimedAmount: r.paidAmount ? String(Math.round(r.paidAmount)) : undefined,
                                        claimedDate: dayjs(),
                                    });
                                }}
                            >
                                Пришло не столько?
                            </Button>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Документы',
            key: 'files',
            width: 150,
            render: (_: any, r: any) => (
                <Button
                    size="small"
                    icon={<PaperClipOutlined />}
                    style={{ borderRadius: 8 }}
                    onClick={() => setDocOrders([r])}
                >
                    Приложить
                </Button>
            ),
        },
        // Чек прикладывают там, где платит читатель страницы.
        ...(opts.owedToReader ? [] : [{
            title: 'Чек об оплате',
            key: 'proof',
            width: 190,
            render: (_: any, r: any) => {
                const summary = proofSummary(r);
                if (!summary) {
                    return (
                        <Button
                            size="small"
                            icon={<PaperClipOutlined />}
                            style={{ borderRadius: 8 }}
                            onClick={() => openProofModal(r)}
                        >
                            Приложить
                        </Button>
                    );
                }
                return (
                    <div style={{ minWidth: 0 }}>
                        <Tag color={summary.view.color} style={{ borderRadius: 6, margin: 0 }}>
                            {summary.view.label}
                        </Tag>
                        {summary.latest.status === 'REJECTED' && (
                            <>
                                {summary.latest.rejectionReason && (
                                    <div style={{ fontSize: 11, color: C.textTer, marginTop: 2 }}>
                                        {summary.latest.rejectionReason}
                                    </div>
                                )}
                                <Button
                                    type="link"
                                    size="small"
                                    style={{ padding: 0, height: 'auto', fontSize: 12 }}
                                    onClick={() => openProofModal(r)}
                                >
                                    Прислать другой
                                </Button>
                            </>
                        )}
                    </div>
                );
            },
        }]),
    ];

    /** Тот же рейс, что и строка таблицы, но для телефона. */
    const OrderCard = ({ row, selectable }: { row: any; selectable?: boolean }) => {
        const pay = PAYMENT_VIEW[row.paymentState] || PAYMENT_VIEW.UNPAID;
        const reason = blockedReason(row);
        const disabled = Boolean(reason);
        const checked = selectedRowKeys.includes(row.id);
        const invoiceView = row.invoice ? docStatusView(row.invoice.status, !!selectable) : null;

        return (
            <div style={{
                border: `1px solid ${checked ? C.blue : C.border}`,
                borderRadius: 16, padding: 14, marginBottom: 10,
                background: checked ? '#f5f9ff' : C.card,
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {selectable && (
                        <Tooltip title={reason || undefined}>
                            <Checkbox
                                checked={checked}
                                disabled={disabled}
                                style={{ marginTop: 2 }}
                                onChange={(e) => setSelectedRowKeys(
                                    e.target.checked
                                        ? [...selectedRowKeys, row.id]
                                        : selectedRowKeys.filter((k) => k !== row.id),
                                )}
                            />
                        </Tooltip>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontWeight: 700, color: C.text }}>{row.orderNumber}</span>
                            <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                                {money(row.amount)}
                            </span>
                        </div>
                        <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>{getRoute(row)}</div>
                        <div style={{ fontSize: 12, color: C.textTer }}>
                            {row.cargoDescription || '—'} · {dayjs(row.completedAt || row.createdAt).format('DD.MM.YYYY')}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: pay.color, fontWeight: 500, fontSize: 13 }}>
                                {pay.icon}{pay.label}
                            </span>
                            {row.paymentState === 'PARTIAL' && (
                                <span style={{ fontSize: 12, color: C.textTer, fontVariantNumeric: 'tabular-nums' }}>
                                    {money(row.paidAmount)} из {money(row.amount)}
                                </span>
                            )}
                            {row.paymentState !== 'PAID' && row.isOverdue && (
                                <span style={{ fontSize: 12, color: C.red }}>Просрочен</span>
                            )}
                        </div>

                        {!selectable && (() => {
                            const summary = proofSummary(row);
                            return (
                                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13, color: C.textSec }}>Чек:</span>
                                    {summary ? (
                                        <>
                                            <Tag color={summary.view.color} style={{ borderRadius: 6, margin: 0 }}>
                                                {summary.view.label}
                                            </Tag>
                                            {summary.latest.status === 'REJECTED' && (
                                                <Button
                                                    size="small"
                                                    style={{ borderRadius: 8 }}
                                                    onClick={() => openProofModal(row)}
                                                >
                                                    Прислать другой
                                                </Button>
                                            )}
                                        </>
                                    ) : (
                                        <Button
                                            size="small"
                                            icon={<PaperClipOutlined />}
                                            style={{ borderRadius: 8 }}
                                            onClick={() => openProofModal(row)}
                                        >
                                            Приложить
                                        </Button>
                                    )}
                                </div>
                            );
                        })()}

                        <div style={{ marginTop: 8, fontSize: 13 }}>
                            {invoiceView ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <span style={{ color: C.textSec }}>Счёт</span>
                                    <span style={{ fontWeight: 600, color: C.text }}>{row.invoice.number}</span>
                                    <Tag color={invoiceView.color} style={{ borderRadius: 6, margin: 0, fontSize: 11 }}>
                                        {invoiceView.label}
                                    </Tag>
                                </span>
                            ) : (
                                <span style={{ color: C.textTer }}>
                                    {selectable ? 'Счёт не выставлен' : '—'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    /** Таблица рейсов одной стороны расчётов. */
    const OrdersSection = ({
        title,
        subtitle,
        rows,
        selectable,
        extra,
    }: {
        title: string;
        subtitle: string;
        rows: any[];
        selectable?: boolean;
        extra?: React.ReactNode;
    }) => {
        const columns = orderColumns({ owedToReader: !!selectable });
        const totalAmount = rows.reduce((s: number, o: any) => s + (o.amount || 0), 0);
        const paidAmount = rows.reduce((s: number, o: any) => s + (o.paidAmount || 0), 0);
        const restAmount = rows.reduce((s: number, o: any) => s + (o.remaining ?? 0), 0);

        return (
            <section style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 24,
                padding: 20, marginTop: 20, overflow: 'hidden',
            }}>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: 12, flexWrap: 'wrap', marginBottom: 16,
                }}>
                    <div style={{ minWidth: 0 }}>
                        <Title level={4} style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>
                            {title}
                        </Title>
                        <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>{subtitle}</div>
                    </div>
                    {extra}
                </div>

                {rows.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={(
                            <span style={{ color: C.textTer }}>
                                {selectable
                                    ? 'Здесь появятся рейсы, за которые платит отправитель отчёта. Сейчас таких нет — по всем расчётам платите вы.'
                                    : 'Здесь появятся рейсы, за которые платите вы. Сейчас таких нет.'}
                            </span>
                        )}
                        style={{ margin: '24px 0' }}
                    />
                ) : isNarrow ? (
                    <div>
                        {rows.map((row: any) => (
                            <OrderCard key={row.id} row={row} selectable={selectable} />
                        ))}
                        <div style={{
                            borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4,
                            display: 'flex', justifyContent: 'space-between', gap: 12,
                        }}>
                            <div style={{ fontSize: 13, color: C.textSec }}>
                                <div style={{ fontWeight: 600, color: C.text }}>Итого</div>
                                <div>Оплачено: {money(paidAmount)}</div>
                                <div style={{ color: restAmount > 0 ? C.red : C.green }}>
                                    Остаток: {money(restAmount)}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 700, fontSize: 18, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                                    {money(totalAmount)}
                                </div>
                                <div style={{ fontSize: 12, color: C.textTer }}>
                                    {rows.length === 1 ? '1 сделка' : `${rows.length} сделок`}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <Table
                        rowSelection={selectable ? {
                            selectedRowKeys,
                            onChange: (keys: any[]) => setSelectedRowKeys(keys),
                            getCheckboxProps: (record: any) => ({
                                // Уже выставленный счёт второй раз не выставляют.
                                disabled: Boolean(blockedReason(record)),
                                name: record.orderNumber,
                            }),
                            renderCell: (checked: boolean, record: any, _index: number, node: React.ReactNode) => {
                                const reason = blockedReason(record);
                                // Серая галочка без объяснения читается как
                                // поломка страницы: человек тычет в неё и
                                // идёт звонить. Причина висит прямо на ней.
                                return reason
                                    ? <Tooltip title={reason}><span>{node}</span></Tooltip>
                                    : node;
                            },
                        } : undefined}
                        columns={columns}
                        dataSource={rows}
                        rowKey="id"
                        size="middle"
                        pagination={rows.length > 25
                            ? { pageSize: 25, size: 'small', showSizeChanger: false, showTotal: (t: number) => `Всего: ${t}` }
                            : false}
                        scroll={{ x: 1010 }}
                        summary={() => (
                            <Table.Summary fixed>
                                <Table.Summary.Row style={{ background: '#fafbfc' }}>
                                    {/* Ширина первой ячейки учитывает колонку с
                                        галочками, иначе итог уезжает под чужой
                                        заголовок. */}
                                    <Table.Summary.Cell index={0} colSpan={selectable ? 4 : 3}>
                                        <span style={{ fontWeight: 600, color: C.text }}>Итого</span>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={1} align="right">
                                        <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                                            {money(totalAmount)}
                                        </span>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={2}>
                                        <span style={{ fontSize: 12, color: C.textTer }}>
                                            {rows.length === 1 ? '1 сделка' : `${rows.length} сделок`}
                                        </span>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={3}>
                                        <div style={{ fontSize: 12, color: C.textSec, fontVariantNumeric: 'tabular-nums' }}>
                                            <div>Оплачено: {money(paidAmount)}</div>
                                            <div style={{ color: restAmount > 0 ? C.red : C.green }}>
                                                Остаток: {money(restAmount)}
                                            </div>
                                        </div>
                                    </Table.Summary.Cell>
                                    {/* Хвостовые колонки: «Документы» есть всегда,
                                        «Чек об оплате» — только там, где платит
                                        читатель. Без этих ячеек полоса итога
                                        обрывается посреди таблицы. */}
                                    <Table.Summary.Cell index={4} />
                                    {!selectable && <Table.Summary.Cell index={5} />}
                                </Table.Summary.Row>
                            </Table.Summary>
                        )}
                    />
                )}
            </section>
        );
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                minHeight: '100vh', background: C.bg,
            }}>
                <div style={{ textAlign: 'center' }}>
                    <Loader size="large" />
                    <div style={{ marginTop: 16, color: C.textSec, fontSize: 14 }}>Загружаем отчёт…</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                minHeight: '100vh', background: C.bg, padding: 24,
            }}>
                <div style={{
                    maxWidth: 440, textAlign: 'center', padding: '40px 32px',
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 24,
                }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
                        background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ExclamationCircleOutlined style={{ fontSize: 24, color: C.amber }} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                        Ссылка недействительна
                    </div>
                    <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>{error}</div>
                </div>
            </div>
        );
    }

    const totals = data?.totals;
    const documents = data?.documents ?? [];

    if (!data?.counterparty || !totals) {
        return (
            <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                minHeight: '100vh', background: C.bg, padding: 24,
            }}>
                <div style={{
                    maxWidth: 440, padding: '40px 32px',
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 24,
                }}>
                    <Empty description={<span style={{ color: C.textSec }}>Нет данных по взаиморасчётам</span>} />
                </div>
            </div>
        );
    }

    // Сальдо в отчёте посчитано со стороны отправителя. Читатель — вторая
    // сторона, поэтому знак разворачиваем, иначе «+» будет означать долг.
    const readerBalance = -(totals.balance || 0);
    const daysLeft = data.expiresAt ? dayjs(data.expiresAt).diff(dayjs(), 'day') : null;

    return (
        <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column' }}>
            {/* Галочку должно быть видно.
                Ant рисует её тонкой светлой рамкой, и на белой таблице
                рабочая галочка выглядела ровно как выключенная — человек
                решал, что выбрать нельзя ничего, и шёл звонить. Здесь
                рабочая заметно темнее, а недоступная — явно залита серым. */}
            <style>{`
                .ant-checkbox-inner {
                    border-color: #9aa1ae !important;
                    border-width: 1.5px !important;
                }
                .ant-checkbox-wrapper:hover .ant-checkbox-inner,
                .ant-checkbox:hover .ant-checkbox-inner {
                    border-color: ${C.blue} !important;
                }
                .ant-checkbox-disabled .ant-checkbox-inner {
                    border-color: #e2e4e9 !important;
                    background: #f2f3f5 !important;
                }
            `}</style>
            <header style={{
                background: 'rgba(246, 247, 249, 0.88)', backdropFilter: 'blur(12px)',
                borderBottom: `1px solid ${C.border}`, padding: '14px 20px',
                position: 'sticky', top: 0, zIndex: 10,
            }}>
                <div style={{
                    maxWidth: 1180, margin: '0 auto', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 32, height: 32, background: C.text, borderRadius: 9,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>L</span>
                        </div>
                        <span style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>
                            LogiCore
                        </span>
                    </div>
                    {daysLeft !== null && (
                        <Tooltip title={`Ссылка действует до ${dayjs(data.expiresAt).format('DD.MM.YYYY, HH:mm')}`}>
                            <Tag
                                color={daysLeft <= 1 ? 'orange' : 'default'}
                                style={{ margin: 0, borderRadius: 999, fontWeight: 500 }}
                            >
                                {daysLeft <= 0 ? 'Истекает сегодня' : `Ссылка активна ещё ${daysLeft} дн.`}
                            </Tag>
                        </Tooltip>
                    )}
                </div>
            </header>

            <main style={{ flex: 1, maxWidth: 1180, width: '100%', margin: '0 auto', padding: '28px 20px 64px' }}>
                <div style={{ marginBottom: 20 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, color: C.textSec,
                        fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        <FileTextOutlined /> Акт взаиморасчётов
                    </div>
                    <Title level={2} style={{
                        margin: '8px 0 4px', fontWeight: 700, color: C.text,
                        letterSpacing: '-0.02em', overflowWrap: 'anywhere',
                    }}>
                        {data.senderCompany}
                    </Title>
                    <Text style={{ fontSize: 14, color: C.textSec }}>
                        Отчёт для <Text strong style={{ color: C.text }}>{data.counterpartyName}</Text>
                        {' · на '}{dayjs().format('DD.MM.YYYY')}
                    </Text>
                </div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {/* Стороны названы от лица читателя: он открыл ссылку,
                        чтобы свериться со своим учётом, и «дебиторская» здесь
                        значит его дебиторскую — то, что ему предстоит
                        получить. Слова те же, что в его балансе. */}
                    <StatCard
                        label="Ваша дебиторская задолженность"
                        value={money(totals.unpaidWeOweThem)}
                        hint={totals.weOweThem > 0 ? `Начислено за период: ${money(totals.weOweThem)}` : undefined}
                        color={totals.unpaidWeOweThem > 0 ? C.green : undefined}
                    />
                    <StatCard
                        label="Ваша кредиторская задолженность"
                        value={money(totals.unpaidTheyOweUs)}
                        hint={totals.theyOweUs > 0 ? `Начислено за период: ${money(totals.theyOweUs)}` : undefined}
                        color={totals.unpaidTheyOweUs > 0 ? C.red : undefined}
                    />
                    <StatCard
                        label="Итоговое сальдо"
                        value={`${readerBalance > 0 ? '+' : ''}${money(readerBalance)}`}
                        hint={
                            readerBalance > 0 ? 'В вашу пользу'
                                : readerBalance < 0 ? 'В пользу отправителя'
                                    : 'Расчёты закрыты'
                        }
                        color={readerBalance > 0 ? C.green : readerBalance < 0 ? C.red : undefined}
                    />
                </div>

                <OrdersSection
                    title="Сделки, по которым платят вам"
                    subtitle="Отметьте выполненные рейсы, при необходимости поправьте суммы и выставьте счёт — он сразу попадёт в бухгалтерию отправителя."
                    rows={billableOrders}
                    selectable
                    extra={
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button
                                size="large"
                                icon={<PaperClipOutlined />}
                                disabled={selectedRowKeys.length === 0}
                                style={{ borderRadius: 12 }}
                                onClick={() => setDocOrders(
                                    billableOrders.filter((o: any) => selectedRowKeys.includes(o.id)),
                                )}
                            >
                                Приложить документы
                            </Button>
                            <Tooltip title={selectedRowKeys.length === 0
                                ? 'Сначала отметьте рейсы, за которые просите оплату'
                                : undefined}>
                                <Button
                                    type="primary"
                                    size="large"
                                    disabled={selectedRowKeys.length === 0}
                                    style={{ borderRadius: 12, fontWeight: 600 }}
                                    onClick={() => {
                                        form.setFieldsValue({ externalDate: dayjs() });
                                        setModalOpen(true);
                                    }}
                                >
                                    {selectedRowKeys.length > 0
                                        ? `Выставить счёт на ${money(selectedTotal)}`
                                        : 'Выставить счёт'}
                                </Button>
                            </Tooltip>
                        </div>
                    }
                />

                <OrdersSection
                    title="Сделки, по которым платите вы"
                    subtitle="Счета, выставленные вам отправителем отчёта, и их оплата."
                    rows={receivableOrders}
                />

                {documents.length > 0 && (
                    <section style={{
                        background: C.card, border: `1px solid ${C.border}`, borderRadius: 24,
                        padding: 20, marginTop: 20,
                    }}>
                        <Title level={4} style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: C.text }}>
                            Счета по этим расчётам
                        </Title>
                        {isNarrow ? (
                            <div>
                                {documents.map((doc: any) => {
                                    const view = docStatusView(doc.status, !doc.issuedByUs);
                                    return (
                                        <div key={doc.id} style={{
                                            border: `1px solid ${C.border}`, borderRadius: 16,
                                            padding: 14, marginBottom: 10,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                                <span style={{ fontWeight: 700, color: C.text }}>{doc.number}</span>
                                                <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                                                    {money(doc.total)}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 12, color: C.textTer, marginTop: 2 }}>
                                                {doc.issuedByUs ? 'Выставлен вам' : 'Выставлен вами'}
                                                {doc.externalNumber ? ` · ваш № ${doc.externalNumber}` : ''}
                                                {` · ${doc.orders.length} рейс(ов)`}
                                            </div>
                                            <div style={{ fontSize: 13, color: C.textSec, marginTop: 6 }}>
                                                от {dayjs(doc.documentDate).format('DD.MM.YYYY')}
                                                {doc.dueDate && ` · оплатить до ${dayjs(doc.dueDate).format('DD.MM.YYYY')}`}
                                            </div>
                                            <div style={{
                                                display: 'flex', justifyContent: 'space-between',
                                                alignItems: 'center', gap: 8, marginTop: 10,
                                            }}>
                                                <Tag color={view.color} style={{ borderRadius: 6, margin: 0 }}>
                                                    {view.label}
                                                </Tag>
                                                {doc.shareToken && (
                                                    <Button
                                                        size="small"
                                                        style={{ borderRadius: 8 }}
                                                        onClick={() => window.open(`/shared/document/${doc.shareToken}`, '_blank')}
                                                    >
                                                        Открыть
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                        <Table
                            dataSource={documents}
                            rowKey="id"
                            size="middle"
                            pagination={documents.length > 15 ? { pageSize: 15, size: 'small' } : false}
                            scroll={{ x: 860 }}
                            columns={[
                                {
                                    title: 'Номер',
                                    key: 'number',
                                    width: 190,
                                    render: (_: any, r: any) => (
                                        <div>
                                            <div style={{ fontWeight: 600, color: C.text }}>{r.number}</div>
                                            <div style={{ fontSize: 12, color: C.textTer }}>
                                                {r.issuedByUs ? 'Выставлен вам' : 'Выставлен вами'}
                                                {r.externalNumber ? ` · ваш № ${r.externalNumber}` : ''}
                                            </div>
                                        </div>
                                    ),
                                },
                                {
                                    title: 'Дата',
                                    dataIndex: 'documentDate',
                                    key: 'documentDate',
                                    width: 110,
                                    render: (d: string) => dayjs(d).format('DD.MM.YYYY'),
                                },
                                {
                                    title: 'Срок оплаты',
                                    dataIndex: 'dueDate',
                                    key: 'dueDate',
                                    width: 130,
                                    render: (d: string) => {
                                        if (!d) return <span style={{ color: C.textTer }}>—</span>;
                                        const overdue = dayjs(d).isBefore(dayjs(), 'day');
                                        return (
                                            <span style={{ color: overdue ? C.red : C.text }}>
                                                {dayjs(d).format('DD.MM.YYYY')}
                                            </span>
                                        );
                                    },
                                },
                                {
                                    title: 'Рейсы',
                                    key: 'orders',
                                    width: 110,
                                    render: (_: any, r: any) => {
                                        if (!r.orders?.length) return <span style={{ color: C.textTer }}>—</span>;
                                        return (
                                            <Tooltip title={r.orders.map((o: any) => `№${o.orderNumber}`).join(', ')}>
                                                <span style={{
                                                    cursor: 'help', color: C.blue,
                                                    borderBottom: `1px dashed ${C.blue}`,
                                                }}>
                                                    {r.orders.length}
                                                </span>
                                            </Tooltip>
                                        );
                                    },
                                },
                                {
                                    title: 'Сумма',
                                    key: 'total',
                                    width: 150,
                                    align: 'right' as const,
                                    render: (_: any, r: any) => (
                                        <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            <div style={{ fontWeight: 600, color: C.text }}>{money(r.total)}</div>
                                            {r.balanceDue > 0 && r.balanceDue !== r.total && (
                                                <div style={{ fontSize: 12, color: C.amber }}>
                                                    остаток {money(r.balanceDue)}
                                                </div>
                                            )}
                                        </div>
                                    ),
                                },
                                {
                                    title: 'Статус',
                                    dataIndex: 'status',
                                    key: 'status',
                                    width: 150,
                                    render: (s: string, r: any) => {
                                        const view = docStatusView(s, !r.issuedByUs);
                                        return (
                                            <Tag color={view.color} style={{ borderRadius: 6, fontWeight: 500 }}>
                                                {view.label}
                                            </Tag>
                                        );
                                    },
                                },
                                {
                                    title: '',
                                    key: 'actions',
                                    width: 110,
                                    render: (_: any, r: any) => (
                                        r.shareToken ? (
                                            <Button
                                                size="small"
                                                style={{ borderRadius: 8 }}
                                                onClick={() => window.open(`/shared/document/${r.shareToken}`, '_blank')}
                                            >
                                                Открыть
                                            </Button>
                                        ) : null
                                    ),
                                },
                            ]}
                        />
                        )}
                    </section>
                )}

                <div style={{ textAlign: 'center', marginTop: 36, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                    <div style={{ color: C.textSec, fontSize: 12, lineHeight: 1.8 }}>
                        Отчёт сформирован автоматически {dayjs().format('DD.MM.YYYY в HH:mm')}
                    </div>
                    {data.expiresAt && (
                        <div style={{ color: C.textTer, fontSize: 12 }}>
                            Ссылка действует до {dayjs(data.expiresAt).format('DD.MM.YYYY, HH:mm')}
                        </div>
                    )}
                    <div style={{
                        color: C.textSec, fontSize: 12, fontWeight: 600, marginTop: 14,
                        letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}>
                        LogiCore
                    </div>
                </div>
            </main>

            <Modal
                title={<span style={{ fontWeight: 700, fontSize: 16 }}>Выставление счёта</span>}
                open={modalOpen}
                onCancel={() => {
                    setModalOpen(false);
                    form.resetFields();
                }}
                onOk={() => form.submit()}
                confirmLoading={submittingInvoice}
                okText="Отправить счёт"
                cancelText="Отмена"
                okButtonProps={{ style: { borderRadius: 10, fontWeight: 600 } }}
                cancelButtonProps={{ style: { borderRadius: 10 } }}
                width={520}
            >
                <div style={{
                    background: '#f4f5f7', borderRadius: 14, padding: '14px 16px', margin: '16px 0 18px',
                }}>
                    <div style={{ fontSize: 13, color: C.textSec }}>
                        {selectedRowKeys.length === 1 ? 'Выбрана 1 сделка' : `Выбрано сделок: ${selectedRowKeys.length}`}
                    </div>
                    <div style={{
                        fontSize: 24, fontWeight: 700, color: C.text,
                        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                    }}>
                        {money(selectedTotal)}
                    </div>
                </div>

                <Alert
                    type="info"
                    showIcon
                    style={{ borderRadius: 12, marginBottom: 18 }}
                    message="Счёт уйдёт в бухгалтерию на проверку"
                    description="Бухгалтер сверит суммы по рейсам и проведёт счёт. Номер в своей нумерации присвоит принимающая сторона."
                />

                <Form form={form} layout="vertical" onFinish={handleSubmitInvoice} requiredMark={false}>
                    <Form.Item
                        name="externalNumber"
                        label="Ваш номер счёта"
                        extra="Необязательно — если у вас своя нумерация, укажите её здесь."
                    >
                        <Input placeholder="Например, 77/К" maxLength={50} />
                    </Form.Item>

                    <Form.Item name="externalDate" label="Дата счёта">
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>

                    <Form.Item name="dueDate" label="Оплатить до">
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>

                    <Form.Item name="note" label="Комментарий">
                        <Input.TextArea
                            placeholder="Условия оплаты, реквизиты, любая важная информация"
                            rows={3}
                            maxLength={1000}
                            showCount
                        />
                    </Form.Item>
                </Form>

                {/* Пакет документов к счёту: свой счёт, накладные, акт.
                    Каждый файл ложится в документы всех отмеченных рейсов —
                    там его и ищет бухгалтерия отправителя. */}
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                        Документы к счёту
                    </div>
                    <div style={{ fontSize: 12, color: C.textTer, marginBottom: 10 }}>
                        Свой счёт, накладные, акт. Лягут в документы отмеченных рейсов.
                        PDF или фото, до 10 МБ.
                    </div>
                    <input
                        type="file"
                        multiple
                        accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                        onChange={(e) => setInvoiceFiles([
                            ...invoiceFiles,
                            ...Array.from(e.target.files ?? []).map((file) => ({ file, type: 'INVOICE' })),
                        ])}
                        style={{
                            width: '100%', padding: 10, borderRadius: 10,
                            border: `1px dashed ${C.border}`, background: '#fafbfc',
                        }}
                    />
                    {invoiceFiles.map((attachment, index) => (
                        <div
                            key={`${attachment.file.name}-${index}`}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                marginTop: 8, fontSize: 12.5,
                            }}
                        >
                            <PaperClipOutlined style={{ color: C.textTer }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {attachment.file.name}
                            </span>
                            <Select
                                size="small"
                                value={attachment.type}
                                style={{ width: 130 }}
                                options={DOCUMENT_KINDS}
                                onChange={(value) => setInvoiceFiles(invoiceFiles.map((item, i) => (
                                    i === index ? { ...item, type: value } : item
                                )))}
                            />
                            <Button
                                type="link"
                                size="small"
                                style={{ padding: 0, height: 'auto' }}
                                onClick={() => setInvoiceFiles(invoiceFiles.filter((_, i) => i !== index))}
                            >
                                Убрать
                            </Button>
                        </div>
                    ))}
                </div>
            </Modal>

            {/* Документ к сделкам — отдельно от счёта: накладную присылают и
                тогда, когда счёт уже выставлен. */}
            <Modal
                title={<span style={{ fontWeight: 700, fontSize: 16 }}>Приложить документ</span>}
                open={!!docOrders}
                onCancel={() => { setDocOrders(null); setDocFile(null); }}
                onOk={uploadDocuments}
                confirmLoading={uploadingDoc}
                okText="Приложить"
                cancelText="Отмена"
                okButtonProps={{ style: { borderRadius: 10, fontWeight: 600 } }}
                cancelButtonProps={{ style: { borderRadius: 10 } }}
                width={520}
            >
                {docOrders && (
                    <div style={{ background: '#f4f5f7', borderRadius: 14, padding: '14px 16px', margin: '16px 0 18px' }}>
                        <div style={{ fontSize: 13, color: C.textSec }}>
                            {docOrders.length === 1
                                ? `Заявка №${docOrders[0].orderNumber} · ${getRoute(docOrders[0])}`
                                : `Отмеченных сделок: ${docOrders.length}`}
                        </div>
                        <div style={{ fontSize: 12, color: C.textTer, marginTop: 4 }}>
                            Файл появится в документах {docOrders.length === 1 ? 'этой заявки' : 'каждой из них'}.
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>Что это за документ</div>
                    <Select
                        value={docType}
                        onChange={setDocType}
                        style={{ width: '100%' }}
                        options={DOCUMENT_KINDS}
                    />
                </div>

                <div style={{ fontSize: 13, marginBottom: 6 }}>Файл</div>
                <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    style={{
                        width: '100%', padding: 10, borderRadius: 10,
                        border: `1px dashed ${C.border}`, background: '#fafbfc',
                    }}
                />
                <div style={{ fontSize: 12, color: C.textTer, marginTop: 6 }}>
                    PDF или фото, до 10 МБ
                </div>
            </Modal>

            {/* Сколько на самом деле пришло: спорит получатель денег. */}
            <Modal
                title={<span style={{ fontWeight: 700, fontSize: 16 }}>Сколько к вам пришло</span>}
                open={!!receiptOrder}
                onCancel={() => { setReceiptOrder(null); receiptForm.resetFields(); }}
                onOk={() => receiptForm.submit()}
                confirmLoading={submittingReceipt}
                okText="Отправить"
                cancelText="Отмена"
                okButtonProps={{ style: { borderRadius: 10, fontWeight: 600 } }}
                cancelButtonProps={{ style: { borderRadius: 10 } }}
                width={520}
            >
                {receiptOrder && (
                    <div style={{ background: '#f4f5f7', borderRadius: 14, padding: '14px 16px', margin: '16px 0 18px' }}>
                        <div style={{ fontSize: 13, color: C.textSec }}>
                            Заявка №{receiptOrder.orderNumber} · {getRoute(receiptOrder)}
                        </div>
                        <div style={{ fontSize: 14, color: C.text, marginTop: 4 }}>
                            У отправителя записано: <b>{money(receiptOrder.paidAmount || 0)}</b> из {money(receiptOrder.amount)}
                        </div>
                    </div>
                )}

                <Alert
                    type="info"
                    showIcon
                    style={{ borderRadius: 12, marginBottom: 18 }}
                    message="Это замечание, а не исправление"
                    description="Сумма у отправителя сама не изменится. Бухгалтер сверит её с банковской выпиской и поправит, если ошибка на его стороне."
                />

                <Form form={receiptForm} layout="vertical" onFinish={handleSubmitReceipt} requiredMark={false}>
                    <Form.Item
                        name="claimedAmount"
                        label="Сколько пришло на самом деле"
                        rules={[{ required: true, message: 'Укажите сумму' }]}
                    >
                        <Input suffix="₸" inputMode="decimal" maxLength={30} />
                    </Form.Item>

                    <Form.Item name="claimedDate" label="Дата поступления">
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>

                    <Form.Item name="note" label="Комментарий">
                        <Input.TextArea
                            placeholder="Например: пришло двумя платежами, второй не дошёл"
                            rows={2}
                            maxLength={500}
                            showCount
                        />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={<span style={{ fontWeight: 700, fontSize: 16 }}>Подтверждение оплаты</span>}
                open={!!proofOrder}
                onCancel={() => {
                    setProofOrder(null);
                    setProofFile(null);
                    proofForm.resetFields();
                }}
                onOk={() => proofForm.submit()}
                confirmLoading={submittingProof}
                okText="Отправить чек"
                cancelText="Отмена"
                okButtonProps={{ style: { borderRadius: 10, fontWeight: 600 } }}
                cancelButtonProps={{ style: { borderRadius: 10 } }}
                width={520}
            >
                {proofOrder && (
                    <div style={{ background: '#f4f5f7', borderRadius: 14, padding: '14px 16px', margin: '16px 0 18px' }}>
                        <div style={{ fontSize: 13, color: C.textSec }}>
                            Заявка №{proofOrder.orderNumber} · {getRoute(proofOrder)}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                            К оплате {money(proofOrder.remaining ?? proofOrder.amount)}
                        </div>
                    </div>
                )}

                <Alert
                    type="warning"
                    showIcon
                    style={{ borderRadius: 12, marginBottom: 18 }}
                    message="Чек не закрывает задолженность автоматически"
                    description="Бухгалтер сверит платёж с банковской выпиской и проведёт его. До этого сумма остаётся в долге."
                />

                <Form form={proofForm} layout="vertical" onFinish={handleSubmitProof} requiredMark={false}>
                    <Form.Item label="Файл чека" required>
                        <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                            onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                            style={{
                                width: '100%', padding: 10, borderRadius: 10,
                                border: `1px dashed ${C.border}`, background: '#fafbfc',
                            }}
                        />
                        <div style={{ fontSize: 12, color: C.textTer, marginTop: 6 }}>
                            PDF или фото платёжного поручения, до 10 МБ
                        </div>
                    </Form.Item>

                    <Form.Item name="claimedAmount" label="Сумма платежа">
                        <Input suffix="₸" inputMode="decimal" maxLength={30} />
                    </Form.Item>

                    <Form.Item name="claimedDate" label="Дата платежа">
                        <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
                    </Form.Item>

                    <Form.Item name="note" label="Комментарий">
                        <Input.TextArea
                            placeholder="Номер платёжного поручения, назначение платежа"
                            rows={2}
                            maxLength={500}
                            showCount
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
