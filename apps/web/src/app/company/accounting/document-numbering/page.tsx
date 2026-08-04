'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/**
 * Нумерация счетов и актов.
 *
 * Бухгалтерия просит свою нумерацию не ради красивых номеров: в 1С и в банке
 * счета ищут по номеру, и он должен совпадать. Настроить нужно ДО первого
 * документа — выданный номер переименовать уже нельзя, поэтому здесь показаны
 * все виды документов, в том числе те, по которым ещё ничего не заводили, и
 * рядом счётчик «уже выставлено».
 */

type DocType = 'PAYMENT_INVOICE' | 'SERVICE_ACT' | 'RECONCILIATION_ACT' | 'CORRECTION';
type Direction = 'OUTGOING' | 'INCOMING';

interface Row {
    type: DocType;
    direction: Direction;
    year: number;
    prefix: string;
    nextNumber: number;
    padLength: number;
    example: string;
    documents: number;
}

const TYPE_LABEL: Record<DocType, string> = {
    PAYMENT_INVOICE: 'Счёт на оплату',
    SERVICE_ACT: 'Акт выполненных работ',
    RECONCILIATION_ACT: 'Акт сверки',
    CORRECTION: 'Корректировка',
};

const DIRECTION_LABEL: Record<Direction, string> = {
    OUTGOING: 'мы выставляем',
    INCOMING: 'нам выставляют',
};

/** Пример считаем так же, как сервер: иначе экран однажды соврёт. */
const buildExample = (prefix: string, nextNumber: number, padLength: number) =>
    `${prefix}${String(Math.max(1, nextNumber)).padStart(Math.min(12, Math.max(1, padLength)), '0')}`;

export default function DocumentNumberingPage() {
    const router = useRouter();
    const [rows, setRows] = useState<Row[]>([]);
    const [year, setYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/accounting-documents/numbering', { params: { year } });
            setRows(res.data?.rows || []);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось загрузить нумерацию');
        } finally {
            setLoading(false);
        }
    }, [year]);

    useEffect(() => { load(); }, [load]);

    const keyOf = (row: Row) => `${row.type}__${row.direction}`;

    const patch = (row: Row, changes: Partial<Row>) => {
        setRows((prev) => prev.map((r) => (keyOf(r) === keyOf(row) ? { ...r, ...changes } : r)));
    };

    const save = async (row: Row) => {
        setSavingKey(keyOf(row));
        try {
            await api.put('/accounting-documents/numbering', {
                type: row.type,
                direction: row.direction,
                year: row.year,
                prefix: row.prefix,
                nextNumber: Number(row.nextNumber),
                padLength: Number(row.padLength),
            });
            toast.success('Нумерация сохранена');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось сохранить');
        } finally {
            setSavingKey(null);
        }
    };

    const outgoing = rows.filter((r) => r.direction === 'OUTGOING');
    const incoming = rows.filter((r) => r.direction === 'INCOMING');

    const renderGroup = (title: string, hint: string, group: Row[]) => (
        <>
            <h2 className="mt-7 text-base font-semibold">{title}</h2>
            <p className="mb-3 mt-0.5 text-sm text-muted-foreground">{hint}</p>
            <div className="space-y-3">
                {group.map((row) => (
                    <Card key={keyOf(row)}>
                        <CardContent className="flex flex-wrap items-end gap-4 p-4">
                            <div className="min-w-[190px] flex-1">
                                <div className="font-medium">{TYPE_LABEL[row.type]}</div>
                                <div className="text-xs text-muted-foreground">
                                    {row.documents > 0
                                        ? `${row.documents} уже выставлено`
                                        : 'ещё ни одного — сейчас самое время настроить'}
                                </div>
                            </div>

                            <div className="w-32">
                                <label className="mb-1 block text-xs text-muted-foreground">Префикс</label>
                                <Input
                                    value={row.prefix}
                                    maxLength={20}
                                    placeholder="АВ-"
                                    onChange={(e) => patch(row, { prefix: e.target.value })}
                                />
                            </div>
                            <div className="w-32">
                                <label className="mb-1 block text-xs text-muted-foreground">Следующий номер</label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={row.nextNumber}
                                    onChange={(e) => patch(row, { nextNumber: Number(e.target.value) })}
                                />
                            </div>
                            <div className="w-24">
                                <label className="mb-1 block text-xs text-muted-foreground">Цифр</label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={12}
                                    value={row.padLength}
                                    onChange={(e) => patch(row, { padLength: Number(e.target.value) })}
                                />
                            </div>

                            <div className="min-w-[150px]">
                                <label className="mb-1 block text-xs text-muted-foreground">Получится</label>
                                <Badge variant="outline" className="h-9 px-3 font-mono text-sm">
                                    {buildExample(row.prefix, row.nextNumber, row.padLength)}
                                </Badge>
                            </div>

                            <Button
                                variant="outline"
                                onClick={() => save(row)}
                                disabled={savingKey === keyOf(row)}
                            >
                                <Check className="mr-1.5 h-4 w-4" />
                                Сохранить
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </>
    );

    return (
        <div className="mx-auto w-full max-w-5xl px-4 py-6">
            <button
                onClick={() => router.push('/company/finance')}
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                Финансы
            </button>

            <h1 className="text-2xl font-semibold tracking-tight">Нумерация счетов и актов</h1>
            <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
                Номер собирается из трёх частей: префикс, число и сколько в нём цифр. Префикс «АВ-»,
                номер 10002 и восемь цифр дают <span className="font-mono">АВ-00010002</span>.
                У каждого года свой счётчик — январь начинается с первого номера, а не продолжает декабрь.
            </p>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                    Выставленный документ переименовать нельзя — номер уходит контрагенту, в банк и в 1С.
                    Настройка меняет только те документы, которые будут выставлены после неё.
                </span>
            </div>

            <div className="mt-5 flex items-end gap-3">
                <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Год</label>
                    <Input
                        type="number"
                        min={2000}
                        max={2100}
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="w-28"
                    />
                </div>
            </div>

            {loading ? (
                <p className="mt-6 text-sm text-muted-foreground">Загружаем…</p>
            ) : (
                <>
                    {renderGroup(
                        'Наши документы',
                        'Эти номера видит контрагент — их он ставит в платёжном поручении.',
                        outgoing,
                    )}
                    {renderGroup(
                        'Документы от контрагентов',
                        'Внутренний номер для входящего документа. Номер самого контрагента вводится отдельно в карточке документа и печатается в нём.',
                        incoming,
                    )}
                </>
            )}
        </div>
    );
}
