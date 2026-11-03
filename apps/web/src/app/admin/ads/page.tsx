'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Users } from 'lucide-react';
import { api } from '@/lib/api';
import { COMPANY_VERIFICATION_VIEW } from '@/lib/vocabulary';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import styles from '@/components/nova/nova.module.css';

interface AdSignup {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    createdAt: string;
    company: { name: string; bin: string | null; verificationStatus: string } | null;
}

interface AdSignups {
    total: number;
    last7Days: number;
    withCompany: number;
    verified: number;
    rows: AdSignup[];
}

/**
 * Реклама: кто зарегистрировался, придя с рекламы Google.
 *
 * Показы, клики и расходы здесь не показываем: они живут в кабинете Google.
 * Здесь то, чего Google не знает: кто этот человек и дошёл ли он до работы.
 */
export default function AdminAdsPage() {
    const [data, setData] = useState<AdSignups | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        api.get('/admin/stats/ads')
            .then((r) => setData(r.data))
            .catch(() => setFailed(true));
    }, []);

    const tiles = [
        { label: 'Регистраций', value: data?.total },
        { label: 'За 7 дней', value: data?.last7Days },
        { label: 'Создали организацию', value: data?.withCompany },
        { label: 'Подтверждены', value: data?.verified },
    ];

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Платформа</div>
                    <h1 className={styles.title}>Реклама</h1>
                    <p className={styles.subtitle}>Регистрации с рекламы Google.</p>
                </div>
            </div>

            <div className={styles.tiles}>
                {tiles.map((tile) => (
                    <div key={tile.label} className={styles.tile}>
                        <div className={styles.tileHead}>
                            <span className={styles.tileLabel}>{tile.label}</span>
                        </div>
                        <div className={styles.tileValue}>{tile.value ?? '—'}</div>
                    </div>
                ))}
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Users size={14} />
                    <h2 className={styles.cardTitle}>Кто зарегистрировался</h2>
                    {data && data.total > 0 && <span className={styles.cardCount}>{data.total}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить. Обновите страницу.</div>
                ) : !data ? (
                    <div className="h-40 animate-pulse" />
                ) : data.rows.length === 0 ? (
                    <div className={styles.empty}>Регистраций с рекламы пока нет.</div>
                ) : (
                    <Table className="border-collapse text-[13px]">
                        <TableHeader>
                            <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Дата</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Имя</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Телефон</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Почта</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Организация</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">БИН</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Проверка</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.rows.map((row) => {
                                const status = row.company ? COMPANY_VERIFICATION_VIEW[row.company.verificationStatus] : null;
                                return (
                                    <TableRow key={row.id} className="border-0 border-b border-solid border-border">
                                        <TableCell className="py-2.5 tabular-nums text-muted-foreground">{dayjs(row.createdAt).format('DD.MM.YYYY HH:mm')}</TableCell>
                                        <TableCell className="py-2.5 font-medium">{row.lastName} {row.firstName}</TableCell>
                                        <TableCell className="py-2.5 tabular-nums">{row.phone}</TableCell>
                                        <TableCell className="py-2.5">{row.email || '—'}</TableCell>
                                        <TableCell className="py-2.5">{row.company?.name || 'Ещё не создана'}</TableCell>
                                        <TableCell className="py-2.5 tabular-nums text-muted-foreground">{row.company?.bin || '—'}</TableCell>
                                        <TableCell className="py-2.5">
                                            {status ? (
                                                <span className={`${styles.chip}${status.chip === 'warn' ? ` ${styles.chipWarn}` : status.chip === 'neg' ? ` ${styles.chipNeg}` : ''}`}>
                                                    {status.label}
                                                </span>
                                            ) : '—'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </section>
        </div>
    );
}
