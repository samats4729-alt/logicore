'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { exchangeStatus } from '@/lib/exchange';
import { calculateFuel, fuelOf } from '@/lib/fuel-calc';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-format';
import { cn } from '@/lib/utils';
import nova from '@/components/nova/nova.module.css';
import s from './fuel-calculator.module.css';

const тенге = (v: number) => `${v.toLocaleString('ru-RU')} ₸`;

/** Расход и цена — дробные, через точку или запятую. */
const decimal = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.')) || 0;

function Row({ label, value, why, main }: { label: string; value: number; why?: string; main?: boolean }) {
    return (
        <div className={cn(s.row, main && s.rowMain)}>
            <span>{label}</span>
            <span className={s.sum}>{тенге(value)}</span>
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
 * Калькулятор ГСМ для обычных компаний (шеф, 03.11.2026): километраж и сумма,
 * которую хочет водитель, — на выходе общая сумма, на руки, ГСМ и ОПВ. Всё.
 * У парка свой экран — «Расчёт водителя без ИП»: туда и уводим.
 */
export default function FuelCalculatorPage() {
    const router = useRouter();
    const [km, setKm] = useState('');
    const [total, setTotal] = useState('');
    const [consumption, setConsumption] = useState('30');
    const [price, setPrice] = useState('350');

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
                    <h1 className={nova.title}>Калькулятор ГСМ</h1>
                    <p className={nova.subtitle}>Сколько водителю на руки, на какую сумму заправиться и сколько удержит ОПВ.</p>
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
                                <div className={s.heroLabel}>Общая сумма</div>
                                <div className={s.big}>{тенге(input.total)}</div>
                            </div>
                            <div className={s.list}>
                                <Row label="На руки" value={r.onHand} main />
                                <Row
                                    label="ГСМ"
                                    value={r.fuel}
                                    why={`${r.liters.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} л. На эту сумму водитель заправляется и предоставляет чек.`}
                                />
                                <Row label="ОПВ" value={r.opv} why="Удерживается с водителя." />
                            </div>
                            <p className={s.note}>Предварительный расчёт.</p>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
