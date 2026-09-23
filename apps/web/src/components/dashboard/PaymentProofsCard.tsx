'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Input } from 'antd';
import { Check, FileText, Loader2, Paperclip, X } from 'lucide-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Loader from '@/components/ui/Loader';
import nova from '@/components/nova/nova.module.css';
import DashboardCard from './DashboardCard';
import styles from './queue-card.module.css';
import { toast } from 'sonner';

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
            toast.success('Чек подтверждён. Платёж проведите отдельно после сверки с банком');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось подтвердить чек');
        } finally {
            setBusy(null);
        }
    };

    const reject = async () => {
        if (!rejecting) return;
        try {
            setBusy(rejecting.id);
            await api.post(`/payment-proofs/${rejecting.id}/reject`, { reason: reason.trim() || undefined });
            toast.success('Чек отклонён');
            setRejecting(null);
            setReason('');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось отклонить чек');
        } finally {
            setBusy(null);
        }
    };

    // Пустую карточку не показываем: она бы только занимала место на дашборде.
    if (!loading && proofs.length === 0) return null;

    return (
        <DashboardCard
            icon={<Paperclip size={14} />}
            title="Чеки от контрагентов"
            badge={proofs.length > 0 && <span className={`${nova.chip} ${nova.chipWarn}`}>{proofs.length}</span>}
            hint="Подтверждение не проводит платёж — сверьте с банковской выпиской."
        >
            {loading ? (
                <DashboardCard.Center><Loader /></DashboardCard.Center>
            ) : proofs.length === 0 ? (
                <DashboardCard.Center>Новых чеков нет</DashboardCard.Center>
            ) : (
                <div className={styles.list}>
                    {proofs.map((proof) => (
                        <div key={proof.id} className={styles.item}>
                            <div className={styles.top}>
                                <button
                                    type="button"
                                    className={styles.title}
                                    onClick={() => router.push(`/company/orders/${proof.order.id}`)}
                                >
                                    Заявка №{proof.order.orderNumber}
                                </button>
                                <span className={styles.amount}>{money(proof.claimedAmount)}</span>
                            </div>
                            <div className={styles.meta}>
                                {proof.counterparty.name}
                                {proof.claimedDate && ` · платёж от ${dayjs(proof.claimedDate).format('DD.MM.YYYY')}`}
                                {` · прислан ${dayjs(proof.createdAt).format('DD.MM.YYYY')}`}
                            </div>
                            {proof.note && <div className={styles.note}>{proof.note}</div>}
                            <div className={styles.actions}>
                                <Button size="sm" variant="outline" onClick={() => openFile(proof)}>
                                    <FileText className="h-3.5 w-3.5" />
                                    Открыть чек
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={busy === proof.id}
                                    onClick={() => accept(proof)}
                                >
                                    {busy === proof.id
                                        ? <Loader2 className={`h-3.5 w-3.5 ${styles.spin}`} />
                                        : <Check className="h-3.5 w-3.5" />}
                                    Подтвердить
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive"
                                    onClick={() => { setRejecting(proof); setReason(''); }}
                                >
                                    <X className="h-3.5 w-3.5" />
                                    Отклонить
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
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
                <div style={{ fontSize: 13, color: 'var(--nova-fg-2)', margin: '12px 0 8px' }}>
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
        </DashboardCard>
    );
}
