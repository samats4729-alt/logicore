'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import nova from '@/components/nova/nova.module.css';
import { Input } from '@/components/ui/input';
import DriverFormDialog from '@/components/drivers/DriverFormDialog';
import { driverKindLabel, fetchDriverPool, type PoolDriver } from '@/lib/driver-pool';
import styles from './drivers.module.css';

/**
 * Водители — все в одном месте.
 *
 * Раньше учёта водителей как такового не было: штатные жили в «Сотрудниках»,
 * водители ИП — каждый в карточке своего перевозчика, а человека со своей
 * фурой без ИП завести было некуда вовсе. Чтобы понять, кто вообще возит
 * рейсы, приходилось обходить три места.
 *
 * Здесь вся база компании одним списком: штатные и нештатные. Нештатный —
 * любой другой водитель: от ИП из справочника или сам по себе. Любого из них
 * можно поставить на рейс любого перевозчика компании и на несколько рейсов
 * сразу. Один человек — одна строка, сколько бы раз его ни заводили.
 */

type Filter = 'all' | 'staff' | 'other';

const FILTERS: [Filter, string][] = [
    ['all', 'Все'],
    ['staff', 'Штатные'],
    ['other', 'Нештатные'],
];

const дата = (value: string) => new Date(value)
    .toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

const фио = (d: PoolDriver) => `${d.lastName} ${d.firstName} ${d.middleName || ''}`.trim();

export default function DriversPage() {
    const [drivers, setDrivers] = useState<PoolDriver[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [filter, setFilter] = useState<Filter>('all');
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<PoolDriver | null>(null);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            setDrivers(await fetchDriverPool());
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const counts = useMemo(() => ({
        all: drivers.length,
        staff: drivers.filter((d) => d.kind === 'STAFF').length,
        other: drivers.filter((d) => d.kind !== 'STAFF').length,
    }), [drivers]);

    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        const цифры = term.replace(/\D/g, '');
        return drivers
            .filter((d) => filter === 'all' || (filter === 'staff' ? d.kind === 'STAFF' : d.kind !== 'STAFF'))
            .filter((d) => {
                if (!term) return true;
                const text = [фио(d), d.vehiclePlate, d.trailerNumber, d.vehicleModel, d.companyName]
                    .filter(Boolean).join(' ').toLowerCase();
                if (text.includes(term)) return true;
                // Телефон ищем по цифрам: «8 701…» и «+7 701…» — один номер.
                return цифры.length >= 3 && (d.phone || '').replace(/\D/g, '').includes(цифры);
            });
    }, [drivers, filter, search]);

    const openNew = () => { setEditing(null); setDialogOpen(true); };
    const openEdit = (d: PoolDriver) => { setEditing(d); setDialogOpen(true); };

    return (
        <div className={`${nova.page} ${nova.pageWide}`}>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Кабинет · Справочники</div>
                    <h1 className={nova.title}>Водители</h1>
                    <p className={nova.subtitle}>
                        Все, кто возит ваши рейсы: штатные и нештатные. Любого можно поставить на рейс
                        любого вашего перевозчика — и на несколько рейсов сразу.
                    </p>
                </div>
                <div className={nova.heroActions}>
                    <button type="button" className={`${nova.action} ${nova.actionPrimary}`} onClick={openNew}>
                        <Plus size={15} /> Добавить водителя
                    </button>
                </div>
            </div>

            <div className={styles.toolbar}>
                <div className={nova.pills} role="tablist" aria-label="Какие водители">
                    {FILTERS.map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={filter === key}
                            className={`${nova.pill} ${filter === key ? nova.pillActive : ''}`}
                            onClick={() => setFilter(key)}
                        >
                            {label}<span className={styles.count}>{counts[key]}</span>
                        </button>
                    ))}
                </div>
                <div className={styles.search}>
                    <Search className={styles.searchIcon} />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Фамилия, телефон или госномер"
                        className="h-9 pl-9 text-[13px]"
                        aria-label="Поиск водителя"
                    />
                </div>
            </div>

            <section className={nova.card}>
                {loading ? (
                    <div className={styles.state}>Загружаю водителей…</div>
                ) : failed ? (
                    <div className={styles.state}>
                        <div className={styles.stateTitle}>Список не загрузился</div>
                        Это сбой связи, а не пустая база.
                        <div>
                            <button type="button" className={`${nova.action} ${styles.stateAction}`} onClick={load}>
                                Повторить
                            </button>
                        </div>
                    </div>
                ) : drivers.length === 0 ? (
                    <div className={styles.state}>
                        <div className={styles.stateTitle}>Водителей пока нет</div>
                        Добавьте первого — его сразу можно будет поставить на рейс.
                        <div>
                            <button type="button" className={`${nova.action} ${nova.actionPrimary} ${styles.stateAction}`} onClick={openNew}>
                                <Plus size={15} /> Добавить водителя
                            </button>
                        </div>
                    </div>
                ) : visible.length === 0 ? (
                    <div className={styles.state}>
                        {search.trim()
                            ? `По запросу «${search.trim()}» никого нет. Проверьте написание или добавьте водителя.`
                            : 'В этом отборе водителей нет.'}
                    </div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Водитель</th>
                                    <th>Машина</th>
                                    <th>Кто</th>
                                    <th>Последний рейс</th>
                                    <th className={styles.num}>Рейсов</th>
                                    <th aria-label="Действия" />
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((d) => {
                                    const вид = driverKindLabel(d);
                                    return (
                                        <tr
                                            key={d.id}
                                            className={styles.row}
                                            tabIndex={0}
                                            onClick={() => openEdit(d)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') openEdit(d); }}
                                        >
                                            <td>
                                                <div className={styles.name}>{фио(d)}</div>
                                                <div className={styles.sub}>{d.phone}</div>
                                            </td>
                                            <td>
                                                {d.vehiclePlate ? (
                                                    <>
                                                        <div className={styles.plate}>
                                                            {d.vehiclePlate}
                                                            {d.trailerNumber ? <span className={styles.muted}> · прицеп {d.trailerNumber}</span> : null}
                                                        </div>
                                                        {(d.vehicleModel || d.vehicleType) && (
                                                            <div className={styles.sub}>
                                                                {[d.vehicleModel, d.vehicleType].filter(Boolean).join(' · ')}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className={styles.muted}>не указана</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`${nova.chip} ${d.kind === 'STAFF' ? nova.chipPos : ''}`}>{вид.label}</span>
                                                {вид.detail && <div className={styles.sub}>{вид.detail}</div>}
                                            </td>
                                            <td>
                                                {d.lastTrip ? (
                                                    <>
                                                        <div className={styles.plate}>{дата(d.lastTrip.at)}</div>
                                                        {d.lastTrip.carrierName && <div className={styles.sub}>{d.lastTrip.carrierName}</div>}
                                                    </>
                                                ) : (
                                                    <span className={styles.muted}>ещё не ездил</span>
                                                )}
                                            </td>
                                            <td className={styles.num}>{d.tripsCount || <span className={styles.muted}>—</span>}</td>
                                            <td className={styles.editCell}>
                                                <button
                                                    type="button"
                                                    className={styles.editButton}
                                                    aria-label={`Изменить: ${фио(d)}`}
                                                    onClick={(e) => { e.stopPropagation(); openEdit(d); }}
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <p className={styles.footnote}>
                Штатные — те, кто работает у вас: они есть и в «Сотрудниках». Нештатные — все остальные: водители
                ИП из справочника и люди со своей машиной без ИП. Номер машины на конкретный рейс вписывается в
                заявке — в карточке водителя хранится его обычная машина.
            </p>

            <DriverFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                driver={editing}
                onSaved={load}
            />
        </div>
    );
}
