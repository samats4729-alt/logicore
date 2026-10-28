'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DeleteRequest } from './DeleteRequestBanner';

/** Текст ошибки сервера словами. */
function reason(e: unknown, fallback: string): string {
    const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    return (Array.isArray(m) ? m[0] : m) || fallback;
}

type Check = { canDelete: boolean; blockers: string[]; needsConsent: string[]; request: DeleteRequest | null };

const joined = (list: string[]) => list.join(', ');

/**
 * «Удалить заявку» (задачи шефа, A12). Удаляется только заявка без денег и
 * учётных документов — сервер это проверяет, окно заранее говорит, что
 * мешает. Удаление необратимо, поэтому переспрашиваем.
 *
 * Если в заявке есть другая компания из LogiCore, без её согласия заявку
 * не удалить (владелец, 29.10.2026): окно отправляет ей запрос, ответ
 * приходит в плашке на карточке заявки.
 */
export default function DeleteOrderDialog({ orderId, orderNumber, open, onOpenChange, onRequested }: {
    orderId: string;
    orderNumber?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Запрос на удаление отправлен — карточке пора показать плашку. */
    onRequested?: () => void;
}) {
    const router = useRouter();
    const [check, setCheck] = useState<Check | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setCheck(null);
        setNote('');
        api.get(`/orders/${orderId}/delete-check`)
            .then((r) => setCheck({ blockers: [], needsConsent: [], request: null, canDelete: true, ...r.data }))
            .catch(() => setCheck({ canDelete: true, blockers: [], needsConsent: [], request: null }));
    }, [open, orderId]);

    const remove = async () => {
        setBusy(true);
        try {
            const r = (await api.delete(`/orders/${orderId}`, { data: { reason: note.trim() || undefined } })).data as { deleted?: boolean; waitingFor?: string[] };
            onOpenChange(false);
            if (r?.deleted === false) {
                toast.success('Запрос на удаление отправлен', { description: `Ожидается согласие: ${joined(r.waitingFor ?? [])}` });
                onRequested?.();
                return;
            }
            toast.success(`Заявка ${orderNumber ?? ''} удалена`);
            router.push('/company/orders');
        } catch (e) {
            toast.error(reason(e, 'Не удалось удалить заявку'));
        } finally {
            setBusy(false);
        }
    };

    const blocked = !!check && check.blockers.length > 0;
    // Отклонённый запрос не мешает отправить новый.
    const pending = !blocked && !!check?.request && !check.request.declined;
    const consent = !blocked && !pending && !!check && check.needsConsent.length > 0;

    const title = !check ? `Удалить заявку ${orderNumber ?? ''}?`
        : blocked ? 'Эту заявку удалить нельзя'
            : pending ? 'Запрос на удаление уже отправлен'
                : consent ? `Отправить запрос на удаление заявки ${orderNumber ?? ''}?`
                    : `Удалить заявку ${orderNumber ?? ''}?`;
    const text = !check ? 'Проверяем, можно ли удалить…'
        : blocked ? `По заявке уже есть ${check.blockers.join(', ')}. Удаление сбило бы взаиморасчёты, отчёты и зарплату — такую заявку можно только отменить.`
            : pending && check.request ? (check.request.mine
                ? `Ожидается согласие: ${joined(check.request.waitingFor.map((c) => c.name))}.`
                : `Запрос на удаление от ${check.request.requestedBy.name}. Подтвердите или отклоните его в карточке заявки.`)
                : consent ? `В заявке участвует ${joined(check.needsConsent)}. Заявка будет удалена после согласия всех сторон.`
                    : 'Заявка удалится вместе с маршрутом, историей и файлами (накладные, фото). Вернуть её будет нельзя. Если заявка просто не состоялась — лучше отменить её: она останется в архиве.';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{text}</DialogDescription>
                </DialogHeader>
                {consent && (
                    <Input aria-label="Причина" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Причина, например: тестовая заявка" />
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{blocked || pending ? 'Понятно' : 'Нет'}</Button>
                    {check && !blocked && !pending && (
                        <Button variant="destructive" onClick={remove} disabled={busy}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {consent ? 'Отправить запрос' : 'Удалить навсегда'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
