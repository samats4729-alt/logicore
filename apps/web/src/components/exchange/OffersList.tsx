'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, Loader2, Phone, Search, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { ExchangeOffer, вКавычках, день, телефонКрасиво, тонн, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Сколько откликов показывать за раз — остальные «Показать ещё». */
const PAGE = 50;

type KindKey = 'ALL' | ExchangeOffer['kind'];
const KIND_FILTERS: { key: KindKey; label: string }[] = [
    { key: 'ALL', label: 'Все' },
    { key: 'DRIVER_PARK', label: 'Водители парков' },
    { key: 'DRIVER_IP', label: 'Водители с ИП' },
    { key: 'COMPANY', label: 'Перевозчики' },
];

/** Порядок: обычно решает цена, но иногда важнее подача или опыт. */
const SORTS = {
    price: { label: 'Сначала дешевле', compare: (a: ExchangeOffer, b: ExchangeOffer) => a.price - b.price || a.createdAt.localeCompare(b.createdAt) },
    fresh: { label: 'Сначала новые', compare: (a: ExchangeOffer, b: ExchangeOffer) => b.createdAt.localeCompare(a.createdAt) },
    trips: { label: 'Больше рейсов', compare: (a: ExchangeOffer, b: ExchangeOffer) => (b.driver?.tripsCompleted ?? 0) - (a.driver?.tripsCompleted ?? 0) || a.price - b.price },
    ready: { label: 'Раньше подача', compare: (a: ExchangeOffer, b: ExchangeOffer) => (a.readyDate ?? '9999').localeCompare(b.readyDate ?? '9999') || a.price - b.price },
};
type SortKey = keyof typeof SORTS;

/** Кто откликнулся — словами: это решает, кто будет перевозчиком по документам. */
function whoIs(o: ExchangeOffer): string {
    if (o.kind === 'COMPANY') return o.company?.bin ? `перевозчик · БИН ${o.company.bin}` : 'перевозчик';
    if (o.kind === 'DRIVER_IP') return o.driver?.ipName ? `водитель, свой ИП · ${o.driver.ipName}` : 'водитель, свой ИП';
    // Цена водителя парка — полная: с налогами за водителя, топливом и комиссиями (12.10.2026).
    return `водитель через парк ${вКавычках(o.driver?.parkName)} · цена с налогами и топливом`;
}

/** Что будет после выбора — для вопроса перед необратимым. */
function afterChoice(o: ExchangeOffer): string {
    if (o.kind === 'COMPANY') return `${o.name} станет перевозчиком заявки со своей ценой: увидит её у себя и назначит водителя.`;
    if (o.kind === 'DRIVER_PARK') return `${o.name} станет водителем рейса, перевозчиком по документам будет парк ${вКавычках(o.driver?.parkName)}. Водитель увидит адреса и начнёт рейс в приложении.`;
    return `${o.name} станет водителем рейса и сам себе перевозчиком (свой ИП). Водитель увидит адреса и начнёт рейс в приложении.`;
}

/**
 * Отклики на заявку с биржи и выбор исполнителя.
 *
 * Дешевле — выше, но решает человек: рядом с ценой видно, кто это, на чём
 * едет, сколько рейсов довёз и когда подаст машину. Выбор — с вопросом:
 * он необратим, остальным откликнувшимся уйдёт «выбрали другого».
 */
export default function OffersList({ orderId, onAccepted, newSince = null }: {
    orderId: string;
    onAccepted: () => void;
    /** Отклики новее этой отметки подсвечены как новые; '' — все, null — никакие. */
    newSince?: string | null;
}) {
    const [offers, setOffers] = useState<ExchangeOffer[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [chosen, setChosen] = useState<ExchangeOffer | null>(null);
    const [saving, setSaving] = useState(false);
    const [kind, setKind] = useState<KindKey>('ALL');
    const [sort, setSort] = useState<SortKey>('price');
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(PAGE);

    const load = useCallback(() => {
        setFailed(false);
        api.get(`/exchange/orders/${orderId}/offers`).then((r) => setOffers(r.data)).catch(() => setFailed(true));
    }, [orderId]);

    useEffect(() => { load(); }, [load]);

    const accept = async () => {
        if (!chosen) return;
        setSaving(true);
        try {
            await api.post(`/exchange/orders/${orderId}/offers/${chosen.id}/accept`);
            toast.success(`Исполнитель выбран: ${chosen.name}`);
            setChosen(null);
            onAccepted();
        } catch (e) {
            toast.error(ответСервера(e, 'Не удалось выбрать исполнителя'));
            load();
        } finally {
            setSaving(false);
        }
    };

    if (failed) return <p className="m-0 text-[12px] text-muted-foreground">Не удалось загрузить отклики — обновите страницу.</p>;
    if (!offers) return <div className="h-12 animate-pulse rounded-lg bg-muted/60" aria-label="Загрузка откликов" />;
    const active = offers.filter((o) => o.status === 'ACTIVE');
    if (!active.length) {
        return (
            <p className="m-0 text-[12px] text-muted-foreground">
                Откликов пока нет. Как только перевозчик или водитель откликнется, он появится здесь — с ценой и машиной.
            </p>
        );
    }

    const cheapest = Math.min(...active.map((o) => o.price));
    const kinds = KIND_FILTERS.filter((k) => k.key === 'ALL' || active.some((o) => o.kind === k.key));
    const needle = query.trim().toLowerCase();
    const shown = active
        .filter((o) => kind === 'ALL' || o.kind === kind)
        .filter((o) => !needle || [o.name, o.driver?.vehiclePlate, o.company?.bin, o.driver?.parkName].some((v) => (v ?? '').toLowerCase().includes(needle)))
        .sort(SORTS[sort].compare);
    const page = shown.slice(0, limit);

    return (
        <div className="space-y-2">
            {/* Откликов может быть десятки: тип, порядок и поиск — над таблицей (владелец, 15.10.2026). */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="mr-1 text-[13px] font-semibold text-foreground">Отклики · {active.length}</div>
                {kinds.length > 2 && kinds.map((k) => {
                    const count = k.key === 'ALL' ? active.length : active.filter((o) => o.kind === k.key).length;
                    return (
                        <button
                            key={k.key}
                            type="button"
                            onClick={() => { setKind(k.key); setLimit(PAGE); }}
                            aria-pressed={kind === k.key}
                            className={`h-7 rounded-full border border-solid px-3 text-[12px] [font-family:inherit] ${kind === k.key ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-muted/60'}`}
                        >
                            {k.label} · {count}
                        </button>
                    );
                })}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {active.length > 6 && (
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                aria-label="Найти отклик"
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
                                placeholder="Имя, госномер, БИН"
                                className="h-8 w-52 pl-8 text-[13px]"
                            />
                        </div>
                    )}
                    <select
                        aria-label="Порядок откликов"
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortKey)}
                        className="h-8 rounded-xl border border-solid border-input bg-background px-3 text-[13px] [font-family:inherit]"
                    >
                        {(Object.keys(SORTS) as SortKey[]).map((k) => <option key={k} value={k}>{SORTS[k].label}</option>)}
                    </select>
                </div>
            </div>

            {!shown.length ? (
                <p className="m-0 rounded-xl border border-solid border-border px-3 py-4 text-center text-[12.5px] text-muted-foreground">
                    Под этот фильтр откликов нет.{' '}
                    <button type="button" className="border-0 bg-transparent p-0 text-foreground underline [font-family:inherit]" onClick={() => { setKind('ALL'); setQuery(''); }}>
                        Показать все
                    </button>
                </p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-solid border-border">
                    <Table className="border-collapse text-[13px]">
                        <TableHeader>
                            <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                <TableHead className="h-9 text-[12px]">Исполнитель</TableHead>
                                <TableHead className="h-9 text-[12px]">Машина</TableHead>
                                <TableHead className="h-9 text-right text-[12px]">Рейсов</TableHead>
                                <TableHead className="h-9 text-[12px]">Подача</TableHead>
                                <TableHead className="h-9 text-[12px]">Откликнулся</TableHead>
                                <TableHead className="h-9 text-right text-[12px]">Цена</TableHead>
                                <TableHead className="h-9 w-[1%]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {page.map((o) => (
                                <TableRow
                                    key={o.id}
                                    className={`border-0 border-b border-solid border-border align-top last:border-b-0 ${newSince !== null && (newSince === '' || o.createdAt > newSince) ? 'bg-[var(--nova-accent-soft,#eef4ff)]' : ''}`}
                                >
                                    <TableCell className="max-w-[360px] py-2.5">
                                        <div className="flex items-center gap-2 font-semibold">
                                            {o.name}
                                            {newSince !== null && (newSince === '' || o.createdAt > newSince) && (
                                                <span className="rounded-full bg-foreground px-1.5 py-px text-[10.5px] font-semibold text-background">новый</span>
                                            )}
                                        </div>
                                        <div className="text-[12px] text-muted-foreground">{whoIs(o)}</div>
                                        {o.comment && <div className="mt-0.5 truncate text-[12px]" title={o.comment}>«{o.comment}»</div>}
                                    </TableCell>
                                    <TableCell className="py-2.5 text-[12.5px]">
                                        {o.driver ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Truck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                {[o.driver.vehiclePlate, o.driver.vehicleBodyType, тонн(o.driver.vehicleCapacityKg)].filter(Boolean).join(' · ') || 'не указана'}
                                            </span>
                                        ) : <span className="text-muted-foreground">своя у перевозчика</span>}
                                    </TableCell>
                                    <TableCell className="py-2.5 text-right tabular-nums">{o.driver ? o.driver.tripsCompleted : '—'}</TableCell>
                                    <TableCell className="whitespace-nowrap py-2.5 text-[12.5px]">{o.readyDate ? день(o.readyDate) : <span className="text-muted-foreground">не указана</span>}</TableCell>
                                    <TableCell className="whitespace-nowrap py-2.5 text-[12.5px] text-muted-foreground">{dayjs(o.createdAt).format('DD.MM HH:mm')}</TableCell>
                                    <TableCell className="whitespace-nowrap py-2.5 text-right">
                                        <div className="text-[14px] font-bold tabular-nums">{moneyShort(o.price)}</div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {o.price === cheapest && active.length > 1 ? 'дешевле всех · ' : ''}{o.agreed ? 'на вашу цену' : 'своя цена'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-2">
                                        <div className="flex justify-end gap-1.5">
                                            {o.phone && (
                                                <a
                                                    href={`tel:${o.phone}`}
                                                    aria-label={`Позвонить ${телефонКрасиво(o.phone)}`}
                                                    title={телефонКрасиво(o.phone)}
                                                    className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-xl border border-solid border-border bg-background px-2.5 text-[12px] text-foreground no-underline hover:bg-muted/50"
                                                >
                                                    <Phone className="h-3.5 w-3.5" /> <span className="tabular-nums">{телефонКрасиво(o.phone)}</span>
                                                </a>
                                            )}
                                            <Button size="sm" onClick={() => setChosen(o)}>
                                                <Check className="h-3.5 w-3.5" /> Выбрать
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            {shown.length > page.length && (
                <div className="flex items-center justify-center gap-3 text-[12.5px] text-muted-foreground">
                    Показано {page.length} из {shown.length}
                    <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>Показать ещё</Button>
                </div>
            )}

            <Dialog open={!!chosen} onOpenChange={(open) => { if (!open) setChosen(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-[15px]">
                            Выбрать {chosen?.name} за {chosen ? moneyShort(chosen.price) : ''}?
                        </DialogTitle>
                    </DialogHeader>
                    {chosen && (
                        <div className="space-y-2 text-[13px] text-muted-foreground">
                            <p className="m-0">{afterChoice(chosen)}</p>
                            <p className="m-0">Заявка уйдёт с биржи, остальным откликнувшимся придёт «выбрали другого». Отменить выбор здесь нельзя.</p>
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setChosen(null)}>Отмена</Button>
                        <Button onClick={accept} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Выбрать исполнителем
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
