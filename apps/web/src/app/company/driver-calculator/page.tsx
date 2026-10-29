'use client';

import { useEffect, useState } from 'react';
import { Calculator } from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-format';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import styles from '@/components/nova/nova.module.css';

interface DriverCalc {
    base: number;
    fuel: number;
    gross: number;
    opv: number;
    driverTotal: number;
    vosms: number;
    so: number;
    ipn: number;
    commission: number;
    platformFee: number;
    parkFee: number;
    vat: number;
    customerPrice: number;
    deductionAmount: number;
}

interface CalcResponse {
    calc: DriverCalc;
    fuelPerKm: number;
    rates: { opvPct: number; vosmsPct: number; soPct: number; ipnPct: number; parkPct: number; platformPct: number; vatPct: number };
    ratesFrom: 'PARK' | 'DEFAULT';
}

const тенге = (v: number) => `${(v || 0).toLocaleString('ru-RU', { minimumFractionDigits: (v || 0) % 1 ? 2 : 0, maximumFractionDigits: 2 })} ₸`;

/**
 * Калькулятор водителя без ИП (задачи шефа, Q20) — для логистов и
 * диспетчеров: прикинуть, сколько водитель получит на руки и во что рейс
 * обойдётся заказчику. Считает сервер по тем же правилам, что биржа, —
 * чтобы цифры здесь и в отклике водителя не расходились.
 */
export default function DriverCalculatorPage() {
    const [from, setFrom] = useState<'base' | 'onHand'>('base');
    const [amount, setAmount] = useState('100000');
    const [fuelMode, setFuelMode] = useState<'km' | 'sum'>('sum');
    const [km, setKm] = useState('');
    const [fuel, setFuel] = useState('27000');
    const [deduction, setDeduction] = useState(true);
    const [vat, setVat] = useState(false);
    const [result, setResult] = useState<CalcResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Сервер считает только парку; по прямой ссылке остальным — объяснение вместо формы.
    const [толькоПарку, setТолькоПарку] = useState(false);

    useEffect(() => {
        const sum = Number(parseMoneyInput(amount));
        if (!(sum > 0)) { setResult(null); setError('Укажите сумму'); return; }
        let alive = true;
        const timer = setTimeout(() => {
            api.get<CalcResponse>('/exchange/calculator/driver', {
                params: {
                    from, amount: sum,
                    ...(fuelMode === 'km' ? { km: Number(parseMoneyInput(km)) || 0 } : { fuel: Number(parseMoneyInput(fuel)) || 0 }),
                    deduction, vat,
                },
            })
                .then((r) => { if (alive) { setResult(r.data); setError(null); } })
                .catch((e) => {
                    if (!alive) return;
                    if (e?.response?.status === 403) { setТолькоПарку(true); return; }
                    setResult(null);
                    setError(e?.response?.data?.message || 'Не удалось посчитать');
                });
        }, 300);
        return () => { alive = false; clearTimeout(timer); };
    }, [from, amount, fuelMode, km, fuel, deduction, vat]);

    const c = result?.calc;
    const r = result?.rates;

    const pill = (active: boolean) => cn(
        'rounded-full border border-solid px-3 py-1 text-[13px]',
        active ? 'border-foreground bg-foreground text-background' : 'border-border bg-transparent',
    );
    const money = (value: string, set: (v: string) => void, label: string) => (
        <Input
            aria-label={label}
            value={formatMoneyInput(parseMoneyInput(value))}
            onChange={(e) => set(parseMoneyInput(e.target.value).replace(/[^\d.]/g, ''))}
            inputMode="numeric"
            className="h-10 text-[15px] font-semibold tabular-nums"
        />
    );

    if (толькоПарку) {
        return (
            <div className={styles.page}>
                <div className={styles.hero}>
                    <div>
                        <div className={styles.eyebrow}>Запросы</div>
                        <h1 className={styles.title}>Расчёт водителя без ИП</h1>
                        <p className={styles.subtitle}>Расчёт доступен только парку — компании, через которую работают водители без ИП.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Запросы</div>
                    <h1 className={styles.title}>Расчёт водителя без ИП</h1>
                    <p className={styles.subtitle}>
                        Сколько водитель получит на руки и во что рейс обойдётся заказчику, если водитель работает через парк.
                        Те же правила, что на бирже.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <Calculator size={14} />
                        <h2 className={styles.cardTitle}>Исходные данные</h2>
                    </div>
                    <div className={`${styles.cardBody} space-y-4 text-[13px]`}>
                        <div className="space-y-2">
                            <div className="text-[12px] font-medium text-muted-foreground">Считать от</div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={pill(from === 'base')} onClick={() => setFrom('base')}>суммы сделки</button>
                                <button type="button" className={pill(from === 'onHand')} onClick={() => setFrom('onHand')}>суммы на руки водителю</button>
                            </div>
                        </div>
                        <label className="flex flex-col gap-1">
                            <span className="text-[12px] font-medium text-muted-foreground">
                                {from === 'base' ? 'Сумма сделки с топливом, ₸' : 'Водитель хочет на руки (без топлива), ₸'}
                            </span>
                            {money(amount, setAmount, 'Сумма')}
                        </label>
                        <div className="space-y-2">
                            <div className="text-[12px] font-medium text-muted-foreground">Топливо</div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={pill(fuelMode === 'sum')} onClick={() => setFuelMode('sum')}>суммой</button>
                                <button type="button" className={pill(fuelMode === 'km')} onClick={() => setFuelMode('km')}>по километрам</button>
                            </div>
                            {fuelMode === 'sum'
                                ? money(fuel, setFuel, 'Топливо, ₸')
                                : (
                                    <>
                                        {money(km, setKm, 'Километров')}
                                        {result && (
                                            <span className="text-[12px] text-muted-foreground">
                                                По {тенге(result.fuelPerKm)} на 1 км — расход и цена литра из настроек парка
                                            </span>
                                        )}
                                    </>
                                )}
                        </div>
                        <label className="flex cursor-pointer items-center gap-2">
                            <Checkbox checked={deduction} onCheckedChange={(v) => setDeduction(v === true)} />
                            Водитель написал заявление на базовый вычет
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                            <Checkbox checked={vat} onCheckedChange={(v) => setVat(v === true)} />
                            Парк — плательщик НДС
                        </label>
                    </div>
                </section>

                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>Расчёт</h2>
                        {result && (
                            <span className={styles.chip}>{result.ratesFrom === 'PARK' ? 'ставки вашего парка' : 'стандартные ставки'}</span>
                        )}
                    </div>
                    <div className={`${styles.cardBody} text-[13px]`}>
                        {error && !c ? (
                            <div className={styles.empty}>{error}</div>
                        ) : !c || !r ? (
                            <div className="space-y-2" aria-label="Загрузка">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/60" />)}</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-solid border-border p-3">
                                        <div className="text-[12px] text-muted-foreground">Водителю на руки</div>
                                        <div className="text-[24px] font-bold tabular-nums">{тенге(c.driverTotal)}</div>
                                        <div className="text-[12px] text-muted-foreground">плюс топливо {тенге(c.fuel)} оплачивает парк</div>
                                    </div>
                                    <div className="rounded-xl border border-solid border-border p-3">
                                        <div className="text-[12px] text-muted-foreground">Цена для заказчика</div>
                                        <div className="text-[24px] font-bold tabular-nums">{тенге(c.customerPrice)}</div>
                                        <div className="text-[12px] text-muted-foreground">{c.vat > 0 ? `в том числе НДС ${тенге(c.vat)}` : 'без НДС'}</div>
                                    </div>
                                </div>
                                <dl className="m-0 divide-y divide-solid divide-border rounded-xl border border-solid border-border [&>*]:border-x-0">
                                    <Line label="Сумма сделки (топливо + работа)" value={c.base} />
                                    <Line label="Топливо" value={c.fuel} />
                                    <Line label="Оплата водителю за работу" value={c.gross} />
                                    <Line label={`ОПВ ${r.opvPct}% — удерживается и идёт на пенсионный счёт водителя`} value={-c.opv} />
                                    <Line label="На руки водителю" value={c.driverTotal} strong />
                                    <Line label={`ОСМС ${r.vosmsPct}% — платит парк`} value={c.vosms} />
                                    <Line label={`СО ${r.soPct}% — платит парк`} value={c.so} />
                                    <Line
                                        label={`ИПН ${r.ipnPct}% — платит парк${c.deductionAmount > 0 ? `, с вычетом ${тенге(c.deductionAmount)}` : ''}`}
                                        value={c.ipn}
                                    />
                                    <Line label={`Комиссия ${r.parkPct}% (в ней LogiCore ${r.platformPct}%)`} value={c.commission} />
                                    {c.vat > 0 && <Line label={`НДС ${r.vatPct}%`} value={c.vat} />}
                                    <Line label="Цена для заказчика" value={c.customerPrice} strong />
                                </dl>
                                <p className="m-0 text-[12px] text-muted-foreground">
                                    Расчёт на один рейс в месяце: вычет и шкала ИПН здесь считаются так, будто других рейсов
                                    у водителя не было. На бирже система учтёт его прошлые рейсы сама.
                                </p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-3 px-3 py-2', strong && 'bg-muted/40 font-semibold')}>
            <dt className="m-0">{label}</dt>
            <dd className="m-0 shrink-0 tabular-nums">{value < 0 ? `− ${тенге(-value)}` : тенге(value)}</dd>
        </div>
    );
}
