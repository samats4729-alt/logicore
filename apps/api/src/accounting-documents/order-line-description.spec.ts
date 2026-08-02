import { buildOrderLineDescription, shortenName } from './order-line-description';

/**
 * Строка счёта по рейсу.
 *
 * Образец — счёт № 205 из 1С, который прислал владелец:
 * «Транспортные услуги, маршрут: г Караганда — г Балхаш, водитель
 * Джамбеков Д.Е., дата 20.07.2026, авт. ГАЗ, г/н 950AXM16, заявка №…».
 */

const рейс = {
    orderNumber: '000000238',
    assignedDriverName: 'Джамбеков Дмитрий Евгеньевич',
    assignedDriverPlate: '950AXM16',
    assignedDriverTrailer: 'KZ 123',
    vehicleModel: 'ГАЗ',
    externalNumber: '36136',
    loadingDate: new Date('2026-07-20T09:00:00Z'),
    routePoints: [
        { pointType: 'PICKUP', sequence: 1, location: { city: 'Караганда', name: 'Склад' } },
        { pointType: 'DELIVERY', sequence: 2, location: { city: 'Балхаш', name: 'Терминал' } },
    ],
};

describe('Строка счёта по рейсу', () => {
    it('собирается в том же виде, что в 1С', () => {
        expect(buildOrderLineDescription(рейс)).toBe(
            'Транспортные услуги, маршрут: Караганда — Балхаш, водитель Джамбеков Д.Е., ' +
            'дата 20.07.2026, авт. ГАЗ, г/н 950AXM16, заявка №000000238',
        );
    });

    it('фамилия с инициалами, а не полное имя', () => {
        // Полное имя занимает половину строки и вытесняет то, ради чего
        // строка нужна.
        expect(shortenName('Джамбеков Дмитрий Евгеньевич')).toBe('Джамбеков Д.Е.');
        expect(shortenName('Ким Сергей')).toBe('Ким С.');
        expect(shortenName('Бондарев')).toBe('Бондарев');
        expect(shortenName('')).toBeNull();
        expect(shortenName(null)).toBeNull();
    });

    it('пустые куски пропускаются, а не пишутся «не указан»', () => {
        // Счёт уходит клиенту. «Водитель: не указан» в нём недопустимо.
        const строка = buildOrderLineDescription({
            ...рейс, assignedDriverName: null, vehicleModel: null, assignedDriverPlate: null,
        });
        expect(строка).toBe(
            'Транспортные услуги, маршрут: Караганда — Балхаш, дата 20.07.2026, заявка №000000238',
        );
        expect(строка).not.toMatch(/не указан/);
    });

    it('состав строки настраивается — платформа не под одного заказчика', () => {
        expect(buildOrderLineDescription(рейс, { parts: ['route', 'orderNumber'] }))
            .toBe('Транспортные услуги, маршрут: Караганда — Балхаш, заявка №000000238');

        // Кому-то нужен прицеп и внешний номер клиента.
        expect(buildOrderLineDescription(рейс, { parts: ['route', 'trailer', 'externalId'] }))
            .toBe('Транспортные услуги, маршрут: Караганда — Балхаш, п/п KZ 123, ID 36136');
    });

    it('название услуги задаётся — бывают не только перевозки', () => {
        expect(buildOrderLineDescription(рейс, { service: 'Экспедиторские услуги', parts: ['orderNumber'] }))
            .toBe('Экспедиторские услуги, заявка №000000238');
    });

    it('совсем без данных остаётся только название услуги', () => {
        expect(buildOrderLineDescription({})).toBe('Транспортные услуги');
    });

    it('маршрут строится по порядку точек, а не по их месту в списке', () => {
        const строка = buildOrderLineDescription({
            routePoints: [
                { pointType: 'DELIVERY', sequence: 2, location: { city: 'Астана' } },
                { pointType: 'PICKUP', sequence: 1, location: { city: 'Алматы' } },
            ],
        }, { parts: ['route'] });
        expect(строка).toBe('Транспортные услуги, маршрут: Алматы — Астана');
    });

    it('если у адреса нет города, берётся его название', () => {
        const строка = buildOrderLineDescription({
            routePoints: [
                { pointType: 'PICKUP', sequence: 1, location: { city: null, name: 'Склад №4' } },
                { pointType: 'DELIVERY', sequence: 2, location: { city: 'Балхаш' } },
            ],
        }, { parts: ['route'] });
        expect(строка).toBe('Транспортные услуги, маршрут: Склад №4 — Балхаш');
    });

    it('номер клиента подписывается так, как его называет клиент', () => {
        // У одного это ID, у другого СТС, у третьего свой номер заказа.
        // Жёстко писать «ID» значит подписать чужой номер чужим словом.
        expect(buildOrderLineDescription(рейс, { parts: ['externalId'], externalLabel: 'СТС' }))
            .toBe('Транспортные услуги, СТС 36136');
        expect(buildOrderLineDescription(рейс, { parts: ['externalId'] }))
            .toBe('Транспортные услуги, ID 36136');
    });

    it('без номера клиента строка про него молчит', () => {
        expect(buildOrderLineDescription({ ...рейс, externalNumber: null }, { parts: ['route', 'externalId'] }))
            .toBe('Транспортные услуги, маршрут: Караганда — Балхаш');
    });
});
