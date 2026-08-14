'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, FileText, Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { loadOrReport } from '@/lib/load';
import { QUOTE_REQUEST_STATUS_LABELS } from '@/lib/vocabulary';
import { PALLET_KINDS } from '@/lib/cargo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PickerOption } from './RecordPicker';
import { CityOption } from './CityPicker';
import { QuoteFormDialog, QuoteFormValues } from './QuoteFormDialog';

const STATUS_STYLE: Record<string, string> = {
    NEW: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

const money = (v: any) => (v == null ? '—' : `${Math.round(Number(v)).toLocaleString('ru-RU')} ₸`);
const tons = (kg: number | null) => (kg == null ? '—' : `${(kg / 1000).toLocaleString('ru-RU')} т`);
const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');

/**
 * Маршрут строкой.
 *
 * Название берём то, что написал человек, а справочник — запасной вариант:
 * у города, вписанного руками, связи со справочником нет вовсе, и запрос
 * на Мынарал показывал бы стрелку без концов.
 */
const routeOf = (r: any) =>
    `${r?.originCityName || r?.originCity?.name || '—'} → ${r?.destinationCityName || r?.destinationCity?.name || '—'}`;

/**
 * Паллеты одной строкой: «2 европаллета».
 *
 * Количество без вида не говорит, влезет ли груз: европаллет и
 * американский отличаются на треть площади. Поэтому если названо только
 * число — так и пишем, а вид без числа не показываем вовсе.
 */
const palletsText = (r: any): string | null => {
    if (!r?.palletCount) return null;
    const kind = PALLET_KINDS.find((k) => k.key === r.palletKind);
    const name = kind ? kind.label.replace(/\s*\(.*\)$/, '').toLowerCase() : 'паллет';
    return `${r.palletCount} ${name}`;
};

/**
 * Список запросов на расчёт.
 *
 * Используется в двух местах и намеренно одним компонентом: вкладкой в
 * карточке контрагента (там клиент уже известен и не выбирается) и общим
 * списком по всем клиентам. Две копии разошлись бы через месяц.
 */
export function QuoteRequestsPanel({ customerCompanyId }: { customerCompanyId?: string }) {
    const router = useRouter();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState<PickerOption[]>([]);
    const [cities, setCities] = useState<CityOption[]>([]);

    const [formOpen, setFormOpen] = useState(false);
    const [formInitial, setFormInitial] = useState<Partial<QuoteFormValues> | null>(null);
    const [detail, setDetail] = useState<any | null>(null);
    const [rejecting, setRejecting] = useState<any | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams({ limit: '200' });
        if (customerCompanyId) params.set('customerCompanyId', customerCompanyId);
        if (status !== 'all') params.set('status', status);
        if (search.trim()) params.set('search', search.trim());

        const res = await loadOrReport(
            'запросы на расчёт',
            () => api.get(`/quote-requests?${params.toString()}`),
        );
        setItems(res?.data?.data || []);
        setLoading(false);
    }, [customerCompanyId, status, search]);

    useEffect(() => {
        const timer = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(timer);
    }, [load, search]);

    // Справочники нужны только для формы, поэтому грузятся один раз и молча.
    //
    // Контрагенты лежат в двух местах, и это не случайность: «партнёры» —
    // компании, зарегистрированные в системе, «внешние» — заведённые вручную
    // карточки тех, кто в системе не работает. Страница контрагентов
    // складывает оба списка, и здесь надо так же — иначе половина клиентов
    // в выборе просто не появится.
    useEffect(() => {
        Promise.all([
            api.get('/partners').catch(() => ({ data: [] })),
            api.get('/external-companies').catch(() => ({ data: [] })),
        ]).then(([partners, external]) => {
            const toOption = (p: any): PickerOption => ({
                id: p.id,
                label: p.name || 'Без названия',
                hint: p.bin || null,
            });
            const all = [
                ...(Array.isArray(partners.data) ? partners.data : []),
                ...(Array.isArray(external.data) ? external.data : []),
            ].map(toOption).filter((p) => p.id);
            setCustomers(all);
        });

        api.get('/cities').then((r) => {
            const list = Array.isArray(r.data) ? r.data : r.data?.data || [];
            setCities(list.map((c: any) => ({
                id: c.id,
                name: c.name,
                hint: [c.region?.name, c.country?.name].filter(Boolean).join(', ') || null,
            })));
        }).catch(() => setCities([]));
    }, []);

    const counts = useMemo(() => ({
        all: items.length,
        NEW: items.filter((i) => i.status === 'NEW').length,
        IN_PROGRESS: items.filter((i) => i.status === 'IN_PROGRESS').length,
    }), [items]);

    const act = async (id: string, path: string, body?: any, okText?: string) => {
        setBusy(true);
        try {
            const res = await api.post(`/quote-requests/${id}/${path}`, body || {});

            // Согласование теперь заводит рейс. Человек должен увидеть, что
            // именно произошло: номер заявки, если она создалась, или почему
            // не создалась. Молчаливое «Готово» здесь врёт — менеджер решит,
            // что заявка есть, и не станет её заводить.
            const data = res?.data || {};
            if (path === 'approve' && data.orderCreated === false) {
                toast.warning(data.orderNotCreatedReason || 'Согласовано, но заявка не создана', {
                    duration: 8000,
                });
            } else if (path === 'approve' && data.order?.orderNumber) {
                toast.success(`Согласовано. Создана заявка №${data.order.orderNumber}`);
            } else {
                toast.success(okText || 'Готово');
            }
            setDetail(null);
            setRejecting(null);
            setReason('');
            await load();
        } catch (e: any) {
            const message = e?.response?.data?.message;
            toast.error(Array.isArray(message) ? message[0] : message || 'Не получилось');
        } finally {
            setBusy(false);
        }
    };

    const openEdit = (r: any) => {
        setFormInitial({
            id: r.id,
            customerCompanyId: r.customerCompanyId,
            originCityId: r.originCityId || '',
            originCityName: r.originCityName || r.originCity?.name || '',
            destinationCityId: r.destinationCityId || '',
            destinationCityName: r.destinationCityName || r.destinationCity?.name || '',
            originAddress: r.originAddress || '',
            destinationAddress: r.destinationAddress || '',
            readyDate: r.readyDate ? String(r.readyDate).slice(0, 10) : '',
            natureOfCargo: r.natureOfCargo || '',
            cargoDescription: r.cargoDescription || '',
            cargoType: r.cargoType || '',
            cargoWeightTons: r.cargoWeight != null ? String(r.cargoWeight / 1000) : '',
            cargoVolume: r.cargoVolume != null ? String(r.cargoVolume) : '',
            palletKind: r.palletKind || '',
            palletCount: r.palletCount != null ? String(r.palletCount) : '',
            carrierCost: r.carrierCost != null ? String(Math.round(Number(r.carrierCost))) : '',
            customerPrice: r.customerPrice != null ? String(Math.round(Number(r.customerPrice))) : '',
            notes: r.notes || '',
        });
        setDetail(null);
        setFormOpen(true);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    {[
                        ['all', `Все (${counts.all})`],
                        ['NEW', `Новые (${counts.NEW})`],
                        ['IN_PROGRESS', `В работе (${counts.IN_PROGRESS})`],
                        ['APPROVED', 'Согласованные'],
                        ['REJECTED', 'Не согласованные'],
                    ].map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setStatus(value)}
                            className={cn(
                                'rounded-full px-3 py-1 text-[12px] transition-colors',
                                status === value ? 'bg-foreground text-background' : 'bg-muted hover:bg-muted/70',
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-40" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Номер, город, груз"
                            className="h-9 w-56 pl-9 text-[13px]"
                        />
                    </div>
                    <Button size="sm" onClick={() => { setFormInitial(null); setFormOpen(true); }}>
                        <Plus className="h-4 w-4" />
                        Новый запрос
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-2xl shadow-soft">
                <table className="w-full min-w-[880px] border-collapse text-[13px]">
                    <thead>
                        <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                            <Th>Номер</Th>
                            <Th>Дата</Th>
                            {!customerCompanyId && <Th>Клиент</Th>}
                            <Th>Маршрут</Th>
                            <Th>Груз</Th>
                            <Th align="right">Машина</Th>
                            <Th align="right">Клиенту</Th>
                            <Th align="right">Маржа</Th>
                            <Th>Статус</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Загружаем…</td></tr>
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="px-4 py-10 text-center">
                                    <p className="text-[13px] font-medium">Запросов пока нет</p>
                                    <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
                                        Запрос — это когда клиент спрашивает цену до заявки. Заведите его здесь,
                                        и в следующий раз система напомнит, что вы предлагали и чем это кончилось.
                                    </p>
                                </td>
                            </tr>
                        ) : items.map((r) => {
                            const margin = r.carrierCost != null && r.customerPrice != null
                                ? Number(r.customerPrice) - Number(r.carrierCost)
                                : null;
                            return (
                                <tr
                                    key={r.id}
                                    onClick={() => setDetail(r)}
                                    className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                                >
                                    <Td className="font-medium">{r.requestNumber}</Td>
                                    <Td className="text-muted-foreground">{date(r.createdAt)}</Td>
                                    {!customerCompanyId && <Td className="max-w-[220px] truncate">{r.customerCompany?.name}</Td>}
                                    <Td>{routeOf(r)}</Td>
                                    <Td className="text-muted-foreground">
                                        {[tons(r.cargoWeight), r.cargoVolume ? `${r.cargoVolume} м³` : null, palletsText(r), r.cargoType]
                                            .filter((v) => v && v !== '—').join(' · ') || '—'}
                                    </Td>
                                    <Td align="right" className="tabular-nums">{money(r.carrierCost)}</Td>
                                    <Td align="right" className="tabular-nums font-medium">{money(r.customerPrice)}</Td>
                                    <Td align="right" className={cn('tabular-nums', margin != null && (margin >= 0 ? 'text-emerald-600' : 'text-red-600'))}>
                                        {margin == null ? '—' : `${margin.toLocaleString('ru-RU')} ₸`}
                                    </Td>
                                    <Td>
                                        <span className={cn('rounded-full px-2 py-0.5 text-[11px]', STATUS_STYLE[r.status])}>
                                            {QUOTE_REQUEST_STATUS_LABELS[r.status] || r.status}
                                        </span>
                                    </Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <QuoteFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                customers={customers}
                cities={cities}
                initial={formInitial}
                onCityImported={(city) => setCities((prev) =>
                    prev.some((c) => c.id === city.id) ? prev : [...prev, city])}
                lockedCustomerId={customerCompanyId}
                onSaved={load}
            />

            {/* Карточка запроса с решениями */}
            <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
                <DialogContent className="max-w-2xl">
                    {detail && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-[15px]">
                                    {detail.requestNumber}
                                    <span className={cn('rounded-full px-2 py-0.5 text-[11px]', STATUS_STYLE[detail.status])}>
                                        {QUOTE_REQUEST_STATUS_LABELS[detail.status] || detail.status}
                                    </span>
                                </DialogTitle>
                            </DialogHeader>

                            <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                                <Row label="Клиент" value={detail.customerCompany?.name} />
                                <Row label="Маршрут" value={routeOf(detail)} />
                                <Row label="Адрес погрузки" value={detail.originLocation?.address || detail.originAddress} />
                                <Row label="Адрес выгрузки" value={detail.destinationLocation?.address || detail.destinationAddress} />
                                <Row label="Груз готов" value={detail.readyDate ? date(detail.readyDate) : null} />
                                <Row label="Характер груза" value={detail.natureOfCargo} />
                                <Row label="Вес" value={detail.cargoWeight != null ? tons(detail.cargoWeight) : null} />
                                <Row label="Объём" value={detail.cargoVolume ? `${detail.cargoVolume} м³` : null} />
                                <Row label="Паллеты" value={palletsText(detail)} />
                                <Row label="Тип кузова" value={detail.cargoType} />
                                <Row label="Что везём" value={detail.cargoDescription} />
                                <Row label="Нашли машину за" value={money(detail.carrierCost)} />
                                <Row label="Предложили клиенту" value={money(detail.customerPrice)} />
                                <Row label="Заметка" value={detail.notes} />
                                {detail.rejectionReason && <Row label="Причина отказа" value={detail.rejectionReason} />}
                                {detail.order && <Row label="Заявка" value={detail.order.orderNumber} />}
                            </dl>

                            <div className="flex flex-wrap justify-end gap-2 pt-2">
                                <Button variant="outline" size="sm" onClick={() => openEdit(detail)}>
                                    <FileText className="h-4 w-4" />
                                    Изменить
                                </Button>

                                {(detail.status === 'APPROVED' || detail.status === 'REJECTED') && !detail.orderId && (
                                    <Button variant="outline" size="sm" disabled={busy}
                                        onClick={() => act(detail.id, 'reopen', {}, 'Запрос вернулся в работу')}>
                                        <RotateCcw className="h-4 w-4" />
                                        Вернуть в работу
                                    </Button>
                                )}

                                {detail.status !== 'APPROVED' && detail.status !== 'REJECTED' && (
                                    <>
                                        <Button variant="outline" size="sm" className="text-destructive"
                                            onClick={() => { setRejecting(detail); setReason(''); }}>
                                            <X className="h-4 w-4" />
                                            Не согласовал
                                        </Button>
                                        <Button size="sm" disabled={busy}
                                            onClick={() => act(detail.id, 'approve', {}, 'Клиент согласовал — можно оформлять заявку')}>
                                            <Check className="h-4 w-4" />
                                            Согласовал
                                        </Button>
                                    </>
                                )}

                                {detail.status === 'APPROVED' && !detail.orderId && (
                                    <Button size="sm" onClick={() => router.push(`/company/orders/create?quoteRequestId=${detail.id}`)}>
                                        Оформить заявку
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Отказ — только с причиной: без неё запись бесполезна */}
            <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">Клиент не согласовал</DialogTitle>
                    </DialogHeader>
                    <p className="text-[12px] text-muted-foreground">
                        Причина нужна обязательно. Через две недели «дорого» и «нашли машину раньше»
                        приведут к разным решениям, а вспомнить будет уже некому.
                    </p>
                    <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Например: дорого, нашли за 120"
                        className="h-9 text-[13px]"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRejecting(null)}>Отмена</Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy || !reason.trim()}
                            onClick={() => act(rejecting.id, 'reject', { reason }, 'Отказ записан')}
                        >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            Записать отказ
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
    return <th className={cn('px-3 py-2 font-medium', align === 'right' ? 'text-right' : 'text-left')}>{children}</th>;
}

function Td({ children, align, className }: { children: React.ReactNode; align?: 'right'; className?: string }) {
    return <td className={cn('px-3 py-2', align === 'right' ? 'text-right' : 'text-left', className)}>{children}</td>;
}

function Row({ label, value }: { label: string; value?: string | null }) {
    if (!value || value === '—') return null;
    return (
        <div className="flex flex-col">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-[13px]">{value}</dd>
        </div>
    );
}
