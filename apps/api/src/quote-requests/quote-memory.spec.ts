import { buildQuoteMemory, humanAgo, PastQuote } from './quote-memory';

/**
 * Проверяется главное требование владельца: система показывает факты и не
 * назначает цену за менеджера. Поэтому здесь нет ни одной проверки на
 * «посчитала сумму» — есть проверки на то, что прошлый случай показан
 * целиком и ничего из него не потерялось.
 */
describe('Память по запросам клиента', () => {
    const СЕЙЧАС = new Date('2026-07-29T10:00:00Z');

    /** Суммы разделены неразрывным пробелом: цена не рвётся переносом. */
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

    it('пустая история молчит, а не выдумывает', () => {
        const m = buildQuoteMemory([], { cargoWeight: 20_000 }, СЕЙЧАС);

        expect(m.last).toBeNull();
        expect(m.note).toBeNull();
        expect(m.range).toBeNull();
    });

    it('цену не назначает ни при каком исходе', () => {
        // Главное требование: менеджер видит факты и решает сам. Ни одного
        // поля с «рекомендуемой суммой» здесь быть не должно.
        const отказ = buildQuoteMemory([запрос()], { cargoWeight: 20_000 }, СЕЙЧАС);
        const согласие = buildQuoteMemory(
            [запрос({ status: 'APPROVED', rejectionReason: null })],
            { cargoWeight: 20_000 },
            СЕЙЧАС,
        );

        expect(отказ).not.toHaveProperty('recommendedPrice');
        expect(согласие).not.toHaveProperty('recommendedPrice');
    });

    it('после отказа показывает цену и причину, но ничего не советует', () => {
        const m = buildQuoteMemory(
            [запрос({ rejectionReason: 'нашли машину дешевле' })],
            { cargoWeight: 20_000, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.note).toContain(сумма(130_000));
        expect(m.note).toContain('не была принята');
        expect(m.note).toContain('нашли машину дешевле');
        expect(m.note).toContain('Условия те же');
        // Никаких «предложите столько-то».
        expect(m.note).not.toMatch(/предлож/i);
    });

    it('честно говорит, когда причину отказа не записали', () => {
        const m = buildQuoteMemory(
            [запрос({ rejectionReason: null })],
            { cargoWeight: 20_000, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.note).toContain('Причина не указана');
    });

    it('пустая строка в причине — это тоже «не указана»', () => {
        const m = buildQuoteMemory(
            [запрос({ rejectionReason: '   ' })],
            { cargoWeight: 20_000, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.note).toContain('Причина не указана');
    });

    it('если цену принимали при тех же условиях — так и пишет', () => {
        const m = buildQuoteMemory(
            [запрос({ status: 'APPROVED', rejectionReason: null })],
            { cargoWeight: 20_000, cargoVolume: 86, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.note).toContain(сумма(130_000));
        expect(m.note).toContain('уже проходила');
        expect(m.note).toContain('при тех же условиях');
    });

    it('принятая цена при изменившихся условиях не выдаётся за годную', () => {
        const m = buildQuoteMemory(
            [запрос({ status: 'APPROVED', rejectionReason: null })],
            { cargoWeight: 5_000, cargoVolume: 20, cargoType: 'тент' },
            СЕЙЧАС,
        );

        expect(m.note).toContain('условия изменились');
        expect(m.note).not.toContain('при тех же условиях');
    });

    it('называет, что именно изменилось', () => {
        const m = buildQuoteMemory(
            [запрос()],
            { cargoWeight: 5_000, cargoVolume: 20, cargoType: 'рефрижератор' },
            СЕЙЧАС,
        );

        expect(m.sameConditions).toBe(false);
        expect(m.differences).toEqual([
            'вес: было 20 т, стало 5 т',
            'объём: было 86 м³, стало 20 м³',
            'кузов: было тент, стало рефрижератор',
        ]);
    });

    it('незаполненные поля — это «ещё не ввели», а не «изменилось»', () => {
        // Менеджер сначала выбирает клиента и маршрут, вес печатает после.
        // Если считать пустоту отличием, панель кричит «условия изменились»
        // ровно в тот момент, когда она нужнее всего, — и её перестают читать.
        const m = buildQuoteMemory([запрос()], {}, СЕЙЧАС);

        expect(m.differences).toEqual([]);
        expect(m.sameConditions).toBe(true);
        expect(m.note).not.toContain('не указан');
    });

    it('заполнили только вес — сравнивается только вес', () => {
        const m = buildQuoteMemory([запрос()], { cargoWeight: 5_000 }, СЕЙЧАС);

        expect(m.differences).toEqual(['вес: было 20 т, стало 5 т']);
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

    it('сохраняет закупочную цену прошлого раза — её забывают первой', () => {
        const m = buildQuoteMemory(
            [запрос({ carrierCost: 100_000 })],
            { cargoWeight: 20_000 },
            СЕЙЧАС,
        );

        expect(m.last?.carrierCost).toBe(100_000);
        expect(m.last?.customerPrice).toBe(130_000);
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
        expect(m.note).toBeNull();
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
