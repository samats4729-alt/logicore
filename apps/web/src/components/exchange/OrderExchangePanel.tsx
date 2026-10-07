'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Loader2, Send, Store, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoneyInput, moneyShort, parseMoneyInput } from '@/lib/money-format';
import { ExchangeOrderState, exchangeEnabled, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RoutePricesPanel } from './RoutePricesPanel';
import OffersList from './OffersList';
import nova from '@/components/nova/nova.module.css';

/** Частые причины снять — одним нажатием. Своя — словами в поле. */
const CLOSE_REASONS = ['Нашли исполнителя сами', 'Клиент отменил перевозку', 'Перенесли на другой день'];

/**
 * Биржа в карточке заявки.
 *
 * Пока у заявки нет исполнителя, её можно выставить на биржу: перевозчики,
 * водители с ИП и водители парков увидят её и предложат цену. Выставлена —
 * видно, с какого времени и за сколько, и можно снять. Если выставить
 * нельзя (исполнитель уже есть, заявка в работе), блок не показывается
 * вовсе: лишняя серая плашка в карточке рейса только мешает.
 */
export default function OrderExchangePanel({ orderId, reloadKey, onChanged }: { orderId: string; reloadKey?: unknown; onChanged?: () => void }) {
    const [state, setState] = useState<ExchangeOrderState | null>(null);
    const [publishOpen, setPublishOpen] = useState(false);
    const [closeOpen, setCloseOpen] = useState(false);

    const load = useCallback(() => {
        exchangeEnabled().then((on) => {
            if (!on) return;
            api.get(`/exchange/orders/${orderId}`).then((r) => setState(r.data)).catch(() => setState(null));
        });
    }, [orderId]);

    useEffect(() => { load(); }, [load, reloadKey]);

    if (!state || (!state.onExchange && !state.canPublish)) return null;

    return (
        <section className={nova.card} aria-label="Биржа">
            <div className={nova.cardHead}>
                <Store size={14} />
                <h3 className={nova.cardTitle}>Биржа</h3>
            </div>
            <div className={`${nova.cardBody} flex flex-wrap items-center justify-between gap-3`}>
                {state.onExchange ? (
                    <>
                        <div className="text-[13px]">
                            <div className="font-semibold">
                                На бирже с {dayjs(state.publishedAt).format('DD.MM HH:mm')} · за {moneyShort(state.price ?? 0)}
                            </div>
                            <div className="mt-0.5 text-[12px] text-muted-foreground">
                                Её видят перевозчики и водители. Выберите исполнителя из откликов ниже.
                            </div>
                        </div>
                        <Button variant="outline" className="text-destructive" onClick={() => setCloseOpen(true)}>
                            <X className="h-4 w-4" /> Снять с биржи
                        </Button>
                    </>
                ) : (
                    <>
                        <div className="text-[13px]">
                            <div className="font-semibold">Исполнителя нет — найдите его на бирже</div>
                            <div className="mt-0.5 text-[12px] text-muted-foreground">
                                {state.closedAt
                                    ? `Снята с биржи ${dayjs(state.closedAt).format('DD.MM HH:mm')}${state.closeReason ? ` — ${state.closeReason}` : ''}. Можно выставить снова.`
                                    : 'Перевозчики и водители увидят заявку и предложат цену, а вы выберете, кто повезёт.'}
                            </div>
                        </div>
                        <Button onClick={() => setPublishOpen(true)}>
                            <Send className="h-4 w-4" /> Выставить на биржу
                        </Button>
                    </>
                )}
            </div>

            {state.onExchange && (
                <div className={nova.cardBody} style={{ paddingTop: 0 }}>
                    <OffersList orderId={orderId} onAccepted={() => { load(); onChanged?.(); }} />
                </div>
            )}

            <PublishDialog state={state} open={publishOpen} onOpenChange={setPublishOpen} onDone={setState} />
            <CloseDialog state={state} open={closeOpen} onOpenChange={setCloseOpen} onDone={setState} />
        </section>
    );
}

/** Выставить: цена для исполнителя (с подсказкой, почём возили) и примечание. */
function PublishDialog({ state, open, onOpenChange, onDone }: {
    state: ExchangeOrderState;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDone: (state: ExchangeOrderState) => void;
}) {
    const [price, setPrice] = useState('');
    const [note, setNote] = useState('');
    const [tried, setTried] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPrice(state.price ? String(state.price) : state.suggestedPrice ? String(state.suggestedPrice) : '');
        setNote(state.note ?? '');
        setTried(false);
    }, [open, state]);

    const amount = Number(parseMoneyInput(price));
    const priceError = tried && !(amount > 0) ? 'Укажите цену — исполнители будут соглашаться на неё или предлагать свою' : null;

    const submit = async () => {
        setTried(true);
        if (!(amount > 0)) return;
        setSaving(true);
        try {
            const { data } = await api.post(`/exchange/orders/${state.orderId}/publish`, { price: amount, note: note.trim() || undefined });
            toast.success(`Заявка ${state.orderNumber} на бирже`);
            onOpenChange(false);
            onDone(data);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось выставить заявку'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">Выставить заявку {state.orderNumber} на биржу</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <label className="flex flex-col gap-1">
                        <span className={`text-[12px] font-medium ${priceError ? 'text-destructive' : 'text-muted-foreground'}`}>
                            Сколько платите исполнителю, ₸
                        </span>
                        <Input
                            aria-label="Цена для исполнителя"
                            value={formatMoneyInput(parseMoneyInput(price))}
                            onChange={(e) => setPrice(parseMoneyInput(e.target.value).replace(/[^\d.]/g, ''))}
                            placeholder="Сумма в тенге"
                            inputMode="numeric"
                            className="h-10 text-[15px] font-semibold tabular-nums placeholder:font-normal"
                        />
                        {priceError && <span role="alert" className="text-[12px] text-destructive">{priceError}</span>}
                    </label>
                    {state.from && state.to && (
                        <RoutePricesPanel origin={state.from} destination={state.to} onUse={(p) => setPrice(String(p))} />
                    )}
                    <label className="flex flex-col gap-1">
                        <span className="text-[12px] font-medium text-muted-foreground">
                            Что ещё важно исполнителю <span className="font-normal opacity-70">· необязательно</span>
                        </span>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Например: растентовка сбоку, ремни 10 шт, оплата через 5 дней по оригиналам"
                            rows={3}
                            className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                        />
                    </label>
                    <p className="m-0 text-[12px] text-muted-foreground">
                        На бирже будут видны города маршрута, даты, груз, кузов, цена и это примечание. Адреса, названия
                        складов и ваш заказчик — нет: их увидит только исполнитель, которого вы выберете.
                    </p>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
                    <Button onClick={submit} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Выставить
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Снять с биржи — с причиной: через месяц никто не вспомнит, почему снимали. */
function CloseDialog({ state, open, onOpenChange, onDone }: {
    state: ExchangeOrderState;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDone: (state: ExchangeOrderState) => void;
}) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (open) setReason(''); }, [open]);

    const submit = async () => {
        if (!reason.trim()) {
            toast.error('Напишите, почему снимаете заявку с биржи');
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.post(`/exchange/orders/${state.orderId}/unpublish`, { reason: reason.trim() });
            toast.success(`Заявка ${state.orderNumber} снята с биржи`);
            onOpenChange(false);
            onDone(data);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось снять заявку'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">Снять заявку {state.orderNumber} с биржи?</DialogTitle>
                </DialogHeader>
                <p className="m-0 text-[13px] text-muted-foreground">
                    Перевозчики и водители перестанут её видеть. Понадобится — выставите снова.
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {CLOSE_REASONS.map((r) => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setReason(r)}
                            className={`rounded-full border border-solid px-3 py-1 text-[12px] ${reason === r ? 'border-foreground bg-foreground text-background' : 'border-border bg-transparent'}`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
                <textarea
                    aria-label="Причина"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Почему снимаете"
                    rows={2}
                    className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                />
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Оставить</Button>
                    <Button variant="destructive" onClick={submit} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Снять с биржи
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
