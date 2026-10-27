'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Текст ошибки сервера словами. */
function reason(e: unknown, fallback: string): string {
    const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    return (Array.isArray(m) ? m[0] : m) || fallback;
}

/**
 * «Удалить заявку» (задачи шефа, A12). Удаляется только заявка без денег и
 * учётных документов — сервер это проверяет, окно заранее говорит, что
 * мешает. Удаление необратимо, поэтому переспрашиваем.
 */
export default function DeleteOrderDialog({ orderId, orderNumber, open, onOpenChange }: {
    orderId: string;
    orderNumber?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const [blockers, setBlockers] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setBlockers(null);
        api.get(`/orders/${orderId}/delete-check`)
            .then((r) => setBlockers(r.data?.blockers ?? []))
            .catch(() => setBlockers([]));
    }, [open, orderId]);

    const remove = async () => {
        setBusy(true);
        try {
            await api.delete(`/orders/${orderId}`);
            toast.success(`Заявка ${orderNumber ?? ''} удалена`);
            onOpenChange(false);
            router.push('/company/orders');
        } catch (e) {
            toast.error(reason(e, 'Не удалось удалить заявку'));
        } finally {
            setBusy(false);
        }
    };

    const blocked = !!blockers && blockers.length > 0;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{blocked ? 'Эту заявку удалить нельзя' : `Удалить заявку ${orderNumber ?? ''}?`}</DialogTitle>
                    <DialogDescription>
                        {!blockers
                            ? 'Проверяем, можно ли удалить…'
                            : blocked
                                ? `По заявке уже есть ${blockers.join(', ')}. Удаление сбило бы взаиморасчёты, отчёты и зарплату — такую заявку можно только отменить.`
                                : 'Заявка удалится вместе с маршрутом, историей и файлами (накладные, фото). Вернуть её будет нельзя. Если заявка просто не состоялась — лучше отменить её: она останется в архиве.'}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{blocked ? 'Понятно' : 'Нет'}</Button>
                    {blockers && !blocked && (
                        <Button variant="destructive" onClick={remove} disabled={busy}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Удалить навсегда
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
