/**
 * Разбор файла курсов Нацбанка РК.
 *
 * Адреса:
 *   на сегодня      https://nationalbank.kz/rss/rates_all.xml
 *   на любую дату   https://nationalbank.kz/rss/get_rates.cfm?fdate=01.08.2026
 *
 * Формат один и тот же — набор `<item>` с кодом, названием, курсом и
 * кратностью:
 *
 *   <item>
 *     <fullname>УЗБЕКСКИХ СУМОВ</fullname>
 *     <title>UZS</title>
 *     <description>3.96</description>
 *     <quant>100</quant>
 *   </item>
 *
 * Здесь только разбор текста, без сети — чтобы его можно было проверить
 * тестом на настоящем куске файла, а не на выдуманном.
 *
 * Своего разборщика XML нет намеренно: тянуть в проект библиотеку ради
 * четырёх полей в плоской структуре — лишняя зависимость, которая потом
 * живёт годами. Формат Нацбанка не меняется с 2010-х.
 */

export interface NbkRate {
    /** Код по ISO 4217: USD, RUB, UZS. */
    code: string;
    /** Название так, как его отдал Нацбанк. Своё есть в справочнике. */
    sourceName: string;
    /** Курс ровно как в файле — за `quant` единиц. */
    sourceRate: number;
    /** Кратность: 1, 10, 100, 1000, 10000. */
    quant: number;
    /**
     * Сколько тенге за ОДНУ единицу.
     *
     * Ради этого поля разбор и существует. Узбекский сум Нацбанк публикует
     * за 100 единиц, армянский драм за 10, иранский риал за 10 000. Взять
     * число как есть — ошибиться в сто раз, и обнаружится это, когда счёт
     * уже у клиента.
     */
    rate: number;
}

export interface NbkRatesFile {
    /** Дата из файла, на которую курсы объявлены. */
    date: string | null;
    rates: NbkRate[];
}

const tag = (source: string, name: string): string | null => {
    const match = source.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return match ? match[1].trim() : null;
};

/**
 * Число из файла. Нацбанк пишет точку разделителем, но встречалась и
 * запятая, и пробелы-разделители тысяч — принимаем всё, что однозначно.
 */
function parseNumber(value: string | null): number | null {
    if (!value) return null;
    const normalized = value.replace(/\s| /g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseNbkRates(xml: string): NbkRatesFile {
    const date = tag(xml, 'date');
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    const rates: NbkRate[] = [];

    for (const block of blocks) {
        const code = (tag(block, 'title') || '').toUpperCase();
        // Код валюты — ровно три латинские буквы. Всё остальное в этом поле
        // означает, что формат поменялся, и такую строку брать нельзя.
        if (!/^[A-Z]{3}$/.test(code)) continue;

        const sourceRate = parseNumber(tag(block, 'description'));
        if (sourceRate === null) continue;

        // Кратность по умолчанию 1: если поля нет, это курс за единицу.
        const quant = parseNumber(tag(block, 'quant')) ?? 1;
        if (!Number.isInteger(quant) || quant < 1) continue;

        rates.push({
            code,
            sourceName: tag(block, 'fullname') || code,
            sourceRate,
            quant,
            rate: sourceRate / quant,
        });
    }

    return { date, rates };
}

/** Дата в том виде, в каком её ждёт Нацбанк: 01.08.2026. */
export function nbkDateParam(date: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(date.getDate())}.${p(date.getMonth() + 1)}.${date.getFullYear()}`;
}
