'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Строка «a@b.kz, c@d.kz» из базы — в список. */
export function parseEmails(raw?: string | null): string[] {
    if (!raw) return [];
    return raw.split(',').map((e) => e.trim()).filter(Boolean);
}

/**
 * Список почт: бейджи плюс строка ввода.

 * Одно поле на несколько адресов не годится. У склада их бывает и
 * пятнадцать: набранные «через запятую» в одну строку, они не видны целиком,
 * опечатку в середине не заметить, а убрать один адрес можно только
 * переписав всю строку.
 *
 * Компонент общий для двух мест — карточки адреса в заявке и окна отправки
 * документа. Это один и тот же список одних и тех же почт, и выглядеть он
 * обязан одинаково.
 */
export function EmailListField({
    value,
    onChange,
    placeholder,
    autoFocus,
}: {
    value: string[];
    onChange: (emails: string[]) => void;
    placeholder?: string;
    autoFocus?: boolean;
}) {
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');

    const add = (raw: string) => {
        // Разрешаем вставить сразу несколько через запятую или пробел: так их
        // и присылают — списком из письма или таблицы.
        const candidates = raw.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
        if (!candidates.length) return;

        const bad = candidates.find((e) => !EMAIL_RE.test(e));
        if (bad) {
            setError(`«${bad}» не похоже на адрес почты`);
            return;
        }
        const next = [...value];
        for (const email of candidates) {
            if (!next.some((e) => e.toLowerCase() === email.toLowerCase())) next.push(email);
        }
        setDraft('');
        setError('');
        if (next.length !== value.length) onChange(next);
    };

    const remove = (email: string) => onChange(value.filter((e) => e !== email));

    return (
        <div>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-card p-1.5 shadow-soft">
                {value.map((email) => (
                    <Badge key={email} variant="secondary" className="gap-1 pr-1">
                        {email}
                        <button
                            type="button"
                            aria-label={`Убрать ${email}`}
                            className="rounded-full p-0.5 hover:bg-foreground/10"
                            onClick={() => remove(email)}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}
                <Input
                    value={draft}
                    autoFocus={autoFocus}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            add(draft);
                        }
                        if (e.key === 'Backspace' && !draft && value.length) {
                            remove(value[value.length - 1]);
                        }
                    }}
                    onBlur={() => draft && add(draft)}
                    placeholder={placeholder ?? (value.length ? 'ещё адрес' : 'sklad@company.kz')}
                    className={cn(
                        'h-7 min-w-[160px] flex-1 border-0 bg-transparent px-1.5 text-[13px] shadow-none',
                        'focus-visible:ring-0 focus-visible:ring-offset-0',
                    )}
                />
            </div>
            {error && <div className="mt-1 text-[11px] text-destructive">{error}</div>}
        </div>
    );
}
