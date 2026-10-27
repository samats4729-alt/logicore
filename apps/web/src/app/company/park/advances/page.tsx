'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Fuel, Loader2, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера, телефонКрасиво } from '@/lib/exchange';
import { ADVANCE_KIND, ADVANCE_STATUS, type AdvanceRequest } from '@/lib/advance-requests';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import styles from '@/components/nova/nova.module.css';

type Action = 'APPROVE' | 'CHECK' | 'REUPLOAD' | 'REJECT';

const ACTION: Record<Action, { title: string; button: string; note: string; required: boolean }> = {
    APPROVE: { title: 'Выдать', button: 'Выдать', note: 'Комментарий для водителя (необязательно)', required: false },
    CHECK: { title: 'На доп. проверку', button: 'Отправить на проверку', note: 'Что проверяете (необязательно) — водитель увидит', required: false },
    REUPLOAD: { title: 'Перезагрузить документы', button: 'Попросить перезагрузить', note: 'Какие документы перезагрузить и почему', required: true },
    REJECT: { title: 'Отказать', button: 'Отказать', note: 'Причина — водитель увидит её в приложении', required: true },
};

const тенге = (v: number) => `${v.toLocaleString('ru-RU')} ₸`;

/**
 * Запросы водителей парка на топливо и аванс (задачи шефа, Q17).
 *
 * Водитель в рейсе просит часть денег заранее — не больше доли от суммы за
 * рейс, что задана в «Выплатах» (по умолчанию 50 %). Бухгалтер смотрит рейс,
 * накладную и подтверждение получателя и решает. Выданное ложится в
 * «дали на топливо» по рейсу и вычитается из выплаты в конце.
 */
export default function ParkAdvancesPage() {
    const [scope, setScope] = useState<'open' | 'all'>('open');
    const [rows, setRows] = useState<AdvanceRequest[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [deciding, setDeciding] = useState<{ row: AdvanceRequest; action: Action } | null>(null);
    const [note, setNote] = useState('');
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<'TO_DRIVER' | 'STATION'>('TO_DRIVER');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get<AdvanceRequest[]>('/exchange/park/advances', { params: { scope } });
            setRows(data);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [scope]);

    useEffect(() => { setRows(null); void load(); }, [load]);

    const open = (row: AdvanceRequest, action: Action) => {
        setDeciding({ row, action });
        setNote('');
        setAmount(String(row.amount));
        setMethod('TO_DRIVER');
    };

    const submit = async () => {
        if (!deciding) return;
        const spec = ACTION[deciding.action];
        if (spec.required && !note.trim()) { toast.warning(spec.note); return; }
        setSaving(true);
        try {
            await api.post(`/exchange/park/advances/${deciding.row.id}/decide`, {
                action: deciding.action,
                note: note.trim() || undefined,
                ...(deciding.action === 'APPROVE' ? { amount: amount.replace(/\s/g, ''), method } : {}),
            });
            toast.success(deciding.action === 'APPROVE' ? 'Выдано — сумма вычтется из выплаты за рейс' : 'Решение сохранено, водитель увидит его в приложении');
            setDeciding(null);
            void load();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить решение'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Управление парком</div>
                    <h1 className={styles.title}>Запросы водителей</h1>
                    <p className={styles.subtitle}>
                        Топливо — в пределах лимита по километражу, предоплата — до доли от суммы на руки (задаётся в «Выплатах
                        водителям»). Выданное удерживается из выплаты.
                    </p>
                </div>
            </div>

            <div className={cn(styles.pills, 'mb-3')} role="tablist" aria-label="Какие запросы">
                {([['open', 'Ждут решения'], ['all', 'Все']] as const).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={scope === key}
                        onClick={() => setScope(key)}
                        className={cn(styles.pill, scope === key && styles.pillActive)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Fuel size={14} />
                    <h2 className={styles.cardTitle}>Запросы</h2>
                    {rows && <span className={styles.cardCount}>{rows.length}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить запросы — обновите страницу.</div>
                ) : !rows ? (
                    <div className="space-y-2 p-4" aria-label="Загрузка">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />)}</div>
                ) : rows.length === 0 ? (
                    <div className={styles.empty}>
                        {scope === 'open' ? 'Новых запросов нет. Когда водитель попросит на топливо или предоплату, запрос появится здесь.' : 'Запросов ещё не было.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table className="border-collapse text-[13px]">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9">Водитель</TableHead>
                                    <TableHead className="h-9">Рейс</TableHead>
                                    <TableHead className="h-9">Что</TableHead>
                                    <TableHead className="h-9 text-right">Сумма</TableHead>
                                    <TableHead className="h-9">Статус</TableHead>
                                    <TableHead className="h-9">Когда</TableHead>
                                    <TableHead className="h-9 w-[1%]" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r) => {
                                    const st = ADVANCE_STATUS[r.status] ?? { label: r.status, tone: 'muted' as const };
                                    const decidable = ['REQUESTED', 'CHECK', 'REUPLOAD'].includes(r.status);
                                    return (
                                        <TableRow key={r.id} className="border-0 border-b border-solid border-border align-top">
                                            <TableCell className="py-2.5">
                                                <Link href={`/company/park/drivers/${r.driver.id}`} className="font-semibold text-foreground">{r.driver.name}</Link>
                                                {r.driver.phone && (
                                                    <a href={`tel:${r.driver.phone}`} className="flex items-center gap-1 text-[12px] text-muted-foreground">
                                                        <Phone className="h-3 w-3" /> <span className="tabular-nums">{телефонКрасиво(r.driver.phone)}</span>
                                                    </a>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <Link href={`/company/orders/${r.orderId}?tab=documents`} className="tabular-nums">{r.orderNumber}</Link>
                                                <div className="text-[12px] text-muted-foreground">накладная и документы — в рейсе</div>
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                {ADVANCE_KIND[r.kind]}
                                                {r.comment && <div className="max-w-[260px] truncate text-[12px] text-muted-foreground" title={r.comment}>«{r.comment}»</div>}
                                            </TableCell>
                                            <TableCell className="py-2.5 text-right font-semibold tabular-nums">
                                                {тенге(r.amount)}
                                                {r.issuedAmount != null && r.issuedAmount !== r.amount && (
                                                    <div className="text-[12px] font-normal text-muted-foreground">выдано {тенге(r.issuedAmount)}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <span className={cn(styles.chip, st.tone === 'warn' && styles.chipWarn, st.tone === 'neg' && styles.chipNeg)}>{st.label}</span>
                                                {r.parkNote && <div className="max-w-[260px] text-[12px] text-muted-foreground">{r.parkNote}</div>}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap py-2.5 text-[12.5px] text-muted-foreground">{dayjs(r.createdAt).format('DD.MM HH:mm')}</TableCell>
                                            <TableCell className="py-2">
                                                {decidable && (
                                                    <div className="flex flex-nowrap justify-end gap-1.5 whitespace-nowrap">
                                                        <Button size="sm" onClick={() => open(r, 'APPROVE')}>Выдать</Button>
                                                        {r.status !== 'CHECK' && <Button size="sm" variant="outline" onClick={() => open(r, 'CHECK')}>На доп. проверку</Button>}
                                                        <Button size="sm" variant="outline" onClick={() => open(r, 'REUPLOAD')}>Перезагрузить документы</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => open(r, 'REJECT')}>Отказать</Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>

            <Dialog open={!!deciding} onOpenChange={(o) => { if (!o) setDeciding(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">
                            {deciding && `${ACTION[deciding.action].title}: ${deciding.row.driver.name}, ${ADVANCE_KIND[deciding.row.kind].toLowerCase()}`}
                        </DialogTitle>
                    </DialogHeader>
                    {deciding && (
                        <div className="space-y-3 text-[13px]">
                            <p className="m-0 text-muted-foreground">
                                Рейс {deciding.row.orderNumber}, просит {тенге(deciding.row.amount)}.
                            </p>
                            {deciding.action === 'APPROVE' && (
                                <>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-[12px] font-medium text-muted-foreground">Сколько выдать, ₸</span>
                                        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="h-9 text-[13px] tabular-nums" />
                                    </label>
                                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Как выдали">
                                        {([['TO_DRIVER', 'Перевели водителю'], ['STATION', 'Оплатили на заправке']] as const).map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                role="radio"
                                                aria-checked={method === key}
                                                onClick={() => setMethod(key)}
                                                className={`rounded-full border border-solid px-3 py-1 text-[12px] ${method === key ? 'border-foreground bg-foreground text-background' : 'border-border bg-background'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                            <textarea
                                aria-label={ACTION[deciding.action].note}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder={ACTION[deciding.action].note}
                                rows={2}
                                maxLength={500}
                                className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setDeciding(null)}>Отмена</Button>
                                <Button variant={deciding.action === 'REJECT' ? 'destructive' : 'default'} onClick={submit} disabled={saving}>
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {ACTION[deciding.action].button}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
