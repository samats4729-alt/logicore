'use client';

import { useMemo, useState } from 'react';
import { Check, MapPin, Plus, Search, X } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
 * Выбор адреса точки маршрута — отдельным окном с поиском и фильтрами.
 *
 * Правило владельца от 27.07: там, где записей может быть много,
 * выпадающий список не годится — в нём неудобно искать, не помещаются
 * подробности и некуда деть фильтры. Адреса как раз такой случай: их
 * заводит сам пользователь, и со временем их становятся сотни.
 *
 * В строке видно название, город и улицу: логист помнит адрес
 * по-разному — то по складу, то по городу, то по улице.
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
    const [query, setQuery] = useState('');
    const [city, setCity] = useState<string | null>(null);
    const [groupLabel, setGroupLabel] = useState<string | null>(null);

    /** Города из доступных адресов — фильтр строим по факту, а не списком. */
    const cities = useMemo(() => {
        const set = new Set<string>();
        for (const group of groups) {
            for (const option of group.options) {
                if (option.city) set.add(option.city);
            }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
    }, [groups]);

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return groups
            .filter((group) => !groupLabel || group.label === groupLabel)
            .map((group) => ({
                label: group.label,
                options: group.options.filter((option) => {
                    if (city && option.city !== city) return false;
                    if (!needle) return true;
                    return `${option.name} ${option.city ?? ''} ${option.address}`
                        .toLowerCase()
                        .includes(needle);
                }),
            }))
            .filter((group) => group.options.length > 0);
    }, [groups, query, city, groupLabel]);

    const total = visible.reduce((sum, group) => sum + group.options.length, 0);

    const close = () => {
        setOpen(false);
        setQuery('');
        setCity(null);
        setGroupLabel(null);
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    'flex h-10 w-full items-center gap-2 rounded-xl bg-card px-3 text-left text-[13px] shadow-soft',
                    'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
            >
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className={cn('flex-1 truncate', !valueId && 'text-muted-foreground')}>
                    {valueId ? valueLabel : 'Выберите адрес или склад'}
                </span>
                {valueId && (
                    <span
                        role="button"
                        aria-label="Очистить адрес"
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); onSelect(null); }}
                    >
                        <X className="h-3.5 w-3.5" />
                    </span>
                )}
            </button>

            <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
                <DialogContent className="max-w-2xl gap-0 p-0">
                    <DialogHeader className="border-b border-border px-4 py-3">
                        <DialogTitle className="text-[15px]">Адрес точки маршрута</DialogTitle>
                    </DialogHeader>

                    <div className="border-b border-border px-4 py-3">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Название склада, город или улица"
                                className="h-9 pl-8 text-[13px]"
                            />
                        </div>

                        {(cities.length > 1 || groups.length > 1) && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {groups.length > 1 && groups.map((group) => (
                                    <FilterChip
                                        key={group.label}
                                        active={groupLabel === group.label}
                                        onClick={() => setGroupLabel(groupLabel === group.label ? null : group.label)}
                                    >
                                        {group.label}
                                    </FilterChip>
                                ))}
                                {cities.map((name) => (
                                    <FilterChip
                                        key={name}
                                        active={city === name}
                                        onClick={() => setCity(city === name ? null : name)}
                                    >
                                        {name}
                                    </FilterChip>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
                        {total === 0 ? (
                            <div className="px-2 py-8 text-center text-[13px] text-muted-foreground">
                                Ничего не нашлось. Проверьте фильтры или заведите новый адрес.
                            </div>
                        ) : (
                            visible.map((group) => (
                                <div key={group.label} className="mb-2">
                                    <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        {group.label}
                                    </div>
                                    {group.options.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => { onSelect(option.id); close(); }}
                                            className={cn(
                                                'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent',
                                                option.id === valueId && 'bg-accent',
                                            )}
                                        >
                                            <Check
                                                className={cn(
                                                    'mt-0.5 h-4 w-4 shrink-0',
                                                    option.id === valueId ? 'opacity-100' : 'opacity-0',
                                                )}
                                            />
                                            <span className="min-w-0">
                                                <span className="block truncate text-[13px] font-medium">{option.name}</span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {option.city ? `${option.city}, ` : ''}{option.address}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>

                    <div className="border-t border-border px-4 py-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { close(); onCreateNew(); }}
                        >
                            <Plus className="h-3.5 w-3.5" /> Добавить новый адрес
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function FilterChip({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'rounded-full px-2.5 py-1 text-[12px] font-medium leading-none transition-colors',
                active ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}
