import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Калькулятор ГСМ и налогов обычной компании (шеф, 03.11.2026). Суммы посчитаны
 * отдельно от программы: ставка 750 000, 2 795 км × 30 л на 100 км × 350 ₸.
 */
test.describe('Калькулятор ГСМ и налогов', () => {
    test('налоги из разницы и свой процент: сумма для заказчика', async ({ page }) => {
        await login(page);
        await page.goto('/company/fuel-tax-calculator');
        const result = page.getByRole('region', { name: 'Расчёт' });
        await expect(result).toContainText('825 000 ₸');
        await expect(result).toContainText('293 475 ₸');
        await expect(result).toContainText('113 448 ₸');
        await expect(result).toContainText('343 077 ₸');
        await expect(result).toContainText('вам 75 000 ₸');
    });

    test('налоги сверху с НДС — те же цифры, что в файле шефа', async ({ page }) => {
        await login(page);
        await page.goto('/company/fuel-tax-calculator');
        await page.getByRole('button', { name: 'Сверху, разница на руки' }).click();
        await page.getByLabel('Цена заказчику с НДС 16 %').click();
        const result = page.getByRole('region', { name: 'Расчёт' });
        await expect(result).toContainText('607 486 ₸');
        await expect(result).toContainText('150 961 ₸');
        await expect(result).toContainText('456 525 ₸');
        await expect(result).toContainText('1 149 626,24 ₸');
    });

    test('ГСМ больше суммы — понятный отказ вместо расчёта', async ({ page }) => {
        await login(page);
        await page.goto('/company/fuel-tax-calculator');
        await page.getByLabel('Общая сумма, ₸').fill('200000');
        await expect(page.getByRole('alert').filter({ hasText: 'не меньше общей суммы' })).toBeVisible();
    });

    test('в меню «Запросы» у обычной компании есть калькулятор', async ({ page }) => {
        await login(page);
        await page.goto('/company/requests');
        await expect(page.getByRole('button', { name: 'ГСМ и налоги' })).toBeVisible();
    });
});
