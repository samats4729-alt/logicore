import { randomUUID } from 'crypto';

/**
 * Два входа одного человека подряд.
 *
 * Токен подписывается по составу пользователя и времени выдачи, а время
 * это — целые секунды. Пока в токен не добавляли случайную метку, два
 * входа в пределах одной секунды давали ПОБУКВЕННО одинаковый токен, и
 * запись сессии падала на требовании уникальности: человек получал
 * ошибку сервера на ровном месте.
 *
 * Как это выглядело в жизни: двойное нажатие «Войти», повторный вход из
 * соседней вкладки, автоматические проверки — второй вход не проходил.
 * Живьём было видно так: пять входов подряд давали 200, 500, 500, 500,
 * 500.
 *
 * Здесь проверяется само правило подписи, без поднятия приложения:
 * одинаковая полезная нагрузка и одинаковая секунда обязаны давать разные
 * токены.
 */

/** Подпись без случайной метки — как было до исправления. */
const signWithoutJti = (payload: Record<string, unknown>, issuedAtSec: number) =>
    JSON.stringify({ ...payload, iat: issuedAtSec });

/** Подпись с меткой выдачи — как стало. */
const signWithJti = (payload: Record<string, unknown>, issuedAtSec: number) =>
    JSON.stringify({ ...payload, jti: randomUUID(), iat: issuedAtSec });

describe('Вход дважды подряд', () => {
    const payload = { sub: 'u-1', email: 'a@b.kz', role: 'COMPANY_ADMIN', companyId: 'c-1' };
    const sameSecond = 1785000000;

    it('без метки выдачи два входа в одну секунду дают один и тот же токен', () => {
        // Фиксируем причину поломки, чтобы её нельзя было воспроизвести
        // случайно: именно это и роняло вход.
        expect(signWithoutJti(payload, sameSecond)).toBe(signWithoutJti(payload, sameSecond));
    });

    it('с меткой выдачи токены разные даже в одну и ту же секунду', () => {
        const first = signWithJti(payload, sameSecond);
        const second = signWithJti(payload, sameSecond);
        expect(first).not.toBe(second);
    });

    it('десять входов подряд дают десять разных токенов', () => {
        const tokens = new Set(
            Array.from({ length: 10 }, () => signWithJti(payload, sameSecond)),
        );
        expect(tokens.size).toBe(10);
    });
});
