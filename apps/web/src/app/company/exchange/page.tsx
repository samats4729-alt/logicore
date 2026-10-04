'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { EXCHANGE_LOAD_STATUS_LABELS } from '@/lib/vocabulary';
import { ExchangeFilter, ExchangeList, грузКратко, когдаПогрузка } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';
import styles from '@/components/nova/nova.module.css';

const FILTERS: { key: ExchangeFilter; label: string }[] = [
    { key: 'active', label: 'В работе' },
    { key: 'done', label: 'Доставлены' },
    { key: 'cancelled', label: 'Сняты' },
    { key: 'all', label: 'Все' },
];

/**
 * Биржа — грузы компании.
 *
 * Сверху то, что сейчас в работе: груз ищет машину или едет. Доставленные
 * и снятые — во вкладках, чтобы не мешали.
 */
export default function ExchangePage() {
    const router = useRouter();
    const [filter, setFilter] = useState<ExchangeFilter>('active');
    const [data, setData] = useState<ExchangeList | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        api.get(`/exchange/loads?status=${filter}`)
            .then((r) => { if (alive) setData(r.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [filter]);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Биржа</div>
                    <h1 className={styles.title}>Биржа</h1>
                    <p className={styles.subtitle}>
                        Поставьте груз — водители увидят его в приложении и возьмут.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <Button onClick={() => router.push('/company/exchange/new')}>
                        <Plus className="h-4 w-4" /> Поставить груз
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
                    <Store size={14} />
                    <h2 className={styles.cardTitle}>Грузы</h2>
                    {data && <span className={styles.cardCount}>{data.loads.length}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить грузы. Обновите страницу.</div>
                ) : !data ? (
                    <div className="h-40 animate-pulse" />
                ) : data.loads.length === 0 ? (
                    <div className={styles.empty}>
                        {filter === 'active'
                            ? 'Сейчас грузов на бирже нет. Поставьте первый — кнопка вверху справа.'
                            : 'Здесь пока пусто.'}
                    </div>
                ) : (
                    <Table className="border-collapse text-[13px]">
                        <TableHeader>
                            <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Груз</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Маршрут</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Погрузка</TableHead>
                                <TableHead className="h-9 text-[11px] uppercase tracking-wide">Что везём</TableHead>
                                <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Цена</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.loads.map((load) => (
                                <TableRow
                                    key={load.id}
                                    className="cursor-pointer border-0 border-b border-solid border-border"
                                    onClick={() => router.push(`/company/exchange/${load.id}`)}
                                    aria-label={`Открыть груз ${load.number}`}
                                >
                                    <TableCell className="py-2.5">
                                        <div className="font-semibold tabular-nums">{load.number}</div>
                                        <div className="mt-1"><StatusPill status={load.status} label={EXCHANGE_LOAD_STATUS_LABELS[load.status]} /></div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5 font-medium">
                                            {load.originCityName} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {load.destinationCityName}
                                        </div>
                                        {(load.originAddress || load.destinationAddress) && (
                                            <div className="mt-0.5 max-w-[320px] truncate text-[12px] text-muted-foreground">
                                                {[load.originAddress, load.destinationAddress].filter(Boolean).join(' → ')}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">{когдаПогрузка(load)}</TableCell>
                                    <TableCell className="max-w-[280px] truncate text-muted-foreground">{грузКратко(load)}</TableCell>
                                    <TableCell className="text-right font-semibold tabular-nums">{moneyShort(load.price)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </section>
        </div>
    );
}
