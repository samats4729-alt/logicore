import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsService } from '../contracts/contracts.service';
import { QuoteRequestsService } from './quote-requests.service';

/**
 * Здесь проверяется не арифметика — она в `quote-memory.spec.ts`, — а два
 * свойства, которые ломаются молча и дорого: чужие запросы не должны
 * утекать между компаниями, а решение по запросу не должно записываться
 * без того, что делает его полезным.
 */
describe('Запросы на расчёт: сервис', () => {
    const создать = (over: any = {}) => {
        const prisma: any = {
            quoteRequest: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                findFirst: jest.fn().mockResolvedValue(null),
                findUnique: jest.fn().mockResolvedValue(null),
                update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'з1', ...data })),
                create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'з1', ...data })),
            },
            quoteRequestNumbering: {
                upsert: jest.fn().mockResolvedValue({}),
                update: jest.fn().mockResolvedValue({ prefix: 'ЗПР-', padding: 5, nextNumber: 2 }),
            },
            company: { findUnique: jest.fn().mockResolvedValue({ id: 'клиент' }) },
            city: { findUnique: jest.fn().mockResolvedValue({ id: 'город' }) },
            ...over.prisma,
        };
        const contracts: any = {
            lookupTariffForOurClient: jest.fn().mockResolvedValue(null),
            ...over.contracts,
        };
        const service = new QuoteRequestsService(
            prisma as unknown as PrismaService,
            contracts as unknown as ContractsService,
        );
        return { service, prisma, contracts };
    };

    describe('изоляция компаний', () => {
        it('привязку к своей компании нельзя перебить фильтром', async () => {
            // Условия складываются через AND. Если бы они сливались в один
            // объект, фильтр по клиенту перетёр бы companyId — и одна
            // компания увидела бы запросы другой.
            const { service, prisma } = создать();

            await service.findAll('наша-компания', {
                customerCompanyId: 'клиент',
                status: 'REJECTED' as any,
                search: 'Алматы',
            });

            const where = prisma.quoteRequest.findMany.mock.calls[0][0].where;
            expect(where.AND[0]).toEqual({ companyId: 'наша-компания' });
            expect(where.companyId).toBeUndefined();
        });

        it('чужой запрос по прямой ссылке не открывается', async () => {
            const { service, prisma } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue(null);

            await expect(service.findOne('наша-компания', 'чужой-запрос')).rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.quoteRequest.findFirst.mock.calls[0][0].where).toEqual({
                id: 'чужой-запрос',
                companyId: 'наша-компания',
            });
        });

        it('история для подсказки берётся только по своей компании', async () => {
            const { service, prisma } = создать();

            await service.memory('наша-компания', {
                customerCompanyId: 'клиент',
                originCityId: 'шымкент',
                destinationCityId: 'алматы',
            });

            const where = prisma.quoteRequest.findMany.mock.calls[0][0].where;
            expect(where.AND).toContainEqual({ companyId: 'наша-компания' });
        });
    });

    describe('решение по запросу', () => {
        const запрос = (over: any = {}) => ({
            id: 'з1',
            companyId: 'наша-компания',
            customerPrice: 130_000,
            status: 'IN_PROGRESS',
            orderId: null,
            ...over,
        });

        it('отказ без причины не записывается', async () => {
            // Без причины запись бесполезна: «дорого» и «нашли раньше» —
            // это разные выводы, а через два дня никто не вспомнит.
            const { service, prisma } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue(запрос());

            await expect(service.reject('наша-компания', 'з1', '   ')).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.quoteRequest.update).not.toHaveBeenCalled();
        });

        it('причина отказа сохраняется без лишних пробелов', async () => {
            const { service, prisma } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue(запрос());

            await service.reject('наша-компания', 'з1', '  нашли машину дешевле  ');

            expect(prisma.quoteRequest.update.mock.calls[0][0].data).toMatchObject({
                status: 'REJECTED',
                rejectionReason: 'нашли машину дешевле',
            });
        });

        it('согласовать запрос без цены нельзя', async () => {
            // Иначе непонятно, что именно клиент подтвердил.
            const { service, prisma } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue(запрос({ customerPrice: null, status: 'NEW' }));

            await expect(service.approve('наша-компания', 'з1')).rejects.toBeInstanceOf(BadRequestException);
            expect(prisma.quoteRequest.update).not.toHaveBeenCalled();
        });

        it('согласование стирает причину прошлого отказа', async () => {
            // Иначе в карточке останется «отказ: дорого» рядом с «согласован».
            const { service, prisma } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue(запрос({ status: 'REJECTED', rejectionReason: 'дорого' }));

            await service.approve('наша-компания', 'з1');

            expect(prisma.quoteRequest.update.mock.calls[0][0].data).toMatchObject({
                status: 'APPROVED',
                rejectionReason: null,
            });
        });

        it('запрос с оформленной заявкой не правится и не переоткрывается', async () => {
            const { service, prisma } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue(
                запрос({ status: 'APPROVED', orderId: 'заявка-1' }),
            );

            await expect(service.update('наша-компания', 'я', 'з1', { notes: 'правка' }))
                .rejects.toBeInstanceOf(BadRequestException);
            await expect(service.reopen('наша-компания', 'з1')).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    describe('цена клиенту', () => {
        it('появление цены переводит запрос в работу и запоминает автора', async () => {
            // «Кто и когда назвал эту сумму» — первый вопрос через неделю.
            const { service, prisma } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue({
                id: 'з1',
                companyId: 'наша-компания',
                customerPrice: null,
                status: 'NEW',
                orderId: null,
                customerCompanyId: 'клиент',
                originCityId: 'г1',
                destinationCityId: 'г2',
            });

            await service.update('наша-компания', 'менеджер-7', 'з1', { customerPrice: 130_000 });

            const data = prisma.quoteRequest.update.mock.calls[0][0].data;
            expect(data.customerPrice).toBe(130_000);
            expect(data.status).toBe('IN_PROGRESS');
            expect(data.quotedById).toBe('менеджер-7');
            expect(data.quotedAt).toBeInstanceOf(Date);
        });

        it('правка уже названной цены не переписывает автора и дату', async () => {
            const { service, prisma } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue({
                id: 'з1',
                companyId: 'наша-компания',
                customerPrice: 130_000,
                status: 'IN_PROGRESS',
                orderId: null,
                customerCompanyId: 'клиент',
                originCityId: 'г1',
                destinationCityId: 'г2',
            });

            await service.update('наша-компания', 'другой-менеджер', 'з1', { customerPrice: 125_000 });

            const data = prisma.quoteRequest.update.mock.calls[0][0].data;
            expect(data.customerPrice).toBe(125_000);
            expect(data.quotedById).toBeUndefined();
            expect(data.quotedAt).toBeUndefined();
        });
    });

    describe('заведение запроса', () => {
        it('запрос на собственную организацию не заводится', async () => {
            const { service } = создать();

            await expect(
                service.create('наша-компания', 'я', {
                    customerCompanyId: 'наша-компания',
                    originCityId: 'г1',
                    destinationCityId: 'г2',
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('несуществующий город отклоняется понятной причиной', async () => {
            const { service, prisma } = создать();
            prisma.city.findUnique.mockResolvedValueOnce(null);

            await expect(
                service.create('наша-компания', 'я', {
                    customerCompanyId: 'клиент',
                    originCityId: 'нет-такого',
                    destinationCityId: 'г2',
                }),
            ).rejects.toThrow('Город погрузки не найден');
        });

        it('запрос с ценой сразу считается взятым в работу', async () => {
            const { service, prisma } = создать();

            await service.create('наша-компания', 'я', {
                customerCompanyId: 'клиент',
                originCityId: 'г1',
                destinationCityId: 'г2',
                customerPrice: 130_000,
            });

            expect(prisma.quoteRequest.create.mock.calls[0][0].data).toMatchObject({
                status: 'IN_PROGRESS',
                quotedById: 'я',
            });
        });

        it('запрос без цены остаётся новым', async () => {
            const { service, prisma } = создать();

            await service.create('наша-компания', 'я', {
                customerCompanyId: 'клиент',
                originCityId: 'г1',
                destinationCityId: 'г2',
            });

            const data = prisma.quoteRequest.create.mock.calls[0][0].data;
            expect(data.status).toBe('NEW');
            expect(data.quotedAt).toBeNull();
        });
    });

    describe('годовой тариф', () => {
        it('ищется у клиента по маршруту и кузову', async () => {
            const { service, contracts } = создать();

            await service.memory('наша-компания', {
                customerCompanyId: 'клиент',
                originCityId: 'шымкент',
                destinationCityId: 'алматы',
                cargoType: 'рефрижератор',
            });

            expect(contracts.lookupTariffForOurClient).toHaveBeenCalledWith(
                'наша-компания',
                'клиент',
                'шымкент',
                'алматы',
                'рефрижератор',
            );
        });

        it('сбой поиска тарифа не мешает завести запрос', async () => {
            // Тариф — подсказка, а не условие работы.
            const { service } = создать({
                contracts: { lookupTariffForOurClient: jest.fn().mockRejectedValue(new Error('база недоступна')) },
            });

            const result = await service.memory('наша-компания', {
                customerCompanyId: 'клиент',
                originCityId: 'г1',
                destinationCityId: 'г2',
            });

            expect(result.annualTariff).toBeNull();
        });
    });
});
