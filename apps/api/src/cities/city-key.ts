/**
 * Приведение названия города к одному виду.
 *
 * Зачем. Город в запросе теперь пишется текстом: справочник знает не всё,
 * из-за него компания не смогла завести Мынарал. Но как только город стал
 * текстом, «Шымкент», «шымкент», «г. Шымкент», «Чимкент» и «Shymkent»
 * превращаются в пять разных направлений — и память по маршруту, ради
 * которой всё затевалось, рассыпается ровно там, где она нужнее всего.
 *
 * Поэтому у каждого названия есть ключ. Совпали ключи — это одно
 * направление, независимо от того, кто как написал.
 *
 * Порядок работы такой: сначала приводим написание к общему виду, потом
 * подставляем известное имя вместо старого или разговорного. Точное
 * сравнение здесь важнее догадок: ошибиться и слить два разных города —
 * хуже, чем не узнать один. Опечатки, которых нет в списке ниже, ловятся
 * отдельно — сверкой со справочником по близости написания.
 */

/**
 * Приставки, которые ничего не говорят о городе.
 *
 * «г. Алматы» и «Алматы» — одно и то же. Убираем только в начале: «Аул»
 * посреди названия может быть его частью.
 */
const PREFIXES = [
    'г', 'гор', 'город', 'қ', 'қала',
    'пос', 'поселок', 'посёлок', 'п',
    'с', 'село', 'ст', 'станция', 'аул', 'а',
    'мкр', 'микрорайон',
];

/** Латиница → кириллица: клиенты пишут и так, особенно с телефона. */
const TRANSLIT: Record<string, string> = {
    shch: 'щ', sh: 'ш', ch: 'ч', zh: 'ж', kh: 'х', ts: 'ц', yu: 'ю', ya: 'я', yo: 'ё',
    a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и', j: 'й', k: 'к',
    l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф',
    h: 'х', c: 'ц', y: 'ы', q: 'к', w: 'в', x: 'кс',
};

/**
 * Старые, местные и разговорные названия — к одному имени.
 *
 * Список живой: сюда дописывается то, что реально приходит от клиентов.
 * Слева — как написали, справа — как называем мы.
 */
const ALIASES: Record<string, string> = {
    // Казахстан
    'чимкент': 'шымкент',
    'шимкент': 'шымкент',
    'алма ата': 'алматы',
    'алмата': 'алматы',
    'нур султан': 'астана',
    'нурсултан': 'астана',
    'целиноград': 'астана',
    'акмола': 'астана',
    'усть каменогорск': 'оскемен',
    'оскемен': 'оскемен',
    'семипалатинск': 'семей',
    'кустанай': 'костанай',
    'кокчетав': 'кокшетау',
    'актюбинск': 'актобе',
    'гурьев': 'атырау',
    'джамбул': 'тараз',
    'жамбыл': 'тараз',
    'уральск': 'уральск',
    'орал': 'уральск',
    'кзыл орда': 'кызылорда',
    'кызыл орда': 'кызылорда',
    'караганды': 'караганда',
    'шевченко': 'актау',
    'петропавл': 'петропавловск',
    'ленинск': 'байконур',

    // Соседи — по ним тоже возят
    'тошкент': 'ташкент',
    'фрунзе': 'бишкек',
    'ашгабат': 'ашхабад',
    'спб': 'санкт петербург',
    'питер': 'санкт петербург',
    'ленинград': 'санкт петербург',
    'свердловск': 'екатеринбург',
    'урумчи': 'урумчи',
};

/** Похоже ли написанное на латиницу — тогда переводим в кириллицу. */
function looksLatin(value: string): boolean {
    const letters = value.replace(/[^a-zа-яё]/gi, '');
    if (!letters) return false;
    const latin = letters.replace(/[^a-z]/gi, '').length;
    return latin / letters.length > 0.6;
}

function transliterate(value: string): string {
    let result = '';
    let i = 0;
    while (i < value.length) {
        // Сперва длинные сочетания: иначе «sh» распадётся на «с» и «х».
        const four = value.slice(i, i + 4);
        const two = value.slice(i, i + 2);
        if (TRANSLIT[four]) { result += TRANSLIT[four]; i += 4; continue; }
        if (TRANSLIT[two]) { result += TRANSLIT[two]; i += 2; continue; }
        const one = value[i];
        result += TRANSLIT[one] ?? one;
        i += 1;
    }
    return result;
}

/**
 * Ключ направления. Одно место — один ключ, как бы его ни написали.
 *
 * Пустая строка означает «города нет»: такой запрос ни с чем не
 * сопоставляется, и это честнее, чем свести все безымянные в одну кучу.
 */
export function cityKey(raw: string | null | undefined): string {
    if (!raw) return '';

    let value = String(raw).toLowerCase().trim();
    value = value.replace(/ё/g, 'е');
    // Кавычки, скобки, точки и запятые ничего не значат; дефис между
    // словами — тоже: «Алма-Ата» и «Алма Ата» пишут одинаково часто.
    value = value.replace(/[«»"'()[\]]/g, ' ');
    value = value.replace(/[.,;:/\\-]+/g, ' ');
    value = value.replace(/\s+/g, ' ').trim();

    if (looksLatin(value)) value = transliterate(value);

    // Приставку снимаем по кругу: встречается «г пос Мынарал».
    let stripped = true;
    while (stripped) {
        stripped = false;
        for (const prefix of PREFIXES) {
            if (value.startsWith(`${prefix} `)) {
                value = value.slice(prefix.length + 1).trim();
                stripped = true;
                break;
            }
        }
    }

    value = value.replace(/\s+/g, ' ').trim();
    return ALIASES[value] || value;
}

/**
 * Насколько два написания далеки друг от друга.
 *
 * Сколько правок нужно, чтобы получить одно из другого: вставить букву,
 * убрать, заменить или поменять две соседние местами. Перестановка соседних
 * считается одной правкой, а не двумя, и это не мелочь: «Караганад» —
 * самая обычная опечатка от спешки, а по строгому счёту она отстоит от
 * «Караганды» так же далеко, как совсем другое слово.
 */
export function editDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (!a.length || !b.length) return Math.max(a.length, b.length);

    let beforePrevious: number[] = [];
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + cost,
            );
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
            }
        }
        beforePrevious = previous;
        previous = current;
    }
    return previous[b.length];
}

/**
 * Сколько опечаток прощаем.
 *
 * Коротким словам — ни одной: «Аса» и «Ася» это разные посёлки, а разница
 * между ними в одну букву. Чем длиннее название, тем безопаснее прощать.
 */
function tolerance(length: number): number {
    if (length <= 5) return 0;
    if (length <= 9) return 1;
    return 2;
}

/**
 * Найти в справочнике город, который имели в виду.
 *
 * Сначала точное совпадение ключей, потом — ближайшее по написанию. Если
 * подходящих несколько на равном расстоянии, не выбираем никого: угадать
 * между Тараз и Тарасом хуже, чем оставить текст как есть.
 */
export function matchCity<T extends { id: string; name: string }>(
    raw: string | null | undefined,
    cities: T[],
): T | null {
    const key = cityKey(raw);
    if (!key) return null;

    const exact = cities.filter((city) => cityKey(city.name) === key);
    if (exact.length === 1) return exact[0];
    // Городов с одинаковым именем в справочнике несколько (тёзки в разных
    // областях) — выбирать за человека нельзя.
    if (exact.length > 1) return null;

    const limit = tolerance(key.length);
    if (limit === 0) return null;

    let best: T | null = null;
    let bestDistance = limit + 1;
    let ties = 0;
    for (const city of cities) {
        const distance = editDistance(key, cityKey(city.name));
        if (distance > limit) continue;
        if (distance < bestDistance) {
            best = city;
            bestDistance = distance;
            ties = 1;
        } else if (distance === bestDistance) {
            ties += 1;
        }
    }
    return ties === 1 ? best : null;
}
