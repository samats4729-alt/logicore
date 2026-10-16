'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Fuel, Route } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { ORDER_STATUS_LABELS } from '@/lib/vocabulary';
import { ParkTrip, ParkTripFilter, день } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';
import { TripFuelDialog } from '@/components/park/TripFuelDialog';
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
 *
 * По расчёту «на руки» (12.10.2026) под суммой — сколько водителю на руки
 * и доля парка, а кнопка «Топливо» открывает, что дали на топливо, и чеки
 * водителя на проверку.
 */
export default function ParkTripsPage() {
    const router = useRouter();
    const [filter, setFilter] = useState<ParkTripFilter>('active');
    const [trips, setTrips] = useState<ParkTrip[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [fuelTrip, setFuelTrip] = useState<ParkTrip | null>(null);
    const [reload, setReload] = useState(0);

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
    }, [filter, reload]);

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
                                    <TableHead className="h-9 text-[12.5px]">Маршрут</TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Водитель</TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Погрузка</TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Для компании</TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Статус</TableHead>
                                    <TableHead className="h-9 text-right text-[12.5px]">За рейс</TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Налоги по рейсу</TableHead>
                                    <TableHead className="h-9 text-right text-[12.5px]">Топливо</TableHead>
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
                                        <TableCell className="text-right tabular-nums">
                                            <div className="font-semibold">{t.price != null ? moneyShort(t.price) : '—'}</div>
                                            {t.settlement && (
                                                <div className="text-[11.5px] text-muted-foreground">
                                                    водителю на руки {moneyShort(t.settlement.driverTotal)} · парку {moneyShort(t.settlement.parkFee)}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-[12px]"><TaxBreakdown s={t.settlement} /></TableCell>
                                        <TableCell className="text-right">
                                            {t.settlement ? <FuelButton trip={t} onOpen={setFuelTrip} /> : <span className="text-muted-foreground">—</span>}
                                        </TableCell>
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
                                    {t.settlement && (
                                        <div className="text-[12px] text-muted-foreground">водителю на руки {moneyShort(t.settlement.driverTotal)} · парку {moneyShort(t.settlement.parkFee)}</div>
                                    )}
                                    {t.settlement && <div className="text-[12px]"><TaxBreakdown s={t.settlement} /></div>}
                                    <div className="flex items-center justify-between gap-2">
                                        <StatusPill status={t.status} label={ORDER_STATUS_LABELS[t.status] ?? t.status} />
                                        {t.settlement && <FuelButton trip={t} onOpen={setFuelTrip} />}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </section>

            <TripFuelDialog
                orderId={fuelTrip?.id ?? null}
                orderNumber={fuelTrip?.orderNumber}
                open={!!fuelTrip}
                onOpenChange={(o) => { if (!o) setFuelTrip(null); }}
                onChanged={() => setReload((n) => n + 1)}
            />
        </div>
    );
}

/**
 * Налоги рейса (шеф, 16.10.2026: «сколько ИПН, ОПВ, ОСМС, соцотчисления»):
 * ОПВ удержано у водителя, остальное платит парк.
 */
function TaxBreakdown({ s }: { s: ParkTrip['settlement'] }) {
    if (!s || s.gross == null) return <span className="text-muted-foreground">—</span>;
    const parkPays = (s.vosms ?? 0) + (s.so ?? 0) + (s.ipn ?? 0);
    return (
        <div className="space-y-0.5 tabular-nums">
            <div>ОПВ {moneyShort(s.opv)} · ОСМС {moneyShort(s.vosms)} · СО {moneyShort(s.so)} · ИПН {moneyShort(s.ipn)}</div>
            <div className="text-[11.5px] text-muted-foreground">
                {s.scheme === 2 ? `ОПВ — из денег водителя; ОСМС, СО, ИПН — за счёт парка (${moneyShort(parkPays)})` : 'по прежнему расчёту'}
                {s.preliminary ? ' · предварительный' : ''}
            </div>
        </div>
    );
}

/** «Топливо» у рейса: сколько чеков ждут решения — сразу на кнопке. */
function FuelButton({ trip, onOpen }: { trip: ParkTrip; onOpen: (t: ParkTrip) => void }) {
    const pending = trip.fuelReceiptsPending ?? 0;
    return (
        <Button variant="outline" size="sm" onClick={() => onOpen(trip)}>
            <Fuel className="h-3.5 w-3.5" /> Топливо
            {pending > 0 && <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{pending}</span>}
        </Button>
    );
}
