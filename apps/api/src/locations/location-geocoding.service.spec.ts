import { LocationGeocodingService } from './location-geocoding.service';

/**
 * Дозапись координат.
 *
 * Ошибки здесь тихие и дорогие сразу в двух смыслах. Затереть точку,
 * поставленную человеком, — значит увести водителя от въезда на склад к
 * середине улицы, и никто не поймёт почему. Пойти в геокодер без ключа —
 * значит пометить весь список ненайденным и потерять очередь на неделю.
 * Взять всё разом — значит выжечь месячный лимит платных запросов за минуту.
 */
describe('Дозапись координат адресам', () => {
    /** Что вернёт `visibleToCompany`, когда компанию действительно передали. */
    const VISIBILITY = { OR: [{ companyId: 'c-1' }, { companyId: null }] };

    const build = (options: {
        configured?: boolean;
        locations?: any[];
        point?: { lat: number; lon: number } | null;
    } = {}) => {
        const prisma: any = {
            location: {
                findMany: jest.fn().mockResolvedValue(options.locations ?? []),
                update: jest.fn().mockResolvedValue({}),
                count: jest.fn().mockResolvedValue(0),
            },
        };
        const redis: any = { delByPattern: jest.fn().mockResolvedValue(undefined) };
        const geo: any = {
            suggest: jest.fn().mockResolvedValue({
                configured: options.configured ?? true,
                items: options.point ? [{ point: options.point }] : [],
            }),
        };
        const locations: any = {
            visibleToCompany: jest.fn(async (companyId?: string) => (companyId ? VISIBILITY : {})),
        };
        return {
            service: new LocationGeocodingService(prisma, redis, geo, locations),
            prisma, geo, redis, locations,
        };
    };

    it('без ключа геокодера ничего не помечается ненайденным', async () => {
        // Иначе один проход при выключенном ключе пометил бы весь список, и
        // адреса не пробовались бы ещё неделю — уже после оплаты запросов.
        const { service, prisma } = build({ configured: false, locations: [{ id: 'l-1' }] });

        const result = await service.sweep();

        expect(result.configured).toBe(false);
        expect(prisma.location.update).not.toHaveBeenCalled();
    });

    it('ручные точки в отбор не попадают', async () => {
        // Человек знает, где въезд на склад; геокодер поставит середину улицы.
        const { service, prisma } = build();

        await service.sweep();

        expect(prisma.location.findMany.mock.calls[0][0].where).toMatchObject({
            latitude: null,
            coordinatesManual: false,
        });
    });

    it('берётся пачка, а не весь хвост разом', async () => {
        // Геокодер платный: вычерпать месячный запас за минуту на старых
        // адресах — худшее, что можно сделать с деньгами владельца.
        const { service, prisma } = build();

        await service.sweep();

        expect(prisma.location.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(50);
    });

    it('найденная точка записывается и снимает отметку неудачи', async () => {
        const { service, prisma } = build({
            locations: [{ id: 'l-1', address: 'Алматы, Сатпаева 90', country: null, region: null, city: 'Алматы', street: null, house: null }],
            point: { lat: 43.23, lon: 76.9 },
        });

        const result = await service.sweep();

        expect(result).toMatchObject({ tried: 1, found: 1, missed: 0 });
        expect(prisma.location.update.mock.calls[0][0].data)
            .toEqual({ latitude: 43.23, longitude: 76.9, geocodeFailedAt: null });
    });

    it('ненайденный адрес помечается, а не забывается', async () => {
        // Мынарал может не отдаться и рабочему ключу. Молча оставить адрес
        // без точки — значит никогда об этом не узнать.
        const { service, prisma } = build({
            locations: [{ id: 'l-1', address: 'Мынарал', country: null, region: null, city: 'Мынарал', street: null, house: null }],
            point: null,
        });

        const result = await service.sweep();

        expect(result).toMatchObject({ found: 0, missed: 1 });
        expect(prisma.location.update.mock.calls[0][0].data.geocodeFailedAt).toBeInstanceOf(Date);
    });

    it('спрашиваем от точного к общему, пока не найдётся', async () => {
        // Дом точнее улицы, улица точнее города, но точка на улице лучше,
        // чем никакой.
        const { service, geo } = build({
            locations: [{
                id: 'l-1', address: 'Казахстан, Мынарал, Центральная 5',
                country: 'Казахстан', region: 'Жамбылская', city: 'Мынарал',
                street: 'Центральная', house: '5',
            }],
            point: null,
        });

        await service.sweep();

        // Первый запрос — проверка ключа, дальше попытки по адресу.
        const queries = geo.suggest.mock.calls.slice(1).map((c: any[]) => c[0]);
        expect(queries[0]).toBe('Казахстан, Мынарал, Центральная 5');
        expect(queries[queries.length - 1]).toBe('Казахстан, Жамбылская, Мынарал');
    });

    it('одинаковые запросы не повторяются', async () => {
        // У адреса без улицы части складываются в ту же строку, что и адрес
        // целиком: платить за один и тот же запрос дважды незачем.
        const { service, geo } = build({
            locations: [{
                id: 'l-1', address: 'Казахстан, Мынарал',
                country: 'Казахстан', region: null, city: 'Мынарал', street: null, house: null,
            }],
            point: null,
        });

        await service.sweep();

        const queries = geo.suggest.mock.calls.slice(1).map((c: any[]) => c[0]);
        expect(new Set(queries).size).toBe(queries.length);
    });

    it('второй проход поверх первого не запускается', async () => {
        const { service, prisma } = build({
            locations: [{ id: 'l-1', address: 'Алматы', country: null, region: null, city: 'Алматы', street: null, house: null }],
            point: { lat: 43.2, lon: 76.9 },
        });

        const [first, second] = await Promise.all([service.sweep(), service.sweep()]);

        expect(first.tried + second.tried).toBe(1);
        expect(prisma.location.findMany).toHaveBeenCalledTimes(1);
    });

    it('по кнопке берутся и те, что недавно не нашлись', async () => {
        // Фон их откладывает, чтобы не жечь запросы. Но человек нажал и ждёт.
        const { service, prisma } = build();

        await service.sweep({ force: true });

        expect(prisma.location.findMany.mock.calls[0][0].where.OR).toBeUndefined();
    });

    it('сам по себе фон недавние неудачи пропускает', async () => {
        const { service, prisma } = build();

        await service.sweep();

        expect(prisma.location.findMany.mock.calls[0][0].where.OR).toHaveLength(2);
    });

    it('компания считает свои адреса по тому же правилу, что и список', async () => {
        // `Location.companyId` — это контрагент, к которому привязана точка, а
        // не владелец. У общих адресов там пусто, и их большинство. Отбор
        // «где companyId равен нашему» показал бы ноль там, где адресов без
        // координат десятки.
        const { service, prisma, locations } = build();

        await service.countMissing('c-1');

        expect(locations.visibleToCompany).toHaveBeenCalledWith('c-1');
        expect(prisma.location.count.mock.calls[0][0].where.AND).toEqual([VISIBILITY]);
    });

    it('видимость не затирается условием про недавние неудачи', async () => {
        // Оба условия — списком `OR`. Если положить их в один корень, второе
        // перебьёт первое, и компания увидит чужие адреса.
        const { service, prisma } = build();

        await service.sweep({ companyId: 'c-1' });

        const where = prisma.location.findMany.mock.calls[0][0].where;
        expect(where.AND).toEqual([VISIBILITY]);
        expect(where.OR).toHaveLength(2);
    });
});
