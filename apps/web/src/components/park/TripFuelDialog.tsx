'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, Fuel, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoneyInput, moneyShort, parseMoneyInput } from '@/lib/money-format';
import { ParkTripFuel, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const METHOD_TEXT: Record<'STATION' | 'TO_DRIVER', string> = {
    STATION: 'Оплатили на заправке',
    TO_DRIVER: 'Перевели водителю',
};

const RECEIPT_TEXT: Record<'PENDING' | 'ACCEPTED' | 'REJECTED', { label: string; cls: string }> = {
    PENDING: { label: 'Ждёт проверки', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    ACCEPTED: { label: 'Принят', cls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
    REJECTED: { label: 'Отклонён', cls: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
};

/**
 * Топливо рейса водителя парка (решение владельца 12.10.2026).
 *
 * Водитель на заправке звонит менеджеру; тот оплачивает сам или переводит
 * деньги — и отмечает здесь «дали на топливо». Чек пробивают на БИН парка,
 * водитель присылает фото с суммой; здесь его принимают (можно поправить
 * сумму) или отклоняют с причиной — водитель её увидит. Внизу — сколько
 * перечислить водителю в конце: итог минус всё, что дали на топливо.
 */
export function TripFuelDialog({ orderId, orderNumber, open, onOpenChange, onChanged }: {
    orderId: string | null;
    orderNumber?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChanged?: () => void;
}) {
    const [fuel, setFuel] = useState<ParkTripFuel | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<'STATION' | 'TO_DRIVER'>('STATION');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
    const [rejecting, setRejecting] = useState<string | null>(null);
    const [reason, setReason] = useState('');

    const load = useCallback(() => {
        if (!orderId) return;
        setFailed(null);
        api.get(`/exchange/park/trips/${orderId}/fuel`)
            .then((r) => setFuel(r.data))
            .catch((e) => setFailed(ответСервера(e, 'Не удалось загрузить топливо по рейсу')));
    }, [orderId]);

    useEffect(() => {
        if (!open) return;
        setFuel(null); setAmount(''); setNote(''); setMethod('STATION'); setPhoto(null); setRejecting(null);
        load();
    }, [open, load]);

    // Фото чека отдаёт только сервер и только парку — берём файлом, показываем здесь же.
    useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

    const applied = (data: ParkTripFuel, message: string) => {
        setFuel(data);
        toast.success(message);
        onChanged?.();
    };

    const addIssue = async () => {
        const value = Number(parseMoneyInput(amount));
        if (!(value > 0)) { toast.error('Впишите сумму, которую дали на топливо'); return; }
        setBusy('issue');
        try {
            const { data } = await api.post(`/exchange/park/trips/${orderId}/fuel/issues`, { amount: value, method, note: note.trim() || undefined });
            setAmount(''); setNote('');
            applied(data, `Записали: ${METHOD_TEXT[method].toLowerCase()} ${moneyShort(value)}`);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось записать'));
        } finally {
            setBusy(null);
        }
    };

    const removeIssue = async (id: string) => {
        setBusy(id);
        try {
            const { data } = await api.delete(`/exchange/park/fuel-issues/${id}`);
            applied(data, 'Запись убрана');
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось убрать'));
        } finally {
            setBusy(null);
        }
    };

    const decide = async (id: string, accept: boolean, fixedAmount?: number) => {
        if (!accept && !reason.trim()) { toast.error('Напишите, почему чек не подходит, — водитель увидит причину'); return; }
        setBusy(id);
        try {
            const { data } = await api.put(`/exchange/park/fuel-receipts/${id}/decision`, accept
                ? { accept: true, ...(fixedAmount ? { amount: fixedAmount } : {}) }
                : { accept: false, reason: reason.trim() });
            setRejecting(null); setReason('');
            applied(data, accept ? 'Чек принят' : 'Чек отклонён — водитель увидит причину');
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить решение'));
        } finally {
            setBusy(null);
        }
    };

    const showPhoto = async (id: string) => {
        setBusy(`photo:${id}`);
        try {
            const r = await api.get(`/exchange/park/fuel-receipts/${id}/file`, { responseType: 'blob' });
            if (photo) URL.revokeObjectURL(photo.url);
            setPhoto({ id, url: URL.createObjectURL(r.data) });
        } catch {
            toast.error('Не удалось открыть фото чека');
        } finally {
            setBusy(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-[15px]"><Fuel className="h-4 w-4" /> Топливо по рейсу {orderNumber ?? fuel?.orderNumber ?? ''}</DialogTitle>
                    <DialogDescription className="text-[12.5px]">
                        Отмечайте, сколько дали на топливо, и принимайте чеки водителя — чек должен быть на БИН парка.
                    </DialogDescription>
                </DialogHeader>

                {failed ? (
                    <div className="rounded-lg bg-muted/60 px-3 py-6 text-center text-[13px] text-muted-foreground">{failed}</div>
                ) : !fuel ? (
                    <div className="h-40 animate-pulse rounded-lg bg-muted/60" />
                ) : (
                    <div className="space-y-4 text-[13px]">
                        <div className="grid gap-2 sm:grid-cols-4">
                            <Stat label={fuel.scheme === 2 ? 'На руки (без топлива)' : 'Договорились, на руки'} value={fuel.driverTotal != null ? moneyShort(fuel.driverTotal) : '—'} />
                            <Stat
                                label="Лимит на топливо"
                                value={fuel.fuelEstimate ? moneyShort(fuel.fuelEstimate) : '—'}
                                hint={fuel.distanceKm ? `≈ ${Math.round(fuel.distanceKm).toLocaleString('ru-RU')} км${fuel.fuelLiters ? ` · ≈ ${fuel.fuelLiters.toLocaleString('ru-RU')} л` : ''}` : undefined}
                            />
                            <Stat label="Дали на топливо" value={moneyShort(fuel.issued.total)} hint={`чеков принято на ${moneyShort(fuel.receipts.accepted)}`} />
                            <Stat label="Перечислить в конце" value={fuel.toPay != null ? moneyShort(fuel.toPay) : '—'} strong />
                        </div>
                        {fuel.receipts.pending > 0 && (
                            <div className="rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                                Чеки на {moneyShort(fuel.receipts.pending)} ждут вашей проверки — примите их, чтобы они засчитались в топливо.
                            </div>
                        )}
                        {/* Тревожно — только то, на что чека нет вовсе: ждущие проверки — не в счёт. */}
                        {fuel.issued.total - fuel.receipts.accepted - fuel.receipts.pending > 0 && (
                            <div className="rounded-lg border border-solid border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                На {moneyShort(fuel.issued.total - fuel.receipts.accepted - fuel.receipts.pending)} денег на топливо чека нет —{' '}
                                {fuel.scheme === 2 ? 'эта сумма вычтется из выплаты водителю.' : 'с этой суммы при выплате удержится налог как с оплаты водителю.'}
                            </div>
                        )}
                        {(fuel.ownMoney ?? 0) > 0 && (
                            <div className="rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                                Чеков на {moneyShort(fuel.ownMoney ?? 0)} больше, чем дали: водитель заправлялся за свои — эта сумма вернётся ему в выплате.
                            </div>
                        )}
                        {/* Лимит — топливо по километражу: расход сверх него налоговая сверяет с пробегом. */}
                        {!!fuel.fuelEstimate && fuel.receipts.accepted + fuel.receipts.pending > fuel.fuelEstimate && (
                            <div className="rounded-lg border border-solid border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                Чеки сверх лимита на топливо: {moneyShort(fuel.receipts.accepted + fuel.receipts.pending - fuel.fuelEstimate)}.
                            </div>
                        )}
                        {(fuel.advances?.total ?? 0) > 0 && (
                            <div className="rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">
                                Предоплата водителю: {moneyShort(fuel.advances?.total ?? 0)} — удерживается из выплаты, чек не нужен.
                            </div>
                        )}
                        {fuel.locked && (
                            <div className="rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] text-muted-foreground">Водитель запросил выплату — топливо по рейсу закрыто, суммы вошли в выплату.</div>
                        )}

                        <section className="space-y-2">
                            <h3 className="m-0 text-[13px] font-semibold">Дали на топливо</h3>
                            {fuel.issued.items.length === 0 && <p className="m-0 text-[12.5px] text-muted-foreground">Пока ничего не отмечено.</p>}
                            {/* Предоплата — тем же списком, но подписана: чек на неё не нужен. */}
                            {[...fuel.issued.items, ...(fuel.advances?.items ?? []).map((i) => ({
                                ...i,
                                note: i.note?.startsWith('Предоплата') ? `${i.note} — из суммы на руки` : ['Предоплата из суммы на руки', i.note].filter(Boolean).join(' · '),
                            }))].map((i) => (
                                <div key={i.id} className="flex items-center gap-3 rounded-lg border border-solid border-border px-3 py-2">
                                    <div className="flex-1">
                                        <div className="font-semibold tabular-nums">{moneyShort(i.amount)}</div>
                                        <div className="text-[12px] text-muted-foreground">{METHOD_TEXT[i.method]} · {dayjs(i.createdAt).format('DD.MM HH:mm')}{i.note ? ` · ${i.note}` : ''}</div>
                                    </div>
                                    {!fuel.locked && (
                                        <Button variant="ghost" size="icon" aria-label="Убрать запись" disabled={busy === i.id} onClick={() => removeIssue(i.id)}>
                                            {busy === i.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        </Button>
                                    )}
                                </div>
                            ))}
                            {!fuel.locked && (
                                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                                    <div className="flex flex-wrap gap-2">
                                        {(['STATION', 'TO_DRIVER'] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setMethod(m)}
                                                className={cn(
                                                    'cursor-pointer rounded-full border border-solid px-3 py-1 text-[12.5px] [font-family:inherit]',
                                                    method === m ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground',
                                                )}
                                            >
                                                {METHOD_TEXT[m]}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Input
                                            aria-label="Сумма на топливо"
                                            value={amount}
                                            onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                                            inputMode="numeric"
                                            placeholder="Сумма, ₸"
                                            className="h-9 w-40 text-[13px] tabular-nums"
                                        />
                                        <Input
                                            aria-label="Примечание"
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            placeholder="Примечание — необязательно"
                                            className="h-9 min-w-[160px] flex-1 text-[13px]"
                                        />
                                        <Button onClick={addIssue} disabled={busy === 'issue'}>
                                            {busy === 'issue' && <Loader2 className="h-4 w-4 animate-spin" />} Записать
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="space-y-2">
                            <h3 className="m-0 text-[13px] font-semibold">Чеки водителя</h3>
                            {fuel.receipts.items.length === 0 && <p className="m-0 text-[12.5px] text-muted-foreground">Водитель ещё не присылал чеков.</p>}
                            {fuel.receipts.items.map((r) => (
                                <div key={r.id} className="space-y-2 rounded-lg border border-solid border-border px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex-1">
                                            <div className="font-semibold tabular-nums">{moneyShort(r.amount)}</div>
                                            <div className="text-[12px] text-muted-foreground">прислан {dayjs(r.createdAt).format('DD.MM HH:mm')}</div>
                                            {r.status === 'REJECTED' && r.rejectReason && <div className="text-[12px] text-destructive">{r.rejectReason}</div>}
                                        </div>
                                        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', RECEIPT_TEXT[r.status].cls)}>{RECEIPT_TEXT[r.status].label}</span>
                                        <Button variant="outline" size="sm" disabled={busy === `photo:${r.id}`} onClick={() => showPhoto(r.id)}>
                                            {busy === `photo:${r.id}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Фото
                                        </Button>
                                        {r.status === 'PENDING' && !fuel.locked && (
                                            <>
                                                <Button size="sm" disabled={busy === r.id} onClick={() => decide(r.id, true)}>
                                                    <Check className="h-3.5 w-3.5" /> Принять
                                                </Button>
                                                <Button variant="outline" size="sm" className="text-destructive" onClick={() => { setRejecting(r.id); setReason(''); }}>
                                                    <X className="h-3.5 w-3.5" /> Отклонить
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                    {photo?.id === r.id && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={photo.url} alt={`Чек на ${moneyShort(r.amount)}`} className="max-h-[420px] w-full rounded-lg object-contain" />
                                    )}
                                    {rejecting === r.id && (
                                        <div className="flex flex-wrap gap-2">
                                            <Input
                                                aria-label="Причина"
                                                value={reason}
                                                onChange={(e) => setReason(e.target.value)}
                                                placeholder="Например: чек не на БИН парка"
                                                className="h-9 min-w-[200px] flex-1 text-[13px]"
                                            />
                                            <Button variant="destructive" size="sm" disabled={busy === r.id} onClick={() => decide(r.id, false)}>Отклонить</Button>
                                            <Button variant="ghost" size="sm" onClick={() => setRejecting(null)}>Отмена</Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </section>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
    return (
        <div className="rounded-lg border border-solid border-border px-3 py-2">
            <div className="text-[11.5px] text-muted-foreground">{label}</div>
            <div className={cn('tabular-nums', strong ? 'text-[16px] font-bold' : 'text-[14px] font-semibold')}>{value}</div>
            {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
    );
}
