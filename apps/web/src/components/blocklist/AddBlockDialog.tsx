'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера } from '@/lib/exchange';
import { BLOCK_KINDS, BLOCK_REASONS, type BlockKind, type BlockMatch } from '@/lib/blocklist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface BlockPrefill {
    kind?: BlockKind;
    value?: string;
    name?: string;
}

const MATCH_TITLE: Record<BlockMatch['type'], string> = {
    COUNTERPARTY: 'Контрагент',
    DRIVER: 'Водитель',
    VEHICLE: 'Машина',
};

/**
 * Занести в чёрный список (задачи шефа, F5/S2).
 *
 * После добавления показываем, кто из уже заведённого совпал: старые
 * карточки и рейсы список не трогает, с ними сотрудник разбирается сам.
 */
export default function AddBlockDialog({ open, onOpenChange, prefill, onAdded }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    prefill?: BlockPrefill | null;
    onAdded: () => void;
}) {
    const [kind, setKind] = useState<BlockKind>('BIN_IIN');
    const [value, setValue] = useState('');
    const [name, setName] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [matches, setMatches] = useState<BlockMatch[] | null>(null);

    useEffect(() => {
        if (!open) return;
        setKind(prefill?.kind ?? 'BIN_IIN');
        setValue(prefill?.value ?? '');
        setName(prefill?.name ?? '');
        setReason('');
        setMatches(null);
    }, [open, prefill]);

    const current = BLOCK_KINDS.find((k) => k.value === kind)!;

    const submit = async () => {
        if (!value.trim()) { toast.warning(`Укажите ${current.label.toLowerCase()}`); return; }
        if (reason.trim().length < 3) { toast.warning('Напишите причину — коллегам нужно понимать, за что'); return; }
        setSaving(true);
        try {
            const { data } = await api.post<{ matches: BlockMatch[] }>('/company/blocklist', {
                kind, value: value.trim(), name: name.trim() || null, reason: reason.trim(),
            });
            onAdded();
            if (data.matches.length) {
                setMatches(data.matches);
            } else {
                toast.success('Занесено в чёрный список');
                onOpenChange(false);
            }
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось занести в список'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[15px]">{matches ? 'Занесено. У вас уже есть совпадения' : 'Занести в чёрный список'}</DialogTitle>
                </DialogHeader>
                {matches ? (
                    <div className="space-y-3 text-[13px]">
                        <p className="m-0">
                            Новых таких записей система больше не пропустит. Но эти уже заведены — проверьте их и рейсы с ними:
                        </p>
                        <ul className="m-0 list-none space-y-1.5 p-0">
                            {matches.map((m) => (
                                <li key={`${m.type}-${m.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-solid border-border px-3 py-2">
                                    <span className="min-w-0 truncate">
                                        <span className="text-muted-foreground">{MATCH_TITLE[m.type]}: </span>{m.name}
                                    </span>
                                    <Link href={m.href} className="shrink-0 text-[12px]">Открыть</Link>
                                </li>
                            ))}
                        </ul>
                        <div className="flex justify-end">
                            <Button onClick={() => onOpenChange(false)}>Понятно</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3 text-[13px]">
                        <p className="m-0 text-muted-foreground">
                            Кого занесли, нельзя будет завести в контрагенты, водители и автопарк, и он не сможет
                            откликнуться на ваши заявки на бирже. Список видят только сотрудники вашей компании.
                        </p>
                        <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Что заносим</span>
                            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Что заносим">
                                {BLOCK_KINDS.map((k) => (
                                    <button
                                        key={k.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={kind === k.value}
                                        onClick={() => setKind(k.value)}
                                        className={`rounded-full border border-solid px-3 py-1 text-[12px] ${kind === k.value ? 'border-foreground bg-foreground text-background' : 'border-border bg-background'}`}
                                    >
                                        {k.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">{current.label}</span>
                            <Input
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={current.placeholder}
                                inputMode={kind === 'PLATE' ? 'text' : 'numeric'}
                                maxLength={40}
                                className="h-9 text-[13px]"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Кто это (необязательно)</span>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Название фирмы или ФИО"
                                maxLength={200}
                                className="h-9 text-[13px]"
                            />
                        </label>
                        <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Причина</span>
                            <div className="flex flex-wrap gap-1.5">
                                {BLOCK_REASONS.map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setReason(r)}
                                        className={`rounded-full border border-solid px-3 py-1 text-[12px] ${reason === r ? 'border-foreground bg-foreground text-background' : 'border-border bg-background'}`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                aria-label="Причина"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Что случилось: рейс, сумма, дата"
                                rows={2}
                                maxLength={500}
                                className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
                            <Button variant="destructive" onClick={submit} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                                Занести
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
