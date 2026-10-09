'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListPicker, PickerField, type PickerGroup, type PickerItem } from '@/components/pickers/ListPicker';
import type { PoolDriver } from '@/lib/driver-pool';
import { NEW_DRIVER } from './DriverPoolSelect';

const фио = (в: PoolDriver) => `${в.lastName} ${в.firstName} ${в.middleName || ''}`.trim();

/**
 * Выбор водителя из общей базы — окном с поиском (владелец, 08.10.2026).
 *
 * Группы те же, что в прежнем выпадающем списке (`DriverPoolSelect`):
 * сверху — кто уже ездил за выбранного перевозчика или у него прописан,
 * ниже — вся остальная база. Ищется по ФИО, телефону и госномеру:
 * диспетчер чаще помнит машину, чем отчество. «Добавить нового водителя»
 * всегда внизу окна — не нашёл, сразу заводит.
 *
 * Отвечает форме так же, как прежний список: `value` и `onChange(id)`,
 * новый водитель — `NEW_DRIVER`.
 */
export function DriverPicker({
    id,
    drivers,
    carrierId,
    ownTransport,
    loading,
    value,
    onChange,
}: {
    id?: string;
    drivers: PoolDriver[];
    /** Кто везёт рейс: перевозчик или своя компания. */
    carrierId?: string | null;
    /** Рейс на своём транспорте — верхняя группа называется иначе. */
    ownTransport?: boolean;
    loading?: boolean;
    value?: string;
    onChange?: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);

    const { groups, byId } = useMemo(() => {
        const пункт = (в: PoolDriver): PickerItem => ({
            id: в.id,
            title: фио(в),
            subtitle: [в.phone, в.vehiclePlate, в.trailerNumber].filter(Boolean).join(' · '),
            // Справа: штатный — так и пишем; иначе — за кого ездил последним,
            // а если ещё не ездил — у кого прописан или что он нештатный.
            aside: в.isStaff
                ? 'штатный'
                : в.lastTrip?.carrierName
                    ? `последний рейс: ${в.lastTrip.carrierName}`
                    : в.kind === 'INDEPENDENT' ? 'нештатный' : в.companyName || '',
            keywords: в.phone?.replace(/\D/g, ''),
        });
        const знакомые = carrierId ? drivers.filter((в) => в.carrierIds.includes(carrierId)) : [];
        const остальные = drivers.filter((в) => !знакомые.includes(в));
        const out: PickerGroup[] = [];
        if (знакомые.length) {
            out.push({ label: ownTransport ? 'Ваши водители' : 'Уже ездили за этого перевозчика', items: знакомые.map(пункт) });
        }
        if (остальные.length) {
            out.push({ label: знакомые.length ? 'Остальные водители из базы' : 'Водители из базы', items: остальные.map(пункт) });
        }
        return { groups: out, byId: new Map(drivers.map((в) => [в.id, в])) };
    }, [drivers, carrierId, ownTransport]);

    const выбран = value && value !== NEW_DRIVER ? byId.get(value) : undefined;
    const подпись = value === NEW_DRIVER
        ? 'Новый водитель — заполните данные ниже'
        : выбран ? `${фио(выбран)} (${выбран.phone})` : undefined;

    return (
        <>
            <PickerField
                id={id}
                label="Водитель"
                placeholder={loading && !drivers.length ? 'Загружаем базу водителей…' : 'Выберите водителя из базы'}
                value={подпись}
                onOpen={() => setOpen(true)}
            />
            <ListPicker
                open={open}
                onOpenChange={setOpen}
                title="Водитель"
                description="Вся база компании: сверху — кто уже ездил за этого перевозчика"
                searchPlaceholder="Фамилия, телефон или госномер"
                groups={groups}
                chipSets={[[
                    { id: 'staff', label: 'Штатные', test: (item) => !!byId.get(item.id)?.isStaff },
                    { id: 'independent', label: 'Нештатные', test: (item) => byId.get(item.id)?.kind === 'INDEPENDENT' },
                ]]}
                value={value}
                onSelect={(v) => onChange?.(v)}
                recentKey="driver"
                emptyText="Такого водителя в базе нет — добавьте нового."
                footer={(
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setOpen(false); onChange?.(NEW_DRIVER); }}
                    >
                        <Plus className="h-3.5 w-3.5" /> Добавить нового водителя
                    </Button>
                )}
            />
        </>
    );
}
