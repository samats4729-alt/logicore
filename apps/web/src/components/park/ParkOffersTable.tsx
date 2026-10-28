'use client';

import dayjs from 'dayjs';
import { ArrowRight } from 'lucide-react';
import { moneyShort } from '@/lib/money-format';
import { ParkOffer, день } from '@/lib/exchange';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/ui/StatusPill';

/** Решение компании по отклику — цветом существующих пилюль. */
const STATUS: Record<ParkOffer['status'], { pill: string; label: string }> = {
    ACTIVE: { pill: 'PENDING', label: 'Ждёт решения' },
    ACCEPTED: { pill: 'APPROVED', label: 'Водитель выбран' },
    REJECTED: { pill: 'REJECTED', label: 'Не выбран' },
    WITHDRAWN: { pill: 'DRAFT', label: 'Отозван водителем' },
};

const когда = (d: string) => dayjs(d).format('DD.MM HH:mm');

/**
 * Отклики водителей парка на бирже (владелец, 29.10.2026). Рейс появится
 * у парка, только когда компания выберет водителя; до этого видно здесь:
 * кто откликнулся, на какую заявку, за сколько и что решила компания.
 */
export function ParkOffersTable({ offers }: { offers: ParkOffer[] }) {
    return (
        <>
            <Table className="hidden border-collapse text-[13px] md:table">
                <TableHeader>
                    <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                        <TableHead className="h-9 text-[12.5px]">Маршрут</TableHead>
                        <TableHead className="h-9 text-[12.5px]">Водитель</TableHead>
                        <TableHead className="h-9 text-[12.5px]">Погрузка</TableHead>
                        <TableHead className="h-9 text-[12.5px]">Компания</TableHead>
                        <TableHead className="h-9 text-[12.5px]">Отклик</TableHead>
                        <TableHead className="h-9 text-[12.5px]">Статус</TableHead>
                        <TableHead className="h-9 text-right text-[12.5px]">За рейс</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {offers.map((o) => {
                        const s = STATUS[o.status];
                        return (
                            <TableRow key={o.id} className="border-0 border-b border-solid border-border">
                                <TableCell className="py-2.5">
                                    <div className="flex items-center gap-1.5 font-semibold">{o.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {o.to}</div>
                                    <div className="text-[12px] text-muted-foreground">заявка {o.orderNumber}{o.cargo ? ` · ${o.cargo}` : ''}</div>
                                </TableCell>
                                <TableCell>
                                    <div>{o.driverName}</div>
                                    <div className="text-[12px] text-muted-foreground">{[o.vehiclePlate, o.driverPhone].filter(Boolean).join(' · ')}</div>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{день(o.loadingDate)}</TableCell>
                                <TableCell className="text-muted-foreground">{o.customerName ?? '—'}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                    <div className="tabular-nums">{когда(o.createdAt)}</div>
                                    <div className="text-[12px] text-muted-foreground">{o.agreed ? 'по цене компании' : 'своя цена'}</div>
                                </TableCell>
                                <TableCell><StatusPill status={s.pill} label={s.label} /></TableCell>
                                <TableCell className="text-right tabular-nums">
                                    <div className="font-semibold">{moneyShort(o.price)}</div>
                                    {o.driverTotal != null && (
                                        <div className="text-[11.5px] text-muted-foreground">
                                            водителю на руки {moneyShort(o.driverTotal)}{o.fuel != null ? ` · топливо ${moneyShort(o.fuel)}` : ''}
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            <ul className="m-0 list-none divide-y divide-border p-0 md:hidden">
                {offers.map((o) => {
                    const s = STATUS[o.status];
                    return (
                        <li key={o.id} className="flex flex-col gap-1 px-4 py-3">
                            <div className="flex items-baseline justify-between gap-3">
                                <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">{o.from} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {o.to}</span>
                                <span className="shrink-0 text-[15px] font-bold tabular-nums">{moneyShort(o.price)}</span>
                            </div>
                            <div className="text-[12px] text-muted-foreground">
                                {o.driverName}{o.vehiclePlate ? ` · ${o.vehiclePlate}` : ''} · погрузка {день(o.loadingDate)}
                            </div>
                            <div className="text-[12px] text-muted-foreground">заявка {o.orderNumber} · {o.customerName ?? '—'} · отклик {когда(o.createdAt)}</div>
                            {o.driverTotal != null && <div className="text-[12px] text-muted-foreground">водителю на руки {moneyShort(o.driverTotal)}</div>}
                            <div><StatusPill status={s.pill} label={s.label} /></div>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
