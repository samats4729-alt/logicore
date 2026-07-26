import {
    kzCurrentMonth,
    kzDaysSince,
    kzStartOfMonth,
    kzStartOfMonthShifted,
    kzStartOfToday,
    kzToday,
    kzTodayString,
} from './business-date';

/**
 * Опасное окно — с 19:00 UTC до полуночи UTC: в Казахстане уже следующие
 * сутки, а сервер по UTC всё ещё в предыдущих. Раньше именно здесь всё и
 * ломалось, поэтому проверяем в первую очередь его.
 */
const LATE_UTC = new Date('2026-07-26T20:30:00.000Z'); // 27.07, 01:30 в Алматы
const MIDDAY_UTC = new Date('2026-07-26T09:00:00.000Z'); // 26.07, 14:00 в Алматы

describe('Календарные границы по времени Казахстана', () => {
    describe('сегодняшняя дата', () => {
        it('ночью по Алматы это уже следующий день, а не вчерашний', () => {
            // Сервер по UTC сказал бы 26 июля — и счёт со сроком 27-го
            // выглядел бы «ещё не наступившим», а со сроком 26-го уже
            // просроченным на сутки раньше времени.
            expect(kzTodayString(LATE_UTC)).toBe('2026-07-27');
        });

        it('днём совпадает с UTC-датой', () => {
            expect(kzTodayString(MIDDAY_UTC)).toBe('2026-07-26');
        });

        it('отдаёт полночь UTC — как Prisma читает колонки типа «дата»', () => {
            const today = kzToday(LATE_UTC);
            expect(today.toISOString()).toBe('2026-07-27T00:00:00.000Z');
        });
    });

    describe('начало суток как момент времени', () => {
        it('казахстанские сутки начинаются в 19:00 UTC предыдущего дня', () => {
            // Для колонок с датой и временем (createdAt) нужен настоящий
            // момент, а не полночь UTC.
            expect(kzStartOfToday(LATE_UTC).toISOString()).toBe('2026-07-26T19:00:00.000Z');
        });

        it('заявка, созданная в 20:00 UTC, попадает в сегодняшние сутки', () => {
            const created = new Date('2026-07-26T20:00:00.000Z');
            expect(created >= kzStartOfToday(LATE_UTC)).toBe(true);
        });

        it('заявка, созданная в 18:00 UTC, относится к вчерашним', () => {
            const created = new Date('2026-07-26T18:00:00.000Z');
            expect(created >= kzStartOfToday(LATE_UTC)).toBe(false);
        });
    });

    describe('месяц', () => {
        it('в ночь на первое число месяц уже новый', () => {
            // 31.07 21:00 UTC = 01.08 02:00 в Алматы. По UTC это ещё июль,
            // и зарплатный период считался бы за прошлый месяц.
            const night = new Date('2026-07-31T21:00:00.000Z');
            expect(kzCurrentMonth(night)).toBe('2026-08');
        });

        it('днём последнего числа месяц ещё прежний', () => {
            const day = new Date('2026-07-31T09:00:00.000Z');
            expect(kzCurrentMonth(day)).toBe('2026-07');
        });

        it('начало месяца — 19:00 UTC последнего дня предыдущего', () => {
            expect(kzStartOfMonth(MIDDAY_UTC).toISOString()).toBe('2026-06-30T19:00:00.000Z');
        });

        it('прошлый месяц отсчитывается так же', () => {
            expect(kzStartOfMonthShifted(-1, MIDDAY_UTC).toISOString()).toBe('2026-05-31T19:00:00.000Z');
        });

        it('в январе шаг назад уходит в декабрь прошлого года', () => {
            const january = new Date('2026-01-15T09:00:00.000Z');
            expect(kzStartOfMonthShifted(-1, january).toISOString()).toBe('2025-11-30T19:00:00.000Z');
        });
    });

    describe('сколько дней прошло', () => {
        it('считает по календарю, а не по часам', () => {
            // Вчера вечером и сегодня утром — это одни сутки разницы,
            // хотя прошло меньше 24 часов.
            const yesterdayEvening = new Date('2026-07-26T13:00:00.000Z'); // 18:00 в Алматы
            const todayMorning = new Date('2026-07-27T03:00:00.000Z'); // 08:00 в Алматы
            expect(kzDaysSince(yesterdayEvening, todayMorning)).toBe(1);
        });

        it('будущая дата даёт ноль, а не отрицательное число', () => {
            const future = new Date('2026-08-10T09:00:00.000Z');
            expect(kzDaysSince(future, MIDDAY_UTC)).toBe(0);
        });
    });
});
