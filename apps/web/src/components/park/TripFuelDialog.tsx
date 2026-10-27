'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Check, Fuel, Loader2, Paperclip, Trash2, X } from 'lucide-react';
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

/** Подпись выдачи: заметка без служебного «… по запросу водителя» — это и так видно. */
const заметка = (note: string | null) => note?.replace(/^(Топливо|Аванс|Предоплата) по запросу водителя\.?\s*/, '').trim() || null;

const RECEIPT_TEXT: Record<'PENDING' | 'ACCEPTED' | 'REJECTED', { label: string; cls: string }> = {
    PENDING: { label: 'Ждёт проверки', cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    ACCEPTED: { label: 'Принят', cls: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' },
    REJECTED: { label: 'Отклонён', cls: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
};

/**
 * Топливо и предоплата по рейсу водителя парка (решение владельца 12.10.2026,
 * шеф 27.10.2026).
 *
 * Водитель на заправке звонит менеджеру; тот оплачивает сам или переводит
 * деньги — и отмечает здесь выдачу. Без запроса водителя парк выдаёт и
 * предоплату — водитель видит её в приложении. Чек пробивают на БИН парка,
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
    const [kind, setKind] = useState<'FUEL' | 'ADVANCE'>('FUEL');
    const [method, setMethod] = useState<'STATION' | 'TO_DRIVER'>('STATION');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null);
    const [rejecting, setRejecting] = useState<string | null>(null);
    const [reason, setReason] = useState('');
    // Чек, который парк прикрепляет сам: файл и сумма из чека.
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [receiptAmount, setReceiptAmount] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(() => {
        if (!orderId) return;
        setFailed(null);
        api.get(`/exchange/park/trips/${orderId}/fuel`)
            .then((r) => setFuel(r.data))
            .catch((e) => setFailed(ответСервера(e, 'Не удалось загрузить топливо по рейсу')));
    }, [orderId]);

    useEffect(() => {
        if (!open) return;
        setFuel(null); setAmount(''); setNote(''); setKind('FUEL'); setMethod('STATION'); setPhoto(null); setRejecting(null);
        setReceiptFile(null); setReceiptAmount('');
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
        if (!(value > 0)) { toast.error('Впишите сумму'); return; }
        setBusy('issue');
        try {
            // Предоплату водителю только переводят — на заправке её не платят.
            const how = kind === 'ADVANCE' ? 'TO_DRIVER' : method;
            const { data } = await api.post(`/exchange/park/trips/${orderId}/fuel/issues`, { amount: value, method: how, kind, note: note.trim() || undefined });
            setAmount(''); setNote('');
            applied(data, kind === 'ADVANCE' ? `Записали предоплату ${moneyShort(value)}` : `Записали: ${METHOD_TEXT[method].toLowerCase()} ${moneyShort(value)}`);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось записать'));
        } finally {
            setBusy(null);
        }
    };

    /** Парк сам прикрепляет чек — водитель отдал его после рейса или чек пришёл с заправки. */
    const addReceipt = async () => {
        const value = Number(parseMoneyInput(receiptAmount));
        if (!receiptFile) { toast.error('Выберите фото или файл чека'); return; }
        if (!(value > 0)) { toast.error('Впишите сумму из чека'); return; }
        setBusy('receipt');
        try {
            const form = new FormData();
            form.append('file', receiptFile);
            form.append('amount', String(value));
            const { data } = await api.post(`/exchange/park/trips/${orderId}/fuel/receipts`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setReceiptFile(null); setReceiptAmount('');
            if (fileRef.current) fileRef.current.value = '';
            applied(data, `Чек на ${moneyShort(value)} прикреплён`);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось прикрепить чек'));
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
                    <DialogTitle className="flex items-center gap-2 text-[15px]"><Fuel className="h-4 w-4" /> Топливо и предоплата · рейс {orderNumber ?? fuel?.orderNumber ?? ''}</DialogTitle>
                    <DialogDescription className="text-[12.5px]">
                        Выдачи водителю и его чеки. Чек — на БИН парка.
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
                            <h3 className="m-0 text-[13px] font-semibold">Выдано водителю</h3>
                            {fuel.issued.items.length + (fuel.advances?.items.length ?? 0) === 0 && <p className="m-0 text-[12.5px] text-muted-foreground">Пока ничего не выдано.</p>}
                            {/* Топливо и предоплата одним списком по времени; у каждой — по запросу водителя или без. */}
                            {[
                                ...fuel.issued.items.map((i) => ({ ...i, вид: 'Топливо' })),
                                ...(fuel.advances?.items ?? []).map((i) => ({ ...i, вид: 'Предоплата' })),
                            ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((i) => (
                                <div key={i.id} className="flex items-center gap-3 rounded-lg border border-solid border-border px-3 py-2">
                                    <div className="flex-1">
                                        <div className="font-semibold tabular-nums">{i.вид} · {moneyShort(i.amount)}</div>
                                        <div className="text-[12px] text-muted-foreground">
                                            {[METHOD_TEXT[i.method], dayjs(i.createdAt).format('DD.MM HH:mm'), i.byRequest ? 'по запросу водителя' : 'без запроса', заметка(i.note)].filter(Boolean).join(' · ')}
                                        </div>
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
                                        {(['FUEL', 'ADVANCE'] as const).map((k) => (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => setKind(k)}
                                                className={cn(
                                                    'cursor-pointer rounded-full border border-solid px-3 py-1 text-[12.5px] font-medium [font-family:inherit]',
                                                    kind === k ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground',
                                                )}
                                            >
                                                {k === 'FUEL' ? 'Топливо' : 'Предоплата'}
                                            </button>
                                        ))}
                                    </div>
                                    {kind === 'FUEL' && <div className="flex flex-wrap gap-2">
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
                                    </div>}
                                    <div className="flex flex-wrap gap-2">
                                        <Input
                                            aria-label={kind === 'ADVANCE' ? 'Сумма предоплаты' : 'Сумма на топливо'}
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
                            <h3 className="m-0 text-[13px] font-semibold">Чеки</h3>
                            {fuel.receipts.items.length === 0 && <p className="m-0 text-[12.5px] text-muted-foreground">Чеков пока нет.</p>}
                            {fuel.receipts.items.map((r) => (
                                <div key={r.id} className="space-y-2 rounded-lg border border-solid border-border px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex-1">
                                            <div className="font-semibold tabular-nums">{moneyShort(r.amount)}</div>
                                            <div className="text-[12px] text-muted-foreground">{r.byPark ? 'прикрепил парк' : 'прислал водитель'} {dayjs(r.createdAt).format('DD.MM HH:mm')}</div>
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
                            {/* Водитель заправился после рейса и отдал чек — парк прикрепляет сам. */}
                            {!fuel.locked && (
                                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3">
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/*,application/pdf"
                                        className="hidden"
                                        aria-label="Файл чека"
                                        onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                                    />
                                    <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                                        <Paperclip className="h-3.5 w-3.5" /> {receiptFile ? 'Другой файл' : 'Фото чека'}
                                    </Button>
                                    {receiptFile && <span className="max-w-[180px] truncate text-[12px] text-muted-foreground">{receiptFile.name}</span>}
                                    <Input
                                        aria-label="Сумма по чеку"
                                        value={receiptAmount}
                                        onChange={(e) => setReceiptAmount(formatMoneyInput(e.target.value))}
                                        inputMode="numeric"
                                        placeholder="Сумма по чеку, ₸"
                                        className="h-9 w-44 text-[13px] tabular-nums"
                                    />
                                    <Button onClick={addReceipt} disabled={busy === 'receipt'}>
                                        {busy === 'receipt' && <Loader2 className="h-4 w-4 animate-spin" />} Прикрепить чек
                                    </Button>
                                </div>
                            )}
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
