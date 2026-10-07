'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Route } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { ORDER_STATUS_LABELS } from '@/lib/vocabulary';
import { ParkTrip, ParkTripFilter, день } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';
import styles from '@/components/nova/nova.module.css';

const FILTERS: { key: ParkTripFilter; label: string }[] = [
    { key: 'active', label: 'В рейсе' },
    { key: 'done', label: 'Довезли' },
    { key: 'all', label: 'Все' },
];

const EMPTY: Record<ParkTripFilter, string> = {
    active: 'Сейчас никто из водителей парка не в рейсе. Рейс появится, когда компания выберет вашего водителя на бирже.',
    done: 'Довезённых рейсов пока нет.',
    all: 'Рейсов пока не было. Они появятся, когда компании начнут выбирать ваших водителей на бирже.',
};

/**
 * Рейсы водителей парка.
 *
 * Парк — перевозчик по документам, поэтому видит рейс целиком со своей
 * стороны: кто везёт, откуда и куда, для какой компании, статус и сумму за
 * рейс. Цену заказчика не видит — это не его сделка.
 */
export default function ParkTripsPage() {
    const router = useRouter();
    const [filter, setFilter] = useState<ParkTripFilter>('active');
    const [trips, setTrips] = useState<ParkTrip[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const wanted = new URLSearchParams(window.location.search).get('status');
        if (wanted && FILTERS.some((f) => f.key === wanted)) setFilter(wanted as ParkTripFilter);
    }, []);

    useEffect(() => {
        let alive = true;
        setTrips(null);
        setFailed(false);
        api.get(`/exchange/park/trips?status=${filter}`)
            .then((r) => { if (alive) setTrips(r.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [filter]);

    const total = (trips ?? []).reduce((sum, t) => sum + (t.price ?? 0), 0);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет парка</div>
                    <h1 className={styles.title}>Рейсы водителей</h1>
                    <p className={styles.subtitle}>Рейсы, где ваш парк — перевозчик: кто везёт, куда и сколько за рейс.</p>
                </div>
                <div className={styles.heroActions}>
                    <Button variant="outline" onClick={() => router.push('/company/park')}>
                        <ArrowLeft className="h-4 w-4" /> К кабинету
                    </Button>
                </div>
            </div>

            <div className={styles.pills} role="tablist" style={{ marginBottom: 12 }}>
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        role="tab"
                        aria-selected={filter === f.key}
                        className={`${styles.pill} ${filter === f.key ? styles.pillActive : ''}`}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Route size={14} />
                    <h2 className={styles.cardTitle}>{FILTERS.find((f) => f.key === filter)?.label}</h2>
                    {trips && trips.length > 0 && <span className={styles.cardCount}>{trips.length} · {moneyShort(total)}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить рейсы — обновите страницу.</div>
                ) : !trips ? (
                    <div className="space-y-2 p-4" aria-label="Загрузка">
                        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />)}
                    </div>
                ) : trips.length === 0 ? (
                    <div className={styles.empty}>{EMPTY[filter]}</div>
                ) : (
                    <>
                        <Table className="hidden border-collapse text-[13px] md:table">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Маршрут</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Водитель</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Погрузка</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Для компании</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Статус</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">За рейс</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {trips.map((t) => (
                                    <TableRow key={t.id} className="border-0 border-b border-solid border-border">
                                        <TableCell className="py-2.5">
                                            <div className="flex items-center gap-1.5 font-semibold">{t.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {t.to}</div>
                                            <div className="text-[12px] text-muted-foreground">заявка {t.orderNumber}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div>{t.driverName ?? '—'}</div>
                                            {t.vehiclePlate && <div className="text-[12px] text-muted-foreground">{t.vehiclePlate}</div>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">{день(t.loadingDate)}</TableCell>
                                        <TableCell className="text-muted-foreground">{t.customerName ?? '—'}</TableCell>
                                        <TableCell><StatusPill status={t.status} label={ORDER_STATUS_LABELS[t.status] ?? t.status} /></TableCell>
                                        <TableCell className="text-right font-semibold tabular-nums">{t.price != null ? moneyShort(t.price) : '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <ul className="m-0 list-none divide-y divide-border p-0 md:hidden">
                            {trips.map((t) => (
                                <li key={t.id} className="flex flex-col gap-1 px-4 py-3">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">{t.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {t.to}</span>
                                        <span className="shrink-0 text-[15px] font-bold tabular-nums">{t.price != null ? moneyShort(t.price) : '—'}</span>
                                    </div>
                                    <div className="text-[12px] text-muted-foreground">{t.driverName ?? '—'}{t.vehiclePlate ? ` · ${t.vehiclePlate}` : ''} · {день(t.loadingDate)}</div>
                                    <div><StatusPill status={t.status} label={ORDER_STATUS_LABELS[t.status] ?? t.status} /></div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </section>
        </div>
    );
}
