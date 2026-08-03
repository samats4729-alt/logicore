import { PaymentDirection, Prisma } from '@prisma/client';
import { FinanceCalculatorService } from './finance-calculator.service';
import { FinancialReportsService } from './financial-reports.service';

/**
 * Валюта в отчётах.
 *
 * Отчёты ведутся в тенге. Это значит две вещи, и обе одинаково важны:
 * валютная сумма должна попасть в отчёт пересчитанной по своему курсу, а
 * если курса нет — не попасть вовсе и быть названной отдельно. Молча взять
 * тысячу долларов за тысячу тенге хуже обоих вариантов: такую ошибку в
 * отчёте не видно.
 */
describe('Валюта в отчётах', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);

    describe('прибыль по рейсу', () => {
        const calculator = new FinanceCalculatorService();

        const compute = (order: any, payments: any[] = []) => calculator.computeOrderFinance({
            order: { forwarderId: 'c-1', customerCompanyId: 'cust', ...order },
            payments, incomes: [], expenses: [], companyId: 'c-1',
        });

        it('валютный платёж считается по своему курсу, а не как есть', () => {
            // Заявка на 500 000 ₸, пришла тысяча долларов по 500.
            // Это ровно 500 000 ₸ — заявка оплачена полностью.
            const fin = compute(
                { customerPrice: D('500000'), driverCost: D('0') },
                [{
                    direction: PaymentDirection.IN, companyId: 'c-1',
                    amount: D('1000'), currency: 'USD', amountBase: D('500000'),
                }],
            );

            expect(Number(fin.paidIn)).toBe(500000);
            expect(Number(fin.customerDebt)).toBe(0);
        });

        it('платёж без курса в сумму не попадает и валюта названа', () => {
            const fin = compute(
                { customerPrice: D('500000'), driverCost: D('0') },
                [{
                    direction: PaymentDirection.IN, companyId: 'c-1',
                    amount: D('1000'), currency: 'USD', amountBase: null,
                }],
            );

            expect(Number(fin.paidIn)).toBe(0);
            expect(fin.unconvertedCurrencies).toContain('USD');
        });

        it('тенговый платёж работает как раньше', () => {
            const fin = compute(
                { customerPrice: D('500000'), driverCost: D('0') },
                [{ direction: PaymentDirection.IN, companyId: 'c-1', amount: D('200000'), currency: 'KZT', amountBase: D('200000') }],
            );

            expect(Number(fin.paidIn)).toBe(200000);
            expect(fin.unconvertedCurrencies).toHaveLength(0);
        });

        it('ставка суб-экспедитора в валюте заявки тоже пересчитывается', () => {
            // Заявка в долларах: 2 000 $ заказчику по 500, 1 500 $
            // суб-экспедитору. Затрата — 750 000 ₸, а не «1 500».
            const fin = compute({
                customerPrice: D('2000'), customerPriceBase: D('1000000'),
                currency: 'USD',
                subForwarderId: 'sub-1', subForwarderPrice: D('1500'),
            });

            expect(Number(fin.revenue)).toBe(1000000);
            expect(Number(fin.executorCost)).toBe(750000);
            expect(Number(fin.margin)).toBe(250000);
        });

        it('своя валюта у ставки суб-экспедитора берётся из заявки, а не из её валюты', () => {
            // Заявка в долларах, а с перевозчиком договорились в тенге.
            // Его 515 228 ₸ обязаны остаться тенге, а не стать долларами:
            // валюту заявки поменяли, договорённость с перевозчиком — нет.
            const fin = compute({
                customerPrice: D('2000'), customerPriceBase: D('1000000'), currency: 'USD',
                subForwarderId: 'sub-1', subForwarderPrice: D('515228'),
                subForwarderPriceCurrency: 'KZT', subForwarderPriceBase: D('515228'),
            });

            expect(Number(fin.executorCost)).toBe(515228);
            expect(Number(fin.margin)).toBe(484772);
        });

        it('без курса валютная ставка суб-экспедитора в затраты не попадает', () => {
            const fin = compute({
                customerPrice: D('2000'), customerPriceBase: null, currency: 'USD',
                subForwarderId: 'sub-1', subForwarderPrice: D('1500'),
            });

            expect(Number(fin.executorCost)).toBe(0);
            expect(fin.unconvertedCurrencies).toContain('USD');
        });
    });

    describe('курсовые разницы за период', () => {
        const build = (rows: any[]) => {
            const prisma: any = {
                accountingPaymentAllocation: { findMany: jest.fn().mockResolvedValue(rows) },
            };
            const service = new FinancialReportsService(
                prisma, {} as any, {} as any, new FinanceCalculatorService(),
                {} as any, {} as any, {} as any, {} as any,
            );
            return { service, prisma };
        };

        const allocation = (diff: string, direction: 'OUTGOING' | 'INCOMING') => ({
            amount: D('1000'), amountBase: D('500000'), exchangeDiff: D(diff),
            document: {
                id: 'd-1', number: 'СЧ-1', direction, currency: 'USD',
                exchangeRate: D('470'), counterparty: { name: 'Магнум' },
            },
            payment: { id: 'p-1', date: new Date('2026-08-03'), currency: 'USD', exchangeRate: D('500') },
        });

        it('по нашим счетам лишние тенге собираются в доход', async () => {
            const { service } = build([allocation('30000', 'OUTGOING')]);
            const result = await service.getExchangeDifferences('c-1', { start: null, end: null });

            expect(result.gain).toBe(30000);
            expect(result.loss).toBe(0);
            expect(result.net).toBe(30000);
        });

        it('по счетам поставщиков те же тенге — расход', async () => {
            const { service } = build([allocation('30000', 'INCOMING')]);
            const result = await service.getExchangeDifferences('c-1', { start: null, end: null });

            expect(result.gain).toBe(0);
            expect(result.loss).toBe(30000);
            expect(result.net).toBe(-30000);
        });

        it('доход и расход не гасят друг друга в отчёте, а показываются оба', async () => {
            // Бухгалтеру нужно видеть обе стороны: «ноль» вместо «выиграли
            // 30 000 и потеряли 30 000» скрывает движение денег.
            const { service } = build([
                allocation('30000', 'OUTGOING'),
                allocation('30000', 'INCOMING'),
            ]);
            const result = await service.getExchangeDifferences('c-1', { start: null, end: null });

            expect(result.gain).toBe(30000);
            expect(result.loss).toBe(30000);
            expect(result.net).toBe(0);
        });

        it('период считается по дате платежа, а не по дате счёта', async () => {
            // Разница возникает в тот день, когда пришли деньги.
            const { service, prisma } = build([]);
            const start = new Date('2026-08-01');
            const end = new Date('2026-08-31');
            await service.getExchangeDifferences('c-1', { start, end });

            const where = prisma.accountingPaymentAllocation.findMany.mock.calls[0][0].where;
            expect(where.payment.date).toEqual({ gte: start, lte: end });
        });

        it('чужие компании в отчёт не попадают', async () => {
            const { service, prisma } = build([]);
            await service.getExchangeDifferences('c-1', { start: null, end: null });

            const where = prisma.accountingPaymentAllocation.findMany.mock.calls[0][0].where;
            expect(where.document.companyId).toBe('c-1');
        });

        it('в строке видно оба курса — по какому выставили и по какому пришло', async () => {
            const { service } = build([allocation('30000', 'OUTGOING')]);
            const result = await service.getExchangeDifferences('c-1', { start: null, end: null });

            expect(result.rows[0].documentRate).toBe(470);
            expect(result.rows[0].paymentRate).toBe(500);
            expect(result.rows[0].outcome).toBe('GAIN');
        });

        it('у тенгового платежа по валютному счёту показан курс погашения, а не единица', async () => {
            // Долларовый счёт погасили тенге: у самого платежа курс 1 — тенге
            // к тенге. Показать эту единицу рядом с курсом счёта 470 значит
            // сбить бухгалтера с толку. Считаем от факта: 1 000 000 ₸ закрыли
            // 2 000 $, значит долг закрыт по 500.
            const { service } = build([{
                amount: D('2000'), amountBase: D('1000000'), exchangeDiff: D('60340'),
                document: {
                    id: 'd-2', number: 'СЧ-2', direction: 'OUTGOING', currency: 'USD',
                    exchangeRate: D('469.83'), counterparty: { name: 'Магнум' },
                },
                payment: { id: 'p-2', date: new Date('2026-08-03'), currency: 'KZT', exchangeRate: D('1') },
            }]);
            const result = await service.getExchangeDifferences('c-1', { start: null, end: null });

            expect(result.rows[0].paymentRate).toBe(500);
        });
    });
});
