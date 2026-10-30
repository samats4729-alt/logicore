'use client';

import { useEffect, useState } from 'react';
import { Calculator, Fuel } from 'lucide-react';
import { api } from '@/lib/api';
import type { ParkOrderCalc, ParkTripFuel } from '@/lib/exchange';
import { cn } from '@/lib/utils';
import nova from '@/components/nova/nova.module.css';

/** Сумма до тиына: целые — без копеек, как в калькуляторе водителя. */
const тенге = (v: number) => `${(v || 0).toLocaleString('ru-RU', { minimumFractionDigits: (v || 0) % 1 ? 2 : 0, maximumFractionDigits: 2 })} ₸`;

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

/**
 * Плитки «Финансов» заявки парка вместо «ставки исполнителю» и «маржи»:
 * у парка исполнитель — свой водитель, и деньги рейса — это топливо, сумма
 * на руки и налоги по ГПХ, каждое отдельно (владелец и шеф, 29.10.2026).
 * Ставка водителя — сколько он запросил до вычетов ГСМ и ОПВ (31.10.2026).
 * Два ряда по три: сверху — договорённости, снизу — из чего ставка.
 */
export function ParkFinanceTiles({ data, customerGross, customerPaid }: {
    data: ParkOrderCalc;
    customerGross: number;
    customerPaid: boolean;
}) {
    const c = data.calc;
    if (!c) return null;
    return (
        <div className={`${nova.tiles} ${nova.tiles3}`}>
            <Tile
                label="От заказчика"
                value={customerGross}
                sub={<span className={cn(nova.chip, !customerPaid && nova.chipWarn)}>{customerPaid ? 'Оплачено' : 'Не оплачено'}</span>}
            />
            <Tile label="Ставка водителя" value={c.base} sub="до вычетов ГСМ и ОПВ" />
            <Tile label="Остаётся парку" value={c.parkFee} tone={c.parkFee >= 0 ? 'pos' : 'neg'} sub="из комиссии" />
            <Tile label="Топливо (ГСМ)" value={c.fuel} sub={data.distanceKm ? `по расчёту, ≈ ${Math.round(data.distanceKm).toLocaleString('ru-RU')} км` : 'нет расстояния'} />
            <Tile label="Водителю на руки" value={c.driverTotal} sub={data.scheme === 2 ? 'без топлива, после ОПВ' : 'с топливом'} />
            <Tile label="Налоги по ГПХ" value={налоги(c)} sub="ОПВ, ОСМС, СО, ИПН" />
        </div>
    );
}

/** Плитка — итог целыми тенге: тиыны — в строках расчёта ниже. */
function Tile({ label, value, sub, tone }: { label: string; value: number; sub?: React.ReactNode; tone?: 'pos' | 'neg' }) {
    return (
        <div className={nova.tile}>
            <div className={nova.tileLabel}>{label}</div>
            <div className={cn(nova.tileValue, tone === 'pos' && nova.valuePos, tone === 'neg' && nova.valueNeg)}>{тенге(Math.round(value))}</div>
            {sub && <div className={nova.tileSub}>{sub}</div>}
        </div>
    );
}

/**
 * Карточка «Расчёт водителя без ИП» во вкладке «Финансы» заявки парка — те
 * же строки, что в калькуляторе, только по этому рейсу. Рейс с биржи — как
 * зафиксировали при выборе водителя; своя заявка — из цены для заказчика.
 */
export function ParkOrderCalcCard({ data, onOpenFuel }: { data: ParkOrderCalc; onOpenFuel?: () => void }) {
    return (
        <section className={nova.card}>
            <div className={nova.cardHead}>
                <Calculator size={14} />
                <h3 className={nova.cardTitle}>Расчёт водителя без ИП{data.driverName ? ` · ${data.driverName}` : ''}</h3>
                {data.preliminary && (
                    <span className={cn(nova.chip, nova.chipWarn)} title="Бухгалтер парка ещё не подтвердил ставки в «Управление парком → Выплаты»">
                        Предварительный
                    </span>
                )}
                {onOpenFuel && (
                    <button type="button" className={nova.action} onClick={onOpenFuel}>
                        <Fuel className="h-3.5 w-3.5" /> Выдачи и чеки
                    </button>
                )}
            </div>
            <div className={nova.cardBody}>
                {data.calc ? <ParkCalcLines data={data} /> : <div className={nova.empty}>{data.reason}</div>}
                <p className="m-0 mt-3 text-[12px] text-muted-foreground">
                    {data.source === 'TRIP'
                        ? 'Рейс с биржи: расчёт зафиксирован, когда компания выбрала водителя, и дальше не меняется.'
                        : 'Своя заявка парка: из цены для заказчика по ставкам парка. Изменится цена — пересчитается и расчёт.'}
                </p>
            </div>
        </section>
    );
}

/** Строки расчёта: топливо, водителю, налоги по ГПХ и из чего цена — четыре отдельных блока. */
export function ParkCalcLines({ data }: { data: ParkOrderCalc }) {
    const c = data.calc;
    const r = data.rates;
    if (!c) return null;
    const km = data.distanceKm ? `, ≈ ${Math.round(data.distanceKm).toLocaleString('ru-RU')} км` : '';
    return (
        <div className="grid gap-3 text-[13px] md:grid-cols-2">
            <Group title="Топливо">
                <Line label={`По расчёту${km}`} value={c.fuel} strong />
                <p className="m-0 px-3 py-2 text-[12px] text-muted-foreground">
                    {data.distanceKm
                        ? 'Платит парк — на заправке или переводом водителю. Чеки — на БИН парка.'
                        : 'Не посчитано: у точек маршрута нет координат или адрес погрузки и выгрузки один. Вся сумма без налогов и комиссии ушла в оплату водителю.'}
                </p>
            </Group>
            <Group title="Ставка водителя">
                {/* Сколько водитель запросил — и что из этого вычитается до суммы на руки. */}
                <Line label="Ставка водителя, до вычетов" value={c.base} strong />
                <Line label="Топливо (ГСМ) — оплачивает парк" value={-c.fuel} />
                <Line label="Оплата за работу по договору ГПХ" value={c.gross} />
                <Line label={`ОПВ ${r.opvPct}% — удерживается`} value={-c.opv} />
                <Line label={data.scheme === 2 ? 'На руки водителю' : 'На руки водителю, с топливом'} value={c.driverTotal} strong />
            </Group>
            <Group title="Налоги по ГПХ">
                <Line label={`ОПВ ${r.opvPct}% — из оплаты водителя`} value={c.opv} />
                <Line label={`ОСМС ${r.vosmsPct}% — платит парк`} value={c.vosms} />
                <Line label={`СО ${r.soPct}% — платит парк`} value={c.so} />
                <Line label={`ИПН ${r.ipnPct}% — платит парк${c.deductionAmount > 0 ? `, вычет ${тенге(c.deductionAmount)}` : ''}`} value={c.ipn} />
                <Line label="Всего налогов" value={налоги(c)} strong />
            </Group>
            <Group title="Цена для заказчика">
                <Line label="Топливо" value={c.fuel} />
                <Line label="Оплата водителю за работу" value={c.gross} />
                <Line label="ОСМС, СО, ИПН — за счёт парка" value={c.vosms + c.so + c.ipn} />
                <Line label={`Комиссия ${r.parkPct}%, в ней LogiCore ${r.platformPct}% — ${тенге(c.platformFee)}`} value={c.commission} />
                {c.vat > 0 && <Line label={`НДС ${r.vatPct}%`} value={c.vat} />}
                <Line label={c.vat > 0 ? 'Цена для заказчика, с НДС' : 'Цена для заказчика, без НДС'} value={c.customerPrice} strong />
                <Line label="Из комиссии остаётся парку" value={c.parkFee} pos />
            </Group>
        </div>
    );
}

/**
 * «Выдано водителю» по рейсу с биржи: топливо и предоплата из суммы на руки —
 * раздельно (шеф, 29.10.2026). Топливо сводится чеками; предоплата — часть
 * суммы на руки, чек не нужен. Внизу — сколько перечислить в конце.
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
        <section className={nova.card} style={{ marginBottom: 0, height: '100%' }}>
            <div className={nova.cardHead}>
                <Fuel size={14} />
                <h3 className={nova.cardTitle}>Выдано водителю</h3>
                <button type="button" className={nova.action} onClick={onOpen}>Выдачи и чеки</button>
            </div>
            <div className={nova.cardBody}>
                {failed ? (
                    <div className={nova.empty}>Не удалось загрузить выдачи по рейсу</div>
                ) : !f ? (
                    <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
                ) : (
                    <div className="grid gap-3 text-[13px]">
                        <Group title="Топливо">
                            <Line label="Лимит по расчёту" value={f.fuelEstimate ?? 0} />
                            <Line label="Выдано на топливо" value={f.issued.total} />
                            <Line label="Чеков принято" value={f.receipts.accepted} />
                            {f.receipts.pending > 0 && <Line label="Чеки ждут проверки" value={f.receipts.pending} />}
                        </Group>
                        <Group title="На руки">
                            <Line label="На руки по расчёту" value={f.driverTotal ?? 0} />
                            <Line label="Предоплата выдана" value={-advances} />
                            {noReceipt > 0 && <Line label="Топливо без чека — вычитается" value={-noReceipt} />}
                            {ownMoney > 0 && <Line label="Заправлялся за свои — возвращается" value={ownMoney} />}
                            <Line label="Перечислить в конце" value={f.toPay ?? 0} strong />
                        </Group>
                    </div>
                )}
            </div>
        </section>
    );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded-xl border border-solid border-border">
            <div className="bg-muted/40 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">{title}</div>
            {/* Без сброса стилей у Tailwind (preflight выключен) рамка-разделитель
                рисуется и по бокам — их гасим, как в калькуляторе. */}
            <dl className="m-0 divide-y divide-solid divide-border [&>*]:border-x-0">{children}</dl>
        </div>
    );
}

function Line({ label, value, strong, pos }: { label: string; value: number; strong?: boolean; pos?: boolean }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-3 px-3 py-2', strong && 'font-semibold')}>
            <dt className="m-0">{label}</dt>
            <dd className={cn('m-0 shrink-0 tabular-nums', pos && nova.valuePos)}>{value < 0 ? `− ${тенге(-value)}` : тенге(value)}</dd>
        </div>
    );
}
