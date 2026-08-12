import { BadRequestException } from '@nestjs/common';
import { AccountingDocumentDirection, AccountingDocumentType } from '@prisma/client';
import { AccountingDocumentsService } from './accounting-documents.service';
import { AccountingDocumentCalculatorService } from './accounting-document-calculator.service';

/**
 * Настройка нумерации счетов.
 *
 * Бухгалтерия просит свою нумерацию не от любви к красивым номерам:
 * в 1С и в банке счета ищут по номеру, и он должен совпадать. Настроить
 * нумерацию нужно ДО первого документа — переименовать выданный счёт уже
 * нельзя, поэтому экран показывает все виды документов, даже пустые.
 *
 * Главное, от чего защищаемся, — повтор номера. Номер уникален в пределах
 * компании и вида; отмотанный назад счётчик означал бы, что следующий счёт
 * просто не создастся, и бухгалтер увидит ошибку базы на ровном месте.
 */
describe('Нумерация документов', () => {
    const COMPANY = 'c-1';

    const build = (options: { saved?: any[]; counts?: any[]; taken?: any; existingNumbers?: string[] } = {}) => {
        const upserted: any[] = [];
        const prisma: any = {
            accountingDocumentNumbering: {
                findMany: jest.fn().mockResolvedValue(options.saved ?? []),
                upsert: jest.fn(async (args: any) => { upserted.push(args); return { id: 'n-1', ...args.create }; }),
            },
            accountingDocument: {
                groupBy: jest.fn().mockResolvedValue(options.counts ?? []),
                findFirst: jest.fn().mockResolvedValue(options.taken ?? null),
                findMany: jest.fn().mockResolvedValue(
                    (options.existingNumbers ?? []).map((number) => ({ number })),
                ),
            },
        };
        const service = new AccountingDocumentsService(
            prisma,
            new AccountingDocumentCalculatorService(),
            { checkPeriodNotClosed: jest.fn() } as any,
            {} as any,
            { toBase: jest.fn().mockResolvedValue(null) } as any,
            { recomputeForDocument: jest.fn().mockResolvedValue(0) } as any,
        );
        return { service, prisma, upserted };
    };

    const invoiceOut = {
        type: AccountingDocumentType.PAYMENT_INVOICE,
        direction: AccountingDocumentDirection.OUTGOING,
    };

    describe('что показывает экран настроек', () => {
        it('виды документов показываются все, даже те, по которым ничего не заводили', async () => {
            // Настроить нумерацию нужно до первого документа: выданный номер
            // уже не переименовать.
            const { service } = build();
            const result = await service.getNumberingSettings(COMPANY, 2026);

            expect(result.rows).toHaveLength(8);
            expect(result.rows.some((r) => r.type === 'PAYMENT_INVOICE' && r.direction === 'OUTGOING')).toBe(true);
            expect(result.rows.some((r) => r.type === 'PAYMENT_INVOICE' && r.direction === 'INCOMING')).toBe(true);
        });

        it('у ненастроенного вида показаны значения по умолчанию', async () => {
            const { service } = build();
            const result = await service.getNumberingSettings(COMPANY, 2026);
            const row = result.rows.find((r) => r.type === 'PAYMENT_INVOICE' && r.direction === 'OUTGOING')!;

            expect(row.prefix).toBe('СЧ-2026-');
            expect(row.nextNumber).toBe(1);
            expect(row.example).toBe('СЧ-2026-000001');
        });

        it('пример показывает ровно то, что уйдёт в документ', async () => {
            // Формат бухгалтера: «АВ-00010002».
            const { service } = build({
                saved: [{ ...invoiceOut, year: 2026, prefix: 'АВ-', nextNumber: 10002, padLength: 8 }],
            });
            const result = await service.getNumberingSettings(COMPANY, 2026);
            const row = result.rows.find((r) => r.type === 'PAYMENT_INVOICE' && r.direction === 'OUTGOING')!;

            expect(row.example).toBe('АВ-00010002');
        });

        it('видно, сколько документов этого вида уже заведено', async () => {
            // Это подсказка «менять нумерацию поздно» — или наоборот, можно.
            const { service } = build({
                counts: [{ type: 'PAYMENT_INVOICE', direction: 'OUTGOING', _count: { _all: 7 } }],
            });
            const result = await service.getNumberingSettings(COMPANY, 2026);
            const row = result.rows.find((r) => r.type === 'PAYMENT_INVOICE' && r.direction === 'OUTGOING')!;

            expect(row.documents).toBe(7);
        });
    });

    describe('сохранение', () => {
        it('настройки сохраняются как заданы', async () => {
            const { service, upserted } = build();
            await service.updateNumberingSettings(COMPANY, {
                ...invoiceOut, year: 2026, prefix: 'АВ-', nextNumber: 10002, padLength: 8,
            });

            expect(upserted[0].create.prefix).toBe('АВ-');
            expect(upserted[0].update.nextNumber).toBe(10002);
            expect(upserted[0].update.padLength).toBe(8);
        });

        it('занятый номер не сохраняется', async () => {
            // Иначе следующий счёт не создастся вовсе: номер уникален.
            const { service, upserted } = build({ taken: { id: 'd-1' } });

            await expect(service.updateNumberingSettings(COMPANY, {
                ...invoiceOut, prefix: 'АВ-', nextNumber: 10002, padLength: 8,
            })).rejects.toBeInstanceOf(BadRequestException);
            expect(upserted).toHaveLength(0);
        });

        it('в отказе назван свободный номер, а не просто «занято»', async () => {
            const { service } = build({
                taken: { id: 'd-1' },
                existingNumbers: ['АВ-00010002', 'АВ-00010003'],
            });

            await expect(service.updateNumberingSettings(COMPANY, {
                ...invoiceOut, prefix: 'АВ-', nextNumber: 10002, padLength: 8,
            })).rejects.toThrow(/АВ-00010004/);
        });

        it('количество цифр вне разумных пределов не принимается', async () => {
            const { service } = build();

            await expect(service.updateNumberingSettings(COMPANY, {
                ...invoiceOut, prefix: 'АВ-', nextNumber: 1, padLength: 0,
            })).rejects.toThrow(/от 1 до 12/);
        });

        it('номер меньше единицы не принимается', async () => {
            const { service } = build();

            await expect(service.updateNumberingSettings(COMPANY, {
                ...invoiceOut, prefix: 'АВ-', nextNumber: 0, padLength: 6,
            })).rejects.toThrow(/меньше единицы/);
        });

        it('пустой префикс допустим — номер тогда просто число', async () => {
            const { service, upserted } = build();
            await service.updateNumberingSettings(COMPANY, {
                ...invoiceOut, prefix: '', nextNumber: 1, padLength: 4,
            });

            expect(upserted[0].create.prefix).toBe('');
        });

        it('проверка занятости смотрит на свой вид документа, а не на все подряд', async () => {
            // «СЧ-000001» исходящего счёта и такой же номер входящего — разные
            // документы, они не конфликтуют.
            const { service, prisma } = build();
            await service.updateNumberingSettings(COMPANY, {
                ...invoiceOut, prefix: 'СЧ-', nextNumber: 1, padLength: 6,
            });

            const where = prisma.accountingDocument.findFirst.mock.calls[0][0].where;
            expect(where.companyId).toBe(COMPANY);
            expect(where.type).toBe('PAYMENT_INVOICE');
            expect(where.direction).toBe('OUTGOING');
            expect(where.number).toBe('СЧ-000001');
        });
    });
});
