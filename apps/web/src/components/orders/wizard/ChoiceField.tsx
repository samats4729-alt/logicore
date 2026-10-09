'use client';

import { useMemo, useState } from 'react';
import { ListPicker, PickerField, type PickerChip, type PickerGroup, type PickerItem } from '@/components/pickers/ListPicker';
import { FormSelect } from './FormSelect';

/** До скольких вариантов хватает выпадающего списка. */
const SHORT_LIST = 8;

/**
 * Выбор, который сам решает, как показаться (владелец, 08.10.2026): список
 * короткий — обычный выпадающий, длинный — окно с поиском по центру.
 *
 * Для справочников, которые у одних компаний на пять строк, а у других на
 * пятьдесят: ответственный менеджер, машина из автопарка. Контрагенты и
 * водители всегда открываются окном — их списки растут у всех.
 */
export function ChoiceField({
    id,
    value,
    onChange,
    pinned = [],
    groups,
    chipSets,
    placeholder,
    title,
    searchPlaceholder,
    recentKey,
    allowClear,
    clearLabel,
    'aria-label': ariaLabel,
}: {
    id?: string;
    value?: string;
    onChange: (value: string | undefined) => void;
    pinned?: PickerItem[];
    groups: PickerGroup[];
    chipSets?: PickerChip[][];
    placeholder: string;
    /** Заголовок окна: «Ответственный менеджер». */
    title: string;
    searchPlaceholder?: string;
    recentKey?: string;
    allowClear?: boolean;
    clearLabel?: string;
    'aria-label': string;
}) {
    const [open, setOpen] = useState(false);
    const all = useMemo(() => [...pinned, ...groups.flatMap((g) => g.items)], [pinned, groups]);
    const chosen = all.find((item) => item.id === value);

    if (all.length <= SHORT_LIST) {
        return (
            <FormSelect
                id={id}
                value={chosen ? value : undefined}
                onChange={onChange}
                options={all.map((item) => ({ value: item.id, label: item.title }))}
                placeholder={placeholder}
                allowClear={allowClear}
                clearLabel={clearLabel}
                aria-label={ariaLabel}
            />
        );
    }

    return (
        <>
            <PickerField
                id={id}
                label={ariaLabel}
                placeholder={placeholder}
                value={chosen?.title}
                onOpen={() => setOpen(true)}
                onClear={allowClear ? () => onChange(undefined) : undefined}
            />
            <ListPicker
                open={open}
                onOpenChange={setOpen}
                title={title}
                searchPlaceholder={searchPlaceholder}
                pinned={pinned}
                groups={groups}
                chipSets={chipSets}
                value={value}
                onSelect={onChange}
                recentKey={recentKey}
            />
        </>
    );
}
