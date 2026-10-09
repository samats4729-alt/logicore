'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ListPicker, PickerField, type PickerItem } from '@/components/pickers/ListPicker';

/** Контрагент так, как его знает мастер: справочник плюс партнёры платформы. */
export interface PickerPartner {
    id: string;
    name: string;
    isExternal?: boolean;
    isCustomer?: boolean;
    isCarrier?: boolean;
    bin?: string | null;
    address?: string | null;
    phone?: string | null;
    responsibleManagerId?: string | null;
}

/**
 * Выбор заказчика или перевозчика — окном по центру (владелец, 08.10.2026).
 *
 * Контрагентов заводит сам пользователь, со временем их сотни, и в
 * выпадающем списке их было не найти: он прокручивался вместе со всем
 * окном мастера. Здесь поиск по названию, БИН, телефону и адресу, пилюли
 * «Мои» и «на платформе / нет», «Недавние» сверху. Своя компания — первой
 * строкой, как и раньше.
 */
export function PartnerPicker({
    id,
    role,
    value,
    onChange,
    partners,
    ownValue,
    ownLabel,
    userId,
    scope,
    onAdd,
}: {
    id?: string;
    role: 'CUSTOMER' | 'CARRIER';
    value?: string;
    onChange: (value: string) => void;
    partners: PickerPartner[];
    /** Значение «своя компания» в форме. */
    ownValue: string;
    ownLabel: string;
    userId?: string;
    /** Чьи «недавние»: компания, от которой заводят заявку. */
    scope?: string;
    /** «Добавить контрагента» — заведение без выхода из мастера. */
    onAdd: () => void;
}) {
    const [open, setOpen] = useState(false);
    const заказчик = role === 'CUSTOMER';

    const { items, byId } = useMemo(() => {
        const list = partners
            .filter((p) => (заказчик ? p.isCustomer : p.isCarrier))
            .slice()
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
        return {
            items: list.map((p): PickerItem => ({
                id: p.id,
                title: p.name,
                subtitle: [p.bin ? `БИН ${p.bin}` : null, p.address].filter(Boolean).join(' · ') || undefined,
                aside: p.isExternal ? undefined : 'на платформе',
                keywords: [p.phone, p.phone?.replace(/\D/g, '')].filter(Boolean).join(' '),
            })),
            byId: new Map(list.map((p) => [p.id, p])),
        };
    }, [partners, заказчик]);

    const own: PickerItem = { id: ownValue, title: ownLabel, subtitle: 'Ваша компания', emphasis: true };
    const подпись = value === ownValue ? ownLabel : value ? byId.get(value)?.name : undefined;
    const что = заказчик ? 'заказчика' : 'перевозчика';

    return (
        <>
            <PickerField
                id={id}
                label={заказчик ? 'Заказчик' : 'Перевозчик'}
                placeholder={`Выберите ${что}`}
                value={подпись}
                onOpen={() => setOpen(true)}
            />
            <ListPicker
                open={open}
                onOpenChange={setOpen}
                title={заказчик ? 'Заказчик' : 'Перевозчик'}
                searchPlaceholder="Название, БИН, телефон или адрес"
                pinned={[own]}
                groups={[{ label: 'Контрагенты', items }]}
                chipSets={[
                    [{ id: 'mine', label: 'Мои', test: (item) => !!userId && byId.get(item.id)?.responsibleManagerId === userId }],
                    [
                        { id: 'platform', label: 'На платформе', test: (item) => byId.get(item.id)?.isExternal === false },
                        { id: 'offline', label: 'Не на платформе', test: (item) => byId.get(item.id)?.isExternal === true },
                    ],
                ]}
                value={value}
                onSelect={onChange}
                recentKey={`${заказчик ? 'customer' : 'carrier'}:${scope ?? ''}`}
                emptyText={`Такого ${что} нет. Проверьте поиск или добавьте контрагента.`}
                footer={(
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setOpen(false); onAdd(); }}
                    >
                        <Plus className="h-3.5 w-3.5" /> Добавить контрагента
                    </Button>
                )}
            />
        </>
    );
}
