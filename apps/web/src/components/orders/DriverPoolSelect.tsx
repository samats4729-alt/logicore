'use client';

import { useMemo } from 'react';
import { Select } from 'antd';
import type { PoolDriver } from '@/lib/driver-pool';
import styles from './DriverPoolSelect.module.css';

/** Значение пункта «добавить нового» — его ждут формы назначения. */
export const NEW_DRIVER = '__NEW_DRIVER__';

const фио = (в: PoolDriver) => `${в.lastName} ${в.firstName} ${в.middleName || ''}`.trim();

/**
 * Выбор водителя из общей базы компании.
 *
 * Одна и та же база в мастере заявки и в окне «Назначить водителя». Сверху —
 * те, кто уже ездил за выбранного перевозчика или у него прописан; ниже — все
 * остальные: водитель, который вчера ехал от другого ИП, сегодня едет от
 * этого, и заводить его заново незачем.
 *
 * Ищется по ФИО, телефону и госномеру: диспетчер чаще помнит машину, чем
 * отчество.
 */
export default function DriverPoolSelect({
    drivers,
    carrierId,
    ownTransport,
    loading,
    value,
    onChange,
}: {
    drivers: PoolDriver[];
    /** Кто везёт рейс: перевозчик или своя компания. */
    carrierId?: string | null;
    /** Рейс на своём транспорте — верхняя группа называется иначе. */
    ownTransport?: boolean;
    loading?: boolean;
    value?: string;
    onChange?: (value: string) => void;
}) {
    const options = useMemo(() => {
        const пункт = (в: PoolDriver) => {
            // Подсказка справа: штатный — так и пишем; иначе — за кого ездил
            // последним, а если ещё не ездил — у кого прописан.
            const подсказка = в.isStaff
                ? 'штатный'
                : в.lastTrip?.carrierName
                    ? `последний рейс: ${в.lastTrip.carrierName}`
                    : в.companyName || '';
            return {
                value: в.id,
                short: `${фио(в)} (${в.phone})`,
                search: [фио(в), в.phone, в.phone?.replace(/\D/g, ''), в.vehiclePlate, в.trailerNumber]
                    .filter(Boolean).join(' ').toLowerCase(),
                label: (
                    <span className={styles.option}>
                        <span className={styles.who}>
                            <span className={styles.name}>{фио(в)}</span>
                            <span className={styles.meta}>
                                {в.phone}{в.vehiclePlate ? ` · ${в.vehiclePlate}` : ''}
                            </span>
                        </span>
                        {подсказка && <span className={styles.hint}>{подсказка}</span>}
                    </span>
                ),
            };
        };

        const знакомые = carrierId ? drivers.filter((в) => в.carrierIds.includes(carrierId)) : [];
        const остальные = drivers.filter((в) => !знакомые.includes(в));
        const группы: any[] = [];
        if (знакомые.length) {
            группы.push({
                label: ownTransport ? 'Ваши водители' : 'Уже ездили за этого перевозчика',
                options: знакомые.map(пункт),
            });
        }
        if (остальные.length) {
            группы.push({
                label: знакомые.length ? 'Остальные водители из базы' : 'Водители из базы',
                options: остальные.map(пункт),
            });
        }
        группы.push({
            value: NEW_DRIVER,
            short: '+ Добавить нового водителя',
            search: '',
            label: <span className={styles.add}>+ Добавить нового водителя</span>,
        });
        return группы;
    }, [drivers, carrierId, ownTransport]);

    return (
        <Select
            placeholder="Выберите водителя из базы"
            loading={loading}
            value={value}
            onChange={onChange}
            showSearch
            optionLabelProp="short"
            // «Добавить нового» остаётся на виду при любом поиске: не нашёл
            // человека — сразу заводит.
            filterOption={(input, option: any) =>
                option?.value === NEW_DRIVER || (option?.search ?? '').includes(input.trim().toLowerCase())}
            options={options}
            popupMatchSelectWidth={false}
            listHeight={320}
            notFoundContent="Такого водителя в базе нет"
        />
    );
}
