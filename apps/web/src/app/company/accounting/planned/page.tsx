'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { ArrowLeft, CalendarDays, Download, FileWarning } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/exportCsv';
import { SETTLEMENT_SIDES } from '@/lib/vocabulary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PlannedRow {
    documentId: string;
    invoiceNumber: string;
    orderId: string | null;
    orderNumber: string;
    orders: { id: string; orderNumber: string }[];
    direction: 'IN' | 'OUT';
    party: string;
    amount: number;
    invoiceTotal: number;
    paidAmount: number;
    issuedAt: string;
    dueDate: string | null;
    isOverdue: boolean;
}

interface WithoutInvoice {
    count: number;
    totalIn: number;
    totalOut: number;
    items: { orderId: string; orderNumber: string; party: string | null; amountIn: number; amountOut: number }[];
}

const money = (n: number) => `${Math.round(n || 0).toLocaleString('ru-RU')} ₸`;

/**
 * Планируемые платежи.
 *
 * Список строится из ВЫСТАВЛЕННЫХ СЧЕТОВ: пока счёт не выставлен, срок
 * оплаты не начался. Сделки с долгом, но без счёта, показаны отдельным
 * блоком — это работа для бухгалтера, а не ожидаемый платёж.
 */
export default function PlannedPaymentsPage() {
    const router = useRouter();
    const [rows, setRows] = useState<PlannedRow[]>([]);
    const [totals, setTotals] = useState({ totalIn: 0, totalOut: 0, overdueIn: 0, overdueOut: 0 });
    const [withoutInvoice, setWithoutInvoice] = useState<WithoutInvoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState<'all' | 'IN' | 'OUT'>('all');

    useEffect(() => {
        api.get('/accounting/planned-payments')
            .then((res) => {
                setRows(res.data?.rows || []);
                setTotals(res.data?.totals || { totalIn: 0, totalOut: 0, overdueIn: 0, overdueOut: 0 });
                setWithoutInvoice(res.data?.withoutInvoice || null);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(
        () => rows.filter((r) => typeFilter === 'all' || r.direction === typeFilter),
        [rows, typeFilter],
    );

    const filters: { key: 'all' | 'IN' | 'OUT'; label: string }[] = [
        { key: 'all', label: 'Все' },
        { key: 'IN', label: SETTLEMENT_SIDES.receivableShort },
        { key: 'OUT', label: SETTLEMENT_SIDES.payableShort },
    ];

    const exportCsv = () => downloadCsv(
        `Планируемые_платежи_${dayjs().format('YYYY-MM-DD')}`,
        ['Срок оплаты', 'Счёт', 'Выставлен', 'Тип', 'Заявки', 'Контрагент', 'К оплате'],
        filtered.map((r) => [
            r.dueDate ? dayjs(r.dueDate).format('DD.MM.YYYY') : 'не указана',
            r.invoiceNumber,
            dayjs(r.issuedAt).format('DD.MM.YYYY'),
            r.direction === 'IN' ? SETTLEMENT_SIDES.receivable : SETTLEMENT_SIDES.payable,
            r.orderNumber,
            r.party,
            r.amount,
        ]),
    );

    return (
        <div className="lc-page min-h-screen bg-background p-6">
            <div className="mx-auto max-w-[1180px]">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                        <Button variant="ghost" size="icon" onClick={() => router.push('/company/finance')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">Планируемые платежи</h1>
                            <p className="text-sm text-muted-foreground">
                                Срок отсчитывается от выставленного счёта, а не от даты в карточке рейса
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" disabled={filtered.length === 0} onClick={exportCsv}>
                            <Download className="h-4 w-4" /> Экспорт
                        </Button>
                        <Button variant="outline" onClick={() => router.push('/company/accounting/calendar')}>
                            <CalendarDays className="h-4 w-4" /> Календарь
                        </Button>
                    </div>
                </div>

                <div className="mb-5 grid gap-4 sm:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>{SETTLEMENT_SIDES.receivable}</CardDescription>
                            <CardTitle className="text-2xl tabular-nums text-emerald-600">{money(totals.totalIn)}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground">
                            {totals.overdueIn > 0
                                ? <span className="text-destructive">Просрочено: {money(totals.overdueIn)}</span>
                                : 'Просрочек нет'}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>{SETTLEMENT_SIDES.payable}</CardDescription>
                            <CardTitle className="text-2xl tabular-nums text-destructive">{money(totals.totalOut)}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground">
                            {totals.overdueOut > 0
                                ? <span className="text-destructive">Просрочено: {money(totals.overdueOut)}</span>
                                : 'Просрочек нет'}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Итоговый поток</CardDescription>
                            <CardTitle className={cn(
                                'text-2xl tabular-nums',
                                totals.totalIn - totals.totalOut >= 0 ? 'text-foreground' : 'text-destructive',
                            )}>
                                {totals.totalIn - totals.totalOut >= 0 ? '+' : ''}{money(totals.totalIn - totals.totalOut)}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground">
                            Счетов в плане: {rows.length}
                        </CardContent>
                    </Card>
                </div>

                {/* Сделки без счёта: срок оплаты по ним не начался, поэтому в
                    план они не попадают — но и потеряться не должны. */}
                {withoutInvoice && withoutInvoice.count > 0 && (
                    <Card className="mb-5 border-amber-300 bg-amber-50">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-amber-900">
                                <FileWarning className="h-4 w-4" />
                                Счёт не выставлен: {withoutInvoice.count}
                            </CardTitle>
                            <CardDescription className="text-amber-800">
                                По этим сделкам есть задолженность, но счёта нет — значит, срок оплаты не начался
                                и ждать платежа не с чего.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="mb-3 flex flex-wrap gap-4 text-sm text-amber-900">
                                {withoutInvoice.totalIn > 0 && (
                                    <span>{SETTLEMENT_SIDES.receivableShort}: <b className="tabular-nums">{money(withoutInvoice.totalIn)}</b></span>
                                )}
                                {withoutInvoice.totalOut > 0 && (
                                    <span>{SETTLEMENT_SIDES.payableShort}: <b className="tabular-nums">{money(withoutInvoice.totalOut)}</b></span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {withoutInvoice.items.map((item) => (
                                    <Button
                                        key={item.orderId}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => router.push(`/company/orders/${item.orderId}`)}
                                    >
                                        {item.orderNumber}
                                    </Button>
                                ))}
                                {withoutInvoice.count > withoutInvoice.items.length && (
                                    <span className="self-center text-sm text-amber-800">
                                        и ещё {withoutInvoice.count - withoutInvoice.items.length}
                                    </span>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="mb-4 flex gap-2">
                    {filters.map((f) => (
                        <Button
                            key={f.key}
                            size="sm"
                            variant={typeFilter === f.key ? 'default' : 'outline'}
                            onClick={() => setTypeFilter(f.key)}
                        >
                            {f.label}
                        </Button>
                    ))}
                </div>

                <Card>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-10 text-center text-sm text-muted-foreground">Загрузка…</div>
                        ) : filtered.length === 0 ? (
                            <div className="p-10 text-center">
                                <div className="text-sm font-medium text-foreground">Ожидаемых платежей нет</div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    Платёж попадает сюда, когда бухгалтерия выставляет счёт по сделке.
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-3 text-left font-semibold">Срок оплаты</th>
                                            <th className="px-4 py-3 text-left font-semibold">Счёт</th>
                                            <th className="px-4 py-3 text-left font-semibold">Контрагент</th>
                                            <th className="px-4 py-3 text-left font-semibold">Рейсы</th>
                                            <th className="px-4 py-3 text-right font-semibold">К оплате</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((r) => (
                                            <tr key={r.documentId} className="border-b border-border last:border-0 hover:bg-muted/40">
                                                <td className="px-4 py-3 align-top">
                                                    {r.dueDate ? (
                                                        <div className={cn('font-medium', r.isOverdue && 'text-destructive')}>
                                                            {dayjs(r.dueDate).format('DD.MM.YYYY')}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">срок не указан</span>
                                                    )}
                                                    {r.isOverdue && (
                                                        <Badge variant="destructive" className="mt-1">Просрочен</Badge>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-semibold text-foreground">{r.invoiceNumber}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        выставлен {dayjs(r.issuedAt).format('DD.MM.YYYY')}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div>{r.party}</div>
                                                    <Badge variant={r.direction === 'IN' ? 'success' : 'warning'} className="mt-1">
                                                        {r.direction === 'IN' ? 'нам заплатят' : 'платим мы'}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                                                        {r.orders.length === 0 && <span className="text-muted-foreground">—</span>}
                                                        {r.orders.map((o) => (
                                                            <button
                                                                key={o.id}
                                                                type="button"
                                                                className="text-primary hover:underline"
                                                                onClick={() => router.push(`/company/orders/${o.id}`)}
                                                            >
                                                                {o.orderNumber}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right align-top">
                                                    <div className={cn(
                                                        'font-semibold tabular-nums',
                                                        r.direction === 'IN' ? 'text-emerald-600' : 'text-destructive',
                                                    )}>
                                                        {r.direction === 'IN' ? '+' : '−'}{money(r.amount)}
                                                    </div>
                                                    {r.paidAmount > 0 && (
                                                        <div className="text-xs tabular-nums text-muted-foreground">
                                                            оплачено {money(r.paidAmount)} из {money(r.invoiceTotal)}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
