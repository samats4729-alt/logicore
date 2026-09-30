'use client';

import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { UserPlus } from 'lucide-react';
import styles from '@/components/nova/nova.module.css';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { KpiRule, TermsList } from '@/lib/payroll';
import MonthSwitcher from '@/components/payroll/MonthSwitcher';
import PayrollLedger from '@/components/payroll/PayrollLedger';
import PayTermsTab from '@/components/payroll/PayTermsTab';
import EmployeeMonthSheet from '@/components/payroll/EmployeeMonthSheet';

/**
 * Зарплата — две вкладки на два вопроса руководителя.
 *
 * «Ведомость» — кому и сколько платить за месяц; нажатие на человека
 * открывает его начисления. «Условия оплаты» — где назначить и изменить,
 * сколько и за что платим каждому: список сотрудников с галочками и панель
 * условий рядом.
 *
 * Раньше это был набор блоков «общая схема», «свои условия», «бонусы» и
 * отдельный отчёт — и чтобы понять, что получает конкретный сотрудник,
 * приходилось складывать их в уме.
 */
export default function PayrollPage() {
    const [tab, setTab] = useState<'ledger' | 'terms'>('ledger');
    const currentMonth = dayjs().format('YYYY-MM');
    const [month, setMonth] = useState(currentMonth);
    const [reloadKey, setReloadKey] = useState(0);

    const [terms, setTerms] = useState<TermsList | null>(null);
    const [rules, setRules] = useState<KpiRule[]>([]);
    const [termsFailed, setTermsFailed] = useState(false);

    const [sheetUser, setSheetUser] = useState<string | null>(null);
    /** Отмеченные на вкладке «Условия оплаты». */
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    /** Нажали «Назначить зарплату» — вкладка ставит курсор в поиск. */
    const [focusKey, setFocusKey] = useState(0);

    const loadTerms = useCallback(async () => {
        try {
            const [termsRes, rulesRes] = await Promise.all([
                api.get('/payroll/employees'),
                api.get('/payroll/kpi-rules'),
            ]);
            setTerms(termsRes.data);
            setRules(rulesRes.data || []);
            setTermsFailed(false);
        } catch (err) {
            console.error('Failed to load payroll terms', err);
            setTermsFailed(true);
        }
    }, []);

    useEffect(() => { loadTerms(); }, [loadTerms]);

    /** Что-то поменяли в условиях — перечитываем и условия, и ведомость. */
    const afterChange = useCallback(async () => {
        await loadTerms();
        setReloadKey(k => k + 1);
    }, [loadTerms]);

    /** «Изменить» из карточки сотрудника — на вкладку условий, человек отмечен. */
    const editEmployee = (userId: string) => {
        setSheetUser(null);
        setSelectedIds([userId]);
        setTab('terms');
    };

    const assignSalary = () => {
        setTab('terms');
        setFocusKey(k => k + 1);
    };

    return (
        <div className={`${styles.page} ${styles.pageWide}`}>
            <div className={styles.hero}>
                <div>
                    <div className={styles.eyebrow}>Деньги · Зарплата</div>
                    <h1 className={styles.title}>Зарплата</h1>
                    <p className={styles.subtitle}>
                        Кому и сколько платим: оклад, процент с рейса и бонус за план.
                    </p>
                </div>
                <div className={styles.heroActions}>
                    {tab === 'ledger' && <MonthSwitcher value={month} max={currentMonth} onChange={setMonth} />}
                    {/* Главное действие страницы — на виду с обеих вкладок.
                        Ведёт к списку сотрудников с галочками и панели условий. */}
                    <Button className="h-9 rounded-[10px]" onClick={assignSalary}>
                        <UserPlus className="h-4 w-4" /> Назначить зарплату
                    </Button>
                </div>
            </div>

            <div className={styles.pills} style={{ marginBottom: 14 }}>
                <button
                    type="button"
                    className={`${styles.pill} ${tab === 'ledger' ? styles.pillActive : ''}`}
                    onClick={() => setTab('ledger')}
                >
                    Ведомость
                </button>
                <button
                    type="button"
                    className={`${styles.pill} ${tab === 'terms' ? styles.pillActive : ''}`}
                    onClick={() => setTab('terms')}
                >
                    Условия оплаты
                </button>
            </div>

            {tab === 'ledger' ? (
                <PayrollLedger month={month} reloadKey={reloadKey} onOpenEmployee={setSheetUser} />
            ) : termsFailed ? (
                <div className={styles.card}>
                    <div className={styles.empty}>Не удалось загрузить условия оплаты. Обновите страницу.</div>
                </div>
            ) : !terms ? (
                <div className={`${styles.card} h-64 animate-pulse`} />
            ) : (
                <PayTermsTab
                    data={terms}
                    rules={rules}
                    selectedIds={selectedIds}
                    onSelect={setSelectedIds}
                    focusKey={focusKey}
                    onSaved={afterChange}
                    onRulesChanged={afterChange}
                />
            )}

            <EmployeeMonthSheet
                userId={sheetUser}
                month={month}
                reloadKey={reloadKey}
                open={!!sheetUser}
                onOpenChange={o => { if (!o) setSheetUser(null); }}
                onEditTerms={editEmployee}
            />
        </div>
    );
}
