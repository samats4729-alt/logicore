import { test, expect } from '@playwright/test';

/**
 * Биржа: компания ставит груз, видит его в списке и снимает.
 *
 * Биржа включается выключателем на сервере (EXCHANGE_ENABLED). Где он не
 * стоит — вкладки нет, и проверять нечего: тест пропускается, а не падает.
 */
test.describe('Биржа · грузы компании', () => {
    test('груз ставится, открывается в карточке и снимается с причиной', async ({ page }) => {
        test.setTimeout(150_000);
        await page.goto('/company');

        const tab = page.getByRole('button', { name: 'Биржа', exact: true });
        const enabled = await tab.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
        test.skip(!enabled, 'Биржа на этом сервере выключена');

        await tab.click();
        await expect(page.getByRole('heading', { name: 'Биржа', level: 1 })).toBeVisible({ timeout: 60_000 });
        await page.getByRole('button', { name: 'Поставить груз' }).click();
        await expect(page.getByRole('heading', { name: 'Поставить груз' })).toBeVisible({ timeout: 60_000 });

        // Пустая форма не отправляется — сказано, чего не хватает.
        await expect(page.getByText(/Осталось заполнить: откуда, куда/)).toBeVisible();

        for (const [button, city] of [['Откуда', 'Шымкент'], ['Куда', 'Алматы']] as const) {
            await page.getByRole('button', { name: button }).click();
            await page.locator('input[placeholder="Начните вводить название города"]').last().fill(city);
            await page.getByRole('dialog').last().locator('ul li button').first().click();
        }
        await page.getByPlaceholder('Напитки на паллетах').fill('Проверка биржи');
        await page.getByLabel('Тип кузова').selectOption('тент');
        await page.getByPlaceholder('20', { exact: true }).fill('20');
        await page.getByLabel('Цена перевозки').fill('450000');
        await expect(page.getByLabel('Цена перевозки')).toHaveValue('450 000');

        await page.getByRole('button', { name: 'Поставить на биржу' }).click();

        // Карточка груза: номер с буквой Б, статус «Ищем машину».
        await expect(page.getByText(/Биржа · груз Б-\d+/)).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText('Ищем машину').first()).toBeVisible();
        await expect(page.getByText('450 000 ₸').first()).toBeVisible();

        // Снять: вопрос, причина, и груз уходит во вкладку «Сняты».
        await page.getByRole('button', { name: 'Снять с биржи' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Нашли машину сами' }).click();
        await dialog.getByRole('button', { name: 'Снять с биржи' }).click();
        await expect(page.getByText(/Снят с биржи .* — Нашли машину сами/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('button', { name: 'Снять с биржи' })).toHaveCount(0);
    });
});
