import { BadRequestException } from '@nestjs/common';
import { AccountingDocumentStatus, Prisma } from '@prisma/client';
import { AccountingDocumentsService } from './accounting-documents.service';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';

/**
 * Курс в бухгалтерском документе.
 *
 * Главное правило валютного учёта: курс, по которому провели документ, не
 * меняется никогда. Завтра доллар другой — вчерашний счёт обязан остаться
 * вчерашним. Иначе отчёт за прошлый месяц завтра покажет другие цифры сам
 * по себе, и доверять ему станет нельзя.
 *
 * Второе правило: валютный документ без курса не проводится. «Проведём,
 * потом разберёмся» означает, что в отчётах эта сумма молча потеряется.
 */
describe('Курс в счёте и акте', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);

    const build = (options: { rate?: any; document?: any } = {}) => {
        const currency = {
            toBase: jest.fn().mockResolvedValue(
                options.rate === undefined
                    ? { amount: D('473590'), rate: D('473.59'), rateDate: new Date('2026-08-03T00:00:00Z'), source: 'NBK' }
                    : options.rate,
            ),
        };
        const updateMany = jest.fn().mockResolvedValue({ count: 1 });
        const document = {
            id: 'd-1',
            status: AccountingDocumentStatus.DRAFT,
            currency: 'USD',
            documentDate: new Date('2026-08-03T00:00:00Z'),
            operationDate: null,
            total: D('1000'),
            balanceDue: D('1000'),
            exchangeRate: null,
            exchangeRateDate: null,
            totalBase: null,
            lines: [{ id: 'l-1' }],
            type: 'PAYMENT_INVOICE',
            ...(options.document ?? {}),
        };
        const prisma: any = {
            accountingDocument: { updateMany, findFirst: jest.fn().mockResolvedValue(document) },
        };
        const service = new AccountingDocumentsService(
            prisma,
            new AccountingDocumentCalculatorService(),
            { checkPeriodNotClosed: jest.fn() } as any,
            {} as any,
            currency as any,
        );
        // getById в проведении отдаёт документ целиком — подделываем его,
        // чтобы проверять именно правило про курс, а не выборку из базы.
        (service as any).getById = jest.fn().mockResolvedValue(document);
        return { service, currency, updateMany, document };
    };

    describe('проведение документа', () => {
        it('курс и пересчёт записываются в документ при проведении', async () => {
            const { service, updateMany } = build();
            await service.post('c-1', 'u-1', 'd-1');

            const data = updateMany.mock.calls[0][0].data;
            expect(data.status).toBe(AccountingDocumentStatus.POSTED);
            expect(Number(data.exchangeRate)).toBeCloseTo(473.59, 6);
            expect(Number(data.totalBase)).toBe(473590);
            expect(data.exchangeRateDate).toEqual(new Date('2026-08-03T00:00:00Z'));
        });

        it('уже зафиксированный курс не пересчитывается заново', async () => {
            // Черновик получил курс при создании — за новым не ходим: иначе
            // документ провёлся бы по сегодняшнему курсу вместо своего.
            const { service, currency, updateMany } = build({
                document: {
                    exchangeRate: D('460.00'),
                    exchangeRateDate: new Date('2026-07-20T00:00:00Z'),
                    totalBase: D('460000'),
                },
            });
            await service.post('c-1', 'u-1', 'd-1');

            expect(currency.toBase).not.toHaveBeenCalled();
            expect(Number(updateMany.mock.calls[0][0].data.exchangeRate)).toBe(460);
        });

        it('без курса валютный документ не проводится вовсе', async () => {
            const { service, updateMany } = build({ rate: null });
            await expect(service.post('c-1', 'u-1', 'd-1')).rejects.toBeInstanceOf(BadRequestException);
            expect(updateMany).not.toHaveBeenCalled();
        });

        it('в отказе сказано, что делать', async () => {
            const { service } = build({ rate: null });
            await expect(service.post('c-1', 'u-1', 'd-1'))
                .rejects.toThrow(/Курсы валют/);
        });

        it('тенговый документ проводится без всякого курса', async () => {
            const { service, currency, updateMany } = build({
                document: { currency: 'KZT', total: D('230000') },
            });
            await service.post('c-1', 'u-1', 'd-1');

            expect(currency.toBase).not.toHaveBeenCalled();
            expect(updateMany.mock.calls[0][0].data.status).toBe(AccountingDocumentStatus.POSTED);
        });
    });

    describe('слепок документа', () => {
        it('курс входит в контрольную сумму — он часть документа', async () => {
            // Слепок защищает документ от незаметной правки. Курс определяет
            // сумму в отчётах, значит меняться он тоже не должен.
            const { service } = build();
            const withRate = (service as any).checksum({
                id: 'd-1', companyId: 'c-1', currency: 'USD', total: D('1000'),
                exchangeRate: D('473.59'), exchangeRateDate: new Date('2026-08-03'),
            });
            const withOther = (service as any).checksum({
                id: 'd-1', companyId: 'c-1', currency: 'USD', total: D('1000'),
                exchangeRate: D('500.00'), exchangeRateDate: new Date('2026-08-03'),
            });
            expect(withRate).not.toBe(withOther);
        });
    });
});
