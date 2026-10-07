import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Левое меню кабинета (макет «shadcn Nova», 07.10.2026).
 *
 * Свёрнутое меню уходит целиком — без полоски со значками (просьба
 * владельца от 08.10.2026): страница занимает всю ширину.
 */
test.describe('Левое меню', () => {
    test('свёрнутое меню уходит целиком, без значков', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await login(page);
        const дашборд = page.locator('[data-sidebar="sidebar"] [data-menu-id="lc2-/company"]');
        await expect(дашборд).toBeVisible();

        await page.getByRole('button', { name: 'Свернуть или развернуть меню' }).click();
        await expect(дашборд).not.toBeInViewport();

        // Содержимое страницы — от левого края, а не правее узкой полоски.
        const шапка = (await page.locator('header').filter({ has: page.getByRole('button', { name: 'Свернуть или развернуть меню' }) }).boundingBox())!;
        expect(шапка.x, 'слева осталась полоска меню').toBeLessThanOrEqual(1);

        await page.getByRole('button', { name: 'Свернуть или развернуть меню' }).click();
        await expect(дашборд).toBeInViewport();
    });

    test('разделы раскрываются, текущий пункт выделен', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await login(page);
        await page.goto('/company/accounting/invoices');
        const счета = page.locator('[data-sidebar="sidebar"] [data-menu-id="lc2-/company/accounting/invoices"]');
        await expect(счета).toBeVisible({ timeout: 60_000 });
        await expect(счета).toHaveAttribute('data-active', 'true');
    });
});
