import { buildQuoteMemory, humanAgo, PastQuote } from './quote-memory';

/**
 * От этих правил зависит цена, которую менеджер назовёт клиенту. Поэтому
 * проверяется не «функция что-то вернула», а каждый случай из жизни,
 * ради которого раздел и заводился.
 */
describe('Память по запросам клиента', () => {
    const СЕЙЧАС = new Date('2026-07-29T10:00:00Z');

    /**
     * Суммы в подсказке разделены неразрывным пробелом, а не обычным: цена
     * не должна разрываться переносом строки. Сравниваем так же, иначе
     * проверка спорит с форматированием, а не с сутью.
     */
    const сумма = (n: number) => n.toLocaleString('ru-RU');

    const запрос = (over: Partial<PastQuote> = {}): PastQuote => ({
        id: 'з1',
        requestNumber: 'ЗПР-00001',
        createdAt: new Date('2026-07-27T10:00:00Z'),
        customerPrice: 130_000,
        carrierCost: 100_000,
        cargoWeight: 20_000,
        cargoVolume: 86,
        cargoType: 'тент',
        status: 'REJECTED',
        rejectionReason: 'дорого',
        ...over,
    });

    it('пустая история ничего не советует', () => {
        const m = buildQuoteMemory([], { cargoWeight: 20_000 }, СЕЙЧАС);

        expect(m.last).toBeNull();
        expect(m.recommendedPrice).toBeNull();
        expect(m.advice).toBeNull();
    });

    it('после отказа советует ниже отказной цены', () => {
        const m = buildQuoteMemory(
            [запрос()],
            { cargoWeight: 20_000, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        // 130 000 − 5% = 123 500, вниз до тысячи = 123 000.
        expect(m.recommendedPrice).toBe(123_000);
        expect(m.sameConditions).toBe(true);
        expect(m.advice).toContain('не принял');
        expect(m.advice).toContain(сумма(123_000));
    });

    it('если те же условия уже согласовывали — предлагает ту же цену', () => {
        const m = buildQuoteMemory(
            [запрос({ status: 'APPROVED', rejectionReason: null })],
            { cargoWeight: 20_000, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.recommendedPrice).toBe(130_000);
        expect(m.advice).toContain('принимал');
        expect(m.advice).toContain('условия те же');
    });

    it('не опускает цену ниже той, которую клиент уже платил', () => {
        // Отказали на 130 000, но 128 000 когда-то приняли. Опускаться до
        // 123 000 незачем: 128 000 доказанно проходит.
        const m = buildQuoteMemory(
            [
                запрос({ id: 'з1', customerPrice: 130_000, status: 'REJECTED' }),
                запрос({
                    id: 'з2',
                    requestNumber: 'ЗПР-00002',
                    createdAt: new Date('2026-07-20T10:00:00Z'),
                    customerPrice: 128_000,
                    status: 'APPROVED',
                    rejectionReason: null,
                }),
            ],
            { cargoWeight: 20_000, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.recommendedPrice).toBe(128_000);
        expect(m.advice).toContain(сумма(128_000));
    });

    it('замечает, что условия изменились, и требует пересчёта', () => {
        const m = buildQuoteMemory(
            [запрос()],
            { cargoWeight: 5_000, cargoVolume: 20, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.sameConditions).toBe(false);
        expect(m.differences.join(' ')).toContain('вес: было 20 т, стало 5 т');
        expect(m.differences.join(' ')).toContain('объём: было 86 м³, стало 20 м³');
        expect(m.advice).toContain('пересчитайте');
    });

    it('мелкое расхождение веса не считает изменением условий', () => {
        // 20 т и 20,5 т для цены — одно и то же.
        const m = buildQuoteMemory(
            [запрос()],
            { cargoWeight: 20_500, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.sameConditions).toBe(true);
    });

    it('берёт последний случай, а не первый попавшийся', () => {
        const m = buildQuoteMemory(
            [
                запрос({ id: 'старый', createdAt: new Date('2026-05-01T10:00:00Z'), customerPrice: 200_000 }),
                запрос({ id: 'свежий', createdAt: new Date('2026-07-27T10:00:00Z'), customerPrice: 130_000 }),
            ],
            { cargoWeight: 20_000, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.last?.id).toBe('свежий');
    });

    it('незакрытые запросы ничему не учат и в расчёт не идут', () => {
        // Клиент по ним ещё не ответил — вывод из них делать не из чего.
        const m = buildQuoteMemory(
            [запрос({ status: 'NEW' }), запрос({ id: 'з2', status: 'IN_PROGRESS' })],
            { cargoWeight: 20_000 },
            СЕЙЧАС,
        );

        expect(m.last).toBeNull();
        expect(m.recommendedPrice).toBeNull();
    });

    it('показывает вилку по маршруту: и клиенту, и закупку', () => {
        const m = buildQuoteMemory(
            [
                запрос({ id: 'з1', customerPrice: 130_000, carrierCost: 100_000 }),
                запрос({ id: 'з2', customerPrice: 125_000, carrierCost: 92_000, status: 'APPROVED' }),
                запрос({ id: 'з3', customerPrice: 140_000, carrierCost: 110_000 }),
            ],
            { cargoWeight: 20_000 },
            СЕЙЧАС,
        );

        expect(m.range).toEqual({
            customerFrom: 125_000,
            customerTo: 140_000,
            carrierFrom: 92_000,
            carrierTo: 110_000,
            count: 3,
        });
    });

    it('вилка не разваливается, когда закупку не записали', () => {
        const m = buildQuoteMemory(
            [запрос({ carrierCost: null })],
            { cargoWeight: 20_000 },
            СЕЙЧАС,
        );

        expect(m.range?.carrierFrom).toBeNull();
        expect(m.range?.customerFrom).toBe(130_000);
    });
});

describe('Сколько времени прошло', () => {
    const СЕЙЧАС = new Date('2026-07-29T10:00:00Z');

    it('говорит по-человечески', () => {
        expect(humanAgo(new Date('2026-07-29T09:00:00Z'), СЕЙЧАС)).toBe('сегодня');
        expect(humanAgo(new Date('2026-07-28T09:00:00Z'), СЕЙЧАС)).toBe('вчера');
        expect(humanAgo(new Date('2026-07-27T09:00:00Z'), СЕЙЧАС)).toBe('2 дня назад');
        expect(humanAgo(new Date('2026-07-24T09:00:00Z'), СЕЙЧАС)).toBe('5 дней назад');
        expect(humanAgo(new Date('2026-07-08T09:00:00Z'), СЕЙЧАС)).toBe('21 день назад');
        expect(humanAgo(new Date('2026-07-17T09:00:00Z'), СЕЙЧАС)).toBe('12 дней назад');
    });
});
