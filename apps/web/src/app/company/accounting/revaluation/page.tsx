'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Calculator, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { money, moneyShort } from '@/lib/money-format';
import { cn } from '@/lib/utils';

/**
 * Переоценка валютных остатков на конец месяца.
 *
 * Курсовая разница при оплате видна сразу — деньги пришли по другому курсу.
 * А эта разница возникает молча: счёт не оплачен, доллары просто лежат, но
 * на конец месяца стоят других тенге. Экран показывает её до проведения,
 * построчно и с обоими курсами, чтобы бухгалтер видела, откуда берётся
 * каждое число, а не подписывала итог вслепую.
 */

type Kind = 'ACCOUNT' | 'RECEIVABLE' | 'PAYABLE';

interface PreviewLine {
    kind: Kind;
    accountId: string | null;
    documentId: string | null;
    label: string;
    counterpartyName: string | null;
    currency: string;
    amount: number;
    rate: number;
    baseBefore: number;
    baseAfter: number;
    diff: number;
    outcome: 'GAIN' | 'LOSS' | 'NONE';
}

interface Preview {
    date: string;
    lines: PreviewLine[];
    gain: number;
    loss: number;
    net: number;
    missingRates: string[];
    alreadyPosted: { id: string; createdAt: string } | null;
}

interface RevaluationRow {
    id: string;
    date: string;
    gain: number;
    loss: number;
    note: string | null;
    createdAt: string;
    createdBy?: { firstName: string | null; lastName: string | null };
    _count?: { lines: number };
}

const KIND_LABEL: Record<Kind, string> = {
    ACCOUNT: 'Остаток на счёте',
    RECEIVABLE: 'Долг клиента',
    PAYABLE: 'Наш долг перевозчику',
};

/**
 * Последний день текущего месяца — то, что нужно в девяти случаях из десяти.
 * Считается по местному времени: `toISOString()` с полуночи до пяти утра по
 * Алматы отдал бы ещё вчерашний день.
 */
const defaultDate = () => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${last.getFullYear()}-${p(last.getMonth() + 1)}-${p(last.getDate())}`;
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('ru-RU');

export default function RevaluationPage() {
    const router = useRouter();
    const [date, setDate] = useState(defaultDate());
    const [preview, setPreview] = useState<Preview | null>(null);
    const [history, setHistory] = useState<RevaluationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [note, setNote] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [previewRes, listRes] = await Promise.all([
                api.get('/accounting/revaluations/preview', { params: { date } }),
                api.get('/accounting/revaluations'),
            ]);
            setPreview(previewRes.data);
            setHistory(listRes.data || []);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось посчитать переоценку');
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => { load(); }, [load]);

    const handlePost = async () => {
        setPosting(true);
        try {
            await api.post('/accounting/revaluations', { date, note: note.trim() || undefined });
            toast.success('Переоценка проведена');
            setNote('');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось провести переоценку');
        } finally {
            setPosting(false);
        }
    };

    const handleRemove = async (id: string) => {
        try {
            await api.delete(`/accounting/revaluations/${id}`);
            toast.success('Переоценка отменена');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось отменить');
        }
    };

    const lines = preview?.lines ?? [];
    const canPost = lines.length > 0 && !preview?.alreadyPosted;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
            <button
                onClick={() => router.push('/company/finance')}
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                Финансы
            </button>

            <h1 className="text-2xl font-semibold tracking-tight">Переоценка валютных остатков</h1>
            <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
                На конец месяца валютные остатки и неоплаченные валютные долги стоят уже других тенге,
                чем когда их записали. Эта разница — курсовая, и она должна попасть в отчёт того месяца,
                иначе баланс на последнее число покажет вчерашние тенге за сегодняшние доллары.
            </p>

            <Card className="mt-5">
                <CardContent className="flex flex-wrap items-end gap-4 p-4">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                            Переоценить на дату
                        </label>
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-44"
                        />
                    </div>
                    <div className="min-w-[220px] flex-1">
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                            Примечание (необязательно)
                        </label>
                        <Input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Например: закрытие августа"
                            maxLength={300}
                        />
                    </div>
                    <Button onClick={handlePost} disabled={!canPost || posting}>
                        <Check className="mr-1.5 h-4 w-4" />
                        {posting ? 'Проводим…' : 'Провести переоценку'}
                    </Button>
                </CardContent>
            </Card>

            {preview?.alreadyPosted && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                        На {formatDate(date)} переоценка уже проведена. Повторная посчитала бы ту же разницу
                        второй раз — если нужно пересчитать, сначала отмените прежнюю в списке ниже.
                    </span>
                </div>
            )}

            {!!preview?.missingRates.length && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                        <b>Нет курса на эту дату: {preview.missingRates.join(', ')}.</b>{' '}
                        Остатки в этих валютах не переоценены — подставить вчерашний курс значило бы выдать
                        чужую цифру за сегодняшнюю. Загрузите курс в разделе «Курсы валют» и посчитайте снова.
                    </span>
                </div>
            )}

            {loading ? (
                <p className="mt-6 text-sm text-muted-foreground">Считаем…</p>
            ) : lines.length === 0 ? (
                <Card className="mt-5">
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        <Calculator className="mx-auto mb-3 h-8 w-8 opacity-40" />
                        На {formatDate(date)} переоценивать нечего: валютных остатков и неоплаченных
                        валютных долгов нет, либо курс с прошлой переоценки не менялся.
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Доход от курса</div>
                                <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">
                                    +{moneyShort(preview!.gain)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Расход от курса</div>
                                {/* Знак у нуля не ставим: «−0 ₸» читается как потеря, которой не было. */}
                                <div className={cn(
                                    'mt-1 text-xl font-semibold tabular-nums',
                                    preview!.loss ? 'text-red-600' : 'text-muted-foreground',
                                )}>
                                    {preview!.loss ? '−' : ''}{moneyShort(preview!.loss)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-4">
                                <div className="text-xs text-muted-foreground">Итого в прибыль</div>
                                <div className={cn(
                                    'mt-1 text-xl font-semibold tabular-nums',
                                    preview!.net >= 0 ? 'text-emerald-600' : 'text-red-600',
                                )}>
                                    {preview!.net >= 0 ? '+' : '−'}{moneyShort(Math.abs(preview!.net))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="mt-4">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-2.5 text-left font-medium">Что переоценено</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Остаток</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Было в тенге</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Курс</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Стало в тенге</th>
                                            <th className="px-4 py-2.5 text-right font-medium">Разница</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line, i) => (
                                            <tr key={`${line.kind}-${line.accountId ?? line.documentId}-${i}`} className="border-b last:border-0">
                                                <td className="px-4 py-2.5">
                                                    <div className="font-medium">{line.label}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {KIND_LABEL[line.kind]}
                                                        {line.counterpartyName ? ` · ${line.counterpartyName}` : ''}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">
                                                    {money(line.amount, line.currency)}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                                    {moneyShort(line.baseBefore)}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                                                    {line.rate.toLocaleString('ru-RU', { maximumFractionDigits: 6 })}
                                                </td>
                                                <td className="px-4 py-2.5 text-right tabular-nums">
                                                    {moneyShort(line.baseAfter)}
                                                </td>
                                                <td className={cn(
                                                    'px-4 py-2.5 text-right font-semibold tabular-nums',
                                                    line.outcome === 'GAIN' ? 'text-emerald-600' : 'text-red-600',
                                                )}>
                                                    {line.diff > 0 ? '+' : '−'}{moneyShort(Math.abs(line.diff))}
                                                    <div className="text-[11px] font-normal">
                                                        {line.outcome === 'GAIN' ? 'доход' : 'расход'}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            <h2 className="mt-8 text-base font-semibold">Проведённые переоценки</h2>
            {history.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Пока ни одной.</p>
            ) : (
                <Card className="mt-3">
                    <CardContent className="p-0">
                        <table className="w-full text-sm">
                            <tbody>
                                {history.map((row) => (
                                    <tr key={row.id} className="border-b last:border-0">
                                        <td className="px-4 py-2.5">
                                            <span className="font-medium">{formatDate(row.date)}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                {row._count?.lines ?? 0} строк
                                                {row.note ? ` · ${row.note}` : ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">
                                            <Badge variant="outline" className={cn('mr-1', row.gain ? 'text-emerald-600' : 'text-muted-foreground')}>
                                                {row.gain ? '+' : ''}{moneyShort(row.gain)}
                                            </Badge>
                                            <Badge variant="outline" className={row.loss ? 'text-red-600' : 'text-muted-foreground'}>
                                                {row.loss ? '−' : ''}{moneyShort(row.loss)}
                                            </Badge>
                                        </td>
                                        <td className="w-10 px-2 py-2.5 text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemove(row.id)}
                                                title="Отменить переоценку"
                                            >
                                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
