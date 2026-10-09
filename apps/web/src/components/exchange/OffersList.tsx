'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, Loader2, Phone, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { moneyShort } from '@/lib/money-format';
import { ExchangeOffer, вКавычках, день, телефонКрасиво, тонн, ответСервера } from '@/lib/exchange';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Кто откликнулся — словами: это решает, кто будет перевозчиком по документам. */
function whoIs(o: ExchangeOffer): string {
    if (o.kind === 'COMPANY') return o.company?.bin ? `перевозчик · БИН ${o.company.bin}` : 'перевозчик';
    if (o.kind === 'DRIVER_IP') return o.driver?.ipName ? `водитель, свой ИП · ${o.driver.ipName}` : 'водитель, свой ИП';
    return `водитель через парк ${вКавычках(o.driver?.parkName)}`;
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
export default function OffersList({ orderId, onAccepted }: { orderId: string; onAccepted: () => void }) {
    const [offers, setOffers] = useState<ExchangeOffer[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [chosen, setChosen] = useState<ExchangeOffer | null>(null);
    const [saving, setSaving] = useState(false);

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

    return (
        <div className="space-y-2">
            <div className="text-[13px] font-semibold text-foreground">Отклики · {active.length}</div>
            <ul className="m-0 list-none divide-y divide-border rounded-xl border border-solid border-border p-0">
                {active.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1 text-[13px]">
                            <div className="font-semibold">{o.name}</div>
                            <div className="text-[12px] text-muted-foreground">{whoIs(o)}</div>
                            {o.driver && (
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px]">
                                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                                    {[o.driver.vehiclePlate, o.driver.vehicleBodyType, тонн(o.driver.vehicleCapacityKg)].filter(Boolean).join(' · ') || 'машина не указана'}
                                    <span className="text-muted-foreground">· довёз рейсов: {o.driver.tripsCompleted}</span>
                                </div>
                            )}
                            <div className="mt-1 text-[12px] text-muted-foreground">
                                {o.readyDate ? `подаст машину ${день(o.readyDate)}` : 'дата подачи не указана'}
                                {` · откликнулся ${dayjs(o.createdAt).format('DD.MM HH:mm')}`}
                            </div>
                            {o.comment && <div className="mt-1 whitespace-pre-wrap text-[12px]">«{o.comment}»</div>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <div className="text-right">
                                <div className="text-[15px] font-bold tabular-nums">{moneyShort(o.price)}</div>
                                <div className="text-[11px] text-muted-foreground">{o.agreed ? 'согласен на вашу цену' : 'своя цена'}</div>
                            </div>
                            <div className="flex gap-1.5">
                                {o.phone && (
                                    <a
                                        href={`tel:${o.phone}`}
                                        aria-label={`Позвонить ${телефонКрасиво(o.phone)}`}
                                        className="inline-flex h-8 items-center gap-1 rounded-xl border border-solid border-border bg-background px-2.5 text-[12px] text-foreground no-underline hover:bg-muted/50"
                                    >
                                        <Phone className="h-3.5 w-3.5" /> <span className="tabular-nums">{телефонКрасиво(o.phone)}</span>
                                    </a>
                                )}
                                <Button size="sm" onClick={() => setChosen(o)}>
                                    <Check className="h-3.5 w-3.5" /> Выбрать
                                </Button>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>

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
