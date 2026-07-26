const ONES_MALE = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_FEMALE = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = [
    'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
    'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
];
const TENS = [
    '', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
    'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто',
];
const HUNDREDS = [
    '', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
    'шестьсот', 'семьсот', 'восемьсот', 'девятьсот',
];

/** Склонение по числу: 1 тенге, 2 тенге, 5 тенге. */
function plural(value: number, forms: [string, string, string]) {
    const mod100 = value % 100;
    const mod10 = value % 10;
    if (mod100 >= 11 && mod100 <= 19) return forms[2];
    if (mod10 === 1) return forms[0];
    if (mod10 >= 2 && mod10 <= 4) return forms[1];
    return forms[2];
}

function groupToWords(group: number, female: boolean): string[] {
    const ones = female ? ONES_FEMALE : ONES_MALE;
    const words: string[] = [];
    const hundreds = Math.floor(group / 100);
    const tens = Math.floor((group % 100) / 10);
    const unit = group % 10;

    if (hundreds) words.push(HUNDREDS[hundreds]);
    if (tens === 1) {
        words.push(TEENS[unit]);
    } else {
        if (tens) words.push(TENS[tens]);
        if (unit) words.push(ones[unit]);
    }
    return words;
}

/**
 * Сумма прописью для печатных форм: «300 000,00 (Триста тысяч Тенге)».
 *
 * Первая буква заглавная — так пишут в договорах и счетах РК. Тиыны в
 * договоре-заявке не расшифровываются словами: там принято указывать
 * только целую часть, копейки видны цифрами рядом.
 */
export function amountToWordsKzt(value: number): string {
    const whole = Math.floor(Math.abs(value));
    if (whole === 0) return 'Ноль тенге';

    const groups = [
        { divisor: 1_000_000_000, female: false, forms: ['миллиард', 'миллиарда', 'миллиардов'] as [string, string, string] },
        { divisor: 1_000_000, female: false, forms: ['миллион', 'миллиона', 'миллионов'] as [string, string, string] },
        { divisor: 1_000, female: true, forms: ['тысяча', 'тысячи', 'тысяч'] as [string, string, string] },
    ];

    const words: string[] = [];
    let rest = whole;
    for (const group of groups) {
        const count = Math.floor(rest / group.divisor);
        rest %= group.divisor;
        if (!count) continue;
        words.push(...groupToWords(count, group.female), plural(count, group.forms));
    }
    if (rest) words.push(...groupToWords(rest, false));

    words.push(plural(whole, ['тенге', 'тенге', 'тенге']));
    const text = words.filter(Boolean).join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «300 000,00 (Триста тысяч тенге)» — как в договоре-заявке. */
export function moneyWithWords(value: number): string {
    const formatted = (value ?? 0).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${formatted} (${amountToWordsKzt(value)})`;
}
