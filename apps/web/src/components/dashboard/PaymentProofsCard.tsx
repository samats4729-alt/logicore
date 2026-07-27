'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Empty, Modal, Input, Skeleton, Tag, message } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';

interface PaymentProof {
    id: string;
    status: string;
    fileName: string;
    claimedAmount: number | null;
    claimedDate: string | null;
    note: string | null;
    createdAt: string;
    order: { id: string; orderNumber: string };
    counterparty: { id: string; name: string };
}

const money = (value: number | null) =>
    value === null || value === undefined
        ? 'сумма не указана'
        : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸`;

/**
 * Чеки, присланные контрагентами по ссылке на отчёт.
 *
 * Чек — заявление стороны, а не приход денег: подтверждение здесь НЕ
 * создаёт платёж. Оно означает лишь, что документ признан подлинным;
 * деньги проводятся обычным платежом после сверки с банком.
 */
export default function PaymentProofsCard() {
    const router = useRouter();
    const [proofs, setProofs] = useState<PaymentProof[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [rejecting, setRejecting] = useState<PaymentProof | null>(null);
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/payment-proofs', { params: { status: 'PENDING' } });
            setProofs(res.data || []);
        } catch {
            setProofs([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openFile = (proof: PaymentProof) => {
        const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        window.open(`${base}/payment-proofs/${proof.id}/file`, '_blank');
    };

    const accept = async (proof: PaymentProof) => {
        try {
            setBusy(proof.id);
            await api.post(`/payment-proofs/${proof.id}/accept`, {});
            message.success('Чек подтверждён. Платёж проведите отдельно после сверки с банком');
            await load();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось подтвердить чек');
        } finally {
            setBusy(null);
        }
    };

    const reject = async () => {
        if (!rejecting) return;
        try {
            setBusy(rejecting.id);
            await api.post(`/payment-proofs/${rejecting.id}/reject`, { reason: reason.trim() || undefined });
            message.success('Чек отклонён');
            setRejecting(null);
            setReason('');
            await load();
        } catch (e: any) {
            message.error(e.response?.data?.message || 'Не удалось отклонить чек');
        } finally {
            setBusy(null);
        }
    };

    // Пустую карточку не показываем: она бы только занимала место на дашборде.
    if (!loading && proofs.length === 0) return null;

    return (
        <div className="premium-card" style={{ padding: 24, marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <PaperClipOutlined style={{ color: '#d97706' }} />
                <span style={{ fontSize: 16, fontWeight: 700 }}>Чеки от контрагентов</span>
                {proofs.length > 0 && (
                    <Tag color="gold" style={{ borderRadius: 999, margin: 0 }}>{proofs.length}</Tag>
                )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--lc-text-sec)', marginBottom: 16 }}>
                Подтверждение не проводит платёж — сверьте с банковской выпиской.
            </div>

            {loading ? (
                <Skeleton active paragraph={{ rows: 3 }} />
            ) : proofs.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Новых чеков нет" />
            ) : (
                proofs.map((proof) => (
                    <div
                        key={proof.id}
                        style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
                            padding: '12px 0', borderTop: '1px solid var(--lc-border)',
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontWeight: 600 }}>
                                <a
                                    onClick={() => router.push(`/company/orders/${proof.order.id}`)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    Заявка №{proof.order.orderNumber}
                                </a>
                                {' · '}
                                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(proof.claimedAmount)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--lc-text-ter)' }}>
                                {proof.counterparty.name}
                                {proof.claimedDate && ` · платёж от ${dayjs(proof.claimedDate).format('DD.MM.YYYY')}`}
                                {` · прислан ${dayjs(proof.createdAt).format('DD.MM.YYYY')}`}
                            </div>
                            {proof.note && (
                                <div style={{ fontSize: 12, color: 'var(--lc-text-sec)', marginTop: 2 }}>
                                    {proof.note}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button size="small" style={{ borderRadius: 8 }} onClick={() => openFile(proof)}>
                                Открыть чек
                            </Button>
                            <Button
                                size="small"
                                type="primary"
                                loading={busy === proof.id}
                                style={{ borderRadius: 8 }}
                                onClick={() => accept(proof)}
                            >
                                Подтвердить
                            </Button>
                            <Button
                                size="small"
                                danger
                                style={{ borderRadius: 8 }}
                                onClick={() => { setRejecting(proof); setReason(''); }}
                            >
                                Отклонить
                            </Button>
                        </div>
                    </div>
                ))
            )}

            <Modal
                title="Отклонить чек"
                open={!!rejecting}
                onCancel={() => setRejecting(null)}
                onOk={reject}
                confirmLoading={!!busy}
                okText="Отклонить"
                cancelText="Отмена"
                okButtonProps={{ danger: true, style: { borderRadius: 8 } }}
                cancelButtonProps={{ style: { borderRadius: 8 } }}
            >
                <div style={{ fontSize: 13, color: 'var(--lc-text-sec)', margin: '12px 0 8px' }}>
                    Причину увидит контрагент на своей странице — так он поймёт, что прислать взамен.
                </div>
                <Input.TextArea
                    rows={3}
                    maxLength={300}
                    showCount
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Например: сумма не совпадает с выпиской"
                />
            </Modal>
        </div>
    );
}
