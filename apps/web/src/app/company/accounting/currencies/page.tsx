'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Download, Pencil, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Курсы валют.
 *
 * Курс — основание для сумм в валютном счёте, поэтому здесь важны две вещи,
 * которых обычно не делают. Первая: рядом с пересчитанным курсом показано
 * исходное значение Нацбанка вместе с кратностью («3,96 за 100»), чтобы
 * бухгалтер могла сверить глазами с сайтом. Вторая: видно, откуда курс —
 * официальный от Нацбанка или свой курс компании, и с какой причиной.
 */

interface RateRow {
    code: string;
    nameRu: string;
    symbol: string | null;
    quant: number;
    isCommon: boolean;
    hasOfficialRate: boolean;
    rate: number | null;
    rateDate: string | null;
    sourceRate: number | null;
    sourceQuant: number | null;
    source: string | null;
    note: string | null;
    isCarriedOver: boolean;
    change: number | null;
}

/**
 * Сегодня по местному времени, а не по Гринвичу.
 *
 * `toISOString()` переводит в Гринвич: с полуночи до пяти утра по Алматы
 * это ещё вчера, и экран по умолчанию открывался бы на вчерашней дате.
 */
const today = () => {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

/**
 * Курс показываем с той точностью, с какой он имеет смысл, и без хвостовых
 * нулей. Мелочь, на которой легко обжечься: «1,000» в русской записи
 * читается как тысяча, а это курс тенге к тенге, то есть единица.
 */
const showRate = (value: number) => {
    const max = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 4 : 6;
    return value.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: max });
};

const showDate = (value: string) => new Date(`${value}T00:00:00Z`)
    .toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/** Русское число: «1 валюты», «2 валют», «18 валют». */
const plural = (count: number, one: string, few: string, many: string) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 14) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
};

export default function CurrenciesPage() {
    const router = useRouter();

    const [date, setDate] = useState(today());
    const [rows, setRows] = useState<RateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [onlyCommon, setOnlyCommon] = useState(true);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);

    const [editing, setEditing] = useState<RateRow | null>(null);
    const [manualRate, setManualRate] = useState('');
    const [manualNote, setManualNote] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/currency/rates', { params: { date, onlyCommon } });
            setRows(res.data || []);
            setFailed(false);
        } catch (e: any) {
            setFailed(true);
            setRows([]);
            toast.error(e?.response?.data?.message || 'Не удалось загрузить курсы');
        } finally {
            setLoading(false);
        }
    }, [date, onlyCommon]);

    useEffect(() => { load(); }, [load]);

    const importFromNbk = async () => {
        setBusy(true);
        try {
            const res = await api.post('/currency/rates/import', { date });
            const { saved, rateDate } = res.data || {};
            toast.success(`Загружено курсов: ${saved} на ${showDate(rateDate)}`);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось загрузить курсы Нацбанка');
        } finally {
            setBusy(false);
        }
    };

    const backfillMonth = async () => {
        setBusy(true);
        try {
            const to = date;
            const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - 29 * 86_400_000)
                .toISOString().slice(0, 10);
            const res = await api.post('/currency/rates/backfill', { from, to });
            const { loaded, failed: notLoaded } = res.data || {};
            if (notLoaded?.length) {
                toast.warning(`Загружено дней: ${loaded}. Не удалось: ${notLoaded.length}`);
            } else {
                toast.success(`Загружено дней: ${loaded}`);
            }
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось догрузить курсы');
        } finally {
            setBusy(false);
        }
    };

    const openManual = (row: RateRow) => {
        setEditing(row);
        setManualRate(row.source === 'COMPANY' && row.rate ? String(row.rate) : '');
        setManualNote(row.source === 'COMPANY' ? row.note || '' : '');
    };

    const saveManual = async () => {
        if (!editing) return;
        const value = Number(manualRate.replace(',', '.'));
        if (!(value > 0)) {
            toast.error('Курс должен быть больше нуля');
            return;
        }
        setBusy(true);
        try {
            await api.post('/currency/rates/manual', {
                code: editing.code, date, rate: value, note: manualNote.trim() || undefined,
            });
            toast.success(`Курс ${editing.code} на ${showDate(date)} сохранён`);
            setEditing(null);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось сохранить курс');
        } finally {
            setBusy(false);
        }
    };

    const removeManual = async (row: RateRow) => {
        setBusy(true);
        try {
            await api.delete('/currency/rates/manual', { params: { code: row.code, date } });
            toast.success(`Свой курс ${row.code} убран — вернётся официальный`);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось убрать курс');
        } finally {
            setBusy(false);
        }
    };

    const term = search.trim().toLowerCase();
    const visible = term
        ? rows.filter((r) => r.code.toLowerCase().includes(term) || r.nameRu.toLowerCase().includes(term))
        : rows;

    const missing = rows.filter((r) => r.rate === null).length;

    return (
        <div className="lc-page min-h-screen bg-background p-6">
            <div className="mx-auto max-w-[1180px]">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                        <Button variant="ghost" size="icon" aria-label="Назад" onClick={() => router.push('/company/finance')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-foreground">Курсы валют</h1>
                            <p className="text-sm text-muted-foreground">
                                Официальные курсы Национального банка РК. Курс, по которому провели документ,
                                остаётся в нём навсегда — здесь только справочник.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={busy} onClick={backfillMonth}>
                            <Download className="h-4 w-4" /> Догрузить за месяц
                        </Button>
                        <Button disabled={busy} onClick={importFromNbk}>
                            <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} /> Обновить с Нацбанка
                        </Button>
                    </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Курс на дату</span>
                        <Input type="date" className="w-[160px]" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    <div className="relative min-w-[220px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            className="pl-9"
                            placeholder="Валюта или код: рубль, USD"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <Button size="sm" variant={onlyCommon ? 'default' : 'outline'} onClick={() => setOnlyCommon(true)}>
                        СНГ и основные
                    </Button>
                    <Button size="sm" variant={onlyCommon ? 'outline' : 'default'} onClick={() => setOnlyCommon(false)}>
                        Все валюты
                    </Button>
                </div>

                {missing > 0 && !loading && (
                    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        На {showDate(date)} курса нет у {missing} {plural(missing, 'валюты', 'валют', 'валют')}.
                        Нажмите «Обновить с Нацбанка», а для валют без официального курса поставьте
                        значение вручную.
                    </div>
                )}

                <Card>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-10 text-center text-sm text-muted-foreground">Загрузка…</div>
                        ) : failed ? (
                            <div className="p-10 text-center">
                                <div className="text-sm font-medium text-foreground">Список не загрузился</div>
                                <div className="mt-1 text-sm text-muted-foreground">Это сбой связи, а не отсутствие курсов.</div>
                                <Button className="mt-4" variant="outline" size="sm" onClick={load}>Повторить</Button>
                            </div>
                        ) : visible.length === 0 ? (
                            <div className="p-10 text-center text-sm text-muted-foreground">
                                По этому отбору валют нет
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-3 text-left font-semibold">Валюта</th>
                                            <th className="px-4 py-3 text-right font-semibold">Тенге за единицу</th>
                                            <th className="px-4 py-3 text-right font-semibold">Изменение</th>
                                            <th className="px-4 py-3 text-left font-semibold">Как у Нацбанка</th>
                                            <th className="px-4 py-3 text-left font-semibold">Источник</th>
                                            <th className="px-4 py-3 text-right font-semibold">Курс вручную</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visible.map((row) => (
                                            <tr key={row.code} className="border-b border-border last:border-0 hover:bg-muted/40">
                                                <td className="px-4 py-3 align-top">
                                                    <div className="font-semibold">
                                                        {row.code} {row.symbol ? <span className="text-muted-foreground">{row.symbol}</span> : null}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{row.nameRu}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right align-top">
                                                    {row.rate === null ? (
                                                        <span className="text-muted-foreground">нет курса</span>
                                                    ) : (
                                                        <>
                                                            <div className="font-semibold tabular-nums">{showRate(row.rate)} ₸</div>
                                                            {row.rateDate && (
                                                                <div className={cn(
                                                                    'text-xs',
                                                                    row.isCarriedOver ? 'text-amber-700' : 'text-muted-foreground',
                                                                )}>
                                                                    {row.isCarriedOver ? `с ${showDate(row.rateDate)}` : showDate(row.rateDate)}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right align-top tabular-nums">
                                                    {row.change === null || row.change === 0 ? (
                                                        <span className="text-muted-foreground">—</span>
                                                    ) : (
                                                        <span className={row.change > 0 ? 'text-emerald-600' : 'text-destructive'}>
                                                            {row.change > 0 ? '+' : ''}{showRate(row.change)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top text-muted-foreground">
                                                    {row.sourceRate === null ? (
                                                        row.code === 'KZT' ? 'учётная валюта' : '—'
                                                    ) : (
                                                        <span className="tabular-nums">
                                                            {row.sourceRate.toLocaleString('ru-RU')} за {row.sourceQuant}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    {row.source === 'COMPANY' ? (
                                                        <>
                                                            <Badge variant="warning">Свой курс компании</Badge>
                                                            {row.note && <div className="mt-1 text-xs text-muted-foreground">{row.note}</div>}
                                                        </>
                                                    ) : row.source === 'NBK' ? (
                                                        <Badge variant="outline">Нацбанк</Badge>
                                                    ) : row.source === 'BASE' ? (
                                                        <Badge variant="secondary">Учётная валюта</Badge>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.hasOfficialRate ? 'не загружен' : 'Нацбанк не публикует'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right align-top">
                                                    {row.code === 'KZT' ? (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    ) : (
                                                        <div className="flex justify-end gap-1">
                                                            <Button variant="ghost" size="icon" aria-label="Поставить свой курс"
                                                                onClick={() => openManual(row)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            {row.source === 'COMPANY' && (
                                                                <Button variant="ghost" size="icon" aria-label="Убрать свой курс"
                                                                    onClick={() => removeManual(row)}>
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <p className="mt-3 text-xs text-muted-foreground">
                    Кратность важна: сум Нацбанк публикует за 100 единиц, драм за 10, риал за 10 000.
                    В колонке «Тенге за единицу» кратность уже развёрнута, рядом показано исходное значение.
                </p>
            </div>

            <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent className="max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Свой курс {editing?.code} на {showDate(date)}</DialogTitle>
                        <DialogDescription>
                            Сколько тенге за одну единицу. Курс принадлежит вашей компании: другие компании
                            его не видят, а загрузка с Нацбанка его не затрагивает.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <div className="mb-1 text-xs text-muted-foreground">Тенге за 1 {editing?.code}</div>
                            <Input
                                value={manualRate}
                                onChange={(e) => setManualRate(e.target.value)}
                                placeholder="135,5"
                                inputMode="decimal"
                            />
                        </div>
                        <div>
                            <div className="mb-1 text-xs text-muted-foreground">Причина</div>
                            <Input
                                value={manualNote}
                                onChange={(e) => setManualNote(e.target.value)}
                                placeholder="Курс по договору с клиентом"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setEditing(null)}>Отмена</Button>
                            <Button disabled={busy} onClick={saveManual}>
                                <Check className="h-4 w-4" /> Сохранить
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
