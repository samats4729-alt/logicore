import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * ИИ-помощник — панелью справа (владелец, 08.10.2026).
 *
 * Ломается это незаметно: панель снова ложится поверх таблицы, уезжает к
 * самому верху экрана или прячет поле ввода за нижний край. Проверяем то,
 * что видит человек: страница сужается, верх панели вровень с началом
 * страницы, поле ввода на экране, закрыл — страница во всю ширину.
 */
test('помощник открывается справа, сдвигает страницу и закрывается кнопкой в шапке', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await login(page);
    await page.goto('/company/orders');
    await expect(page.locator('[data-order-row]').first()).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => localStorage.removeItem('lc_assistant_open'));

    const страница = page.locator('main[data-guide="content"]');
    const ширина = async () => (await страница.boundingBox())!.width;
    const было = await ширина();

    await page.getByRole('button', { name: 'ИИ-помощник' }).click();
    const панель = page.getByRole('complementary', { name: 'ИИ-помощник' });
    await expect(панель.getByRole('heading', { name: 'ИИ-помощник' })).toBeVisible();
    // Страница сдвинулась, а не накрыта сверху.
    await expect.poll(ширина).toBeLessThan(было - 300);

    // Верх панели — вровень с началом страницы, а не у самого верха экрана.
    const создать = (await страница.getByRole('button', { name: 'Создать заявку', exact: true }).boundingBox())!;
    const карточка = (await панель.locator('.rounded-2xl').first().boundingBox())!;
    expect(Math.abs(карточка.y - создать.y), 'панель не вровень с кнопкой «Создать заявку»').toBeLessThanOrEqual(2);
    // Поле ввода — на экране.
    const поле = (await page.getByPlaceholder(/Спросите/).boundingBox())!;
    expect(поле.y + поле.height).toBeLessThanOrEqual(1080);

    await page.getByRole('button', { name: 'ИИ-помощник' }).click();
    await expect(панель.getByRole('heading', { name: 'ИИ-помощник' })).toHaveCount(0);
    await expect.poll(ширина).toBeGreaterThan(было - 2);
});
