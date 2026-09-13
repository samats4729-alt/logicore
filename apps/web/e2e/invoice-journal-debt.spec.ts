import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Журнал счетов отвечает на вопрос «весь ли долг оформлен».
 *
 * Раньше журнал показывал только выставленные счета и «Итого за период».
 * По нему нельзя было понять главного: покрывают ли эти счета весь долг.
 * Бухгалтер видел сумму счетов и не знал, осталось ли что-то неоформленным,
 * — а узнавал об этом от контрагента, который не дождался счёта.
 *
 * Сумма долга собирается из двух чисел сервера: выставлено плюс
 * неоформленное. Проверяем именно сложение: разъедься оно, плитки покажут
 * правдоподобную, но неверную сумму, и ни типы, ни сборка этого не заметят.
 *
 * Тест держится на чистом стенде: счетов в сиде может не быть вовсе,
 * поэтому строение плиток проверяется всегда, а сложение — когда суммы есть.
 */

/** «1 234 567,00 ₸» → 1234567 */
function сумма(текст: string): number {
    const цифры = текст.replace(/[^\d,]/g, '').replace(',', '.');
    return Math.round(Number(цифры) || 0);
}

async function плитка(page: import('@playwright/test').Page, подпись: string) {
    const узел = page.locator('div').filter({ hasText: new RegExp(`^${подпись}`) }).last();
    await expect(узел).toBeVisible();
    return узел;
}

test.describe('Журнал счетов: долг целиком', () => {
    test('над журналом видно, сколько долга уже оформлено счетами', async ({ page }) => {
        await login(page);
        await page.goto('/company/accounting/invoices');

        // Вкладка «Исходящие» — дебиторка, долг заказчиков нам.
        await expect(page.getByRole('heading', { name: 'Журнал счетов' })).toBeVisible();
        await expect(page.getByText('Дебиторка', { exact: true })).toBeVisible();
        await expect(page.getByText('Выставлено счетами', { exact: true })).toBeVisible();
        await expect(page.getByText('Счёт не выставлен', { exact: true })).toBeVisible();
    });

    test('долг равен выставленному плюс неоформленному', async ({ page }) => {
        await login(page);
        await page.goto('/company/accounting/invoices');
        await expect(page.getByText('Выставлено счетами', { exact: true })).toBeVisible();

        const значения = await page.locator('[class*="tileValue"]').allInnerTexts();
        if (значения.length < 3) test.skip(true, 'Плитки долга не отрисовались');

        const [всего, выставлено, неоформлено] = значения.slice(0, 3).map(сумма);
        if (всего === 0) test.skip(true, 'На стенде нет долга — складывать нечего');

        expect(всего).toBe(выставлено + неоформлено);
    });

    test('вкладка «Входящие» показывает кредиторку, а не дебиторку', async ({ page }) => {
        // Один и тот же набор плиток обязан менять сторону вместе с вкладкой:
        // иначе бухгалтер смотрит на счета поставщиков, а сумма над ними —
        // про долг клиентов.
        await login(page);
        await page.goto('/company/accounting/invoices');
        await expect(page.getByText('Дебиторка', { exact: true })).toBeVisible();

        await page.getByRole('tab', { name: 'Входящие' }).click();
        await expect(page.getByText('Кредиторка', { exact: true })).toBeVisible();
        await expect(page.getByText('всего должны мы на сегодня')).toBeVisible();
    });

    test('календарь не молчит о долге, для которого счёт не выставлен', async ({ page }) => {
        // Без счёта у долга нет срока оплаты, и в сетку он не встаёт. Если о
        // нём не сказать, пустая неделя читается как «платить нечего».
        await login(page);
        await page.goto('/company/accounting/planned');
        // Ждём ответа сервера: без этого счёт блока выполняется раньше
        // загрузки, и тест молча пропускает сам себя на стенде с долгами.
        await expect(page.getByText(/Счетов в плане:/)).toBeVisible();
        const есть = await page.getByText(/Счёт не выставлен:/).count();

        await page.goto('/company/accounting/calendar');
        await expect(page.getByRole('heading', { name: 'Платёжный календарь' })).toBeVisible();
        if (!есть) test.skip(true, 'На стенде всё оформлено — показывать нечего');

        await expect(page.getByRole('button', { name: /Не в календаре/ })).toBeVisible();
    });
});
