'use client';

import { AlertTriangle, CheckCircle2, FileSignature, History } from 'lucide-react';
import { QUOTE_REQUEST_STATUS_LABELS } from '@/lib/vocabulary';
import { cn } from '@/lib/utils';

export interface QuoteMemory {
    last: {
        id: string;
        requestNumber: string;
        createdAt: string;
        customerPrice: number | null;
        carrierCost: number | null;
        cargoWeight: number | null;
        cargoVolume: number | null;
        cargoType: string | null;
        status: string;
        rejectionReason: string | null;
    } | null;
    sameConditions: boolean;
    differences: string[];
    note: string | null;
    range: {
        customerFrom: number;
        customerTo: number;
        carrierFrom: number | null;
        carrierTo: number | null;
        count: number;
    } | null;
    annualTariff: {
        price: string | number;
        vehicleType: string | null;
        agreement?: { agreementNumber: string; validTo: string | null } | null;
    } | null;
    history: any[];
}

const money = (v: number | string | null | undefined) =>
    v == null ? '—' : `${Math.round(Number(v)).toLocaleString('ru-RU')} ₸`;

const tons = (kg: number | null) => (kg == null ? null : `${(kg / 1000).toLocaleString('ru-RU')} т`);

function daysAgo(iso: string): string {
    const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
    if (days === 0) return 'сегодня';
    if (days === 1) return 'вчера';
    const tail = days % 100 >= 11 && days % 100 <= 14 ? 'дней'
        : days % 10 === 1 ? 'день'
            : days % 10 >= 2 && days % 10 <= 4 ? 'дня' : 'дней';
    return `${days} ${tail} назад`;
}

/**
 * Что мы уже предлагали этому клиенту на этом маршруте.
 *
 * Панель намеренно ничего не решает за менеджера и не подставляет сумму в
 * поле цены. Она только напоминает: вот что было, вот чем кончилось, вот
 * что изменилось. Цену называет человек — он один видит и рынок, и то,
 * почём машина найдена сегодня.
 *
 * Закупочная цена показана рядом с ценой клиенту не для красоты: именно
 * её забывают первой, а без неё «130 000 не прошло» ничего не значит.
 */
export function QuoteMemoryPanel({ memory, loading }: { memory: QuoteMemory | null; loading?: boolean }) {
    if (loading) {
        return (
            <div className="rounded-2xl bg-muted/40 px-4 py-3 text-[12px] text-muted-foreground">
                Смотрим, что предлагали этому клиенту раньше…
            </div>
        );
    }

    if (!memory) return null;

    const { last, note, range, annualTariff, sameConditions, differences } = memory;
    const rejected = last?.status === 'REJECTED';

    if (!last && !annualTariff) {
        return (
            <div className="rounded-2xl bg-muted/40 px-4 py-3 text-[12px] text-muted-foreground">
                По этому клиенту и маршруту запросов ещё не было — сравнивать не с чем.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {annualTariff && (
                <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                    <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    <div className="text-[12px] leading-relaxed">
                        <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                            Есть годовой тариф: {money(annualTariff.price)}
                        </span>
                        {annualTariff.vehicleType && <span className="text-emerald-800 dark:text-emerald-300"> · {annualTariff.vehicleType}</span>}
                        {annualTariff.agreement && (
                            <span className="text-emerald-800 dark:text-emerald-300">
                                {' '}· ДС №{annualTariff.agreement.agreementNumber}
                                {annualTariff.agreement.validTo
                                    ? ` до ${new Date(annualTariff.agreement.validTo).toLocaleDateString('ru-RU')}`
                                    : ''}
                            </span>
                        )}
                        <div className="mt-0.5 text-emerald-800/80 dark:text-emerald-300/80">
                            Маршрут согласован договором — считать заново не нужно.
                        </div>
                    </div>
                </div>
            )}

            {last && (
                <div
                    className={cn(
                        'rounded-2xl border px-4 py-3',
                        rejected
                            ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
                            : 'border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40',
                    )}
                >
                    <div className="flex items-start gap-2">
                        {rejected
                            ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" />}
                        <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-semibold leading-snug">{note}</p>

                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                                <span className="text-muted-foreground">
                                    {last.requestNumber} · {daysAgo(last.createdAt)}
                                </span>
                                <span>
                                    <span className="text-muted-foreground">машину нашли за </span>
                                    <b className="tabular-nums">{money(last.carrierCost)}</b>
                                </span>
                                <span>
                                    <span className="text-muted-foreground">клиенту предложили </span>
                                    <b className="tabular-nums">{money(last.customerPrice)}</b>
                                </span>
                                <span className="text-muted-foreground">
                                    {QUOTE_REQUEST_STATUS_LABELS[last.status] || last.status}
                                </span>
                            </div>

                            <div className="mt-1 text-[11.5px] text-muted-foreground">
                                Тогда везли: {[tons(last.cargoWeight), last.cargoVolume ? `${last.cargoVolume} м³` : null, last.cargoType]
                                    .filter(Boolean)
                                    .join(' · ') || 'условия не записаны'}
                            </div>

                            {!sameConditions && differences.length > 0 && (
                                <ul className="mt-1.5 flex flex-col gap-0.5 text-[11.5px] text-amber-900 dark:text-amber-300">
                                    {differences.map((d) => (
                                        <li key={d}>· {d}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {range && range.count > 1 && (
                <div className="flex items-start gap-2 rounded-2xl bg-muted/40 px-4 py-2.5 text-[12px]">
                    <History className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                    <div>
                        <span className="text-muted-foreground">По этому маршруту всего {range.count}: клиенту давали </span>
                        <b className="tabular-nums">{money(range.customerFrom)}</b>
                        <span className="text-muted-foreground"> — </span>
                        <b className="tabular-nums">{money(range.customerTo)}</b>
                        {range.carrierFrom != null && (
                            <>
                                <span className="text-muted-foreground">, машину брали </span>
                                <b className="tabular-nums">{money(range.carrierFrom)}</b>
                                <span className="text-muted-foreground"> — </span>
                                <b className="tabular-nums">{money(range.carrierTo)}</b>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
