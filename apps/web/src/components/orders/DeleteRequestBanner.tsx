'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { Clock, Loader2, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Named = { id: string; name: string };
export type DeleteRequest = {
    requestedBy: Named;
    reason: string | null;
    createdAt: string;
    waitingFor: Named[];
    approved: Named[];
    mine: boolean;
    canAnswer: boolean;
    declined: { by: Named; reason: string | null; at: string } | null;
};

function reason(e: unknown, fallback: string): string {
    const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    return (Array.isArray(m) ? m[0] : m) || fallback;
}

const names = (list: Named[]) => list.map((c) => c.name).join(', ');

/**
 * Запрос на удаление заявки (владелец, 29.10.2026). Другой стороне —
 * «Подтвердить удаление» или «Отклонить». Отправителю — чьё согласие
 * ожидается и «Отозвать запрос», а после отказа — кто отклонил и почему,
 * с кнопкой «Скрыть». Нет запроса — ничего не показываем.
 */
export default function DeleteRequestBanner({ orderId, refreshKey }: { orderId: string; refreshKey?: number }) {
    const router = useRouter();
    const [request, setRequest] = useState<DeleteRequest | null>(null);
    const [busy, setBusy] = useState(false);
    const [declineAsk, setDeclineAsk] = useState(false);
    const [declineReason, setDeclineReason] = useState('');

    const load = useCallback(() => {
        api.get(`/orders/${orderId}/delete-request`).then((r) => setRequest(r.data || null)).catch(() => setRequest(null));
    }, [orderId]);
    useEffect(load, [load, refreshKey]);

    const run = async (what: 'approve' | 'decline' | 'withdraw') => {
        setBusy(true);
        try {
            if (what === 'approve') {
                const r = (await api.post(`/orders/${orderId}/delete-request/approve`)).data as { deleted: boolean; orderNumber: string; waitingFor?: string[] };
                if (r.deleted) {
                    toast.success(`Заявка ${r.orderNumber} удалена`);
                    router.push('/company/orders');
                    return;
                }
                toast.success('Согласие на удаление отправлено', { description: `Ожидается согласие: ${(r.waitingFor ?? []).join(', ')}` });
            } else if (what === 'decline') {
                await api.post(`/orders/${orderId}/delete-request/decline`, { reason: declineReason.trim() || undefined });
                toast.success('Запрос на удаление отклонён');
                setDeclineAsk(false);
                setDeclineReason('');
            } else {
                await api.delete(`/orders/${orderId}/delete-request`);
                if (!request?.declined) toast.success('Запрос на удаление отозван');
            }
            load();
        } catch (e) {
            toast.error(reason(e, 'Не получилось — попробуйте ещё раз'));
            load();
        } finally {
            setBusy(false);
        }
    };

    if (!request) return null;
    const when = dayjs(request.createdAt).format('DD.MM.YYYY в HH:mm');

    if (request.declined) {
        return (
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-solid border-border bg-muted/50 px-4 py-3 text-[13px]">
                <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <div className="font-semibold">Запрос на удаление заявки отклонён</div>
                    <div className="text-muted-foreground">
                        {[
                            request.declined.by.name,
                            request.declined.reason ? `Причина: ${request.declined.reason}` : '',
                            dayjs(request.declined.at).format('DD.MM.YYYY в HH:mm'),
                        ].filter(Boolean).join(' · ')}
                    </div>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run('withdraw')}>Скрыть</Button>
            </div>
        );
    }

    return (
        <>
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-solid border-amber-300 bg-amber-50 px-4 py-3 text-[13px] dark:border-amber-900 dark:bg-amber-950/40">
                {request.mine ? <Clock className="h-4 w-4 shrink-0 text-amber-700" /> : <Trash2 className="h-4 w-4 shrink-0 text-amber-700" />}
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-amber-900 dark:text-amber-200">
                        {request.mine ? 'Запрос на удаление заявки отправлен' : `Запрос на удаление заявки от ${request.requestedBy.name}`}
                    </div>
                    <div className="text-amber-900/80 dark:text-amber-200/80">
                        {[
                            request.mine || !request.canAnswer ? `Ожидается согласие: ${names(request.waitingFor)}` : '',
                            request.approved.length > 0 ? `Согласие получено: ${names(request.approved)}` : '',
                            request.reason ? `Причина: ${request.reason}` : '',
                            when,
                        ].filter(Boolean).join(' · ')}
                    </div>
                </div>
                {request.canAnswer && (
                    <div className="flex gap-2">
                        <Button variant="destructive" size="sm" disabled={busy} onClick={() => run('approve')}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Подтвердить удаление
                        </Button>
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => setDeclineAsk(true)}>Отклонить</Button>
                    </div>
                )}
                {request.mine && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => run('withdraw')}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Отозвать запрос
                    </Button>
                )}
            </div>

            <Dialog open={declineAsk} onOpenChange={setDeclineAsk}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Отклонить запрос на удаление?</DialogTitle>
                        <DialogDescription>Заявка сохранится. {request.requestedBy.name} получит уведомление об отказе с указанной причиной.</DialogDescription>
                    </DialogHeader>
                    <Input aria-label="Причина отказа" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Причина, например: водитель уже в пути" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeclineAsk(false)}>Назад</Button>
                        <Button onClick={() => run('decline')} disabled={busy}>
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Отклонить запрос
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
