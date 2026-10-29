'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronsUpDown, List, Loader2, Plus, Search, X } from 'lucide-react';
import { readRecent, rememberRecent } from '@/components/pickers/ListPicker';
import { cn } from '@/lib/utils';
import { initials } from './ui';
import s from './new-order.module.css';

export interface ComboItem {
    id: string;
    title: string;
    subtitle?: string;
    /** По чему ещё искать: телефон без пробелов, госномер. */
    keywords?: string;
    /** Своя компания — сверху всегда, без поиска. */
    pinned?: boolean;
}

/** Строк в выпадашке — не больше шести (ТЗ, §7): дальше — справочник. */
const LIMIT = 6;

const норм = (v: string) => v.toLowerCase().replace(/ё/g, 'е');
const цифры = (v: string) => v.replace(/\D/g, '');

function подходит(item: ComboItem, query: string): boolean {
    const q = норм(query.trim());
    if (!q) return true;
    const hay = норм(`${item.title} ${item.subtitle ?? ''} ${item.keywords ?? ''}`);
    if (hay.includes(q)) return true;
    // Телефон набирают как попало: с пробелами, без, с восьмёркой.
    const d = цифры(q);
    return d.length >= 3 && цифры(`${item.subtitle ?? ''} ${item.keywords ?? ''}`).includes(d);
}

/**
 * Комбобокс окна заявки (ТЗ, §7): закрыт — кнопка с выбранным, клик —
 * поле поиска и выпадашка. Без запроса — «Недавние», с запросом —
 * «Совпадения», не больше шести строк. Последний пункт открывает
 * справочник — полное окно с поиском и фильтрами (то, что было раньше), и
 * набранный текст человек там не теряет. ↑ ↓ — по пунктам, Enter — выбрать,
 * Esc — закрыть. Выбор — на нажатии мыши, чтобы фокус не убегал.
 */
export function InlineCombo({
    id,
    value,
    valueTitle,
    valueSub,
    round,
    placeholder,
    searchPlaceholder,
    items,
    recentKey,
    recentTitle = 'Недавние',
    groupTitle,
    groupItems,
    extra,
    directoryLabel,
    onOpenDirectory,
    onSelect,
    invalid,
    describedBy,
    dataGuide,
    loading,
    onClear,
    clearLabel,
}: {
    id: string;
    value?: string;
    valueTitle?: string;
    valueSub?: string;
    /** Значок кругом — человек; квадратом — организация. */
    round?: boolean;
    placeholder: string;
    searchPlaceholder: string;
    items: ComboItem[];
    recentKey?: string;
    recentTitle?: string;
    /** Своя группа вместо «Недавних», когда запроса нет: «Водители перевозчика». */
    groupTitle?: string;
    groupItems?: ComboItem[];
    /** Пункт перед справочником: «+ Новый водитель». */
    extra?: { label: string; onPick: () => void };
    directoryLabel: (query: string) => string;
    onOpenDirectory: (query: string) => void;
    onSelect: (id: string) => void;
    invalid?: boolean;
    describedBy?: string;
    dataGuide?: string;
    /** Список ещё грузится: строка «Загружаем…» вместо пустоты. */
    loading?: boolean;
    /** Необязательное поле: «×» у выбранного — передумал, оставить пустым. */
    onClear?: () => void;
    clearLabel?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [cursor, setCursor] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const pinned = useMemo(() => items.filter((i) => i.pinned), [items]);

    const { head, list } = useMemo(() => {
        const q = query.trim();
        if (q) {
            return { head: 'Совпадения', list: items.filter((i) => подходит(i, q)).slice(0, LIMIT) };
        }
        if (groupItems && groupItems.length) {
            return { head: groupTitle ?? '', list: [...pinned, ...groupItems.filter((i) => !i.pinned)].slice(0, LIMIT) };
        }
        const byId = new Map(items.map((i) => [i.id, i]));
        const recent = readRecent(recentKey).map((rid) => byId.get(rid)).filter((i): i is ComboItem => !!i && !i.pinned);
        const rest = recent.length ? recent : items.filter((i) => !i.pinned);
        return { head: recent.length ? recentTitle : '', list: [...pinned, ...rest].slice(0, LIMIT) };
        // readRecent читает браузер: свежий список — на каждое открытие.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, items, groupItems, groupTitle, pinned, recentKey, recentTitle, open]);

    // Пункты, по которым ходят стрелки: строки, «новый», справочник.
    const total = list.length + (extra ? 1 : 0) + 1;

    useEffect(() => { setCursor(0); }, [query, open]);
    useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

    const close = (focusButton = false) => {
        setOpen(false);
        setQuery('');
        if (focusButton) requestAnimationFrame(() => buttonRef.current?.focus());
    };
    const pick = (index: number) => {
        if (index < list.length) {
            rememberRecent(recentKey, list[index].id);
            onSelect(list[index].id);
            close(true);
        } else if (extra && index === list.length) {
            extra.onPick();
            close(true);
        } else {
            const q = query;
            close();
            onOpenDirectory(q);
        }
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % total); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + total) % total); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pick(cursor); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    };

    if (!open) {
        const можноУбрать = !!(onClear && value);
        return (
            <div className={s.anchor}>
                <button
                    ref={buttonRef}
                    id={id}
                    type="button"
                    className={cn(s.box, invalid && s.boxErr)}
                    onClick={() => setOpen(true)}
                    aria-describedby={describedBy}
                    aria-haspopup="listbox"
                    data-guide={dataGuide}
                    data-combo-field={id}
                >
                    {value && valueTitle ? (
                        <>
                            <span className={round ? s.avatarRound : s.avatarSq}>{initials(valueTitle)}</span>
                            <span className={s.boxText} title={valueTitle}>{valueTitle}</span>
                            {valueSub && <span className={s.optSub}>{valueSub}</span>}
                        </>
                    ) : (
                        <span className={s.boxPlaceholder}>{placeholder}</span>
                    )}
                    {/* Место под «×»: он лежит поверх кнопки, рядом со стрелками. */}
                    {можноУбрать && <span className={s.boxClearSlot} aria-hidden />}
                    <ChevronsUpDown className={cn('size-4', s.boxIcon)} aria-hidden />
                </button>
                {можноУбрать && (
                    <button
                        type="button"
                        className={s.boxClear}
                        aria-label={clearLabel}
                        title={clearLabel}
                        onClick={() => { onClear?.(); requestAnimationFrame(() => buttonRef.current?.focus()); }}
                    >
                        <X className="size-3.5" />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={s.anchor} data-guide={dataGuide}>
            <div className={cn(s.box, s.boxOpen)}>
                <Search className={cn('size-4', s.boxIcon)} aria-hidden />
                <input
                    ref={inputRef}
                    id={id}
                    className={s.bareInput}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKey}
                    onBlur={() => close()}
                    placeholder={searchPlaceholder}
                    role="combobox"
                    aria-expanded
                    aria-controls={`${id}-list`}
                    aria-activedescendant={`${id}-opt-${cursor}`}
                    autoComplete="off"
                />
            </div>
            <div className={s.drop} id={`${id}-list`} role="listbox">
                {head && list.length > 0 && <div className={s.micro}>{head}</div>}
                {list.length === 0 && !loading && <p className={s.dropNote}>{query ? 'Совпадений нет' : 'Список пуст'}</p>}
                {list.map((item, i) => (
                    <button
                        key={item.id}
                        id={`${id}-opt-${i}`}
                        type="button"
                        role="option"
                        aria-selected={item.id === value}
                        data-combo-option={item.id}
                        className={cn(s.opt, cursor === i && s.optActive)}
                        onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                        onMouseEnter={() => setCursor(i)}
                    >
                        <span className={cn(round ? s.avatarRound : s.avatarSq, item.pinned && s.avatarStrong)}>{initials(item.title)}</span>
                        <span className={s.optMain}>
                            <span className={s.optTitle} data-combo-title>{item.title}</span>
                            {item.subtitle && <span className={s.optSub}>{item.subtitle}</span>}
                        </span>
                    </button>
                ))}
                {loading && list.every((i) => i.pinned) && (
                    <p className={s.dropNote} role="status" data-combo-loading>
                        <Loader2 className="mr-1.5 inline size-3.5 animate-spin align-[-2px]" aria-hidden />Загружаем список…
                    </p>
                )}
                {extra && (
                    <button
                        id={`${id}-opt-${list.length}`}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className={cn(s.opt, s.optAdd, cursor === list.length && s.optActive)}
                        onMouseDown={(e) => { e.preventDefault(); pick(list.length); }}
                        onMouseEnter={() => setCursor(list.length)}
                    >
                        <Plus className="size-4 shrink-0" aria-hidden />
                        <span className={s.optMain}>{extra.label}</span>
                    </button>
                )}
                <button
                    id={`${id}-opt-${total - 1}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={cn(s.opt, s.optDir, cursor === total - 1 && s.optActive)}
                    onMouseDown={(e) => { e.preventDefault(); pick(total - 1); }}
                    onMouseEnter={() => setCursor(total - 1)}
                >
                    <List className="size-4 shrink-0" aria-hidden />
                    <span className={s.optMain}>{directoryLabel(query.trim())}</span>
                    <ArrowRight className={cn('size-3.5', s.boxIcon)} aria-hidden />
                </button>
            </div>
        </div>
    );
}
