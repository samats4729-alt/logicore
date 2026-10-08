'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, CirclePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface FacetOption { value: string; label: string }

/**
 * Фильтр из списка с поиском — как «Заказчик» и «Менеджер» в макете.
 *
 * Выбор один: условия журнала и раньше были «одно значение на поле», и
 * отбор считается по-прежнему, меняется только вид. Выбранное видно
 * прямо на кнопке — отдельного ряда плашек с условиями нет (владелец его
 * отверг: он переползал на вторую строку).
 *
 * `variant="field"` — та же выборка полем во всю ширину, для панели
 * «Все фильтры».
 */
export function FacetFilter({ title, options, value, onChange, variant = 'chip' }: {
    title: string;
    options: FacetOption[];
    value?: string;
    onChange: (value: string | undefined) => void;
    variant?: 'chip' | 'field';
}) {
    const [open, setOpen] = useState(false);
    const current = options.find((o) => o.value === value);
    const pick = (v: string | undefined) => { onChange(v); setOpen(false); };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                {variant === 'chip' ? (
                    <Button
                        variant="outline"
                        size="sm"
                        data-facet={title}
                        className={cn('h-8 gap-1.5 rounded-lg border-dashed px-2.5 text-[13px] font-normal text-foreground', value && 'border-solid')}
                    >
                        <CirclePlus className="size-3.5 text-muted-foreground" />
                        {title}
                        {current && (
                            <>
                                <span className="mx-0.5 h-4 w-px bg-border" />
                                <span className="max-w-40 truncate rounded-sm bg-secondary px-1.5 text-[12px] text-secondary-foreground">{current.label}</span>
                            </>
                        )}
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        role="combobox"
                        aria-expanded={open}
                        aria-label={title}
                        className="h-8 w-full justify-between gap-2 rounded-lg px-2.5 text-[13px] font-normal text-foreground"
                    >
                        <span className={cn('truncate', !current && 'text-muted-foreground')}>{current?.label ?? 'Любой'}</span>
                        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent align="start" className={cn('p-0', variant === 'chip' ? 'w-64' : 'w-[var(--radix-popover-trigger-width)] min-w-56')}>
                <Command>
                    <CommandInput placeholder={title} className="h-9 text-[13px]" />
                    <div className="h-px bg-border" />
                    <CommandList>
                        <CommandEmpty className="py-4 text-center text-[13px] text-muted-foreground">Не найдено</CommandEmpty>
                        <CommandGroup>
                            {options.map((o) => {
                                const on = o.value === value;
                                return (
                                    <CommandItem key={o.value} value={o.label} onSelect={() => pick(on ? undefined : o.value)} className="text-[13px]">
                                        <span className={cn('mr-1 grid size-4 shrink-0 place-items-center rounded-sm border border-solid border-primary', on ? 'bg-primary text-primary-foreground' : 'opacity-50')}>
                                            {on && <Check className="size-3" />}
                                        </span>
                                        <span className="truncate">{o.label}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {value && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem onSelect={() => pick(undefined)} className="justify-center text-[13px]">
                                        <X className="size-3.5" /> Сбросить
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
