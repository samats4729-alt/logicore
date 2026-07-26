/**
 * Календарные границы по времени Казахстана.
 *
 * Сервер живёт в UTC, а работают люди в Казахстане: UTC+5. Из-за этого всё,
 * что считалось «сегодня» через `new Date()`, с полуночи до 05:00 по Алматы
 * показывало вчерашний день. Практические последствия были такие:
 *   - счёт со сроком оплаты «сегодня» ночью уже числился просроченным;
 *   - первого числа ночью зарплатный период считался за прошлый месяц;
 *   - лимит тарифа «заявок в месяц» ночью первого числа ещё не обнулялся.
 *
 * С марта 2024 в РК один часовой пояс без переводов стрелок, поэтому здесь
 * достаточно постоянного смещения, а не полноценной базы часовых поясов.
 * Если пояс когда-нибудь изменится — правится только эта константа.
 */
export const KZ_UTC_OFFSET_MINUTES = 5 * 60;

const MINUTE = 60 * 1000;

/** Часы и дата так, как их видит человек в Казахстане. */
function kzParts(at: Date = new Date()) {
    const shifted = new Date(at.getTime() + KZ_UTC_OFFSET_MINUTES * MINUTE);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
    };
}

/**
 * Сегодняшняя дата Казахстана как «дата без времени».
 *
 * Для колонок `@db.Date` (срок оплаты, дата документа): Postgres хранит их
 * без времени, а Prisma отдаёт полуночью UTC. Сравнивать их нужно с такой
 * же полуночью UTC, но от казахстанского календарного дня.
 */
export function kzToday(at: Date = new Date()): Date {
    const { year, month, day } = kzParts(at);
    return new Date(Date.UTC(year, month, day));
}

/**
 * Момент, когда в Казахстане начались сегодняшние сутки.
 *
 * Для колонок `DateTime` (createdAt и подобные): здесь нужен настоящий
 * момент времени, а он наступает в 19:00 UTC предыдущего дня.
 */
export function kzStartOfToday(at: Date = new Date()): Date {
    return new Date(kzToday(at).getTime() - KZ_UTC_OFFSET_MINUTES * MINUTE);
}

/** Момент начала текущего месяца по Казахстану. */
export function kzStartOfMonth(at: Date = new Date()): Date {
    const { year, month } = kzParts(at);
    return new Date(Date.UTC(year, month, 1) - KZ_UTC_OFFSET_MINUTES * MINUTE);
}

/** Момент начала месяца со сдвигом: -1 — прошлый месяц. */
export function kzStartOfMonthShifted(shift: number, at: Date = new Date()): Date {
    const { year, month } = kzParts(at);
    return new Date(Date.UTC(year, month + shift, 1) - KZ_UTC_OFFSET_MINUTES * MINUTE);
}

/** Текущий месяц Казахстана строкой `YYYY-MM` — ключ зарплатного периода. */
export function kzCurrentMonth(at: Date = new Date()): string {
    const { year, month } = kzParts(at);
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Сегодняшняя дата Казахстана строкой `YYYY-MM-DD`. */
export function kzTodayString(at: Date = new Date()): string {
    return kzToday(at).toISOString().slice(0, 10);
}

/** Сколько полных суток прошло с даты по казахстанскому календарю. */
export function kzDaysSince(date: Date | string, at: Date = new Date()): number {
    const from = kzToday(new Date(date));
    const diff = kzToday(at).getTime() - from.getTime();
    return Math.max(0, Math.floor(diff / (24 * 60 * MINUTE)));
}
