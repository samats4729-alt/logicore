'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import { Ban, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера } from '@/lib/exchange';
import { useAuthStore } from '@/store/auth';
import { BLOCK_KIND_LABEL, BLOCK_KINDS, type BlockEntry, type BlockKind } from '@/lib/blocklist';
import AddBlockDialog, { type BlockPrefill } from '@/components/blocklist/AddBlockDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import styles from '@/components/nova/nova.module.css';

type Filter = 'ALL' | BlockKind;

/**
 * Чёрный список компании (задачи шефа, F5/S2).
 *
 * Мошенника замечает тот, кто с ним говорил, — занести может любой
 * сотрудник, который работает с контрагентами и водителями. Убрать —
 * только руководитель: запись не должна исчезать молча.
 *
 * Обёртка — ради `useSearchParams`: без Suspense Next не соберёт страницу.
 */
export default function BlocklistPage() {
    return (
        <Suspense fallback={null}>
            <BlocklistScreen />
        </Suspense>
    );
}

function BlocklistScreen() {
    const params = useSearchParams();
    const user = useAuthStore((s) => s.user);
    const canRemove = user?.role === 'COMPANY_ADMIN';
    const [rows, setRows] = useState<BlockEntry[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [filter, setFilter] = useState<Filter>('ALL');
    const [query, setQuery] = useState('');
    const [adding, setAdding] = useState(false);
    const [prefill, setPrefill] = useState<BlockPrefill | null>(null);
    const [removing, setRemoving] = useState<BlockEntry | null>(null);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get<BlockEntry[]>('/company/blocklist');
            setRows(data);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Из карточки контрагента или водителя: «В чёрный список» открывает окно с заполненным.
    useEffect(() => {
        const kind = params.get('kind') as BlockKind | null;
        const value = params.get('value');
        if (!value) return;
        setPrefill({ kind: kind && kind in BLOCK_KIND_LABEL ? kind : undefined, value, name: params.get('name') ?? undefined });
        setAdding(true);
    }, [params]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const digits = q.replace(/\D/g, '');
        return (rows ?? []).filter((r) => (filter === 'ALL' || r.kind === filter) && (!q
            || r.value.toLowerCase().includes(q)
            || (digits.length >= 3 && r.value.replace(/\D/g, '').includes(digits))
            || (r.name ?? '').toLowerCase().includes(q)
            || r.reason.toLowerCase().includes(q)));
    }, [rows, filter, query]);

    const count = (kind: BlockKind) => (rows ?? []).filter((r) => r.kind === kind).length;

    const remove = async () => {
        if (!removing) return;
        try {
            await api.delete(`/company/blocklist/${removing.id}`);
            toast.success('Запись убрана из чёрного списка');
            setRemoving(null);
            void load();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось убрать запись'));
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет · Справочники</div>
                    <h1 className={styles.title}>Чёрный список</h1>
                    <p className={styles.subtitle}>
                        Мошенники и недобросовестные контрагенты. Кого занесли сюда, нельзя завести в контрагенты,
                        водители и автопарк, и он не сможет откликнуться на ваши заявки на бирже.
                    </p>
                    <Button className="mt-3" onClick={() => { setPrefill(null); setAdding(true); }}>
                        <Ban className="h-4 w-4" /> Занести в список
                    </Button>
                </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-3">
                <div className="relative w-full max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск по номеру, названию, причине"
                        className="h-9 pl-9 text-[13px]"
                    />
                </div>
                <div className={styles.pills} role="tablist" aria-label="Что показывать">
                    {([{ value: 'ALL' as const, label: 'Все' }, ...BLOCK_KINDS]).map((k) => (
                        <button
                            key={k.value}
                            type="button"
                            role="tab"
                            aria-selected={filter === k.value}
                            onClick={() => setFilter(k.value)}
                            className={cn(styles.pill, filter === k.value && styles.pillActive)}
                        >
                            {k.label} {rows && <span className="tabular-nums opacity-60">{k.value === 'ALL' ? rows.length : count(k.value)}</span>}
                        </button>
                    ))}
                </div>
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Ban size={14} />
                    <h2 className={styles.cardTitle}>Записи</h2>
                    {rows && <span className={styles.cardCount}>{shown.length}</span>}
                </div>
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить список — обновите страницу.</div>
                ) : !rows ? (
                    <div className="space-y-2 p-4" aria-label="Загрузка">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/60" />)}</div>
                ) : rows.length === 0 ? (
                    <div className={styles.empty}>
                        Список пуст. Если перевозчик взял груз и пропал или заказчик не платит — занесите его БИН, телефон
                        или госномер, и система не даст коллегам завести его снова.
                    </div>
                ) : shown.length === 0 ? (
                    <div className={styles.empty}>Ничего не нашлось — измените поиск или фильтр.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table className="border-collapse text-[13px]">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9 w-28">Что</TableHead>
                                    <TableHead className="h-9 w-44">Значение</TableHead>
                                    <TableHead className="h-9">Кто это</TableHead>
                                    <TableHead className="h-9">Причина</TableHead>
                                    <TableHead className="h-9 w-48">Занёс</TableHead>
                                    {canRemove && <TableHead className="h-9 w-12" />}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {shown.map((r) => (
                                    <TableRow key={r.id} className="border-0 border-b border-solid border-border align-top">
                                        <TableCell className="py-2.5"><span className={cn(styles.chip, styles.chipNeg)}>{BLOCK_KIND_LABEL[r.kind]}</span></TableCell>
                                        <TableCell className="py-2.5 font-mono font-semibold tabular-nums">{r.value}</TableCell>
                                        <TableCell className="py-2.5">{r.name || <span className="text-muted-foreground">—</span>}</TableCell>
                                        <TableCell className="py-2.5">{r.reason}</TableCell>
                                        <TableCell className="py-2.5 text-muted-foreground">
                                            <div>{r.createdByName || '—'}</div>
                                            <div className="text-[12px]">{dayjs(r.createdAt).format('DD.MM.YYYY HH:mm')}</div>
                                        </TableCell>
                                        {canRemove && (
                                            <TableCell className="py-2 text-right">
                                                <Button variant="ghost" size="icon" aria-label="Убрать из списка" title="Убрать из списка" onClick={() => setRemoving(r)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>

            <AddBlockDialog open={adding} onOpenChange={setAdding} prefill={prefill} onAdded={load} />

            <Dialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">Убрать из чёрного списка?</DialogTitle>
                    </DialogHeader>
                    {removing && (
                        <div className="space-y-3 text-[13px]">
                            <p className="m-0">
                                {BLOCK_KIND_LABEL[removing.kind]} <b className="font-mono">{removing.value}</b>
                                {removing.name ? ` (${removing.name})` : ''} снова можно будет завести в справочник,
                                и он сможет откликаться на ваши заявки.
                            </p>
                            <p className="m-0 text-muted-foreground">Причина записи: {removing.reason}</p>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setRemoving(null)}>Отмена</Button>
                                <Button variant="destructive" onClick={remove}>Убрать</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
