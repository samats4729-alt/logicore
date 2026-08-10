import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Раздел «Документы» в карточке заявки.
 *
 * Проверяем не разметку, а работу: печатная форма выдаётся версиями, свежая
 * помечается «действующей», прежняя не пропадает и не выдаёт себя за
 * актуальную. Именно на этом строится спор с перевозчиком — какая бумага у
 * него на руках, — поэтому метки важнее вида.
 */
test.describe('Документы заявки', () => {
    test('договор-заявка выдаётся версиями, прежняя помечается «изменён»', async ({ page }) => {
        await login(page);
        await page.goto('/company/orders');

        const firstRow = page.locator('.ant-table-row').first();
        await expect(firstRow).toBeVisible();
        await firstRow.locator('button').last().click();
        await page.waitForURL(/\/company\/orders\/[^/]+$/);

        await page.getByRole('tab', { name: /Документы/ }).first().click();

        // Первая выдача: кнопка называется по документу, а не «сформировать».
        const make = page.getByRole('button', { name: /Договор-заявка/ }).first();
        await expect(make).toBeVisible();
        await make.click();

        await expect(page.getByText('действующий').first()).toBeVisible({ timeout: 20_000 });

        // Вторая выдача: прежняя версия обязана остаться и смениться меткой.
        await page.getByRole('button', { name: /Договор-заявка заново/ }).first().click();
        const older = page.getByRole('button', { name: /Показать прежние версии/ });
        await expect(older).toBeVisible({ timeout: 20_000 });

        await older.click();
        await expect(page.getByText('изменён').first()).toBeVisible();

        // Действующая ровно одна: иначе непонятно, какая бумага в ходу.
        await expect(page.getByText('действующий')).toHaveCount(1);
    });
});
