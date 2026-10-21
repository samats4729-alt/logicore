/**
 * Пароль, который диспетчер диктует водителю (задачи шефа, R1).
 *
 * Только цифры — их легко продиктовать по телефону и набрать на телефоне.
 * Восемь цифр — не короче общего требования к паролю. Случайность —
 * криптографическая, из браузера.
 */
export function tempPassword(length = 8): string {
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => String(b % 10)).join('');
}
