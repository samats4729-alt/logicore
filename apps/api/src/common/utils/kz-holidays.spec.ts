import { addKzBankingDays, isKzBankingDay, kzDaysOff } from './kz-holidays';
import { dueDateFrom, paymentConditionText, paymentTermsShort } from './payment-terms';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10);

/** Отсрочка в банковских днях (задачи шефа, F3). */
describe('банковские дни Казахстана', () => {
    it('выходные — не банковские дни', () => {
        expect(isKzBankingDay(d('2026-10-24'))).toBe(false); // суббота
        expect(isKzBankingDay(d('2026-10-19'))).toBe(true); // понедельник
    });

    it('Наурыз 2026: 21–22 марта выпали на выходные — выходными стали 24 и 25 марта', () => {
        const off = kzDaysOff(2026);
        expect(off.has('2026-03-23')).toBe(true);
        expect(off.has('2026-03-24')).toBe(true);
        expect(off.has('2026-03-25')).toBe(true);
        expect(iso(addKzBankingDays(d('2026-03-20'), 1))).toBe('2026-03-26');
    });

    it('пятница + 1 банковский день — понедельник', () => {
        expect(iso(addKzBankingDays(d('2026-10-16'), 1))).toBe('2026-10-19');
    });

    it('День Республики 25 октября 2026 — воскресенье, выходной переносится на 26-е', () => {
        expect(isKzBankingDay(d('2026-10-26'))).toBe(false);
        expect(iso(addKzBankingDays(d('2026-10-23'), 1))).toBe('2026-10-27');
    });

    it('Рождество в выходной не переносится', () => {
        // 7 января 2029 — воскресенье; 8-е остаётся рабочим.
        expect(isKzBankingDay(d('2029-01-08'))).toBe(true);
    });

    it('ноль дней — тот же день', () => {
        expect(iso(addKzBankingDays(d('2026-10-21'), 0))).toBe('2026-10-21');
    });

    it('10 банковских дней длиннее 10 календарных', () => {
        const from = d('2026-10-01');
        expect(iso(dueDateFrom(from, 10))).toBe('2026-10-11');
        expect(iso(dueDateFrom(from, 10, true))).toBe('2026-10-15');
    });

    it('в договоре — «банковских дней», на экране — «банк. дн.»', () => {
        expect(paymentConditionText(10, 'UNLOAD', true)).toBe('Оплата в течение 10 банковских дней с момента выгрузки.');
        expect(paymentConditionText(1, 'INVOICE', true)).toBe('Оплата в течение 1 банковский день с даты выставления счёта.');
        expect(paymentConditionText(3, 'INVOICE', true)).toBe('Оплата в течение 3 банковских дня с даты выставления счёта.');
        expect(paymentConditionText(15, 'UNLOAD')).toBe('Оплата в течение 15 календарных дней с момента выгрузки.');
        expect(paymentTermsShort(5, 'UNLOAD', true)).toBe('5 банк. дн. от выгрузки');
    });
});
