import { expect, test as setup } from '@playwright/test';
import { AUTH_STATE, E2E_EMAIL, E2E_PASSWORD, submitLoginForm } from './helpers';

/**
 * Один вход на весь прогон.
 *
 * `POST /auth/login` ограничен пятью запросами в минуту с адреса — это
 * защита от подбора пароля, и трогать её ради тестов нельзя. Пока каждый
 * тест логинился сам, шестой по счёту получал 429 и падал по таймауту
 * ожидания перехода. Локально это не воспроизводилось: тесты идут по
 * полминуты, и пять входов не помещались в одно окно, а в CI они
 * пролетают за секунды.
 *
 * Поэтому входим один раз здесь и раздаём сохранённую сессию остальным.
 * Тесту, которому нужен собственный вход, полагается брать `E2E_ALT_EMAIL`:
 * живая сессия в платформе одна на человека, и второй вход под этим же
 * адресом погасит сохранённую здесь.
 */
setup('вход и сохранение сессии', async ({ page }) => {
    await submitLoginForm(page, E2E_EMAIL, E2E_PASSWORD);
    await page.waitForURL('**/company**', { timeout: 45_000 });

    // Сессия — httpOnly-кука, профиль — localStorage. storageState забирает
    // и то, и другое, поэтому восстановленный контекст сразу авторизован.
    await expect(page.getByText('Создать заявку').first()).toBeVisible();
    await page.context().storageState({ path: AUTH_STATE });
});
