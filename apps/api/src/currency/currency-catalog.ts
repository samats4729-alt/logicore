/**
 * Справочник валют.
 *
 * Список зашит в код, а не тянется из сети: справочник нужен приложению
 * сразу после установки, ещё до первого удачного похода на сайт Нацбанка.
 * Курсы приходят снаружи, названия и кратность — отсюда.
 *
 * Порядок показа осмысленный: сперва тенге (учётная валюта), потом валюты
 * СНГ и соседей — в них ездят перевозки, — потом мировые, потом остальные.
 * Названия написаны по-человечески: Нацбанк отдаёт «УЗБЕКСКИХ СУМОВ» и
 * «ЮЖНО-КОРЕЙСКИХ ВОН», такое в выпадающем списке читать нельзя.
 */

export interface CurrencySeed {
    code: string;
    nameRu: string;
    symbol?: string;
    /** За сколько единиц Нацбанк публикует курс. */
    quant: number;
    /** Показывать в коротком списке. */
    isCommon: boolean;
    /** Публикует ли Нацбанк курс вообще. */
    hasOfficialRate?: boolean;
    sortOrder: number;
}

/**
 * Кратность взята из файла Нацбанка на 01.08.2026 и обязана совпадать с
 * тем, что приходит в загрузке. Если Нацбанк её поменяет, загрузка возьмёт
 * значение из файла — оно главнее, — но расхождение попадёт в журнал, чтобы
 * это не прошло молча.
 */
export const CURRENCY_CATALOG: CurrencySeed[] = [
    // Учётная валюта.
    { code: 'KZT', nameRu: 'Казахстанский тенге', symbol: '₸', quant: 1, isCommon: true, sortOrder: 1 },

    // СНГ и соседи — то, в чём реально ездят перевозки.
    { code: 'RUB', nameRu: 'Российский рубль', symbol: '₽', quant: 1, isCommon: true, sortOrder: 10 },
    { code: 'UZS', nameRu: 'Узбекский сум', quant: 100, isCommon: true, sortOrder: 11 },
    { code: 'KGS', nameRu: 'Кыргызский сом', quant: 1, isCommon: true, sortOrder: 12 },
    { code: 'TJS', nameRu: 'Таджикский сомони', quant: 1, isCommon: true, sortOrder: 13 },
    { code: 'BYN', nameRu: 'Белорусский рубль', quant: 1, isCommon: true, sortOrder: 14 },
    { code: 'AZN', nameRu: 'Азербайджанский манат', quant: 1, isCommon: true, sortOrder: 15 },
    { code: 'AMD', nameRu: 'Армянский драм', quant: 10, isCommon: true, sortOrder: 16 },
    { code: 'GEL', nameRu: 'Грузинский лари', quant: 1, isCommon: true, sortOrder: 17 },
    { code: 'MDL', nameRu: 'Молдавский лей', quant: 1, isCommon: true, sortOrder: 18 },
    { code: 'UAH', nameRu: 'Украинская гривна', symbol: '₴', quant: 1, isCommon: true, sortOrder: 19 },
    // Нацбанк РК туркменский манат не публикует — курс ставится руками.
    { code: 'TMT', nameRu: 'Туркменский манат', quant: 1, isCommon: true, hasOfficialRate: false, sortOrder: 20 },
    { code: 'TRY', nameRu: 'Турецкая лира', symbol: '₺', quant: 1, isCommon: true, sortOrder: 21 },
    { code: 'CNY', nameRu: 'Китайский юань', symbol: '¥', quant: 1, isCommon: true, sortOrder: 22 },
    { code: 'MNT', nameRu: 'Монгольский тугрик', quant: 100, isCommon: true, sortOrder: 23 },

    // Мировые.
    { code: 'USD', nameRu: 'Доллар США', symbol: '$', quant: 1, isCommon: true, sortOrder: 30 },
    { code: 'EUR', nameRu: 'Евро', symbol: '€', quant: 1, isCommon: true, sortOrder: 31 },
    { code: 'GBP', nameRu: 'Фунт стерлингов', symbol: '£', quant: 1, isCommon: true, sortOrder: 32 },
    { code: 'AED', nameRu: 'Дирхам ОАЭ', quant: 1, isCommon: true, sortOrder: 33 },

    // Остальное из списка Нацбанка — доступно, но не в коротком списке.
    { code: 'AUD', nameRu: 'Австралийский доллар', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'BRL', nameRu: 'Бразильский реал', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'HUF', nameRu: 'Венгерский форинт', quant: 10, isCommon: false, sortOrder: 100 },
    { code: 'VND', nameRu: 'Вьетнамский донг', quant: 1000, isCommon: false, sortOrder: 100 },
    { code: 'HKD', nameRu: 'Гонконгский доллар', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'DKK', nameRu: 'Датская крона', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'EGP', nameRu: 'Египетский фунт', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'ILS', nameRu: 'Израильский шекель', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'INR', nameRu: 'Индийская рупия', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'IDR', nameRu: 'Индонезийская рупия', quant: 1000, isCommon: false, sortOrder: 100 },
    { code: 'IRR', nameRu: 'Иранский риал', quant: 10000, isCommon: false, sortOrder: 100 },
    { code: 'CAD', nameRu: 'Канадский доллар', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'QAR', nameRu: 'Катарский риал', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'KWD', nameRu: 'Кувейтский динар', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'MYR', nameRu: 'Малайзийский ринггит', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'MXN', nameRu: 'Мексиканское песо', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'NOK', nameRu: 'Норвежская крона', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'OMR', nameRu: 'Оманский риал', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'PKR', nameRu: 'Пакистанская рупия', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'PLN', nameRu: 'Польский злотый', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'SAR', nameRu: 'Риял Саудовской Аравии', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'RON', nameRu: 'Румынский лей', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'XDR', nameRu: 'СДР (расчётная единица МВФ)', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'SGD', nameRu: 'Сингапурский доллар', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'THB', nameRu: 'Тайский бат', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'CZK', nameRu: 'Чешская крона', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'SEK', nameRu: 'Шведская крона', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'CHF', nameRu: 'Швейцарский франк', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'ZAR', nameRu: 'Южноафриканский рэнд', quant: 1, isCommon: false, sortOrder: 100 },
    { code: 'KRW', nameRu: 'Южнокорейская вона', quant: 100, isCommon: false, sortOrder: 100 },
    { code: 'JPY', nameRu: 'Японская иена', symbol: '¥', quant: 1, isCommon: false, sortOrder: 100 },
];

/** Учётная валюта платформы: курсы хранятся как «сколько тенге за единицу». */
export const BASE_CURRENCY = 'KZT';
