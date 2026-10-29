'use client';

import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import s from './new-order.module.css';

/**
 * Мелкие детали окна заявки: подпись и ошибка поля, сегмент, переключатель,
 * плитка. Одни на всё окно — чтобы одинаковые вещи выглядели одинаково.
 */

export function Field({ id, label, note, aside, error, hint, children, className }: {
    id?: string;
    label: React.ReactNode;
    /** «необязательно» и подобное — серым после подписи. */
    note?: string;
    /** Справа в строке подписи: сегмент, «✎ Переименовать», «×». */
    aside?: React.ReactNode;
    error?: string | null;
    hint?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn(s.field, className)}>
            <div className={s.labelRow}>
                <label htmlFor={id} className={s.label}>
                    {label}{note && <span className={s.labelNote}> · {note}</span>}
                </label>
                {aside}
            </div>
            {children}
            {error ? <FieldError id={id ? `${id}-err` : undefined}>{error}</FieldError> : hint}
        </div>
    );
}

export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
    return (
        <p id={id} className={s.error}>
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            {children}
        </p>
    );
}

export function SectionHead({ title, optional, aside, id }: { title: string; optional?: boolean; aside?: React.ReactNode; id: string }) {
    return (
        <div className={s.sectionHead}>
            <h2 id={id} className={s.sectionTitle}>
                {title}{optional && <span className={s.optional}>необязательно</span>}
            </h2>
            {aside}
        </div>
    );
}

export function Segmented<T extends string>({ value, options, onChange, large, multiple, ariaLabel }: {
    value: T | T[] | undefined;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
    large?: boolean;
    /** Можно несколько — повторный клик снимает. */
    multiple?: boolean;
    ariaLabel?: string;
}) {
    const on = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
    return (
        <div className={cn(s.seg, large && s.segLg)} role="group" aria-label={ariaLabel}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={on(o.value)}
                    className={cn(s.segBtn, on(o.value) && s.segOn)}
                    onClick={() => onChange(o.value)}
                    data-multiple={multiple ? '' : undefined}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function Switch({ checked, onChange, children, id }: {
    checked: boolean;
    onChange: (next: boolean) => void;
    children: React.ReactNode;
    id?: string;
}) {
    return (
        <button id={id} type="button" role="switch" aria-checked={checked} className={s.switch} onClick={() => onChange(!checked)}>
            <span className={cn(s.track, checked && s.trackOn)}><span className={s.knob} /></span>
            {children}
        </button>
    );
}

export function Tile({ on, onClick, icon, label, sub, tall, tick, title, expanded }: {
    on: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    sub?: string;
    tall?: boolean;
    /** Галочка в углу — у плиток, где можно выбрать несколько. */
    tick?: boolean;
    title?: string;
    expanded?: boolean;
}) {
    return (
        <button
            type="button"
            aria-pressed={expanded === undefined ? on : undefined}
            aria-expanded={expanded}
            title={title ?? label}
            className={cn(s.tile, tall && s.tileTall, on && s.tileOn)}
            onClick={onClick}
        >
            {tick && on && (
                <span className={s.tileTick} aria-hidden>
                    <Check className="size-2.5" strokeWidth={3.5} />
                </span>
            )}
            {icon}
            <span className={s.tileLabel}>{label}</span>
            {sub && <span className={s.tileSub}>{sub}</span>}
        </button>
    );
}

/** Две буквы для значка: «ТОО «Арна Трейд»» → «АТ», «Иванов Иван» → «ИИ». */
export function initials(name?: string | null): string {
    const clean = (name || '')
        .replace(/^(ТОО|АО|ИП|ООО|ОАО|ЗАО|LLP|LLC)\s+/i, '')
        .replace(/[«»"'()]/g, ' ')
        .trim();
    const words = clean.split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
    return letters.toUpperCase();
}
