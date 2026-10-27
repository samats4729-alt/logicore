'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PickerField } from '@/components/pickers/ListPicker';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { exchangeStatus, ответСервера } from '@/lib/exchange';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Биржа прямо из мастера новой заявки: галочка «Найти перевозчика на бирже».
 *
 * Это те же два шага, что делают руками, только за один раз: заявка
 * заводится с нашей компанией в роли экспедитора и без водителя, а сразу
 * после — выставляется на биржу из её карточки (тот же запрос, что кнопка
 * «Выставить на биржу»). Так исполнителя с биржи потом назначает та же
 * проверенная логика: водитель — на нашу заявку, перевозчик — нашим
 * партнёром по рейсу.
 */

/** Показывать ли галочку: биржа открыта этой компании. Парк тоже выставляет — он сам возит (15.10.2026). */
export function useExchangeForNewOrder(): boolean {
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        let alive = true;
        exchangeStatus().then((s) => { if (alive) setAvailable(s.enabled); });
        return () => { alive = false; };
    }, []);
    return available;
}

/** Биржа в правке заявки: на бирже ли она уже и можно ли её туда выставить. */
export type OrderExchangeState = { onExchange: boolean; canPublish: boolean; price: number | null };

/**
 * Состояние заявки на бирже — для правки (владелец, 15.10.2026: «вернулся
 * выставить снова — не могу, перевозчиком стоит моя компания»). Тот же
 * ответ, что у блока биржи в карточке заявки. Нет заявки или биржи — null.
 */
export function useOrderExchangeState(orderId: string | null): OrderExchangeState | null {
    const [state, setState] = useState<OrderExchangeState | null>(null);
    useEffect(() => {
        if (!orderId) { setState(null); return; }
        let alive = true;
        api.get(`/exchange/orders/${orderId}`)
            .then((r) => { if (alive) setState({ onExchange: !!r.data?.onExchange, canPublish: !!r.data?.canPublish, price: r.data?.price ?? null }); })
            .catch(() => { if (alive) setState(null); });
        return () => { alive = false; };
    }, [orderId]);
    return state;
}

/** Под полем «Перевозчик» у заявки, которая уже на бирже: цена и где отклики. */
export function ExchangeOnBoardNote({ orderId, price }: { orderId: string; price: number | null }) {
    return (
        <p className="m-0 text-[12.5px] text-muted-foreground">
            Заявка на бирже{price != null ? ` · ${price.toLocaleString('ru-RU')} ₸` : ''}. Отклики, выбор исполнителя и снятие с биржи — в{' '}
            <Link href={`/company/orders/${orderId}`} className="text-foreground underline underline-offset-2">карточке заявки</Link>.
        </p>
    );
}

/** Галочка под полем «Перевозчик». */
export function ExchangeCarrierCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-label="Найти перевозчика на бирже" />
                Найти перевозчика на бирже
            </label>
            {checked && (
                <span className="text-[12px] text-muted-foreground">
                    Водителю без ИП, через парк, из «цены для исполнителя» оплачиваются топливо и работа; налоги парка, 10 % комиссии и НДС — сверху, полная цена будет в его отклике.
                </span>
            )}
        </div>
    );
}

/**
 * Поле «Перевозчик», пока стоит галочка: то же поле, только серое и не
 * нажимается (владелец, 10.10.2026) — перевозчика выберут из откликов.
 */
export function ExchangeCarrierSlot({ placeholder = 'Выберете из откликов на бирже' }: { placeholder?: string }) {
    return (
        <PickerField
            label="Перевозчик"
            placeholder={placeholder}
            onOpen={() => { /* недоступно, пока стоит галочка */ }}
            disabled
            className="bg-muted"
        />
    );
}

/**
 * Выставить только что заведённую заявку. Заявка к этому моменту уже есть —
 * если биржа отказала, её не теряем, а говорим почему и куда идти дальше.
 */
export async function publishNewOrder(
    order: { id: string; orderNumber?: string | null },
    /** null — без цены: исполнители предложат свою (P4). */
    price: number | null,
    open: (orderId: string) => void,
    /** «создана» — из мастера новой заявки, «сохранена» — из правки. */
    done: 'создана' | 'сохранена' = 'создана',
): Promise<void> {
    const номер = order.orderNumber ? ` ${order.orderNumber}` : '';
    const action = { label: 'Открыть', onClick: () => open(order.id) };
    try {
        await api.post(`/exchange/orders/${order.id}/publish`, { price });
        toast.success(`Заявка${номер} ${done} и выставлена на биржу. Отклики придут в её карточку`, { action });
    } catch (e) {
        toast.warning(
            `Заявка${номер} ${done}, но на биржу не вышла: ${ответСервера(e, 'биржа не ответила')}. Выставите её из карточки заявки`,
            { action, duration: 12000 },
        );
    }
}
