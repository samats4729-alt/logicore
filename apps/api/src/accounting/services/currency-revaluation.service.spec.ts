import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyRevaluationService } from './currency-revaluation.service';

/**
 * Переоценка валютных остатков: правила проведения.
 *
 * Арифметика проверена отдельно (currency-revaluation.spec). Здесь — то, что
 * ломается не в формуле, а в жизни: вторая переоценка на ту же дату, курс
 * которого нет, закрытый период и валюта, которую нельзя переоценить молча.
 */
describe('Проведение переоценки', () => {
    const D = (v: string | number) => new Prisma.Decimal(v);
    const COMPANY = 'c-1';
    const DAY = new Date('2026-08-31T00:00:00Z');

    const build = (options: {
        accounts?: any[];
        documents?: any[];
        rate?: any;
        existing?: any;
        previousLine?: any;
        payments?: any[];
        periodClosed?: boolean;
    } = {}) => {
        const created: any[] = [];
        const prisma: any = {
            financeAccount: {
                findMany: jest.fn().mockResolvedValue(options.accounts ?? []),
                findUnique: jest.fn().mockResolvedValue({ openingBalance: D('0') }),
            },
            accountingDocument: { findMany: jest.fn().mockResolvedValue(options.documents ?? []) },
            currencyRevaluationLine: { findFirst: jest.fn().mockResolvedValue(options.previousLine ?? null) },
            payment: { findMany: jest.fn().mockResolvedValue(options.payments ?? []) },
            currencyRevaluation: {
                findUnique: jest.fn().mockResolvedValue(options.existing ?? null),
                create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'r-1', ...data, lines: [] }; }),
            },
        };
        const currency = {
            rateOn: jest.fn().mockResolvedValue(
                options.rate === undefined ? { rate: D('500'), rateDate: DAY, source: 'NBK' } : options.rate,
            ),
        };
        const periodClosing = {
            checkPeriodNotClosed: jest.fn(async () => {
                if (options.periodClosed) throw new BadRequestException('Период закрыт');
            }),
        };
        const service = new CurrencyRevaluationService(prisma, currency as any, periodClosing as any);
        return { service, prisma, currency, periodClosing, created };
    };

    const invoice = (overrides: any = {}) => ({
        id: 'd-1', number: 'СЧ-1', currency: 'USD', direction: 'OUTGOING',
        balanceDue: D('1000'), exchangeRate: D('470'),
        counterparty: { name: 'Магнум' },
        ...overrides,
    });

    describe('что попадает в переоценку', () => {
        it('неоплаченный долларовый счёт клиента переоценивается', async () => {
            const { service } = build({ documents: [invoice()] });
            const result = await service.preview(COMPANY, DAY);

            expect(result.lines).toHaveLength(1);
            expect(result.lines[0].kind).toBe('RECEIVABLE');
            expect(result.lines[0].baseBefore).toBe(470000);
            expect(result.lines[0].baseAfter).toBe(500000);
            expect(result.gain).toBe(30000);
        });

        it('счёт поставщика даёт расход при том же движении курса', async () => {
            const { service } = build({ documents: [invoice({ direction: 'INCOMING' })] });
            const result = await service.preview(COMPANY, DAY);

            expect(result.lines[0].kind).toBe('PAYABLE');
            expect(result.loss).toBe(30000);
            expect(result.gain).toBe(0);
        });

        it('счёт без движения курса в переоценку не попадает', async () => {
            // Строка с нулевой разницей — мусор в отчёте.
            const { service } = build({
                documents: [invoice({ exchangeRate: D('500') })],
            });
            const result = await service.preview(COMPANY, DAY);

            expect(result.lines).toHaveLength(0);
        });

        it('вторая переоценка считает от курса первой, а не от курса счёта', async () => {
            // Иначе те же 30 000 попали бы в отчёт второй раз.
            const { service } = build({
                documents: [invoice()],
                previousLine: { rate: D('500') },
                rate: { rate: D('510'), rateDate: DAY, source: 'NBK' },
            });
            const result = await service.preview(COMPANY, DAY);

            expect(result.lines[0].baseBefore).toBe(500000);
            expect(result.lines[0].diff).toBe(10000);
        });

        it('валюта без курса на дату не переоценивается и названа отдельно', async () => {
            const { service } = build({ documents: [invoice({ currency: 'TMT' })], rate: null });
            const result = await service.preview(COMPANY, DAY);

            expect(result.lines).toHaveLength(0);
            expect(result.missingRates).toContain('TMT');
        });

        it('берутся только проведённые неоплаченные валютные счета', async () => {
            const { service, prisma } = build();
            await service.preview(COMPANY, DAY);

            const where = prisma.accountingDocument.findMany.mock.calls[0][0].where;
            expect(where.status).toBe('POSTED');
            expect(where.currency).toEqual({ not: 'KZT' });
            expect(where.balanceDue).toEqual({ gt: 0 });
            expect(where.companyId).toBe(COMPANY);
        });

        it('тенговые счета и кассы не переоцениваются вовсе', async () => {
            const { service, prisma } = build();
            await service.preview(COMPANY, DAY);

            const where = prisma.financeAccount.findMany.mock.calls[0][0].where;
            expect(where.currency).toEqual({ not: 'KZT' });
        });
    });

    describe('проведение', () => {
        it('снимок сохраняется со всеми числами строки', async () => {
            const { service, created } = build({ documents: [invoice()] });
            await service.post(COMPANY, 'u-1', DAY);

            const line = created[0].lines.create[0];
            expect(Number(line.rate)).toBe(500);
            expect(Number(line.baseBefore)).toBe(470000);
            expect(Number(line.baseAfter)).toBe(500000);
            expect(Number(line.diff)).toBe(30000);
            expect(Number(created[0].gain)).toBe(30000);
        });

        it('вторая переоценка на ту же дату не проводится', async () => {
            // Иначе разница удвоится.
            const { service, created } = build({
                documents: [invoice()],
                existing: { id: 'r-0' },
            });

            await expect(service.post(COMPANY, 'u-1', DAY)).rejects.toBeInstanceOf(BadRequestException);
            expect(created).toHaveLength(0);
        });

        it('в закрытом периоде переоценка не проводится', async () => {
            const { service, created } = build({ documents: [invoice()], periodClosed: true });

            await expect(service.post(COMPANY, 'u-1', DAY)).rejects.toThrow(/Период закрыт/);
            expect(created).toHaveLength(0);
        });

        it('пустая переоценка не сохраняется', async () => {
            // Снимок без строк — запись ни о чём, которая мешает провести
            // настоящую переоценку на эту дату.
            const { service, created } = build();

            await expect(service.post(COMPANY, 'u-1', DAY)).rejects.toThrow(/Переоценивать нечего/);
            expect(created).toHaveLength(0);
        });

        it('дата хранится без времени — курс объявляется на день', async () => {
            const { service, created } = build({ documents: [invoice()] });
            await service.post(COMPANY, 'u-1', new Date('2026-08-31T18:45:00Z'));

            expect(created[0].date.toISOString()).toBe('2026-08-31T00:00:00.000Z');
        });
    });
});
