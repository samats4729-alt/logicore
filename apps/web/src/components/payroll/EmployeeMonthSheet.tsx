'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/vocabulary';
import { EmployeeMonth, месяцСловом } from '@/lib/payroll';
import EmployeeMonthDetails from './EmployeeMonthDetails';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * Карточка сотрудника за месяц — открывается из ведомости.
 *
 * Отвечает на вопросы, с которыми к руководителю приходят сотрудники: за
 * какие рейсы сколько начислено, почему за рейс ноль (ещё не оплачен), что
 * придёт позже, сколько рейсов осталось до бонуса — и как этому человеку
 * вообще платят. Отсюда же — в правку его условий.
 */
export default function EmployeeMonthSheet({ userId, month, reloadKey, open, onOpenChange, onEditTerms }: {
    userId: string | null;
    month: string;
    /** Меняется после правки условий — карточка перечитывается. */
    reloadKey: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEditTerms: (userId: string) => void;
}) {
    const [data, setData] = useState<EmployeeMonth | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!open || !userId) return;
        let alive = true;
        setData(null);
        setFailed(false);
        api.get(`/payroll/employee/${userId}?month=${month}`)
            .then(res => { if (alive) setData(res.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [open, userId, month, reloadKey]);


    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="border-0 border-l border-solid border-border top-[60px] h-[calc(100%-60px)] w-full overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle className="text-[17px]">{data?.employee?.name ?? 'Сотрудник'}</SheetTitle>
                    <SheetDescription>
                        {data?.employee ? `${ROLE_LABELS[data.employee.role] || data.employee.role} · ` : ''}{месяцСловом(month)}
                    </SheetDescription>
                </SheetHeader>

                {failed ? (
                    <p className="mt-6 text-[13px] text-destructive">
                        Не удалось загрузить начисления. Закройте карточку и откройте снова.
                    </p>
                ) : !data ? (
                    <div className="mt-6 space-y-3" aria-label="Загрузка">
                        {[0, 1, 2].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}
                    </div>
                ) : (
                    <div className="mt-5">
                        <EmployeeMonthDetails data={data} onEditTerms={userId ? () => onEditTerms(userId) : undefined} />
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
