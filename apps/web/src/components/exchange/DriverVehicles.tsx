'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { DriverVehicle } from '@/lib/exchange';

/**
 * Весь транспорт водителя — для карточки в кабинете парка (задачи шефа, R4).
 *
 * Основной тягач — машина из анкеты, она показана выше. Здесь — что ещё
 * водитель держит в «Транспорте» приложения и какой прицеп у него основной:
 * его ставят в рейс, когда компания выбирает водителя.
 */
export function DriverVehicles({ driverId }: { driverId: string }) {
    const [rows, setRows] = useState<DriverVehicle[] | null>(null);

    useEffect(() => {
        api.get<DriverVehicle[]>(`/exchange/park/drivers/${driverId}/vehicles`).then((r) => setRows(r.data)).catch(() => setRows([]));
    }, [driverId]);

    if (!rows || rows.length === 0) return null;
    return (
        <div className="mt-3 border-0 border-t border-solid border-border pt-3">
            <div className="mb-1.5 text-[12px] font-medium text-muted-foreground">Весь транспорт водителя</div>
            <ul className="m-0 list-none space-y-1 p-0 text-[13px]">
                {rows.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-muted-foreground">{v.kind === 'TRAILER' ? 'Прицеп' : 'Тягач'}</span>
                        <b className="tabular-nums">{v.plate}</b>
                        <span className="text-muted-foreground">
                            {[v.model, v.bodyType, v.capacityKg ? `${v.capacityKg / 1000} т` : null, v.isOwn ? null : 'не своя'].filter(Boolean).join(' · ')}
                        </span>
                        {v.isMain && <span className="rounded-full bg-green-500/10 px-1.5 text-[11px] text-green-700 dark:text-green-400">основной</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}
