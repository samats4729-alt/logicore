'use client';

import { useMemo, useState } from 'react';
import { Check, MapPin, Plus, Search, X } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import styles from './address-picker.module.css';

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
                className={cn(styles.trigger, !valueId && styles.triggerEmpty)}
            >
                <MapPin size={15} className={styles.triggerIcon} />
                <span className={styles.triggerText}>
                    {valueId ? valueLabel : 'Выберите адрес или склад'}
                </span>
                {valueId && (
                    <span
                        role="button"
                        aria-label="Очистить адрес"
                        className={styles.clear}
                        onClick={(e) => { e.stopPropagation(); onSelect(null); }}
                    >
                        <X size={13} />
                    </span>
                )}
            </button>

            <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
                <DialogContent className={styles.panel}>
                    <DialogHeader className={styles.head}>
                        <DialogTitle className={styles.title}>Адрес точки маршрута</DialogTitle>
                    </DialogHeader>

                    <div className={styles.search}>
                        <div className={styles.field}>
                            <Search size={15} />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Название склада, город или улица"
                                className={styles.input}
                            />
                        </div>

                        {(cities.length > 1 || groups.length > 1) && (
                            <div className={styles.chips}>
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

                    <div className={styles.list}>
                        {total === 0 ? (
                            <div className={styles.empty}>
                                Ничего не нашлось. Проверьте фильтры или заведите новый адрес.
                            </div>
                        ) : (
                            visible.map((group) => (
                                <div key={group.label} className={styles.group}>
                                    <div className={styles.groupLabel}>{group.label}</div>
                                    {group.options.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            // Метка для браузерного теста: в окне есть ещё
                                            // кнопки-фильтры, и их подписи («Склады заказчика
                                            // […]», названия городов) совпадают с текстом
                                            // адресов. Тест, ищущий адрес по слову, попадал в
                                            // фильтр — на пустом стенде это не проявлялось.
                                            data-address-option={option.id}
                                            onClick={() => { onSelect(option.id); close(); }}
                                            className={cn(styles.option, option.id === valueId && styles.optionActive)}
                                        >
                                            <Check
                                                size={15}
                                                className={cn(styles.tick, option.id === valueId && styles.tickOn)}
                                            />
                                            <span style={{ minWidth: 0 }}>
                                                <span className={styles.optionName}>{option.name}</span>
                                                <span className={styles.optionAddress}>
                                                    {option.city ? `${option.city}, ` : ''}{option.address}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>

                    <div className={styles.foot}>
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
            className={cn(styles.chip, active && styles.chipActive)}
        >
            {children}
        </button>
    );
}
