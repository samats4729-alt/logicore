'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Clock, Table2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/vocabulary';
import { Ledger, LedgerRow, бонусСловами, месяцСловом, сумма, тенге, условияСловами } from '@/lib/payroll';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import styles from '@/components/nova/nova.module.css';

/**
 * Ведомость за месяц — «кому и сколько платить».
 *
 * По строке на человека: как ему платят (словами), сколько рейсов, оклад,
 * процент, бонус и итог. Нажатие на строку открывает карточку сотрудника —
 * за какие рейсы начислено и что ещё придёт.
 *
 * Что строка нажимается, раньше ничего не подсказывало, и владелец решил,
 * что рейсов за начислениями не видно вовсе (30.09.2026). Теперь в конце
 * строки стрелка, а над таблицей — подсказка.
 */
export default function PayrollLedger({ month, reloadKey, onOpenEmployee }: {
    month: string;
    /** Меняется после правки условий — ведомость перечитывается. */
    reloadKey: number;
    onOpenEmployee: (userId: string) => void;
}) {
    const [data, setData] = useState<Ledger | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        setData(null);
        setFailed(false);
        api.get(`/payroll/report?from=${month}&to=${month}`)
            .then(res => { if (alive) setData(res.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [month, reloadKey]);

    if (failed) {
        return (
            <div className={styles.card}>
                <div className={styles.empty}>Не удалось построить ведомость. Обновите страницу — если не поможет, напишите в поддержку.</div>
            </div>
        );
    }

    if (!data) {
        return (
            <>
                <div className={styles.tiles}>
                    {[0, 1, 2, 3].map(i => <div key={i} className={`${styles.tile} h-[86px] animate-pulse`} />)}
                </div>
                <div className={`${styles.card} h-64 animate-pulse`} />
            </>
        );
    }

    /**
     * Колонка и плитка «Бонусы» — только если бонусы за план в компании
     * включены или за месяц что-то начислено. Иначе это всегда ноль про то,
     * чего компания не заводила.
     */
    const showBonuses = data.bonusesEnabled || data.totals.kpiTotal > 0;
    const t = data.totals;

    return (
        <>
            {/* К выплате — зелёным: единственное место, где цвет разрешён
                поверх чёрно-белой темы. */}
            <div className={`${styles.tiles} ${showBonuses ? '' : styles.tiles3}`}>
                <div className={styles.tile}>
                    <div className={styles.tileHead}><span className={styles.tileLabel}>К выплате за месяц</span></div>
                    <div className={`${styles.tileValue} ${styles.valuePos}`}>{тенге(t.total)}</div>
                    <div className={styles.tileSub}>{data.report.length} сотрудников</div>
                </div>
                <div className={styles.tile}>
                    <div className={styles.tileHead}><span className={styles.tileLabel}>Оклады</span></div>
                    <div className={styles.tileValue}>{тенге(t.salary)}</div>
                </div>
                <div className={styles.tile}>
                    <div className={styles.tileHead}><span className={styles.tileLabel}>Проценты с рейсов</span></div>
                    <div className={styles.tileValue}>{тенге(t.percentTotal)}</div>
                    <div className={styles.tileSub}>
                        {t.pendingPercent > 0 ? `ещё ${тенге(t.pendingPercent)} придёт позже` : 'всё начислено'}
                    </div>
                </div>
                {showBonuses && (
                    <div className={styles.tile}>
                        <div className={styles.tileHead}><span className={styles.tileLabel}>Бонусы за план</span></div>
                        <div className={styles.tileValue}>{тенге(t.kpiTotal)}</div>
                    </div>
                )}
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Table2 size={14} />
                    <h2 className={styles.cardTitle}>Кому сколько · {месяцСловом(month)}</h2>
                    {data.report.length > 0 && (
                        <span className="ml-auto mr-3 hidden text-[12px] text-muted-foreground sm:inline">
                            Нажмите на сотрудника — откроется, за какие рейсы начислено
                        </span>
                    )}
                    <span className={styles.cardCount}>{data.report.length}</span>
                </div>
                {data.report.length === 0 ? (
                    <div className={styles.empty}>
                        В ведомости пока никого. Сотрудники появятся здесь, когда вы добавите их
                        в разделе «Сотрудники».
                    </div>
                ) : (
                    <Table className="border-collapse text-[13px]">
                        <TableHeader>
                            <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Сотрудник · как платим</TableHead>
                                <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Рейсов</TableHead>
                                <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Оклад</TableHead>
                                <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Проценты</TableHead>
                                {showBonuses && <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Бонус</TableHead>}
                                <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Итого</TableHead>
                                <TableHead className="h-9 w-8" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.report.map(row => (
                                <LedgerLine key={row.userId} row={row} showBonuses={showBonuses} onOpen={() => onOpenEmployee(row.userId)} />
                            ))}
                        </TableBody>
                        <TableFooter className="border-0 border-t border-solid border-border">
                            <TableRow className="border-0 font-semibold">
                                <TableCell>Итого</TableCell>
                                <TableCell className="text-right tabular-nums">{data.report.reduce((s, r) => s + r.ordersCount, 0)}</TableCell>
                                <TableCell className="text-right tabular-nums">{сумма(t.salary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{сумма(t.percentTotal)}</TableCell>
                                {showBonuses && <TableCell className="text-right tabular-nums">{сумма(t.kpiTotal)}</TableCell>}
                                <TableCell className="text-right tabular-nums">{тенге(t.total)}</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableFooter>
                    </Table>
                )}
            </section>
        </>
    );
}

function LedgerLine({ row, showBonuses, onOpen }: { row: LedgerRow; showBonuses: boolean; onOpen: () => void }) {
    const bonus = бонусСловами(row.bonusRules);
    return (
        <TableRow
            className="cursor-pointer border-0 border-b border-solid border-border"
            onClick={onOpen}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
            tabIndex={0}
            aria-label={`Открыть начисления: ${row.name}`}
        >
            <TableCell className="py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{row.name}</span>
                    <span className="text-muted-foreground">· {ROLE_LABELS[row.role] || row.role}</span>
                    {!row.isActive && <span className={styles.chip}>удалён</span>}
                </div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {условияСловами(row.scheme)}{bonus ? ` · бонус ${bonus}` : ''}
                </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.ordersCount}</TableCell>
            <TableCell className="text-right tabular-nums">{сумма(row.salary)}</TableCell>
            <TableCell className="text-right tabular-nums">
                {сумма(row.percentTotal)}
                {row.pendingPercent > 0 && (
                    <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground" title="Придёт после оплаты или завершения рейсов">
                        <Clock className="h-3 w-3" /> +{сумма(row.pendingPercent)}
                    </div>
                )}
            </TableCell>
            {showBonuses && <TableCell className="text-right tabular-nums">{сумма(row.kpiTotal)}</TableCell>}
            <TableCell className="text-right font-semibold tabular-nums">{тенге(row.total)}</TableCell>
            <TableCell className="w-8 pl-0 text-muted-foreground">
                <ChevronRight className="h-4 w-4" aria-hidden />
            </TableCell>
        </TableRow>
    );
}
