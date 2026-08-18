import * as XLSX from 'xlsx';
import { OrdersExportService } from './orders-export.service';
import { FinanceCalculatorService } from '../accounting/services/finance-calculator.service';
import { D } from '../common/utils/money';

/**
 * Что попадает в выгруженный файл — и что попадать не должно.
 *
 * Выгрузка отдаёт файл, и дальше он живёт сам: его пересылают, кладут в
 * почту, открывают у себя. Значит, к ней те же требования, что к экрану, а
 * не более мягкие. Ровно на этом она и сорвалась в первый раз: заказчик
 * нажимал «Выгрузить в Excel» в своём журнале и получал имя перевозчика,
 * которого нанял экспедитор, его ставку и нашу маржу — всё то, что
 * карточка рейса и список заявок ему не показывают.
 *
 * Правило видимости живёт в `order-visibility`, и здесь проверяется, что
 * выгрузка его спрашивает, а не пишет своё.
 */
describe('Выгрузка журнала заявок и правило видимости', () => {
    const МЫ = 'экспедитор';
    const ЗАКАЗЧИК = 'заказчик';

    /** Рейс: заказчик платит 430 000, перевозчику уходит 350 000. */
    const рейс = () => ({
        id: 'р-1',
        orderNumber: 'ЗК-2607',
        status: 'COMPLETED',
        createdAt: new Date('2026-08-01'),
        completedAt: new Date('2026-08-05'),
        cargoDescription: 'Напитки',
        cargoWeight: D(20000),
        assignedDriverName: 'Иванов Иван',
        assignedDriverPlate: '123 ABC 01',
        customerPaymentDate: null,
        driverPaymentDate: null,
        customerCompany: { name: 'ТОО «Магнум Дистрибуция»' },
        subForwarder: { name: 'ИП «Береке Транс»' },
        partner: null,
        forwarder: { name: 'ТОО «ЛогиКор»' },
        driver: null,
        responsibleManager: null,
        routePoints: [],
        accountingDocuments: [],

        customerPrice: D(430_000),
        customerPriceBase: D(430_000),
        driverCost: null,
        subForwarderPrice: D(350_000),
        subForwarderPriceBase: D(350_000),
        currency: 'KZT',
        driverCostCurrency: null,
        subForwarderPriceCurrency: 'KZT',
        driverCostBase: null,
        customerCompanyId: ЗАКАЗЧИК,
        forwarderId: МЫ,
        subForwarderId: 'перевозчик',
        partnerId: null,
        vatRate: null,
        hasVat: false,
        executorVatRate: null,
        executorHasVat: false,
        isCustomerPaid: false,
        isDriverPaid: false,
        isSubForwarderPaid: false,
        payments: [],
        paymentShares: [],
        incomes: [],
        expenses: [],
    });

    const выгрузить = async (companyId: string) => {
        const prisma: any = { order: { findMany: jest.fn().mockResolvedValue([рейс()]) } };
        const service = new OrdersExportService(prisma, new FinanceCalculatorService());
        const buffer = await service.exportOrders(companyId, ['р-1']);
        const book = XLSX.read(buffer, { type: 'buffer' });
        return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]])[0] as Record<string, any>;
    };

    it('заказчику не уходит имя перевозчика, которого нанял экспедитор', async () => {
        // Самое дорогое, что есть в этом файле: узнав перевозчика, заказчик
        // в следующий раз поедет к нему напрямую.
        const строка = await выгрузить(ЗАКАЗЧИК);

        expect(JSON.stringify(строка)).not.toContain('Береке');
        expect(строка['Перевозчик']).toBe('Иванов Иван');
    });

    it('заказчику не уходят ни себестоимость, ни маржа', async () => {
        // Ячейка пустая, а не нулевая: ноль в колонке «Маржа» читается как
        // «мы на этом рейсе не заработали», то есть как ответ.
        const пусто = (значение: unknown) => значение === undefined || значение === '';
        const строка = await выгрузить(ЗАКАЗЧИК);

        expect(пусто(строка['Ставка перевозчика'])).toBe(true);
        expect(пусто(строка['Оплачено перевозчику'])).toBe(true);
        expect(пусто(строка['Долг перевозчику'])).toBe(true);
        expect(пусто(строка['Маржа'])).toBe(true);
    });

    it('заказчик видит свою ставку, а не ноль', async () => {
        // Расчёт отдаёт заказчику его платёж как «себестоимость», а выручку
        // нулём. Если переложить это в колонки как есть, в файле окажется
        // ставка 0 и маржа минус 430 000 — цифры, которых не было.
        const строка = await выгрузить(ЗАКАЗЧИК);

        expect(строка['Ставка заказчика']).toBe(430_000);
    });

    it('экспедитору выгрузка отдаёт обе стороны и маржу', async () => {
        // Обратная проверка: маска не должна прятать своё от своих.
        const строка = await выгрузить(МЫ);

        expect(строка['Перевозчик']).toBe('ИП «Береке Транс»');
        expect(строка['Ставка заказчика']).toBe(430_000);
        expect(строка['Ставка перевозчика']).toBe(350_000);
        expect(строка['Маржа']).toBe(80_000);
    });

    it('чужой счёт по рейсу в файл не попадает', async () => {
        // По рейсу счетов два: наш заказчику и перевозчика нам. Заказчику
        // видно только тот, что выставлен ему.
        const prisma: any = {
            order: {
                findMany: jest.fn().mockResolvedValue([{
                    ...рейс(),
                    accountingDocuments: [
                        {
                            document: {
                                number: 'СЧ-ОТ-ПЕРЕВОЗЧИКА',
                                type: 'PAYMENT_INVOICE',
                                status: 'POSTED',
                                companyId: МЫ,
                                counterpartyId: 'перевозчик',
                            },
                        },
                        {
                            document: {
                                number: 'СЧ-ЗАКАЗЧИКУ',
                                type: 'PAYMENT_INVOICE',
                                status: 'POSTED',
                                companyId: МЫ,
                                counterpartyId: ЗАКАЗЧИК,
                            },
                        },
                    ],
                }]),
            },
        };
        const service = new OrdersExportService(prisma, new FinanceCalculatorService());
        const book = XLSX.read(await service.exportOrders(ЗАКАЗЧИК, ['р-1']), { type: 'buffer' });
        const строка = XLSX.utils.sheet_to_json(
            book.Sheets[book.SheetNames[0]],
        )[0] as Record<string, any>;

        expect(строка['Счёт']).toBe('СЧ-ЗАКАЗЧИКУ');
    });
});
