import { Prisma } from '@prisma/client';
import { MissingRateError, exchangeOutcome, settleAllocation } from './exchange-difference';

/**
 * Курсовая разница.
 *
 * Проверяется главный сценарий валютного учёта: счёт выставлен по одному
 * курсу, деньги пришли по другому. Долг обязан закрыться полностью (клиент
 * прислал ровно то, что должен), а разница в тенге — встать отдельной
 * суммой, а не раствориться в выручке.
 */
describe('Курсовая разница при оплате счёта', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);
    const num = (v: Prisma.Decimal) => Number(v);

    describe('оплата в валюте счёта', () => {
        it('курс вырос — долг закрыт целиком, лишние тенге стали разницей', () => {
            const result = settleAllocation({
                part: D('1000'), paymentCurrency: 'USD', paymentRate: D('480'),
                documentCurrency: 'USD', documentRate: D('473'),
            });

            expect(num(result.closed)).toBe(1000);
            expect(num(result.amountBase)).toBe(480000);
            expect(num(result.exchangeDiff)).toBe(7000);
        });

        it('курс упал — разница уходит в минус, а долг всё равно закрыт', () => {
            const result = settleAllocation({
                part: D('1000'), paymentCurrency: 'USD', paymentRate: D('465'),
                documentCurrency: 'USD', documentRate: D('473'),
            });

            expect(num(result.closed)).toBe(1000);
            expect(num(result.exchangeDiff)).toBe(-8000);
        });

        it('курс не менялся — никакой разницы нет', () => {
            const result = settleAllocation({
                part: D('1000'), paymentCurrency: 'USD', paymentRate: D('473'),
                documentCurrency: 'USD', documentRate: D('473'),
            });

            expect(num(result.exchangeDiff)).toBe(0);
        });

        it('частичная оплата даёт разницу только со своей части', () => {
            // Пришло 400 из 1000 долларов: разница считается с четырёхсот,
            // остальные 600 ещё не пришли и никакой разницы не создали.
            const result = settleAllocation({
                part: D('400'), paymentCurrency: 'USD', paymentRate: D('480'),
                documentCurrency: 'USD', documentRate: D('473'),
            });

            expect(num(result.closed)).toBe(400);
            expect(num(result.exchangeDiff)).toBe(2800);
        });

        it('копейки не создают хвоста долга', () => {
            // 333.33 USD закрывают ровно 333.33 USD долга.
            const result = settleAllocation({
                part: D('333.33'), paymentCurrency: 'USD', paymentRate: D('473.59'),
                documentCurrency: 'USD', documentRate: D('473.59'),
            });

            expect(num(result.closed)).toBe(333.33);
            expect(num(result.exchangeDiff)).toBe(0);
        });

        it('счёт в сумах закрывается сумами до копейки', () => {
            // Один сум стоит около четырёх копеек, и если такую сумму гонять
            // в тенге и обратно, она возвращается другой: 1 200 000,37 сума
            // превращаются в 1 200 000,27. Десять сумов «долга» остались бы
            // висеть на счёте навсегда — оплачен, но не полностью.
            const result = settleAllocation({
                part: D('1200000.37'), paymentCurrency: 'UZS', paymentRate: D('0.0372'),
                documentCurrency: 'UZS', documentRate: D('0.0372'),
            });

            expect(result.closed.toFixed(2)).toBe('1200000.37');
        });
    });

    describe('всё в тенге — как было до валют', () => {
        it('тенговый платёж по тенговому счёту разницы не даёт', () => {
            const result = settleAllocation({
                part: D('230000'), paymentCurrency: 'KZT', documentCurrency: 'KZT',
            });

            expect(num(result.closed)).toBe(230000);
            expect(num(result.amountBase)).toBe(230000);
            expect(num(result.exchangeDiff)).toBe(0);
        });

        it('тенге не требуют курса ниоткуда', () => {
            // Обычная оплата не должна зависеть от того, загрузился ли
            // справочник курсов.
            expect(() => settleAllocation({
                part: D('1000'), paymentCurrency: 'KZT', documentCurrency: 'KZT',
                paymentRate: null, documentRate: null,
            })).not.toThrow();
        });
    });

    describe('оплата в другой валюте', () => {
        it('тенгами гасят долларовый счёт по курсу дня оплаты', () => {
            // Клиенту выставили 1 000 USD по 473. Он прислал 480 000 ₸,
            // когда доллар стоил 480, — это ровно тысяча долларов, долг
            // закрыт, а 7 000 ₸ сверх записанного стали разницей.
            const result = settleAllocation({
                part: D('480000'), paymentCurrency: 'KZT',
                documentCurrency: 'USD', documentRate: D('473'),
                documentCurrencyRateOnPaymentDate: D('480'),
            });

            expect(num(result.closed)).toBe(1000);
            expect(num(result.amountBase)).toBe(480000);
            expect(num(result.exchangeDiff)).toBe(7000);
        });

        it('недоплата в тенге закрывает долг только частично', () => {
            const result = settleAllocation({
                part: D('240000'), paymentCurrency: 'KZT',
                documentCurrency: 'USD', documentRate: D('473'),
                documentCurrencyRateOnPaymentDate: D('480'),
            });

            expect(num(result.closed)).toBe(500);
            expect(num(result.exchangeDiff)).toBe(3500);
        });

        it('курс счёта берётся на дату платежа, а не из самого счёта', () => {
            // Если бы тенге переводили в доллары по курсу счёта, курсовой
            // разницы не возникало бы никогда — она бы просто исчезла.
            const result = settleAllocation({
                part: D('473000'), paymentCurrency: 'KZT',
                documentCurrency: 'USD', documentRate: D('473'),
                documentCurrencyRateOnPaymentDate: D('480'),
            });

            expect(num(result.closed)).toBeCloseTo(985.42, 2);
            expect(num(result.exchangeDiff)).not.toBe(0);
        });

        it('валюта платежа тоже переводится в тенге по своему курсу', () => {
            // Рублями гасят долларовый счёт: сначала рубли в тенге, потом
            // тенге в доллары.
            const result = settleAllocation({
                part: D('100000'), paymentCurrency: 'RUB', paymentRate: D('4.8'),
                documentCurrency: 'USD', documentRate: D('473'),
                documentCurrencyRateOnPaymentDate: D('480'),
            });

            expect(num(result.amountBase)).toBe(480000);
            expect(num(result.closed)).toBe(1000);
            expect(num(result.exchangeDiff)).toBe(7000);
        });
    });

    describe('когда курса нет', () => {
        it('валютный платёж без курса не считается вовсе', () => {
            expect(() => settleAllocation({
                part: D('1000'), paymentCurrency: 'USD', paymentRate: null,
                documentCurrency: 'USD', documentRate: D('473'),
            })).toThrow(MissingRateError);
        });

        it('счёт без зафиксированного курса не гасится', () => {
            expect(() => settleAllocation({
                part: D('1000'), paymentCurrency: 'USD', paymentRate: D('480'),
                documentCurrency: 'USD', documentRate: null,
            })).toThrow(MissingRateError);
        });

        it('в отказе названа валюта, которой не хватает', () => {
            expect(() => settleAllocation({
                part: D('480000'), paymentCurrency: 'KZT',
                documentCurrency: 'USD', documentRate: D('473'),
                documentCurrencyRateOnPaymentDate: null,
            })).toThrow(/USD/);
        });

        it('нулевой курс — это отсутствие курса, а не курс', () => {
            // Иначе деление на ноль дало бы бесконечность в сумме долга.
            expect(() => settleAllocation({
                part: D('1000'), paymentCurrency: 'USD', paymentRate: D('0'),
                documentCurrency: 'USD', documentRate: D('473'),
            })).toThrow(MissingRateError);
        });
    });

    describe('доход это или расход', () => {
        it('по нашему счёту лишние тенге — доход', () => {
            const { outcome, amount } = exchangeOutcome(D('7000'), 'OUTGOING');
            expect(outcome).toBe('GAIN');
            expect(num(amount)).toBe(7000);
        });

        it('по счёту поставщика те же лишние тенге — расход', () => {
            // Мы отдали за долг больше тенге, чем записали затратой.
            const { outcome, amount } = exchangeOutcome(D('7000'), 'INCOMING');
            expect(outcome).toBe('LOSS');
            expect(num(amount)).toBe(-7000);
        });

        it('падение курса по нашему счёту — потеря', () => {
            expect(exchangeOutcome(D('-8000'), 'OUTGOING').outcome).toBe('LOSS');
        });

        it('падение курса по счёту поставщика — выгода', () => {
            expect(exchangeOutcome(D('-8000'), 'INCOMING').outcome).toBe('GAIN');
        });

        it('нулевая разница не считается ни тем, ни другим', () => {
            expect(exchangeOutcome(D('0'), 'OUTGOING').outcome).toBe('NONE');
        });
    });
});
