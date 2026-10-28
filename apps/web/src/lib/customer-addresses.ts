import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Адреса заказчика в заявке (владелец, 29.10.2026: «при выборе заказчика
 * выходят адреса других заказчиков»).
 *
 * Когда заказчик выбран, в окне адреса видны только его адреса: привязанные
 * к нему и те, что уже были в его заявках, — последние сверху. Адреса
 * других заказчиков в список не попадают. Новый адрес из заявки
 * привязывается к заказчику (`LocationForm`), поэтому в следующий раз он
 * найдётся здесь же.
 */

/** Адреса из заявок этого заказчика — свежие первыми; null — ещё грузятся. */
export function useCustomerAddressIds(customerCompanyId?: string | null): string[] | null {
    const [ids, setIds] = useState<string[] | null>(null);
    useEffect(() => {
        setIds(null);
        if (!customerCompanyId) return;
        let alive = true;
        api.get('/locations/recent', { params: { customerId: customerCompanyId } })
            .then((r) => { if (alive) setIds(r.data || []); })
            // Не загрузилось — остаются адреса, привязанные к заказчику.
            .catch(() => { if (alive) setIds([]); });
        return () => { alive = false; };
    }, [customerCompanyId]);
    return ids;
}

type Party = { id: string; name: string };

/** Группы окна адреса при выбранном заказчике: его адреса и склады выбранного перевозчика. */
export function customerAddressGroups<T extends { id: string; name: string; companyId?: string | null }>(
    locations: T[],
    customer: Party,
    usedIds: string[],
    carrier?: Party | null,
): { label: string; options: T[] }[] {
    const byId = new Map(locations.map((l) => [l.id, l]));
    const used = usedIds.map((id) => byId.get(id)).filter((l): l is T => !!l);
    const usedSet = new Set(used.map((l) => l.id));
    const attached = locations
        .filter((l) => l.companyId === customer.id && !usedSet.has(l.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const own = [...used, ...attached];

    const groups: { label: string; options: T[] }[] = [];
    if (own.length) groups.push({ label: `Адреса заказчика [${customer.name}]`, options: own });
    // Склады выбранного перевозчика — не чужие: это сторона этой же заявки.
    if (carrier && carrier.id !== customer.id) {
        const ownIds = new Set(own.map((l) => l.id));
        const carrierLocs = locations.filter((l) => l.companyId === carrier.id && !ownIds.has(l.id));
        if (carrierLocs.length) groups.push({ label: `Склады перевозчика [${carrier.name}]`, options: carrierLocs });
    }
    return groups;
}
