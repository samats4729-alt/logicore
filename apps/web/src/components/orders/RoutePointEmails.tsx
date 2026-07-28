'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
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
 * Почта, на которую уходит доверенность по этому адресу.
 *
 * Список закреплён за адресом, а не за заявкой: склад один и тот же из
 * заявки в заявку, и логист не должен каждый раз вспоминать, кому писать.
 * Один раз завели — дальше подставляется само, а отправка доверенности с
 * карточки рейса берёт их отсюда.
 *
 * Хранится он у пары «адрес + компания», а не в самой карточке адреса.
 * Справочник адресов общий: у складов владельца нет, и запись в карточку
 * возвращала «Нет доступа к этому адресу» — то есть привязать почту к
 * обычному складу было нельзя вообще. При этом контакты у каждой компании
 * свои, и общая запись всё равно затирала бы чужие.
 */
export function RoutePointEmails({
    locationId,
    value,
    onChange,
}: {
    locationId?: string;
    value: string[];
    onChange: (emails: string[]) => void;
}) {
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    if (!locationId) {
        return (
            <div className="mt-2 text-xs text-muted-foreground">
                Выберите адрес — и можно будет указать, кому отправлять доверенность.
            </div>
        );
    }

    /** Сохраняем сразу за адресом: иначе список живёт только в этой заявке. */
    const persist = async (next: string[]) => {
        onChange(next);
        try {
            setSaving(true);
            setError('');
            await api.put(`/locations/${locationId}/emails`, { emails: next.join(',') });
        } catch (e: any) {
            setError(e.response?.data?.message || 'Не удалось сохранить адреса за этой точкой');
        } finally {
            setSaving(false);
        }
    };

    const add = (raw: string) => {
        // Разрешаем вставить сразу несколько через запятую или пробел.
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
        if (next.length !== value.length) persist(next);
    };

    const remove = (email: string) => persist(value.filter((e) => e !== email));

    return (
        <div className="mt-2">
            <div className="mb-1 text-xs font-medium text-foreground">
                Куда отправить доверенность по этому адресу
            </div>

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
                    placeholder={value.length ? 'ещё адрес' : 'sklad@company.kz'}
                    className={cn(
                        'h-7 min-w-[160px] flex-1 border-0 bg-transparent px-1.5 text-[13px] shadow-none',
                        'focus-visible:ring-0 focus-visible:ring-offset-0',
                    )}
                />
            </div>

            <div className="mt-1 text-[11px] text-muted-foreground">
                {error
                    ? <span className="text-destructive">{error}</span>
                    : saving
                        ? 'Сохраняем…'
                        : 'Сохранится за адресом — в следующей заявке подставятся сами'}
            </div>
        </div>
    );
}
