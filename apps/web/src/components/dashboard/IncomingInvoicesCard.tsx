'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Empty, Input, Modal, Skeleton, Tag } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { canApproveInvoices } from '@/lib/permissions';
import nova from '@/components/nova/nova.module.css';
import { toast } from 'sonner';

interface IncomingInvoice {
    id: string;
    number: string;
    documentDate: string;
    dueDate: string | null;
    currency: string;
    total: number;
    balanceDue: number;
    approvalStatus: string | null;
    approvalNote: string | null;
    approvedBy: { firstName: string; lastName: string } | null;
    supplier: { id: string; name: string } | null;
}

const money = (value: number, currency: string) =>
    `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currency === 'KZT' ? '₸' : currency}`;

/**
 * Входящие счета на дашборде.
 *
 * Пока счёт лежал только в «Счета → Входящие», о нём узнавали случайно:
 * кто-то заходил в раздел и находил бумагу недельной давности с истёкшим
 * сроком оплаты. Работа, о которой никто не знает, — та же несделанная
 * работа, поэтому очередь вынесена на первый экран.
 *
 * Тому, кто согласовывает, сверху лежат счета, ждущие именно его решения:
 * пока он не ответил, бухгалтер оплатить не может, и очередь стоит на нём.
 */
export default function IncomingInvoicesCard() {
    const router = useRouter();
    const { user } = useAuthStore();
    const согласует = canApproveInvoices(user);

    const [invoices, setInvoices] = useState<IncomingInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [отказ, setОтказ] = useState<IncomingInvoice | null>(null);
    const [причина, setПричина] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/accounting-documents/incoming-invoices', {
                params: { limit: 10 },
            });
            setInvoices(res.data || []);
        } catch {
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /**
     * Ждущие решения — вперёд, и только у того, кто решает.
     *
     * Бухгалтеру такой порядок ничего не даёт: он всё равно не может их
     * оплатить, пока финотдел не ответил.
     */
    const список = useMemo(() => {
        if (!согласует) return invoices;
        return [...invoices].sort((а, б) => {
            const ждёт = (счёт: IncomingInvoice) => (счёт.approvalStatus ? 1 : 0);
            return ждёт(а) - ждёт(б);
        });
    }, [invoices, согласует]);

    const ждут = invoices.filter((счёт) => !счёт.approvalStatus).length;

    const решить = async (счёт: IncomingInvoice, decision: 'APPROVED' | 'REJECTED', note?: string) => {
        try {
            setBusy(счёт.id);
            await api.post(`/accounting-documents/${счёт.id}/approval`, { decision, note });
            toast.success(decision === 'APPROVED'
                ? `Счёт ${счёт.number} согласован — бухгалтерия может оплачивать`
                : `Счёт ${счёт.number} не согласован`);
            setОтказ(null);
            setПричина('');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось записать решение');
        } finally {
            setBusy(null);
        }
    };

    // Пустую карточку не показываем: она бы только занимала место.
    if (!loading && invoices.length === 0) return null;

    return (
        <div className={nova.card} style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <FileTextOutlined style={{ color: '#d97706' }} />
                <span style={{ fontSize: 16, fontWeight: 700 }}>Входящие счета</span>
                {ждут > 0 && (
                    <Tag color="gold" style={{ borderRadius: 999, margin: 0 }}>
                        {ждут} ждут согласования
                    </Tag>
                )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--nova-fg-2)', marginBottom: 16 }}>
                {согласует
                    ? 'Пока вы не согласовали, оплатить счёт бухгалтерия не может.'
                    : 'Оплачивать можно только согласованные финотделом.'}
            </div>

            {loading ? (
                <Skeleton active paragraph={{ rows: 3 }} />
            ) : список.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Новых счетов нет" />
            ) : (
                список.map((счёт) => {
                    const просрочен = счёт.dueDate && dayjs(счёт.dueDate).isBefore(dayjs(), 'day');
                    return (
                        <div
                            key={счёт.id}
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
                                padding: '12px 0', borderTop: '1px solid var(--nova-border)',
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <div style={{ fontWeight: 600 }}>
                                    <a
                                        onClick={() => router.push(`/company/accounting/invoices/${счёт.id}`)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        Счёт № {счёт.number}
                                    </a>
                                    {' · '}
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                        {money(счёт.balanceDue, счёт.currency)}
                                    </span>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--nova-fg-3)' }}>
                                    {счёт.supplier?.name ?? 'контрагент не указан'}
                                    {` · от ${dayjs(счёт.documentDate).format('DD.MM.YYYY')}`}
                                    {счёт.dueDate && (
                                        <span style={{ color: просрочен ? 'var(--nova-neg)' : undefined }}>
                                            {` · оплатить до ${dayjs(счёт.dueDate).format('DD.MM.YYYY')}`}
                                            {просрочен ? ' — просрочен' : ''}
                                        </span>
                                    )}
                                </div>
                                {счёт.approvalStatus === 'APPROVED' && (
                                    <div style={{ fontSize: 12, color: 'var(--nova-pos)', marginTop: 2 }}>
                                        Согласовано
                                        {счёт.approvedBy
                                            ? ` — ${счёт.approvedBy.firstName} ${счёт.approvedBy.lastName}`
                                            : ''}
                                    </div>
                                )}
                                {счёт.approvalStatus === 'REJECTED' && (
                                    <div style={{ fontSize: 12, color: 'var(--nova-neg)', marginTop: 2 }}>
                                        Не согласовано{счёт.approvalNote ? `: ${счёт.approvalNote}` : ''}
                                    </div>
                                )}
                            </div>

                            {согласует && !счёт.approvalStatus && (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <Button
                                        size="small"
                                        type="primary"
                                        loading={busy === счёт.id}
                                        style={{ borderRadius: 8 }}
                                        onClick={() => решить(счёт, 'APPROVED')}
                                    >
                                        Согласовано
                                    </Button>
                                    <Button
                                        size="small"
                                        danger
                                        style={{ borderRadius: 8 }}
                                        onClick={() => { setОтказ(счёт); setПричина(''); }}
                                    >
                                        Не согласовано
                                    </Button>
                                </div>
                            )}
                            {!счёт.approvalStatus && !согласует && (
                                <Tag color="default" style={{ borderRadius: 999, margin: 0 }}>
                                    ждёт финотдел
                                </Tag>
                            )}
                        </div>
                    );
                })
            )}

            <Modal
                title={отказ ? `Не согласовать счёт № ${отказ.number}` : ''}
                open={!!отказ}
                onCancel={() => setОтказ(null)}
                onOk={() => отказ && решить(отказ, 'REJECTED', причина.trim())}
                confirmLoading={!!busy}
                okText="Не согласовано"
                cancelText="Отмена"
                okButtonProps={{ danger: true, disabled: !причина.trim() }}
            >
                <div style={{ fontSize: 13, color: 'var(--nova-fg-2)', marginBottom: 10 }}>
                    Бухгалтеру решать, ждать исправленный счёт или вернуть его контрагенту, —
                    напишите, что не так.
                </div>
                <Input.TextArea
                    autoFocus
                    rows={3}
                    maxLength={300}
                    value={причина}
                    onChange={(e) => setПричина(e.target.value)}
                    placeholder="Сумма выше договорной; услуги не заказывали; нет акта"
                />
            </Modal>
        </div>
    );
}
