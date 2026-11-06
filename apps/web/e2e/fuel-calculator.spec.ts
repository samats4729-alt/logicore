import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Калькулятор ГСМ и налогов обычной компании (владелец, 06.11.2026): все налоги по
 * ГПХ, без комиссии и НДС. Суммы посчитаны отдельно от программы, формулами файла
 * «Алматы — Астана»: 750 000, 2 795 км × 30 л на 100 км × 350 ₸ = 293 475; остаток
 * 456 525 × 0,9 = на руки 410 873; начислено 410 873 / 0,835 = 492 063; ОПВ 49 206,
 * ОСМС 9 841, СО 22 143, ИПН 41 087; себестоимость 826 625.
 */
test.describe('Калькулятор ГСМ и налогов', () => {
    test('все налоги и себестоимость, без комиссии и НДС', async ({ page }) => {
        await login(page);
        await page.goto('/company/fuel-calculator');
        const result = page.getByRole('region', { name: 'Расчёт' });
        await expect(result).toContainText('Укажите километраж');
        await page.getByLabel('Километраж, км').fill('2795');
        await page.getByLabel('Общая сумма, ₸').fill('750000');
        for (const sum of ['410 873 ₸', '293 475 ₸', '456 525 ₸', '492 063 ₸', '49 206 ₸', '9 841 ₸', '22 143 ₸', '41 087 ₸', '122 277 ₸', '826 625 ₸']) {
            await expect(result).toContainText(sum);
        }
        await expect(result).toContainText('предоставляет чек');
        for (const hidden of ['Комиссия', 'НДС', 'заказчик']) {
            await expect(page.locator('main[data-guide="content"]')).not.toContainText(hidden);
        }
    });

    test('вычет уменьшает ИПН компании, а не сумму водителю', async ({ page }) => {
        await login(page);
        await page.goto('/company/fuel-calculator');
        await page.getByLabel('Километраж, км').fill('2795');
        await page.getByLabel('Общая сумма, ₸').fill('750000');
        await page.getByText('Заявление на вычет 30 МРП').click();
        const result = page.getByRole('region', { name: 'Расчёт' });
        // (410 873 − 129 750) × 10 % = 28 112; себестоимость 293 475 + 492 063 + 28 112.
        await expect(result).toContainText('28 112 ₸');
        await expect(result).toContainText('813 650 ₸');
        await expect(result).toContainText('410 873 ₸');
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
