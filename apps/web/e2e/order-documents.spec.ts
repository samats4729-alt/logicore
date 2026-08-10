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

        // Кнопка называется по документу и не меняет подпись после выдачи:
        // «заново» ничего не добавляет, а ряд кнопок должен быть постоянным.
        const make = page.getByRole('button', { name: 'Договор-заявка', exact: true }).first();
        await expect(make).toBeVisible();
        await make.click();

        await expect(page.getByText('действующий').first()).toBeVisible({ timeout: 20_000 });

        // Вторая выдача: прежняя версия обязана остаться и смениться меткой.
        await make.click();
        const older = page.getByRole('button', { name: /Показать прежние версии/ });
        await expect(older).toBeVisible({ timeout: 20_000 });

        await older.click();
        await expect(page.getByText('изменён').first()).toBeVisible();

        // Действующая ровно одна: иначе непонятно, какая бумага в ходу.
        await expect(page.getByText('действующий')).toHaveCount(1);
    });

    test('недоступный документ виден, погашен и объясняет причину', async ({ page }) => {
        await login(page);
        await page.goto('/company/orders');

        // Нужен рейс не в статусе «Завершён»: акт по неоказанной услуге
        // выдавать нельзя, и кнопка должна быть погашена, а не спрятана.
        const inWork = page.locator('.ant-table-row').filter({ hasNot: page.getByText('Завершён') }).first();
        await expect(inWork).toBeVisible();
        await inWork.locator('button').last().click();
        await page.waitForURL(/\/company\/orders\/[^/]+$/);

        await page.getByRole('tab', { name: /Документы/ }).first().click();

        const act = page.getByRole('button', { name: 'Акт выполненных работ', exact: true }).first();
        await expect(act).toBeVisible();
        await expect(act).toHaveAttribute('aria-disabled', 'true');

        // Кнопка не `disabled`: выключенная не отдаёт нажатие, и объяснить
        // причину было бы нечем. Playwright такую считает неактивной —
        // отсюда force, у человека нажатие проходит обычным образом.
        await act.click({ force: true });
        await expect(page.getByText(/услуга ещё не оказана/)).toBeVisible();
    });
});
