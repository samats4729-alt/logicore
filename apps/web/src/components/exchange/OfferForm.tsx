'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Send, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoneyInput, moneyShort, parseMoneyInput } from '@/lib/money-format';
import { ExchangeOrder, OwnOffer, exchangeStatus, день, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateStringField } from '@/components/ui/DateField';

const STATUS_TEXT: Record<OwnOffer['status'], string> = {
    ACTIVE: 'Ваш отклик ждёт решения компании',
    ACCEPTED: 'Вас выбрали исполнителем — заявка у вас в списке заявок',
    REJECTED: 'Компания выбрала другого исполнителя или сняла заявку',
    WITHDRAWN: 'Вы отозвали отклик',
};

/**
 * Отклик перевозчика на заявку с биржи.
 *
 * Самое частое — согласиться на цену компании: одна кнопка. Своя цена —
 * поле ниже. Когда подадите машину и комментарий — необязательно, но с
 * ними компании проще выбрать. Решает компания: отклик ни к чему не
 * обязывает, пока вас не выбрали, и его можно отозвать.
 */
export default function OfferForm({ order, onChanged }: { order: ExchangeOrder; onChanged: (offer: OwnOffer | null) => void }) {
    const [isPark, setIsPark] = useState(false);
    const [editing, setEditing] = useState(!order.myOffer || order.myOffer.status === 'WITHDRAWN');
    const [price, setPrice] = useState('');
    const [readyDate, setReadyDate] = useState('');
    const [comment, setComment] = useState('');
    const [saving, setSaving] = useState<'agree' | 'own' | 'withdraw' | null>(null);

    useEffect(() => { exchangeStatus().then((s) => setIsPark(s.isPark)); }, []);
    useEffect(() => {
        const mine = order.myOffer;
        setPrice(mine && !mine.agreed ? String(mine.price) : '');
        setReadyDate(mine?.readyDate?.slice(0, 10) ?? '');
        setComment(mine?.comment ?? '');
    }, [order.myOffer]);

    if (isPark) {
        return (
            <p className="m-0 text-[12px] text-muted-foreground">
                Парк сам не возит — на заявки откликаются его водители через приложение.
            </p>
        );
    }

    const send = async (agree: boolean) => {
        const own = Number(parseMoneyInput(price));
        if (!agree && !(own > 0)) {
            toast.error('Укажите свою цену или согласитесь на цену компании');
            return;
        }
        setSaving(agree ? 'agree' : 'own');
        try {
            const { data } = await api.post(`/exchange/board/${order.id}/offer`, {
                agree,
                price: agree ? undefined : own,
                readyDate: readyDate || undefined,
                comment: comment.trim() || undefined,
            });
            toast.success('Отклик отправлен — компания увидит его в своей заявке');
            setEditing(false);
            onChanged(data);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось откликнуться'));
        } finally {
            setSaving(null);
        }
    };

    const withdraw = async () => {
        setSaving('withdraw');
        try {
            await api.post(`/exchange/board/${order.id}/offer/withdraw`);
            toast.success('Отклик отозван');
            onChanged({ ...order.myOffer!, status: 'WITHDRAWN' });
            setEditing(true);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось отозвать отклик'));
        } finally {
            setSaving(null);
        }
    };

    const mine = order.myOffer;
    if (mine && !editing) {
        return (
            <div className="space-y-2 text-[13px]">
                <div className={`rounded-xl px-3 py-2.5 ${mine.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-muted/50'}`}>
                    <div className="font-semibold">{STATUS_TEXT[mine.status]}</div>
                    <div className="mt-0.5 text-[12px]">
                        {moneyShort(mine.price)}{mine.agreed ? ' — по цене компании' : ' — ваша цена'}
                        {mine.readyDate ? ` · подача ${день(mine.readyDate)}` : ''}
                    </div>
                </div>
                {mine.status === 'ACTIVE' && (
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Изменить</Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={withdraw} disabled={saving === 'withdraw'}>
                            {saving === 'withdraw' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Отозвать
                        </Button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {order.price != null && (
                <Button className="w-full" onClick={() => send(true)} disabled={!!saving}>
                    {saving === 'agree' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Согласен за {moneyShort(order.price)}
                </Button>
            )}
            <div className="space-y-2 rounded-xl border border-solid border-border p-3">
                <div className="text-[12px] font-medium text-muted-foreground">{order.price != null ? 'Или предложите свою цену' : 'Цена договорная — предложите свою'}</div>
                <Input
                    aria-label="Своя цена"
                    value={formatMoneyInput(parseMoneyInput(price))}
                    onChange={(e) => setPrice(parseMoneyInput(e.target.value).replace(/[^\d.]/g, ''))}
                    placeholder="Ваша цена, ₸"
                    inputMode="numeric"
                    className="h-9 text-[13px] font-semibold tabular-nums placeholder:font-normal"
                />
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] text-muted-foreground">Когда подадите машину · необязательно</span>
                    <DateStringField value={readyDate} onChange={setReadyDate} className="h-9 text-[13px]" />
                </label>
                <textarea
                    aria-label="Комментарий"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Например: машина 20 т, тент, есть ремни; оплата по оригиналам"
                    rows={2}
                    className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                />
                <Button variant="outline" className="w-full" onClick={() => send(false)} disabled={!!saving}>
                    {saving === 'own' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Предложить свою цену
                </Button>
            </div>
            {mine && mine.status === 'ACTIVE' && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Оставить как было</Button>
            )}
            <p className="m-0 text-[12px] text-muted-foreground">
                Отклик ни к чему не обязывает, пока вас не выбрали, — его можно изменить или отозвать. Выбирает компания.
            </p>
        </div>
    );
}
