import { expect, test, type Page } from '@playwright/test';
import { login, pickInCombo } from './helpers';

/**
 * Черновик новой заявки.
 *
 * Жалоба владельца: начал заводить заявку, отошёл в другой раздел — вернулся,
 * а всё набранное пропало. Мастер теперь сохраняет незаконченную заявку в
 * браузере и подставляет её обратно. Ломается это тихо: форма просто снова
 * откроется пустой, и заметят только те, кто потерял набранное.
 */

const API = process.env.E2E_API_URL || 'http://localhost:3001';

const черновиков = (page: Page) => page.evaluate(
    () => Object.keys(localStorage).filter((k) => k.startsWith('lc:order-draft')).length,
);

async function чистыйМастер(page: Page) {
    await page.goto('/company/orders/create');
    await page.evaluate(() => Object.keys(localStorage)
        .filter((k) => k.startsWith('lc:order-draft'))
        .forEach((k) => localStorage.removeItem(k)));
    await page.goto('/company/orders/create');
    await expect(page.getByRole('heading', { name: 'Новая заявка' })).toBeVisible();
}

test.describe('Черновик новой заявки', () => {
    test('ушёл в другой раздел и вернулся — набранное на месте', async ({ page }) => {
        await login(page);
        await чистыйМастер(page);
        await expect(page.getByTestId('order-draft-restored')).toHaveCount(0);

        await pickInCombo(page, 'no-customer', 0);
        await pickInCombo(page, 'no-carrier', 0);
        const полеЗаказчика = page.locator('#no-customer');
        const заказчик = await полеЗаказчика.innerText();
        // Своя компания и заказчик, и перевозчик — поле одно: «Ставка».
        const ставка = page.locator('#no-customer-price');
        await ставка.fill('515000');
        await expect(page.getByTestId('order-draft-saved')).toBeVisible();

        await page.goto('/company/drivers');
        await expect(page.getByRole('heading', { name: 'Водители' })).toBeVisible();
        await page.goto('/company/orders/create');

        // Сначала экран «Черновик сохранён»: продолжить или начать заново.
        await expect(page.getByTestId('order-draft-restored')).toBeVisible();
        await page.getByRole('button', { name: 'Продолжить черновик' }).click();
        await expect(page.getByTestId('order-draft-restored')).toHaveCount(0);
        await expect.poll(() => полеЗаказчика.innerText()).toBe(заказчик);
        await expect(ставка).toHaveValue(/515/);

        // «⋯ → Начать заново» с подтверждением — пустая форма и никакого черновика.
        await page.getByRole('button', { name: 'Действия с черновиком' }).click();
        await page.getByRole('menuitem', { name: 'Начать заново' }).click();
        await page.getByRole('button', { name: 'Стереть и начать заново' }).click();
        await expect(ставка).toHaveValue('');
        expect(await черновиков(page)).toBe(0);
    });

    test('пустую форму черновиком не сохраняет', async ({ page }) => {
        // Иначе одно открытие мастера давало бы в следующий раз «продолжаем
        // незаконченную заявку» с пустыми полями.
        await login(page);
        await чистыйМастер(page);
        await page.waitForTimeout(800);
        expect(await черновиков(page)).toBe(0);
        await expect(page.getByTestId('order-draft-saved')).toHaveCount(0);
    });

    test('правка заявки черновиком не пользуется', async ({ page }) => {
        // У правки источник — сама заявка: подставить поверх неё старый
        // черновик значило бы перепутать, что правят.
        await login(page);
        await чистыйМастер(page);
        const заявки: any[] = (await (await page.request.get(
            `${API}/company/orders?page=1&limit=20&type=active`,
        )).json()).data ?? [];
        const заявка = заявки.find((з) => з.status === 'PENDING' || з.status === 'ASSIGNED');
        test.skip(!заявка, 'на стенде нет заявки для правки');

        await page.goto(`/company/orders/create?edit=${заявка.id}`);
        await expect(page.getByRole('heading', { name: /Правка заявки/ })).toBeVisible();
        // Правим ставку; сохранять заявку не будем.
        await page.locator('#no-customer-price, #no-driver-cost').first().fill('777');
        await page.waitForTimeout(800);
        expect(await черновиков(page)).toBe(0);
        await expect(page.getByTestId('order-draft-saved')).toHaveCount(0);
    });
});
