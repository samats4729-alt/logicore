'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ExchangeDriver, ответСервера, фиоВодителя } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Частые причины — одним нажатием. */
const REASONS: Record<'reject' | 'block', string[]> = {
    reject: ['Фото нечитаемое — переснимите', 'Не дозвонились', 'Данные не совпадают с документами', 'Истёк срок прав'],
    block: ['Чужие документы', 'Взял аванс и пропал', 'Увёз груз'],
};

/**
 * Отказ или блокировка — с причиной.
 *
 * Отказ водитель видит в приложении и может исправить анкету. Блокировка —
 * насовсем: ИИН, телефон и номер машины уходят в чёрный список всей биржи,
 * поэтому вопрос задаётся прямо и кнопка красная.
 */
export function DriverDecisionDialog({ driver, mode, onClose, onDone }: {
    driver: ExchangeDriver;
    mode: 'reject' | 'block' | null;
    onClose: () => void;
    onDone: () => void;
}) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => { setReason(''); }, [mode]);

    if (!mode) return null;
    const name = фиоВодителя(driver);

    const submit = async () => {
        if (!reason.trim()) { toast.error('Напишите причину'); return; }
        setSaving(true);
        try {
            await api.post(`/exchange/park/drivers/${driver.id}/${mode}`, { reason: reason.trim() });
            toast.success(mode === 'reject' ? `${name}: отказ отправлен водителю` : `${name} заблокирован`);
            onClose();
            onDone();
        } catch (e) {
            toast.error(ответСервера(e, 'Не получилось — попробуйте ещё раз'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">
                        {mode === 'reject' ? `Отказать: ${name}` : `Заблокировать ${name}?`}
                    </DialogTitle>
                </DialogHeader>
                <p className="text-[13px] text-muted-foreground">
                    {mode === 'reject'
                        ? 'Водитель увидит причину в приложении, сможет исправить анкету и отправить снова.'
                        : 'Насовсем. ИИН, телефон и номер машины попадут в чёрный список: с ними не зарегистрироваться ни в одном парке.'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {REASONS[mode].map((r) => (
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
                    placeholder="Причина"
                    rows={2}
                    className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                />
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Отмена</Button>
                    <Button variant={mode === 'block' ? 'destructive' : 'default'} onClick={submit} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {mode === 'reject' ? 'Отказать' : 'Заблокировать'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
