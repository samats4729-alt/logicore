'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';
import { cn } from '@/lib/utils';
import styles from '@/components/nova/nova.module.css';

interface Deal {
    id: string;
    orderNumber: string;
    createdAt: string;
    status: string;
    route: string;
    customer: string | null;
    isCustomerPaid: boolean;
    revenue: number;
    cost: number;
    margin: number;
    marginPct: number;
}

interface ManagerRow {
    managerId: string | null;
    manager: string;
    orders: number;
    revenue: number;
    cost: number;
    margin: number;
    marginPct: number;
    deals: Deal[];
}

interface Report {
    rows: ManagerRow[];
    totals: { orders: number; revenue: number; cost: number; margin: number };
}

const money = (v: number) => `${(v || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₸`;
const pct = (margin: number, revenue: number) => (revenue > 0 ? Math.round((margin / revenue) * 100) : 0);

/**
 * Маржа по менеджерам (задачи шефа, J8): объём → менеджеры → сделки.
 *
 * Строка менеджера раскрывается его сделками — с маршрутом, заказчиком,
 * маржой и тем, оплатил ли заказчик. Деньги считает сервер тем же
 * калькулятором, что «Прибыль по перевозчику».
 */
export default function ManagerProfitPage() {
    const [from, setFrom] = useState(() => dayjs().startOf('month').format('YYYY-MM-DD'));
    const [to, setTo] = useState(() => dayjs().endOf('month').format('YYYY-MM-DD'));
    const [report, setReport] = useState<Report | null>(null);
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState<Set<string>>(new Set());

    useEffect(() => {
        let alive = true;
        setReport(null);
        setFailed(false);
        api.get<Report>('/accounting/manager-profit', {
            params: {
                startDate: dayjs(from).startOf('day').toISOString(),
                endDate: dayjs(to).endOf('day').toISOString(),
            },
        })
            .then((r) => { if (alive) setReport(r.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [from, to]);

    const toggle = (key: string) => setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const totals = report?.totals;

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Отчёты</div>
                    <h1 className={styles.title}>Маржа по менеджерам</h1>
                    <p className={styles.subtitle}>
                        Сколько заработал каждый менеджер: выручка от заказчиков минус оплата перевозчикам.
                        Нажмите на менеджера — откроются его сделки.
                    </p>
                </div>
            </div>

            <div className="mb-3 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-muted-foreground">С</span>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 text-[13px]" />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-muted-foreground">По</span>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 text-[13px]" />
                </label>
                {totals && (
                    <div className="ml-auto flex flex-wrap gap-6 text-[13px]">
                        <div><div className="text-muted-foreground">Сделок</div><div className="text-[18px] font-semibold tabular-nums">{totals.orders}</div></div>
                        <div><div className="text-muted-foreground">Выручка</div><div className="text-[18px] font-semibold tabular-nums">{money(totals.revenue)}</div></div>
                        <div>
                            <div className="text-muted-foreground">Маржа</div>
                            <div className={cn('text-[18px] font-semibold tabular-nums', totals.margin >= 0 ? 'text-green-600' : 'text-red-600')}>
                                {money(totals.margin)} · {pct(totals.margin, totals.revenue)}%
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Users size={14} />
                    <h2 className={styles.cardTitle}>Менеджеры</h2>
                    {report && <span className={styles.cardCount}>{report.rows.length}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить отчёт — обновите страницу.</div>
                ) : !report ? (
                    <div className="space-y-2 p-4" aria-label="Загрузка">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />)}</div>
                ) : report.rows.length === 0 ? (
                    <div className={styles.empty}>За этот период сделок нет.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table className="border-collapse text-[13px]">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9">Менеджер / сделка</TableHead>
                                    <TableHead className="h-9">Маршрут и заказчик</TableHead>
                                    <TableHead className="h-9 text-right">Сделок</TableHead>
                                    <TableHead className="h-9 text-right">Выручка</TableHead>
                                    <TableHead className="h-9 text-right">Перевозчикам</TableHead>
                                    <TableHead className="h-9 text-right">Маржа</TableHead>
                                    <TableHead className="h-9 text-right">%</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report.rows.map((row) => {
                                    const key = row.managerId ?? '—';
                                    const expanded = open.has(key);
                                    return (
                                        <Fragment key={key}>
                                            <TableRow
                                                className="cursor-pointer border-0 border-b border-solid border-border"
                                                onClick={() => toggle(key)}
                                                aria-expanded={expanded}
                                            >
                                                <TableCell className="py-2.5 font-semibold">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        {row.manager}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-2.5 text-muted-foreground">
                                                    {expanded ? '' : 'нажмите, чтобы увидеть сделки'}
                                                </TableCell>
                                                <TableCell className="py-2.5 text-right tabular-nums">{row.orders}</TableCell>
                                                <TableCell className="py-2.5 text-right tabular-nums">{money(row.revenue)}</TableCell>
                                                <TableCell className="py-2.5 text-right tabular-nums">{money(row.cost)}</TableCell>
                                                <TableCell className={cn('py-2.5 text-right font-semibold tabular-nums', row.margin >= 0 ? 'text-green-600' : 'text-red-600')}>
                                                    {money(row.margin)}
                                                </TableCell>
                                                <TableCell className="py-2.5 text-right tabular-nums">{row.marginPct}%</TableCell>
                                            </TableRow>
                                            {expanded && row.deals.map((d) => (
                                                <TableRow key={d.id} className="border-0 border-b border-solid border-border bg-muted/30 align-top">
                                                    <TableCell className="py-2 pl-9">
                                                        <Link href={`/company/orders/${d.id}`} className="lc-ordernum">{d.orderNumber}</Link>
                                                        <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                                                            {dayjs(d.createdAt).format('DD.MM.YYYY')}
                                                            <StatusPill status={d.status} />
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-2">
                                                        <div>{d.route}</div>
                                                        <div className="text-[12px] text-muted-foreground">
                                                            {d.customer ?? '—'} · {d.isCustomerPaid ? 'оплачено' : 'не оплачено'}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-2" />
                                                    <TableCell className="py-2 text-right tabular-nums">{money(d.revenue)}</TableCell>
                                                    <TableCell className="py-2 text-right tabular-nums">{money(d.cost)}</TableCell>
                                                    <TableCell className={cn('py-2 text-right tabular-nums', d.margin >= 0 ? 'text-green-600' : 'text-red-600')}>
                                                        {money(d.margin)}
                                                    </TableCell>
                                                    <TableCell className="py-2 text-right tabular-nums">{d.marginPct}%</TableCell>
                                                </TableRow>
                                            ))}
                                        </Fragment>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>
        </div>
    );
}
