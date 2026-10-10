'use client';

import { useEffect, useState } from 'react';
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

/** Показывать ли галочку: биржа открыта этой компании, и компания — не парк. */
export function useExchangeForNewOrder(): boolean {
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        let alive = true;
        exchangeStatus().then((s) => { if (alive) setAvailable(s.enabled && !s.isPark); });
        return () => { alive = false; };
    }, []);
    return available;
}

/** Галочка под полем «Перевозчик». */
export function ExchangeCarrierCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-label="Найти перевозчика на бирже" />
            Найти перевозчика на бирже
        </label>
    );
}

/**
 * Поле «Перевозчик», пока стоит галочка: то же поле, только серое и не
 * нажимается (владелец, 10.10.2026) — перевозчика выберут из откликов.
 */
export function ExchangeCarrierSlot() {
    return (
        <PickerField
            label="Перевозчик"
            placeholder="Выберете из откликов на бирже"
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
    price: number,
    open: (orderId: string) => void,
): Promise<void> {
    const номер = order.orderNumber ? ` ${order.orderNumber}` : '';
    const action = { label: 'Открыть', onClick: () => open(order.id) };
    try {
        await api.post(`/exchange/orders/${order.id}/publish`, { price });
        toast.success(`Заявка${номер} создана и выставлена на биржу. Отклики придут в её карточку`, { action });
    } catch (e) {
        toast.warning(
            `Заявка${номер} создана, но на биржу не вышла: ${ответСервера(e, 'биржа не ответила')}. Выставите её из карточки заявки`,
            { action, duration: 12000 },
        );
    }
}
