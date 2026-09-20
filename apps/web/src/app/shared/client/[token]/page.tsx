'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import dayjs from 'dayjs';
import { ChevronDown, Download, FileText, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import Loader from '@/components/ui/Loader';
import { cn } from '@/lib/utils';

/**
 * Что видит заказчик по постоянной ссылке.
 *
 * Отдельная страница от сверки с перевозчиком, потому что вопрос другой.
 * Перевозчик приходит сверить рейсы и выставить нам счёт; заказчик приходит
 * платить: ему нужны наши счета — какой оплачен, какой ждёт, какой
 * просрочен, — и что в каждом из них.
 *
 * Ссылка постоянная: адрес кладут в закладки и возвращаются, когда собрались
 * платить. Поэтому на странице нет ни срока действия, ни разговора о нём.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const fmt = (n: number) => Math.round(n || 0).toLocaleString('ru-RU');
const money = (n: number, currency = 'KZT') =>
    `${fmt(n)} ${currency === 'KZT' ? '₸' : currency}`;
const дата = (v?: string | null) => (v ? dayjs(v).format('DD.MM.YYYY') : '—');

/** Состояние счёта одним словом и цветом. */
const СОСТОЯНИЕ: Record<string, { label: string; className: string }> = {
    PAID: { label: 'Оплачен', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    PARTIAL: { label: 'Оплачен частично', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    AWAITING: { label: 'Ждёт оплаты', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    OVERDUE: { label: 'Просрочен', className: 'bg-red-50 text-red-700 border-red-200' },
};

const ОПЛАТА_СДЕЛКИ: Record<string, string> = {
    PAID: 'Оплачено',
    PARTIAL: 'Частично',
    UNPAID: 'Не оплачено',
};

function городОт(loc: any): string {
    if (!loc) return '—';
    if (loc.city) return loc.city;
    if (loc.address) {
        const m = loc.address.match(/г\.\s*([^,]+)/);
        return m?.[1]?.trim() || loc.address;
    }
    return '—';
}

function маршрут(order: any): string {
    const точки = order.routePoints || [];
    const погрузка = точки.find((p: any) => p.pointType === 'PICKUP' || p.pointType === 'ADDITIONAL_PICKUP');
    const выгрузки = точки.filter((p: any) => p.pointType === 'DELIVERY');
    const выгрузка = выгрузки.length ? выгрузки[выгрузки.length - 1] : null;
    return `${городОт(погрузка?.location)} → ${городОт(выгрузка?.location)}`;
}

export default function ClientPortalPage() {
    const { token } = useParams() as { token: string };
    const [данные, setДанные] = useState<any>(null);
    const [загрузка, setЗагрузка] = useState(true);
    const [ошибка, setОшибка] = useState('');
    const [раскрыт, setРаскрыт] = useState<string | null>(null);

    // Чек об оплате: файл и сумма по конкретной сделке.
    const [чекПо, setЧекПо] = useState<any>(null);
    const [файл, setФайл] = useState<File | null>(null);
    const [сумма, setСумма] = useState('');
    const [отправка, setОтправка] = useState(false);

    const загрузить = useCallback(async () => {
        try {
            setЗагрузка(true);
            const res = await axios.get(`${API_URL}/public/accounting/client/${token}`);
            setДанные(res.data);
            setОшибка('');
        } catch (e: any) {
            setОшибка(e.response?.data?.message || 'Ссылка недействительна');
        } finally {
            setЗагрузка(false);
        }
    }, [token]);

    useEffect(() => { загрузить(); }, [загрузить]);

    const отправитьЧек = async () => {
        if (!чекПо) return;
        if (!файл) { toast.warning('Приложите файл платёжного поручения'); return; }
        try {
            setОтправка(true);
            const form = new FormData();
            form.append('file', файл);
            form.append('orderId', чекПо.id);
            form.append('kind', 'PAYMENT');
            if (сумма.trim()) form.append('claimedAmount', сумма.trim());
            await axios.post(`${API_URL}/public/payment-proofs/${token}`, form);
            toast.success('Чек отправлен — бухгалтерия сверит его с выпиской');
            setЧекПо(null);
            setФайл(null);
            setСумма('');
            await загрузить();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Не удалось отправить чек');
        } finally {
            setОтправка(false);
        }
    };

    if (загрузка) return <Loader />;

    if (ошибка) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
                <Card className="max-w-md">
                    <CardContent className="p-8 text-center">
                        <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                        <div className="text-base font-semibold">{ошибка}</div>
                        <p className="mt-2 text-sm text-slate-500">
                            Попросите новую ссылку у компании, которая её присылала.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const счета: any[] = данные?.invoices ?? [];
    const сделки: any[] = данные?.orders ?? [];
    const итоги = данные?.totals ?? { invoiced: 0, paid: 0, awaiting: 0, overdue: 0 };

    return (
        <div className="min-h-screen bg-slate-50 py-8">
            <div className="mx-auto w-full max-w-5xl px-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {данные.senderCompany}
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Счета и сделки</h1>
                <p className="mt-1 text-sm text-slate-500">
                    Для {данные.counterpartyName}. Здесь всё, что мы выставили: что уже оплачено,
                    что ждёт оплаты и по каким перевозкам.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[
                        { label: 'Выставлено', value: итоги.invoiced, tone: '' },
                        { label: 'Оплачено', value: итоги.paid, tone: 'text-emerald-600' },
                        { label: 'К оплате', value: итоги.awaiting, tone: '' },
                        { label: 'Просрочено', value: итоги.overdue, tone: 'text-red-600' },
                    ].map((плитка) => (
                        <Card key={плитка.label}>
                            <CardContent className="p-4">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                    {плитка.label}
                                </div>
                                <div className={cn('mt-1 text-xl font-semibold tabular-nums', плитка.tone)}>
                                    {money(плитка.value)}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <h2 className="mt-8 text-base font-semibold">Счета ({счета.length})</h2>
                {счета.length === 0 ? (
                    <Card className="mt-3">
                        <CardContent className="p-8 text-center text-sm text-slate-500">
                            Счетов пока нет. Они появятся здесь, как только мы их выставим.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="mt-3 space-y-3">
                        {счета.map((счёт) => {
                            const вид = СОСТОЯНИЕ[счёт.paymentState] ?? СОСТОЯНИЕ.AWAITING;
                            const открыт = раскрыт === счёт.id;
                            return (
                                <Card key={счёт.id}>
                                    <CardContent className="p-4">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setРаскрыт(открыт ? null : счёт.id)}
                                                className="flex min-w-[220px] flex-1 items-center gap-2 text-left"
                                            >
                                                <ChevronDown
                                                    className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform',
                                                        открыт && 'rotate-180')}
                                                />
                                                <span>
                                                    <span className="font-medium">Счёт № {счёт.number}</span>
                                                    <span className="block text-xs text-slate-500">
                                                        от {дата(счёт.documentDate)}
                                                        {счёт.dueDate ? ` · оплатить до ${дата(счёт.dueDate)}` : ''}
                                                        {счёт.orders?.length
                                                            ? ` · ${счёт.orders.map((o: any) => o.orderNumber).join(', ')}`
                                                            : ''}
                                                    </span>
                                                </span>
                                            </button>

                                            <div className="text-right tabular-nums">
                                                <div className="font-semibold">{money(счёт.total, счёт.currency)}</div>
                                                {счёт.balanceDue > 0 && счёт.amountPaid > 0 && (
                                                    <div className="text-xs text-slate-500">
                                                        осталось {money(счёт.balanceDue, счёт.currency)}
                                                    </div>
                                                )}
                                            </div>

                                            <Badge variant="outline" className={вид.className}>{вид.label}</Badge>

                                            {счёт.shareToken && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => window.open(
                                                        `${API_URL}/public/accounting-documents/${счёт.shareToken}/pdf`,
                                                        '_blank',
                                                    )}
                                                >
                                                    <Download className="mr-1.5 h-4 w-4" />
                                                    Скачать
                                                </Button>
                                            )}
                                        </div>

                                        {открыт && (
                                            <div className="mt-3 overflow-x-auto border-t pt-3">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                                                            <th className="py-1 pr-3 font-medium">Продукция</th>
                                                            <th className="py-1 pr-3 text-right font-medium">Кол-во</th>
                                                            <th className="py-1 pr-3 text-right font-medium">Цена</th>
                                                            <th className="py-1 text-right font-medium">Сумма</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {счёт.lines.map((строка: any) => (
                                                            <tr key={строка.id} className="border-t">
                                                                <td className="py-2 pr-3">
                                                                    {строка.name}
                                                                    {(строка.orderNumber || строка.description) && (
                                                                        <span className="block text-xs text-slate-500">
                                                                            {[строка.orderNumber, строка.description]
                                                                                .filter(Boolean).join(' · ')}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="py-2 pr-3 text-right tabular-nums">
                                                                    {fmt(строка.quantity)} {строка.unit}
                                                                </td>
                                                                <td className="py-2 pr-3 text-right tabular-nums">
                                                                    {money(строка.unitPrice, счёт.currency)}
                                                                </td>
                                                                <td className="py-2 text-right tabular-nums">
                                                                    {money(строка.total, счёт.currency)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}

                <h2 className="mt-8 text-base font-semibold">Перевозки ({сделки.length})</h2>
                {сделки.length === 0 ? (
                    <Card className="mt-3">
                        <CardContent className="p-8 text-center text-sm text-slate-500">
                            Перевозок пока нет.
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="mt-3">
                        <CardContent className="overflow-x-auto p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                                        <th className="px-4 py-2 font-medium">Заявка</th>
                                        <th className="px-4 py-2 font-medium">Маршрут</th>
                                        <th className="px-4 py-2 font-medium">Дата</th>
                                        <th className="px-4 py-2 text-right font-medium">Сумма</th>
                                        <th className="px-4 py-2 font-medium">Оплата</th>
                                        <th className="px-4 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {сделки.map((сделка: any) => (
                                        <tr key={сделка.id} className="border-t">
                                            <td className="px-4 py-2 font-medium">{сделка.orderNumber}</td>
                                            <td className="px-4 py-2">{маршрут(сделка)}</td>
                                            <td className="px-4 py-2 text-slate-500">{дата(сделка.createdAt)}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">
                                                {money(сделка.amount ?? 0)}
                                            </td>
                                            <td className="px-4 py-2">
                                                {ОПЛАТА_СДЕЛКИ[сделка.paymentState] ?? '—'}
                                                {сделка.paymentProofs?.length > 0 && (
                                                    <span className="block text-xs text-slate-400">
                                                        чек отправлен
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => { setЧекПо(сделка); setФайл(null); setСумма(''); }}
                                                >
                                                    <Paperclip className="mr-1.5 h-4 w-4" />
                                                    Чек
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                )}

                {чекПо && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={() => setЧекПо(null)}
                    >
                        <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                            <CardContent className="p-5">
                                <div className="text-base font-semibold">
                                    Чек по заявке {чекПо.orderNumber}
                                </div>
                                <p className="mt-1 text-sm text-slate-500">
                                    Платёж мы проведём после сверки с банковской выпиской — чек сам
                                    по себе оплату не закрывает.
                                </p>

                                <div className="mt-4 space-y-3">
                                    <div>
                                        <div className="mb-1 text-xs font-medium text-slate-600">
                                            Платёжное поручение (PDF или фото)
                                        </div>
                                        <Input
                                            type="file"
                                            accept=".pdf,image/*"
                                            onChange={(e) => setФайл(e.target.files?.[0] ?? null)}
                                        />
                                    </div>
                                    <div>
                                        <div className="mb-1 text-xs font-medium text-slate-600">
                                            Сумма платежа, ₸ (необязательно)
                                        </div>
                                        <Input
                                            inputMode="decimal"
                                            value={сумма}
                                            onChange={(e) => setСумма(e.target.value)}
                                            placeholder="например, 450000"
                                        />
                                    </div>
                                </div>

                                <div className="mt-5 flex justify-end gap-2">
                                    <Button variant="ghost" onClick={() => setЧекПо(null)}>Отмена</Button>
                                    <Button disabled={отправка} onClick={отправитьЧек}>
                                        {отправка ? 'Отправляем…' : 'Отправить'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
