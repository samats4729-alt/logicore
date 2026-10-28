'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, FileSearch, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ORDER_STATUS_LABELS } from '@/lib/vocabulary';
import { moneyShort } from '@/lib/money-format';
import { ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StatusPill from '@/components/ui/StatusPill';
import styles from '@/components/nova/nova.module.css';

type Blocker = { what: string; items: string[]; fix: string };
type Details = {
    order: {
        id: string; orderNumber: string; status: string; createdAt: string; completedAt: string | null; cargo: string | null;
        customerPrice: number | null; subForwarderPrice: number | null; driverCost: number | null; filesCount: number;
        driver: { name: string | null; phone: string | null; plate: string | null; trailer: string | null };
        route: { type: string; date: string | null; place: string }[];
    };
    parties: { role: string; id: string; name: string; bin: string | null; registered: boolean }[];
    history: { status: string; changedAt: string; comment: string | null }[];
    money: {
        payments: { id: string; date: string; amount: number; share: number | null; direction: 'IN' | 'OUT'; company: string | null; counterparty: string | null; in1C: boolean }[];
        incomes: { id: string; date: string; amount: number; description: string; company: string }[];
        expenses: { id: string; date: string; amount: number; description: string; company: string }[];
        documents: { id: string; type: string; number: string; date: string; total: number; status: string; company: string | null; counterparty: string | null; in1C: boolean }[];
        payroll: { id: string; who: string; amount: number; note: string; company: string | null }[];
        payouts: { driver: string | null; park: string; amount: number; statusText: string; requestedAt: string }[];
        given: { kind: 'FUEL' | 'ADVANCE'; amount: number; method: string; date: string; byRequest: boolean }[];
        fuelReceipts: { amount: number; status: string; date: string }[];
    };
    cancel: { companiesCan: boolean; adminCan: boolean; blockers: Blocker[]; note: string | null };
    delete: { can: boolean; blockers: Blocker[] };
};
type ForceResult = { orderNumber: string; documentsShared: string[]; paymentsUnlinked: number; payoutsReduced: number };

const день = (d: string | null) => (d ? dayjs(d).format('DD.MM.YYYY') : '—');
const POINT: Record<string, string> = { PICKUP: 'Погрузка', ADDITIONAL_PICKUP: 'Догруз', DELIVERY: 'Выгрузка' };

/**
 * Разбор заявки в админке (владелец, 28.10.2026): все данные и деньги
 * заявки, можно ли её отменить или удалить, а если нет — почему и что
 * для этого сделать. Здесь же администратор отменяет и удаляет.
 */
export default function AdminOrderPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [d, setD] = useState<Details | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [ask, setAsk] = useState<'cancel' | 'delete' | 'force' | null>(null);
    const [comment, setComment] = useState('');
    const [confirmNo, setConfirmNo] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        setFailed(null);
        api.get(`/admin/orders/${id}`).then((r) => setD(r.data)).catch((e) => setFailed(ответСервера(e, 'Не удалось загрузить заявку')));
    }, [id]);
    useEffect(load, [load]);

    const act = async () => {
        if (!d || !ask) return;
        if (ask === 'cancel' && !comment.trim()) { toast.error('Напишите, почему отменяете, — это увидят стороны в истории заявки'); return; }
        setBusy(true);
        try {
            if (ask === 'cancel') {
                await api.put(`/orders/${id}/status`, { status: 'CANCELLED', comment: `Отменил администратор LogiCore: ${comment.trim()}` });
                toast.success(`Заявка ${d.order.orderNumber} отменена`);
                setAsk(null); setComment('');
                load();
            } else if (ask === 'force') {
                const r: ForceResult = (await api.post(`/admin/orders/${id}/force-delete`, { confirm: confirmNo.trim() })).data;
                const осталось = [
                    r.documentsShared.length ? `документы ${r.documentsShared.join(', ')} общие с другими заявками — суммы в них поправьте` : '',
                    r.paymentsUnlinked ? `платежей, общих с другими заявками: ${r.paymentsUnlinked} — остались` : '',
                    r.payoutsReduced ? `выплат водителю с другими рейсами: ${r.payoutsReduced} — уменьшены на этот рейс` : '',
                ].filter(Boolean).join('; ');
                toast.success(`Заявка ${r.orderNumber} удалена вместе с деньгами`, осталось ? { description: осталось, duration: 12000 } : undefined);
                router.push('/admin/orders');
            } else {
                await api.delete(`/orders/${id}`);
                toast.success(`Заявка ${d.order.orderNumber} удалена`);
                router.push('/admin/orders');
            }
        } catch (e) {
            toast.error(ответСервера(e, ask === 'cancel' ? 'Не удалось отменить' : 'Не удалось удалить'));
        } finally {
            setBusy(false);
        }
    };

    if (failed) return <div className={styles.empty}>{failed}</div>;
    if (!d) return <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />;
    const { order: o, money: m } = d;
    const вСписке = ([
        ['Выплата водителю', m.payouts.length],
        ['Платежи', m.payments.length],
        ['Счета и акты', m.documents.length],
        ['Приходы и расходы', m.incomes.length + m.expenses.length],
        ['Зарплата менеджеров', m.payroll.length],
        ['Выдачи водителю и чеки', m.given.length + m.fuelReceipts.length],
    ] as [string, number][]).filter(([, n]) => n > 0);
    const в1С = m.payments.some((p) => p.in1C) || m.documents.some((x) => x.in1C);
    const пусто = !m.payments.length && !m.incomes.length && !m.expenses.length && !m.documents.length && !m.payroll.length && !m.payouts.length
        && !m.given.length && !m.fuelReceipts.length;

    return (
        <div>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Платформа · заявки</div>
                    <h1 className={styles.title}>Заявка {o.orderNumber}</h1>
                    <p className={styles.subtitle}>
                        Создана {день(o.createdAt)}{o.completedAt ? ` · завершена ${день(o.completedAt)}` : ''} · файлов рейса: {o.filesCount}
                    </p>
                </div>
                <div className={styles.heroActions}>
                    <StatusPill status={o.status} label={ORDER_STATUS_LABELS[o.status] ?? o.status} />
                    <Button variant="outline" onClick={() => router.push('/admin/orders')}><ArrowLeft className="h-4 w-4" /> К заявкам</Button>
                </div>
            </div>

            {/* Главное — сверху: можно ли отменить и удалить, и что для этого сделать. */}
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
                <Verdict
                    title="Отмена"
                    ok={d.cancel.adminCan}
                    okText={d.cancel.companiesCan ? 'Отменить могут сами стороны — или вы здесь.' : 'Стороны сами отменить не могут — вы можете.'}
                    noText={d.cancel.note ?? 'Отменить нельзя.'}
                    blockers={d.cancel.blockers}
                    action={d.cancel.adminCan ? <Button variant="outline" onClick={() => setAsk('cancel')}><Ban className="h-4 w-4" /> Отменить заявку</Button> : null}
                />
                <Verdict
                    title="Удаление"
                    ok={d.delete.can}
                    okText="Денег и учётных документов нет — удалить можно."
                    noText="Обычным удалением нельзя: по заявке есть деньги или документы."
                    blockers={d.delete.blockers}
                    action={d.delete.can
                        ? <Button variant="destructive" onClick={() => setAsk('delete')}><Trash2 className="h-4 w-4" /> Удалить заявку</Button>
                        : (
                            <div className="space-y-2 border-0 border-t border-solid border-border pt-3">
                                <p className="m-0 text-muted-foreground">Тестовая или ошибочная заявка — удалите её вместе с деньгами и документами.</p>
                                <Button variant="destructive" onClick={() => { setConfirmNo(''); setAsk('force'); }}><Trash2 className="h-4 w-4" /> Удалить вместе с деньгами</Button>
                            </div>
                        )}
                />
            </div>

            <div className="mb-4 grid gap-4 lg:grid-cols-2">
                <section className={styles.card}>
                    <div className={styles.cardHead}><h2 className={styles.cardTitle}>Стороны</h2></div>
                    <div className="divide-y divide-border px-4 pb-3 text-[13px]">
                        {d.parties.map((p) => (
                            <div key={p.role} className="flex items-baseline justify-between gap-3 py-2">
                                <div>
                                    <div className="text-[12px] text-muted-foreground">{p.role}</div>
                                    <div className="font-medium">{p.name}{p.bin ? <span className="text-muted-foreground"> · БИН {p.bin}</span> : null}</div>
                                </div>
                                <span className={p.registered ? 'text-[12px] font-medium text-emerald-700 dark:text-emerald-400' : 'text-[12px] text-muted-foreground'}>
                                    {p.registered ? 'в LogiCore' : 'только в справочнике'}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
                <section className={styles.card}>
                    <div className={styles.cardHead}><h2 className={styles.cardTitle}>Рейс</h2></div>
                    <div className="space-y-1.5 px-4 pb-3 text-[13px]">
                        {o.route.map((p, i) => (
                            <div key={i}><span className="text-muted-foreground">{POINT[p.type] ?? p.type} · {день(p.date)}:</span> {p.place || '—'}</div>
                        ))}
                        <div><span className="text-muted-foreground">Груз:</span> {o.cargo ?? '—'}</div>
                        <div>
                            <span className="text-muted-foreground">Водитель:</span> {o.driver.name ?? '—'}
                            {o.driver.phone ? ` · ${o.driver.phone}` : ''}{o.driver.plate ? ` · ${o.driver.plate}` : ''}{o.driver.trailer ? ` / ${o.driver.trailer}` : ''}
                        </div>
                        <div className="tabular-nums">
                            <span className="text-muted-foreground">Заказчику:</span> {o.customerPrice != null ? moneyShort(o.customerPrice) : 'не задано'}
                            {o.subForwarderPrice != null && <> · <span className="text-muted-foreground">субэкспедитору:</span> {moneyShort(o.subForwarderPrice)}</>}
                            {' · '}<span className="text-muted-foreground">перевозчику:</span> {o.driverCost != null ? moneyShort(o.driverCost) : 'не задано'}
                        </div>
                    </div>
                </section>
            </div>

            <section className={`${styles.card} mb-4`}>
                <div className={styles.cardHead}><FileSearch size={14} /><h2 className={styles.cardTitle}>Деньги и документы</h2></div>
                <div className="space-y-3 px-4 pb-4 text-[13px]">
                    {пусто && <p className="m-0 text-muted-foreground">По заявке нет ни платежей, ни документов, ни начислений.</p>}
                    <Group title="Платежи" rows={m.payments.map((p) => [
                        день(p.date), p.direction === 'IN' ? 'поступление' : 'оплата', moneyShort(p.share ?? p.amount),
                        [p.company, p.counterparty].filter(Boolean).join(' ↔ ') + (p.in1C ? ' · в 1С' : ''),
                    ])} />
                    <Group title="Приходы и расходы" rows={[
                        ...m.incomes.map((r) => [день(r.date), 'приход', moneyShort(r.amount), `${r.company}: ${r.description}`]),
                        ...m.expenses.map((r) => [день(r.date), 'расход', moneyShort(r.amount), `${r.company}: ${r.description}`]),
                    ]} />
                    <Group title="Счета и акты" rows={m.documents.map((x) => [
                        день(x.date), `${x.type} № ${x.number}`, moneyShort(x.total),
                        [x.company, x.counterparty].filter(Boolean).join(' → ') + (x.status === 'CANCELLED' ? ' · аннулирован' : '') + (x.in1C ? ' · в 1С' : ''),
                    ])} />
                    <Group title="Зарплата менеджеров" rows={m.payroll.map((p) => ['', p.who, moneyShort(p.amount), `${p.note}${p.company ? ` · ${p.company}` : ''}`])} />
                    <Group title="Выплата водителю" rows={m.payouts.map((p) => [день(p.requestedAt), p.driver ?? 'водитель', moneyShort(p.amount), `${p.statusText} · ${p.park}`])} />
                    <Group title="Выдано водителю парком" rows={m.given.map((g) => [
                        день(g.date), g.kind === 'ADVANCE' ? 'предоплата' : 'топливо', moneyShort(g.amount),
                        `${g.method === 'STATION' ? 'на заправке' : 'переводом'} · ${g.byRequest ? 'по запросу водителя' : 'без запроса'}`,
                    ])} />
                    <Group title="Чеки на топливо" rows={m.fuelReceipts.map((r) => [день(r.date), 'чек', moneyShort(r.amount), r.status === 'ACCEPTED' ? 'принят' : 'ждёт парка'])} />
                </div>
            </section>

            <section className={styles.card}>
                <div className={styles.cardHead}><h2 className={styles.cardTitle}>История статусов</h2></div>
                <div className="divide-y divide-border px-4 pb-3 text-[13px]">
                    {d.history.length === 0 && <p className="m-0 py-2 text-muted-foreground">Пусто.</p>}
                    {d.history.map((h, i) => (
                        <div key={i} className="flex gap-3 py-1.5">
                            <span className="w-32 shrink-0 tabular-nums text-muted-foreground">{dayjs(h.changedAt).format('DD.MM.YYYY HH:mm')}</span>
                            <span className="font-medium">{ORDER_STATUS_LABELS[h.status] ?? h.status}</span>
                            {h.comment && <span className="text-muted-foreground">{h.comment}</span>}
                        </div>
                    ))}
                </div>
            </section>

            <Dialog open={!!ask} onOpenChange={(v) => { if (!v) setAsk(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {ask === 'cancel' ? `Отменить заявку ${o.orderNumber}?` : ask === 'force' ? `Удалить заявку ${o.orderNumber} вместе с деньгами?` : `Удалить заявку ${o.orderNumber}?`}
                        </DialogTitle>
                        <DialogDescription>
                            {ask === 'cancel'
                                ? 'Заявка станет «Отменена» у всех сторон, деньги и документы по ней останутся. Причину увидят в истории заявки.'
                                : ask === 'force'
                                    ? 'Удалится заявка и всё, что относится только к ней. Платёж или документ, общий с другими заявками, останется — из него уберётся только эта заявка. Вернуть будет нельзя.'
                                    : 'Заявка удалится вместе с маршрутом, историей и файлами рейса. Вернуть её будет нельзя.'}
                        </DialogDescription>
                    </DialogHeader>
                    {ask === 'cancel' && (
                        <Input aria-label="Причина отмены" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Причина, например: тестовая заявка" />
                    )}
                    {ask === 'force' && (
                        <div className="space-y-3 text-[13px]">
                            {вСписке.length > 0 && (
                                <div className="divide-y divide-border rounded-lg border border-solid border-border px-3">
                                    {вСписке.map(([what, n]) => (
                                        <div key={what} className="flex justify-between py-1.5"><span>{what}</span><span className="font-semibold tabular-nums">{n}</span></div>
                                    ))}
                                </div>
                            )}
                            {в1С && <p className="m-0 font-medium text-amber-700 dark:text-amber-400">Часть уже выгружена в 1С — там удалите её сами.</p>}
                            <label className="block">
                                <span className="mb-1 block text-muted-foreground">Для подтверждения впишите номер заявки: <b className="text-foreground">{o.orderNumber}</b></span>
                                <Input aria-label="Номер заявки" value={confirmNo} onChange={(e) => setConfirmNo(e.target.value)} autoComplete="off" />
                            </label>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAsk(null)}>Нет</Button>
                        <Button
                            variant={ask === 'cancel' ? 'default' : 'destructive'}
                            onClick={act}
                            disabled={busy || (ask === 'force' && confirmNo.trim() !== o.orderNumber)}
                        >
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {ask === 'cancel' ? 'Отменить' : 'Удалить навсегда'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Можно / нельзя — и по каждой причине: какие записи и что сделать. */
function Verdict({ title, ok, okText, noText, blockers, action }: {
    title: string; ok: boolean; okText: string; noText: string; blockers: Blocker[]; action: React.ReactNode;
}) {
    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                {ok ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-amber-600" />}
                <h2 className={styles.cardTitle}>{title}</h2>
            </div>
            <div className="space-y-3 px-4 pb-4 text-[13px]">
                <p className="m-0 font-medium">{ok ? okText : noText}</p>
                {blockers.map((b, i) => (
                    <div key={i} className="rounded-lg border border-solid border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
                        <div className="font-semibold text-amber-900 dark:text-amber-200">{b.what}</div>
                        {b.items.length > 0 && (
                            <ul className="my-1 pl-4 text-[12.5px] text-amber-900/90 dark:text-amber-200/90">
                                {b.items.map((x, j) => <li key={j}>{x}</li>)}
                            </ul>
                        )}
                        <div className="text-[12.5px]"><span className="font-semibold">Что сделать:</span> {b.fix}</div>
                    </div>
                ))}
                {action}
            </div>
        </section>
    );
}

/** Записи одного вида — строкой: дата, что, сумма, чья. Пусто — не показываем. */
function Group({ title, rows }: { title: string; rows: string[][] }) {
    if (!rows.length) return null;
    return (
        <div>
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
            {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[96px_minmax(120px,220px)_110px_1fr] gap-3 border-0 border-b border-solid border-border py-1.5 last:border-0">
                    <span className="tabular-nums text-muted-foreground">{r[0]}</span>
                    <span>{r[1]}</span>
                    <span className="text-right font-semibold tabular-nums">{r[2]}</span>
                    <span className="text-muted-foreground">{r[3]}</span>
                </div>
            ))}
        </div>
    );
}
