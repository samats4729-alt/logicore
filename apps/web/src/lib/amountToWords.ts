// Сумма прописью на русском для тенге (первичные документы РК).

const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function tripletToWords(n: number, feminine: boolean): string {
    const words: string[] = [];
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;
    if (h) words.push(HUNDREDS[h]);
    if (t > 1) {
        words.push(TENS[t]);
        if (o) words.push((feminine ? ONES_F : ONES)[o]);
    } else if (t === 1) {
        words.push(TEENS[o]);
    } else if (o) {
        words.push((feminine ? ONES_F : ONES)[o]);
    }
    return words.filter(Boolean).join(' ');
}

// Выбор формы слова: [1, 2-4, 5-0]
function plural(n: number, forms: [string, string, string]): string {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return forms[1];
    return forms[2];
}

const SCALES: { forms: [string, string, string]; feminine: boolean }[] = [
    { forms: ['', '', ''], feminine: false }, // единицы — без слова разряда
    { forms: ['тысяча', 'тысячи', 'тысяч'], feminine: true },
    { forms: ['миллион', 'миллиона', 'миллионов'], feminine: false },
    { forms: ['миллиард', 'миллиарда', 'миллиардов'], feminine: false },
    { forms: ['триллион', 'триллиона', 'триллионов'], feminine: false },
];

/**
 * Сумма прописью в тенге и тиын, например:
 * 1500000.5 → "Один миллион пятьсот тысяч тенге 50 тиын"
 */
export function amountToWordsKzt(amount: number): string {
    const rounded = Math.round((amount || 0) * 100) / 100;
    const sign = rounded < 0 ? 'минус ' : '';
    const abs = Math.abs(rounded);
    const intPart = Math.floor(abs);
    const tiyn = Math.round((abs - intPart) * 100);

    let result: string;
    if (intPart === 0) {
        result = 'ноль';
    } else {
        const groups: number[] = [];
        let x = intPart;
        while (x > 0) { groups.push(x % 1000); x = Math.floor(x / 1000); }

        const parts: string[] = [];
        for (let i = groups.length - 1; i >= 0; i--) {
            const g = groups[i];
            if (g === 0) continue;
            const sc = SCALES[i] || SCALES[SCALES.length - 1];
            parts.push(tripletToWords(g, sc.feminine));
            if (i > 0) parts.push(plural(g, sc.forms));
        }
        result = parts.join(' ');
    }

    const tenge = plural(intPart, ['тенге', 'тенге', 'тенге']);
    const phrase = `${sign}${result} ${tenge} ${String(tiyn).padStart(2, '0')} тиын`;
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
