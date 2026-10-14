'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { moneyShort } from '@/lib/money-format';
import type { IncomingOffer } from '@/lib/exchange';
import OffersList from './OffersList';
import styles from '@/components/nova/nova.module.css';

/**
 * «Предложения» на бирже (владелец, 15.10.2026): отклики на все свои заявки
 * разом, по заявкам — у какой заявки сначала появился свежий отклик, та и
 * выше. Выбор исполнителя — тем же списком, что в карточке заявки.
 */
export default function IncomingOffers({ offers, onChanged }: { offers: IncomingOffer[]; onChanged: () => void }) {
    if (!offers.length) {
        return (
            <section className={styles.card}>
                <div className={styles.empty}>
                    Откликов пока нет. Когда перевозчик или водитель предложит цену по вашей заявке на бирже, он появится здесь,
                    а в колокольчике сверху загорится точка.
                </div>
            </section>
        );
    }
    // Заявки в порядке самого свежего отклика: offers уже идут новые сверху.
    const orders: IncomingOffer[] = [];
    for (const o of offers) if (!orders.some((x) => x.orderId === o.orderId)) orders.push(o);

    return (
        <div className="grid gap-3">
            {orders.map((o) => {
                const count = offers.filter((x) => x.orderId === o.orderId).length;
                return (
                    <section key={o.orderId} className={styles.card} aria-label={`Отклики на заявку ${o.orderNumber}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-0 border-b border-solid border-border px-4 py-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-[14px] font-semibold">
                                    {o.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {o.to}
                                </div>
                                <div className="mt-0.5 text-[12px] text-muted-foreground">
                                    Заявка {o.orderNumber}{o.orderPrice != null ? ` · на бирже за ${moneyShort(o.orderPrice)}` : ''} · откликов: {count}
                                </div>
                            </div>
                            <Link href={`/company/orders/${o.orderId}?tab=offers`} className="text-[13px] font-medium text-foreground underline underline-offset-2">
                                Открыть заявку
                            </Link>
                        </div>
                        <div className="p-3">
                            <OffersList orderId={o.orderId} onAccepted={onChanged} />
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
