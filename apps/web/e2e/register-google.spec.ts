import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Кнопка «Google» на странице регистрации.
 *
 * Раньше любой новый человек получал от неё отказ «Компания с таким БИН уже
 * зарегистрирована»: кнопка отправляла название и БИН, которых в форме нет.
 * Теперь она работает как на странице входа: новому подставляет почту и имя,
 * знакомого впускает.
 *
 * Настоящий вход через Google в тесте невозможен, поэтому подменяем только
 * скрипт Google и ответ сервера на его токен. Регистрация дальше настоящая.
 */

const ТЕСТОВЫЙ_СКРИПТ_GOOGLE = `window.google = { accounts: { id: {
    initialize(config) { window.__googleCallback = config.callback; },
    renderButton(box, options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Тестовый Google';
        button.style.width = options.width + 'px';
        button.onclick = () => window.__googleCallback({ credential: 'e2e-google-token', select_by: 'btn' });
        box.replaceChildren(button);
    },
    prompt() {},
    cancel() {},
} } };`;

async function подменитьGoogle(page: Page, status: number, ответ: unknown) {
    await page.route('**/gsi/client', (route: Route) =>
        route.fulfill({ contentType: 'text/javascript', body: ТЕСТОВЫЙ_СКРИПТ_GOOGLE }),
    );
    await page.route('**/auth/google', (route: Route) =>
        route.fulfill({
            status,
            json: ответ,
            headers: {
                'access-control-allow-origin': route.request().headers().origin ?? '*',
                'access-control-allow-credentials': 'true',
            },
        }),
    );
}

const кнопкаGoogle = (page: Page) => page.getByRole('button', { name: 'Тестовый Google' });

test.describe('Кнопка Google на регистрации: человек без аккаунта', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('почта и имя подставляются, регистрация проходит и попадает в отчёт о рекламе', async ({ page }) => {
        test.setTimeout(150_000);
        const метка = Date.now().toString().slice(-7);
        const почта = `google-${метка}@e2e.kz`;
        await подменитьGoogle(page, 200, {
            needsRegistration: true,
            googleData: { email: почта, firstName: 'Гугл', lastName: 'Проверка' },
        });

        await page.goto('/?gclid=e2e-google');
        await expect.poll(() => page.evaluate(() => localStorage.getItem('lc-signup-source'))).toContain('GOOGLE_ADS');

        await page.goto('/register');
        await кнопкаGoogle(page).click();

        await expect(page.locator('#email')).toHaveValue(почта);
        await expect(page.locator('#email')).toBeDisabled();
        await expect(page.locator('#firstName')).toHaveValue('Гугл');
        await expect(page.locator('#lastName')).toHaveValue('Проверка');

        await page.locator('#phone').fill(`+7703${метка}`);
        await page.locator('#password').fill('Test12345!');
        await page.locator('#agreement').check();

        const ответ = page.waitForResponse((r) => r.url().includes('/auth/register') && r.request().method() === 'POST');
        await page.locator('form button[type="submit"]').click();
        const регистрация = await ответ;
        expect(регистрация.status()).toBe(201);
        expect(регистрация.request().postDataJSON()).toMatchObject({ email: почта, signupSource: 'GOOGLE_ADS' });

        await page.waitForURL('**/company/onboarding', { timeout: 60_000 });
    });

    test('сбой не стирает то, что человек уже ввёл', async ({ page }) => {
        await подменитьGoogle(page, 500, {});
        await page.goto('/register');
        await expect(кнопкаGoogle(page)).toBeVisible();

        await page.locator('#phone').fill('+77001234567');
        await кнопкаGoogle(page).click();

        await expect(page.getByText('Ошибка входа через Google')).toBeVisible();
        await expect(page.locator('#phone')).toHaveValue('+77001234567');
        await expect(page).toHaveURL(/\/register/);
    });
});

test.describe('Кнопка Google на телефоне', () => {
    test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 360, height: 800 } });

    for (const адрес of ['/register', '/login']) {
        test(`не вылезает за край экрана: ${адрес}`, async ({ page }) => {
            await подменитьGoogle(page, 200, {});
            await page.goto(адрес);
            await expect(кнопкаGoogle(page)).toBeVisible();

            const место = await кнопкаGoogle(page).boundingBox();
            expect(место?.x).toBeGreaterThanOrEqual(0);
            expect((место?.x ?? 0) + (место?.width ?? 0)).toBeLessThanOrEqual(360);
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
        });
    }
});

test.describe('Кнопка Google на регистрации: человек уже есть в системе', () => {
    test('просто входит в свой кабинет', async ({ page }) => {
        await подменитьGoogle(page, 200, { user: { role: 'COMPANY_ADMIN' } });
        await page.goto('/register');
        await кнопкаGoogle(page).click();

        await expect(page.getByText('Вход через Google выполнен успешно')).toBeVisible();
        await page.waitForURL('**/company**', { timeout: 60_000 });
        await expect(page.getByText('Создать заявку').first()).toBeVisible();
    });
});
