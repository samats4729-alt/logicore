import { Prisma } from '@prisma/client';
import { orderMarginBase, resolveOrderMoney } from './order-money';

/**
 * Пересчёт сумм заявки в учётную валюту.
 *
 * Главное правило, которое здесь защищается: **суммы в разных валютах не
 * складываются и не вычитаются**. Клиент платит 1 000 долларов, перевозчику
 * уходит 300 000 тенге — «1000 минус 300000» это не убыток, это бессмыслица.
 * Поэтому маржа считается только по пересчитанным суммам, а если курса нет,
 * маржи нет вовсе.
 */
describe('Деньги заявки в учётной валюте', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);
    const RATES: Record<string, string> = { USD: '473.59', RUB: '5.94', UZS: '0.0396' };
    const rateOn = jest.fn(async (code: string) => (RATES[code] ? D(RATES[code]) : null));

    beforeEach(() => rateOn.mockClear());

    it('в тенге пересчёт равен самой сумме и в курсах не нуждается', async () => {
        const result = await resolveOrderMoney(
            { customerPrice: 230000, driverCost: 200000, currency: 'KZT', driverCostCurrency: 'KZT' },
            'KZT', rateOn,
        );
        expect(Number(result.customerPriceBase)).toBe(230000);
        expect(Number(result.driverCostBase)).toBe(200000);
        expect(rateOn).not.toHaveBeenCalled();
    });

    it('две разные валюты в одном рейсе пересчитываются каждая своим курсом', async () => {
        // Российский заказчик платит рублями, казахстанский перевозчик — в тенге.
        const result = await resolveOrderMoney(
            {
                customerPrice: 100000, currency: 'RUB',
                driverCost: 400000, driverCostCurrency: 'KZT',
                loadingDate: '2026-08-03',
            },
            'KZT', rateOn,
        );
        expect(Number(result.customerPriceBase)).toBeCloseTo(594000, 2);
        expect(Number(result.driverCostBase)).toBe(400000);
        // Маржа считается уже по одинаковым деньгам: 594 000 − 400 000.
        expect(Number(orderMarginBase(result.customerPriceBase, result.driverCostBase))).toBeCloseTo(194000, 2);
    });

    it('курс берётся на дату погрузки, а не на сегодня', async () => {
        await resolveOrderMoney(
            { customerPrice: 1000, currency: 'USD', loadingDate: '2026-07-20' },
            'KZT', rateOn, new Date('2026-08-03T10:00:00Z'),
        );
        expect(rateOn).toHaveBeenCalledWith('USD', new Date('2026-07-20T00:00:00Z'));
    });

    it('без даты погрузки берётся сегодняшний день', async () => {
        const result = await resolveOrderMoney(
            { customerPrice: 1000, currency: 'USD' },
            'KZT', rateOn, new Date('2026-08-03T10:00:00Z'),
        );
        expect(result.currencyRateDate).toEqual(new Date('2026-08-03T00:00:00Z'));
    });

    it('без курса пересчёта нет — и сумма НЕ подставляется как есть', async () => {
        // Подставить 1 000 туркменских манат как 1 000 тенге значит соврать
        // в отчёте в сто с лишним раз, причём незаметно.
        const result = await resolveOrderMoney(
            { customerPrice: 1000, currency: 'TMT' },
            'KZT', rateOn,
        );
        expect(result.customerPriceBase).toBeNull();
        expect(result.missingRates).toEqual(['TMT']);
    });

    it('нет пересчёта — нет и маржи: ноль был бы ложью', async () => {
        // «Заработали ноль» и «не знаем, сколько заработали» — разные вещи.
        expect(orderMarginBase(null, 300000)).toBeNull();
    });

    it('маржа без цены перевозчика равна всей цене клиента', async () => {
        // Своя машина: тарифа перевозчика нет вовсе, и это не «нет данных».
        expect(Number(orderMarginBase(230000, null))).toBe(230000);
    });

    it('копейки не теряются на пересчёте кратных валют', async () => {
        // Узбекский сум идёт за 100 единиц, курс за одну — 0,0396.
        const result = await resolveOrderMoney(
            { customerPrice: 12_500_000, currency: 'UZS' },
            'KZT', rateOn,
        );
        expect(Number(result.customerPriceBase)).toBeCloseTo(495000, 2);
    });

    it('пустые суммы остаются пустыми, а не превращаются в ноль', async () => {
        const result = await resolveOrderMoney({ currency: 'USD' }, 'KZT', rateOn);
        expect(result.customerPriceBase).toBeNull();
        expect(result.driverCostBase).toBeNull();
        expect(result.currencyRateDate).toBeNull();
    });

    it('код валюты в нижнем регистре не ломает пересчёт', async () => {
        const result = await resolveOrderMoney({ customerPrice: 100, currency: 'usd' }, 'KZT', rateOn);
        expect(Number(result.customerPriceBase)).toBeCloseTo(47359, 2);
    });
});
