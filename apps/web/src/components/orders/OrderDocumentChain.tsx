'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Tooltip } from 'antd';
import {
    AccountingDocumentListItem,
    OrderChainDocumentType,
    accountingDocumentHref,
    fetchAccountingDocuments,
    fetchIncomingDelivered,
} from '@/lib/accounting-documents';
import { Loader2 } from 'lucide-react';
import StatusPill from '@/components/ui/StatusPill';
import { cn } from '@/lib/utils';
import card from './order-card.module.css';
import { toast } from 'sonner';

const money = (value: number) =>
    `${(value ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`;

interface OrderDocumentChainProps {
    orderId: string;
    orderNumber: string;
    orderStatus: string;
    /** Кнопка «на основании»: создаёт документ и уводит в его карточку. */
    onCreate: (type: OrderChainDocumentType) => void;
    creating?: OrderChainDocumentType | null;
    /** Перезагрузка извне — после создания документа или оплаты. */
    reloadKey?: number;
    /** Предпросмотр акта по текущим данным заявки. */
    onPreview?: () => void;
}

const STEP_TITLES: Record<OrderChainDocumentType, string> = {
    PAYMENT_INVOICE: 'Счёт на оплату',
    SERVICE_ACT: 'Акт выполненных работ',
};

/**
 * «Счёт и акт заказчику»: счёт → акт → оплата, строками (вариант 5).
 *
 * Отвечает на вопрос бухгалтера «что по этому рейсу уже оформлено, а что
 * нет» — раньше это выяснялось обходом трёх журналов. Оплата показана по
 * счёту (`amountPaid` / `balanceDue` из аллокаций T-07), а не по платежам
 * рейса: платёж может закрывать несколько счетов, и «оплачен ли рейс»
 * честно виден только со стороны документа.
 */
export default function OrderDocumentChain({
    orderId,
    onCreate,
    creating = null,
    reloadKey = 0,
    onPreview,
}: OrderDocumentChainProps) {
    const router = useRouter();
    const [documents, setDocuments] = useState<AccountingDocumentListItem[]>([]);
    /**
     * Счета и акты от перевозчика по этому рейсу (задачи шефа, H8): те, что
     * мы завели сами, и те, что он прислал нам через платформу.
     */
    const [fromCarrier, setFromCarrier] = useState<CarrierDocument[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const [res, delivered] = await Promise.all([
                fetchAccountingDocuments({ orderId, limit: 50 }),
                fetchIncomingDelivered(undefined, orderId).catch(() => []),
            ]);
            setDocuments(res.data);
            setFromCarrier([
                ...res.data
                    .filter((d) => d.direction === 'INCOMING' && d.status !== 'CANCELLED')
                    .map((d) => ({
                        id: d.id, number: d.externalNumber || d.number, type: d.type, total: d.total,
                        from: d.counterparty?.name ?? null, note: d.balanceDue > 0 ? `к оплате ${money(d.balanceDue)}` : 'оплачен',
                    })),
                ...delivered.map((d) => ({
                    id: d.id, number: d.number, type: d.type, total: d.total, from: d.company?.name ?? null,
                    note: d.receiptStatus === 'ACCEPTED' ? 'принят' : d.receiptStatus === 'REJECTED' ? 'отклонён' : 'ждёт решения',
                })),
            ]);
        } catch {
            toast.error('Не удалось загрузить документы по рейсу');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        load();
    }, [load, reloadKey]);

    // Отменённый документ основанием не считается — так же, как при создании.
    // Цепочка — про наш счёт заказчику: счёт перевозчика сюда не попадает,
    // иначе он вставал на место нашего и кнопка «Создать» пропадала.
    const active = (type: OrderChainDocumentType) =>
        documents.find((document) => document.type === type
            && document.direction === 'OUTGOING'
            && document.status !== 'CANCELLED');

    const invoice = active('PAYMENT_INVOICE');
    const act = active('SERVICE_ACT');

    /**
     * Строка документа: точка, название, номер со статусом и суммой — или
     * «не выставлен» и «Выставить». Черновик ждёт проведения — оранжевая
     * точка; проведённый — чёрная.
     */
    const documentRow = (type: OrderChainDocumentType) => {
        const document = active(type);
        return (
            <div className={card.task}>
                <span className={cn(card.dot, document ? (document.status === 'DRAFT' ? card.dotNeed : card.dotOk) : card.dotNone)} aria-hidden />
                <span style={{ fontWeight: 500 }}>{STEP_TITLES[type]}</span>
                {document ? (
                    <span>
                        <button
                            type="button"
                            className={card.lnk}
                            style={{ fontSize: 14 }}
                            onClick={() => router.push(accountingDocumentHref({ id: document.id, type }))}
                        >
                            № {document.number}
                        </button>
                        {' '}
                        <StatusPill status={document.status} />
                        <span className={card.muted}> · {money(document.total)}</span>
                    </span>
                ) : (
                    <span className={card.muted}>Не выставлен</span>
                )}
                <span>
                    {!document && (
                        <button
                            type="button"
                            className={card.lnk}
                            disabled={creating === type}
                            onClick={() => onCreate(type)}
                        >
                            {creating === type && <Loader2 size={13} className="animate-spin" />}
                            {creating === type ? 'Создаём…' : 'Выставить'}
                        </button>
                    )}
                </span>
            </div>
        );
    };

    return (
        <section className={card.section} aria-label="Счёт и акт заказчику">
            <h2 className={card.head}>
                Счёт и акт заказчику
                {onPreview && (
                    <span className={card.headRight}>
                        <Tooltip title="Расчёт по текущим данным заявки — меняется вместе с ней">
                            <button type="button" className={card.lnk} onClick={onPreview}>Предпросмотр акта</button>
                        </Tooltip>
                    </span>
                )}
            </h2>
            {loading ? (
                <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
            ) : (
                <div className={card.list}>
                    {documentRow('PAYMENT_INVOICE')}
                    {documentRow('SERVICE_ACT')}
                    <div className={card.task}>
                        <span className={cn(card.dot, invoice && invoice.balanceDue <= 0 ? card.dotOk : card.dotNone)} aria-hidden />
                        <span style={{ fontWeight: 500 }}>Оплата по счёту</span>
                        {invoice ? (
                            <span>
                                {money(invoice.amountPaid)}
                                <span className={card.muted}>
                                    {invoice.balanceDue > 0 ? ` · остаток ${money(invoice.balanceDue)}` : ' · счёт закрыт'}
                                </span>
                            </span>
                        ) : (
                            <span className={card.muted}>Ждёт счёта</span>
                        )}
                        <span />
                    </div>
                    {fromCarrier.map((d) => (
                        <div key={d.id} className={card.task}>
                            <span aria-hidden />
                            <span className={card.muted}>От перевозчика</span>
                            <span>
                                <button
                                    type="button"
                                    className={card.lnk}
                                    style={{ fontSize: 14 }}
                                    onClick={() => router.push(`/company/accounting/invoices/${d.id}`)}
                                >
                                    {d.type === 'SERVICE_ACT' ? 'Акт' : 'Счёт'} № {d.number}
                                </button>
                                <span className={card.muted}>
                                    {d.from ? ` · ${d.from}` : ''} · {d.note}
                                </span>
                            </span>
                            <span className={card.n}>{money(d.total)}</span>
                        </div>
                    ))}
                </div>
            )}
            {(invoice?.status === 'DRAFT' || act?.status === 'DRAFT') && (
                <p className={card.note}>Черновик не проведён — контрагенту такой документ не отдан.</p>
            )}
        </section>
    );
}

/** Строка «от перевозчика»: свой входящий документ или присланный с платформы. */
interface CarrierDocument {
    id: string;
    number: string;
    type: string;
    total: number;
    from: string | null;
    note: string;
}
