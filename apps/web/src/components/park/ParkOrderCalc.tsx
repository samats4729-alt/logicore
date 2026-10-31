'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { ParkOrderCalc, ParkTripFuel } from '@/lib/exchange';
import { cn } from '@/lib/utils';
import card from '@/components/orders/order-card.module.css';

/** Сумма до тиына: целые — без копеек, как в калькуляторе водителя. */
const тенге = (v: number) => `${(v || 0).toLocaleString('ru-RU', { minimumFractionDigits: (v || 0) % 1 ? 2 : 0, maximumFractionDigits: 2 })} ₸`;

/** Вычет — со знаком минус и неразрывным пробелом. */
const минус = (v: number) => `− ${тенге(v)}`;

/**
 * Расчёт водителя без ИП для заявки — только у парка: остальным сервер
 * отдаёт пусто. `reloadKey` — перечитать после сохранения заявки.
 */
export function useParkOrderCalc(orderId: string, reloadKey?: unknown): ParkOrderCalc | null {
    const [data, setData] = useState<ParkOrderCalc | null>(null);
    useEffect(() => {
        let alive = true;
        api.get(`/exchange/calculator/order/${orderId}`)
            .then((r) => { if (alive) setData(r.data && typeof r.data === 'object' ? r.data : null); })
            .catch(() => { if (alive) setData(null); });
        return () => { alive = false; };
    }, [orderId, reloadKey]);
    return data;
}

/** Всё, что парк платит в бюджет по рейсу: ОПВ из оплаты водителя, остальное — сам. */
const налоги = (c: NonNullable<ParkOrderCalc['calc']>) => c.opv + c.vosms + c.so + c.ipn;

/** Оттенок текста — серые доли полосы, которые сами перекрашиваются в тёмной теме. */
const оттенок = (pct: number) => `color-mix(in srgb, var(--nova-fg) ${pct}%, transparent)`;

/**
 * «Куда уходит цена рейса» — главная вещь вкладки «Финансы» у парка.
 *
 * Цена для заказчика одной полосой: НДС, LogiCore, что остаётся парку,
 * налоги, топливо, ОПВ и сумма на руки водителю. Каждая доля — один раз,
 * числом под полосой. «Остаётся парку» — отдельной долей и зелёным: это
 * заработок парка, его шеф просил видеть сразу, а не искать в комиссии.
 */
export function ParkPriceSplit({ data }: { data: ParkOrderCalc }) {
    const c = data.calc;
    if (!c) return null;
    const parts: { label: string; value: number; color: string; strong?: boolean }[] = [
        ...(c.vat > 0 ? [{ label: `НДС ${data.rates.vatPct}%`, value: c.vat, color: 'var(--nova-border)' }] : []),
        { label: `LogiCore ${data.rates.platformPct}%`, value: c.platformFee, color: 'var(--nova-accent)' },
        { label: 'Остаётся парку', value: c.parkFee, color: 'var(--nova-pos)', strong: true },
        { label: 'ОСМС, СО, ИПН', value: c.vosms + c.so + c.ipn, color: оттенок(30) },
        { label: 'Топливо (ГСМ)', value: c.fuel, color: оттенок(50) },
        { label: `ОПВ ${data.rates.opvPct}%`, value: c.opv, color: оттенок(70) },
        { label: data.scheme === 2 ? 'На руки водителю' : 'На руки, с топливом', value: c.driverTotal, color: 'var(--nova-fg)' },
    ];
    const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0) || 1;
    return (
        <section className={card.hero} aria-label="Куда уходит цена рейса">
            <h2 className={card.head}>
                Куда уходит цена рейса
                <span className={card.headRight}>
                    {тенге(c.customerPrice)}
                    {' · '}
                    {data.source === 'TRIP'
                        ? 'расчёт водителя без ИП, зафиксирован при выборе на бирже'
                        : 'своя заявка, по ставкам парка'}
                    {data.preliminary && (
                        <span className={cn(card.tag, card.tagWarn)} title="Бухгалтер парка ещё не подтвердил ставки в «Управление парком → Выплаты»">
                            предварительный
                        </span>
                    )}
                </span>
            </h2>
            <div className={card.split} aria-hidden>
                {parts.filter((p) => p.value > 0).map((p) => (
                    <b key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
                ))}
            </div>
            <div className={card.legend}>
                {parts.map((p) => (
                    <div key={p.label} className={card.legendItem}>
                        <span className={card.legendLabel}><i style={{ background: p.color }} />{p.label}</span>
                        <span className={cn(card.legendValue, p.strong && (p.value >= 0 ? card.pos : card.neg))}>
                            {тенге(p.value)}
                            {p.strong && c.customerPrice
                                ? ` · ${(p.value / c.customerPrice * 100).toFixed(1).replace('.', ',')}%`
                                : ''}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

/** Строка лесенки: итог жирный, вычет — с отступом и минусом. */
function Step({ label, value, note, total, minus }: {
    label: string;
    value: number;
    note?: ReactNode;
    total?: boolean;
    minus?: boolean;
}) {
    return (
        <div className={cn(card.ladder, total && card.ladderTotal, minus && card.ladderStep)}>
            <span>{label}</span>
            <span className={card.n}>{minus ? минус(value) : тенге(value)}</span>
            <span className={card.ladderNote}>{note}</span>
        </div>
    );
}

/**
 * «Расчёт водителя без ИП» во вкладке «Финансы» заявки парка — те же
 * строки, что в калькуляторе, только по этому рейсу и лесенкой: от цены
 * для заказчика через ставку водителя до суммы на руки. Рейс с биржи — как
 * зафиксировали при выборе водителя; своя заявка — из цены для заказчика.
 */
export function ParkOrderCalcCard({ data, onOpenFuel }: { data: ParkOrderCalc; onOpenFuel?: () => void }) {
    const c = data.calc;
    const r = data.rates;
    const km = data.distanceKm ? `по расчёту, ≈ ${Math.round(data.distanceKm).toLocaleString('ru-RU')} км · ` : '';
    return (
        <section className={card.section} aria-label="Расчёт водителя без ИП">
            <h2 className={card.head}>
                Расчёт водителя без ИП{data.driverName ? ` · ${data.driverName}` : ''}
                <span className={card.headRight}>
                    {data.preliminary && (
                        <span className={cn(card.tag, card.tagWarn)} title="Бухгалтер парка ещё не подтвердил ставки в «Управление парком → Выплаты»">
                            Предварительный
                        </span>
                    )}
                    {onOpenFuel && (
                        <button type="button" className={card.lnk} onClick={onOpenFuel}>Выдачи и чеки</button>
                    )}
                </span>
            </h2>
            {!c ? (
                <div className={cn(card.list, card.empty)}>{data.reason}</div>
            ) : (
                <div className={card.list}>
                    <Step label={c.vat > 0 ? 'Цена для заказчика, с НДС' : 'Цена для заказчика, без НДС'} value={c.customerPrice} total />
                    {c.vat > 0 && <Step label={`НДС ${r.vatPct}%`} value={c.vat} minus />}
                    <Step
                        label={`Комиссия ${r.parkPct}%, в ней LogiCore ${r.platformPct}%`}
                        value={c.commission}
                        minus
                        note={<>из комиссии остаётся парку <b className={card.pos}>{тенге(c.parkFee)}</b> · LogiCore {тенге(c.platformFee)}</>}
                    />
                    <Step
                        label="ОСМС, СО, ИПН — платит парк"
                        value={c.vosms + c.so + c.ipn}
                        minus
                        note={`ОСМС ${r.vosmsPct}% ${тенге(c.vosms)} · СО ${r.soPct}% ${тенге(c.so)} · ИПН ${r.ipnPct}% ${тенге(c.ipn)}`
                            + (c.deductionAmount > 0 ? `, вычет ${тенге(c.deductionAmount)}` : '')}
                    />
                    <Step label="Ставка водителя, до вычетов" value={c.base} total note="сколько запросил водитель, до ГСМ и ОПВ" />
                    <Step
                        label="Топливо (ГСМ) — оплачивает парк"
                        value={c.fuel}
                        minus
                        note={data.distanceKm
                            ? `${km}на заправке или переводом водителю, чеки — на БИН парка`
                            : 'Не посчитано: у точек маршрута нет координат или адрес погрузки и выгрузки один. Вся сумма без налогов и комиссии ушла в оплату водителю.'}
                    />
                    <Step label="Оплата за работу по договору ГПХ" value={c.gross} />
                    <Step label={`ОПВ ${r.opvPct}% — удерживается`} value={c.opv} minus note="из оплаты водителя" />
                    <Step label={data.scheme === 2 ? 'На руки водителю' : 'На руки водителю, с топливом'} value={c.driverTotal} total />
                    <Step label="Налоги по ГПХ, всего" value={налоги(c)} note="ОПВ, ОСМС, СО, ИПН" />
                </div>
            )}
            <p className={card.note}>
                {data.source === 'TRIP'
                    ? 'Рейс с биржи: расчёт зафиксирован, когда компания выбрала водителя, и дальше не меняется.'
                    : 'Своя заявка парка: из цены для заказчика по ставкам парка. Изменится цена — пересчитается и расчёт.'}
            </p>
        </section>
    );
}

/** Строка «Выдано водителю»: точка, что, сумма, пояснение, действие. */
function Given({ label, value, minus, total, need, note, action }: {
    label: string;
    value: number;
    minus?: boolean;
    total?: boolean;
    need?: boolean;
    note?: ReactNode;
    action?: ReactNode;
}) {
    const style: CSSProperties = { gridTemplateColumns: '8px minmax(0, 344px) 150px minmax(0, 1fr) auto' };
    return (
        <div className={cn(card.task, total && card.rowStrong)} style={style}>
            <span className={cn(card.dot, need && card.dotNeed)} aria-hidden={!need} />
            <span>{label}</span>
            <span className={card.n}>{minus ? минус(value) : тенге(value)}</span>
            <span className={card.ladderNote}>{note}</span>
            <span>{action}</span>
        </div>
    );
}

/**
 * «Выдано водителю» по рейсу с биржи: топливо и предоплата из суммы на руки —
 * раздельно (шеф, 29.10.2026). Топливо сводится чеками; предоплата — часть
 * суммы на руки, чек не нужен. Топливо без чека вычитается, заправка за свои
 * возвращается — обе строки меняют итог, поэтому видны всегда, когда есть.
 * Внизу — сколько перечислить в конце.
 */
export function ParkTripGivenCard({ orderId, reloadKey, onOpen }: { orderId: string; reloadKey?: unknown; onOpen: () => void }) {
    const [f, setF] = useState<ParkTripFuel | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let alive = true;
        setFailed(false);
        api.get(`/exchange/park/trips/${orderId}/fuel`)
            .then((r) => { if (alive) setF(r.data); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [orderId, reloadKey]);

    const noReceipt = f ? Math.max(0, f.issued.total - f.receipts.accepted) : 0;
    const ownMoney = f ? Math.max(0, f.receipts.accepted - f.issued.total) : 0;
    const advances = f?.advances?.total ?? 0;
    return (
        <section className={card.section} aria-label="Выдано водителю">
            <h2 className={card.head}>
                Выдано водителю
                <span className={card.headRight}>
                    <button type="button" className={card.lnk} onClick={onOpen}>Выдачи и чеки</button>
                </span>
            </h2>
            {failed ? (
                <div className={cn(card.list, card.empty)}>Не удалось загрузить выдачи по рейсу</div>
            ) : !f ? (
                <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
            ) : (
                <div className={card.list}>
                    <Given label="Топливо — лимит по расчёту" value={f.fuelEstimate ?? 0} />
                    <Given label="Выдано на топливо" value={f.issued.total} />
                    <Given label="Чеков принято" value={f.receipts.accepted} />
                    {f.receipts.pending > 0 && (
                        <Given
                            label="Чеки ждут проверки"
                            value={f.receipts.pending}
                            need
                            action={<button type="button" className={card.lnk} onClick={onOpen}>Проверить</button>}
                        />
                    )}
                    <Given label="На руки по расчёту" value={f.driverTotal ?? 0} />
                    <Given label="Предоплата выдана" value={advances} minus note="удерживается из суммы на руки" />
                    {noReceipt > 0 && <Given label="Топливо без чека — вычитается" value={noReceipt} minus />}
                    {ownMoney > 0 && <Given label="Заправлялся за свои — возвращается" value={ownMoney} />}
                    <Given label="Перечислить в конце" value={f.toPay ?? 0} total />
                </div>
            )}
        </section>
    );
}
