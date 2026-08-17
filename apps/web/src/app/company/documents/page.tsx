'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Eye, Paperclip, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import StatusPill from '@/components/ui/StatusPill';

/**
 * Документы, вложенные в рейсы: накладные, акты, счета, доверенности.
 *
 * Раньше этот экран был заготовкой — таблица всегда пустая, поиск и кнопки
 * ничего не делали. Из-за этого бухгалтеру приходилось спрашивать накладную
 * у логиста: сама она могла найти её только внутри карточки рейса, зная
 * номер заявки. Теперь список настоящий, а искать можно так, как документ
 * помнят: по заказчику, городу, водителю или госномеру.
 */

interface DocumentRow {
    id: string;
    type: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    createdAt: string;
    orderId: string | null;
    orderNumber: string | null;
    orderStatus: string | null;
    route: string | null;
    driverName: string | null;
    driverPlate: string | null;
    customer: string | null;
    uploadedBy: { firstName: string | null; lastName: string | null } | null;
    /** Прислал контрагент по ссылке на отчёт. */
    uploadedByCounterparty: { name: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
    TTN: 'Накладная',
    POWER_OF_ATTORNEY: 'Доверенность',
    ACT: 'Акт',
    INVOICE: 'Счёт',
    OTHER: 'Прочее',
    COMPANY_REGISTRATION: 'Справка о регистрации',
    DIRECTOR_APPOINTMENT: 'Приказ о руководителе',
    DIRECTOR_ID: 'Удостоверение руководителя',
};

/** Виды в фильтре — те, что вкладывают в рейсы каждый день. */
const TYPE_FILTERS: { key: string; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'TTN', label: 'Накладные' },
    { key: 'ACT', label: 'Акты' },
    { key: 'INVOICE', label: 'Счета' },
    { key: 'POWER_OF_ATTORNEY', label: 'Доверенности' },
    { key: 'OTHER', label: 'Прочее' },
];

const fileSize = (bytes: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

const date = (value: string) => new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
});

const personName = (person: DocumentRow['uploadedBy']) =>
    person ? `${person.lastName || ''} ${person.firstName || ''}`.trim() || '—' : '—';

export default function DocumentsPage() {
    const router = useRouter();

    const [rows, setRows] = useState<DocumentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [type, setType] = useState('all');
    const [search, setSearch] = useState('');
    // Отдельное значение под запрос: пока человек печатает, список не
    // дёргается на каждую букву.
    const [appliedSearch, setAppliedSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setAppliedSearch(search.trim()), 400);
        return () => clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/documents', {
                params: {
                    type: type === 'all' ? undefined : type,
                    search: appliedSearch || undefined,
                    from: from || undefined,
                    to: to || undefined,
                },
            });
            setRows(res.data || []);
            setFailed(false);
        } catch (e: any) {
            // Молчать нельзя: пустой список и «ничего не нашлось» выглядят
            // одинаково, и человек решит, что накладных нет.
            setFailed(true);
            setRows([]);
            toast.error(e?.response?.data?.message || 'Не удалось загрузить документы');
        } finally {
            setLoading(false);
        }
    }, [type, appliedSearch, from, to]);

    useEffect(() => { load(); }, [load]);

    /** Открыть или скачать вложение. Файл берём через API — прямой ссылки нет. */
    const openFile = async (row: DocumentRow, mode: 'view' | 'download') => {
        try {
            const res = await api.get(`/documents/${row.id}/download`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([res.data], { type: row.mimeType || 'application/octet-stream' }));
            if (mode === 'view') {
                window.open(url, '_blank', 'noopener');
            } else {
                const link = document.createElement('a');
                link.href = url;
                link.download = row.fileName;
                link.click();
            }
            // Ссылку освобождаем не сразу: вкладка не успеет открыть файл.
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось открыть файл');
        }
    };

    const hasFilters = type !== 'all' || !!appliedSearch || !!from || !!to;

    return (
        <div className="lc-page min-h-screen bg-background p-6">
            <div className="mx-auto max-w-[1180px]">
                <div className="mb-5">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Документы</h1>
                    <p className="text-sm text-muted-foreground">
                        Файлы, вложенные в рейсы: накладные, акты, счета и доверенности.
                        Вкладывают их в карточке рейса — здесь они собраны за период.
                    </p>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2">
                    {TYPE_FILTERS.map((f) => (
                        <Button
                            key={f.key}
                            size="sm"
                            variant={type === f.key ? 'default' : 'outline'}
                            onClick={() => setType(f.key)}
                        >
                            {f.label}
                        </Button>
                    ))}
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[260px] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            className="pl-9"
                            placeholder="Заказчик, город, водитель, госномер или номер заявки"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Вложены с</span>
                        <Input type="date" className="w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
                        <span className="text-xs text-muted-foreground">по</span>
                        <Input type="date" className="w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                    {hasFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setType('all'); setSearch(''); setFrom(''); setTo(''); }}
                        >
                            Сбросить
                        </Button>
                    )}
                </div>

                <Card>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-10 text-center text-sm text-muted-foreground">Загрузка…</div>
                        ) : failed ? (
                            <div className="p-10 text-center">
                                <div className="text-sm font-medium text-foreground">Список не загрузился</div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    Это сбой связи, а не отсутствие документов.
                                </div>
                                <Button className="mt-4" variant="outline" size="sm" onClick={load}>Повторить</Button>
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="p-10 text-center">
                                <Paperclip className="mx-auto mb-3 h-5 w-5 text-muted-foreground" />
                                <div className="text-sm font-medium text-foreground">
                                    {hasFilters ? 'По этому отбору ничего нет' : 'Пока ничего не вложено'}
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    {hasFilters
                                        ? 'Попробуйте другой период или вид документа.'
                                        : 'Документы появляются здесь, когда их прикрепляют к рейсу в его карточке.'}
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[900px] text-sm">
                                    <thead>
                                        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                                            <th className="px-4 py-3 text-left font-semibold">Вид</th>
                                            <th className="px-4 py-3 text-left font-semibold">Рейс</th>
                                            <th className="px-4 py-3 text-left font-semibold">Заказчик</th>
                                            <th className="px-4 py-3 text-left font-semibold">Водитель</th>
                                            <th className="px-4 py-3 text-left font-semibold">Файл</th>
                                            <th className="px-4 py-3 text-left font-semibold">Вложил</th>
                                            <th className="px-4 py-3 text-right font-semibold">Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row) => (
                                            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                                                <td className="px-4 py-3 align-top">
                                                    <Badge variant="outline">{TYPE_LABELS[row.type] || row.type}</Badge>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    {row.orderId ? (
                                                        <button
                                                            type="button"
                                                            className="text-left font-semibold underline-offset-2 hover:underline"
                                                            onClick={() => router.push(`/company/orders/${row.orderId}`)}
                                                        >
                                                            {row.orderNumber}
                                                        </button>
                                                    ) : (
                                                        <span className="text-muted-foreground">Без рейса</span>
                                                    )}
                                                    {row.route && (
                                                        <div className="text-xs text-muted-foreground">{row.route}</div>
                                                    )}
                                                    {row.orderStatus && (
                                                        <div className="mt-1"><StatusPill status={row.orderStatus} /></div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top">{row.customer || '—'}</td>
                                                <td className="px-4 py-3 align-top">
                                                    <div>{row.driverName || '—'}</div>
                                                    {row.driverPlate && (
                                                        <div className="text-xs text-muted-foreground">{row.driverPlate}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="max-w-[220px] truncate" title={row.fileName}>{row.fileName}</div>
                                                    <div className="text-xs text-muted-foreground">{fileSize(row.fileSize)}</div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div>
                                                        {row.uploadedByCounterparty
                                                            ? `${row.uploadedByCounterparty.name} · по ссылке`
                                                            : personName(row.uploadedBy)}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{date(row.createdAt)}</div>
                                                </td>
                                                <td className="px-4 py-3 align-top">
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Открыть файл"
                                                            onClick={() => openFile(row, 'view')}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label="Скачать файл"
                                                            onClick={() => openFile(row, 'download')}
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {rows.length >= 300 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                        Показаны последние 300 документов. Сузьте период или уточните поиск.
                    </p>
                )}
            </div>
        </div>
    );
}
