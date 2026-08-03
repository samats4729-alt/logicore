import { Prisma } from '@prisma/client';
import { accountBaseBefore, debtBaseBefore, revalue } from './currency-revaluation';

/**
 * Переоценка валютных остатков.
 *
 * Проверяется главное: разница считается от учётной стоимости остатка, а не
 * от его первоначальной, и вторая переоценка не считает ту же разницу
 * второй раз. Плюс знак: подорожавший долг перевозчику — это потеря, а не
 * доход, хотя число такое же, как у подорожавшего долга клиента.
 */
describe('Переоценка валютных остатков', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);
    const num = (v: Prisma.Decimal) => Number(v);

    describe('валютный счёт', () => {
        it('доллары подорожали — остаток вырос, это доход', () => {
            // 1 000 $ числились по 470, на конец месяца курс 500.
            const line = revalue({
                kind: 'ACCOUNT', currency: 'USD',
                amount: D('1000'), baseBefore: D('470000'), rate: D('500'),
            });

            expect(num(line.baseAfter)).toBe(500000);
            expect(num(line.diff)).toBe(30000);
            expect(line.outcome).toBe('GAIN');
        });

        it('доллары подешевели — это потеря', () => {
            const line = revalue({
                kind: 'ACCOUNT', currency: 'USD',
                amount: D('1000'), baseBefore: D('500000'), rate: D('470'),
            });

            expect(num(line.diff)).toBe(-30000);
            expect(line.outcome).toBe('LOSS');
        });

        it('курс не двигался — переоценивать нечего', () => {
            const line = revalue({
                kind: 'ACCOUNT', currency: 'USD',
                amount: D('1000'), baseBefore: D('500000'), rate: D('500'),
            });

            expect(num(line.diff)).toBe(0);
            expect(line.outcome).toBe('NONE');
        });
    });

    describe('долг клиента', () => {
        it('подорожал — нам должны больше тенге, это доход', () => {
            const line = revalue({
                kind: 'RECEIVABLE', currency: 'USD',
                amount: D('900'), baseBefore: D('423000'), rate: D('500'),
            });

            expect(num(line.baseAfter)).toBe(450000);
            expect(num(line.diff)).toBe(27000);
            expect(line.outcome).toBe('GAIN');
        });
    });

    describe('наш долг перевозчику', () => {
        it('подорожал — отдавать больше тенге, это расход', () => {
            // То же число, что у долга клиента, но смысл обратный.
            const line = revalue({
                kind: 'PAYABLE', currency: 'USD',
                amount: D('900'), baseBefore: D('423000'), rate: D('500'),
            });

            expect(num(line.diff)).toBe(27000);
            expect(line.outcome).toBe('LOSS');
        });

        it('подешевел — отдавать меньше, это выгода', () => {
            const line = revalue({
                kind: 'PAYABLE', currency: 'USD',
                amount: D('900'), baseBefore: D('450000'), rate: D('470'),
            });

            expect(num(line.diff)).toBe(-27000);
            expect(line.outcome).toBe('GAIN');
        });
    });

    describe('учётная стоимость долга', () => {
        it('первый раз считается по курсу документа', () => {
            expect(num(debtBaseBefore(D('1000'), D('470'))!)).toBe(470000);
        });

        it('после переоценки — по курсу последней переоценки', () => {
            // Иначе следующая переоценка посчитала бы разницу от курса
            // документа ещё раз, и одни и те же тенге попали бы в отчёт
            // дважды.
            expect(num(debtBaseBefore(D('1000'), D('470'), D('500'))!)).toBe(500000);
        });

        it('без курса документа считать не из чего', () => {
            expect(debtBaseBefore(D('1000'), null)).toBeNull();
        });

        it('нулевой курс — это отсутствие курса', () => {
            expect(debtBaseBefore(D('1000'), D('0'))).toBeNull();
        });
    });

    describe('учётная стоимость остатка на счёте', () => {
        it('первый раз — начальный остаток плюс движения', () => {
            const base = accountBaseBefore({
                previousBase: null, openingBase: D('100000'), movementsBase: D('400000'),
            });

            expect(num(base!)).toBe(500000);
        });

        it('после переоценки точкой отсчёта служит она, а не начальный остаток', () => {
            const base = accountBaseBefore({
                previousBase: D('520000'), openingBase: D('100000'), movementsBase: D('50000'),
            });

            expect(num(base!)).toBe(570000);
        });

        it('расход уменьшает учётную стоимость', () => {
            const base = accountBaseBefore({
                previousBase: D('520000'), openingBase: null, movementsBase: D('-120000'),
            });

            expect(num(base!)).toBe(400000);
        });

        it('без точки отсчёта переоценить счёт нельзя', () => {
            // Начальный остаток введён в валюте, а курса на его дату нет —
            // выдумывать стартовую сумму в тенге мы не будем.
            expect(accountBaseBefore({
                previousBase: null, openingBase: null, movementsBase: D('50000'),
            })).toBeNull();
        });
    });

    describe('две переоценки подряд', () => {
        it('вторая считает только своё движение курса, а не всё сначала', () => {
            // Счёт выставлен по 470. Конец июля — курс 500, разница 30 000.
            const july = revalue({
                kind: 'RECEIVABLE', currency: 'USD',
                amount: D('1000'), baseBefore: debtBaseBefore(D('1000'), D('470'))!, rate: D('500'),
            });
            expect(num(july.diff)).toBe(30000);

            // Конец августа — курс 510. Разница должна быть 10 000, а не
            // 40 000: тридцать тысяч уже учтены в июле.
            const august = revalue({
                kind: 'RECEIVABLE', currency: 'USD',
                amount: D('1000'), baseBefore: debtBaseBefore(D('1000'), D('470'), D('500'))!, rate: D('510'),
            });
            expect(num(august.diff)).toBe(10000);
        });

        it('в сумме две переоценки дают ровно движение курса за оба месяца', () => {
            const july = revalue({
                kind: 'RECEIVABLE', currency: 'USD',
                amount: D('1000'), baseBefore: D('470000'), rate: D('500'),
            });
            const august = revalue({
                kind: 'RECEIVABLE', currency: 'USD',
                amount: D('1000'), baseBefore: july.baseAfter, rate: D('510'),
            });

            expect(num(july.diff) + num(august.diff)).toBe(40000);
            expect(num(august.baseAfter)).toBe(510000);
        });
    });
});
