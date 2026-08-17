/**
 * Разбор ответа геокодера 2ГИС в наши поля.
 *
 * Вынесено из службы отдельно, чтобы проверялось тестом на настоящем куске
 * ответа, а не на запущенном приложении: разбор чужого формата — то место,
 * где ошибки тихие и заметны только человеку на другом конце.
 *
 * ГЛАВНОЕ ПРАВИЛО: страна, область и город берутся только из `adm_div` —
 * это то, что геокодер знает про сам объект.
 *
 * Раньше страна выводилась из `locale` ответа, и это была ошибка: `locale`
 * — язык ответа, а не страна объекта. На запрос «Шардара» (Туркестанская
 * область, Казахстан) приходило `ru_RU`, и форма подставляла человеку
 * «Россия». Лучше оставить поле пустым, чем заполнить его неправдой:
 * пустое человек допишет, а неправду не заметит.
 */

export interface GeoProviderEntity {
    externalId?: string;
    name: string;
}

export interface GeoProviderCountry extends GeoProviderEntity {
    code: string;
}

export interface GeoProviderHierarchy {
    provider: '2gis';
    placeId?: string;
    country?: GeoProviderCountry;
    region?: GeoProviderEntity;
    city?: GeoProviderEntity;
}

export interface GeoItem {
    id?: string;
    name?: string;
    full_name?: string;
    full_address_name?: string;
    address_name?: string;
    building_name?: string;
    purpose_name?: string;
    locale?: string;
    point?: { lat: number; lon: number };
    adm_div?: Array<{ id?: string; type: string; name: string }>;
    geography?: GeoProviderHierarchy;
}

/**
 * Страны, по которым возят наши компании, плюс соседи.
 *
 * Нужны, чтобы по названию из ответа получить двухбуквенный код: сам
 * геокодер кода не отдаёт, а справочник стран у нас на нём и держится.
 * Список открытый — незнакомая страна просто останется без кода, и город
 * в справочник не попадёт, но адрес сохранится.
 */
const COUNTRY_CODES = [
    'KZ', 'RU', 'UZ', 'KG', 'TJ', 'TM', 'AZ', 'GE', 'AM', 'BY', 'UA', 'MD',
    'CN', 'TR', 'MN', 'IR', 'AE', 'PL', 'DE', 'LT', 'LV', 'EE', 'FI', 'AF',
];

let codesByName: Map<string, string> | null = null;

/** Код страны по её названию: «Казахстан» → KZ. */
export function countryCodeByName(name?: string | null): string | undefined {
    const wanted = String(name || '').trim().toLowerCase();
    if (!wanted) return undefined;

    if (!codesByName) {
        codesByName = new Map();
        for (const code of COUNTRY_CODES) {
            for (const locale of ['ru', 'en']) {
                try {
                    const label = new Intl.DisplayNames([locale], { type: 'region' }).of(code);
                    if (label) codesByName.set(label.toLowerCase(), code);
                } catch {
                    // Локаль недоступна — обойдёмся тем, что удалось собрать.
                }
            }
            codesByName.set(code.toLowerCase(), code);
        }
        // Названия, под которыми страны приходят от геокодера.
        codesByName.set('казахстан', 'KZ');
        codesByName.set('қазақстан', 'KZ');
        codesByName.set('россия', 'RU');
        codesByName.set('российская федерация', 'RU');
        codesByName.set('узбекистан', 'UZ');
        codesByName.set('кыргызстан', 'KG');
        codesByName.set('киргизия', 'KG');
    }

    return codesByName.get(wanted);
}

function normalizeAdmType(type?: string): string {
    return String(type || '').replace(/^adm_div\./, '');
}

/** Разобрать один объект ответа геокодера. */
export function mapGeoItem(item: any): GeoItem {
    const admDiv: Array<{ id?: string; type: string; name: string }> = Array.isArray(item?.adm_div)
        ? item.adm_div
            .filter((division: any) => division?.type && division?.name)
            .map((division: any) => ({
                id: division.id ? String(division.id) : undefined,
                type: normalizeAdmType(division.type),
                name: String(division.name),
            }))
        : [];

    const find = (...types: string[]) => admDiv.find((division) => types.includes(division.type));
    const countryDivision = find('country');
    const regionDivision = find('region');
    const cityDivision = find('city', 'settlement');
    const countryCode = countryCodeByName(countryDivision?.name);

    const geography: GeoProviderHierarchy = {
        provider: '2gis',
        placeId: item?.id ? String(item.id) : undefined,
        // Без кода страну не отдаём: справочник стран стоит на коде, и
        // запись с чужим кодом потом не разлепить.
        country: countryDivision && countryCode
            ? { code: countryCode, name: countryDivision.name, externalId: countryDivision.id }
            : undefined,
        region: regionDivision
            ? { name: regionDivision.name, externalId: regionDivision.id }
            : undefined,
        city: cityDivision
            ? { name: cityDivision.name, externalId: cityDivision.id }
            : undefined,
    };

    return {
        id: item?.id,
        name: item?.name,
        full_name: item?.full_name,
        full_address_name: item?.full_address_name,
        address_name: item?.address_name,
        building_name: item?.building_name,
        purpose_name: item?.purpose_name,
        locale: item?.locale,
        point: item?.point,
        adm_div: admDiv,
        geography,
    };
}
