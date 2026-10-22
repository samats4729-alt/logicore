/**
 * Нерабочие дни Казахстана — для отсрочки в банковских днях (задачи шефа, F3).
 *
 * «Оплата в течение 10 банковских дней» — это 10 рабочих дней банка: без
 * суббот, воскресений и государственных праздников. Праздники — по Закону
 * «О праздниках в РК» и Трудовому кодексу (ст. 84–85):
 *   1–2 января — Новый год; 7 января — Рождество; 8 марта; 21–23 марта —
 *   Наурыз; 1 мая; 7 мая; 9 мая; 6 июля; 30 августа; 25 октября;
 *   16 декабря; первый день Курбан айта.
 * Если праздник выпал на субботу или воскресенье, выходным становится
 * следующий рабочий день. Религиозные праздники (Рождество, Курбан айт)
 * так не переносятся.
 *
 * Чего календарь не знает: переносов выходных постановлением правительства
 * (их объявляют каждый год отдельно) и дат Курбан айта после 2026 года — они
 * считаются по лунному календарю. В такие дни срок может выйти на день
 * раньше настоящего; дату в счёте всегда можно поправить руками.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Праздники с переносом: [месяц, день]. */
const STATE_HOLIDAYS: [number, number][] = [
    [1, 1], [1, 2], [3, 8], [3, 21], [3, 22], [3, 23],
    [5, 1], [5, 7], [5, 9], [7, 6], [8, 30], [10, 25], [12, 16],
];

/** Религиозные с постоянной датой — без переноса. */
const RELIGIOUS_FIXED: [number, number][] = [[1, 7]];

/** Первый день Курбан айта — дата каждый год своя. */
const KURBAN_AIT: Record<number, string> = {
    2025: '2025-06-06',
    2026: '2026-05-27',
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const isWeekend = (date: Date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;

const cache = new Map<number, Set<string>>();

/** Нерабочие (кроме суббот и воскресений) дни года — «ГГГГ-ММ-ДД». */
export function kzDaysOff(year: number): Set<string> {
    const cached = cache.get(year);
    if (cached) return cached;

    const off = new Set<string>();
    const holidays = STATE_HOLIDAYS.map(([m, d]) => new Date(Date.UTC(year, m - 1, d)));
    for (const day of holidays) off.add(dayKey(day));
    for (const [m, d] of RELIGIOUS_FIXED) off.add(dayKey(new Date(Date.UTC(year, m - 1, d))));
    if (KURBAN_AIT[year]) off.add(KURBAN_AIT[year]);

    // Праздник в выходной — выходным становится следующий рабочий день.
    for (const day of holidays) {
        if (!isWeekend(day)) continue;
        let next = day;
        do {
            next = new Date(next.getTime() + DAY_MS);
        } while (isWeekend(next) || off.has(dayKey(next)));
        off.add(dayKey(next));
    }

    cache.set(year, off);
    return off;
}

/** Банковский ли день (дата — полночь UTC, как у сроков оплаты). */
export function isKzBankingDay(date: Date): boolean {
    if (isWeekend(date)) return false;
    return !kzDaysOff(date.getUTCFullYear()).has(dayKey(date));
}

/**
 * Через `days` банковских дней после `from`. Сам день `from` не считается —
 * как и в календарной отсрочке. Ноль дней — тот же день («по факту»).
 */
export function addKzBankingDays(from: Date, days: number): Date {
    let date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    let left = days;
    while (left > 0) {
        date = new Date(date.getTime() + DAY_MS);
        if (isKzBankingDay(date)) left--;
    }
    return date;
}
