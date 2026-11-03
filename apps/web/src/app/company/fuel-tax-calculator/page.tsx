'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { exchangeStatus } from '@/lib/exchange';
import { DEDUCTION_2026, calculateFuelTax, fuelOf, type FuelTaxMode } from '@/lib/fuel-tax-calc';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-format';
import { cn } from '@/lib/utils';
import nova from '@/components/nova/nova.module.css';
import s from './fuel-tax.module.css';

/** Сумма: целая — без копеек, дробная — до тиына. */
const тенге = (v: number) => `${v.toLocaleString('ru-RU', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} ₸`;

/** Расход, цена и процент — дробные, через точку или запятую. */
const decimal = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.')) || 0;

function Row({ label, value, why, kind }: { label: string; value: number; why?: string; kind?: 'total' | 'minus' | 'plus' }) {
    const step = kind === 'minus' || kind === 'plus';
    return (
        <div className={cn(s.row, kind === 'total' && s.rowTotal, step && s.rowStep)}>
            <span>{label}</span>
            <span className={s.sum}>{kind === 'minus' ? `− ${тенге(value)}` : kind === 'plus' ? `+ ${тенге(value)}` : тенге(value)}</span>
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
 * Калькулятор ГСМ и налогов для обычных компаний (шеф, 03.11.2026): клиент
 * спросил цену — посчитали ГСМ по километражу, налоги и сумму водителю, докинули
 * свой процент и назвали цену. У парка свой экран — «Расчёт водителя без ИП»:
 * туда и уводим, этот считает не по его ставкам.
 */
export default function FuelTaxCalculatorPage() {
    const router = useRouter();
    const [total, setTotal] = useState('750000');
    const [km, setKm] = useState('2795');
    const [consumption, setConsumption] = useState('30');
    const [price, setPrice] = useState('350');
    const [mode, setMode] = useState<FuelTaxMode>('out');
    const [deduction, setDeduction] = useState(false);
    const [percent, setPercent] = useState('10');
    const [vat, setVat] = useState(false);

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
        mode,
        deduction,
        percent: decimal(percent),
        vat,
    };
    const r = useMemo(() => calculateFuelTax(input), [
        input.total, input.km, input.consumption, input.price, input.mode, input.deduction, input.percent, input.vat,
    ]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const parts = r ? [
        { name: 'ГСМ', value: r.fuel, color: 'var(--nova-border)' },
        { name: 'Налоги', value: r.taxes, color: 'var(--nova-fg-3)' },
        { name: 'На руки', value: r.onHand, color: 'var(--nova-fg)' },
        { name: 'Ваш процент', value: r.cut, color: 'var(--nova-accent)' },
        ...(r.vatSum ? [{ name: 'НДС', value: r.vatSum, color: 'var(--nova-border-2)' }] : []),
    ] : [];
    const from = mode === 'out' ? 'разницы' : 'начисления';

    return (
        <div className={`${nova.page} ${nova.pageWide}`}>
            <div className={nova.hero}>
                <div>
                    <div className={nova.eyebrow}>Запросы</div>
                    <h1 className={nova.title}>Калькулятор ГСМ и налогов</h1>
                    <p className={nova.subtitle}>
                        Общая сумма минус ГСМ по километражу, налоги, сумма водителю и цена, которую можно назвать заказчику.
                    </p>
                </div>
            </div>

            <div className={s.grid}>
                <div className={s.form}>
                    <Field label="Общая сумма, ₸" htmlFor="ft-total">{moneyField('ft-total', total, setTotal)}</Field>
                    <Field label="Расстояние, км" htmlFor="ft-km">{moneyField('ft-km', km, setKm)}</Field>
                    <div className={s.pair}>
                        <Field label="Расход, л на 100 км" htmlFor="ft-consumption">{decimalField('ft-consumption', consumption, setConsumption)}</Field>
                        <Field label="Цена литра, ₸" htmlFor="ft-price">{decimalField('ft-price', price, setPrice)}</Field>
                    </div>
                    <div className={s.field} role="group" aria-labelledby="ft-mode">
                        <span className={s.label} id="ft-mode">Откуда берутся налоги</span>
                        <div className={s.modes}>
                            <button type="button" className={cn(s.mode, mode === 'out' && s.modeOn)} aria-pressed={mode === 'out'} onClick={() => setMode('out')}>
                                Из разницы
                            </button>
                            <button type="button" className={cn(s.mode, mode === 'top' && s.modeOn)} aria-pressed={mode === 'top'} onClick={() => setMode('top')}>
                                Сверху, разница на руки
                            </button>
                        </div>
                    </div>
                    <label className={s.check}>
                        <Checkbox checked={deduction} onCheckedChange={(v) => setDeduction(v === true)} />
                        Заявление на вычет 30 МРП ({тенге(DEDUCTION_2026)} в месяц)
                    </label>
                    <div className={s.group}>
                        <Field label="Ваш процент сверху, %" htmlFor="ft-percent">{decimalField('ft-percent', percent, setPercent)}</Field>
                        <label className={s.check}>
                            <Checkbox checked={vat} onCheckedChange={(v) => setVat(v === true)} />
                            Цена заказчику с НДС 16 %
                        </label>
                    </div>
                </div>

                <section aria-live="polite" aria-label="Расчёт">
                    {!r ? (
                        <div className={s.alert} role="alert">
                            {input.total > 0
                                ? `ГСМ ${тенге(fuelOf(input.km, input.consumption, input.price))} не меньше общей суммы. Увеличьте сумму или проверьте километраж.`
                                : 'Укажите общую сумму.'}
                        </div>
                    ) : (
                        <>
                            <div className={s.hero}>
                                <div className={s.heroTop}>
                                    <span className={s.heroLabel}>Назвать заказчику</span>
                                    <span className={s.heroSide}>вам {тенге(r.cut)}</span>
                                </div>
                                <div className={s.big}>{тенге(r.customerPrice)}</div>
                                <div className={s.bar} aria-hidden>
                                    {parts.filter((p) => p.value > 0).map((p) => (
                                        <i key={p.name} style={{ width: `${(p.value / r.customerPrice) * 100}%`, background: p.color }} />
                                    ))}
                                </div>
                                <div className={s.keys}>
                                    {parts.map((p) => (
                                        <span key={p.name}><i style={{ background: p.color }} />{p.name} {тенге(p.value)}</span>
                                    ))}
                                </div>
                            </div>

                            <h2 className={s.head}>Расчёт</h2>
                            <div className={s.list}>
                                <Row label="Общая сумма" value={input.total} kind="total" />
                                <Row
                                    label="ГСМ"
                                    value={r.fuel}
                                    kind="minus"
                                    why={`${input.km.toLocaleString('ru-RU')} км × ${input.consumption.toLocaleString('ru-RU')} л на 100 км = ${r.liters.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} л × ${input.price.toLocaleString('ru-RU')} ₸`}
                                />
                                {mode === 'out' ? (
                                    <Row label="Разница: с неё считаются налоги" value={r.diff} kind="total" />
                                ) : (
                                    <>
                                        <Row label="Разница: водителю на руки" value={r.diff} kind="total" />
                                        <Row label="Начислено по ГПХ" value={r.gross} kind="total" why="поднято так, чтобы после налогов осталась разница" />
                                    </>
                                )}
                                <Row label="ОПВ 10 %" value={r.opv} kind="minus" why={`от ${from}`} />
                                <Row label="ОСМС 2 %" value={r.vosms} kind="minus" why={r.vosmsCapped ? `от ${from}, не больше чем с 1 700 000 ₸ (20 МЗП)` : `от ${from}`} />
                                <Row label="СО 5 %" value={r.so} kind="minus" why={r.soCapped ? `от ${from} минус ОПВ, не больше чем с 595 000 ₸ (7 МЗП)` : `от ${from} минус ОПВ`} />
                                <Row label="ИПН 10 %" value={r.ipn} kind="minus" why={`от ${from} минус ОПВ, ОСМС, СО${r.deductionUsed ? ` и вычет ${тенге(r.deductionUsed)}` : ''}`} />
                                <Row label="Налоги всего" value={r.taxes} />
                                <Row label="Водителю на руки" value={r.onHand} kind="total" />
                                <Row
                                    label="Себестоимость рейса"
                                    value={r.cost}
                                    why={mode === 'top' ? `ГСМ, налоги и водителю: на ${тенге(r.cost - input.total)} больше общей суммы` : 'ГСМ, налоги и водителю'}
                                />
                                <Row label={`Ваш процент ${String(Math.max(0, input.percent)).replace('.', ',')} %`} value={r.cut} kind="plus" why="от себестоимости" />
                                {r.vatSum > 0 && <Row label="НДС 16 %" value={r.vatSum} kind="plus" why="от суммы с вашим процентом" />}
                                <Row label="Назвать заказчику" value={r.customerPrice} kind="total" />
                            </div>
                            <p className={s.note}>Предварительный расчёт на один рейс в месяце. Ставки и пределы 2026 года.</p>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
