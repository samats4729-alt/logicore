'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import styles from './list-picker.module.css';

/** Строка списка: название и то, по чему запись узнают. */
export interface PickerItem {
    id: string;
    title: string;
    /** Вторая строка: БИН и адрес, телефон и госномер. */
    subtitle?: string;
    /** Пометка справа: «штатный», «на платформе». */
    aside?: string;
    /** Что ещё ищется, кроме видимого текста: телефон без пробелов и т. п. */
    keywords?: string;
    /** Выделить название — «ваша компания». */
    emphasis?: boolean;
}

export interface PickerGroup {
    label: string;
    items: PickerItem[];
}

/** Пилюля-фильтр. В одном наборе включена одна, наборы складываются через «и». */
export interface PickerChip {
    id: string;
    label: string;
    test: (item: PickerItem) => boolean;
}

/** Сколько строк рисовать за раз: тысяча строк в окне — это не выбор, а свиток. */
const LIMIT = 200;
/** Недавних — столько, чтобы обычный случай закрывался без поиска. */
const RECENT = 5;

const recentStorageKey = (key: string) => `lc:picker-recent:v1:${key}`;

function readRecent(key?: string): string[] {
    if (!key) return [];
    try {
        const raw = localStorage.getItem(recentStorageKey(key));
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
    } catch {
        return [];
    }
}

function rememberRecent(key: string | undefined, id: string) {
    if (!key) return;
    try {
        const next = [id, ...readRecent(key).filter((v) => v !== id)].slice(0, 20);
        localStorage.setItem(recentStorageKey(key), JSON.stringify(next));
    } catch {
        // Браузер не даёт хранить — просто без «недавних».
    }
}

const haystack = (item: PickerItem) =>
    `${item.title} ${item.subtitle ?? ''} ${item.aside ?? ''} ${item.keywords ?? ''}`.toLowerCase();

/**
 * Выбор из большого списка — отдельным окном по центру, с поиском и
 * фильтрами-пилюлями.
 *
 * Правило владельца от 27.07 и его же слово от 08.10: где записей много —
 * контрагенты, водители, сотрудники, — выпадающий список не годится. В нём
 * неудобно искать, не помещаются подробности, и он прокручивается вместе со
 * всем окном. Здесь сверху поиск и пилюли, ниже — «недавние», чтобы обычный
 * случай закрывался без поиска, потом весь список по группам.
 *
 * Стрелки ↑↓ ходят по строкам, Enter выбирает: диспетчер набирает
 * фамилию и не тянется к мыши.
 */
export function ListPicker({
    open,
    onOpenChange,
    title,
    description,
    searchPlaceholder = 'Поиск',
    pinned = [],
    groups,
    chipSets = [],
    value,
    onSelect,
    recentKey,
    footer,
    emptyText = 'Ничего не нашлось. Проверьте поиск и фильтры.',
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    searchPlaceholder?: string;
    /** Всегда сверху, без фильтров: «ваша компания», «я», «не назначать». */
    pinned?: PickerItem[];
    groups: PickerGroup[];
    chipSets?: PickerChip[][];
    value?: string | null;
    onSelect: (id: string) => void;
    /** Где помнить недавний выбор; без ключа «недавних» нет. */
    recentKey?: string;
    /** Внизу окна: «Добавить контрагента», «Добавить нового водителя». */
    footer?: React.ReactNode;
    emptyText?: string;
}) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState<Record<number, string | null>>({});
    const [cursor, setCursor] = useState(0);
    const [recentIds, setRecentIds] = useState<string[]>([]);
    const listRef = useRef<HTMLDivElement>(null);

    // Каждое открытие — с чистого поиска и свежих «недавних».
    useEffect(() => {
        if (!open) return;
        setQuery('');
        setActive({});
        setCursor(0);
        setRecentIds(readRecent(recentKey));
    }, [open, recentKey]);

    const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);

    /** Пилюли — только те, что что-то отбирают: пустая пилюля только путает. */
    const sets = useMemo(
        () => chipSets
            .map((chips) => chips
                .map((chip) => ({ ...chip, count: all.filter(chip.test).length }))
                .filter((chip) => chip.count > 0 && chip.count < all.length))
            .map((chips, i) => ({ i, chips }))
            .filter((set) => set.chips.length > 0),
        [chipSets, all],
    );

    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const tests = sets
            .map((set) => set.chips.find((c) => c.id === active[set.i]))
            .filter((c): c is NonNullable<typeof c> => !!c);
        const fits = (item: PickerItem) =>
            tests.every((t) => t.test(item)) && (!needle || haystack(item).includes(needle));

        const out: PickerGroup[] = [];
        // Включил «Мои» — значит, хочет только их: «ваша компания» сверху тут лишняя.
        const top = tests.length ? [] : pinned.filter((item) => !needle || haystack(item).includes(needle));
        if (top.length) out.push({ label: '', items: top });

        // «Недавние» — только пока человек не ищет и не отбирает: иначе одна
        // и та же запись стоит в списке дважды.
        if (!needle && !tests.length && recentIds.length) {
            const byId = new Map(all.map((item) => [item.id, item]));
            const recent = recentIds
                .map((id) => byId.get(id))
                .filter((item): item is PickerItem => !!item)
                .slice(0, RECENT);
            if (recent.length) out.push({ label: 'Недавние', items: recent });
        }

        let left = LIMIT;
        for (const group of groups) {
            if (left <= 0) break;
            const items = group.items.filter(fits).slice(0, left);
            left -= items.length;
            if (items.length) out.push({ label: group.label, items });
        }
        return out;
    }, [query, sets, active, pinned, recentIds, all, groups]);

    const found = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const tests = sets
            .map((set) => set.chips.find((c) => c.id === active[set.i]))
            .filter((c): c is NonNullable<typeof c> => !!c);
        return all.filter((item) => tests.every((t) => t.test(item)) && (!needle || haystack(item).includes(needle))).length;
    }, [all, query, sets, active]);

    const flat = useMemo(() => visible.flatMap((g) => g.items), [visible]);

    useEffect(() => { setCursor(0); }, [query, active]);

    // Строка под курсором — в поле зрения.
    useEffect(() => {
        listRef.current
            ?.querySelector(`[data-picker-index="${cursor}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [cursor]);

    const choose = (id: string) => {
        rememberRecent(recentKey, id);
        onSelect(id);
        onOpenChange(false);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, flat.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
        } else if (e.key === 'Enter' && flat[cursor]) {
            e.preventDefault();
            choose(flat[cursor].id);
        } else if (e.key === 'Escape') {
            // Обычно Esc закрывает окно сам Radix. Но первые доли секунды
            // после открытия он клавишу ещё не слушает — и Esc доставался
            // окну под этим (мастеру заявки). Закрываем сами; второй вызов
            // для уже закрытого окна ничего не делает.
            onOpenChange(false);
        }
    };

    let index = -1;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={styles.panel} data-list-picker onKeyDown={onKeyDown}>
                <DialogHeader className={styles.head}>
                    <DialogTitle className={styles.title}>{title}</DialogTitle>
                    {description
                        ? <DialogDescription className={styles.description}>{description}</DialogDescription>
                        : <DialogDescription className="sr-only">Найдите запись поиском или фильтрами и нажмите на неё</DialogDescription>}
                </DialogHeader>

                <div className={styles.search}>
                    <div className={styles.field}>
                        <Search size={15} />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={searchPlaceholder}
                            aria-label="Поиск"
                            className={styles.input}
                        />
                    </div>
                    {sets.length > 0 && (
                        <div className={styles.chips}>
                            {sets.flatMap((set) => set.chips.map((chip) => {
                                const on = active[set.i] === chip.id;
                                return (
                                    <button
                                        key={`${set.i}-${chip.id}`}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => setActive((prev) => ({ ...prev, [set.i]: on ? null : chip.id }))}
                                        className={cn(styles.chip, on && styles.chipActive)}
                                    >
                                        {chip.label}
                                        <span className={styles.chipCount}>{chip.count}</span>
                                    </button>
                                );
                            }))}
                        </div>
                    )}
                </div>

                <div ref={listRef} className={styles.list} role="listbox" aria-label={title}>
                    {flat.length === 0 ? (
                        <div className={styles.empty}>{emptyText}</div>
                    ) : (
                        visible.map((group, gi) => (
                            <div key={`${group.label}-${gi}`} className={styles.group}>
                                {group.label && <div className={styles.groupLabel}>{group.label}</div>}
                                {group.items.map((item) => {
                                    index += 1;
                                    const i = index;
                                    const selected = item.id === value;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            role="option"
                                            aria-selected={selected}
                                            // Метка для браузерного теста: в окне есть
                                            // пилюли-фильтры, и их подписи бывают похожи
                                            // на текст строк.
                                            data-picker-option={item.id}
                                            data-picker-index={i}
                                            onMouseMove={() => { if (cursor !== i) setCursor(i); }}
                                            onClick={() => choose(item.id)}
                                            className={cn(styles.option, selected && styles.optionActive, cursor === i && styles.optionCursor)}
                                        >
                                            <Check size={15} className={cn(styles.tick, selected && styles.tickOn)} />
                                            <span className={styles.optionBody}>
                                                <span className={cn(styles.optionName, item.emphasis && styles.optionEmphasis)}>{item.title}</span>
                                                {item.subtitle && <span className={styles.optionSub}>{item.subtitle}</span>}
                                            </span>
                                            {item.aside && <span className={styles.aside}>{item.aside}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                    {found > LIMIT && (
                        <div className={styles.more}>
                            Показаны первые {LIMIT} из {found} — уточните поиск
                        </div>
                    )}
                </div>

                <div className={styles.foot}>
                    <span className={styles.total}>
                        {found === all.length ? `Всего ${all.length}` : `Найдено ${found} из ${all.length}`}
                    </span>
                    {footer}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Поле, которое открывает окно выбора. Выглядит как остальные поля формы:
 * та же высота, рамка и шрифт, что у выпадающего списка shadcn рядом.
 */
export function PickerField({
    id,
    label,
    placeholder,
    value,
    onOpen,
    onClear,
    disabled,
    className,
}: {
    id?: string;
    /** Подпись для экранного диктора и тестов: «Заказчик», «Водитель». */
    label: string;
    placeholder: string;
    /** Что выбрано — текстом; пусто — показывается подсказка. */
    value?: React.ReactNode;
    onOpen: () => void;
    /** Есть — у поля крестик «очистить». */
    onClear?: () => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <button
            id={id}
            type="button"
            aria-label={label}
            aria-haspopup="dialog"
            data-picker-field
            disabled={disabled}
            onClick={onOpen}
            className={cn(
                'lc-ui-field flex h-8 w-full items-center gap-2 rounded-lg border border-solid border-input bg-transparent px-3 text-left text-[13px] text-foreground shadow-sm',
                'transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
        >
            <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted-foreground')}>
                {value || placeholder}
            </span>
            {value && onClear && !disabled && (
                <span
                    role="button"
                    aria-label={`Очистить: ${label}`}
                    onClick={(e) => { e.stopPropagation(); onClear(); }}
                    className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                    <X className="size-3" />
                </span>
            )}
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </button>
    );
}
