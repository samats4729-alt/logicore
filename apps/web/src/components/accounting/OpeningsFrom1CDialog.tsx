'use client';

import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ListPicker } from '@/components/pickers/ListPicker';

export interface OpeningsPartner {
    id: string;
    name: string;
    bin?: string | null;
    isCustomer?: boolean;
    isCarrier?: boolean;
}

interface ExistingOpening {
    counterpartyId: string;
    openingReceivable: number;
    openingPayable: number;
}

interface ParsedSheet {
    account: string | null;
    periodEnd: string | null;
    rows: Array<{ name: string; debit: number; credit: number }>;
}

interface Line {
    name: string;
    debit: number;
    credit: number;
    counterpartyId: string | null;
    /** exact — то же название; similar — похоже, проверьте; null — не нашли. */
    match: 'exact' | 'similar' | 'picked' | null;
    checked: boolean;
}

/** Название без кавычек, формы собственности и регистра — так же, как на сервере. */
const LEGAL_FORMS = new Set(['тоо', 'ооо', 'ао', 'пао', 'зао', 'оао', 'ип', 'чп', 'кх', 'тов', 'llp', 'llc', 'ltd', 'too']);
const normalize = (name: string) => name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/индивидуальный предприниматель/g, ' ')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !LEGAL_FORMS.has(w))
    .join(' ');

/** Сопоставить название из 1С с контрагентом LogiCore: точно, похоже (большинство слов совпали) или никак. */
function matchPartner(name: string, partners: OpeningsPartner[]): Pick<Line, 'counterpartyId' | 'match'> {
    const key = normalize(name);
    const exact = partners.filter((p) => normalize(p.name) === key);
    if (exact.length === 1) return { counterpartyId: exact[0].id, match: 'exact' };
    const words = Array.from(new Set(key.split(' ')));
    let best: { id: string; score: number } | null = null;
    let tie = false;
    for (const p of partners) {
        const other = new Set(normalize(p.name).split(' '));
        const common = words.filter((w) => other.has(w)).length;
        const score = common / Math.max(words.length, other.size);
        if (score >= 0.6 && (!best || score > best.score)) { best = { id: p.id, score }; tie = false; } else if (best && score === best.score) tie = true;
    }
    return best && !tie ? { counterpartyId: best.id, match: 'similar' } : { counterpartyId: null, match: null };
}

const money = (v: number) => (v ? v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—');

/**
 * Долги на начало работы — из оборотно-сальдовой ведомости 1С.
 *
 * Прямой обмен с 1С остатки не передаёт (1С считает их только при полной
 * выгрузке базы), поэтому — отчёт, который бухгалтер и так умеет
 * сформировать. Сервер находит в нём сальдо на конец по каждому
 * контрагенту, здесь человек сверяет, с кем LogiCore их сопоставил, и
 * только потом записывает. Строку, которую не сопоставили, можно привязать
 * самому или пропустить.
 */
export function OpeningsFrom1CDialog({ open, onOpenChange, partners, openings, onSaved }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    partners: OpeningsPartner[];
    openings: ExistingOpening[];
    onSaved: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [sheet, setSheet] = useState<ParsedSheet | null>(null);
    const [lines, setLines] = useState<Line[]>([]);
    const [date, setDate] = useState('');
    const [picking, setPicking] = useState<number | null>(null);
    const byId = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
    const existing = useMemo(() => new Map(openings.map((o) => [o.counterpartyId, o])), [openings]);

    const reset = () => {
        setSheet(null);
        setLines([]);
        setDate('');
        if (fileRef.current) fileRef.current.value = '';
    };

    const upload = async (file: File) => {
        setBusy(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const { data } = await api.post<ParsedSheet>('/accounting/counterparty-openings/from-1c/parse', form);
            if (!data.rows.length) {
                toast.error('В ведомости нет контрагентов с долгом на конец периода');
                return;
            }
            setSheet(data);
            setDate(data.periodEnd ?? '');
            setLines(data.rows.map((r) => {
                const m = matchPartner(r.name, partners);
                return { ...r, ...m, checked: !!m.counterpartyId };
            }));
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось прочитать файл'));
        } finally {
            setBusy(false);
        }
    };

    const chosen = lines.filter((l) => l.checked && l.counterpartyId);
    const save = async () => {
        setBusy(true);
        try {
            const { data } = await api.post<{ saved: number }>('/accounting/counterparty-openings/from-1c', {
                openingDate: date || null,
                note: `Из 1С: оборотно-сальдовая ведомость${sheet?.account ? ` по счёту ${sheet.account}` : ''}`,
                rows: chosen.map((l) => ({ counterpartyId: l.counterpartyId, receivable: l.debit, payable: l.credit })),
            });
            toast.success(`Начальные долги записаны: контрагентов — ${data.saved}`);
            onSaved();
            onOpenChange(false);
            reset();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось записать долги'));
        } finally {
            setBusy(false);
        }
    };

    const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

    return (
        <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
            <DialogContent className="max-w-[920px]">
                <DialogHeader>
                    <DialogTitle>Долги на начало — из 1С</DialogTitle>
                    <DialogDescription>
                        Загрузите оборотно-сальдовую ведомость: LogiCore возьмёт из неё, кто сколько должен на конец периода.
                    </DialogDescription>
                </DialogHeader>

                {!sheet ? (
                    <div className="space-y-4 text-[13px]">
                        <ol className="m-0 space-y-1.5 pl-5">
                            <li>В 1С: «Отчёты» → «Оборотно-сальдовая ведомость по счёту».</li>
                            <li>
                                Счёт <b>1210</b> — покупатели, <b>3310</b> — перевозчики и поставщики (в российской 1С — 62 и 60).
                                Период — по день перед началом работы в LogiCore. «Сформировать».
                            </li>
                            <li>Кнопка с дискетой → «Лист Microsoft Excel» → загрузите файл сюда. Ведомости по покупателям и по перевозчикам — по очереди.</li>
                        </ol>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
                        />
                        <Button className="h-9" onClick={() => fileRef.current?.click()} disabled={busy}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Выбрать файл ведомости
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3 text-[13px]">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="flex items-center gap-1.5 font-medium">
                                <FileSpreadsheet className="h-4 w-4" />
                                {sheet.account ? `Счёт ${sheet.account}` : 'Ведомость'} · строк с долгом: {lines.length}
                            </span>
                            <label className="flex items-center gap-2 text-muted-foreground">
                                Долги на дату
                                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-[150px]" />
                            </label>
                            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>Другой файл</Button>
                        </div>

                        <div className="max-h-[52vh] overflow-auto rounded-lg border border-solid border-border">
                            <table className="w-full border-collapse text-[13px]">
                                <thead className="sticky top-0 bg-muted/60 text-left text-[12px] text-muted-foreground">
                                    <tr>
                                        <th className="w-8 px-2 py-2" />
                                        <th className="px-2 py-2 font-medium">В 1С</th>
                                        <th className="px-2 py-2 font-medium">Контрагент в LogiCore</th>
                                        <th className="px-2 py-2 text-right font-medium">Нам должны</th>
                                        <th className="px-2 py-2 text-right font-medium">Мы должны</th>
                                        <th className="px-2 py-2 text-right font-medium">Сейчас в LogiCore</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((l, i) => {
                                        const partner = l.counterpartyId ? byId.get(l.counterpartyId) : null;
                                        const now = l.counterpartyId ? existing.get(l.counterpartyId) : null;
                                        return (
                                            <tr key={l.name} className="border-0 border-t border-solid border-border">
                                                <td className="px-2 py-1.5">
                                                    <Checkbox
                                                        checked={l.checked}
                                                        disabled={!l.counterpartyId || busy}
                                                        onCheckedChange={(v) => update(i, { checked: v === true })}
                                                        aria-label={`Записать долг ${l.name}`}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5">{l.name}</td>
                                                <td className="px-2 py-1.5">
                                                    <div className="flex items-center gap-2">
                                                        {partner ? <span>{partner.name}</span> : <span className="text-muted-foreground">не нашли</span>}
                                                        {l.match === 'similar' && (
                                                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">проверьте</span>
                                                        )}
                                                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setPicking(i)} disabled={busy}>
                                                            {partner ? 'Сменить' : 'Выбрать'}
                                                        </Button>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-1.5 text-right tabular-nums">{money(l.debit)}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums">{money(l.credit)}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                                                    {now && (now.openingReceivable || now.openingPayable)
                                                        ? `${money(Number(now.openingReceivable))} / ${money(Number(now.openingPayable))}`
                                                        : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="m-0 text-[12px] text-muted-foreground">
                                Что в ведомости нулём, не затирается: загрузите по очереди покупателей и перевозчиков.
                            </p>
                            <Button className="h-9" onClick={save} disabled={busy || !chosen.length}>
                                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Записать долги ({chosen.length})
                            </Button>
                        </div>
                    </div>
                )}

                <ListPicker
                    open={picking !== null}
                    onOpenChange={(v) => { if (!v) setPicking(null); }}
                    title="Контрагент в LogiCore"
                    description={picking !== null ? `Кто это в LogiCore: «${lines[picking]?.name}»` : undefined}
                    searchPlaceholder="Название или БИН"
                    groups={[{
                        label: 'Контрагенты',
                        items: partners.map((p) => ({ id: p.id, title: p.name, subtitle: p.bin ? `БИН ${p.bin}` : undefined, keywords: p.bin ?? '' })),
                    }]}
                    value={picking !== null ? lines[picking]?.counterpartyId : null}
                    onSelect={(id) => {
                        if (picking !== null) update(picking, { counterpartyId: id, match: 'picked', checked: true });
                        setPicking(null);
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
