'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, UsersRound } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/vocabulary';
import { KpiRule, TermsEmployee, TermsList, моментНачисления, рейсов, сотрудников, тенге } from '@/lib/payroll';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import BonusRulesCard from './BonusRulesCard';
import PayTermsForm from './PayTermsForm';
import styles from '@/components/nova/nova.module.css';

/**
 * Условия оплаты — «где назначить или изменить зарплату».
 *
 * Слева все сотрудники таблицей с галочками, поиском и отбором по
 * должности; справа — условия отмеченных. Отметили одного — его оклад,
 * процент и бонус; нескольких — назначаете одно и то же всем сразу.
 *
 * Раньше выбор человека был маленьким окном поверх страницы — на компьютере
 * в нём тесно и не видно, кому что уже назначено (владелец, 30.09.2026).
 */
export default function PayTermsTab({ data, rules, selectedIds, onSelect, focusKey, onSaved, onRulesChanged }: {
    data: TermsList;
    rules: KpiRule[];
    /** Отмеченные сотрудники — хранятся на странице, чтобы карточка из ведомости могла отметить человека. */
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    /** Меняется, когда нажали «Назначить зарплату» — ставим курсор в поиск. */
    focusKey: number;
    onSaved: () => void;
    onRulesChanged: () => Promise<void> | void;
}) {
    const [search, setSearch] = useState('');
    const [role, setRole] = useState('all');
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (focusKey > 0) searchRef.current?.focus();
    }, [focusKey]);

    const roles = useMemo(
        () => Array.from(new Set(data.employees.map(e => e.role))),
        [data.employees],
    );
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return data.employees.filter(e =>
            (role === 'all' || e.role === role)
            && (!q || e.name.toLowerCase().includes(q) || (ROLE_LABELS[e.role] || e.role).toLowerCase().includes(q)));
    }, [data.employees, search, role]);

    const selected = data.employees.filter(e => selectedIds.includes(e.id));
    const allVisibleSelected = visible.length > 0 && visible.every(e => selectedIds.includes(e.id));
    const unassigned = data.employees.filter(e => !e.scheme && !e.bonusRules.length).length;

    const toggle = (id: string) => onSelect(selectedIds.includes(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id]);
    const toggleAllVisible = () => onSelect(allVisibleSelected
        ? selectedIds.filter(id => !visible.some(e => e.id === id))
        : Array.from(new Set([...selectedIds, ...visible.map(e => e.id)])));

    return (
        <>
            <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_400px]">
                <section className={styles.card} style={{ marginBottom: 0 }}>
                    <div className={styles.cardHead}>
                        <UsersRound size={14} />
                        <h2 className={styles.cardTitle}>Сотрудники</h2>
                        <span className={styles.cardCount}>{data.employees.length}</span>
                        <div className="ml-auto flex items-center gap-2">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    ref={searchRef}
                                    placeholder="Поиск по имени"
                                    aria-label="Поиск сотрудника"
                                    className="h-8 w-52 bg-background pl-8 text-[13px]"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>
                            {roles.length > 1 && (
                                <Select value={role} onValueChange={setRole}>
                                    <SelectTrigger className="h-8 w-44 bg-background text-[13px]" aria-label="Должность">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Все должности</SelectItem>
                                        {roles.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r] || r}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>

                    {data.employees.length === 0 ? (
                        <div className={styles.empty}>Сотрудников пока нет — добавьте их в разделе «Сотрудники».</div>
                    ) : (
                        <Table className="border-collapse text-[13px]">
                            <TableHeader>
                                <TableRow className="border-0 border-b border-solid border-border hover:bg-transparent">
                                    <TableHead className="h-9 w-10 pl-4">
                                        <Checkbox
                                            className="rounded-[4px]"
                                            aria-label="Выбрать всех в списке"
                                            checked={allVisibleSelected}
                                            onCheckedChange={toggleAllVisible}
                                        />
                                    </TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Сотрудник</TableHead>
                                    <TableHead className="h-9 text-right text-[12.5px]">Оклад</TableHead>
                                    <TableHead className="h-9 text-[12.5px]">Процент с рейса</TableHead>
                                    {data.bonusesEnabled && <TableHead className="h-9 text-[12.5px]">Бонус за план</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visible.length === 0 ? (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                            Никого не нашли. Измените поиск или должность.
                                        </TableCell>
                                    </TableRow>
                                ) : visible.map(e => (
                                    <TermsLine
                                        key={e.id}
                                        e={e}
                                        showBonus={data.bonusesEnabled}
                                        checked={selectedIds.includes(e.id)}
                                        onToggle={() => toggle(e.id)}
                                        onOnly={() => onSelect([e.id])}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </section>

                {/* Панель условий стоит рядом со списком и не уезжает при
                    прокрутке: выбираешь людей слева — сразу видишь, что им
                    назначаешь. */}
                <aside className={`${styles.card} xl:sticky xl:top-[76px]`} style={{ marginBottom: 0 }} aria-label="Условия выбранных">
                    <div className={styles.cardHead}>
                        <SlidersHorizontal size={14} />
                        <h2 className={styles.cardTitle}>Условия оплаты</h2>
                        {selected.length > 0 && (
                            <button type="button" className="lc-link ml-auto" onClick={() => onSelect([])}>Снять выбор</button>
                        )}
                    </div>
                    <div className={styles.cardBody}>
                        {selected.length > 0 ? (
                            <PayTermsForm employees={selected} onSaved={onSaved} onCancel={() => onSelect([])} />
                        ) : (
                            <div className="space-y-3 text-[13px]">
                                <p className="font-medium">Кому назначить зарплату?</p>
                                <p className="text-muted-foreground">
                                    Отметьте сотрудника в списке — здесь появятся его оклад, процент и бонус.
                                </p>
                                <p className="text-muted-foreground">
                                    Отметьте нескольких или всех галочкой в заголовке — назначите одинаковое сразу всем.
                                </p>
                                {unassigned > 0 && (
                                    <p className="rounded-lg bg-muted/60 px-3 py-2 text-[12px]">
                                        Без условий: {сотрудников(unassigned)} — им ничего не начисляется.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </aside>
            </div>

            <div className="mt-3.5">
                <BonusRulesCard rules={rules} onChanged={onRulesChanged} />
            </div>
        </>
    );
}

function TermsLine({ e, showBonus, checked, onToggle, onOnly }: {
    e: TermsEmployee;
    showBonus: boolean;
    checked: boolean;
    onToggle: () => void;
    /** Нажали на строку — выбираем только этого человека. */
    onOnly: () => void;
}) {
    const s = e.scheme;
    const salary = s && s.fixedAmount > 0 && s.type !== 'PERCENT' ? тенге(s.fixedAmount) : '—';
    const percent = s && s.percentValue > 0 && s.type !== 'FIXED'
        ? `${s.percentValue}% от ${s.percentBase === 'ORDER_AMOUNT' ? 'суммы рейса' : 'маржи'}`
        : '—';
    return (
        <TableRow
            className={`cursor-pointer border-0 border-b border-solid border-border ${checked ? 'bg-muted/60' : ''}`}
            onClick={onOnly}
            data-state={checked ? 'selected' : undefined}
        >
            <TableCell className="pl-4" onClick={ev => ev.stopPropagation()}>
                <Checkbox className="rounded-[4px]" aria-label={`Выбрать: ${e.name}`} checked={checked} onCheckedChange={onToggle} />
            </TableCell>
            <TableCell className="py-2.5">
                <div className="flex items-center gap-1.5">
                    <span className="font-semibold">{e.name}</span>
                    {!s && !e.bonusRules.length && <span className={styles.chip}>не назначено</span>}
                </div>
                <div className="text-[12px] text-muted-foreground">{ROLE_LABELS[e.role] || e.role}</div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{salary}</TableCell>
            <TableCell>
                {percent}
                {percent !== '—' && s && <div className="text-[12px] text-muted-foreground">{моментНачисления(s.accrualStatus)}</div>}
            </TableCell>
            {showBonus && (
                <TableCell>
                    {e.bonusRules.length
                        ? e.bonusRules.map(r => <div key={r.id}>{рейсов(r.threshold)} → {тенге(r.bonusAmount)}</div>)
                        : '—'}
                </TableCell>
            )}
        </TableRow>
    );
}
