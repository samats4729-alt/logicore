import { type Page, expect } from '@playwright/test';
import * as path from 'path';

export const E2E_EMAIL = process.env.E2E_EMAIL || 'admin@p3.kz';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'Test12345!';

/** Куда `auth.setup.ts` кладёт сессию, которую забирают остальные тесты. */
export const AUTH_STATE = path.join(__dirname, '.auth', 'state.json');

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
