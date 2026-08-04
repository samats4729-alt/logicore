'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Inbox, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    IncomingDeliveredDocument,
    fetchIncomingDelivered,
    reviewIncomingDocument,
} from '@/lib/accounting-documents';
import { money } from '@/lib/money-format';
import { cn } from '@/lib/utils';

/**
 * Документы, присланные контрагентами прямо на платформе.
 *
 * Раньше счёт от компании, которая тоже работает в LogiCore, приходилось
 * заводить руками: один документ существовал дважды, с разными номерами и
 * суммами, набранными на слух. Здесь это тот же самый документ, а не копия —
 * поэтому его нельзя править, можно только принять или отклонить с причиной.
 */

const TYPE_LABEL: Record<string, string> = {
    PAYMENT_INVOICE: 'Счёт на оплату',
    SERVICE_ACT: 'Акт выполненных работ',
    RECONCILIATION_ACT: 'Акт сверки',
    CORRECTION: 'Корректировка',
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('ru-RU');

export default function IncomingDocumentsPage() {
    const router = useRouter();
    const [documents, setDocuments] = useState<IncomingDeliveredDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [rejecting, setRejecting] = useState<string | null>(null);
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setDocuments(await fetchIncomingDelivered());
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось загрузить входящие');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const accept = async (id: string) => {
        try {
            await reviewIncomingDocument(id, 'ACCEPTED');
            toast.success('Документ принят');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось принять');
        }
    };

    const reject = async (id: string) => {
        if (!reason.trim()) {
            toast.warning('Напишите, что не так — контрагенту нужно знать, что исправить');
            return;
        }
        try {
            await reviewIncomingDocument(id, 'REJECTED', reason.trim());
            toast.success('Документ отклонён');
            setRejecting(null);
            setReason('');
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось отклонить');
        }
    };

    const pending = documents.filter((d) => !d.receiptStatus);
    const reviewed = documents.filter((d) => d.receiptStatus);

    const renderCard = (doc: IncomingDeliveredDocument) => (
        <Card key={doc.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-[240px] flex-1">
                    <button
                        onClick={() => router.push(`/company/accounting/invoices/${doc.id}`)}
                        className="text-left font-medium hover:underline"
                    >
                        {TYPE_LABEL[doc.type] || doc.type} № {doc.number}
                    </button>
                    <div className="text-xs text-muted-foreground">
                        от {doc.company.name}
                        {doc.company.bin ? ` · БИН ${doc.company.bin}` : ''}
                        {' · '}{formatDate(doc.documentDate)}
                    </div>
                    {doc.receiptStatus === 'REJECTED' && doc.receiptReason && (
                        <div className="mt-1 text-xs text-red-600">Отклонён: {doc.receiptReason}</div>
                    )}
                </div>

                <div className="text-right tabular-nums">
                    <div className="font-semibold">{money(doc.total, doc.currency)}</div>
                    {doc.dueDate && (
                        <div className="text-xs text-muted-foreground">оплатить до {formatDate(doc.dueDate)}</div>
                    )}
                </div>

                {doc.receiptStatus ? (
                    <Badge
                        variant="outline"
                        className={cn(doc.receiptStatus === 'ACCEPTED' ? 'text-emerald-600' : 'text-red-600')}
                    >
                        {doc.receiptStatus === 'ACCEPTED' ? 'Принят' : 'Отклонён'}
                    </Badge>
                ) : rejecting === doc.id ? (
                    <div className="flex w-full items-center gap-2">
                        <Input
                            autoFocus
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Что исправить: сумма не совпадает с актом, не тот рейс…"
                            maxLength={300}
                        />
                        <Button variant="destructive" size="sm" onClick={() => reject(doc.id)}>
                            Отклонить
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setRejecting(null); setReason(''); }}
                        >
                            Отмена
                        </Button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => accept(doc.id)}>
                            <Check className="mr-1.5 h-4 w-4" />
                            Принять
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setRejecting(doc.id)}>
                            <X className="mr-1.5 h-4 w-4" />
                            Отклонить
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
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

            <h1 className="text-2xl font-semibold tracking-tight">Входящие документы</h1>
            <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
                Документы, которые контрагенты прислали прямо на платформе. Это тот же самый документ,
                что у отправителя, — не копия: номер и суммы у обеих сторон одни и те же, и спорить,
                чей вариант правильный, не приходится. Поэтому править его нельзя — можно принять или
                отклонить с причиной, и контрагент увидит, что исправить.
            </p>

            {loading ? (
                <p className="mt-6 text-sm text-muted-foreground">Загружаем…</p>
            ) : documents.length === 0 ? (
                <Card className="mt-5">
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        <Inbox className="mx-auto mb-3 h-8 w-8 opacity-40" />
                        Пока никто ничего не присылал. Документы появятся здесь, когда контрагент,
                        работающий в LogiCore, отправит вам счёт или акт.
                    </CardContent>
                </Card>
            ) : (
                <>
                    {pending.length > 0 && (
                        <>
                            <h2 className="mt-6 text-base font-semibold">Ждут решения ({pending.length})</h2>
                            <div className="mt-3 space-y-3">{pending.map(renderCard)}</div>
                        </>
                    )}
                    {reviewed.length > 0 && (
                        <>
                            <h2 className="mt-7 text-base font-semibold">Рассмотренные</h2>
                            <div className="mt-3 space-y-3">{reviewed.map(renderCard)}</div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
