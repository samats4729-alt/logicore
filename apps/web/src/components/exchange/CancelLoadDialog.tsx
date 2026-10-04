'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ExchangeLoad, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Частые причины — одним нажатием. Своя — словами в поле. */
const REASONS = ['Клиент отменил отгрузку', 'Нашли машину сами', 'Груз перенесли на другой день'];

/**
 * Снять груз с биржи — необратимо, поэтому с вопросом и причиной.
 * Причина остаётся в карточке: через месяц никто не вспомнит, почему груз
 * снимали.
 */
export function CancelLoadDialog({ load, open, onOpenChange, onDone }: {
    load: ExchangeLoad;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDone: () => void;
}) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!reason.trim()) {
            toast.error('Напишите, почему снимаете груз');
            return;
        }
        setSaving(true);
        try {
            await api.post(`/exchange/loads/${load.id}/cancel`, { reason: reason.trim() });
            toast.success(`Груз ${load.number} снят с биржи`);
            onOpenChange(false);
            onDone();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось снять груз'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">Снять груз {load.number} с биржи?</DialogTitle>
                </DialogHeader>
                <p className="text-[13px] text-muted-foreground">
                    Водители перестанут его видеть. Вернуть нельзя — понадобится, поставите заново.
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {REASONS.map((r) => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setReason(r)}
                            className={`rounded-full border border-solid px-3 py-1 text-[12px] ${reason === r ? 'border-foreground bg-foreground text-background' : 'border-border'}`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
                <textarea
                    aria-label="Причина"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Почему снимаете"
                    rows={2}
                    className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                />
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Оставить</Button>
                    <Button variant="destructive" onClick={submit} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Снять с биржи
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
