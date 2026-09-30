import { test, expect } from '@playwright/test';

/**
 * «Моя зарплата» — свои начисления сотрудника.
 *
 * Решение владельца (30.09.2026): менеджер должен легко найти свою зарплату
 * и видеть отчёт, а не листать месяцы по одному. Раньше ссылка была только в
 * разделе «Деньги», закрытом для менеджера без доступа к бухгалтерии.
 *
 * Тест ничего не меняет: только открывает и смотрит.
 */
test('«Моя зарплата» открывается из меню под аватаркой и показывает отчёт за год', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/company');

    await page.locator('.user-profile-trigger').click({ timeout: 60_000 });
    await page.getByRole('menuitem', { name: 'Моя зарплата' }).click();
    await expect(page).toHaveURL(/\/company\/my-salary/);

    const year = String(new Date().getFullYear());
    const report = page.locator('section').filter({ has: page.getByRole('heading', { name: `По месяцам · ${year}` }) });
    await expect(report).toBeVisible({ timeout: 60_000 });

    // Либо строки по месяцам с итогом за год, либо пустота объясняет себя.
    await expect(report.getByText(new RegExp(`За ${year} год`)).first()).toBeVisible({ timeout: 60_000 });

    // Нажатие на месяц раскрывает его расшифровку ниже.
    const rows = report.getByRole('row', { name: /^Расшифровка: / });
    if (await rows.count() > 0) {
        const first = rows.first();
        const label = (await first.getAttribute('aria-label'))!.replace('Расшифровка: ', '');
        await first.click();
        await expect(page.getByRole('heading', { name: `За что начислено · ${label}` })).toBeVisible();
    }
});
