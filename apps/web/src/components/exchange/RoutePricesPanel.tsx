'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { History, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { RoutePrices, тонн } from '@/lib/exchange';

/**
 * Почём возили по направлению — факты под полем цены.
 *
 * Цену не придумываем: так решил владелец ещё для запросов на расчёт
 * (quote-memory.ts на сервере). Здесь прошлые заявки биржи по этому
 * направлению и свои рейсы — сколько платили перевозчику. Решает человек.
 */
export function RoutePricesPanel({ origin, destination, onUse }: {
    origin: string;
    destination: string;
    /** Подставить цену в поле — одним нажатием на обычную цену. */
    onUse: (price: number) => void;
}) {
    const [data, setData] = useState<RoutePrices | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!origin.trim() || !destination.trim()) { setData(null); return; }
        let alive = true;
        setLoading(true);
        // Пока человек выбирает город, запросы не шлём на каждую букву.
        const timer = setTimeout(() => {
            api.post('/exchange/route-prices', { originCityName: origin, destinationCityName: destination })
                .then((r) => { if (alive) setData(r.data); })
                .catch(() => { if (alive) setData(null); })
                .finally(() => { if (alive) setLoading(false); });
        }, 300);
        return () => { alive = false; clearTimeout(timer); };
    }, [origin, destination]);

    if (!origin.trim() || !destination.trim()) {
        return <p className="text-[12px] text-muted-foreground">Выберите, откуда и куда, — покажем, почём возили раньше.</p>;
    }
    if (loading && !data) {
        return <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Ищем прошлые перевозки…</p>;
    }
    if (!data?.summary) {
        return (
            <p className="text-[12px] text-muted-foreground">
                По направлению {origin} — {destination} перевозок ещё не было. Цену укажите сами.
            </p>
        );
    }

    const rows = [
        ...data.exchange.map((r) => ({ ...r, where: r.own ? `ваша заявка ${r.number} на бирже` : `биржа, заявка ${r.number}` })),
        ...data.ownOrders.map((r) => ({ ...r, where: `ваш рейс ${r.orderNumber}` })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

    return (
        <div className="space-y-2 text-[12px]">
            <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">
                    Обычно {moneyShort(data.summary.median)}
                    {data.summary.count > 1 && ` · от ${moneyShort(data.summary.min)} до ${moneyShort(data.summary.max)}`}
                    {' '}· перевозок: {data.summary.count}
                </span>
                <button type="button" className="lc-link shrink-0" onClick={() => onUse(data.summary!.median)}>
                    Подставить
                </button>
            </div>
            <div className="divide-y divide-solid divide-border rounded-xl border border-solid border-border [&>*]:border-x-0">
                {rows.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                        <span className="min-w-0 truncate text-muted-foreground">
                            <History className="mr-1 inline h-3 w-3" />
                            {dayjs(r.date).format('DD.MM.YY')} · {r.where}
                            {[r.bodyType, тонн(r.weightKg)].filter(Boolean).length > 0 && ` · ${[r.bodyType, тонн(r.weightKg)].filter(Boolean).join(', ')}`}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{moneyShort(r.price)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
