'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import { ArrowLeft, Check, Download, Loader2, Percent, Wallet, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { PAYOUT_STATUS_TEXT, ParkPayout, PayoutRates, PayoutStatus, иинКрасиво, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';
import styles from '@/components/nova/nova.module.css';

/**
 * «Ждут выплаты» — запрошенные и те, по которым реестр уже выгружен: отдельной
 * вкладки «В 1С» нет (владелец, 12.10.2026) — для парка это одно и то же,
 * деньги ещё не ушли.
 */
type Filter = 'open' | 'PAID' | 'REJECTED' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'open', label: 'Ждут выплаты' },
    { key: 'PAID', label: 'Выплачено' },
    { key: 'REJECTED', label: 'Отклонены' },
    { key: 'all', label: 'Все' },
];

const EMPTY: Record<Filter, string> = {
    open: 'Новых запросов на выплату нет. Водитель запрашивает выплату в приложении за довезённые рейсы.',
    PAID: 'Выплат пока не было.',
    REJECTED: 'Отклонённых выплат нет.',
    all: 'Выплат пока не было.',
};

/** Статус выплаты — цветом и словом (StatusPill знает эти ключи по смыслу). */
const PILL: Record<PayoutStatus, string> = { REQUESTED: 'PENDING', EXPORTED: 'IN_TRANSIT', PAID: 'COMPLETED', REJECTED: 'CANCELLED' };

/**
 * Выплаты водителям парка.
 *
 * Работа бухгалтера парка: водитель запросил — отмечаете нужные, выгружаете
 * реестр (Excel), переводите деньги и отмечаете «Выплачено». Не туда счёт
 * или что-то не сходится — «Отклонить» с причиной: водитель увидит её, а
 * рейсы снова станут доступны к выплате. Ниже — ставки удержаний.
 */
export default function ParkPayoutsPage() {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('open');
    const [rows, setRows] = useState<ParkPayout[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);
    const [paying, setPaying] = useState<ParkPayout | null>(null);
    const [rejecting, setRejecting] = useState<ParkPayout | null>(null);

    const load = useCallback(() => {
        setRows(null);
        setFailed(false);
        setPicked(new Set());
        // «Ждут выплаты» — запрошенные и с выгруженным реестром: берём все и отбираем здесь.
        api.get(`/exchange/park/payouts?status=${filter === 'open' ? 'all' : filter}`)
            .then((r) => setRows(filter === 'open'
                ? (r.data as ParkPayout[]).filter((p) => p.status === 'REQUESTED' || p.status === 'EXPORTED')
                : r.data))
            .catch(() => setFailed(true));
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const exportable = useMemo(() => (rows ?? []).filter((r) => r.status === 'REQUESTED' || r.status === 'EXPORTED'), [rows]);
    const total = (rows ?? []).reduce((s, r) => s + r.net, 0);

    const toggle = (id: string) => setPicked((p) => {
        const next = new Set(p);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const exportFile = async () => {
        if (!picked.size) { toast.error('Отметьте выплаты для выгрузки'); return; }
        setExporting(true);
        try {
            const res = await api.post('/exchange/park/payouts/export', { ids: Array.from(picked) }, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Реестр выплат ${dayjs().format('DD.MM.YYYY')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Реестр скачан — переведите деньги по нему и отметьте «Выплачено»');
            load();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось выгрузить реестр'));
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Кабинет парка</div>
                    <h1 className={styles.title}>Выплаты водителям</h1>
                    <p className={styles.subtitle}>
                        Водитель запрашивает выплату в приложении. Выгрузите реестр, переведите деньги и отметьте «Выплачено».
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
                        {f.label}
                    </button>
                ))}
            </div>

            <section className={styles.card}>
                <div className={styles.cardHead}>
                    <Wallet size={14} />
                    <h2 className={styles.cardTitle}>{FILTERS.find((f) => f.key === filter)?.label}</h2>
                    {rows && rows.length > 0 && <span className={styles.cardCount}>{rows.length} · на руки {moneyShort(total)}</span>}
                </div>
                {exportable.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-0 border-b border-solid border-border px-4 py-2.5">
                        <Button size="sm" onClick={exportFile} disabled={exporting || !picked.size}>
                            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            Выгрузить реестр{picked.size ? ` · ${picked.size}` : ''}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(exportable.map((r) => r.id)))}>Отметить все</Button>
                        <span className="text-[12px] text-muted-foreground">Реестр — Excel: кому, ИИН, счёт, начислено, удержано, к выплате; второй лист — по рейсам.</span>
                    </div>
                )}
                {failed ? (
                    <div className={styles.empty}>Не удалось загрузить выплаты — обновите страницу.</div>
                ) : !rows ? (
                    <div className="space-y-2 p-4" aria-label="Загрузка">
                        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/60" />)}
                    </div>
                ) : rows.length === 0 ? (
                    <div className={styles.empty}>{EMPTY[filter]}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table className="border-collapse text-[13px]">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9 w-8" />
                                    <TableHead className="h-9 text-[12.5px]">Водитель</TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Счёт</TableHead>
                                    <TableHead className="h-9 text-right text-[12.5px]">Начислено</TableHead>
                                    <TableHead className="h-9 text-right text-[12.5px]">Удержано</TableHead>
                                    <TableHead className="h-9 text-right text-[12.5px]">К перечислению</TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Статус</TableHead>
                                    <TableHead className="h-9" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r) => {
                                    const open = r.status === 'REQUESTED' || r.status === 'EXPORTED';
                                    const held = r.commission + r.opv + r.vosms + r.ipn;
                                    return (
                                        <TableRow key={r.id} className="border-0 border-b border-solid border-border align-top">
                                            <TableCell className="py-2.5">
                                                {open && (
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Отметить выплату ${r.driver.name}`}
                                                        checked={picked.has(r.id)}
                                                        onChange={() => toggle(r.id)}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="py-2.5">
                                                <div className="font-semibold">{r.driver.name}</div>
                                                <div className="text-[12px] text-muted-foreground">
                                                    ИИН {иинКрасиво(r.driver.iin)} · рейсов: {r.trips} · {dayjs(r.requestedAt).format('DD.MM.YYYY')}
                                                </div>
                                                {r.rejectReason && <div className="text-[12px] text-destructive">Отклонена: {r.rejectReason}</div>}
                                            </TableCell>
                                            <TableCell className="text-[12px]">
                                                <div className="tabular-nums">{r.iban ?? '—'}</div>
                                                <div className="text-muted-foreground">{r.bank ?? ''}</div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{moneyShort(r.gross)}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                <div>{moneyShort(held)}</div>
                                                <div className="text-[11px] text-muted-foreground">
                                                    комиссия {moneyShort(r.commission)} · ОПВ {moneyShort(r.opv)} · ВОСМС {moneyShort(r.vosms)} · ИПН {moneyShort(r.ipn)}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                <div className="font-bold">{moneyShort(r.net)}</div>
                                                {r.fuelIssued != null && r.fuelIssued > 0 && (
                                                    <div className="text-[11px] text-muted-foreground">на топливо уже дали {moneyShort(r.fuelIssued)}</div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <StatusPill status={PILL[r.status]} label={PAYOUT_STATUS_TEXT[r.status]} />
                                                {r.paidAt && <div className="mt-1 text-[11px] text-muted-foreground">{dayjs(r.paidAt).format('DD.MM.YYYY')}</div>}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-right">
                                                {open && (
                                                    <div className="flex justify-end gap-1.5">
                                                        <Button size="sm" variant="outline" onClick={() => setPaying(r)}><Check className="h-3.5 w-3.5" /> Выплачено</Button>
                                                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRejecting(r)}><X className="h-3.5 w-3.5" /></Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>

            <RatesCard />

            <PaidDialog payout={paying} onClose={() => setPaying(null)} onDone={load} />
            <RejectDialog payout={rejecting} onClose={() => setRejecting(null)} onDone={load} />
        </div>
    );
}

/** «Выплачено» — после перевода денег. */
function PaidDialog({ payout, onClose, onDone }: { payout: ParkPayout | null; onClose: () => void; onDone: () => void }) {
    const [saving, setSaving] = useState(false);
    const submit = async () => {
        if (!payout) return;
        setSaving(true);
        try {
            await api.post(`/exchange/park/payouts/${payout.id}/paid`);
            toast.success(`Выплата ${payout.driver.name} отмечена — водитель увидит «Выплачено»`);
            onClose();
            onDone();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось отметить'));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open={!!payout} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle className="text-[15px]">Выплатили {payout?.driver.name} {payout ? moneyShort(payout.net) : ''}?</DialogTitle></DialogHeader>
                <p className="m-0 text-[13px] text-muted-foreground">
                    Отмечайте, когда деньги уже отправлены на счёт {payout?.iban ?? ''}. Водитель увидит в приложении «Выплачено».
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Отмена</Button>
                    <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Выплачено</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Отклонить — с причиной: водитель увидит её, рейсы снова станут доступны к выплате. */
function RejectDialog({ payout, onClose, onDone }: { payout: ParkPayout | null; onClose: () => void; onDone: () => void }) {
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (payout) setReason(''); }, [payout]);
    const submit = async () => {
        if (!payout) return;
        if (!reason.trim()) { toast.error('Напишите причину — водитель увидит её в приложении'); return; }
        setSaving(true);
        try {
            await api.post(`/exchange/park/payouts/${payout.id}/reject`, { reason: reason.trim() });
            toast.success('Выплата отклонена — рейсы снова доступны водителю к выплате');
            onClose();
            onDone();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось отклонить'));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog open={!!payout} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle className="text-[15px]">Отклонить выплату {payout?.driver.name}?</DialogTitle></DialogHeader>
                <p className="m-0 text-[13px] text-muted-foreground">Водитель увидит причину. Рейсы снова станут доступны к выплате — он запросит её заново.</p>
                <div className="flex flex-wrap gap-1.5">
                    {['Неверный IBAN', 'Рейс ещё не закрыт заказчиком', 'Не хватает документов'].map((r) => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setReason(r)}
                            className={`rounded-full border border-solid px-3 py-1 text-[12px] ${reason === r ? 'border-foreground bg-foreground text-background' : 'border-border bg-transparent'}`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
                <textarea
                    aria-label="Причина"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Причина"
                    rows={2}
                    className="w-full resize-y rounded-xl border border-solid border-input bg-background px-3 py-2 text-[13px] [font-family:inherit]"
                />
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Оставить</Button>
                    <Button variant="destructive" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Отклонить</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

const RATE_FIELDS: { key: 'commissionPct' | 'opvPct' | 'vosmsPct' | 'ipnPct' | 'soPct'; label: string; hint: string }[] = [
    { key: 'commissionPct', label: 'Комиссия парка', hint: 'сверху к цене компании (рейсы «на руки»)' },
    { key: 'opvPct', label: 'ОПВ', hint: 'удерживается с дохода' },
    { key: 'vosmsPct', label: 'ВОСМС', hint: 'удерживается с дохода' },
    { key: 'ipnPct', label: 'ИПН', hint: 'с дохода за вычетом ОПВ и ВОСМС' },
    { key: 'soPct', label: 'СО', hint: 'платит парк сверху, не удерживается' },
];

/** Ставки удержаний — парк задаёт со своим бухгалтером. */
function RatesCard() {
    const [rates, setRates] = useState<PayoutRates | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    // Расчёт «на руки» (12.10.2026): топливо на км и вычет по ИПН.
    const [extra, setExtra] = useState({ fuelPerKm: '', applyDeduction: true, deductionMrp: '', mrp: '' });

    useEffect(() => {
        api.get('/exchange/park/rates').then((r) => {
            setRates(r.data);
            setDraft(Object.fromEntries(RATE_FIELDS.map((f) => [f.key, String(r.data[f.key])])));
            setExtra({
                fuelPerKm: String(r.data.fuelPerKm ?? 100),
                applyDeduction: r.data.applyDeduction ?? true,
                deductionMrp: String(r.data.deductionMrp ?? 30),
                mrp: String(r.data.mrp ?? 4325),
            });
        }).catch(() => setRates(null));
    }, []);

    const save = async () => {
        const body = Object.fromEntries(RATE_FIELDS.map((f) => [f.key, Number(String(draft[f.key]).replace(',', '.'))]));
        if (Object.values(body).some((v) => !Number.isFinite(v) || v < 0 || v > 100)) {
            toast.error('Ставка — число от 0 до 100');
            return;
        }
        const fuelPerKm = Number(extra.fuelPerKm.replace(',', '.'));
        const deductionMrp = Number(extra.deductionMrp);
        const mrp = Number(extra.mrp);
        if (!Number.isFinite(fuelPerKm) || fuelPerKm < 0) { toast.error('Топливо на км — число, ₸'); return; }
        if (!Number.isInteger(deductionMrp) || deductionMrp < 0 || !Number.isInteger(mrp) || mrp < 1) {
            toast.error('Вычет и МРП — целые числа');
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.put('/exchange/park/rates', { ...body, fuelPerKm, applyDeduction: extra.applyDeduction, deductionMrp, mrp });
            setRates(data);
            toast.success('Ставки сохранены — новые выплаты посчитаются по ним, прошлые останутся как были');
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить ставки'));
        } finally {
            setSaving(false);
        }
    };

    if (!rates) return null;
    return (
        <section className={styles.card}>
            <div className={styles.cardHead}>
                <Percent size={14} />
                <h2 className={styles.cardTitle}>Ставки и расчёт рейса</h2>
            </div>
            <div className={`${styles.cardBody} space-y-3`}>
                <p className="m-0 text-[12px] text-muted-foreground">
                    Согласуйте со своим бухгалтером: закон меняется, и система ставок не придумывает.
                    {rates.isDefault ? ' Сейчас стоят ставки по умолчанию.' : rates.updatedAt ? ` Изменены ${dayjs(rates.updatedAt).format('DD.MM.YYYY')}.` : ''}
                    {' '}Новые ставки — для новых выплат; прошлые остаются как посчитаны.
                </p>
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
                    {RATE_FIELDS.map((f) => (
                        <label key={f.key} className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">{f.label}, %</span>
                            <Input
                                value={draft[f.key] ?? ''}
                                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                                inputMode="decimal"
                                className="h-9 text-[13px] tabular-nums"
                            />
                            <span className="text-[11px] text-muted-foreground">{f.hint}</span>
                        </label>
                    ))}
                </div>
                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <div className="text-[12.5px] font-semibold">Расчёт «на руки»</div>
                    <p className="m-0 text-[12px] text-muted-foreground">
                        Водитель называет сумму на руки вместе с топливом. Программа оценивает топливо по расстоянию и досчитывает сверху
                        налоги, комиссию LogiCore{rates.platformPct != null ? ` (${rates.platformPct}%)` : ''} и вашу — так получается цена для компании.
                        Водителю за топливо платите по чекам на БИН парка.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Топливо на 1 км, ₸</span>
                            <Input value={extra.fuelPerKm} onChange={(e) => setExtra((x) => ({ ...x, fuelPerKm: e.target.value }))} inputMode="decimal" className="h-9 text-[13px] tabular-nums" />
                            <span className="text-[11px] text-muted-foreground">оценка для цены заранее</span>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Вычет по ИПН, МРП</span>
                            <Input value={extra.deductionMrp} onChange={(e) => setExtra((x) => ({ ...x, deductionMrp: e.target.value }))} inputMode="numeric" className="h-9 text-[13px] tabular-nums" />
                            <span className="text-[11px] text-muted-foreground">раз в месяц, на первый рейс водителя</span>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">МРП, ₸</span>
                            <Input value={extra.mrp} onChange={(e) => setExtra((x) => ({ ...x, mrp: e.target.value }))} inputMode="numeric" className="h-9 text-[13px] tabular-nums" />
                            <span className="text-[11px] text-muted-foreground">2026 год — 4 325</span>
                        </label>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                        <input type="checkbox" checked={extra.applyDeduction} onChange={(e) => setExtra((x) => ({ ...x, applyDeduction: e.target.checked }))} />
                        Учитывать вычет по ИПН в цене — выключите, если водители получают его по основному месту работы
                    </label>
                </div>
                <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить ставки</Button>
            </div>
        </section>
    );
}
