import { type Page, expect } from '@playwright/test';
import * as path from 'path';

export const E2E_EMAIL = process.env.E2E_EMAIL || 'admin@p3.kz';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'Test12345!';

/**
 * Второй сотрудник — для тестов, которые проходят форму входа сами.
 *
 * В платформе одна живая сессия на человека: новый вход гасит предыдущую
 * («Возможно вы вошли с другого устройства»). Значит тест, который логинится
 * под тем же адресом, что и `auth.setup.ts`, убивает общую сессию — и всё,
 * что запускается после него, работает уже разлогиненным. Поэтому такие
 * тесты обязаны брать отдельного человека.
 */
export const E2E_ALT_EMAIL = process.env.E2E_ALT_EMAIL || 'client@p3.kz';
export const E2E_ALT_PASSWORD = process.env.E2E_ALT_PASSWORD || E2E_PASSWORD;

/** Куда `auth.setup.ts` кладёт сессию, которую забирают остальные тесты. */
export const AUTH_STATE = path.join(__dirname, '.auth', 'state.json');

/**
 * Заполнить форму входа и нажать «Войти».
 *
 * Почему не просто `fill` и `click`. Страница входа приходит уже
 * отрисованной, а React оживляет её через мгновение — и при этом
 * перерисовывает поля. Если успеть напечатать до этого момента, введённое
 * стирается: на снимке упавшего теста форма стоит пустая, запрос никуда не
 * ушёл, уведомления нет. Тест то проходит, то нет, в зависимости от того,
 * насколько занята машина.
 *
 * Поэтому печатаем с повтором, пока значения не удержатся в полях, а после
 * нажатия убеждаемся, что запрос на вход действительно ушёл.
 */
export async function submitLoginForm(page: Page, email: string, password: string) {
    await page.goto('/login');

    const emailField = page.locator('input').first();
    const passwordField = page.locator('input[type="password"]').first();

    await expect(async () => {
        await emailField.fill(email);
        await passwordField.fill(password);
        await expect(emailField).toHaveValue(email, { timeout: 2_000 });
        await expect(passwordField).toHaveValue(password, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    const button = page.getByRole('button', { name: 'Войти' });
    for (let attempt = 0; attempt < 3; attempt++) {
        const request = page
            .waitForRequest((r) => r.url().includes('/auth/login') && r.method() === 'POST', { timeout: 7_000 })
            .catch(() => null);
        await button.click();
        if (await request) return;
    }

    throw new Error('Форма входа не отправила запрос — похоже, страница так и не ожила.');
}

/**
 * Открыть кабинет под уже сохранённой сессией.
 *
 * Формы входа тут больше нет, и это важно. `POST /auth/login` ограничен
 * пятью запросами в минуту с адреса — защита от подбора пароля, ради
 * тестов её не ослабляют. Пока каждый тест логинился сам, шестой по счёту
 * упирался в лимит: вход не проходил, тест падал по таймауту ожидания
 * перехода, и выглядело это как поломка страницы. Локально не
 * воспроизводилось — тесты идут по полминуты, и пять входов не помещались
 * в одно окно, а в CI пролетают за секунды. Вход теперь один на прогон,
 * его делает `auth.setup.ts`.
 *
 * Ждём именно перехода на `/company`: если страница не ожила (например,
 * кэш дев-сервера стёрт сборкой и чанки отдают 404), тест должен падать с
 * понятной причиной, а не «элемент не найден» через минуту.
 */
export async function login(page: Page) {
    await page.goto('/company');
    await page.waitForURL('**/company**', { timeout: 45_000 });

    // Отдельно ловим случай, когда кабинет выкинул обратно на вход. Без этой
    // проверки каждый тест падал бы на «элемент не найден» — искал бы кнопку
    // кабинета на странице входа и не находил. Причина при этом остаётся за
    // кадром, и на её поиск уходит день.
    if (new URL(page.url()).pathname.startsWith('/login')) {
        throw new Error(
            'Кабинет вернул на страницу входа: сохранённая сессия недействительна. ' +
            'Обычно это значит, что какой-то тест вошёл под тем же адресом ' +
            `(${E2E_EMAIL}) и погасил общую сессию — в платформе она одна на человека. ` +
            'Таким тестам нужен E2E_ALT_EMAIL.',
        );
    }
}

/**
 * Выбор в выпадающем списке Ant Design по подписи поля.
 *
 * Ant Design переиспользует разметку выпадающего списка: после первого
 * выбора старые пункты остаются в DOM скрытыми, и обращение по номеру
 * попадает в невидимый элемент. Поэтому берём только видимые пункты и
 * ждём, пока прошлый список закроется.
 */
export async function pickAntOption(page: Page, placeholder: string, index = 0) {
    await page.locator('.ant-select-selector').filter({ hasText: placeholder }).first().click();

    const options = page.locator('.ant-select-item-option:visible');
    await expect(options.first()).toBeVisible();
    const count = await options.count();
    await options.nth(Math.min(index, count - 1)).click();

    // Список закрывается с анимацией — без этого следующий клик попадёт
    // в уходящий слой.
    await page.waitForTimeout(600);
}
