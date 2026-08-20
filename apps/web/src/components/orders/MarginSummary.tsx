'use client';

import { money } from '@/lib/money-format';
import styles from './MarginSummary.module.css';

interface MarginSummaryProps {
    /** Подписи берём те же, что стоят у полей ставок выше по форме. */
    customerLabel: string;
    customerNet: number;
    carrierLabel: string;
    carrierNet: number;
    margin: number;
    marginPercent: number;
    /** Хотя бы одна сторона с НДС — значит в расчёте суммы без налога. */
    netOfVat: boolean;
}

/**
 * Расчёт по рейсу: что получим, что заплатим и что останется.
 *
 * Показываем всю строку, а не один итог: логист набирает две ставки и
 * должен видеть, что платформа поняла обе так же, как он.
 */
export function MarginSummary({
    customerLabel,
    customerNet,
    carrierLabel,
    carrierNet,
    margin,
    marginPercent,
    netOfVat,
}: MarginSummaryProps) {
    const убыток = margin < 0;

    return (
        <div className={styles.root}>
            <div className={styles.eyebrow}>Расчёт по рейсу</div>
            <div className={styles.row}>
                <div className={styles.cell}>
                    <span className={styles.label}>{customerLabel}</span>
                    <span className={styles.value}>{money(customerNet)}</span>
                </div>
                <span className={styles.op}>−</span>
                <div className={styles.cell}>
                    <span className={styles.label}>{carrierLabel}</span>
                    <span className={styles.value}>{money(carrierNet)}</span>
                </div>
                <span className={styles.op}>=</span>
                <div className={styles.result}>
                    <span className={styles.label}>{убыток ? 'Убыток' : 'Маржа'}</span>
                    <span className={`${styles.resultValue} ${убыток ? styles.resultValueNeg : ''}`}>
                        {money(margin)}
                    </span>
                    <span className={`${styles.percent} ${убыток ? styles.percentNeg : ''}`}>
                        {marginPercent}%
                    </span>
                </div>
            </div>
            {netOfVat && (
                <div className={styles.note}>
                    Суммы без НДС — налог в марже не считается доходом.
                </div>
            )}
        </div>
    );
}
