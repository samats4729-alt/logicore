import { expect, test, request as playwrightRequest, type Page } from '@playwright/test';
import { submitLoginForm } from './helpers';

/**
 * Реклама в админке: владелец хочет видеть, кто зарегистрировался с рекламы
 * Google, прямо в платформе, а не в кабинете Google.
 *
 * Google дописывает метку клика к адресу только на первой странице, а форма
 * регистрации открывается уже без неё. Поэтому проверяем путь целиком: заход
 * с меткой, переход на регистрацию, строка в админке. И обратное: человек без
 * метки в этот список не попадает.
 */

const API = process.env.E2E_API_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.E2E_PLATFORM_ADMIN_EMAIL || 'admin@logcomp.kz';
const ADMIN_PASSWORD = process.env.E2E_PLATFORM_ADMIN_PASSWORD || 'admin123';

async function зарегистрироваться(page: Page, почта: string, телефон: string) {
    await page.goto('/register');
    const поля = page.locator('form input:not([type="checkbox"])');

    // Страница оживает не сразу и при этом стирает введённое: см. submitLoginForm.
    await expect(async () => {
        await поля.nth(0).fill('Реклама');
        await поля.nth(1).fill('Проверка');
        await поля.nth(2).fill(почта);
        await поля.nth(3).fill(телефон);
        await поля.nth(4).fill('Test12345!');
        await expect(поля.nth(2)).toHaveValue(почта, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    await page.locator('form input[type="checkbox"]').check();
    const ответ = page.waitForResponse((r) => r.url().includes('/auth/register') && r.request().method() === 'POST');
    await page.locator('form button[type="submit"]').click();
    expect((await ответ).status()).toBe(201);
}

test.describe('Реклама в админке', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('регистрация с рекламы видна в админке, обычная — нет', async ({ page, browser }) => {
        test.setTimeout(150_000);

        const api = await playwrightRequest.newContext();
        const вход = await api.post(`${API}/auth/login`, {
            data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, deviceId: 'e2e-ads' },
        });
        test.skip(!вход.ok(), 'Нет входа владельца платформы на этом стенде');

        const метка = Date.now().toString().slice(-7);
        const сРекламы = `ads-${метка}@e2e.kz`;
        const безРекламы = `no-ads-${метка}@e2e.kz`;

        await page.goto('/?gclid=e2e-click');
        await expect.poll(() => page.evaluate(() => localStorage.getItem('lc-signup-source'))).toContain('GOOGLE_ADS');
        await зарегистрироваться(page, сРекламы, `+7701${метка}`);

        const чистый = await browser.newContext();
        await зарегистрироваться(await чистый.newPage(), безРекламы, `+7702${метка}`);
        await чистый.close();

        const админка = await browser.newContext();
        const страница = await админка.newPage();
        await submitLoginForm(страница, ADMIN_EMAIL, ADMIN_PASSWORD);
        await страница.waitForURL(/\/admin/);
        await страница.goto('/admin/ads');

        await expect(страница.getByRole('heading', { name: 'Реклама' })).toBeVisible();
        await expect(страница.getByText(сРекламы)).toBeVisible();
        await expect(страница.getByText(безРекламы)).toHaveCount(0);
        await админка.close();
    });
});
