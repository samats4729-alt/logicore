'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { месяцСловом, сдвигМесяца } from '@/lib/payroll';

/**
 * Месяц ведомости стрелками: ‹ сентябрь 2026 ›.
 *
 * Зарплату считают помесячно, и выбор «диапазона с — по» был лишним шагом:
 * в нём легко получить три месяца вместо одного и не заметить этого.
 * Вперёд дальше текущего месяца не пускаем — там ещё ничего не начислено.
 */
export default function MonthSwitcher({ value, max, onChange }: {
    value: string;
    /** Последний месяц, до которого можно листать. */
    max: string;
    onChange: (month: string) => void;
}) {
    const canNext = value < max;
    return (
        <div className="inline-flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" aria-label="Предыдущий месяц" onClick={() => onChange(сдвигМесяца(value, -1))}>
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[132px] text-center text-[13px] font-medium first-letter:uppercase">{месяцСловом(value)}</span>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" aria-label="Следующий месяц" disabled={!canNext} onClick={() => onChange(сдвигМесяца(value, 1))}>
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
}
