'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { ArrowRight, Search } from 'lucide-react';
import { moneyShort } from '@/lib/money-format';
import type { IncomingOffer } from '@/lib/exchange';
import { Input } from '@/components/ui/input';
import OffersList from './OffersList';
import styles from '@/components/nova/nova.module.css';

type OrderGroup = {
    orderId: string;
    orderNumber: string;
    from: string;
    to: string;
    orderPrice: number | null;
    count: number;
    best: number;
    latest: string;
};

/**
 * «Предложения» на бирже (владелец, 15.10.2026): отклики на все свои заявки.
 *
 * Заявок с откликами и самих откликов может быть много, поэтому экран в два
 * столбца на всю ширину: слева заявки (поиск, у каждой — сколько откликов,
 * лучшая цена и когда пришёл последний), справа — таблица откликов выбранной
 * заявки с фильтром, порядком и поиском (`OffersList`). Выше — та заявка,
 * где отклик пришёл последним.
 */
export default function IncomingOffers({ offers, onChanged }: { offers: IncomingOffer[]; onChanged: () => void }) {
    const groups = useMemo<OrderGroup[]>(() => {
        const map = new Map<string, OrderGroup>();
        for (const o of offers) {
            const g = map.get(o.orderId);
            if (!g) {
                map.set(o.orderId, {
                    orderId: o.orderId, orderNumber: o.orderNumber, from: o.from, to: o.to, orderPrice: o.orderPrice,
                    count: 1, best: o.price, latest: o.createdAt,
                });
            } else {
                g.count += 1;
                g.best = Math.min(g.best, o.price);
                if (o.createdAt > g.latest) g.latest = o.createdAt;
            }
        }
        return Array.from(map.values()).sort((a, b) => b.latest.localeCompare(a.latest));
    }, [offers]);
    const [selected, setSelected] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    if (!groups.length) {
        return (
            <section className={styles.card}>
                <div className={styles.empty}>
                    Откликов пока нет. Когда перевозчик или водитель предложит цену по вашей заявке на бирже, он появится здесь,
                    а в колокольчике сверху загорится точка.
                </div>
            </section>
        );
    }

    const needle = query.trim().toLowerCase();
    const shown = groups.filter((g) => !needle || [g.orderNumber, g.from, g.to].some((v) => v.toLowerCase().includes(needle)));
    const current = groups.find((g) => g.orderId === selected) ?? shown[0] ?? groups[0];

    return (
        <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section className={styles.card} aria-label="Заявки с откликами">
                <div className="border-0 border-b border-solid border-border p-3">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            aria-label="Найти заявку"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Номер или город"
                            className="h-8 pl-8 text-[13px]"
                        />
                    </div>
                </div>
                <ul className="m-0 max-h-[calc(100vh-300px)] list-none divide-y divide-border overflow-y-auto p-0">
                    {shown.map((g) => {
                        const on = g.orderId === current.orderId;
                        return (
                            <li key={g.orderId}>
                                <button
                                    type="button"
                                    onClick={() => setSelected(g.orderId)}
                                    aria-pressed={on}
                                    className={`flex w-full items-start justify-between gap-3 border-0 px-4 py-3 text-left [font-family:inherit] ${on ? 'bg-muted' : 'bg-transparent hover:bg-muted/50'}`}
                                >
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
                                            {g.from} <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {g.to}
                                        </span>
                                        <span className="mt-0.5 block text-[12px] text-muted-foreground">
                                            Заявка {g.orderNumber} · последний {dayjs(g.latest).format('DD.MM HH:mm')}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className="block text-[13px] font-bold tabular-nums text-foreground">от {moneyShort(g.best)}</span>
                                        <span className="block text-[11.5px] text-muted-foreground">откликов: {g.count}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                    {!shown.length && <li className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">Ничего не нашлось</li>}
                </ul>
            </section>

            <section className={styles.card} aria-label={`Отклики на заявку ${current.orderNumber}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-0 border-b border-solid border-border px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                            {current.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {current.to}
                        </div>
                        <div className="mt-0.5 text-[12px] text-muted-foreground">
                            Заявка {current.orderNumber}{current.orderPrice != null ? ` · на бирже за ${moneyShort(current.orderPrice)}` : ''}
                        </div>
                    </div>
                    <Link href={`/company/orders/${current.orderId}?tab=offers`} className="text-[13px] font-medium text-foreground underline underline-offset-2">
                        Открыть заявку
                    </Link>
                </div>
                <div className="p-3">
                    {/* key — чтобы фильтры и порядок не переезжали на другую заявку. */}
                    <OffersList key={current.orderId} orderId={current.orderId} onAccepted={onChanged} />
                </div>
            </section>
        </div>
    );
}
