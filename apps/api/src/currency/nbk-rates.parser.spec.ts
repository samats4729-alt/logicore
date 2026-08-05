import { nbkDateParam, parseNbkRates } from './nbk-rates.parser';

/**
 * Разбор файла курсов Нацбанка.
 *
 * Кусок ниже — настоящий ответ сайта за 01.08.2026, сокращённый до пяти
 * валют. Выдуманный образец здесь бесполезен: проверять надо ровно тот
 * формат, который приходит, включая кратность и порядок полей.
 *
 * Главное, что здесь защищается, — разворот кратности. Узбекский сум
 * публикуется за 100 единиц, армянский драм за 10, иранский риал за 10 000.
 * Если взять число из файла как есть, счёт на 1 000 сумов окажется в сто
 * раз больше настоящего, и увидят это уже у клиента.
 */
const REAL_FILE = `<?xml version="1.0" encoding="utf-8"?>
<rates>
    <title>Official exchange rates of National Bank of Republic Kazakhstan</title>
    <date>01.08.2026</date>
    <item>
        <fullname>ДОЛЛАР США</fullname>
        <title>USD</title>
        <description>473.59</description>
        <quant>1</quant>
        <index>DOWN</index>
        <change>-1.04</change>
    </item>
    <item>
        <fullname>РОССИЙСКИЙ РУБЛЬ</fullname>
        <title>RUB</title>
        <description>5.94</description>
        <quant>1</quant>
        <index>UP</index>
        <change>+0.02</change>
    </item>
    <item>
        <fullname>УЗБЕКСКИХ СУМОВ</fullname>
        <title>UZS</title>
        <description>3.96</description>
        <quant>100</quant>
        <index></index>
        <change>0.00</change>
    </item>
    <item>
        <fullname>АРМЯНСКИЙ ДРАМ</fullname>
        <title>AMD</title>
        <description>13.05</description>
        <quant>10</quant>
        <index>DOWN</index>
        <change>-0.03</change>
    </item>
    <item>
        <fullname>ИРАНСКИЙ РИАЛ</fullname>
        <title>IRR</title>
        <description>11.24</description>
        <quant>10000</quant>
        <index>UP</index>
        <change>+0.01</change>
    </item>
</rates>`;

describe('Курсы Нацбанка: разбор файла', () => {
    const parsed = parseNbkRates(REAL_FILE);
    const byCode = (code: string) => parsed.rates.find((r) => r.code === code)!;

    it('берёт дату, на которую объявлены курсы', () => {
        expect(parsed.date).toBe('01.08.2026');
    });

    it('читает все валюты файла', () => {
        expect(parsed.rates.map((r) => r.code).sort()).toEqual(['AMD', 'IRR', 'RUB', 'USD', 'UZS']);
    });

    it('курс за одну единицу — как в файле, если кратность 1', () => {
        expect(byCode('USD').rate).toBeCloseTo(473.59, 6);
        expect(byCode('RUB').rate).toBeCloseTo(5.94, 6);
    });

    it('разворачивает кратность: сум публикуется за 100 единиц', () => {
        // 3.96 тенге за 100 сумов — это 0,0396 тенге за один сум.
        expect(byCode('UZS').rate).toBeCloseTo(0.0396, 6);
        expect(byCode('UZS').sourceRate).toBe(3.96);
        expect(byCode('UZS').quant).toBe(100);
    });

    it('разворачивает кратность у драма (10) и риала (10 000)', () => {
        expect(byCode('AMD').rate).toBeCloseTo(1.305, 6);
        expect(byCode('IRR').rate).toBeCloseTo(0.001124, 6);
    });

    it('исходные число и кратность сохраняются для сверки с сайтом', () => {
        // Бухгалтер сверяет глазами с сайтом Нацбанка, где написано
        // «3.96 за 100». Без исходных значений сверить невозможно.
        for (const rate of parsed.rates) {
            expect(rate.sourceRate).toBeGreaterThan(0);
            expect(rate.quant).toBeGreaterThanOrEqual(1);
            expect(rate.rate).toBeCloseTo(rate.sourceRate / rate.quant, 9);
        }
    });

    it('без поля кратности считает курс за одну единицу', () => {
        const xml = '<rates><item><title>USD</title><description>473.59</description></item></rates>';
        expect(parseNbkRates(xml).rates[0].rate).toBeCloseTo(473.59, 6);
    });

    it('строку с непонятным кодом не берёт вовсе', () => {
        // Лучше не взять курс, чем взять мусор: на курсе стоят суммы счетов.
        const xml = '<rates><item><title>ЗОЛОТО</title><description>10</description></item></rates>';
        expect(parseNbkRates(xml).rates).toHaveLength(0);
    });

    it('строку без числа или с нулём не берёт', () => {
        const xml = `<rates>
            <item><title>USD</title><description>не число</description></item>
            <item><title>EUR</title><description>0</description></item>
        </rates>`;
        expect(parseNbkRates(xml).rates).toHaveLength(0);
    });

    it('на пустом или чужом ответе не падает, а отдаёт пусто', () => {
        // Сайт может отдать страницу с ошибкой вместо файла. Это не повод
        // ронять загрузку — это повод сказать «курсов нет».
        expect(parseNbkRates('').rates).toHaveLength(0);
        expect(parseNbkRates('<html><body>502 Bad Gateway</body></html>').rates).toHaveLength(0);
    });

    it('дату для запроса собирает в формате Нацбанка', () => {
        expect(nbkDateParam(new Date(Date.UTC(2026, 7, 3)))).toBe('03.08.2026');
        expect(nbkDateParam(new Date(Date.UTC(2026, 0, 9)))).toBe('09.01.2026');
    });
});
