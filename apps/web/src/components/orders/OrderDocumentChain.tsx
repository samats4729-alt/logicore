'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Skeleton, message } from 'antd';
import {
    AccountingDocumentListItem,
    OrderChainDocumentType,
    accountingDocumentHref,
    fetchAccountingDocuments,
} from '@/lib/accounting-documents';
import StatusPill from '@/components/ui/StatusPill';

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
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetchAccountingDocuments({ orderId, limit: 50 });
            setDocuments(res.data);
        } catch {
            message.error('Не удалось загрузить документы по рейсу');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        load();
    }, [load, reloadKey]);

    // Отменённый документ основанием не считается — так же, как при создании.
    const active = (type: OrderChainDocumentType) =>
        documents.find((document) => document.type === type && document.status !== 'CANCELLED');

    const invoice = active('PAYMENT_INVOICE');
    const act = active('SERVICE_ACT');

    const documentStep = (type: OrderChainDocumentType) => {
        const document = active(type);
        return (
            <div className="lc-card" style={cardStyle}>
                <div style={stepHeadStyle}>
                    <span style={stepTitleStyle}>{STEP_TITLES[type]}</span>
                    {document && <StatusPill status={document.status} />}
                </div>
                {document ? (
                    <>
                        <a
                            onClick={() => router.push(accountingDocumentHref({ id: document.id, type }))}
                            style={linkStyle}
                        >
                            {document.number}
                        </a>
                        <div style={amountStyle}>{money(document.total)}</div>
                    </>
                ) : (
                    <>
                        <div style={emptyStyle}>Не выставлен</div>
                        <Button
                            size="small"
                            onClick={() => onCreate(type)}
                            loading={creating === type}
                            style={{ marginTop: 8 }}
                        >
                            Создать
                        </Button>
                    </>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="lc-card" style={{ padding: 16, marginBottom: 16 }}>
                <Skeleton active paragraph={{ rows: 2 }} />
            </div>
        );
    }

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Документы по рейсу</div>
            <div style={chainStyle}>
                <div className="lc-card" style={cardStyle}>
                    <div style={stepHeadStyle}>
                        <span style={stepTitleStyle}>Рейс</span>
                        <StatusPill status={orderStatus} />
                    </div>
                    <div style={linkStyle}>{orderNumber}</div>
                </div>

                <span style={arrowStyle}>→</span>
                {documentStep('PAYMENT_INVOICE')}
                <span style={arrowStyle}>→</span>
                {documentStep('SERVICE_ACT')}
                <span style={arrowStyle}>→</span>

                <div className="lc-card" style={cardStyle}>
                    <div style={stepHeadStyle}>
                        <span style={stepTitleStyle}>Оплата</span>
                    </div>
                    {invoice ? (
                        <>
                            <div style={amountStyle}>{money(invoice.amountPaid)}</div>
                            <div style={emptyStyle}>
                                {invoice.balanceDue > 0
                                    ? `остаток ${money(invoice.balanceDue)}`
                                    : 'счёт закрыт'}
                            </div>
                        </>
                    ) : (
                        <div style={emptyStyle}>Ждёт счёта</div>
                    )}
                </div>
            </div>
            {(invoice?.status === 'DRAFT' || act?.status === 'DRAFT') && (
                <div style={{ ...emptyStyle, marginTop: 8 }}>
                    Черновик не проведён — контрагенту такой документ не отдан.
                </div>
            )}
        </div>
    );
}

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

const stepTitleStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#5f6672',
};

const linkStyle: React.CSSProperties = {
    fontWeight: 600,
    display: 'block',
};

const amountStyle: React.CSSProperties = {
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
};

const emptyStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#8c8c8c',
};

const arrowStyle: React.CSSProperties = {
    alignSelf: 'center',
    color: '#c4c8ce',
};
