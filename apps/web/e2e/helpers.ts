import { expect, type Page } from '@playwright/test';

export const E2E_EMAIL = process.env.E2E_EMAIL || 'admin@p3.kz';
export const E2E_PASSWORD = process.env.E2E_PASSWORD || 'Test12345!';

/**
 * Вход в кабинет.
 *
 * Ждём именно перехода на `/company`, а не таймаута: если страница не
 * ожила (например, кэш dev-сервера стёрт сборкой и чанки отдают 404),
 * кнопка молча ничего не делает — и тест должен падать с понятной
 * причиной, а не «элемент не найден» через минуту.
 */
export async function login(page: Page) {
    await page.goto('/login');
    await page.locator('input').first().fill(E2E_EMAIL);
    await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();
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
