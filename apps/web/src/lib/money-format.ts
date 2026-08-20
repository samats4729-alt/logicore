/**
 * Показ денег с валютой.
 *
 * Одно место на всё приложение: пока сумма была всегда в тенге, знак ₸ стоял
 * прямо в разметке. С валютами так нельзя — «480 000 ₸» под долларовой суммой
 * читается как тенге, и человек принимает решение по неверной цифре.
 *
 * Незнакомой валюте печатается её код: «500 UZS» некрасиво, но честно.
 */

const CURRENCY_SIGNS: Record<string, string> = {
    KZT: '₸', RUB: '₽', USD: '$', EUR: '€', GBP: '£', UAH: '₴',
    TRY: '₺', CNY: '¥', JPY: '¥', KRW: '₩', INR: '₹',
};

/** Знак валюты или её код, если знака нет. */
export function currencySign(currency = 'KZT'): string {
    return CURRENCY_SIGNS[(currency || 'KZT').toUpperCase()] || (currency || 'KZT').toUpperCase();
}

/** Сумма с валютой: «480 000,00 $». Копейки показываются всегда. */
export function money(value: number | null | undefined, currency = 'KZT'): string {
    const amount = (value ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${amount} ${currencySign(currency)}`;
}

/** То же, но без копеек — для крупных итогов, где копейки только мешают. */
export function moneyShort(value: number | null | undefined, currency = 'KZT'): string {
    const amount = Math.round(value ?? 0).toLocaleString('ru-RU');
    return `${amount} ${currencySign(currency)}`;
}

/**
 * Деньги в поле ввода: разряды пробелом, тиын через запятую.
 *
 * «5000000» глазом не читается — пять миллионов и пятьсот тысяч выглядят
 * почти одинаково, и ошибку в ставке замечали уже в счёте.
 *
 * Разбивка была расставлена по файлам копиями, и каждая делила на разряды
 * в том числе дробную часть: «1234.5678» превращалось в «1 234.5 678».
 * Поэтому одна реализация здесь, рядом с остальным показом денег.
 */

/** Пробелы любые, включая неразрывный: его ставит `toLocaleString`. */
const ПРОБЕЛЫ = /[\s ]/g;

/** Разряды разбиваем только в целой части — дробная идёт как есть. */
const ГРАНИЦА_РАЗРЯДА = /\B(?=(\d{3})+(?!\d))/g;

/** `1234567.5` → «1 234 567,5». Пустое остаётся пустым. */
export function formatMoneyInput(value?: string | number | null): string {
    if (value === null || value === undefined || value === '') return '';
    const [целая, дробная] = String(value).replace(',', '.').split('.');
    const разряды = целая.replace(ГРАНИЦА_РАЗРЯДА, ' ');
    return дробная === undefined ? разряды : `${разряды},${дробная}`;
}

/** «1 234 567,50» → «1234567.50» — обратно к числу, каким его ждёт форма. */
export function parseMoneyInput(value?: string | null): string {
    return String(value ?? '').replace(ПРОБЕЛЫ, '').replace(',', '.');
}

/**
 * Курс валюты: «473,59 ₸ за 1 $». Хвостовые нули убираются — курс 500,000000
 * читается хуже, чем 500.
 */
export function rateLabel(rate: number | string, currency: string): string {
    const value = Number(rate);
    const shown = Number.isFinite(value)
        ? value.toLocaleString('ru-RU', { maximumFractionDigits: 6 })
        : String(rate);
    return `${shown} ₸ за 1 ${currencySign(currency)}`;
}
