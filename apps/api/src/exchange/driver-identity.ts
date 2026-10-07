/**
 * Проверки личных данных водителя биржи.
 *
 * Регистрируется водитель сам, и первый барьер против выдуманных анкет —
 * ИИН. В казахстанском ИИН последняя цифра контрольная: случайный или
 * перевранный номер почти всегда её не проходит. Седьмая цифра — век и
 * пол, первые шесть — дата рождения.
 */

const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const W2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

/** Только цифры: «900 101 300 123» → «900101300123». */
export function digitsOnly(value: string | null | undefined): string {
    return String(value ?? '').replace(/\D/g, '');
}

/** ИИН физического лица прошёл проверку: 12 цифр, дата, век, контрольная цифра. */
export function isValidIin(raw: string | null | undefined): boolean {
    const iin = digitsOnly(raw);
    if (!/^\d{12}$/.test(iin)) return false;
    const d = iin.split('').map(Number);

    const month = Number(iin.slice(2, 4));
    const day = Number(iin.slice(4, 6));
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    // Седьмая цифра — век рождения и пол: 1–6 у граждан.
    if (d[6] < 1 || d[6] > 6) return false;

    let check = W1.reduce((sum, w, i) => sum + w * d[i], 0) % 11;
    if (check === 10) {
        check = W2.reduce((sum, w, i) => sum + w * d[i], 0) % 11;
        if (check === 10) return false;
    }
    return check === d[11];
}

/**
 * Телефон к одному виду: «8 701 123 45 67», «+7(701)1234567» → «+77011234567».
 * Не похож на казахстанский мобильный — пустая строка.
 */
export function normalizePhone(raw: string | null | undefined): string {
    let digits = digitsOnly(raw);
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits.length === 10) digits = `7${digits}`;
    return /^7\d{10}$/.test(digits) ? `+${digits}` : '';
}

/** Госномер к одному виду: заглавные, без пробелов и дефисов. «123 abc 02» → «123ABC02». */
export function normalizePlate(raw: string | null | undefined): string {
    return String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
}
