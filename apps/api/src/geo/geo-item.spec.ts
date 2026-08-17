import { countryCodeByName, mapGeoItem } from './geo-item';

/**
 * Разбор ответа геокодера.
 *
 * Ошибка здесь заполняет форму человеку неправдой, и он её не замечает:
 * поле уже заполнено, значит правильно. Именно так в карточку склада в
 * Шардаре попала «Россия».
 */
describe('Разбор ответа геокодера', () => {
    /** Кусок настоящего ответа: посёлок Шардара, Туркестанская область. */
    const шардара = {
        id: '9570784863255249',
        name: 'Шардара',
        full_name: 'Казахстан, Туркестанская область, Шардара',
        // Язык ответа — русский; страна объекта тут ни при чём.
        locale: 'ru_RU',
        point: { lat: 41.2545, lon: 67.9705 },
        adm_div: [
            { id: '1', type: 'adm_div.country', name: 'Казахстан' },
            { id: '2', type: 'adm_div.region', name: 'Туркестанская область' },
            { id: '3', type: 'adm_div.settlement', name: 'Шардара' },
        ],
    };

    it('страна берётся из ответа, а не из языка', () => {
        const item = mapGeoItem(шардара);

        expect(item.geography?.country).toEqual({
            code: 'KZ', name: 'Казахстан', externalId: '1',
        });
    });

    it('без страны в ответе поле остаётся пустым, а не выдумывается', () => {
        // Раньше на этом месте из `locale: ru_RU` получалась «Россия», и
        // человек видел заполненное поле с чужой страной.
        const item = mapGeoItem({ ...шардара, adm_div: шардара.adm_div.slice(1) });

        expect(item.geography?.country).toBeUndefined();
        expect(item.geography?.region?.name).toBe('Туркестанская область');
    });

    it('область и город переносятся как есть', () => {
        const item = mapGeoItem(шардара);

        expect(item.geography?.region?.name).toBe('Туркестанская область');
        expect(item.geography?.city?.name).toBe('Шардара');
    });

    it('у города улицы нет — и придумывать её нечем', () => {
        // Форма заполняет улицу только из `address_name`. У посёлка его
        // нет, значит поле останется пустым — это правда.
        expect(mapGeoItem(шардара).address_name).toBeUndefined();
    });

    it('уличный адрес разбирается полностью', () => {
        const item = mapGeoItem({
            id: '70000001',
            name: 'Сатпаева, 90/1',
            address_name: 'Сатпаева, 90/1',
            full_name: 'Алматы, Сатпаева, 90/1',
            locale: 'ru_KZ',
            point: { lat: 43.238, lon: 76.889 },
            adm_div: [
                { id: '1', type: 'adm_div.country', name: 'Казахстан' },
                { id: '9', type: 'adm_div.city', name: 'Алматы' },
            ],
        });

        expect(item.address_name).toBe('Сатпаева, 90/1');
        expect(item.geography?.city?.name).toBe('Алматы');
        expect(item.geography?.country?.code).toBe('KZ');
    });

    it('пустой ответ не роняет разбор', () => {
        expect(mapGeoItem({}).geography?.provider).toBe('2gis');
        expect(mapGeoItem({}).adm_div).toEqual([]);
    });
});

describe('Код страны по названию', () => {
    it('знает соседей', () => {
        expect(countryCodeByName('Казахстан')).toBe('KZ');
        expect(countryCodeByName('Узбекистан')).toBe('UZ');
        expect(countryCodeByName('Россия')).toBe('RU');
        expect(countryCodeByName('Kyrgyzstan')).toBe('KG');
    });

    it('незнакомую страну не угадывает', () => {
        expect(countryCodeByName('Вестерос')).toBeUndefined();
        expect(countryCodeByName('')).toBeUndefined();
        expect(countryCodeByName(null)).toBeUndefined();
    });
});
