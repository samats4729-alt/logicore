'use client';

import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import FeaturedOrderCard from '@/components/ui/FeaturedOrderCard';
import { FocusDialog } from '@/components/nova/FocusDialog';
import type { JournalOrder } from './types';

/**
 * Рейс по значку глаза (владелец, 08.10.2026): окно посередине, фон
 * размыт, внутри — та же карточка рейса, что раньше стояла над списком:
 * путь, карта с машиной, водитель и деньги. Список остаётся под окном,
 * никуда не уходим.
 */
export function OrderPreviewDialog({ order, open, onOpenChange, onOpen }: {
    order: JournalOrder | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpen: (id: string) => void;
}) {
    return (
        <FocusDialog
            open={open && !!order}
            onOpenChange={onOpenChange}
            width="min(1080px, calc(100vw - 32px))"
            className="overflow-y-auto"
            data-order-preview={order?.id}
        >
            {order && (
                <>
                    {/* Название для читалок экрана: на глаз его заменяет номер в шапке карточки. */}
                    <DialogTitle className="sr-only">Заявка {order.orderNumber}</DialogTitle>
                    <DialogDescription className="sr-only">Маршрут, водитель и деньги по рейсу</DialogDescription>
                    <FeaturedOrderCard order={order} onOpen={onOpen} bare onClose={() => onOpenChange(false)} />
                </>
            )}
        </FocusDialog>
    );
}
