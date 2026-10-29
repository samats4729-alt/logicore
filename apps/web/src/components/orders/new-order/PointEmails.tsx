'use client';

import { useState } from 'react';
import { Mail, Plus, X } from 'lucide-react';
import { addEmails } from '@/components/ui/EmailListField';
import type { RoutePointEmailsApi } from '@/components/orders/RoutePointEmails';
import { cn } from '@/lib/utils';
import s from './new-order.module.css';

/**
 * Почты для доверенности под адресом точки — одной строкой в стиле окна
 * заявки (владелец, 29.10.2026: белая карточка с полем ввода «в дизайн не
 * вписывается»). Почты — плашками, новая — по «+ Ещё почта». Сохраняет их
 * за адресом `RoutePointEmails`, как и раньше.
 */
export function PointEmails({ value, save, saving, error }: RoutePointEmailsApi) {
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [bad, setBad] = useState('');

    /** Добавить набранное; `false` — не похоже на почту, поле остаётся открытым. */
    const commit = () => {
        const result = addEmails(draft, value);
        if ('error' in result) { setBad(result.error); return false; }
        setDraft('');
        setBad('');
        if (result.next.length !== value.length) save(result.next);
        return true;
    };
    const close = () => { setAdding(false); setDraft(''); setBad(''); };

    const note = bad || error || (saving ? 'Сохраняем…' : '');

    return (
        <div className={s.mailRow}>
            <span className={s.mailLabel} title="Почты сохраняются за адресом и подставятся в следующей заявке">
                <Mail className="size-3.5" aria-hidden />
                Доверенность
            </span>
            {value.map((email) => (
                <span key={email} className={s.mailChip}>
                    <span className={s.mailChipText} title={email}>{email}</span>
                    <button
                        type="button"
                        className={s.mailChipX}
                        aria-label={`Убрать ${email}`}
                        onClick={() => save(value.filter((e) => e !== email))}
                    >
                        <X className="size-3" />
                    </button>
                </span>
            ))}
            {adding ? (
                <input
                    autoFocus
                    className={cn(s.mailInput, bad && s.mailInputErr)}
                    value={draft}
                    placeholder="почта склада"
                    aria-label="Почта для доверенности"
                    inputMode="email"
                    data-esc-local
                    onChange={(e) => { setDraft(e.target.value); setBad(''); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            // Добавили — поле остаётся открытым для следующей почты.
                            if (draft.trim()) commit(); else close();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            close();
                        }
                    }}
                    onBlur={() => { if (!draft.trim() || commit()) close(); }}
                />
            ) : (
                <button type="button" className={s.mailAdd} onClick={() => setAdding(true)}>
                    <Plus className="size-3" aria-hidden />
                    {value.length ? 'Ещё почта' : 'Почта для доверенности'}
                </button>
            )}
            {note && <span className={cn(s.mailNote, (bad || error) && s.mailNoteErr)}>{note}</span>}
        </div>
    );
}
