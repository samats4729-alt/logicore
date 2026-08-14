import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContractsService } from '../contracts/contracts.service';
import { OrdersService } from '../orders/orders.service';
import { CitiesService } from '../cities/cities.service';
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
        const orders: any = {
            create: jest.fn().mockResolvedValue({ id: 'рейс-1', orderNumber: '000000042' }),
            ...over.orders,
        };
        const cities: any = {
            // По умолчанию город узнаётся: справочник в этих тестах не главное.
            resolve: jest.fn(async (name?: string | null, id?: string | null) => ({
                id: id ?? (name ? 'город' : null),
                name: name ?? 'Город',
                key: (name || 'город').toLowerCase(),
            })),
            ...over.cities,
        };
        const service = new QuoteRequestsService(
            prisma as unknown as PrismaService,
            contracts as unknown as ContractsService,
            orders as unknown as OrdersService,
            cities as unknown as CitiesService,
        );
        return { service, prisma, contracts, orders, cities };
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

    /**
     * Главная жалоба клиента платформы: один и тот же завод заведён двумя
     * карточками — «Шымкент пиво» и «Шымкентский пивзавод». Менеджер выбрал
     * одну, а история лежит под другой, и панель написала «запросов не
     * было» при полной папке.
     */
    describe('память по направлению', () => {
        const прошлое = (over: any = {}) => ({
            id: 'з1', requestNumber: 'ЗПР-00001', createdAt: new Date('2026-08-01T10:00:00Z'),
            customerPrice: 130_000, carrierCost: 100_000, cargoWeight: 20_000, cargoVolume: 86,
            palletCount: null, cargoType: 'тент', status: 'REJECTED', rejectionReason: 'дорого',
            customerCompanyId: 'клиент', customerCompany: { id: 'клиент', name: 'Шымкент пиво' },
            ...over,
        });

        it('ищется по направлению, а карточка клиента — уже второй разрез', async () => {
            const { service, prisma } = создать();

            await service.memory('наша-компания', {
                customerCompanyId: 'клиент',
                originCityName: 'Шымкент',
                destinationCityName: 'Алматы',
            });

            // В отборе клиента нет: иначе история второй карточки не нашлась
            // бы никогда.
            const where = prisma.quoteRequest.findMany.mock.calls[0][0].where;
            expect(JSON.stringify(where)).not.toContain('customerCompanyId');
        });

        it('история другой карточки видна отдельным блоком', async () => {
            const { service } = создать({
                prisma: {
                    quoteRequest: {
                        findMany: jest.fn().mockResolvedValue([
                            прошлое({ customerCompanyId: 'пивзавод', customerCompany: { name: 'Шымкентский пивзавод' } }),
                        ]),
                        count: jest.fn().mockResolvedValue(0),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockResolvedValue(null),
                        update: jest.fn(), create: jest.fn(),
                    },
                },
            });

            const result = await service.memory('наша-компания', {
                customerCompanyId: 'пиво',
                originCityName: 'Шымкент',
                destinationCityName: 'Алматы',
            });

            // У выбранной карточки истории нет — и это правда.
            expect(result.last).toBeNull();
            // Но по направлению она есть, и её видно.
            expect(result.others.count).toBe(1);
            expect(result.others.items[0].customerName).toBe('Шымкентский пивзавод');
        });

        it('чужая цена не выдаётся за цену этого клиента', async () => {
            // Разделение не косметическое: у другого клиента бывает годовой
            // тариф и другие условия. Смешать — однажды назвать чужую цену.
            const { service } = создать({
                prisma: {
                    quoteRequest: {
                        findMany: jest.fn().mockResolvedValue([
                            прошлое({ id: 'свой', customerPrice: 130_000 }),
                            прошлое({ id: 'чужой', customerCompanyId: 'другой', customerPrice: 90_000 }),
                        ]),
                        count: jest.fn().mockResolvedValue(0),
                        findFirst: jest.fn().mockResolvedValue(null),
                        findUnique: jest.fn().mockResolvedValue(null),
                        update: jest.fn(), create: jest.fn(),
                    },
                },
            });

            const result = await service.memory('наша-компания', {
                customerCompanyId: 'клиент',
                originCityName: 'Шымкент',
                destinationCityName: 'Алматы',
            });

            expect(result.range?.customerFrom).toBe(130_000);
            expect(result.items).toHaveLength(1);
            expect(result.others.range?.customerFrom).toBe(90_000);
        });

        it('без названного маршрута история не показывается вовсе', async () => {
            // Пустой отбор означал бы «вся история компании» — менеджер
            // пошёл бы по ложному следу.
            const { service, prisma } = создать({
                cities: { resolve: jest.fn().mockResolvedValue({ id: null, name: null, key: null }) },
            });

            const result = await service.memory('наша-компания', { customerCompanyId: 'клиент' });

            expect(prisma.quoteRequest.findMany).not.toHaveBeenCalled();
            expect(result.last).toBeNull();
            expect(result.others.count).toBe(0);
        });

        it('старые запросы находятся по ссылке на справочник, новые — по ключу', async () => {
            // До перехода на текст у запросов есть только ссылка на город.
            // Потерять их историю нельзя.
            const { service, prisma } = создать();

            await service.memory('наша-компания', {
                customerCompanyId: 'клиент',
                originCityName: 'Шымкент',
                destinationCityName: 'Алматы',
            });

            const where = prisma.quoteRequest.findMany.mock.calls[0][0].where;
            expect(where.AND).toContainEqual({
                OR: [{ originCityKey: 'шымкент' }, { originCityId: 'город' }],
            });
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

        it('паллеты из запроса переезжают в заявку составом, а не одним числом', async () => {
            // Менеджер обещал клиенту пять финских паллет. Если в заявку
            // уедет голое число, карточка рейса, кабинет водителя и печатные
            // формы покажут «5 палет» без вида — и на погрузке выяснится, что
            // машина не та. Размеры подставляются по виду, вручную их никто
            // не вводит.
            const { service, prisma, orders } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue(запрос({
                originLocationId: 'адрес-погрузки',
                destinationLocationId: 'адрес-выгрузки',
                palletKind: 'FIN',
                palletCount: 5,
            }));

            await service.approve('наша-компания', 'з1');

            expect(orders.create.mock.calls[0][0]).toMatchObject({
                palletCount: 5,
                pallets: [{ kind: 'FIN', count: 5, length: 120, width: 100 }],
            });
        });

        it('без паллет состав в заявку не уходит', async () => {
            // Пустая строка состава выглядит как забытый ввод и мешает
            // больше, чем отсутствие состава.
            const { service, prisma, orders } = создать();
            prisma.quoteRequest.findFirst.mockResolvedValue(запрос({
                originLocationId: 'адрес-погрузки',
                destinationLocationId: 'адрес-выгрузки',
                palletKind: null,
                palletCount: null,
            }));

            await service.approve('наша-компания', 'з1');

            expect(orders.create.mock.calls[0][0].pallets).toBeUndefined();
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

        it('города, которого нет в справочнике, достаточно текстом', async () => {
            // Ровно на этом сорвалась компания: Мынарала нет в справочнике,
            // потому что справочник наполняется геокодером, — и запрос не
            // заводился вовсе.
            const { service, prisma, cities } = создать({
                cities: {
                    resolve: jest.fn(async (name?: string | null) => ({
                        id: null, name: name ?? null, key: (name || '').toLowerCase(),
                    })),
                },
            });

            await service.create('наша-компания', 'я', {
                customerCompanyId: 'клиент',
                originCityName: 'Мынарал',
                destinationCityName: 'Алматы',
            });

            expect(cities.resolve).toHaveBeenCalled();
            expect(prisma.quoteRequest.create.mock.calls[0][0].data).toMatchObject({
                originCityId: null,
                originCityName: 'Мынарал',
                originCityKey: 'мынарал',
            });
        });

        it('совсем без маршрута запрос не заводится', async () => {
            // Запрос без городов не с чем сравнивать и нечего искать — от
            // него нет пользы ни менеджеру, ни памяти по направлению.
            const { service } = создать();

            await expect(
                service.create('наша-компания', 'я', { customerCompanyId: 'клиент' }),
            ).rejects.toThrow('Укажите город погрузки');
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

    /**
     * Согласование клиента должно сразу превращаться в рейс.
     *
     * Раньше менеджер набирал те же клиента, маршрут, груз и цены во
     * второй раз — это лишняя работа и место, где цифры расходятся:
     * согласовали одну сумму, в заявку попала другая.
     */
    describe('согласованный запрос становится заявкой', () => {
        const готовыйЗапрос = {
            id: 'з-1',
            companyId: 'наша',
            customerCompanyId: 'клиент',
            customerPrice: 450000,
            carrierCost: 330000,
            originLocationId: 'адрес-погрузки',
            destinationLocationId: 'адрес-выгрузки',
            cargoDescription: 'Пиво в паллетах',
            palletCount: 12,
            cargoWeight: 18000,
            orderId: null,
            readyDate: new Date('2026-08-01'),
            notes: null,
            natureOfCargo: null,
            cargoType: null,
            cargoVolume: null,
            createdById: 'менеджер',
        };

        const стенд = (запрос: any = готовыйЗапрос) => создать({
            prisma: {
                quoteRequest: {
                    findFirst: jest.fn().mockResolvedValue(запрос),
                    update: jest.fn().mockImplementation(({ data }: any) => ({ ...запрос, ...data })),
                },
            },
        });

        it('заявка создаётся с теми же суммами, что согласовал клиент', async () => {
            const { service, orders } = стенд();
            await service.approve('наша', 'з-1', 'менеджер');

            expect(orders.create).toHaveBeenCalledTimes(1);
            const данные = orders.create.mock.calls[0][0];
            // Пересчёта быть не должно: клиент подтвердил конкретное число.
            expect(данные.customerPrice).toBe(450000);
            expect(данные.driverCost).toBe(330000);
            expect(данные.customerCompanyId).toBe('клиент');
            expect(данные.palletCount).toBe(12);
        });

        it('маршрут заявки берётся из адресов запроса', async () => {
            const { service, orders } = стенд();
            await service.approve('наша', 'з-1', 'менеджер');

            const точки = orders.create.mock.calls[0][0].routePoints;
            expect(точки).toHaveLength(2);
            expect(точки[0]).toMatchObject({ locationId: 'адрес-погрузки', pointType: 'PICKUP' });
            expect(точки[1]).toMatchObject({ locationId: 'адрес-выгрузки', pointType: 'DELIVERY' });
        });

        it('созданная заявка привязывается к запросу', async () => {
            const { service, prisma } = стенд();
            const итог = await service.approve('наша', 'з-1', 'менеджер');

            expect(prisma.quoteRequest.update).toHaveBeenCalled();
            expect((итог as any).orderId).toBe('рейс-1');
            expect((итог as any).status).toBe('APPROVED');
        });

        it('повторное согласование не плодит вторую заявку', async () => {
            // Кнопку нажимают дважды чаще, чем кажется, а лишний рейс
            // попадает и в журнал, и в отчёты, и в зарплату менеджера.
            const { service, orders } = стенд({ ...готовыйЗапрос, orderId: 'рейс-1' });
            await service.approve('наша', 'з-1', 'менеджер');
            expect(orders.create).not.toHaveBeenCalled();
        });

        it('без адреса из справочника согласование проходит, но заявки нет — и сказано почему', async () => {
            // Согласие клиента — факт, его записывают сразу: менеджеру
            // говорят «берём» по телефону. Запрещать это из-за незаведённого
            // адреса значит терять факт. Заявку строим, когда есть маршрут,
            // а чего не хватило — говорим словами.
            const { service, orders } = стенд({ ...готовыйЗапрос, destinationLocationId: null });
            const итог: any = await service.approve('наша', 'з-1', 'менеджер');

            expect(итог.status).toBe('APPROVED');
            expect(итог.orderCreated).toBe(false);
            expect(итог.orderNotCreatedReason).toMatch(/выгрузки/);
            expect(orders.create).not.toHaveBeenCalled();
        });

        it('без цены для клиента согласовывать нечего', async () => {
            const { service, orders } = стенд({ ...готовыйЗапрос, customerPrice: null });
            await expect(service.approve('наша', 'з-1', 'менеджер')).rejects.toThrow();
            expect(orders.create).not.toHaveBeenCalled();
        });
    });
});
