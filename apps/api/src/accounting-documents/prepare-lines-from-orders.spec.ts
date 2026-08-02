import { prepareLinesFromOrders, forwardingFee } from './prepare-lines-from-orders';

/**
 * Несколько рейсов в одном счёте и экспедиторское вознаграждение.
 *
 * Со слов бухгалтера: у Кока-Колы в счёте пять перевозок, иногда двадцать.
 * Со слов владельца: экспедиторские услуги — это разница между нашим
 * тарифом и тарифом перевозчика, и НДС считается именно с неё.
 */

const рейс = (over: any = {}) => ({
    id: 'р-1',
    orderNumber: '000000238',
    assignedDriverName: 'Джамбеков Дмитрий Евгеньевич',
    assignedDriverPlate: '950AXM16',
    vehicleModel: 'ГАЗ',
    loadingDate: new Date('2026-07-20T09:00:00Z'),
    customerPrice: 120000,
    driverCost: 100000,
    routePoints: [
        { pointType: 'PICKUP', sequence: 1, location: { city: 'Караганда' } },
        { pointType: 'DELIVERY', sequence: 2, location: { city: 'Балхаш' } },
    ],
    ...over,
});

describe('Строки счёта по нескольким рейсам', () => {
    it('каждый рейс — отдельная строка со своей расшифровкой', () => {
        const строки = prepareLinesFromOrders([
            рейс(),
            рейс({ id: 'р-2', orderNumber: '000000239', customerPrice: 90000 }),
        ]);

        expect(строки).toHaveLength(2);
        expect(строки[0].description).toContain('заявка №000000238');
        expect(строки[1].description).toContain('заявка №000000239');
        expect(строки[0].unitPrice).toBe(120000);
        expect(строки[1].unitPrice).toBe(90000);
    });

    it('двадцать рейсов дают двадцать строк', () => {
        // Бухгалтер называла именно это число.
        const много = Array.from({ length: 20 }, (_, i) =>
            рейс({ id: `р-${i}`, orderNumber: String(i).padStart(9, '0') }));
        expect(prepareLinesFromOrders(много)).toHaveLength(20);
    });

    it('перевозка считается одной услугой, а не тоннами', () => {
        const [строка] = prepareLinesFromOrders([рейс()]);
        expect(строка.quantity).toBe(1);
        expect(строка.unit).toBe('усл');
    });

    it('сумма берётся из цены клиенту, а не из цены перевозчика', () => {
        const [строка] = prepareLinesFromOrders([рейс({ customerPrice: 120000, driverCost: 100000 })]);
        expect(строка.unitPrice).toBe(120000);
    });

    it('сумма из базы приходит строкой и всё равно считается числом', () => {
        // Деньги в базе — Decimal, в JSON он приезжает строкой.
        const [строка] = prepareLinesFromOrders([рейс({ customerPrice: '120000.00' })]);
        expect(строка.unitPrice).toBe(120000);
    });

    it('строка привязана к рейсу — по ней потом видно, что счёт выставлен', () => {
        const [строка] = prepareLinesFromOrders([рейс()]);
        expect(строка.orderId).toBe('р-1');
    });

    it('счёт ОТ перевозчика берёт его тариф, а не наш', () => {
        // Перепутать значит заплатить перевозчику собственный тариф вместе
        // с наценкой: 120 000 вместо 100 000.
        const [строка] = prepareLinesFromOrders(
            [рейс({ customerPrice: 120000, driverCost: 100000 })], { direction: 'INCOMING' },
        );
        expect(строка.unitPrice).toBe(100000);
    });

    it('по умолчанию счёт наш, и сумма клиентская', () => {
        const [строка] = prepareLinesFromOrders([рейс({ customerPrice: 120000, driverCost: 100000 })]);
        expect(строка.unitPrice).toBe(120000);
    });
});

describe('Экспедиторское вознаграждение', () => {
    it('это разница между тарифом клиента и тарифом перевозчика', () => {
        // Пример владельца: клиент платит 120, поехал за 100 → 20.
        expect(forwardingFee(рейс({ customerPrice: 120000, driverCost: 100000 }))).toBe(20000);
    });

    it('убыточный рейс не даёт вознаграждения со знаком минус', () => {
        // Отрицательная строка уменьшила бы налог на пустом месте.
        expect(forwardingFee(рейс({ customerPrice: 90000, driverCost: 100000 }))).toBe(0);
    });

    it('без цены перевозчика вся сумма считается вознаграждением', () => {
        // Машину ещё не нашли — весь тариф пока наш.
        expect(forwardingFee(рейс({ customerPrice: 120000, driverCost: null }))).toBe(120000);
    });

    it('пустой рейс даёт ноль, а не поломку', () => {
        expect(forwardingFee({ id: 'р' })).toBe(0);
    });
});
