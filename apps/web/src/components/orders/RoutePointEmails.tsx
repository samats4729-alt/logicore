'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { EmailListField } from '@/components/ui/EmailListField';

export { parseEmails } from '@/components/ui/EmailListField';

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
 *
 * Сам список рисует общий `EmailListField`: то же окно отправки документа
 * правит те же самые почты, и выглядеть они обязаны одинаково.
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

    return (
        <div className="mt-2">
            <div className="mb-1 text-xs font-medium text-foreground">
                Куда отправить доверенность по этому адресу
            </div>

            <EmailListField value={value} onChange={persist} />

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
