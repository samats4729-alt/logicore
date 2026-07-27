'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, MapPin, Plus } from 'lucide-react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface AddressOption {
    id: string;
    name: string;
    city?: string | null;
    address: string;
}

export interface AddressGroup {
    label: string;
    options: AddressOption[];
}

/**
 * Выбор адреса точки маршрута.
 *
 * С поиском: адресов у компании быстро становятся сотни, и без строки
 * поиска логист их не найдёт. Внизу списка — создание нового адреса, чтобы
 * не уходить из заявки в справочник.
 */
export function AddressPicker({
    groups,
    valueId,
    valueLabel,
    onSelect,
    onCreateNew,
}: {
    groups: AddressGroup[];
    valueId?: string;
    valueLabel?: string;
    onSelect: (id: string | null) => void;
    onCreateNew: () => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'flex h-10 w-full items-center gap-2 rounded-xl bg-card px-3 text-left text-[13px] shadow-soft',
                        'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                >
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className={cn('flex-1 truncate', !valueId && 'text-muted-foreground')}>
                        {valueId ? valueLabel : 'Выберите адрес или склад'}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
            </PopoverTrigger>

            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Поиск по названию, городу, адресу…" />
                    <CommandList>
                        <CommandEmpty>Ничего не нашлось</CommandEmpty>

                        {groups.map((group) => (
                            <CommandGroup key={group.label} heading={group.label}>
                                {group.options.map((option) => (
                                    <CommandItem
                                        key={option.id}
                                        // Ищем по всей строке сразу: логист помнит то город,
                                        // то название склада, то улицу.
                                        value={`${option.name} ${option.city ?? ''} ${option.address}`}
                                        onSelect={() => {
                                            onSelect(option.id === valueId ? null : option.id);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4 shrink-0',
                                                option.id === valueId ? 'opacity-100' : 'opacity-0',
                                            )}
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium">{option.name}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {option.city ? `${option.city}, ` : ''}{option.address}
                                            </span>
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}

                        <CommandSeparator />
                        <CommandGroup>
                            <CommandItem
                                onSelect={() => {
                                    setOpen(false);
                                    onCreateNew();
                                }}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Добавить новый адрес
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
