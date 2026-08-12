import {
    anchorLabel,
    dueDateFrom,
    invoiceTimingLabel,
    paymentConditionText,
    paymentTermsShort,
    termsAreComplete,
} from './payment-terms';

/**
 * Условия оплаты.
 *
 * Главное здесь — молчание там, где договорённости нет. Прежний код
 * подставлял «15 Календарных дней» в договор-заявку, если поле пустое, и
 * документ уходил с печатью и с сроком, о котором никто не договаривался.
 */
describe('Условия оплаты', () => {
    describe('текст для печатной формы', () => {
        it('срок и точка отсчёта попадают в договор словами', () => {
            expect(paymentConditionText(15, 'ORIGINALS'))
                .toBe('Оплата в течение 15 календарных дней с момента получения оригиналов накладных.');
        });

        it('склонение дней — как в русском языке', () => {
            expect(paymentConditionText(1, 'UNLOAD')).toContain('1 календарный день');
            expect(paymentConditionText(3, 'UNLOAD')).toContain('3 календарных дня');
            expect(paymentConditionText(5, 'UNLOAD')).toContain('5 календарных дней');
            expect(paymentConditionText(11, 'UNLOAD')).toContain('11 календарных дней');
            expect(paymentConditionText(21, 'UNLOAD')).toContain('21 календарный день');
            expect(paymentConditionText(22, 'UNLOAD')).toContain('22 календарных дня');
        });

        it('ноль дней — это оплата по факту, а не «в течение 0 дней»', () => {
            expect(paymentConditionText(0, 'UNLOAD')).toBe('Оплата по факту с момента выгрузки.');
        });

        it('без срока текста нет', () => {
            // Пусто означает «в документе про оплату ничего не печатаем» —
            // и это лучше, чем выдуманное условие под печатью.
            expect(paymentConditionText(null, 'UNLOAD')).toBeNull();
            expect(paymentConditionText(undefined, 'UNLOAD')).toBeNull();
        });

        it('без точки отсчёта текста нет: «15 дней» сами по себе ничего не значат', () => {
            expect(paymentConditionText(15, null)).toBeNull();
            expect(paymentConditionText(15, 'КОГДА-НИБУДЬ')).toBeNull();
        });

        it('отрицательный срок не печатается', () => {
            expect(paymentConditionText(-5, 'UNLOAD')).toBeNull();
        });
    });

    describe('плановая дата платежа', () => {
        it('дни прибавляются к дню события', () => {
            expect(dueDateFrom(new Date('2026-09-01T00:00:00Z'), 30))
                .toEqual(new Date('2026-10-01T00:00:00Z'));
        });

        it('переход через месяц и год считается календарём, а не арифметикой в лоб', () => {
            expect(dueDateFrom(new Date('2026-12-20T00:00:00Z'), 15))
                .toEqual(new Date('2027-01-04T00:00:00Z'));
        });

        it('время суток в срок оплаты не попадает', () => {
            // Иначе счёт со сроком «сегодня» становился просроченным в 00:01.
            expect(dueDateFrom(new Date('2026-09-01T18:45:00Z'), 0))
                .toEqual(new Date('2026-09-01T00:00:00Z'));
        });

        it('без события или без срока даты нет', () => {
            expect(dueDateFrom(null, 30)).toBeNull();
            expect(dueDateFrom(new Date('2026-09-01T00:00:00Z'), null)).toBeNull();
        });

        it('строку с датой тоже понимает', () => {
            expect(dueDateFrom('2026-09-01', 10)).toEqual(new Date('2026-09-11T00:00:00Z'));
        });

        it('мусор вместо даты не превращается в срок оплаты', () => {
            expect(dueDateFrom('не дата', 10)).toBeNull();
        });
    });

    describe('подписи на экране', () => {
        it('точка отсчёта и время выставления счёта названы по-русски', () => {
            expect(anchorLabel('ORIGINALS')).toBe('от получения оригиналов');
            expect(invoiceTimingLabel('MONTHLY')).toBe('раз в месяц одним счётом');
            expect(paymentTermsShort(15, 'UNLOAD')).toBe('15 дн. от выгрузки');
            expect(paymentTermsShort(0, 'UNLOAD')).toBe('по факту от выгрузки');
        });

        it('неизвестное значение не превращается в подпись', () => {
            expect(anchorLabel('WHENEVER')).toBeNull();
            expect(invoiceTimingLabel(null)).toBeNull();
        });
    });

    describe('полнота условий', () => {
        it('заполнены — когда известен и НДС, и срок целиком', () => {
            expect(termsAreComplete({ vatPayer: true, days: 15, anchor: 'UNLOAD' })).toBe(true);
            expect(termsAreComplete({ vatPayer: false, days: 0, anchor: 'INVOICE' })).toBe(true);
        });

        it('«не выяснено» по НДС — это не «без НДС»', () => {
            expect(termsAreComplete({ vatPayer: null, days: 15, anchor: 'UNLOAD' })).toBe(false);
        });

        it('дни без точки отсчёта — неполные условия', () => {
            expect(termsAreComplete({ vatPayer: true, days: 15, anchor: null })).toBe(false);
        });
    });
});
