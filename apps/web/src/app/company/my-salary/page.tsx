'use client';

import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { EmployeeMonth, месяцСловом, тенге } from '@/lib/payroll';
import MonthSwitcher from '@/components/payroll/MonthSwitcher';
import EmployeeMonthDetails from '@/components/payroll/EmployeeMonthDetails';
import MyYearReport from '@/components/payroll/MyYearReport';
import styles from '@/components/nova/nova.module.css';

/**
 * Что человеку начислено — его собственный экран.
 *
 * Сервер отдаёт только свои начисления: чужую зарплату отсюда не видно ни
 * при каких правах. Разложено так же, как в карточке сотрудника у
 * руководителя, — чтобы разговор о деньгах шёл по одним и тем же числам.
 *
 * Здесь же — как человеку платят, сколько рейсов осталось до бонуса и что
 * придёт позже. Раньше сотрудник видел только итог и не понимал, почему за
 * рейс ноль: рейс не оплачен, и процент придёт после оплаты.
 *
 * Под плитками — отчёт по месяцам за год: сколько вышло в каждом месяце и
 * итог за год. Нажатие на месяц раскрывает его расшифровку ниже.
 */
export default function MySalaryPage() {
    const currentMonth = dayjs().format('YYYY-MM');
    const [month, setMonth] = useState(currentMonth);
    const [data, setData] = useState<EmployeeMonth | null>(null);
    const [failed, setFailed] = useState(false);
    const detailsRef = useRef<HTMLElement>(null);

    useEffect(() => {
        let alive = true;
        setData(null);
        setFailed(false);
        api.get(`/payroll/my?from=${month}&to=${month}`)
            .then(res => { if (alive) setData(res.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [month]);

    /**
     * Бонусы показываем, если бонус за план человеку положен или уже
     * начислялся. Компании, которые планов не ставят, иначе видели бы у
     * сотрудников вечный «0 ₸» про то, чего у них нет.
     */
    const showBonuses = !!data && (data.bonusesEnabled || data.totals.kpiTotal > 0);

    const openMonth = (m: string) => {
        setMonth(m);
        detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Деньги · Мои начисления</div>
                    <h1 className={styles.title}>Моя зарплата</h1>
                    <p className={styles.subtitle}>
                        Сколько начислено вам и за что. Чужих начислений здесь нет.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <MonthSwitcher value={month} max={currentMonth} onChange={setMonth} />
                </div>
            </div>

            {failed ? null : !data ? (
                <div className={styles.tiles}>
                    {[0, 1, 2, 3].map(i => <div key={i} className={`${styles.tile} h-[86px] animate-pulse`} />)}
                </div>
            ) : (
                /* Начислено — зелёным: единственное место, где цвет разрешён
                   поверх чёрно-белой темы. */
                <div className={`${styles.tiles} ${showBonuses ? '' : styles.tiles3}`}>
                    <div className={styles.tile}>
                        <div className={styles.tileHead}><span className={styles.tileLabel}>Всего за месяц</span></div>
                        <div className={`${styles.tileValue} ${styles.valuePos}`}>{тенге(data.totals.total)}</div>
                        <div className={styles.tileSub}>
                            {data.pendingTotal > 0 ? `ещё ${тенге(data.pendingTotal)} придёт позже` : месяцСловом(month)}
                        </div>
                    </div>
                    <div className={styles.tile}>
                        <div className={styles.tileHead}><span className={styles.tileLabel}>Оклад</span></div>
                        <div className={styles.tileValue}>{тенге(data.totals.salary)}</div>
                    </div>
                    <div className={styles.tile}>
                        <div className={styles.tileHead}><span className={styles.tileLabel}>Проценты с рейсов</span></div>
                        <div className={styles.tileValue}>{тенге(data.totals.percentTotal)}</div>
                    </div>
                    {showBonuses && (
                        <div className={styles.tile}>
                            <div className={styles.tileHead}><span className={styles.tileLabel}>Бонус за план</span></div>
                            <div className={styles.tileValue}>{тенге(data.totals.kpiTotal)}</div>
                        </div>
                    )}
                </div>
            )}

            {/* Отчёт за год не зависит от выбранного месяца внутри года: при
                переключении месяца он не перезагружается и не мигает. */}
            <MyYearReport
                year={month.slice(0, 4)}
                selected={month}
                lastMonth={currentMonth}
                onSelect={openMonth}
            />

            <section ref={detailsRef} className={`${styles.card} scroll-mt-20`}>
                <div className={styles.cardHead}>
                    <Wallet size={14} />
                    <h2 className={styles.cardTitle}>За что начислено · {месяцСловом(month)}</h2>
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить начисления за месяц. Обновите страницу.</div>
                ) : !data ? (
                    <div className="h-64 animate-pulse" />
                ) : (
                    <div className={styles.cardBody}>
                        <EmployeeMonthDetails data={data} showTotal={false} who="self" />
                    </div>
                )}
            </section>
        </div>
    );
}
