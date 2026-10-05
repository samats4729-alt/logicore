'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Plus, Store, Truck, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { EXCHANGE_LOAD_STATUS_LABELS } from '@/lib/vocabulary';
import {
    ExchangeFilter, ExchangeList, ExchangeLoad, exchangeStatus, водительКратко, грузКратко, датаПрошла, когдаПогрузка,
} from '@/lib/exchange';
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

/** Пустой список — у каждой вкладки свои слова: что здесь бывает. */
const EMPTY: Record<ExchangeFilter, string> = {
    active: 'Сейчас на бирже ваших грузов нет. Поставьте груз — допущенные водители увидят его в приложении.',
    done: 'Доставленных грузов пока нет. Здесь появятся грузы, которые водитель довёз.',
    cancelled: 'Снятых грузов нет.',
    all: 'Вы ещё не ставили грузы на биржу.',
};

/**
 * Биржа — грузы компании.
 *
 * Сверху то, что сейчас в работе: груз ищет машину или едет. Доставленные
 * и снятые — во вкладках, чтобы не мешали. На узком экране таблица
 * превращается в карточки: маршрут, цена и статус видны без прокрутки вбок.
 */
export default function ExchangePage() {
    const router = useRouter();
    const [filter, setFilter] = useState<ExchangeFilter>('active');
    const [data, setData] = useState<ExchangeList | null>(null);
    const [failed, setFailed] = useState(false);
    /* Парк — компания-посредник: ей видны и водители, которые возят через неё. */
    const [isPark, setIsPark] = useState(false);

    useEffect(() => {
        let alive = true;
        exchangeStatus().then((s) => { if (alive) setIsPark(s.isPark); });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        api.get(`/exchange/loads?status=${filter}`)
            .then((r) => { if (alive) setData(r.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [filter]);

    const open = (load: ExchangeLoad) => router.push(`/company/exchange/${load.id}`);
    const stale = data?.loads.filter(датаПрошла).length ?? 0;

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Биржа грузов</div>
                    <h1 className={styles.title}>Ваши грузы</h1>
                    <p className={styles.subtitle}>
                        Поставьте груз — допущенные водители увидят его в приложении.
                        Кто первым нажмёт «Беру», тот и везёт.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    {isPark && (
                        <Button variant="outline" onClick={() => router.push('/company/exchange/drivers')}>
                            <UsersRound className="h-4 w-4" /> Водители парка
                        </Button>
                    )}
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

            {stale > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-solid border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        {stale === 1 ? 'У одного груза' : `У ${stale} грузов`} день погрузки уже прошёл — водители такие грузы не видят.
                        Откройте груз, снимите его и поставьте заново с новой датой.
                    </span>
                </div>
            )}

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Store size={14} />
                    <h2 className={styles.cardTitle}>{FILTERS.find((f) => f.key === filter)?.label}</h2>
                    {data && <span className={styles.cardCount}>{data.loads.length}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить грузы — проверьте интернет и обновите страницу.</div>
                ) : !data ? (
                    <div className="space-y-2 p-4" aria-label="Загрузка">
                        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />)}
                    </div>
                ) : data.loads.length === 0 ? (
                    <div className={styles.empty}>
                        <p className="m-0">{EMPTY[filter]}</p>
                        {(filter === 'active' || filter === 'all') && (
                            <Button className="mt-3" onClick={() => router.push('/company/exchange/new')}>
                                <Plus className="h-4 w-4" /> Поставить груз
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Широкий экран — таблица */}
                        <Table className="hidden border-collapse text-[13px] md:table">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Груз</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Маршрут</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Погрузка</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Что везём</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Водитель</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Цена</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.loads.map((load) => (
                                    <TableRow
                                        key={load.id}
                                        className="cursor-pointer border-0 border-b border-solid border-border"
                                        onClick={() => open(load)}
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
                                                <div className="mt-0.5 max-w-[280px] truncate text-[12px] text-muted-foreground">
                                                    {[load.originAddress, load.destinationAddress].filter(Boolean).join(' → ')}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <LoadingDate load={load} />
                                        </TableCell>
                                        <TableCell className="max-w-[240px] truncate text-muted-foreground">{грузКратко(load)}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <DriverCell load={load} />
                                        </TableCell>
                                        <TableCell className="text-right font-semibold tabular-nums">{moneyShort(load.price)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {/* Узкий экран — карточки */}
                        <ul className="m-0 list-none divide-y divide-border p-0 md:hidden">
                            {data.loads.map((load) => (
                                <li key={load.id}>
                                    <button
                                        type="button"
                                        onClick={() => open(load)}
                                        aria-label={`Открыть груз ${load.number}`}
                                        className="flex w-full flex-col gap-1.5 bg-transparent px-4 py-3 text-left [font-family:inherit]"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[12px] font-semibold tabular-nums text-muted-foreground">{load.number}</span>
                                            <StatusPill status={load.status} label={EXCHANGE_LOAD_STATUS_LABELS[load.status]} />
                                        </div>
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">
                                                {load.originCityName} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {load.destinationCityName}
                                            </span>
                                            <span className="shrink-0 text-[15px] font-bold tabular-nums">{moneyShort(load.price)}</span>
                                        </div>
                                        <div className="text-[12px] text-muted-foreground"><LoadingDate load={load} /> · {грузКратко(load)}</div>
                                        {load.driver && (
                                            <div className="flex items-center gap-1.5 text-[12px]"><Truck className="h-3.5 w-3.5 text-muted-foreground" />{водительКратко(load.driver)}</div>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </section>
        </div>
    );
}

/** День погрузки; прошёл, а груз всё ещё ищет машину — предупреждение рядом. */
function LoadingDate({ load }: { load: ExchangeLoad }) {
    if (!датаПрошла(load)) return <>{когдаПогрузка(load)}</>;
    return (
        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300" title="Водители этот груз уже не видят">
            <AlertTriangle className="h-3.5 w-3.5" /> {когдаПогрузка(load)} — дата прошла
        </span>
    );
}

/** Кто везёт; пока водителя нет — что происходит с грузом. */
function DriverCell({ load }: { load: ExchangeLoad }) {
    if (load.driver) return <span>{водительКратко(load.driver)}</span>;
    if (load.status === 'OPEN') return <span className="text-muted-foreground">ищем водителя</span>;
    return <span className="text-muted-foreground">—</span>;
}
