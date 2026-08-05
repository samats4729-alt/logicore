import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyService, localToday } from './currency.service';

/**
 * Правила работы с курсами, которые нельзя нарушить.
 *
 * Здесь проверяется не арифметика (она в разборе файла), а поведение,
 * от которого зависит, сойдутся ли деньги:
 *
 * 1. Курс берётся с откатом назад: на день, которого нет в базе, действует
 *    последний объявленный до него. Иначе документ задним числом останется
 *    без курса.
 * 2. Ручной курс не затирается автоматической загрузкой: человек ставил его
 *    осознанно, и ночная загрузка не должна молча вернуть официальный.
 * 3. Дата берётся из файла Нацбанка, а не из запроса: файл — единственный
 *    источник правды о том, на какой день объявлен курс.
 */
describe('Курсы валют: правила', () => {
    const make = (prisma: any) => new CurrencyService(prisma as any);

    describe('курс на дату', () => {
        it('у тенге курс к тенге всегда единица и в базу не ходим', async () => {
            const findFirst = jest.fn();
            const service = make({ exchangeRate: { findFirst } });

            const result = await service.rateOn('KZT', '2026-08-02');
            expect(Number(result!.rate)).toBe(1);
            expect(findFirst).not.toHaveBeenCalled();
        });

        it('в выходной берёт последний объявленный курс', async () => {
            // 2 августа 2026 — воскресенье, курса на этот день нет.
            const findFirst = jest.fn().mockResolvedValue({
                rate: new Prisma.Decimal('473.59'),
                rateDate: new Date('2026-08-01T00:00:00Z'),
            });
            const service = make({ exchangeRate: { findFirst } });

            const result = await service.rateOn('USD', '2026-08-02');
            expect(Number(result!.rate)).toBeCloseTo(473.59, 6);

            const where = findFirst.mock.calls[0][0].where;
            expect(where.currencyCode).toBe('USD');
            // Именно «не позже», а не «равно»: иначе в выходной курса нет вовсе.
            expect(where.rateDate.lte).toEqual(new Date('2026-08-02T00:00:00Z'));
            expect(findFirst.mock.calls[0][0].orderBy).toEqual({ rateDate: 'desc' });
        });

        it('если курса нет вовсе — отдаёт пусто, а не единицу', async () => {
            // Молчаливая единица означала бы «доллар равен тенге» — такую
            // ошибку в счёте не заметить, пока не придут деньги.
            const service = make({ exchangeRate: { findFirst: jest.fn().mockResolvedValue(null) } });
            expect(await service.rateOn('TMT', '2026-08-03')).toBeNull();
        });
    });

    describe('загрузка с Нацбанка', () => {
        const fileFor = (date: string, rate = '473.59') => `<rates><date>${date}</date>
            <item><title>USD</title><description>${rate}</description><quant>1</quant></item>
            <item><title>UZS</title><description>3.96</description><quant>100</quant></item>
        </rates>`;

        const prismaWith = (existing: any = null) => {
            const upsert = jest.fn().mockResolvedValue({});
            return {
                prisma: {
                    currency: { findMany: jest.fn().mockResolvedValue([{ code: 'USD' }, { code: 'UZS' }]) },
                    exchangeRate: { findUnique: jest.fn().mockResolvedValue(existing), upsert },
                },
                upsert,
            };
        };

        beforeEach(() => {
            global.fetch = jest.fn().mockResolvedValue({
                ok: true, text: async () => fileFor('01.08.2026'),
            }) as any;
        });

        it('сохраняет курс на дату ИЗ ФАЙЛА, а не на запрошенную', async () => {
            const { prisma, upsert } = prismaWith();
            const service = make(prisma);

            // Правило: дата берётся из файла. Здесь сервис ответил файлом
            // за 1 августа на запрос про 2-е — сохраниться должно первое.
            const result = await service.importFromNbk('2026-08-02');

            expect(result.rateDate).toBe('2026-08-01');
            expect(result.isCarriedOver).toBe(true);
            const saved = upsert.mock.calls[0][0];
            expect(saved.where.currencyCode_rateDate.rateDate).toEqual(new Date('2026-08-01T00:00:00Z'));
        });

        it('кладёт курс за одну единицу, а исходные значения — рядом', async () => {
            const { prisma, upsert } = prismaWith();
            await make(prisma).importFromNbk('2026-08-01');

            const uzs = upsert.mock.calls.find((c) => c[0].where.currencyCode_rateDate.currencyCode === 'UZS')![0];
            expect(Number(uzs.create.rate)).toBeCloseTo(0.0396, 6);
            expect(Number(uzs.create.sourceRate)).toBeCloseTo(3.96, 6);
            expect(uzs.create.sourceQuant).toBe(100);
            // Отдельного признака «официальный» нет и не нужно: это таблица
            // официальных курсов, свои курсы компаний лежат в другой.
            expect(uzs.create.companyId).toBeUndefined();
        });

        it('своих курсов компаний не касается вовсе', async () => {
            // Раньше свой курс лежал в той же таблице и его приходилось
            // защищать проверкой. Теперь таблицы разные, и загрузка просто
            // не знает про курсы компаний — ломать нечего.
            const { prisma } = prismaWith();
            const service = make({ ...prisma, companyExchangeRate: undefined });
            await expect(service.importFromNbk('2026-08-01')).resolves.toBeTruthy();
        });

        it('валюту, которой нет в справочнике, не выдумывает', async () => {
            const upsert = jest.fn().mockResolvedValue({});
            const prisma = {
                currency: { findMany: jest.fn().mockResolvedValue([{ code: 'USD' }]) },
                exchangeRate: { findUnique: jest.fn().mockResolvedValue(null), upsert },
            };
            const result = await make(prisma).importFromNbk('2026-08-01');

            expect(result.saved).toBe(1);
            expect(result.unknown).toEqual(['UZS']);
        });

        it('пустой ответ сайта — это ошибка, а не «курсов нет»', async () => {
            global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<html>502</html>' }) as any;
            await expect(make(prismaWith().prisma).importFromNbk('2026-08-01'))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('на отказ сайта отвечает по-человечески, а не «fetch failed»', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as any;
            await expect(make(prismaWith().prisma).importFromNbk('2026-08-01'))
                .rejects.toThrow('Не удалось связаться с сайтом Нацбанка');
        });
    });

    describe('свой курс компании', () => {
        const prisma = () => ({
            currency: { findUnique: jest.fn().mockResolvedValue({ code: 'TMT', hasOfficialRate: false }) },
            companyExchangeRate: { upsert: jest.fn().mockResolvedValue({ id: 'r-1' }) },
        });

        it('сохраняется у своей компании и с причиной', async () => {
            const p = prisma();
            await make(p).setCompanyRate({
                companyId: 'c-1', code: 'TMT', date: '2026-08-03', rate: 135.5, note: 'Курс по договору',
            });
            const call = p.companyExchangeRate.upsert.mock.calls[0][0];
            expect(call.where.companyId_currencyCode_rateDate.companyId).toBe('c-1');
            expect(call.create.companyId).toBe('c-1');
            expect(call.create.note).toBe('Курс по договору');
            expect(Number(call.create.rate)).toBeCloseTo(135.5, 6);
        });

        it('без компании курс поставить нельзя', async () => {
            // Иначе он оказался бы общим для всей платформы — ровно та
            // ошибка, ради которой курсы и разведены по двум таблицам.
            await expect(make(prisma()).setCompanyRate({
                companyId: '', code: 'TMT', date: '2026-08-03', rate: 1,
            })).rejects.toBeInstanceOf(BadRequestException);
        });

        it('курс тенге к тенге поставить нельзя', async () => {
            const p = prisma();
            p.currency.findUnique = jest.fn().mockResolvedValue({ code: 'KZT' });
            await expect(make(p).setCompanyRate({ companyId: 'c-1', code: 'KZT', date: '2026-08-03', rate: 2 }))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('ноль и отрицательный курс не принимаются', async () => {
            for (const rate of [0, -5]) {
                await expect(make(prisma()).setCompanyRate({ companyId: 'c-1', code: 'TMT', date: '2026-08-03', rate }))
                    .rejects.toBeInstanceOf(BadRequestException);
            }
        });

        it('удаляется только свой курс своей компании', async () => {
            const p: any = {
                companyExchangeRate: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'r-1' }),
                    delete: jest.fn().mockResolvedValue({}),
                },
            };
            await make(p).removeCompanyRate('c-1', 'TMT', '2026-08-03');
            expect(p.companyExchangeRate.findUnique.mock.calls[0][0].where
                .companyId_currencyCode_rateDate.companyId).toBe('c-1');
        });

        it('официальный курс Нацбанка удалить нельзя вовсе', async () => {
            // Таблица официальных курсов сюда не приходит: удалять нечего.
            const p: any = {
                companyExchangeRate: { findUnique: jest.fn().mockResolvedValue(null), delete: jest.fn() },
                exchangeRate: { delete: jest.fn() },
            };
            await expect(make(p).removeCompanyRate('c-1', 'USD', '2026-08-01')).rejects.toThrow();
            expect(p.exchangeRate.delete).not.toHaveBeenCalled();
        });
    });

    describe('курсы не протекают между компаниями', () => {
        it('свой курс компании главнее официального', async () => {
            const p: any = {
                companyExchangeRate: {
                    findFirst: jest.fn().mockResolvedValue({
                        rate: new Prisma.Decimal('135.5'), rateDate: new Date('2026-08-03T00:00:00Z'),
                    }),
                },
                exchangeRate: { findFirst: jest.fn() },
            };
            const result = await make(p).rateOn('TMT', '2026-08-03', { companyId: 'c-1' });

            expect(Number(result!.rate)).toBeCloseTo(135.5, 6);
            expect(result!.source).toBe('COMPANY');
            // До официального дело не дошло — свой курс главнее.
            expect(p.exchangeRate.findFirst).not.toHaveBeenCalled();
        });

        it('чужой курс не подставляется: ищем строго по своей компании', async () => {
            const p: any = {
                companyExchangeRate: { findFirst: jest.fn().mockResolvedValue(null) },
                exchangeRate: {
                    findFirst: jest.fn().mockResolvedValue({
                        rate: new Prisma.Decimal('473.59'), rateDate: new Date('2026-08-03T00:00:00Z'),
                    }),
                },
            };
            const result = await make(p).rateOn('USD', '2026-08-03', { companyId: 'c-2' });

            expect(p.companyExchangeRate.findFirst.mock.calls[0][0].where.companyId).toBe('c-2');
            // Своего нет — берём официальный, он общий и это правильно.
            expect(result!.source).toBe('NBK');
        });

        it('без компании свои курсы не читаются вообще', async () => {
            const p: any = {
                companyExchangeRate: { findFirst: jest.fn() },
                exchangeRate: { findFirst: jest.fn().mockResolvedValue(null) },
            };
            await make(p).rateOn('USD', '2026-08-03');
            expect(p.companyExchangeRate.findFirst).not.toHaveBeenCalled();
        });
    });

    describe('сегодняшний день считается по местному времени', () => {
        it('в три часа ночи по Алматы это уже сегодня, а не вчера', () => {
            // По Гринвичу в этот момент ещё вчерашний день. Считать «сегодня»
            // по Гринвичу значит показывать бухгалтеру вчерашний курс.
            const almatyNight = new Date(2026, 7, 4, 3, 0, 0);
            expect(localToday(almatyNight)).toBe('2026-08-04');
        });
    });

    describe('догрузка за период', () => {
        it('период длиннее трёх месяцев не берётся', async () => {
            // Это поход в чужой сервис по дню на запрос, а не выборка из базы.
            await expect(make({}).backfill('2026-01-01', '2026-12-31'))
                .rejects.toBeInstanceOf(BadRequestException);
        });

        it('перевёрнутый период не берётся', async () => {
            await expect(make({}).backfill('2026-08-10', '2026-08-01'))
                .rejects.toBeInstanceOf(BadRequestException);
        });
    });
});
