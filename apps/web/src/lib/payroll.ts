/** Сотрудник в списках выбора на странице «Зарплата». */
export interface PayrollEmployee {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string | null;
    role: string;
}

/** Правило бонуса за план: закрыл за месяц N рейсов — получил сумму. */
export interface KpiRule {
    id: string;
    userId: string | null;
    metric: string;
    threshold: number;
    bonusAmount: number;
    /** `false` — правило на паузе: бонусы за план выключены галочкой. */
    isActive: boolean;
    user?: { firstName: string; lastName: string } | null;
}

/** Схема оплаты, как её отдаёт сервер. */
export interface PayScheme {
    id: string;
    userId: string | null;
    type: 'FIXED' | 'PERCENT' | 'HYBRID';
    fixedAmount: number;
    percentValue: number;
    percentBase: 'MARGIN' | 'ORDER_AMOUNT';
    accrualStatus: string;
    isActive: boolean;
}

/** Бонус за план в условиях сотрудника. */
export interface BonusRuleView {
    id: string;
    userId: string | null;
    threshold: number;
    bonusAmount: number;
    personal: boolean;
    isActive: boolean;
}

/** Как человеку платят: своя схема или общая, свой бонус или общий. */
export interface EmployeeTerms {
    scheme: PayScheme | null;
    schemeSource: 'personal' | 'general' | null;
    bonusRules: BonusRuleView[];
    bonusSource: 'personal' | 'general';
}

/** Сотрудник на вкладке «Условия оплаты». */
export interface TermsEmployee extends PayrollEmployee, EmployeeTerms {
    name: string;
}

/** Ответ `/payroll/employees`. */
export interface TermsList {
    general: PayScheme | null;
    generalBonusRules: BonusRuleView[];
    bonusesEnabled: boolean;
    employees: TermsEmployee[];
}

/** Строка ведомости за период. */
export interface LedgerRow extends EmployeeTerms {
    userId: string;
    name: string;
    role: string;
    isActive: boolean;
    salary: number;
    percentTotal: number;
    kpiTotal: number;
    total: number;
    /** Проценты, которые ещё придут — оценка по сегодняшним ценам. */
    pendingPercent: number;
    ordersCount: number;
}

export interface Ledger {
    report: LedgerRow[];
    totals: { salary: number; percentTotal: number; kpiTotal: number; total: number; pendingPercent: number };
    bonusesEnabled: boolean;
}

/** Процент, который ещё придёт. */
export interface PendingTrip {
    orderId: string;
    orderNumber: string;
    status: string;
    reason: 'unpaid' | 'in_progress_paid' | 'in_progress';
    baseAmount: number;
    percentValue: number;
    percentBase: string;
    amount: number;
}

/** Начисление с расшифровкой. */
export interface Accrual {
    id: string;
    kind: 'SALARY' | 'PERCENT' | 'KPI';
    amount: number;
    periodMonth: string;
    baseAmount?: number | null;
    percentValue?: number | null;
    percentBase?: string | null;
    threshold?: number | null;
    reversedReason?: string | null;
    createdAt: string;
    order?: { id: string; orderNumber: string; date: string } | null;
}

/** Завершённый за месяц рейс, который засчитан в план. */
export interface PlanTrip {
    id: string;
    orderNumber: string;
    completedAt: string;
    customer: string | null;
}

/** Месяц одного человека — карточка у руководителя и «Моя зарплата». */
export interface EmployeeMonth {
    employee?: { id: string; name: string; role: string };
    accruals: Accrual[];
    totals: { salary: number; percentTotal: number; kpiTotal: number; total: number };
    bonusesEnabled: boolean;
    terms: (EmployeeTerms & { bonusesEnabled: boolean }) | null;
    bonusProgress: { ruleId: string; threshold: number; bonusAmount: number; done: number }[];
    /** Рейсы в зачёт плана за месяц — за них бонус. */
    planTrips: PlanTrip[];
    pending: PendingTrip[];
    pendingTotal: number;
}

/**
 * Как человек подписан в списке выбора.
 *
 * Раньше рядом с именем печаталось `role` как есть: «Ербай Айжан
 * (LOGISTICIAN)». Это внутреннее слово системы, к тому же не совпадающее с
 * должностью из карточки: у человека в таблице сотрудников написано
 * «Финансист», а здесь — «LOGISTICIAN». В списке нужен человек, а не то,
 * как он назван в коде.
 *
 * Отчество печатаем, когда оно есть: полных тёзок по имени и фамилии в
 * одной компании встретить проще, чем кажется.
 */
export function фио(u: PayrollEmployee): string {
    return [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ').trim();
}

/** Сумма без копеек: «150 000 ₸». Разряды — неразрывным пробелом. */
export function тенге(value: number | null | undefined): string {
    return `${Math.round(value ?? 0).toLocaleString('ru-RU')} ₸`;
}

/** Число без знака валюты — для колонок таблицы. */
export function сумма(value: number | null | undefined): string {
    return Math.round(value ?? 0).toLocaleString('ru-RU');
}

const МЕСЯЦЫ = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

/** «2026-09» → «сентябрь 2026». */
export function месяцСловом(periodMonth: string): string {
    const [year, month] = periodMonth.split('-');
    const name = МЕСЯЦЫ[Number(month) - 1];
    return name ? `${name} ${year}` : periodMonth;
}

/** «2026-09», сдвиг −1 → «2026-08». */
export function сдвигМесяца(periodMonth: string, shift: number): string {
    const [year, month] = periodMonth.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1 + shift, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** «1 рейс» / «3 рейса» / «5 рейсов». */
export function рейсов(n: number): string {
    const хвост = n % 100;
    const последняя = n % 10;
    if (хвост > 10 && хвост < 20) return `${n} рейсов`;
    if (последняя === 1) return `${n} рейс`;
    if (последняя >= 2 && последняя <= 4) return `${n} рейса`;
    return `${n} рейсов`;
}

/** «1 сотрудник» / «3 сотрудника» / «5 сотрудников». */
export function сотрудников(n: number): string {
    const хвост = n % 100;
    const последняя = n % 10;
    if (хвост > 10 && хвост < 20) return `${n} сотрудников`;
    if (последняя === 1) return `${n} сотрудник`;
    if (последняя >= 2 && последняя <= 4) return `${n} сотрудника`;
    return `${n} сотрудников`;
}

/** Когда начисляется процент — словами. */
export function моментНачисления(accrualStatus: string): string {
    return accrualStatus === 'CUSTOMER_PAID' ? 'после оплаты заказчиком' : 'после завершения рейса';
}

/**
 * Как платим — одной строкой: «оклад 150 000 ₸ + 5% от маржи после
 * завершения рейса». То, что руководитель раньше складывал в уме из трёх мест.
 */
export function условияСловами(scheme: PayScheme | null): string {
    if (!scheme) return 'не назначено';
    const parts: string[] = [];
    if (scheme.fixedAmount > 0 && scheme.type !== 'PERCENT') parts.push(`оклад ${тенге(scheme.fixedAmount)}`);
    if (scheme.percentValue > 0 && scheme.type !== 'FIXED') {
        const от = scheme.percentBase === 'ORDER_AMOUNT' ? 'от суммы рейса' : 'от маржи';
        parts.push(`${scheme.percentValue}% ${от} ${моментНачисления(scheme.accrualStatus)}`);
    }
    return parts.length ? parts.join(' + ') : 'не назначено';
}

/** Бонус за план — одной строкой: «за 3 рейса в месяц — 50 000 ₸». */
export function бонусСловами(rules: { threshold: number; bonusAmount: number }[]): string | null {
    if (!rules.length) return null;
    return rules.map(r => `за ${рейсов(r.threshold)} в месяц — ${тенге(r.bonusAmount)}`).join('; ');
}

/** Почему процент ещё не начислен — словами. */
export function причинаОжидания(reason: PendingTrip['reason']): string {
    switch (reason) {
        case 'unpaid': return 'ждёт оплаты заказчика';
        case 'in_progress_paid': return 'в работе, придёт после оплаты';
        default: return 'в работе, придёт после завершения';
    }
}
