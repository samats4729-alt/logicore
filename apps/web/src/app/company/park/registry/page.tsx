'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ParkRegistry, ParkRegistryLine, RegistryPayStatus, день, иинКрасиво, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';
import styles from '@/components/nova/nova.module.css';

/** Деньги в реестре — до тиына: бухгалтер сверяет их с 1С. */
const sum = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Оплата рейса — цветом и словом (StatusPill знает эти ключи по смыслу). */
const PILL: Record<RegistryPayStatus, string> = {
    IN_TRIP: 'IN_TRANSIT', TO_REQUEST: 'DRAFT', REQUESTED: 'PENDING', EXPORTED: 'IN_TRANSIT', PAID: 'COMPLETED', REJECTED: 'CANCELLED',
};

/**
 * Реестр бухгалтера парка за месяц (задача 15.10.2026).
 *
 * Все рейсы водителей парка с расчётом «на руки» за месяц дохода: начислено
 * по ГПХ, что удержано у водителя, что уходит в бюджет (вместе с СО за счёт
 * парка), сколько перечислить и сколько уже выплачено. Месяц — по погрузке:
 * по нему же копится вычет по ИПН. Только просмотр и Excel — деньги отсюда
 * никуда не уходят.
 */
export default function ParkRegistryPage() {
    const router = useRouter();
    const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
    const [data, setData] = useState<ParkRegistry | null>(null);
    const [failed, setFailed] = useState(false);
    const [driverId, setDriverId] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        let alive = true;
        setData(null);
        setFailed(false);
        setDriverId(null);
        api.get<ParkRegistry>(`/exchange/park/registry?month=${month}`)
            .then((r) => { if (alive) setData(r.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [month]);

    const lines = useMemo(() => (data?.lines ?? []).filter((l) => !driverId || l.driver.id === driverId), [data, driverId]);
    const shown = driverId ? data?.drivers.find((d) => d.driver.id === driverId) : data?.totals;
    const monthTitle = dayjs(`${month}-01`).locale('ru').format('MMMM YYYY');

    const download = async () => {
        setDownloading(true);
        try {
            const res = await api.get(`/exchange/park/registry/export?month=${month}`, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Реестр водителей ${month}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось скачать реестр'));
        } finally {
            setDownloading(false);
        }
    };

    const shift = (n: number) => setMonth((m) => dayjs(`${m}-01`).add(n, 'month').format('YYYY-MM'));

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Управление парком</div>
                    <h1 className={styles.title}>Реестр бухгалтера</h1>
                    <p className={styles.subtitle}>
                        Рейсы водителей без ИП за месяц: начислено, удержано, в бюджет, к выплате и выплачено. Месяц — по дате погрузки.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <Button variant="outline" onClick={() => router.push('/company/park')}>
                        <ArrowLeft className="h-4 w-4" /> К кабинету
                    </Button>
                    <Button onClick={download} disabled={downloading || !data || data.lines.length === 0}>
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Скачать Excel
                    </Button>
                </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" aria-label="Прошлый месяц" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="min-w-[150px] text-center text-[15px] font-semibold capitalize">{monthTitle}</div>
                <Button variant="outline" size="icon" aria-label="Следующий месяц" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
                {month !== dayjs().format('YYYY-MM') && (
                    <Button variant="ghost" size="sm" onClick={() => setMonth(dayjs().format('YYYY-MM'))}>Этот месяц</Button>
                )}
            </div>

            {data?.preliminary && data.lines.length > 0 && (
                <div className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <b>Расчёт предварительный.</b> Бухгалтер парка ещё не подтвердил ставки и порядок расчёта (или рейсы посчитаны до
                    подтверждения): налоги и взносы — оценка, сверьте до уплаты. Подтвердить — в «Выплаты водителям», раздел «Ставки».
                </div>
            )}

            {failed ? (
                <section className={styles.card}><div className={styles.empty}>Не удалось загрузить реестр — обновите страницу.</div></section>
            ) : !data ? (
                <section className={styles.card}>
                    <div className="space-y-2 p-4" aria-label="Загрузка">
                        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />)}
                    </div>
                </section>
            ) : data.lines.length === 0 ? (
                <section className={styles.card}>
                    <div className={styles.empty}>
                        За {monthTitle} рейсов с расчётом нет. Они появятся, когда компании выберут ваших водителей на бирже.
                    </div>
                </section>
            ) : (
                <>
                    {shown && (
                        <div className="mb-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                            <Kpi label="Рейсов" value={String(driverId ? lines.length : data.totals.trips)} />
                            <Kpi label="Начислено водителям" value={sum(shown.gross)} />
                            <Kpi label="Удержано у водителей" value={sum(shown.withheld)} />
                            <Kpi label="В бюджет всего, с СО" value={sum(shown.toBudget)} strong />
                            <Kpi label="К перечислению водителям" value={sum(shown.toPay)} />
                            <Kpi label="Выплачено" value={sum(shown.paid)} />
                        </div>
                    )}

                    {/* Итог месяца парка одной сводкой (задачи шефа, K8): оборот, налоги, прибыль. */}
                    {!driverId && (
                        <section className={`${styles.card} mb-3`}>
                            <div className={styles.cardHead}>
                                <Wallet size={14} />
                                <h2 className={styles.cardTitle}>Итог месяца парка</h2>
                            </div>
                            <div className="grid gap-3 p-4 pt-1 sm:grid-cols-3 xl:grid-cols-6">
                                <Kpi label="Оборот по рейсам" value={sum(data.totals.customerPrice)} />
                                <Kpi label="НДС" value={sum(data.totals.vat)} />
                                <Kpi label="Налоги и взносы в бюджет" value={sum(data.totals.toBudget)} />
                                <Kpi label="Комиссия парка по расчёту" value={sum(data.totals.parkFee)} />
                                <Kpi
                                    label={(data.totals.fuelDiff ?? 0) < 0 ? 'Перерасход топлива' : 'Экономия топлива'}
                                    value={sum(Math.abs(data.totals.fuelDiff ?? 0))}
                                />
                                <Kpi label="Прибыль парка" value={sum(data.totals.parkProfit ?? data.totals.parkFee)} strong />
                            </div>
                            <p className="m-0 px-4 pb-3 text-[12px] text-muted-foreground">
                                Прибыль — ваша комиссия плюс разница по топливу: расчёт против чеков по довезённым рейсам. Доля LogiCore — {sum(data.totals.platformFee)}, в прибыль не входит.
                            </p>
                        </section>
                    )}

                    {data.drivers.length > 1 && (
                        <div className={styles.pills} role="tablist" style={{ marginBottom: 12 }}>
                            <button type="button" role="tab" aria-selected={!driverId} className={`${styles.pill} ${!driverId ? styles.pillActive : ''}`} onClick={() => setDriverId(null)}>
                                Все водители · {data.drivers.length}
                            </button>
                            {data.drivers.map((d) => (
                                <button
                                    key={d.driver.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={driverId === d.driver.id}
                                    className={`${styles.pill} ${driverId === d.driver.id ? styles.pillActive : ''}`}
                                    onClick={() => setDriverId(d.driver.id)}
                                >
                                    {d.driver.name} · {d.trips}
                                </button>
                            ))}
                        </div>
                    )}

                    <section className={styles.card}>
                        <div className={styles.cardHead}>
                            <FileSpreadsheet size={14} />
                            <h2 className={styles.cardTitle}>Рейсы</h2>
                            <span className={styles.cardCount}>{lines.length}</span>
                        </div>
                        <div className="overflow-x-auto">
                            <Table className="border-collapse text-[12.5px]">
                                <TableHeader>
                                    <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                        <TableHead className="h-9">Рейс</TableHead>
                                        <TableHead className="h-9">Водитель</TableHead>
                                        <TableHead className="h-9 text-right">Договорились</TableHead>
                                        <TableHead className="h-9 text-right">Топливо</TableHead>
                                        <TableHead className="h-9 text-right">Начислено</TableHead>
                                        <TableHead className="h-9 text-right">ОПВ</TableHead>
                                        <TableHead className="h-9 text-right">ВОСМС</TableHead>
                                        <TableHead className="h-9 text-right">ИПН</TableHead>
                                        <TableHead className="h-9 text-right">СО</TableHead>
                                        <TableHead className="h-9 text-right">В бюджет</TableHead>
                                        <TableHead className="h-9 text-right">К перечислению</TableHead>
                                        <TableHead className="h-9 text-right">Выплачено</TableHead>
                                        <TableHead className="h-9">Оплата</TableHead>
                                        <TableHead className="h-9">Проверка</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.map((l) => <Line key={l.orderId} l={l} />)}
                                </TableBody>
                            </Table>
                        </div>
                    </section>

                    {data.drivers.length > 0 && !driverId && (
                        <section className={styles.card}>
                            <div className={styles.cardHead}>
                                <Users size={14} />
                                <h2 className={styles.cardTitle}>По водителям за месяц</h2>
                                <span className={styles.cardCount}>{data.drivers.length}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <Table className="border-collapse text-[12.5px]">
                                    <TableHeader>
                                        <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                            <TableHead className="h-9">Водитель</TableHead>
                                            <TableHead className="h-9 text-right">Рейсов</TableHead>
                                            <TableHead className="h-9 text-right">Начислено</TableHead>
                                            <TableHead className="h-9 text-right">Вычет ИПН</TableHead>
                                            <TableHead className="h-9 text-right">Удержано</TableHead>
                                            <TableHead className="h-9 text-right">СО</TableHead>
                                            <TableHead className="h-9 text-right">В бюджет</TableHead>
                                            <TableHead className="h-9 text-right">К перечислению</TableHead>
                                            <TableHead className="h-9 text-right">Выплачено</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.drivers.map((d) => (
                                            <TableRow key={d.driver.id} className="border-0 border-b border-solid border-border">
                                                <TableCell className="py-2">
                                                    <div className="font-semibold">{d.driver.name}</div>
                                                    <div className="text-[11.5px] text-muted-foreground">ИИН {иинКрасиво(d.driver.iin)}</div>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">{d.trips}</TableCell>
                                                <TableCell className="text-right tabular-nums">{sum(d.gross)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{sum(d.deductionAmount)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{sum(d.withheld)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{sum(d.so)}</TableCell>
                                                <TableCell className="text-right font-semibold tabular-nums">{sum(d.toBudget)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{sum(d.toPay)}</TableCell>
                                                <TableCell className="text-right tabular-nums">{sum(d.paid)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className="rounded-2xl border border-solid border-border bg-card px-4 py-3">
            <div className="text-[12px] text-muted-foreground">{label}</div>
            <div className={`mt-1 text-[18px] tabular-nums ${strong ? 'font-bold' : 'font-semibold'}`}>{value}</div>
        </div>
    );
}

/** Строка рейса: суммы до тиына; под ними — откуда они (выплата или оценка по чекам). */
function Line({ l }: { l: ParkRegistryLine }) {
    return (
        <TableRow className="border-0 border-b border-solid border-border align-top">
            <TableCell className="py-2">
                <div className="font-semibold">{l.route}</div>
                <div className="text-[11.5px] text-muted-foreground">заявка {l.orderNumber} · погрузка {день(l.loadingDate)}</div>
            </TableCell>
            <TableCell className="py-2">
                <div>{l.driver.name}</div>
                <div className="text-[11.5px] text-muted-foreground">ИИН {иинКрасиво(l.driver.iin)}</div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{sum(l.driverTotal)}</TableCell>
            <TableCell className="text-right tabular-nums">
                <div>{sum(l.fuelIssued)}</div>
                <div className="text-[11px] text-muted-foreground">чеки {sum(l.fuelReceipts)}</div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
                <div>{sum(l.gross)}</div>
                {l.deductionAmount > 0 && <div className="text-[11px] text-muted-foreground">вычет {sum(l.deductionAmount)}</div>}
            </TableCell>
            <TableCell className="text-right tabular-nums">{sum(l.opv)}</TableCell>
            <TableCell className="text-right tabular-nums">{sum(l.vosms)}</TableCell>
            <TableCell className="text-right tabular-nums">{sum(l.ipn)}</TableCell>
            <TableCell className="text-right tabular-nums">{sum(l.so)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{sum(l.toBudget)}</TableCell>
            <TableCell className="text-right tabular-nums">
                <div>{sum(l.toPay)}</div>
                {!l.fixed && <div className="text-[11px] text-muted-foreground">оценка по чекам</div>}
            </TableCell>
            <TableCell className="text-right tabular-nums">{l.paid ? sum(l.paid) : '—'}</TableCell>
            <TableCell className="whitespace-nowrap"><StatusPill status={PILL[l.payStatus]} label={l.payStatusText} /></TableCell>
            <TableCell className="text-[11.5px]">
                {l.preliminary
                    ? <div className="font-medium text-amber-700 dark:text-amber-400">предварительный</div>
                    : <div className="text-muted-foreground">подтверждён</div>}
                {l.fuelReceiptsPending > 0 && <div className="text-muted-foreground">чеков ждут: {l.fuelReceiptsPending}</div>}
            </TableCell>
        </TableRow>
    );
}
