'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock, MapPin, Plus, Search } from 'lucide-react';
import type { AddressGroup, AddressOption } from '@/components/orders/AddressPicker';
import { cn } from '@/lib/utils';
import s from './new-order.module.css';

const норм = (v: string) => v.toLowerCase().replace(/ё/g, 'е');

/** «Алматы, Абая 10»: город не повторяем, если адрес уже с него начинается. */
export function адресСтрокой(city?: string | null, address?: string | null): string {
    if (city && address && норм(address).includes(норм(city))) return address;
    return [city, address].filter(Boolean).join(', ');
}

/**
 * Адрес точки маршрута (ТЗ, §5.3): выпадашка без второго окна поверх.
 * Сверху — адреса заказчика и последние (часы), ниже — склады перевозчика;
 * поиск по названию, городу и улице. Последний пункт — «+ Новый адрес» с
 * набранным текстом: открывает форму адреса с картой и почтами, и адрес
 * сохраняется за заказчиком.
 */
export function AddressCombo({ id, groups, value, valueTitle, valueSub, onSelect, onCreateNew, invalid, describedBy, ariaLabel, emptyText, autoOpen, onOpened }: {
    id: string;
    groups: AddressGroup[];
    value?: string;
    valueTitle?: string;
    valueSub?: string;
    onSelect: (id: string) => void;
    onCreateNew: (query: string) => void;
    invalid?: boolean;
    describedBy?: string;
    ariaLabel: string;
    emptyText?: string;
    /** Только что добавленная точка — открыть поиск сразу (ТЗ, §5.3). */
    autoOpen?: boolean;
    onOpened?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [cursor, setCursor] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const rows = useMemo(() => {
        const q = норм(query.trim());
        const out: { group: string; option: AddressOption; recent: boolean }[] = [];
        const seen = new Set<string>();
        groups.forEach((g, gi) => {
            for (const o of g.options) {
                if (seen.has(o.id)) continue;
                if (q && !норм(`${o.name} ${o.city ?? ''} ${o.address}`).includes(q)) continue;
                seen.add(o.id);
                out.push({ group: g.label, option: o, recent: gi === 0 && /недавн|заказчик/i.test(g.label) });
            }
        });
        return out;
    }, [groups, query]);
    const total = rows.length + 1;

    useEffect(() => { setCursor(0); }, [query, open]);
    useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
    useEffect(() => {
        if (!autoOpen) return;
        setOpen(true);
        onOpened?.();
    }, [autoOpen, onOpened]);

    const close = (focusButton = false) => {
        setOpen(false);
        setQuery('');
        if (focusButton) requestAnimationFrame(() => buttonRef.current?.focus());
    };
    const pick = (index: number) => {
        if (index < rows.length) {
            onSelect(rows[index].option.id);
            close(true);
        } else {
            const q = query.trim();
            close();
            onCreateNew(q);
        }
    };

    if (!open) {
        return (
            <button
                ref={buttonRef}
                id={id}
                type="button"
                className={cn(s.box, s.boxTall, invalid && s.boxErr)}
                onClick={() => setOpen(true)}
                aria-label={ariaLabel}
                aria-describedby={describedBy}
                aria-haspopup="listbox"
                data-address-field={id}
            >
                <MapPin className={cn('size-4', s.boxIcon)} aria-hidden />
                {value && valueTitle ? (
                    <>
                        <span className="shrink-0 whitespace-nowrap font-medium" title={valueTitle}>{valueTitle}</span>
                        {valueSub && <span className={cn(s.boxText, s.optSub)} style={{ fontSize: 13 }} title={valueSub}>{valueSub}</span>}
                    </>
                ) : (
                    <span className={s.boxPlaceholder}>Склад, город или улица</span>
                )}
                <span className={s.spacer} />
                <ChevronDown className={cn('size-4', s.boxIcon)} aria-hidden />
            </button>
        );
    }

    let lastGroup = '';
    return (
        <div className={s.anchor}>
            <div className={cn(s.box, s.boxTall, s.boxOpen)}>
                <Search className={cn('size-4', s.boxIcon)} aria-hidden />
                <input
                    ref={inputRef}
                    className={s.bareInput}
                    aria-label={ariaLabel}
                    role="combobox"
                    aria-expanded
                    aria-controls={`${id}-list`}
                    aria-activedescendant={`${id}-opt-${cursor}`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onBlur={() => close()}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % total); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + total) % total); }
                        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pick(cursor); }
                        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
                    }}
                    placeholder="Склад, город или улица"
                    autoComplete="off"
                />
            </div>
            <div className={s.drop} style={{ maxHeight: 300 }} id={`${id}-list`} role="listbox" data-address-dialog>
                {rows.length === 0 && (
                    <p className={s.dropNote}>{query.trim() ? 'Совпадений нет' : (emptyText || 'Адресов пока нет')}</p>
                )}
                {rows.map((r, i) => {
                    const head = groups.length > 1 && r.group !== lastGroup ? r.group : null;
                    lastGroup = r.group;
                    return (
                        <div key={r.option.id}>
                            {head && <div className={s.micro}>{head}</div>}
                            <button
                                id={`${id}-opt-${i}`}
                                type="button"
                                role="option"
                                aria-selected={r.option.id === value}
                                data-address-option={r.option.id}
                                className={cn(s.opt, cursor === i && s.optActive)}
                                onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                                onMouseEnter={() => setCursor(i)}
                            >
                                {r.recent
                                    ? <Clock className={cn('size-4', s.boxIcon)} aria-hidden />
                                    : <MapPin className={cn('size-4', s.boxIcon)} aria-hidden />}
                                <span className={s.optMain}>
                                    <span className={s.optTitle}>{r.option.name}</span>
                                    <span className={s.optSub}>{адресСтрокой(r.option.city, r.option.address)}</span>
                                </span>
                            </button>
                        </div>
                    );
                })}
                <button
                    id={`${id}-opt-${rows.length}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={cn(s.opt, s.optDir, cursor === rows.length && s.optActive)}
                    onMouseDown={(e) => { e.preventDefault(); pick(rows.length); }}
                    onMouseEnter={() => setCursor(rows.length)}
                >
                    <Plus className="size-4 shrink-0" aria-hidden />
                    <span className={s.optMain}>{query.trim() ? `Новый адрес «${query.trim()}»` : 'Новый адрес'}</span>
                </button>
            </div>
        </div>
    );
}
