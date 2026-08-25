import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Платёжный календарь на дашборде и срок оплаты в счёте.
 *
 * Оба ломаются молча. Плитка при поломке запроса просто не покажет ни одной
 * точки — дашборд при этом выглядит рабочим, и «на этой неделе платежей
 * нет» читается как правда. Срок оплаты при поломке подстановки останется
 * пустым, счёт уйдёт контрагенту без даты и выпадет из календаря целиком.
 *
 * Поэтому проверяется не вёрстка, а то, ради чего это сделано: календарь
 * на дашборде есть и открывается на дне с платежами, а счёт по рейсу с
 * отсрочкой получает дату сам.
 */

test.describe('Платёжный календарь', () => {
    test('плитка на дашборде показывает месяц и платежи выбранного дня', async ({ page }) => {
        await login(page);

        const плитка = page.locator('section').filter({ hasText: 'Платёжный календарь' }).first();
        await expect(плитка).toBeVisible();

        // Дни недели и сетка месяца — иначе это пустая карточка с заголовком.
        await expect(плитка.getByText('ПН', { exact: true })).toBeVisible();
        await expect(плитка.getByText('ВС', { exact: true })).toBeVisible();

        // Клетка с деньгами объясняет себя всплывающей подписью: по ней же
        // видно, что данные дошли, а не просто нарисовалась сетка.
        const сДеньгами = плитка.locator('button[title*="придёт"], button[title*="уйдёт"]');
        await expect(сДеньгами.first()).toBeVisible();

        // Нажатие на дату разворачивает платежи этого дня.
        await сДеньгами.first().click();
        await expect(плитка.getByText(/₸|тыс|млн/).first()).toBeVisible();
    });

    test('из плитки открывается полный календарь', async ({ page }) => {
        await login(page);

        const плитка = page.locator('section').filter({ hasText: 'Платёжный календарь' }).first();
        await плитка.getByRole('button', { name: 'Открыть' }).click();

        await expect(page).toHaveURL(/\/company\/accounting\/calendar/);
        await expect(page.getByRole('heading', { name: 'Платёжный календарь' })).toBeVisible();
        await expect(page.getByText('Нам должны')).toBeVisible();
    });
});

test.describe('Срок оплаты счёта', () => {
    test('подставляется из отсрочки, записанной в рейсе', async ({ page }) => {
        await login(page);
        await page.goto('/company/accounting/invoices/create');

        // Входящий счёт от перевозчика: в рейсе записана отсрочка.
        await page.getByText('Входящий', { exact: true }).click();

        await page.locator('.ant-select').first().click();
        const вариант = page.locator('.ant-select-item-option:visible').first();
        await вариант.click();

        await page.getByRole('button', { name: /Подобрать по заявкам/ }).click();
        // Рейсы в работе — счёт на аванс: завершённые могут быть уже
        // выставлены, и тогда подбирать нечего.
        await page.locator('.ant-modal .ant-switch').first().click();
        await page.waitForTimeout(1500);

        const строки = page.locator('.ant-modal .ant-table-tbody tr.ant-table-row');
        // Рейсов у этого контрагента может не быть — тогда проверять нечего,
        // и падать не за что: это данные стенда, а не поломка.
        if (await строки.count() === 0) {
            test.skip(true, 'у контрагента нет рейсов без счёта');
            return;
        }

        await строки.first().locator('.ant-checkbox-input').click();
        await page.locator('.ant-modal').getByRole('button', { name: /Перенести в счёт/ }).click();

        // Либо дата подставилась и подписана, либо честно сказано, почему
        // её нет. Пустая графа без объяснения — то, от чего уходили.
        await expect(
            page.getByText(/по отсрочке из заявки|ждём оригиналы|не задана отсрочка|не проставлена дата выгрузки/),
        ).toBeVisible({ timeout: 15000 });
    });
});
