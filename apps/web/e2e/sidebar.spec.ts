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

    /**
     * Важное по кабинету — проверка организации, пробный период — карточкой
     * в меню над «Помощью», а не полосой над каждой страницей (владелец,
     * 08.10.2026). Меню свернули — точка на кнопке меню, чтобы не пропало.
     *
     * Ответ `/my-company` подменяется: на стенде организация может быть уже
     * подтверждена, а проверяем мы, где подсказка живёт.
     */
    test('подсказка «отправьте на проверку» — в меню, а не над страницей', async ({ page }) => {
        await page.route('**/my-company', (route) => route.fulfill({
            json: { company: { id: 'к-1', name: 'ТОО «Ромашка»' }, verification: { verificationStatus: 'DRAFT' }, verificationRequired: false },
        }));
        await page.setViewportSize({ width: 1440, height: 900 });
        await login(page);
        const меню = page.locator('[data-sidebar="sidebar"]');
        const карточка = меню.locator('[data-notice="verification"]');
        await expect(карточка).toContainText('Организация ещё не отправлена на проверку');
        await expect(карточка.getByRole('button', { name: 'Заполнить организацию' })).toBeVisible();
        // Над страницей той же подсказки больше нет.
        await expect(page.locator('main').getByText('Организация ещё не отправлена на проверку')).toHaveCount(0);

        await page.getByRole('button', { name: 'Свернуть или развернуть меню' }).click();
        await expect(page.locator('[data-menu-attention]')).toBeVisible();
        await page.getByRole('button', { name: 'Свернуть или развернуть меню' }).click();
        await expect(page.locator('[data-menu-attention]')).toHaveCount(0);

        await карточка.getByRole('button', { name: 'Заполнить организацию' }).click();
        await page.waitForURL(/\/company\/onboarding/);
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
