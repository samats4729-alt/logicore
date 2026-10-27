'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера } from '@/lib/exchange';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type ParkStaff = { id: string; firstName: string | null; lastName: string | null };

const имя = (u: ParkStaff) => [u.lastName, u.firstName].filter(Boolean).join(' ') || 'Сотрудник';

/**
 * Кто ведёт рейс от парка (владелец, 28.10.2026): к нему водитель пишет в
 * WhatsApp из приложения. Не назначен — водителю виден общий номер парка.
 * Сотрудников у парка немного и список не растёт, поэтому — выпадающий список.
 */
export function TripResponsibleSelect({ orderId, current, staff, onChanged }: {
    orderId: string;
    current: { id: string; name: string } | null;
    staff: ParkStaff[];
    /** Новый ответственный — список обновляет строку на месте, без перезагрузки. */
    onChanged: (responsible: { id: string; name: string }) => void;
}) {
    const [saving, setSaving] = useState(false);

    const change = async (userId: string) => {
        setSaving(true);
        try {
            await api.put(`/company/orders/${orderId}/responsible`, { userId });
            const who = staff.find((u) => u.id === userId);
            const name = who ? имя(who) : 'Сотрудник';
            toast.success(`Рейс ведёт: ${name}`);
            onChanged({ id: userId, name });
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось назначить'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Select value={current?.id ?? ''} onValueChange={change} disabled={saving || staff.length === 0}>
            <SelectTrigger aria-label="Кто ведёт рейс" className="h-7 w-[180px] text-[12px]">
                <SelectValue placeholder="Назначить, кто ведёт" />
            </SelectTrigger>
            <SelectContent>
                {/* Ответственный ушёл из списка сотрудников — всё равно показываем, кто он. */}
                {current && !staff.some((u) => u.id === current.id) && <SelectItem value={current.id}>{current.name}</SelectItem>}
                {staff.map((u) => <SelectItem key={u.id} value={u.id} className="text-[12.5px]">{имя(u)}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}
