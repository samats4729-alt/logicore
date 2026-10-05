'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, FileText, Search, Store, UsersRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { VEHICLE_TYPES } from '@/lib/constants';
import { ExchangeOrder, exchangeStatus, грузКратко, день, черезТочки } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import styles from '@/components/nova/nova.module.css';

type Tab = 'board' | 'mine';

/**
 * Биржа.
 *
 * Первая вкладка — заявки других компаний, которые ищут, кто повезёт:
 * перевозчик смотрит, откуда и куда, когда, что за груз и за сколько.
 * Вторая — свои заявки, выставленные на биржу. Выставляют из карточки
 * заявки: биржа — это обычная заявка, у которой пока нет исполнителя.
 */
export default function ExchangePage() {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>('board');
    const [board, setBoard] = useState<ExchangeOrder[] | null>(null);
    const [mine, setMine] = useState<ExchangeOrder[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [isPark, setIsPark] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [bodyType, setBodyType] = useState('');

    useEffect(() => {
        let alive = true;
        exchangeStatus().then((s) => { if (alive) setIsPark(s.isPark); });
        setFailed(false);
        Promise.all([api.get('/exchange/board'), api.get('/exchange/mine')])
            .then(([b, m]) => { if (alive) { setBoard(b.data); setMine(m.data); } })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, []);

    /** Фильтр прямо в браузере: заявок на бирже сотни, не тысячи. */
    const shown = useMemo(() => {
        const has = (v: string | null, needle: string) => !needle.trim() || (v ?? '').toLowerCase().includes(needle.trim().toLowerCase());
        const list = tab === 'board' ? board : mine;
        return (list ?? []).filter((o) => has(o.from, from) && has(o.to, to) && has(o.bodyType, bodyType));
    }, [tab, board, mine, from, to, bodyType]);
    const filtered = !!(from.trim() || to.trim() || bodyType);
    const stale = (mine ?? []).filter((o) => o.stale).length;

    const open = (o: ExchangeOrder) => router.push(tab === 'board' ? `/company/exchange/${o.id}` : `/company/orders/${o.id}`);

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Биржа</div>
                    <h1 className={styles.title}>Биржа заявок</h1>
                    <p className={styles.subtitle}>
                        Заявки других компаний, которым нужен исполнитель. Свою заявку выставляют на биржу из её карточки —
                        кнопкой «Выставить на биржу», пока исполнителя нет.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    {isPark && (
                        <Button variant="outline" onClick={() => router.push('/company/exchange/drivers')}>
                            <UsersRound className="h-4 w-4" /> Водители парка
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => router.push('/company/orders')}>
                        <FileText className="h-4 w-4" /> К заявкам
                    </Button>
                </div>
            </div>

            <div className={styles.pills} role="tablist" style={{ marginBottom: 12 }}>
                {([['board', 'Заявки на бирже', board], ['mine', 'Мои на бирже', mine]] as const).map(([key, label, list]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        className={`${styles.pill} ${tab === key ? styles.pillActive : ''}`}
                        onClick={() => setTab(key)}
                    >
                        {label}{list ? ` · ${list.length}` : ''}
                    </button>
                ))}
            </div>

            {tab === 'mine' && stale > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-solid border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        {stale === 1 ? 'У одной заявки' : `У ${stale} заявок`} день погрузки уже прошёл — на бирже их больше никто не видит.
                        Поменяйте дату в заявке или снимите её с биржи.
                    </span>
                </div>
            )}

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Store size={14} />
                    <h2 className={styles.cardTitle}>{tab === 'board' ? 'Ищут исполнителя' : 'Ваши заявки на бирже'}</h2>
                    <span className={styles.cardCount}>{shown.length}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-0 border-b border-solid border-border px-4 py-3">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input aria-label="Откуда" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Откуда" className="h-8 w-40 pl-8 text-[13px]" />
                    </div>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input aria-label="Куда" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Куда" className="h-8 w-40 pl-8 text-[13px]" />
                    </div>
                    <select
                        aria-label="Кузов"
                        value={bodyType}
                        onChange={(e) => setBodyType(e.target.value)}
                        className={`h-8 rounded-xl border border-solid border-input bg-background px-3 text-[13px] [font-family:inherit] ${bodyType ? '' : 'text-muted-foreground'}`}
                    >
                        <option value="">Любой кузов</option>
                        {VEHICLE_TYPES.filter((t) => t !== 'не указан').map((t) => <option key={t} value={t} className="text-foreground">{t}</option>)}
                    </select>
                    {filtered && (
                        <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setBodyType(''); }}>
                            <X className="h-3.5 w-3.5" /> Сбросить
                        </Button>
                    )}
                </div>

                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить биржу — проверьте интернет и обновите страницу.</div>
                ) : !board || !mine ? (
                    <div className="space-y-2 p-4" aria-label="Загрузка">
                        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />)}
                    </div>
                ) : shown.length === 0 ? (
                    <div className={styles.empty}>
                        {filtered
                            ? 'По этому фильтру заявок нет. Попробуйте другой город или сбросьте фильтр.'
                            : tab === 'board'
                                ? 'Сейчас на бирже нет заявок других компаний. Загляните позже.'
                                : 'Ваших заявок на бирже нет. Откройте заявку без исполнителя и нажмите «Выставить на биржу».'}
                    </div>
                ) : (
                    <>
                        <Table className="hidden border-collapse text-[13px] md:table">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Маршрут</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Погрузка</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">Груз</TableHead>
                                    <TableHead className="h-9 text-[11px] uppercase tracking-wide">{tab === 'board' ? 'Компания' : 'Заявка'}</TableHead>
                                    <TableHead className="h-9 text-right text-[11px] uppercase tracking-wide">Цена</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {shown.map((o) => (
                                    <TableRow
                                        key={o.id}
                                        className="cursor-pointer border-0 border-b border-solid border-border"
                                        onClick={() => open(o)}
                                        aria-label={`Открыть заявку ${o.orderNumber}`}
                                    >
                                        <TableCell className="py-2.5">
                                            <div className="flex items-center gap-1.5 font-semibold">
                                                {o.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {o.to}
                                            </div>
                                            {черезТочки(o) && <div className="mt-0.5 text-[12px] text-muted-foreground">{черезТочки(o)}</div>}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {o.stale
                                                ? <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> {день(o.loadingDate)} — прошла</span>
                                                : день(o.loadingDate)}
                                        </TableCell>
                                        <TableCell className="max-w-[280px] truncate text-muted-foreground">{грузКратко(o)}</TableCell>
                                        <TableCell className="whitespace-nowrap">{tab === 'board' ? (o.companyName ?? '—') : o.orderNumber}</TableCell>
                                        <TableCell className="text-right font-semibold tabular-nums">{o.price != null ? moneyShort(o.price) : 'договорная'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <ul className="m-0 list-none divide-y divide-border p-0 md:hidden">
                            {shown.map((o) => (
                                <li key={o.id}>
                                    <button
                                        type="button"
                                        onClick={() => open(o)}
                                        aria-label={`Открыть заявку ${o.orderNumber}`}
                                        className="flex w-full flex-col gap-1 bg-transparent px-4 py-3 text-left [font-family:inherit]"
                                    >
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">
                                                {o.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {o.to}
                                            </span>
                                            <span className="shrink-0 text-[15px] font-bold tabular-nums">{o.price != null ? moneyShort(o.price) : 'договорная'}</span>
                                        </div>
                                        <div className="text-[12px] text-muted-foreground">
                                            {день(o.loadingDate)}{черезТочки(o) ? ` · ${черезТочки(o)}` : ''} · {грузКратко(o)}
                                        </div>
                                        <div className="text-[12px] text-muted-foreground">{tab === 'board' ? o.companyName : `Заявка ${o.orderNumber}`}</div>
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
