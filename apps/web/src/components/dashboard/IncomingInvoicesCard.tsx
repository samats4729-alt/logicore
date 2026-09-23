'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Modal } from 'antd';
import { Check, FileInput, Loader2, X } from 'lucide-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { canApproveInvoices } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import Loader from '@/components/ui/Loader';
import nova from '@/components/nova/nova.module.css';
import DashboardCard from './DashboardCard';
import styles from './queue-card.module.css';
import { toast } from 'sonner';

interface IncomingInvoice {
    id: string;
    number: string;
    documentDate: string;
    dueDate: string | null;
    currency: string;
    total: number;
    balanceDue: number;
    approvalRequired: boolean;
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
            const ждёт = (счёт: IncomingInvoice) => (счёт.approvalRequired && !счёт.approvalStatus ? 0 : 1);
            return ждёт(а) - ждёт(б);
        });
    }, [invoices, согласует]);

    // Ждут решения только те, на кого правило распространяется.
    const ждут = invoices.filter((счёт) => счёт.approvalRequired && !счёт.approvalStatus).length;

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
        <DashboardCard
            icon={<FileInput size={14} />}
            title="Входящие счета"
            badge={ждут > 0 && (
                <span className={`${nova.chip} ${nova.chipWarn}`}>{ждут} {ждутСловом(ждут)} согласования</span>
            )}
            hint={ждут === 0
                ? 'Что пришло и что ещё не оплачено.'
                : согласует
                    ? 'Пока вы не согласовали, оплатить счёт бухгалтерия не может.'
                    : 'Оплачивать можно только согласованные финотделом.'}
        >
            {loading ? (
                <DashboardCard.Center><Loader /></DashboardCard.Center>
            ) : список.length === 0 ? (
                <DashboardCard.Center>Новых счетов нет</DashboardCard.Center>
            ) : (
                <div className={styles.list}>
                    {список.map((счёт) => {
                        const просрочен = счёт.dueDate && dayjs(счёт.dueDate).isBefore(dayjs(), 'day');
                        const ждётРешения = счёт.approvalRequired && !счёт.approvalStatus;
                        return (
                            <div key={счёт.id} className={styles.item}>
                                <div className={styles.top}>
                                    <button
                                        type="button"
                                        className={styles.title}
                                        onClick={() => router.push(`/company/accounting/invoices/${счёт.id}`)}
                                    >
                                        Счёт № {счёт.number}
                                    </button>
                                    <span className={styles.amount}>{money(счёт.balanceDue, счёт.currency)}</span>
                                </div>
                                <div className={styles.meta}>
                                    {счёт.supplier?.name ?? 'контрагент не указан'}
                                    {` · от ${dayjs(счёт.documentDate).format('DD.MM.YYYY')}`}
                                    {счёт.dueDate && (
                                        <span className={просрочен ? styles.late : undefined}>
                                            {` · оплатить до ${dayjs(счёт.dueDate).format('DD.MM.YYYY')}`}
                                            {просрочен ? ' — просрочен' : ''}
                                        </span>
                                    )}
                                </div>
                                {счёт.approvalStatus === 'APPROVED' && (
                                    <div className={styles.statusPos}>
                                        Согласовано
                                        {счёт.approvedBy
                                            ? ` — ${счёт.approvedBy.firstName} ${счёт.approvedBy.lastName}`
                                            : ''}
                                    </div>
                                )}
                                {счёт.approvalStatus === 'REJECTED' && (
                                    <div className={styles.statusNeg}>
                                        Не согласовано{счёт.approvalNote ? `: ${счёт.approvalNote}` : ''}
                                    </div>
                                )}

                                {ждётРешения && согласует && (
                                    <div className={styles.actions}>
                                        <Button
                                            size="sm"
                                            disabled={busy === счёт.id}
                                            onClick={() => решить(счёт, 'APPROVED')}
                                        >
                                            {busy === счёт.id
                                                ? <Loader2 className={`h-3.5 w-3.5 ${styles.spin}`} />
                                                : <Check className="h-3.5 w-3.5" />}
                                            Согласовано
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-destructive"
                                            onClick={() => { setОтказ(счёт); setПричина(''); }}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                            Не согласовано
                                        </Button>
                                    </div>
                                )}
                                {ждётРешения && !согласует && (
                                    <div className={styles.actions}>
                                        <span className={`${nova.chip} ${nova.chipWarn}`}>ждёт финотдел</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
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
        </DashboardCard>
    );
}

/** «1 ждёт», «21 ждёт», но «2 ждут», «11 ждут». */
function ждутСловом(n: number): string {
    return n % 10 === 1 && n % 100 !== 11 ? 'ждёт' : 'ждут';
}
