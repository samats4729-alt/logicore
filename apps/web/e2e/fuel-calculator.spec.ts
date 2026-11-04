import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Калькулятор ГСМ обычной компании (шеф, 03.11.2026): только общая сумма, на руки,
 * ГСМ и ОПВ. Суммы посчитаны отдельно от программы: 750 000, 2 795 км × 30 л на
 * 100 км × 350 ₸ = 293 475; ОПВ 10 % с 456 525 = 45 653; на руки 410 872.
 */
test.describe('Калькулятор ГСМ', () => {
    test('показывает четыре суммы и не показывает схему', async ({ page }) => {
        await login(page);
        await page.goto('/company/fuel-calculator');
        const result = page.getByRole('region', { name: 'Расчёт' });
        await expect(result).toContainText('Укажите километраж');
        await page.getByLabel('Километраж, км').fill('2795');
        await page.getByLabel('Общая сумма, ₸').fill('750000');
        await expect(result).toContainText('750 000 ₸');
        await expect(result).toContainText('410 872 ₸');
        await expect(result).toContainText('293 475 ₸');
        await expect(result).toContainText('45 653 ₸');
        await expect(result).toContainText('предоставляет чек');
        for (const hidden of ['ОСМС', 'ИПН', 'СО ', 'НДС', 'заказчик', 'Себестоимость']) {
            await expect(page.locator('main[data-guide="content"]')).not.toContainText(hidden);
        }
    });

    test('ГСМ больше суммы — понятный отказ вместо расчёта', async ({ page }) => {
        await login(page);
        await page.goto('/company/fuel-calculator');
        await page.getByLabel('Километраж, км').fill('2795');
        await page.getByLabel('Общая сумма, ₸').fill('200000');
        await expect(page.getByRole('alert').filter({ hasText: 'не меньше общей суммы' })).toBeVisible();
    });

    test('в меню «Запросы» у обычной компании есть калькулятор', async ({ page }) => {
        await login(page);
        await page.goto('/company/requests');
        await expect(page.getByRole('button', { name: 'Калькулятор ГСМ' })).toBeVisible();
    });
});
