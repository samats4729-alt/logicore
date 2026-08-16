import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Раздел «Запросы» — этап до заявки.
 *
 * Проверяется не разметка, а два свойства, ради которых раздел заведён:
 * панель памяти появляется ДО того, как менеджер назовёт цену, и отказ
 * нельзя записать без причины. Оба ломаются молча: страница выглядит
 * рабочей, а смысла в ней уже нет.
 */
test.describe('Запросы на расчёт', () => {
    test('раздел открывается и показывает запросы', async ({ page }) => {
        await login(page);
        await page.goto('/company/requests');

        await expect(page.getByRole('heading', { name: 'Запросы на расчёт' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Новый запрос/ })).toBeVisible();
    });

    test('память по клиенту и маршруту появляется до того, как названа цена', async ({ page }) => {
        await login(page);
        await page.goto('/company/requests');
        await page.waitForLoadState('networkidle');

        const rows = page.locator('tbody tr');
        if (await rows.count() === 0) {
            test.skip(true, 'На стенде нет истории запросов — сравнивать не с чем');
        }

        await page.getByRole('button', { name: /Новый запрос/ }).click();
        const form = page.getByRole('dialog');
        await expect(form).toBeVisible();

        // Клиент. Целимся в пункт списка, а не в «первую кнопку окна»: там
        // ещё поиск, крестик и «Закрыть», и общий селектор ловит их.
        await form.getByRole('button', { name: /Кто прислал запрос/ }).click();
        const customerOption = page.getByRole('dialog').last().locator('ul li button').first();
        if (await customerOption.count() === 0) {
            test.skip(true, 'На стенде нет контрагентов — выбирать некого');
        }
        await customerOption.click();

        // Маршрут: панель памяти должна появиться сразу после него, ещё до
        // полей с ценой — в этом весь смысл.
        await form.getByRole('button', { name: 'Откуда' }).click();
        await page.locator('input[placeholder="Начните вводить название города"]').last().fill('Шымкент');
        await page.getByRole('dialog').last().locator('ul li button').first().click();

        await form.getByRole('button', { name: 'Куда' }).click();
        await page.locator('input[placeholder="Начните вводить название города"]').last().fill('Алматы');
        await page.getByRole('dialog').last().locator('ul li button').first().click();

        // Проверяется появление панели памяти, а не наличие истории: на
        // стенде запросов по этому направлению может не быть вовсе, и тогда
        // панель честно об этом говорит. Требовать конкретных цифр — значит
        // требовать от стенда подходящих данных, и тест падал бы от того,
        // что в базе просто появилась чужая строка.
        await expect(
            form.getByText(/По этому направлению|запросов ещё не было/),
        ).toBeVisible({ timeout: 10_000 });
    });

    test('город ищется в справочниках, а чего там нет — вписывается руками', async ({ page }) => {
        // Раньше город выбирался строго из справочника, и на посёлке вроде
        // Мынарала запрос не заводился вовсе: справочник наполняется тем же
        // геокодером, который его не знает. Теперь тупика нет — написанное
        // принимается как есть.
        await login(page);
        await page.goto('/company/requests');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: /Новый запрос/ }).click();
        await page.getByRole('button', { name: 'Откуда' }).click();

        const search = page.locator('input[placeholder="Начните вводить название города"]').last();
        await search.fill('Алма');
        // «Алматы» встречается и как город, и как область в подписи — берём
        // первый пункт списка, а не любое совпадение по тексту.
        await expect(page.getByRole('dialog').last().locator('ul li button').first()).toBeVisible();

        await search.fill('Мурманскийгород');
        await expect(
            page.getByRole('dialog').last().getByRole('button', { name: /Оставить как написано/ }),
        ).toBeVisible({ timeout: 10_000 });
    });

    test('отказ без причины записать нельзя', async ({ page }) => {
        await login(page);
        await page.goto('/company/requests');
        await page.waitForLoadState('networkidle');

        const open = page.locator('tbody tr').filter({ hasText: /Новый|В работе/ }).first();
        if (await open.count() === 0) {
            test.skip(true, 'Нет незакрытых запросов, отказывать нечему');
        }

        await open.click();
        await page.getByRole('button', { name: 'Не согласовал' }).click();

        const confirm = page.getByRole('dialog').last();
        await expect(confirm.getByRole('button', { name: /Записать отказ/ })).toBeDisabled();

        await confirm.getByPlaceholder(/дорого/).fill('нашли машину дешевле');
        await expect(confirm.getByRole('button', { name: /Записать отказ/ })).toBeEnabled();
    });
});
