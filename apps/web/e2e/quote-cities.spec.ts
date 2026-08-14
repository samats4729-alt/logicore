import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Города запроса и память по направлению.
 *
 * Проверяются два свойства, ради которых всё менялось. Первое: город,
 * которого нет ни в справочнике, ни у геокодера, вписывается руками —
 * раньше на этом месте запрос не заводился вовсе. Второе: история идёт по
 * направлению, а не по карточке клиента, поэтому запрос соседнего клиента
 * по тому же маршруту виден, и видно, чей он.
 *
 * Ответ памяти подменяется намеренно: на стенде может не быть подходящих
 * данных, а слова и разделение блоков должны проверяться всегда.
 */

test.describe('Запрос: город текстом и память по направлению', () => {
    test('город, которого нет в справочниках, вписывается руками', async ({ page }) => {
        await login(page);
        await page.goto('/company/requests');

        await page.getByRole('button', { name: /Новый запрос/ }).click();
        const form = page.getByRole('dialog');
        await expect(form).toBeVisible();

        await form.getByRole('button', { name: 'Куда', exact: true }).click();
        await page.locator('input[placeholder="Начните вводить название города"]').last().fill('Мынарал');

        // Тот самый посёлок, из-за которого запрос не заводился.
        const asWritten = page.getByRole('button', { name: /Оставить как написано/ });
        await expect(asWritten).toBeVisible();
        await asWritten.click();

        await expect(form.getByRole('button', { name: 'Мынарал' })).toBeVisible();
    });

    test('запрос другого клиента по этому направлению виден', async ({ page }) => {
        await page.route('**/quote-requests/memory', (route) => route.fulfill({
            json: {
                last: null, sameConditions: false, differences: [], note: null,
                direction: {
                    count: 1,
                    range: { customerFrom: 145_000, customerTo: 145_000, carrierFrom: 100_000, carrierTo: 100_000, count: 1 },
                    items: [{
                        id: 'з1', requestNumber: 'ЗПР-00001', createdAt: new Date().toISOString(),
                        customerPrice: 145_000, carrierCost: 100_000, cargoWeight: 20_000, cargoVolume: 86,
                        cargoType: 'тент', status: 'REJECTED', rejectionReason: 'дорого',
                        customerName: 'Шымкентский пивзавод',
                    }],
                },
                annualTariff: null, history: [],
            },
        }));

        await login(page);
        await page.goto('/company/requests');
        await page.getByRole('button', { name: /Новый запрос/ }).click();
        const form = page.getByRole('dialog');

        // Клиент — любой: важно, что история придёт по направлению.
        await form.getByRole('button', { name: /Кто прислал запрос/ }).click();
        const customer = page.getByRole('dialog').last().locator('ul li button').first();
        if (await customer.count() === 0) test.skip(true, 'На стенде нет контрагентов — выбирать некого');
        await customer.click();

        for (const [button, city] of [['Откуда', 'Шымкент'], ['Куда', 'Мынарал']] as const) {
            await form.getByRole('button', { name: button, exact: true }).click();
            await page.locator('input[placeholder="Начните вводить название города"]').last().fill(city);
            await page.getByRole('button', { name: /Оставить как написано/ }).click();
        }

        await expect(form.getByText(/По этому направлению/)).toBeVisible();
        await expect(form.getByText('Шымкентский пивзавод')).toBeVisible();
        // Тоннаж, цена и исход — то, что просил клиент платформы.
        await expect(form.getByText('20 т · 86 м³ · тент')).toBeVisible();
        await expect(form.getByText('Причина: дорого')).toBeVisible();
    });
});
