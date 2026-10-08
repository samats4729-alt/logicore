'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { ArrowLeft, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { EXCHANGE_DRIVER_STATUS_LABELS } from '@/lib/vocabulary';
import { ParkDriverFilter, ParkDriverList, иинКрасиво, фиоВодителя, телефонКрасиво } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';
import styles from '@/components/nova/nova.module.css';

const FILTERS: { key: ParkDriverFilter; label: string }[] = [
    { key: 'pending', label: 'На проверке' },
    { key: 'approved', label: 'Допущены' },
    { key: 'rejected', label: 'Отказ' },
    { key: 'blocked', label: 'Заблокированы' },
    { key: 'all', label: 'Все' },
];

/**
 * Водители парка — кто хочет возить через этот парк.
 *
 * Первая вкладка — «На проверке»: это работа, которая ждёт. Парк смотрит
 * документы, звонит водителю и допускает его к грузам или отказывает.
 */
export default function ParkDriversPage() {
    const router = useRouter();
    const [filter, setFilter] = useState<ParkDriverFilter>('pending');
    // С главной кабинета приходят с ?status= — открываем нужную вкладку.
    useEffect(() => {
        const wanted = new URLSearchParams(window.location.search).get('status');
        if (wanted && FILTERS.some((f) => f.key === wanted)) setFilter(wanted as ParkDriverFilter);
    }, []);
    const [data, setData] = useState<ParkDriverList | null>(null);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setFailed(null);
        api.get(`/exchange/park/drivers?status=${filter}`)
            .then((r) => { if (alive) setData(r.data); })
            .catch((e) => {
                if (!alive) return;
                setFailed(e?.response?.status === 403
                    ? 'Ваша компания не парк биржи. Отметку ставит владелец платформы.'
                    : 'Не удалось загрузить водителей. Обновите страницу.');
            });
        return () => { alive = false; };
    }, [filter]);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет парка</div>
                    <h1 className={styles.title}>Водители парка</h1>
                    <p className={styles.subtitle}>
                        Водители без ИП, которые возят через ваш парк. Проверьте документы, позвоните — и допустите к грузам.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <Button variant="outline" onClick={() => router.push('/company/park')}>
                        <ArrowLeft className="h-4 w-4" /> К кабинету
                    </Button>
                </div>
            </div>

            <div className={styles.pills} role="tablist" style={{ marginBottom: 12 }}>
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        role="tab"
                        aria-selected={filter === f.key}
                        className={`${styles.pill} ${filter === f.key ? styles.pillActive : ''}`}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label}{data ? ` · ${data.counts[f.key]}` : ''}
                    </button>
                ))}
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <UsersRound size={14} />
                    <h2 className={styles.cardTitle}>Водители</h2>
                    {data && <span className={styles.cardCount}>{data.drivers.length}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>{failed}</div>
                ) : !data ? (
                    <div className="h-40 animate-pulse" />
                ) : data.drivers.length === 0 ? (
                    <div className={styles.empty}>
                        {filter === 'pending'
                            ? 'Новых анкет нет. Водители появятся здесь, когда выберут ваш парк в приложении.'
                            : 'Здесь пока пусто.'}
                    </div>
                ) : (
                    <Table className="border-collapse text-[13px]">
                        <TableHeader>
                            <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                <TableHead className="h-9 text-[12.5px]">Водитель</TableHead>
                                <TableHead className="h-9 text-[12.5px]">ИИН и телефон</TableHead>
                                <TableHead className="h-9 text-[12.5px]">Машина</TableHead>
                                <TableHead className="h-9 text-[12.5px]">Анкета подана</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.drivers.map((d) => (
                                <TableRow
                                    key={d.id}
                                    className="cursor-pointer border-0 border-b border-solid border-border"
                                    onClick={() => router.push(`/company/park/drivers/${d.id}`)}
                                    aria-label={`Открыть анкету: ${фиоВодителя(d)}`}
                                >
                                    <TableCell className="py-2.5">
                                        <div className="font-semibold">{фиоВодителя(d)}</div>
                                        <div className="mt-1"><StatusPill status={d.status} label={EXCHANGE_DRIVER_STATUS_LABELS[d.status]} /></div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="tabular-nums">{иинКрасиво(d.iin)}</div>
                                        <div className="text-[12px] text-muted-foreground tabular-nums">{d.phone ? телефонКрасиво(d.phone) : '—'}</div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-medium tabular-nums">{d.vehiclePlate || '—'}</div>
                                        <div className="text-[12px] text-muted-foreground">
                                            {[d.vehicleBodyType, d.vehicleCapacityKg ? `${d.vehicleCapacityKg / 1000} т` : null, !d.vehicleIsOwn ? 'не своя' : null].filter(Boolean).join(' · ')}
                                        </div>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">
                                        {d.submittedAt ? dayjs(d.submittedAt).format('DD.MM.YYYY HH:mm') : '—'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </section>
        </div>
    );
}
