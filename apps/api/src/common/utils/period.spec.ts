import { BadRequestException } from '@nestjs/common';
import { periodStart, periodEnd, calendarDay } from './period';

describe('Отчётный период', () => {
    it('календарная дата начала — полночь этих же суток', () => {
        expect(periodStart('2026-07-01')!.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    });

    it('календарная дата конца — последняя миллисекунда этих же суток', () => {
        expect(periodEnd('2026-08-17')!.toISOString()).toBe('2026-08-17T23:59:59.999Z');
    });

    it('пустой период остаётся пустым — это «без ограничения», а не ошибка', () => {
        expect(periodStart(undefined)).toBeNull();
        expect(periodEnd(null)).toBeNull();
        expect(periodStart('')).toBeNull();
    });

    /**
     * Та самая поломка: страница отдавала местную полночь в UTC, а сервер
     * брал у неё UTC-сутки и получал предыдущий день.
     */
    it('готовую границу со временем берёт как есть, не перенося на другие сутки', () => {
        // 1 июля 00:00 в Алматы (UTC+5)
        const начало = periodStart('2026-06-30T19:00:00.000Z')!;
        expect(начало.toISOString()).toBe('2026-06-30T19:00:00.000Z');
        // Момент 1 июля по местному времени в период попадает, а не остаётся до него
        expect(new Date('2026-07-01T00:00:00+05:00') >= начало).toBe(true);
    });

    it('конец со временем не растягивается на чужие сутки', () => {
        // 17 августа 23:59:59 в Алматы
        const конец = periodEnd('2026-08-17T18:59:59.999Z')!;
        expect(конец.toISOString()).toBe('2026-08-17T18:59:59.999Z');
        // 18 августа по местному времени за периодом
        expect(new Date('2026-08-18T00:00:00+05:00') > конец).toBe(true);
    });

    it('мусор вместо даты — понятная ошибка, а не молчаливый сдвиг', () => {
        expect(() => periodStart('позавчера')).toThrow(BadRequestException);
        expect(() => periodEnd('2026-13-45')).toThrow(BadRequestException);
    });

    describe('дата для показа', () => {
        it('печатает те же сутки, что и выбрали', () => {
            expect(calendarDay(periodStart('2026-07-01'))).toBe('2026-07-01');
            expect(calendarDay(periodEnd('2026-08-17'))).toBe('2026-08-17');
        });

        it('пусто остаётся пустым', () => {
            expect(calendarDay(null)).toBeNull();
            expect(calendarDay(undefined)).toBeNull();
        });
    });
});
