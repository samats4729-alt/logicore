'use client';

import { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { api } from '@/lib/api';
import { Accrual, месяцСловом, сумма, тенге } from '@/lib/payroll';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import styles from '@/components/nova/nova.module.css';

interface MonthRow {
    month: string;
    salary: number;
    percent: number;
    bonus: number;
    total: number;
}

/**
 * Мои начисления по месяцам за год — отчёт сотрудника.
 *
 * Страница «Моя зарплата» показывала один месяц, и чтобы понять, сколько
 * заработано за год или сравнить месяцы, их приходилось листать по одному
 * (владелец, 30.09.2026: «им тоже отчёт нужен»). Здесь все месяцы года
 * строками и итог за год; нажатие на месяц открывает его расшифровку ниже.
 */
export default function MyYearReport({ year, selected, lastMonth, reloadKey, onSelect }: {
    year: string;
    /** Какой месяц сейчас раскрыт ниже. */
    selected: string;
    /** Дальше этого месяца строк нет — там ещё ничего не начислено. */
    lastMonth: string;
    reloadKey?: number;
    onSelect: (month: string) => void;
}) {
    const [rows, setRows] = useState<MonthRow[] | null>(null);
    const [failed, setFailed] = useState(false);

    const to = `${year}-12` < lastMonth ? `${year}-12` : lastMonth;

    useEffect(() => {
        let alive = true;
        setRows(null);
        setFailed(false);
        if (to < `${year}-01`) { setRows([]); return; }
        api.get(`/payroll/my?from=${year}-01&to=${to}`)
            .then(res => {
                if (!alive) return;
                const accruals: Accrual[] = res.data?.accruals ?? [];
                const byMonth = new Map<string, MonthRow>();
                for (const a of accruals) {
                    const row = byMonth.get(a.periodMonth) ?? { month: a.periodMonth, salary: 0, percent: 0, bonus: 0, total: 0 };
                    if (a.kind === 'SALARY') row.salary += a.amount;
                    if (a.kind === 'PERCENT') row.percent += a.amount;
                    if (a.kind === 'KPI') row.bonus += a.amount;
                    row.total = row.salary + row.percent + row.bonus;
                    byMonth.set(a.periodMonth, row);
                }
                // Месяцы по порядку, начиная с первого, где что-то начислено:
                // пустые строки до прихода в компанию только мешают.
                const months: MonthRow[] = [];
                const last = Number(to.slice(5, 7));
                for (let m = 1; m <= last; m++) {
                    const key = `${year}-${String(m).padStart(2, '0')}`;
                    months.push(byMonth.get(key) ?? { month: key, salary: 0, percent: 0, bonus: 0, total: 0 });
                }
                const first = months.findIndex(r => r.total !== 0);
                setRows(first < 0 ? [] : months.slice(first));
            })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [year, to, reloadKey]);

    const sum = (pick: (r: MonthRow) => number) => (rows ?? []).reduce((s, r) => s + pick(r), 0);
    const showBonus = (rows ?? []).some(r => r.bonus > 0);

    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                <CalendarRange size={14} />
                <h2 className={styles.cardTitle}>По месяцам · {year}</h2>
            </div>
            {failed ? (
                <div className={styles.empty}>Не удалось загрузить начисления за год. Обновите страницу.</div>
            ) : !rows ? (
                <div className="h-40 animate-pulse" />
            ) : rows.length === 0 ? (
                <div className={styles.empty}>За {year} год начислений нет.</div>
            ) : (
                <Table className="border-collapse text-[13px]">
                    <TableHeader>
                        <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                            <TableHead className="h-9 text-[11px] uppercase tracking-wide">Месяц</TableHead>
                            <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Оклад</TableHead>
                            <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Проценты</TableHead>
                            {showBonus && <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Бонус</TableHead>}
                            <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Итого</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(r => (
                            <TableRow
                                key={r.month}
                                className={`cursor-pointer border-0 border-b border-solid border-border ${r.month === selected ? 'bg-muted/60 font-medium' : ''}`}
                                onClick={() => onSelect(r.month)}
                                aria-label={`Расшифровка: ${месяцСловом(r.month)}`}
                                data-state={r.month === selected ? 'selected' : undefined}
                            >
                                <TableCell className="whitespace-nowrap py-2 first-letter:uppercase">
                                    {месяцСловом(r.month)}
                                    {r.month === lastMonth && <span className="ml-2 hidden text-[11px] text-muted-foreground sm:inline">идёт сейчас</span>}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{сумма(r.salary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{сумма(r.percent)}</TableCell>
                                {showBonus && <TableCell className="text-right tabular-nums">{сумма(r.bonus)}</TableCell>}
                                <TableCell className="text-right font-semibold tabular-nums">{тенге(r.total)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter className="border-0 border-t border-solid border-border">
                        <TableRow className="border-0 font-semibold">
                            <TableCell>За {year} год</TableCell>
                            <TableCell className="text-right tabular-nums">{сумма(sum(r => r.salary))}</TableCell>
                            <TableCell className="text-right tabular-nums">{сумма(sum(r => r.percent))}</TableCell>
                            {showBonus && <TableCell className="text-right tabular-nums">{сумма(sum(r => r.bonus))}</TableCell>}
                            <TableCell className="text-right tabular-nums">{тенге(sum(r => r.total))}</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            )}
        </section>
    );
}
