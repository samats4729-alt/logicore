import { expect, test } from '@playwright/test';
import { E2E_EMAIL, login } from './helpers';

/**
 * Руководитель меняет сотруднику почту и задаёт новый пароль.
 *
 * Сотрудник забыл пароль, а письмо для восстановления до него не доходит —
 * почту вписали с ошибкой. Раньше выход был один: удалить и пригласить
 * заново. Проверяем путь как у руководителя: кнопка в строке сотрудника,
 * окно, сохранение — и сотрудник входит по новой почте с новым паролем.
 */

const API = process.env.E2E_API_URL || 'http://localhost:3001';

test('руководитель задаёт сотруднику новую почту и пароль — тот входит с ними', async ({ page, browser }) => {
    await login(page);
    const метка = Date.now();
    const почта = `e2e.vhod.${метка}@example.kz`;
    const новаяПочта = `e2e.vhod.novaya.${метка}@example.kz`;

    // Сотрудник появляется так же, как в жизни: по приглашению.
    const приглашение = await page.request.post(`${API}/company/invitations`, {
        data: { email: почта, role: 'LOGISTICIAN', permissions: ['orders'] },
    });
    const тело = await приглашение.json();
    test.skip(!приглашение.ok() && /лимит/i.test(тело.message || ''), 'на стенде исчерпан лимит сотрудников по тарифу');
    expect(тело.token, тело.message).toBeTruthy();

    const гость = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const регистрация = await гость.request.post(`${API}/auth/register/invited`, {
        data: {
            token: тело.token, firstName: 'Проверка', lastName: 'Входа',
            phone: `+7702${String(метка).slice(-7)}`, password: 'StaryiParol1',
        },
    });
    const сотрудник = (await регистрация.json()).user;
    expect(сотрудник?.id).toBeTruthy();
    await гость.close();

    await page.goto('/company/users');
    // Страница открывается схемой отделов; строки с почтой — в «Списке».
    await page.getByRole('button', { name: 'Список' }).click();
    const строка = page.locator('.ant-table-row').filter({ hasText: почта });
    await expect(строка).toBeVisible({ timeout: 20_000 });
    await строка.getByRole('button', { name: 'Почта и пароль для входа' }).click();

    const окно = page.getByTestId('employee-login-dialog');
    await expect(окно.getByLabel('Почта для входа')).toHaveValue(почта);
    await окно.getByLabel('Почта для входа').fill(новаяПочта);
    await окно.getByLabel('Новый пароль').fill('NovyiParol1');
    await окно.getByRole('button', { name: 'Сохранить' }).click();
    await expect(окно).toBeHidden();
    await expect(page.locator('.ant-table-row').filter({ hasText: новаяПочта })).toBeVisible();

    // Сотрудник входит по новой почте с новым паролем.
    const вход = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).request.post(`${API}/auth/login`, {
        data: { email: новаяПочта, password: 'NovyiParol1', deviceId: `e2e-${метка}` },
    });
    expect(вход.status(), 'не пустило по новой почте и паролю').toBeLessThan(300);

    // Не копим сотрудников от прогона к прогону.
    await page.request.delete(`${API}/company/users/${сотрудник.id}`);
});

test('у себя самого кнопки входа нет — свою почту и пароль меняют в профиле', async ({ page }) => {
    await login(page);
    await page.goto('/company/users');
    await page.getByRole('button', { name: 'Список' }).click();
    const своя = page.locator('.ant-table-row').filter({ hasText: E2E_EMAIL });
    await expect(своя).toBeVisible({ timeout: 20_000 });

    await expect(своя.getByRole('button', { name: 'Почта и пароль для входа' })).toHaveCount(0);
});
