import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Заработок сотрудников на главной кабинета.
 *
 * Карточка заменила собой задолженность (решение владельца от 31.08.2026):
 * долги уже есть целой страницей во «Взаиморасчётах», а сколько компания
 * должна своим — не было видно нигде, кроме страницы зарплат.
 *
 * Ломается тихо: `/payroll/report` отвечает ошибкой — карточка просто
 * исчезает, и дашборд выглядит рабочим. Поэтому проверяем и то, что она
 * есть, и то, что задолженности на её месте больше нет.
 */

test.describe('Заработок сотрудников', () => {
    test('карточка на месте задолженности, а не рядом с ней', async ({ page }) => {
        await login(page);

        // Настройки дашборда живут в браузере: на чистом профиле спрятанных
        // блоков нет, но прогон мог остаться от прошлого теста.
        await page.evaluate(() => localStorage.setItem('lc_dashboard_hidden_blocks', '[]'));
        await page.reload({ waitUntil: 'domcontentloaded' });

        const карточка = page.locator('section').filter({ hasText: 'Заработок за месяц' }).first();
        await expect(карточка).toBeVisible();

        // Задолженности на дашборде больше нет: она осталась во
        // «Взаиморасчётах», и повторять её здесь третий раз незачем.
        await expect(page.getByRole('heading', { name: 'Задолженность' })).toHaveCount(0);
    });

    test('карточка ведёт на страницу зарплаты', async ({ page }) => {
        await login(page);
        await page.evaluate(() => localStorage.setItem('lc_dashboard_hidden_blocks', '[]'));
        await page.reload({ waitUntil: 'domcontentloaded' });

        const карточка = page.locator('section').filter({ hasText: 'Заработок за месяц' }).first();
        await карточка.getByRole('button', { name: 'Зарплата' }).click();

        await expect(page).toHaveURL(/\/company\/payroll/);
    });

    test('строка сотрудника называет сумму, а не только имя', async ({ page }) => {
        await login(page);
        await page.evaluate(() => localStorage.setItem('lc_dashboard_hidden_blocks', '[]'));
        await page.reload({ waitUntil: 'domcontentloaded' });

        const карточка = page.locator('section').filter({ hasText: 'Заработок за месяц' }).first();
        await expect(карточка).toBeVisible();

        // Либо начисления есть и видна сумма, либо пустота объясняет себя.
        // Молчащая карточка без того и другого — это и есть поломка.
        await expect(
            карточка.getByText(/₸|Начислений за этот месяц нет/).first(),
        ).toBeVisible();
    });
});
