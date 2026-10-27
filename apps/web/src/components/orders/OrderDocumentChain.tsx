'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
    AccountingDocumentListItem,
    OrderChainDocumentType,
    accountingDocumentHref,
    fetchAccountingDocuments,
    fetchIncomingDelivered,
} from '@/lib/accounting-documents';
import { Route } from 'lucide-react';
import StatusPill from '@/components/ui/StatusPill';
import nova from '@/components/nova/nova.module.css';
import styles from './order-document-chain.module.css';
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
}

const STEP_TITLES: Record<OrderChainDocumentType, string> = {
    PAYMENT_INVOICE: 'Счёт на оплату',
    SERVICE_ACT: 'Акт выполненных работ',
};

/**
 * Цепочка документов рейса: заявка → счёт → акт → оплата.
 *
 * Отвечает на вопрос бухгалтера «что по этому рейсу уже оформлено, а что
 * нет» — раньше это выяснялось обходом трёх журналов. Оплата показана по
 * счёту (`amountPaid` / `balanceDue` из аллокаций T-07), а не по платежам
 * рейса: платёж может закрывать несколько счетов, и «оплачен ли рейс»
 * честно виден только со стороны документа.
 */
export default function OrderDocumentChain({
    orderId,
    orderNumber,
    orderStatus,
    onCreate,
    creating = null,
    reloadKey = 0,
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

    const documentStep = (type: OrderChainDocumentType) => {
        const document = active(type);
        return (
            <div className={nova.tile} style={cardStyle}>
                <div style={stepHeadStyle}>
                    <span className={nova.tileLabel}>{STEP_TITLES[type]}</span>
                    {document && <StatusPill status={document.status} />}
                </div>
                {document ? (
                    <>
                        <button
                            type="button"
                            className={styles.docLink}
                            onClick={() => router.push(accountingDocumentHref({ id: document.id, type }))}
                        >
                            {document.number}
                        </button>
                        <div className={styles.amount}>{money(document.total)}</div>
                    </>
                ) : (
                    <>
                        <div className={nova.tileSub}>Не выставлен</div>
                        <button
                            type="button"
                            className={nova.action}
                            style={{ marginTop: 8, height: 28 }}
                            disabled={creating === type}
                            onClick={() => onCreate(type)}
                        >
                            {creating === type ? 'Создаём…' : 'Создать'}
                        </button>
                    </>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <section className={nova.card}>
                <div className={nova.cardBody}>
                    <Skeleton active paragraph={{ rows: 2 }} />
                </div>
            </section>
        );
    }

    return (
        <section className={nova.card}>
            <div className={nova.cardHead}>
                <Route size={14} />
                <h3 className={nova.cardTitle}>Документы по рейсу</h3>
            </div>
            <div className={nova.cardBody}>
            <div style={chainStyle}>
                <div className={nova.tile} style={cardStyle}>
                    <div style={stepHeadStyle}>
                        <span className={nova.tileLabel}>Рейс</span>
                        <StatusPill status={orderStatus} />
                    </div>
                    <div className={styles.docNumber}>{orderNumber}</div>
                </div>

                <span style={arrowStyle}>→</span>
                {documentStep('PAYMENT_INVOICE')}
                <span style={arrowStyle}>→</span>
                {documentStep('SERVICE_ACT')}
                <span style={arrowStyle}>→</span>

                <div className={nova.tile} style={cardStyle}>
                    <div style={stepHeadStyle}>
                        <span className={nova.tileLabel}>Оплата</span>
                    </div>
                    {invoice ? (
                        <>
                            <div className={styles.amount}>{money(invoice.amountPaid)}</div>
                            <div className={nova.tileSub}>
                                {invoice.balanceDue > 0
                                    ? `остаток ${money(invoice.balanceDue)}`
                                    : 'счёт закрыт'}
                            </div>
                        </>
                    ) : (
                        <div className={nova.tileSub}>Ждёт счёта</div>
                    )}
                </div>
            </div>
            {fromCarrier.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <div className={nova.tileLabel} style={{ marginBottom: 6 }}>От перевозчика</div>
                    {fromCarrier.map((d) => (
                        <div key={d.id} style={carrierRowStyle}>
                            <button
                                type="button"
                                className={styles.docLink}
                                onClick={() => router.push(`/company/accounting/invoices/${d.id}`)}
                            >
                                {d.type === 'SERVICE_ACT' ? 'Акт' : 'Счёт'} № {d.number}
                            </button>
                            <span className={nova.tileSub} style={{ flex: 1 }}>{d.from}</span>
                            <span className={nova.tileSub}>{d.note}</span>
                            <span className={styles.amount} style={{ fontSize: 14 }}>{money(d.total)}</span>
                        </div>
                    ))}
                </div>
            )}
            {(invoice?.status === 'DRAFT' || act?.status === 'DRAFT') && (
                <div className={nova.itemDesc} style={{ marginTop: 10, whiteSpace: 'normal' }}>
                    Черновик не проведён — контрагенту такой документ не отдан.
                </div>
            )}
            </div>
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

const carrierRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    padding: '6px 0',
    borderTop: '1px solid var(--nova-border)',
};

const chainStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
    flexWrap: 'wrap',
};

const cardStyle: React.CSSProperties = {
    padding: 12,
    minWidth: 168,
    flex: '1 1 168px',
};

const stepHeadStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
};

const arrowStyle: React.CSSProperties = {
    alignSelf: 'center',
    color: 'var(--nova-fg-3)',
};
