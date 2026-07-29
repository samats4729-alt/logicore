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

        await expect(form.getByText(/машину нашли за/)).toBeVisible({ timeout: 10_000 });
        await expect(form.getByText(/проходила|не была принята|запросов ещё не было/)).toBeVisible();
    });

    test('город ищется в справочнике, а его отсутствие объясняется', async ({ page }) => {
        // Города руками не пишут: их пишут по-разному, и справочник
        // расползается. Если города нет и подсказки 2ГИС недоступны — надо
        // сказать почему, а не показывать пустоту.
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
            page.getByRole('dialog').last().getByText(/такого города нет|Ничего не нашлось/),
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
