'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PickerOption {
    id: string;
    /** Первая строка — то, по чему запись узнают. */
    label: string;
    /** Вторая строка: БИН, область, что угодно уточняющее. */
    hint?: string | null;
}

/**
 * Выбор одной записи из справочника — окном с поиском, а не выпадающим списком.
 *
 * Правило проекта: там, где записи пополняет пользователь, их рано или
 * поздно станут сотни, и выпадающий список перестаёт работать — в нём
 * неудобно искать и не помещаются подробности. Контрагенты и города ровно
 * такие: города подтягиваются из справочника по мере работы, контрагентов
 * заводят каждую неделю.
 *
 * Вторая строка обязательна не всегда, но полезна почти всегда: двух
 * «ТОО Астана Транс» различают по БИН, а два «Заречных» — по области.
 */
export function RecordPicker({
    title,
    placeholder,
    options,
    valueId,
    onSelect,
    disabled,
    emptyHint,
}: {
    title: string;
    placeholder: string;
    options: PickerOption[];
    valueId?: string | null;
    onSelect: (id: string | null) => void;
    disabled?: boolean;
    /** Что сказать, когда справочник пуст: «нет данных» ничего не объясняет. */
    emptyHint?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    const selected = options.find((o) => o.id === valueId) || null;

    const found = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options.slice(0, 100);
        return options
            .filter((o) => o.label.toLowerCase().includes(q) || (o.hint || '').toLowerCase().includes(q))
            .slice(0, 100);
    }, [options, query]);

    // Поиск получает фокус сам: окно открывают, чтобы искать, и лишний клик
    // здесь — это лишний клик в каждом запросе.
    useEffect(() => {
        if (open) setTimeout(() => searchRef.current?.focus(), 50);
        else setQuery('');
    }, [open]);

    return (
        <>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(true)}
                className={cn(
                    'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-left text-[13px]',
                    'hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-50',
                    !selected && 'text-muted-foreground',
                )}
            >
                <span className="truncate">{selected ? selected.label : placeholder}</span>
                <span className="flex shrink-0 items-center gap-1">
                    {selected && (
                        <X
                            className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(null);
                            }}
                        />
                    )}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </span>
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">{title}</DialogTitle>
                    </DialogHeader>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-40" />
                        <Input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Начните вводить название"
                            className="h-9 pl-9 text-[13px]"
                        />
                    </div>

                    <div className="max-h-[50vh] overflow-y-auto">
                        {options.length === 0 ? (
                            <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
                                {emptyHint || 'Справочник пуст'}
                            </p>
                        ) : found.length === 0 ? (
                            <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
                                Ничего не нашлось по запросу «{query}»
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-0.5">
                                {found.map((o) => (
                                    <li key={o.id}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSelect(o.id);
                                                setOpen(false);
                                            }}
                                            className={cn(
                                                'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted',
                                                o.id === valueId && 'bg-muted',
                                            )}
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-[13px] font-medium">{o.label}</span>
                                                {o.hint && (
                                                    <span className="block truncate text-[11px] text-muted-foreground">
                                                        {o.hint}
                                                    </span>
                                                )}
                                            </span>
                                            {o.id === valueId && <Check className="h-4 w-4 shrink-0" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                            Закрыть
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
