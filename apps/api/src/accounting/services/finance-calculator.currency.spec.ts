import { FinanceCalculatorService } from './finance-calculator.service';

/**
 * Расчёт прибыли по рейсу, когда деньги в разных валютах.
 *
 * Правило одно и оно жёсткое: в расчёт идут суммы, приведённые к учётной
 * валюте. Клиент платит 1 000 долларов, перевозчику уходит 300 000 тенге —
 * «1000 минус 300000» это не убыток в 299 000, это бессмыслица.
 *
 * И отдельно: если курса не нашлось, сумма в расчёт НЕ попадает как есть.
 * Тысяча долларов, посчитанная тысячей тенге, — ошибка в четыреста раз,
 * которую по отчёту не заметить. Лучше показать, что цифра неполная, и
 * сказать об этом, чем тихо соврать.
 */
describe('Прибыль по рейсу в разных валютах', () => {
    const service = new FinanceCalculatorService();
    const compute = (order: any) => service.computeOrderFinance({
        order: { forwarderId: 'c-1', ...order },
        payments: [], incomes: [], expenses: [],
        companyId: 'c-1',
    });

    it('обычный рейс в тенге считается как раньше', () => {
        const result = compute({ customerPrice: 230000, driverCost: 200000 });
        expect(Number(result.margin)).toBe(30000);
        expect(result.unconvertedCurrencies).toEqual([]);
    });

    it('валютная выручка берётся из пересчёта, а не из исходной суммы', () => {
        // 1 000 долларов по 473,59 — это 473 590 тенге, а не 1 000.
        const result = compute({
            customerPrice: 1000, currency: 'USD', customerPriceBase: 473590,
            driverCost: 300000, driverCostCurrency: 'KZT', driverCostBase: 300000,
        });
        expect(Number(result.revenue)).toBe(473590);
        expect(Number(result.margin)).toBe(173590);
    });

    it('две валюты в одном рейсе сходятся в учётной', () => {
        // Клиент платит рублями, перевозчик получает тенге.
        const result = compute({
            customerPrice: 100000, currency: 'RUB', customerPriceBase: 594000,
            driverCost: 400000, driverCostCurrency: 'KZT', driverCostBase: 400000,
        });
        expect(Number(result.margin)).toBe(194000);
    });

    it('без курса валютная сумма в расчёт не попадает и об этом сказано', () => {
        const result = compute({
            customerPrice: 1000, currency: 'TMT', customerPriceBase: null,
            driverCost: 300000, driverCostCurrency: 'KZT', driverCostBase: 300000,
        });
        // Выручка не «1000» и не «1000 тенге» — её просто нет.
        expect(Number(result.revenue)).toBe(0);
        expect(result.unconvertedCurrencies).toEqual(['TMT']);
    });

    it('пересчёт в тенге не требуется: сумма и есть пересчёт', () => {
        // Даже если пересчёт почему-то не заполнен, рейс в тенге считается.
        const result = compute({ customerPrice: 230000, currency: 'KZT', customerPriceBase: null });
        expect(Number(result.revenue)).toBe(230000);
        expect(result.unconvertedCurrencies).toEqual([]);
    });

    it('пустая валютная сумма не считается пропавшим курсом', () => {
        // Ставки перевозчика ещё нет — это не «нет курса», это «нет ставки».
        const result = compute({
            customerPrice: 1000, currency: 'USD', customerPriceBase: 473590,
            driverCost: null, driverCostCurrency: 'USD', driverCostBase: null,
        });
        expect(result.unconvertedCurrencies).toEqual([]);
        expect(Number(result.margin)).toBe(473590);
    });
});
