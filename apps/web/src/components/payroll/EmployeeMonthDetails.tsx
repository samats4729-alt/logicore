'use client';

import { useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Clock, Pencil } from 'lucide-react';
import {
    EmployeeMonth, бонусСловами, причинаОжидания, рейсов, сумма, тенге, условияСловами,
} from '@/lib/payroll';
import { Button } from '@/components/ui/button';

/**
 * Месяц одного человека: за что начислено, что ещё придёт, сколько рейсов
 * до бонуса и как ему платят.
 *
 * Один блок на два места — карточку сотрудника в ведомости и «Мою
 * зарплату». Руководитель и сотрудник должны говорить об одних и тех же
 * цифрах, разложенных одинаково.
 */
export default function EmployeeMonthDetails({ data, showTotal = true, who = 'employee', onEditTerms }: {
    data: EmployeeMonth;
    /** Итог месяца крупной цифрой — на странице его уже показывают плитки. */
    showTotal?: boolean;
    /** Кому написано: руководителю про сотрудника или самому сотруднику. */
    who?: 'employee' | 'self';
    /** Есть — показываем кнопку правки условий (только руководителю). */
    onEditTerms?: () => void;
}) {
    const percents = data.accruals.filter(a => a.kind === 'PERCENT');
    const scheme = data.terms?.scheme ?? null;
    const paysPercent = !!scheme && scheme.percentValue > 0 && scheme.type !== 'FIXED';
    const bonusText = бонусСловами(data.terms?.bonusRules ?? []);
    const bonuses = data.accruals.filter(a => a.kind === 'KPI' && a.amount > 0);

    // Длинный список рейсов сворачиваем: при плане в 30 рейсов он вытеснил
    // бы всё остальное.
    const [allTrips, setAllTrips] = useState(false);
    const shownTrips = allTrips || data.planTrips.length <= 7 ? data.planTrips : data.planTrips.slice(0, 5);
    const hiddenTrips = data.planTrips.length - shownTrips.length;

    return (
        <div className="space-y-6 text-[13px]">
            {showTotal && (
                // Итог месяца — одна главная цифра, разбивка под ней.
                <section>
                    <div className="text-[12px] font-medium text-muted-foreground">Начислено за месяц</div>
                    <div className="mt-1 text-[24px] font-bold tabular-nums">{тенге(data.totals.total)}</div>
                    <div className="text-muted-foreground">
                        {[
                            data.totals.salary > 0 ? `оклад ${сумма(data.totals.salary)}` : null,
                            data.totals.percentTotal > 0 ? `проценты ${сумма(data.totals.percentTotal)}` : null,
                            data.totals.kpiTotal > 0 ? `бонус ${сумма(data.totals.kpiTotal)}` : null,
                        ].filter(Boolean).join(' · ') || 'за этот месяц ничего не начислено'}
                    </div>
                    {data.pendingTotal > 0 && (
                        <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" /> ещё придёт {тенге(data.pendingTotal)} с рейсов ниже
                        </div>
                    )}
                </section>
            )}

            <section>
                <h3 className="mb-2 text-[13px] font-semibold">Проценты по рейсам</h3>
                {percents.length === 0 && data.pending.length === 0 ? (
                    <p className="text-muted-foreground">
                        {paysPercent
                            ? 'За этот месяц процентов нет. Они начисляются, когда рейс доходит до события из условий.'
                            : who === 'self' ? 'Процент с рейсов вам не платится.' : 'Процент с рейсов этому сотруднику не платится.'}
                    </p>
                ) : (
                    <div className="divide-y divide-solid divide-border rounded-xl border border-solid border-border [&>*]:border-x-0">
                        {percents.map(a => (
                            <div key={a.id} className="flex items-start justify-between gap-3 px-3 py-2">
                                <div className="min-w-0">
                                    {a.order ? (
                                        <Link href={`/company/orders/${a.order.id}`} className="lc-ordernum" style={{ fontSize: 13 }}>{a.order.orderNumber}</Link>
                                    ) : <span className="font-medium">—</span>}
                                    <div className="text-[12px] text-muted-foreground">
                                        {a.baseAmount != null && `${a.percentBase === 'ORDER_AMOUNT' ? 'сумма рейса' : 'маржа'} ${сумма(a.baseAmount)} · ${a.percentValue ?? 0}%`}
                                        {a.reversedReason && ` · ${a.reversedReason}`}
                                    </div>
                                </div>
                                <span className="shrink-0 font-semibold tabular-nums">{тенге(a.amount)}</span>
                            </div>
                        ))}
                        {data.pending.map(p => (
                            <div key={p.orderId} className="flex items-start justify-between gap-3 bg-muted/40 px-3 py-2">
                                <div className="min-w-0">
                                    <Link href={`/company/orders/${p.orderId}`} className="lc-ordernum" style={{ fontSize: 13 }}>{p.orderNumber}</Link>
                                    <div className="text-[12px] text-muted-foreground">
                                        {p.percentBase === 'ORDER_AMOUNT' ? 'сумма рейса' : 'маржа'} {сумма(p.baseAmount)} · {p.percentValue}% · {причинаОжидания(p.reason)}
                                    </div>
                                </div>
                                <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground" title="Оценка по сегодняшней цене — начислится после события">
                                    <Clock className="h-3.5 w-3.5" /> {тенге(p.amount)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {(data.bonusProgress.length > 0 || bonuses.length > 0) && (
                <section>
                    <h3 className="mb-2 text-[13px] font-semibold">Бонус за план</h3>
                    <div className="space-y-3">
                        {bonuses.map(a => (
                            <div key={a.id} className="flex justify-between gap-3">
                                <span>Начислен{a.threshold ? ` · план ${рейсов(a.threshold)}` : ''}</span>
                                <span className="shrink-0 font-semibold tabular-nums">{тенге(a.amount)}</span>
                            </div>
                        ))}
                        {data.bonusProgress.map(b => {
                            const left = Math.max(b.threshold - b.done, 0);
                            // План выполнен и бонус уже в строке «Начислен» —
                            // полоса «3 из 3» повторила бы то же самое.
                            if (left === 0 && bonuses.some(a => a.threshold === b.threshold)) return null;
                            const share = Math.min(b.done / b.threshold, 1);
                            return (
                                <div key={b.ruleId}>
                                    <div className="flex justify-between gap-3">
                                        <span>{left === 0 ? 'План выполнен' : `Осталось ${рейсов(left)}`}</span>
                                        <span className="tabular-nums text-muted-foreground">{b.done} из {b.threshold} · {тенге(b.bonusAmount)}</span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={b.done} aria-valuemin={0} aria-valuemax={b.threshold}>
                                        <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* За какие рейсы бонус: руководитель видел «10 из 10» и
                        сумму, но не сами рейсы — сверить было не с чем. */}
                    <div className="mt-3">
                        <div className="mb-1.5 text-[12px] text-muted-foreground">
                            {data.planTrips.length > 0
                                ? `Рейсы в зачёт плана · ${data.planTrips.length}`
                                : 'Завершённых рейсов в этом месяце пока нет.'}
                        </div>
                        {data.planTrips.length > 0 && (
                            <div
                                className="divide-y divide-solid divide-border rounded-xl border border-solid border-border [&>*]:border-x-0"
                                aria-label="Рейсы в зачёт плана"
                            >
                                {shownTrips.map(t => (
                                    <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                                        <div className="flex min-w-0 items-baseline gap-2">
                                            <Link href={`/company/orders/${t.id}`} className="lc-ordernum" style={{ fontSize: 13 }}>{t.orderNumber}</Link>
                                            {t.customer && <span className="truncate text-[12px] text-muted-foreground">{t.customer}</span>}
                                        </div>
                                        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                                            завершён {dayjs(t.completedAt).format('DD.MM')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {hiddenTrips > 0 && (
                            <button type="button" className="lc-link mt-1.5 text-[12px]" onClick={() => setAllTrips(true)}>
                                Показать все {data.planTrips.length}
                            </button>
                        )}
                    </div>
                </section>
            )}

            <section className="rounded-xl border border-solid border-border p-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-[13px] font-semibold">
                            {who === 'self' ? 'Как вам платят' : 'Как платим'}
                        </h3>
                        <p className="mt-1">{условияСловами(scheme)}</p>
                        {bonusText && <p className="mt-0.5 text-muted-foreground">Бонус {bonusText}</p>}
                        {who === 'self' && (
                            <p className="mt-2 text-[12px] text-muted-foreground">Условия задаёт руководитель в разделе «Зарплата».</p>
                        )}
                    </div>
                    {onEditTerms && (
                        <Button variant="outline" size="sm" className="shrink-0" onClick={onEditTerms}>
                            <Pencil className="h-3.5 w-3.5" /> Изменить
                        </Button>
                    )}
                </div>
            </section>
        </div>
    );
}
