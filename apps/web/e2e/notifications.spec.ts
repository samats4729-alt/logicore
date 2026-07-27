import { test, expect } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD } from './helpers';

/**
 * Уведомления переехали с `message` из antd на sonner.
 *
 * Ни типы, ни сборка этого не покажут: если `<Toaster />` не смонтирован,
 * вызов `toast()` молча ничего не делает — человек решит, что кнопка не
 * сработала, и нажмёт второй раз. Поэтому проверка живая, в браузере.
 */
test('ошибка показывает уведомление', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input').first().fill(E2E_EMAIL);
    await page.locator('input[type="password"]').first().fill('заведомо-неверный');
    await page.getByRole('button', { name: 'Войти' }).click();

    const toast = page.locator('[data-sonner-toast]');
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText(/Неверн|Ошибка|не найден/i);

    // Разметки antd быть не должно: два механизма уведомлений разом —
    // это когда часть сообщений видна, а часть нет.
    await expect(page.locator('.ant-message')).toHaveCount(0);
});

test('успешное действие показывает уведомление', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input').first().fill(E2E_EMAIL);
    await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page.locator('[data-sonner-toast]')).toContainText('Вход выполнен', {
        timeout: 15_000,
    });
});
