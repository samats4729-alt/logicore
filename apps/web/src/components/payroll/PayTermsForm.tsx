'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money-format';
import { BonusRuleView, PayScheme, TermsEmployee } from '@/lib/payroll';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Схемы совпадают по тому, что видит человек, — служебные поля не в счёт. */
function sameScheme(a: PayScheme | null, b: PayScheme | null): boolean {
    if (!a || !b) return a === b;
    return a.fixedAmount === b.fixedAmount && a.percentValue === b.percentValue
        && a.percentBase === b.percentBase && a.accrualStatus === b.accrualStatus && a.type === b.type;
}

/**
 * Условия оплаты выбранных сотрудников — оклад, процент и бонус под галочками.
 *
 * Стоит справа от списка на вкладке «Условия оплаты»: отметили человека —
 * здесь его условия; отметили нескольких — назначаете одно и то же всем.
 *
 * Деления на «общие» и «свои» условия нет (решение владельца, 30.09.2026):
 * у каждого просто его цифры. Сняли все галочки — ничего не начисляется.
 */
export default function PayTermsForm({ employees, onSaved, onCancel }: {
    employees: TermsEmployee[];
    onSaved: () => void;
    onCancel: () => void;
}) {
    const single = employees.length === 1 ? employees[0] : null;
    const many = employees.length > 1;

    const [salaryOn, setSalaryOn] = useState(false);
    const [salary, setSalary] = useState('');
    const [percentOn, setPercentOn] = useState(false);
    const [percent, setPercent] = useState('');
    const [percentBase, setPercentBase] = useState<'MARGIN' | 'ORDER_AMOUNT'>('MARGIN');
    const [accrualStatus, setAccrualStatus] = useState('COMPLETED');
    const [bonusOn, setBonusOn] = useState(false);
    const [threshold, setThreshold] = useState('');
    const [bonusAmount, setBonusAmount] = useState('');
    /** У выбранных разные оклад и процент — поля пустые, заполняют то, что назначить всем. */
    const [mixed, setMixed] = useState(false);
    /**
     * У выбранных разные бонусы. Тогда галочка бонуса ничего не знает про
     * каждого, и пока её не трогали, бонусы остаются как были. Иначе
     * назначение оклада двоим молча стирало бонус одного из них — так и
     * случилось на проверке 30.09.2026.
     */
    const [bonusMixed, setBonusMixed] = useState(false);
    const [bonusTouched, setBonusTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    /** Кого правим — одной строкой: по ней пересобираем поля, когда выбор меняется. */
    const targetKey = employees.map(e => e.id).sort().join(',');

    // Выбор поменялся — раскладываем в поля то, что действует сейчас.
    useEffect(() => {
        const schemes = employees.map(e => e.scheme);
        const differ = schemes.some(s => !sameScheme(s, schemes[0]));
        const scheme = differ ? null : schemes[0] ?? null;
        const bonuses: (BonusRuleView | undefined)[] = employees.map(e => e.bonusRules[0]);
        const sameBonus = bonuses.every(b => b?.threshold === bonuses[0]?.threshold && b?.bonusAmount === bonuses[0]?.bonusAmount);
        const bonus = sameBonus ? bonuses[0] : undefined;

        setMixed(differ);
        setBonusMixed(!sameBonus);
        setBonusTouched(false);
        setSalaryOn(!!scheme && scheme.fixedAmount > 0 && scheme.type !== 'PERCENT');
        setSalary(scheme && scheme.fixedAmount > 0 ? String(scheme.fixedAmount) : '');
        setPercentOn(!!scheme && scheme.percentValue > 0 && scheme.type !== 'FIXED');
        setPercent(scheme && scheme.percentValue > 0 ? String(scheme.percentValue) : '');
        setPercentBase(scheme?.percentBase ?? 'MARGIN');
        setAccrualStatus(scheme?.accrualStatus ?? 'COMPLETED');
        setBonusOn(!!bonus);
        setThreshold(bonus ? String(bonus.threshold) : '');
        setBonusAmount(bonus ? String(bonus.bonusAmount) : '');
        setError(null);
        // Пересобираем по составу выбора, а не на каждую перерисовку.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetKey]);

    /** Проверяем теми же правилами, что и сервер, — и говорим, что поправить. */
    const validate = (): string | null => {
        const s = Number(parseMoneyInput(salary));
        const p = Number(percent.replace(',', '.'));
        if (salaryOn && !(s > 0)) return 'Укажите оклад — сумму в тенге больше нуля.';
        if (percentOn && !(p > 0 && p <= 100)) return 'Процент — число от 0 до 100.';
        if (bonusOn) {
            const t = Number(threshold);
            const b = Number(parseMoneyInput(bonusAmount));
            if (!Number.isInteger(t) || t < 1) return 'Для бонуса укажите, сколько рейсов закрыть за месяц — целое число.';
            if (!(b > 0)) return 'Укажите сумму бонуса.';
        }
        // Оклад и процент разные у выбранных, а поля не заполнены: сохранение
        // сняло бы всем и то и другое. Такое — только осознанно, по одному.
        if (mixed && !salaryOn && !percentOn) {
            return 'У выбранных разные оклад и процент. Отметьте, что назначить всем, — или выберите людей по одному.';
        }
        return null;
    };

    /** Условия одного человека. */
    const saveOne = async (e: TermsEmployee, body: object | null) => {
        if (body) {
            await api.put(`/payroll/schemes/user/${e.id}`, body);
        } else if (e.schemeSource === 'personal') {
            // Сняли и оклад, и процент — ничего не платим.
            await api.delete(`/payroll/schemes/user/${e.id}`);
        }
        if (!bonusMixed || bonusTouched) {
            if (bonusOn) {
                await api.put(`/payroll/kpi-rules/user/${e.id}`, {
                    threshold: Number(threshold),
                    bonusAmount: Number(parseMoneyInput(bonusAmount)),
                });
            } else if (e.bonusSource === 'personal') {
                await api.delete(`/payroll/kpi-rules/user/${e.id}`);
            }
        }
    };

    const save = async () => {
        const problem = validate();
        setError(problem);
        if (problem) return;

        const fixedAmount = salaryOn ? Number(parseMoneyInput(salary)) : 0;
        const percentValue = percentOn ? Number(percent.replace(',', '.')) : 0;
        const type = fixedAmount > 0 && percentValue > 0 ? 'HYBRID' : percentValue > 0 ? 'PERCENT' : 'FIXED';
        const body = salaryOn || percentOn ? { type, fixedAmount, percentValue, percentBase, accrualStatus } : null;

        setSaving(true);
        try {
            // По одному: если на ком-то споткнулись, остальные уже сохранены,
            // и мы говорим, на ком именно.
            const failed: string[] = [];
            for (const e of employees) {
                try { await saveOne(e, body); } catch (err) { console.error(err); failed.push(e.name); }
            }
            if (failed.length) {
                setError(`Не сохранилось у: ${failed.join(', ')}. Проверьте поля и нажмите «Сохранить» ещё раз.`);
            } else {
                toast.success(single ? `Условия сохранены: ${single.name}` : `Условия назначены ${employees.length} сотрудникам`);
            }
            onSaved();
        } finally {
            setSaving(false);
        }
    };

    const nothing = !salaryOn && !percentOn && !bonusOn && !(bonusMixed && !bonusTouched);

    return (
        <div className="space-y-4 text-[13px]">
            <div>
                <h3 className="text-[15px] font-semibold">{single ? single.name : `Выбрано сотрудников: ${employees.length}`}</h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {many ? employees.map(e => e.name).join(', ') : 'Сколько и за что платим этому сотруднику.'}
                </p>
            </div>

            {mixed && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground">
                    У выбранных сейчас разные оклад и процент. Заполните то, что назначить всем.
                </p>
            )}

            <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 font-medium">
                    <Checkbox className="rounded-[4px]" aria-label="Платить оклад" checked={salaryOn} onCheckedChange={v => setSalaryOn(v === true)} />
                    Оклад в месяц
                </label>
                {salaryOn && (
                    <div className="ml-6 flex items-center gap-2">
                        <Input aria-label="Оклад в месяц" inputMode="numeric" className="h-8 w-40 tabular-nums"
                            value={formatMoneyInput(salary)}
                            onChange={e => setSalary(parseMoneyInput(e.target.value).replace(/[^\d.]/g, ''))} />
                        <span className="text-muted-foreground">₸</span>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 font-medium">
                    <Checkbox className="rounded-[4px]" aria-label="Платить процент с рейса" checked={percentOn} onCheckedChange={v => setPercentOn(v === true)} />
                    Процент с рейса
                </label>
                {percentOn && (
                    <div className="ml-6 grid grid-cols-[80px_1fr] items-center gap-x-3 gap-y-2">
                        <Label className="text-[12px] text-muted-foreground">Процент</Label>
                        <div className="flex items-center gap-2">
                            <Input aria-label="Процент с рейса" inputMode="decimal" className="h-8 w-20 tabular-nums"
                                value={percent} onChange={e => setPercent(e.target.value.replace(/[^\d.,]/g, ''))} />
                            <span className="text-muted-foreground">%</span>
                        </div>
                        <Label className="text-[12px] text-muted-foreground">Считать от</Label>
                        <Select value={percentBase} onValueChange={v => setPercentBase(v as 'MARGIN' | 'ORDER_AMOUNT')}>
                            <SelectTrigger className="h-8" aria-label="Процент считать от"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MARGIN">маржи рейса</SelectItem>
                                <SelectItem value="ORDER_AMOUNT">суммы рейса</SelectItem>
                            </SelectContent>
                        </Select>
                        <Label className="text-[12px] text-muted-foreground">Начислять</Label>
                        <Select value={accrualStatus} onValueChange={setAccrualStatus}>
                            <SelectTrigger className="h-8" aria-label="Когда начислять процент"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="COMPLETED">когда рейс завершён</SelectItem>
                                <SelectItem value="CUSTOMER_PAID">когда заказчик оплатил</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 font-medium">
                    <Checkbox className="rounded-[4px]" aria-label="Бонус за план по рейсам" checked={bonusOn}
                        onCheckedChange={v => { setBonusOn(v === true); setBonusTouched(true); }} />
                    Бонус за план по рейсам
                </label>
                {bonusOn ? (
                    <div className="ml-6 flex flex-wrap items-center gap-2">
                        <span>за</span>
                        <Input aria-label="Рейсов за месяц" inputMode="numeric" className="h-8 w-14 tabular-nums"
                            value={threshold} onChange={e => { setThreshold(e.target.value.replace(/\D/g, '')); setBonusTouched(true); }} />
                        <span>рейсов в месяц —</span>
                        <Input aria-label="Сумма бонуса" inputMode="numeric" className="h-8 w-28 tabular-nums"
                            value={formatMoneyInput(bonusAmount)}
                            onChange={e => { setBonusAmount(parseMoneyInput(e.target.value).replace(/[^\d.]/g, '')); setBonusTouched(true); }} />
                        <span className="text-muted-foreground">₸</span>
                    </div>
                ) : bonusMixed && !bonusTouched ? (
                    <p className="ml-6 text-[12px] text-muted-foreground">
                        У выбранных разные бонусы — останутся как есть. Поставьте галочку, чтобы назначить всем один.
                    </p>
                ) : null}
            </div>

            {nothing && (
                <p className="text-[12px] text-muted-foreground">
                    Ничего не отмечено — {many ? 'выбранным' : 'сотруднику'} ничего не будет начисляться.
                </p>
            )}
            {error && <p className="text-[12px] text-destructive">{error}</p>}

            <div className="flex gap-2 pt-1">
                <Button onClick={save} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {many ? `Назначить ${employees.length} сотрудникам` : 'Сохранить'}
                </Button>
                <Button variant="outline" onClick={onCancel}>Отмена</Button>
            </div>
        </div>
    );
}
