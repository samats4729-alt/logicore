'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/vocabulary';
import Loader from '@/components/ui/Loader';
import nova from '@/components/nova/nova.module.css';
import dash from '@/app/company/dashboard.module.css';
import styles from './earnings-card.module.css';

/**
 * Кто сколько заработал в этом месяце — на главной у владельца компании.
 *
 * Раньше здесь висела задолженность, но она уже есть целой страницей во
 * «Взаиморасчётах», и на дашборде повторялась третий раз. А вот сколько
 * компания должна своим — оклад, процент с рейсов и премии по KPI — не было
 * видно нигде, кроме отдельной страницы зарплат, куда заходят раз в месяц.
 *
 * Это сводка, а не расчётная ведомость: показываем верхних по заработку.
 * Кто ниже — на странице «Зарплата», ссылка в шапке карточки.
 */

/** Строка отчёта `/payroll/report` — одна на сотрудника за период. */
interface EarningsRow {
    userId: string;
    name: string;
    role: string;
    /** Оклад за месяц. */
    salary: number;
    /** Процент с рейсов. */
    percentTotal: number;
    /** Премии по KPI. */
    kpiTotal: number;
    total: number;
    ordersCount: number;
}

interface EarningsReport {
    report: EarningsRow[];
    totals: { salary: number; percentTotal: number; kpiTotal: number; total: number };
}

/** Сколько строк помещается в карточку, не превращая её в таблицу. */
const ПОКАЗЫВАЕМ = 5;

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

export default function EmployeeEarningsCard() {
    const router = useRouter();
    const [data, setData] = useState<EarningsReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [available, setAvailable] = useState(true);

    useEffect(() => {
        // Без параметров отчёт считает текущий месяц по календарю Казахстана.
        api.get('/payroll/report')
            .then(res => setData(res.data))
            .catch(() => setAvailable(false))
            .finally(() => setLoading(false));
    }, []);

    if (!available) return null;

    // Сортируем здесь, а не на сервере: отчёт общий с полной страницей
    // зарплат, а там порядок другой — по фамилии.
    const строки = (data?.report ?? [])
        .filter(r => r.total > 0)
        .sort((a, b) => b.total - a.total);
    const видимые = строки.slice(0, ПОКАЗЫВАЕМ);
    const скрыто = строки.length - видимые.length;

    return (
        <section className={nova.card}>
            <div className={nova.cardHead}>
                <Wallet size={14} />
                <h2 className={nova.cardTitle}>Заработок за месяц</h2>
                <button
                    type="button"
                    className={dash.headLink}
                    onClick={() => router.push('/company/payroll')}
                >
                    Зарплата <ArrowRight size={12} />
                </button>
            </div>

            {loading ? (
                <div className={nova.empty}><Loader /></div>
            ) : !строки.length ? (
                // Пустота объясняет себя: чаще всего дело не в том, что никто
                // не работал, а в том, что схема начисления ещё не заведена.
                <div className={nova.empty}>
                    Начислений за этот месяц нет. Оклад и процент задаются
                    в разделе «Зарплата».
                </div>
            ) : (
                <div className={nova.cardBody}>
                    <div className={styles.rows}>
                        {видимые.map((строка) => (
                            <div key={строка.userId} className={styles.row}>
                                <div className={styles.who}>
                                    <span className={styles.name}>{строка.name}</span>
                                    <span className={styles.role}>
                                        {ROLE_LABELS[строка.role] || строка.role}
                                        {строка.ordersCount > 0 && ` · ${строка.ordersCount} ${рейсовСловом(строка.ordersCount)}`}
                                    </span>
                                </div>
                                <div className={styles.money}>
                                    <b className={styles.total}>{fmt(строка.total)} ₸</b>
                                    {/* Из чего сложилось: оклад и премия — разные
                                        разговоры с сотрудником, и в сводке их
                                        стоит различать. */}
                                    <span className={styles.parts}>{разбор(строка)}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.foot}>
                        <span>
                            {скрыто > 0
                                ? `и ещё ${скрыто} ${сотрудниковСловом(скрыто)}`
                                : `всего ${строки.length} ${сотрудниковСловом(строки.length)}`}
                        </span>
                        <b className={styles.grand}>{fmt(data?.totals.total ?? 0)} ₸</b>
                    </div>
                </div>
            )}
        </section>
    );
}

/** «оклад 200 000 · процент 45 000 · премия 30 000» — только то, что не ноль. */
function разбор(строка: EarningsRow): string {
    return [
        строка.salary > 0 ? `оклад ${fmt(строка.salary)}` : null,
        строка.percentTotal > 0 ? `процент ${fmt(строка.percentTotal)}` : null,
        строка.kpiTotal > 0 ? `премия ${fmt(строка.kpiTotal)}` : null,
    ].filter(Boolean).join(' · ');
}

/** «1 рейс» / «3 рейса» / «5 рейсов». */
function рейсовСловом(n: number): string {
    const хвост = n % 100;
    const последняя = n % 10;
    if (хвост > 10 && хвост < 20) return 'рейсов';
    if (последняя === 1) return 'рейс';
    if (последняя >= 2 && последняя <= 4) return 'рейса';
    return 'рейсов';
}

/** «1 сотрудник» / «3 сотрудника» / «5 сотрудников». */
function сотрудниковСловом(n: number): string {
    const хвост = n % 100;
    const последняя = n % 10;
    if (хвост > 10 && хвост < 20) return 'сотрудников';
    if (последняя === 1) return 'сотрудник';
    if (последняя >= 2 && последняя <= 4) return 'сотрудника';
    return 'сотрудников';
}
