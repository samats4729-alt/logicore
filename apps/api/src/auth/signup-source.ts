/** Человек пришёл на регистрацию с рекламы Google. */
export const SIGNUP_SOURCE_GOOGLE_ADS = 'GOOGLE_ADS';

const KNOWN_SOURCES = new Set<string>([SIGNUP_SOURCE_GOOGLE_ADS]);

/**
 * Источник регистрации приходит из браузера, поэтому верить ему как есть
 * нельзя: сохраняем только то, что знаем. Незнакомое значение не повод
 * отказывать в регистрации — человек просто считается пришедшим не с рекламы.
 */
export function normalizeSignupSource(value: unknown): string | null {
    return typeof value === 'string' && KNOWN_SOURCES.has(value) ? value : null;
}
