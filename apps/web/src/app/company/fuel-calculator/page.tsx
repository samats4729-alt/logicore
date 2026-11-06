'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { exchangeStatus } from '@/lib/exchange';
import { DEDUCTION_2026, calculateFuel, fuelOf } from '@/lib/fuel-calc';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-format';
import { cn } from '@/lib/utils';
import nova from '@/components/nova/nova.module.css';
import s from './fuel-calculator.module.css';

const тенге = (v: number) => `${v.toLocaleString('ru-RU')} ₸`;

/** Расход и цена — дробные, через точку или запятую. */
const decimal = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.')) || 0;

/** Строка расчёта: итог — жирный, вычет — с отступом и минусом, главная — крупно. */
function Row({ label, value, why, kind }: { label: string; value: number; why?: string; kind?: 'total' | 'minus' | 'main' }) {
    return (
        <div className={cn(s.row, kind === 'total' && s.rowTotal, kind === 'main' && s.rowMain, kind === 'minus' && s.rowStep)}>
            <span>{label}</span>
            <span className={s.sum}>{kind === 'minus' ? `− ${тенге(value)}` : тенге(value)}</span>
            {why && <span className={s.why}>{why}</span>}
        </div>
    );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
    return (
        <div className={s.field}>
            <label className={s.label} htmlFor={htmlFor}>{label}</label>
            {children}
        </div>
    );
}

/**
 * Калькулятор ГСМ и налогов для обычных компаний: километраж и сумма, которую
 * хочет водитель, — на выходе сумма на руки, ГСМ, все налоги по ГПХ и
 * себестоимость рейса. Комиссии и НДС здесь нет: это расчёт парка (владелец,
 * 06.11.2026). У парка свой экран — «Расчёт водителя без ИП»: туда и уводим.
 */
export default function FuelCalculatorPage() {
    const router = useRouter();
    const [km, setKm] = useState('');
    const [total, setTotal] = useState('');
    const [consumption, setConsumption] = useState('30');
    const [price, setPrice] = useState('350');
    const [deduction, setDeduction] = useState(false);

    useEffect(() => {
        let alive = true;
        exchangeStatus().then((st) => {
            if (alive && st.enabled && st.isPark) router.replace('/company/driver-calculator');
        });
        return () => { alive = false; };
    }, [router]);

    const input = {
        total: Number(parseMoneyInput(total)) || 0,
        km: Number(parseMoneyInput(km)) || 0,
        consumption: decimal(consumption),
        price: decimal(price),
        deduction,
    };
    const filled = input.total > 0 && input.km > 0 && input.consumption > 0 && input.price > 0;
    const r = filled ? calculateFuel(input) : null;

    const moneyField = (id: string, value: string, set: (v: string) => void) => (
        <Input
            id={id}
            value={formatMoneyInput(parseMoneyInput(value))}
            onChange={(e) => set(parseMoneyInput(e.target.value).replace(/[^\d]/g, ''))}
            inputMode="numeric"
            className="h-10 text-[15px] font-medium tabular-nums"
        />
    );
    const decimalField = (id: string, value: string, set: (v: string) => void) => (
        <Input
            id={id}
            value={value}
            onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            className="h-10 text-[15px] font-medium tabular-nums"
        />
    );

    return (
        <div className={`${nova.page} ${nova.pageWide}`}>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Запросы</div>
                    <h1 className={nova.title}>Калькулятор ГСМ и налогов</h1>
                    <p className={nova.subtitle}>Сколько водителю на руки, на какую сумму заправиться, налоги по ГПХ и во что рейс обойдётся.</p>
                </div>
            </div>

            <div className={s.grid}>
                <div className={s.form}>
                    <Field label="Километраж, км" htmlFor="fc-km">{moneyField('fc-km', km, setKm)}</Field>
                    <Field label="Общая сумма, ₸" htmlFor="fc-total">{moneyField('fc-total', total, setTotal)}</Field>
                    <div className={s.pair}>
                        <Field label="Расход, л на 100 км" htmlFor="fc-consumption">{decimalField('fc-consumption', consumption, setConsumption)}</Field>
                        <Field label="Цена литра, ₸" htmlFor="fc-price">{decimalField('fc-price', price, setPrice)}</Field>
                    </div>
                    <label className={s.check}>
                        <Checkbox checked={deduction} onCheckedChange={(v) => setDeduction(v === true)} />
                        Заявление на вычет 30 МРП ({тенге(DEDUCTION_2026)} в месяц)
                    </label>
                </div>

                <section aria-live="polite" aria-label="Расчёт">
                    {!filled ? (
                        <div className={s.hint}>Укажите километраж, общую сумму, расход и цену литра.</div>
                    ) : !r ? (
                        <div className={s.alert} role="alert">
                            ГСМ {тенге(fuelOf(input.km, input.consumption, input.price))} не меньше общей суммы. Увеличьте сумму или проверьте километраж.
                        </div>
                    ) : (
                        <>
                            <div className={s.hero}>
                                <div className={s.heroTop}>
                                    <span className={s.heroLabel}>Водителю на руки</span>
                                    <span className={s.heroSide}>себестоимость {тенге(r.cost)}</span>
                                </div>
                                <div className={s.big}>{тенге(r.onHand)}</div>
                            </div>
                            <div className={s.list}>
                                <Row label="Общая сумма" value={input.total} kind="total" />
                                <Row
                                    label="ГСМ"
                                    value={r.fuel}
                                    kind="minus"
                                    why={`${r.liters.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} л. На эту сумму водитель заправляется и предоставляет чек.`}
                                />
                                <Row label="Остаток после ГСМ" value={r.rest} kind="total" />
                                <Row label="На руки" value={r.onHand} kind="main" why="Остаток минус 10 %." />
                                <Row label="Начислено по ГПХ" value={r.gross} kind="total" why="После ОПВ, ОСМС и СО остаётся сумма на руки." />
                                <Row label="ОПВ 10 %" value={r.opv} kind="minus" why="От начисления, удерживается с водителя." />
                                <Row
                                    label="ОСМС 2 %"
                                    value={r.vosms}
                                    kind="minus"
                                    why={r.vosmsCapped ? 'От начисления, не больше чем с 1 700 000 ₸ (20 МЗП), удерживается.' : 'От начисления, удерживается.'}
                                />
                                <Row
                                    label="СО 5 %"
                                    value={r.so}
                                    kind="minus"
                                    why={r.soCapped ? 'От начисления минус ОПВ, не больше чем с 595 000 ₸ (7 МЗП), удерживается.' : 'От начисления минус ОПВ, удерживается.'}
                                />
                                <Row
                                    label="ИПН 10 % — за счёт компании"
                                    value={r.ipn}
                                    why={`От начисления минус ОПВ, ОСМС и СО${r.deductionUsed ? ` и вычет ${тенге(r.deductionUsed)}` : ''}.`}
                                />
                                <Row label="Налоги всего" value={r.taxes} />
                                <Row label="Себестоимость рейса" value={r.cost} kind="total" why={`ГСМ, начисление и ИПН: на ${тенге(r.cost - input.total)} больше общей суммы.`} />
                            </div>
                            <p className={s.note}>Предварительный расчёт на один рейс в месяце. Ставки и пределы 2026 года.</p>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
