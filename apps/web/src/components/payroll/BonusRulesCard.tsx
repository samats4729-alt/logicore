'use client';

import { useState } from 'react';
import { Loader2, Target } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { KpiRule, рейсов, тенге } from '@/lib/payroll';
import { Checkbox } from '@/components/ui/checkbox';
import styles from '@/components/nova/nova.module.css';

/**
 * Бонус за план по рейсам — выключатель для всех разом.
 *
 * Сам бонус назначается каждому в его условиях оплаты (галочка «Бонус за
 * план по рейсам» в панели справа от списка): деления на «общий» и «свой»
 * больше нет (решение владельца, 30.09.2026). Здесь — видно, у кого бонус
 * задан, и можно поставить все бонусы на паузу, не стирая: снял галочку —
 * бонусы не начисляются; поставил — возвращаются те же.
 */
export default function BonusRulesCard({ rules, onChanged }: {
    /** Все бонусы компании — с именами сотрудников. */
    rules: KpiRule[];
    /** Перечитать после изменения. */
    onChanged: () => Promise<void> | void;
}) {
    const [busy, setBusy] = useState(false);

    const active = rules.filter(r => r.isActive);
    const enabled = active.length > 0;

    const setAll = async (isActive: boolean) => {
        setBusy(true);
        try {
            await api.put('/payroll/kpi-rules/active', { isActive });
            await onChanged();
            toast.success(isActive
                ? 'Бонусы за план снова начисляются'
                : 'Бонусы за план на паузе. Поставьте галочку, и они снова заработают');
        } catch (err) {
            console.error(err);
            toast.error(isActive ? 'Не удалось включить бонусы' : 'Не удалось выключить бонусы');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                <Target size={14} />
                <h2 className={styles.cardTitle}>Бонус за план по рейсам</h2>
                {rules.length > 0 && <span className={styles.cardCount}>{rules.length}</span>}
            </div>
            <div className={`${styles.cardBody} text-[13px]`}>
                {rules.length === 0 ? (
                    <p className="text-muted-foreground">
                        Бонусов пока нет. Бонус назначается каждому в его условиях: отметьте сотрудников
                        в списке выше и поставьте галочку «Бонус за план по рейсам».
                    </p>
                ) : (
                    <>
                        <label className="flex cursor-pointer select-none items-center gap-2">
                            {/* Квадрат, а не круг: это «включить», а не выбор одного из. */}
                            <Checkbox
                                className="rounded-[4px]"
                                aria-label="Платить бонусы за план"
                                checked={enabled}
                                disabled={busy}
                                onCheckedChange={(v) => setAll(v === true)}
                            />
                            Платить бонусы за план
                            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        </label>
                        <p className="ml-6 mt-1.5 text-[12px] text-muted-foreground">
                            {enabled
                                ? 'Снимите галочку, чтобы поставить все бонусы на паузу — они не удалятся.'
                                : 'На паузе: бонусы не начисляются. Поставьте галочку, и они снова заработают.'}
                        </p>
                        <div className="ml-6 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                            {rules.map(r => (
                                <span key={r.id} className={r.isActive ? '' : 'text-muted-foreground'}>
                                    {r.user ? `${r.user.lastName} ${r.user.firstName}` : 'Все'}: за {рейсов(r.threshold)} — {тенге(r.bonusAmount)}
                                </span>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
