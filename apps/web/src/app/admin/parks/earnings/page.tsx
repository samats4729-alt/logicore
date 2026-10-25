'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Coins, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ответСервера } from '@/lib/exchange';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';
import { cn } from '@/lib/utils';
import styles from '@/components/nova/nova.module.css';

interface ParkRow {
    parkId: string;
    name: string;
    bin: string | null;
    tripsCompleted: number;
    tripsInWork: number;
    turnover: number;
    turnoverVat: number;
    commission: number;
    commissionInWork: number;
    subscriptionPaid: number;
    platformTotal: number;
    lastTripAt: string | null;
}

interface Summary {
    rows: ParkRow[];
    totals: Omit<ParkRow, 'parkId' | 'name' | 'bin' | 'turnoverVat' | 'lastTripAt'>;
}

interface HistoryItem {
    kind: 'TRIP' | 'SUBSCRIPTION';
    at: string;
    orderId: string | null;
    orderNumber: string | null;
    status: string | null;
    amount: number;
    vat: number;
    commission: number;
    commissionPct: number | null;
    accrued: boolean;
    note: string | null;
}

type PeriodKey = 'month' | 'prev' | 'all';
const PERIODS: { key: PeriodKey; label: string }[] = [
    { key: 'month', label: 'Этот месяц' },
    { key: 'prev', label: 'Прошлый месяц' },
    { key: 'all', label: 'Всё время' },
];

function periodParams(key: PeriodKey): { from?: string; to?: string } {
    if (key === 'all') return {};
    const base = key === 'month' ? dayjs() : dayjs().subtract(1, 'month');
    return { from: base.startOf('month').format('YYYY-MM-DD'), to: base.endOf('month').format('YYYY-MM-DD') };
}

const тг = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`;

/**
 * Сколько LogiCore заработала на каждом парке (Q19, владелец 25.10.2026).
 *
 * Счёт парку на долю LogiCore выставляют сотрудники вручную — здесь цифры
 * для этого: выполненные рейсы, сумма перевозок, начисленная доля LogiCore
 * и общий заработок платформы на парке, по клику — история по датам.
 * Только для администрации платформы: другие компании этих цифр не видят.
 */
export default function AdminParkEarningsPage() {
    const [period, setPeriod] = useState<PeriodKey>('month');
    const [data, setData] = useState<Summary | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [open, setOpen] = useState<ParkRow | null>(null);

    useEffect(() => {
        let alive = true;
        setData(null);
        setFailed(null);
        api.get('/exchange/admin/park-earnings', { params: periodParams(period) })
            .then((r) => { if (alive) setData(r.data); })
            .catch((e) => { if (alive) setFailed(ответСервера(e, 'Не удалось загрузить заработок по паркам. Обновите страницу.')); });
        return () => { alive = false; };
    }, [period]);

    const t = data?.totals;
    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Биржа</div>
                    <h1 className={styles.title}>Заработок на парках</h1>
                    <p className={styles.subtitle}>
                        Доля LogiCore — та, что записана в рейсе, когда компания выбрала водителя парка: 5 % из 10 % комиссии со всей суммы
                        рейса. Начисляется по довезённым рейсам; рейсы в работе показаны отдельно. Заработок платформы — доля с рейсов и
                        оплаченная подписка. Счёт парку выставляется вручную.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <div className={styles.pills} role="tablist" aria-label="Период">
                        {PERIODS.map((p) => (
                            <button key={p.key} type="button" role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)} className={cn(styles.pill, period === p.key && styles.pillActive)}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className={styles.tiles}>
                <Tile label="Выполнено рейсов" value={t ? String(t.tripsCompleted) : '…'} sub={t ? `в работе ещё ${t.tripsInWork}` : undefined} />
                <Tile label="Сумма перевозок" value={t ? тг(t.turnover) : '…'} sub="по довезённым рейсам" />
                <Tile label="Доля LogiCore начислена" value={t ? тг(t.commission) : '…'} sub={t ? `ещё начислится ${тг(t.commissionInWork)}` : undefined} />
                <Tile label="Заработок платформы" value={t ? тг(t.platformTotal) : '…'} sub={t ? `с подпиской ${тг(t.subscriptionPaid)}` : undefined} />
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Coins size={14} />
                    <h2 className={styles.cardTitle}>Парки</h2>
                </div>
                {failed ? (
                    <div className={styles.empty}>{failed}</div>
                ) : !data ? (
                    <div className="h-40 animate-pulse" />
                ) : data.rows.length === 0 ? (
                    <div className={styles.empty}>Парков на платформе пока нет. Отметить компанию парком — на странице «Биржа: доступ и парки».</div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table className="border-collapse text-[13px]">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Парк</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Рейсов</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Сумма перевозок</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Доля LogiCore</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Ещё начислится</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Подписка</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Заработок платформы</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.rows.map((r) => (
                                    <TableRow key={r.parkId} className="cursor-pointer border-0 border-b border-solid border-border" onClick={() => setOpen(r)}>
                                        <TableCell className="py-2.5">
                                            <div className="font-medium">{r.name}</div>
                                            <div className="text-[12px] text-muted-foreground tabular-nums">
                                                БИН {r.bin || '—'}{r.lastTripAt ? ` · последний рейс ${dayjs(r.lastTripAt).format('DD.MM.YYYY')}` : ''}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {r.tripsCompleted}{r.tripsInWork ? <span className="text-muted-foreground"> + {r.tripsInWork}</span> : null}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{тг(r.turnover)}</TableCell>
                                        <TableCell className="text-right font-medium tabular-nums">{тг(r.commission)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-muted-foreground">{тг(r.commissionInWork)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{тг(r.subscriptionPaid)}</TableCell>
                                        <TableCell className="text-right font-semibold tabular-nums">{тг(r.platformTotal)}</TableCell>
                                    </TableRow>
                                ))}
                                {t && (
                                    <TableRow className="border-0 bg-muted/40 font-semibold hover:bg-muted/40">
                                        <TableCell className="py-2.5">Итого</TableCell>
                                        <TableCell className="text-right tabular-nums">{t.tripsCompleted}</TableCell>
                                        <TableCell className="text-right tabular-nums">{тг(t.turnover)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{тг(t.commission)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{тг(t.commissionInWork)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{тг(t.subscriptionPaid)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{тг(t.platformTotal)}</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>

            <HistoryDialog park={open} period={period} onClose={() => setOpen(null)} />
        </div>
    );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className={styles.tile}>
            <div className={styles.tileHead}><span className={styles.tileLabel}>{label}</span></div>
            <div className={styles.tileValue}>{value}</div>
            {sub && <div className={styles.tileSub}>{sub}</div>}
        </div>
    );
}

/** История по парку: рейсы с долей LogiCore и оплаты подписки — по датам. */
function HistoryDialog({ park, period, onClose }: { park: ParkRow | null; period: PeriodKey; onClose: () => void }) {
    const [items, setItems] = useState<HistoryItem[] | null>(null);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        if (!park) return;
        let alive = true;
        setItems(null);
        setFailed(null);
        api.get(`/exchange/admin/park-earnings/${park.parkId}`, { params: periodParams(period) })
            .then((r) => { if (alive) setItems(r.data.items); })
            .catch((e) => { if (alive) setFailed(ответСервера(e, 'Не удалось загрузить историю. Попробуйте ещё раз.')); });
        return () => { alive = false; };
    }, [park, period]);

    return (
        <Dialog open={!!park} onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">{park?.name} — начисления и операции</DialogTitle>
                </DialogHeader>
                {failed ? (
                    <div className="py-6 text-center text-[13px] text-muted-foreground">{failed}</div>
                ) : !items ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : items.length === 0 ? (
                    <div className="py-6 text-center text-[13px] text-muted-foreground">За этот период рейсов и оплат у парка не было.</div>
                ) : (
                    <div className="max-h-[60vh] overflow-auto">
                        <Table className="border-collapse text-[13px]">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Дата</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Что</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Сумма</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Доля LogiCore</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((it, i) => (
                                    <TableRow key={`${it.kind}-${it.orderId ?? i}`} className="border-0 border-b border-solid border-border">
                                        <TableCell className="py-2 tabular-nums">{dayjs(it.at).format('DD.MM.YYYY')}</TableCell>
                                        <TableCell className="py-2">
                                            {it.kind === 'TRIP' ? (
                                                <span className="inline-flex items-center gap-2">
                                                    Рейс <b className="font-medium tabular-nums">{it.orderNumber}</b>
                                                    {it.status && <StatusPill status={it.status} />}
                                                </span>
                                            ) : it.note}
                                        </TableCell>
                                        <TableCell className="py-2 text-right tabular-nums">
                                            {тг(it.amount)}
                                            {it.vat > 0 && <div className="text-[11px] text-muted-foreground">в т. ч. НДС {тг(it.vat)}</div>}
                                        </TableCell>
                                        <TableCell className="py-2 text-right tabular-nums">
                                            {it.kind === 'TRIP' ? (
                                                <>
                                                    <span className={cn(!it.accrued && 'text-muted-foreground')}>{тг(it.commission)}</span>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {it.accrued ? 'начислено' : 'начислится после доставки'}{it.commissionPct ? ` · ${it.commissionPct} %` : ''}
                                                    </div>
                                                </>
                                            ) : '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
