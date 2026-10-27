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

    /** Среди отмеченных есть посчитанные предварительно — сначала явное согласие. */
    const [ackExport, setAckExport] = useState(false);
    const pickedPreliminary = (rows ?? []).some((r) => picked.has(r.id) && r.preliminary);

    const startExport = () => {
        if (!picked.size) { toast.error('Отметьте выплаты для выгрузки'); return; }
        if (pickedPreliminary) { setAckExport(true); return; }
        exportFile(false);
    };

    const exportFile = async (preliminaryAck: boolean) => {
        if (!picked.size) { toast.error('Отметьте выплаты для выгрузки'); return; }
        setAckExport(false);
        setExporting(true);
        try {
            const res = await api.post('/exchange/park/payouts/export', { ids: Array.from(picked), preliminaryAck }, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Реестр выплат ${dayjs().format('DD.MM.YYYY')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Реестр скачан — переведите деньги по нему и отметьте «Выплачено»');
            load();
        } catch (e) {
            toast.error(await ответИзФайла(e, 'Не удалось выгрузить реестр'));
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
                        <Button size="sm" onClick={startExport} disabled={exporting || !picked.size}>
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
                                                {r.preliminary && open && <div className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">расчёт предварительный</div>}
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

            <RatesCard onChanged={load} />

            <PaidDialog payout={paying} onClose={() => setPaying(null)} onDone={load} />
            <RejectDialog payout={rejecting} onClose={() => setRejecting(null)} onDone={load} />
            <Dialog open={ackExport} onOpenChange={(o) => { if (!o) setAckExport(false); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle className="text-[15px]">Выгрузить реестр по предварительному расчёту?</DialogTitle></DialogHeader>
                    <PreliminaryNote />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setAckExport(false)}>Отмена</Button>
                        <Button onClick={() => exportFile(true)}>Выгрузить как предварительный</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Почему «предварительный» и что делать — одним текстом для всех окон. */
function PreliminaryNote() {
    return (
        <p className="m-0 rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Бухгалтер парка ещё не подтвердил ставки и порядок расчёта (или рейс посчитан до подтверждения). Налоги и взносы
            в этой выплате — оценка: сверьте их с бухгалтером до уплаты. Подтвердить расчёт — внизу страницы, в «Ставках».
        </p>
    );
}

/** Текст ошибки сервера, когда ответ ждали файлом: он приходит тоже файлом. */
async function ответИзФайла(e: unknown, fallback: string): Promise<string> {
    const data = (e as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
        try {
            const parsed = JSON.parse(await data.text()) as { message?: string | string[] };
            const m = Array.isArray(parsed.message) ? parsed.message[0] : parsed.message;
            if (m) return m;
        } catch { /* не JSON — общий текст */ }
    }
    return ответСервера(e, fallback);
}

/** «Выплачено» — после перевода денег. */
function PaidDialog({ payout, onClose, onDone }: { payout: ParkPayout | null; onClose: () => void; onDone: () => void }) {
    const [saving, setSaving] = useState(false);
    // Предварительный расчёт — «выплачено» только с явным согласием (задача 15.10.2026).
    const [ack, setAck] = useState(false);
    useEffect(() => { if (payout) setAck(false); }, [payout]);
    const submit = async () => {
        if (!payout) return;
        if (payout.preliminary && !ack) { toast.error('Отметьте, что знаете: расчёт предварительный'); return; }
        setSaving(true);
        try {
            await api.post(`/exchange/park/payouts/${payout.id}/paid`, { preliminaryAck: !!payout.preliminary && ack });
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
                {payout?.preliminary && (
                    <>
                        <PreliminaryNote />
                        <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
                            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                            Знаю, что расчёт предварительный, — налоги сверю с бухгалтером
                        </label>
                    </>
                )}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Отмена</Button>
                    <Button onClick={submit} disabled={saving || (!!payout?.preliminary && !ack)}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Выплачено</Button>
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
    { key: 'commissionPct', label: 'Комиссия', hint: 'сверху со всей суммы с налогами; в ней доля LogiCore' },
    { key: 'opvPct', label: 'ОПВ', hint: 'удерживается из денег водителя' },
    { key: 'vosmsPct', label: 'ОСМС', hint: 'платит парк, от оплаты за работу' },
    { key: 'ipnPct', label: 'ИПН', hint: 'платит парк: с оплаты за работу минус ОПВ и вычет' },
    { key: 'soPct', label: 'СО', hint: 'платит парк: от оплаты за работу минус ОПВ' },
];

/** Ставки удержаний — парк задаёт со своим бухгалтером. */
function RatesCard({ onChanged }: { onChanged: () => void }) {
    const [rates, setRates] = useState<PayoutRates | null>(null);
    const [draft, setDraft] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);

    // Вычет, НДС (15.10.2026); топливо по литрам и прогрессивный ИПН (схема шефа, 16.10.2026).
    const [extra, setExtra] = useState({
        applyDeduction: true, deductionMrp: '', mrp: '', vatPayer: false, vatPct: '',
        fuelConsumption: '', fuelPriceSummer: '', fuelPriceWinter: '', ipnHighPct: '', ipnThresholdMrp: '',
        advanceLimitPct: '',
    });
    const [seasonSaving, setSeasonSaving] = useState(false);
    /** История цен на топливо (задачи шефа, Q15): кто, когда и что поменял. */
    const [fuelHistory, setFuelHistory] = useState<{ id: string; at: string; who: string | null; text: string }[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    // После каждого сохранения (rates меняется) — свежая история.
    useEffect(() => {
        if (!rates) return;
        api.get('/exchange/park/rates/fuel-history').then((r) => setFuelHistory(r.data)).catch(() => undefined);
    }, [rates]);

    useEffect(() => {
        api.get('/exchange/park/rates').then((r) => {
            setRates(r.data);
            setDraft(Object.fromEntries(RATE_FIELDS.map((f) => [f.key, String(r.data[f.key])])));
            setExtra({
                applyDeduction: r.data.applyDeduction ?? true,
                deductionMrp: String(r.data.deductionMrp ?? 30),
                mrp: String(r.data.mrp ?? 4325),
                vatPayer: r.data.vatPayer ?? false,
                vatPct: String(r.data.vatPct ?? 16),
                fuelConsumption: String(r.data.fuelConsumption ?? 30),
                fuelPriceSummer: String(r.data.fuelPriceSummer ?? 350),
                fuelPriceWinter: r.data.fuelPriceWinter != null ? String(r.data.fuelPriceWinter) : '',
                ipnHighPct: String(r.data.ipnHighPct ?? 15),
                ipnThresholdMrp: String(r.data.ipnThresholdMrp ?? 8500),
                advanceLimitPct: String(r.data.advanceLimitPct ?? 50),
            });
        }).catch(() => setRates(null));
    }, []);

    /** Лето/зима — сразу, без «Сохранить»: это переключатель, а не ставка. */
    const setSeason = async (season: 'SUMMER' | 'WINTER') => {
        if (rates?.fuelSeason === season) return;
        setSeasonSaving(true);
        try {
            const { data } = await api.put('/exchange/park/rates/season', { season });
            setRates(data);
            toast.success(season === 'WINTER' ? 'Топливо считается по зимней цене — для новых заявок и откликов' : 'Топливо считается по летней цене — для новых заявок и откликов');
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось переключить'));
        } finally {
            setSeasonSaving(false);
        }
    };

    /** Бухгалтер подтвердил ставки и порядок расчёта — или снимает подтверждение. */
    const confirm = async (confirmed: boolean) => {
        setConfirming(true);
        try {
            const { data } = await api.put('/exchange/park/rates/confirm', { confirmed });
            setRates(data);
            toast.success(confirmed ? 'Расчёт подтверждён — новые рейсы считаются без пометки «предварительный»' : 'Подтверждение снято — расчёт снова предварительный');
            onChanged();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось сохранить'));
        } finally {
            setConfirming(false);
        }
    };

    const save = async () => {
        const body = Object.fromEntries(RATE_FIELDS.map((f) => [f.key, Number(String(draft[f.key]).replace(',', '.'))]));
        if (Object.values(body).some((v) => !Number.isFinite(v) || v < 0 || v > 100)) {
            toast.error('Ставка — число от 0 до 100');
            return;
        }
        const n = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));
        const deductionMrp = Number(extra.deductionMrp);
        const mrp = Number(extra.mrp);
        if (!Number.isInteger(deductionMrp) || deductionMrp < 0 || !Number.isInteger(mrp) || mrp < 1) {
            toast.error('Вычет и МРП — целые числа');
            return;
        }
        const vatPct = n(extra.vatPct);
        if (!Number.isFinite(vatPct) || vatPct < 0 || vatPct > 100) { toast.error('НДС — число от 0 до 100'); return; }
        const fuelConsumption = n(extra.fuelConsumption);
        const fuelPriceSummer = n(extra.fuelPriceSummer);
        const fuelPriceWinter = extra.fuelPriceWinter.trim() ? n(extra.fuelPriceWinter) : null;
        if (!Number.isFinite(fuelConsumption) || fuelConsumption <= 0) { toast.error('Расход — литров на 100 км, числом'); return; }
        if (!Number.isFinite(fuelPriceSummer) || fuelPriceSummer <= 0) { toast.error('Цена литра летом — числом, ₸'); return; }
        if (fuelPriceWinter != null && (!Number.isFinite(fuelPriceWinter) || fuelPriceWinter <= 0)) { toast.error('Цена литра зимой — числом, ₸, или пусто'); return; }
        const ipnHighPct = n(extra.ipnHighPct);
        const ipnThresholdMrp = Number(extra.ipnThresholdMrp);
        if (!Number.isFinite(ipnHighPct) || ipnHighPct < 0 || ipnHighPct > 100) { toast.error('Повышенный ИПН — число от 0 до 100'); return; }
        if (!Number.isInteger(ipnThresholdMrp) || ipnThresholdMrp < 0) { toast.error('Порог — целым числом МРП'); return; }
        const advanceLimitPct = Number(extra.advanceLimitPct);
        if (!Number.isInteger(advanceLimitPct) || advanceLimitPct < 0 || advanceLimitPct > 100) { toast.error('Доля предоплаты — целое число от 0 до 100'); return; }
        setSaving(true);
        try {
            const { data } = await api.put('/exchange/park/rates', {
                ...body, applyDeduction: extra.applyDeduction, deductionMrp, mrp, vatPayer: extra.vatPayer, vatPct,
                fuelConsumption, fuelPriceSummer, fuelPriceWinter, ipnHighPct, ipnThresholdMrp, advanceLimitPct,
            });
            const wasConfirmed = !!rates?.confirmedAt;
            setRates(data);
            toast.success(wasConfirmed && data.preliminary
                ? 'Ставки сохранены. Они изменились — подтверждение бухгалтера снято, расчёт снова предварительный'
                : 'Ставки сохранены — новые выплаты посчитаются по ним, прошлые останутся как были');
            onChanged();
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
                {rates.preliminary ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        <span className="min-w-[280px] flex-1">
                            <b>Расчёт предварительный.</b> Пока бухгалтер парка не проверил ставки и порядок расчёта, суммы налогов у
                            водителей помечены «предварительный», а выгрузка в 1С и «Выплачено» — только с вашим согласием.
                        </span>
                        <Button size="sm" onClick={() => confirm(true)} disabled={confirming}>
                            {confirming && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Бухгалтер проверил — подтверждаю
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-[12.5px]">
                        <span className="flex-1">
                            <Check className="mr-1 inline h-3.5 w-3.5" />
                            Расчёт подтверждён бухгалтером{rates.confirmedAt ? ` ${dayjs(rates.confirmedAt).format('DD.MM.YYYY')}` : ''}. Изменение ставок снимет подтверждение.
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => confirm(false)} disabled={confirming}>Снять подтверждение</Button>
                    </div>
                )}
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
                    <div className="text-[12.5px] font-semibold">Как считается рейс водителя без ИП</div>
                    <p className="m-0 text-[12px] text-muted-foreground">
                        Сумма заказчика на бирже минус топливо — оплата водителю за работу. Из неё удерживается ОПВ, остальное водитель
                        получает на руки. ОСМС, СО и ИПН платит парк — они прибавляются к сумме, сверху — комиссия со всей суммы
                        (в ней доля LogiCore{rates.platformPct != null ? ` ${rates.platformPct}%` : ''}) и НДС, если вы его плательщик.
                        Топливо оплачивает парк: перерасход и экономия — ваши, сумму водителю они не меняют.
                    </p>
                    <div className="flex flex-wrap items-end gap-3 border-0 border-b border-solid border-border pb-3">
                        <div className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Сезон топлива</span>
                            <div className={styles.pills} role="tablist" aria-label="Сезон топлива">
                                {([['SUMMER', 'Лето'], ['WINTER', 'Зима']] as const).map(([key, label]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        role="tab"
                                        aria-selected={rates.fuelSeason === key}
                                        disabled={seasonSaving}
                                        className={`${styles.pill} ${rates.fuelSeason === key ? styles.pillActive : ''}`}
                                        onClick={() => setSeason(key)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className="flex w-40 flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Расход, л на 100 км</span>
                            <Input value={extra.fuelConsumption} onChange={(e) => setExtra((x) => ({ ...x, fuelConsumption: e.target.value }))} inputMode="decimal" className="h-9 text-[13px] tabular-nums" />
                        </label>
                        <label className="flex w-40 flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Литр летом, ₸</span>
                            <Input value={extra.fuelPriceSummer} onChange={(e) => setExtra((x) => ({ ...x, fuelPriceSummer: e.target.value }))} inputMode="decimal" className="h-9 text-[13px] tabular-nums" />
                        </label>
                        <label className="flex w-40 flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Литр зимой, ₸</span>
                            <Input value={extra.fuelPriceWinter} onChange={(e) => setExtra((x) => ({ ...x, fuelPriceWinter: e.target.value }))} inputMode="decimal" placeholder="как летом" className="h-9 text-[13px] tabular-nums" />
                        </label>
                        <span className="pb-2 text-[12px] text-muted-foreground">
                            Сейчас: {rates.fuelPerKm != null ? `${rates.fuelPerKm.toLocaleString('ru-RU')} ₸ за км` : '—'}
                            {rates.fuelSeason === 'WINTER' && rates.fuelPriceWinter == null ? ' — зимняя цена не задана, считается по летней' : ''}
                        </span>
                    </div>
                    {fuelHistory.length > 0 && (
                        <div className="border-0 border-b border-solid border-border pb-3 text-[12px]">
                            <div className="mb-1 font-medium text-muted-foreground">История цен на топливо</div>
                            <ul className="m-0 list-none space-y-0.5 p-0">
                                {(historyOpen ? fuelHistory : fuelHistory.slice(0, 3)).map((h) => (
                                    <li key={h.id} className="flex flex-wrap gap-x-2">
                                        <span className="tabular-nums text-muted-foreground">{dayjs(h.at).format('DD.MM.YYYY HH:mm')}</span>
                                        <span>{h.text}</span>
                                        {h.who && <span className="text-muted-foreground">· {h.who}</span>}
                                    </li>
                                ))}
                            </ul>
                            {fuelHistory.length > 3 && (
                                <button type="button" className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[12px] text-primary [font-family:inherit]" onClick={() => setHistoryOpen((v) => !v)}>
                                    {historyOpen ? 'Свернуть' : `Показать всю — ${fuelHistory.length}`}
                                </button>
                            )}
                        </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-4">
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Вычет по ИПН, МРП</span>
                            <Input value={extra.deductionMrp} onChange={(e) => setExtra((x) => ({ ...x, deductionMrp: e.target.value }))} inputMode="numeric" className="h-9 text-[13px] tabular-nums" />
                            <span className="text-[11px] text-muted-foreground">в месяц, только водителям с заявлением в приложении; остаток переходит на следующие рейсы</span>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">МРП, ₸</span>
                            <Input value={extra.mrp} onChange={(e) => setExtra((x) => ({ ...x, mrp: e.target.value }))} inputMode="numeric" className="h-9 text-[13px] tabular-nums" />
                            <span className="text-[11px] text-muted-foreground">2026 год — 4 325</span>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">ИПН выше порога, %</span>
                            <Input value={extra.ipnHighPct} onChange={(e) => setExtra((x) => ({ ...x, ipnHighPct: e.target.value }))} inputMode="decimal" className="h-9 text-[13px] tabular-nums" />
                            <span className="text-[11px] text-muted-foreground">прогрессивная шкала; равна обычной — шкалы нет</span>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">Порог дохода за год, МРП</span>
                            <Input value={extra.ipnThresholdMrp} onChange={(e) => setExtra((x) => ({ ...x, ipnThresholdMrp: e.target.value }))} inputMode="numeric" className="h-9 text-[13px] tabular-nums" />
                            <span className="text-[11px] text-muted-foreground">облагаемый доход водителя в вашем парке с начала года</span>
                        </label>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
                        <input type="checkbox" checked={extra.applyDeduction} onChange={(e) => setExtra((x) => ({ ...x, applyDeduction: e.target.checked }))} />
                        Применять базовый вычет водителям, которые написали заявление в приложении («у другого работодателя не получаю»)
                    </label>
                    <div className="flex flex-wrap items-end gap-3 border-0 border-t border-solid border-border pt-2">
                        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[12.5px]">
                            <input type="checkbox" checked={extra.vatPayer} onChange={(e) => setExtra((x) => ({ ...x, vatPayer: e.target.checked }))} />
                            Парк — плательщик НДС: прибавлять НДС к цене для компании
                        </label>
                        {extra.vatPayer && (
                            <label className="flex w-32 flex-col gap-1">
                                <span className="text-[12px] font-medium text-muted-foreground">НДС, %</span>
                                <Input value={extra.vatPct} onChange={(e) => setExtra((x) => ({ ...x, vatPct: e.target.value }))} inputMode="decimal" className="h-9 text-[13px] tabular-nums" />
                            </label>
                        )}
                    </div>
                    {/* Сколько водитель может попросить предоплатой до конца рейса (Q17; топливо — отдельно, шеф 27.10.2026). */}
                    <label className="flex w-full max-w-md flex-col gap-1 border-0 border-t border-solid border-border pt-2">
                        <span className="text-[12px] font-medium text-muted-foreground">Предоплата водителю, % от суммы на руки</span>
                        <Input value={extra.advanceLimitPct} onChange={(e) => setExtra((x) => ({ ...x, advanceLimitPct: e.target.value }))} inputMode="numeric" className="h-9 w-32 text-[13px] tabular-nums" />
                        <span className="text-[11px] text-muted-foreground">
                            сколько водитель может получить до конца рейса; 0 — нельзя. Топливо — отдельно, по километражу
                        </span>
                    </label>
                </div>
                <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить ставки</Button>
            </div>
        </section>
    );
}
