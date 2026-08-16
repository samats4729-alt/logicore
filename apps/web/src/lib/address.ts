/**
 * Порядок в частях адреса — то же правило, что на сервере.
 *
 * Сервер причёсывает части при сохранении: это единственное место, через
 * которое проходят все клиенты, включая мобильное приложение. Но человек
 * должен видеть результат сразу, а не узнавать о нём после сохранения:
 * «МАМЕДОВА» на экране и «Мамедова» в списке — это выглядит как сбой.
 *
 * Поэтому правило повторено здесь и применяется, когда человек уходит из
 * поля. Если правило меняется — правится в обоих местах;
 * `apps/api/src/locations/locations.service.ts` остаётся главным, за ним
 * последнее слово.
 */

/** Длинные впереди коротких: иначе «г» срабатывает раньше «город». */
const CITY_PREFIXES = ['город', 'станция', 'посёлок', 'поселок', 'село', 'қала', 'гор', 'пос', 'аул', 'ст', 'қ', 'г', 'п', 'с'];
const HOUSE_PREFIXES = ['здание', 'дом', 'зд', 'д'];

export type AddressPartKind = 'country' | 'region' | 'city' | 'street' | 'house';

/* Буквы перечислены наборами, а не через свойства Unicode: сборка веба
   идёт под ES5, где такие шаблоны запрещены. */
const LOWER = /[a-zа-яё]/;
const LETTERS = /[A-Za-zА-Яа-яЁё]/g;
const WORD = /[A-Za-zА-Яа-яЁё]+/g;

/** «МАМЕДОВА» → «Мамедова», «АЗС» и «ТЭЦ-3» не трогаем. */
function fixShouting(value: string): string {
    if (LOWER.test(value)) return value;
    const letters = (value.match(LETTERS) || []).length;
    if (letters < 4) return value;
    return value.replace(WORD, (word) => word[0] + word.slice(1).toLowerCase());
}

export function tidyAddressPart(value: string | null | undefined, kind: AddressPartKind = 'city'): string {
    if (!value) return '';

    let result = String(value).replace(/\s+/g, ' ').trim();
    result = result.replace(/^[.,;\s]+|[.,;\s]+$/g, '').trim();
    if (!result) return '';

    const prefixes = kind === 'house' ? HOUSE_PREFIXES : kind === 'city' ? CITY_PREFIXES : [];
    for (const prefix of prefixes) {
        // Отделитель обязателен: без него «д» откусывает первую букву у
        // «дом 2» и оставляет «ом 2».
        const match = new RegExp(`^${prefix}(?:\\.\\s*|\\s+)(?=\\S)`, 'i').exec(result);
        if (match && match[0].length < result.length) {
            result = result.slice(match[0].length).trim();
            break;
        }
    }

    return kind === 'house' ? result : fixShouting(result);
}

/**
 * Как адрес будет выглядеть в документах и в списке.
 *
 * Порядок тот же, что в сборке на сервере: страна, область, город, улица
 * с домом.
 */
export function composeAddressPreview(
    parts: { country?: string; region?: string; city?: string; street?: string; house?: string },
    fallback = '',
): string {
    const street = [tidyAddressPart(parts.street, 'street'), tidyAddressPart(parts.house, 'house')]
        .filter(Boolean).join(' ');
    const composed = [
        tidyAddressPart(parts.country, 'country'),
        tidyAddressPart(parts.region, 'region'),
        tidyAddressPart(parts.city, 'city'),
        street,
    ].filter(Boolean).join(', ');
    return composed || fallback.trim();
}
