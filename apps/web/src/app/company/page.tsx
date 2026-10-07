'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { видимыеБлоки } from '@/lib/dashboard-blocks';
import Board from '@/components/dashboard/board/Board';
import { BoardDataProvider } from '@/components/dashboard/board/data';
import { useBoardLayout, type WidgetId } from '@/components/dashboard/board/layout';

/**
 * Дашборд кабинета — конструктор по макету «LogiCore на shadcn Nova»
 * (владелец, 07.10.2026): ряды показателей и блоков, которые человек сам
 * переставляет, растягивает, сворачивает и убирает.
 *
 * Что вообще открыто человеку — решает не он, а руководитель:
 * - блоки — набор из «Сотрудников» (`видимыеБлоки`, то же правило, что
 *   проверяет сервер);
 * - показатели по заявкам — тем, у кого есть раздел «Заявки», и в той же
 *   видимости, что журнал: менеджеру «только свои» — свои;
 * - выручка — вместе с блоком «Выручка и маржа», дебиторка — с «Должниками»
 *   и правом «Бухгалтерия»;
 * - тариф — руководителю: платит он.
 */
export default function CompanyDashboard() {
    const router = useRouter();
    const { user } = useAuthStore();
    const isOwner = ['COMPANY_ADMIN', 'FORWARDER'].includes(user?.role || '');
    const isManager = user?.role === 'LOGISTICIAN';
    const hasPerm = (perm: string) => isOwner || !!user?.permissions?.includes(perm);

    const blocks = useMemo(() => new Set<string>(видимыеБлоки(user ?? {})), [user]);
    const allowed = useMemo(() => {
        const set = new Set<WidgetId>();
        blocks.forEach((b) => set.add(b as WidgetId));
        if (hasPerm('orders')) for (const k of ['inWork', 'pending', 'problems', 'ordersMonth'] as const) set.add(k);
        if (blocks.has('chart')) set.add('revenue');
        if (blocks.has('debtors') && hasPerm('accounting')) set.add('receivables');
        set.add('payroll');
        if (isOwner) set.add('tariff');
        return set;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blocks, isOwner, user?.permissions]);

    const board = useBoardLayout(allowed);

    return (
        <BoardDataProvider visible={board.visible} canPlanned={hasPerm('accounting')} payrollCompany={blocks.has('earnings')}>
            <Board
                board={board}
                allowed={allowed}
                actions={(isOwner || isManager) && (
                    <Button type="button" size="sm" className="h-8 rounded-lg px-3 text-[13px]" onClick={() => router.push('/company/orders/create')}>
                        <Plus className="size-4" /> Создать заявку
                    </Button>
                )}
            />
        </BoardDataProvider>
    );
}
