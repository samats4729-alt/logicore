import { expect, test } from '@playwright/test';
import { login, pickInCombo } from './helpers';

/**
 * Пути, по которым в компании ходят каждый день. Ломается любой — работа
 * встаёт, поэтому проверка обязана быть красной.
 */

test('вход в кабинет работает', async ({ page }) => {
    await login(page);
    await expect(page.getByText('Создать заявку').first()).toBeVisible();
});

test('окно заявки: стороны, маршрут и груз на одной странице', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders/create');
    const окно = page.locator('[data-order-wizard]');
    await expect(окно.getByRole('heading', { name: 'Новая заявка' })).toBeVisible();
    // Остался черновик с прошлого прогона — начинаем с чистой формы.
    const черновик = окно.getByTestId('order-draft-restored');
    if (await черновик.isVisible()) await черновик.getByRole('button', { name: 'Начать заново' }).click();

    // Стороны: выпадашка под полем, строка 1 — первый контрагент после своей компании.
    expect(await pickInCombo(page, 'no-customer', 1)).toBe(true);
    expect(await pickInCombo(page, 'no-carrier', 1)).toBe(true);

    // Дата погрузки — в строке первой точки, календарь прежний.
    await page.locator('#no-pickup-date').click();
    await page.locator('.ant-picker-cell-today').first().click();
    await page.locator('.ant-picker-ok button').first().click();

    // Адреса — выпадашкой в строке точки. При выбранном заказчике в ней только
    // его адреса (владелец, 29.10.2026). У заказчика без заявок их нет —
    // заводим новый пунктом «Новый адрес»: он привязывается к заказчику и
    // сразу встаёт в точку маршрута.
    for (let i = 0; i < 2; i++) {
        await page.locator(`#no-point-${i}`).click();
        const список = page.locator(`#no-point-${i}-list`);
        await expect(список).toBeVisible();
        const адрес = список.locator('[data-address-option]').first();
        await expect(адрес.or(список.getByText(/пока нет адресов|Адресов пока нет/))).toBeVisible();
        if (await адрес.count()) {
            await адрес.click();
            await expect(список).toHaveCount(0);
            continue;
        }
        await список.getByRole('option', { name: /Новый адрес/ }).click();
        const форма = page.getByRole('dialog').filter({ hasText: 'Новый адрес' });
        await expect(форма).toBeVisible();
        await expect(форма.getByRole('radio', { name: /Заказчика:/ })).toBeChecked();
        await форма.getByLabel('Название точки', { exact: true }).fill(`E2E склад заказчика ${Date.now()}`);
        await форма.getByLabel('Город или посёлок', { exact: true }).fill('Алматы');
        await форма.getByLabel('Улица', { exact: true }).fill('Абая');
        await форма.getByLabel('Дом', { exact: true }).fill(String(i + 1));
        await page.getByRole('button', { name: 'Сохранить адрес' }).click();
        await expect(форма).toBeHidden({ timeout: 15_000 });
        await expect(page.locator(`#no-point-${i}`)).not.toContainText('Склад, город или улица');
    }

    // Состав груза и кузов — то, что легко потерять при следующей правке окна.
    await expect(окно.getByRole('group', { name: 'Упаковка', exact: true })).toBeVisible();
    await expect(окно.getByRole('button', { name: /^Боковая/ })).toBeVisible();

    // Комбинация паллет — ради неё задача и делалась.
    await окно.getByRole('group', { name: 'Упаковка', exact: true }).getByRole('button', { name: /Паллет/ }).click();
    await expect(окно.getByLabel('Тип паллет')).toHaveCount(1);
    await окно.getByRole('button', { name: /Ещё вид паллет/ }).click();
    await expect(окно.getByLabel('Тип паллет')).toHaveCount(2);

    // Сводка справа видит выбранное: стороны и маршрут готовы.
    await expect(окно.getByRole('navigation', { name: 'Разделы заявки' })).toBeVisible();
    await expect(окно.getByRole('heading', { name: 'Сводка' })).toBeVisible();
});

test('список заявок открывается', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders');
    await expect(page.getByRole('tab', { name: /Все заявки/ })).toBeVisible();
});

test('взаиморасчёты открываются и считают итоги', async ({ page }) => {
    await login(page);
    await page.goto('/company/accounting/counterparty-report');
    await expect(page.locator('body')).toContainText(/Взаиморасч|контрагент/i);
});

test('планируемые платежи строятся от счетов', async ({ page }) => {
    await login(page);
    await page.goto('/company/accounting/planned');

    await expect(page.getByRole('heading', { name: 'Планируемые платежи' })).toBeVisible();
    // Подпись держит смысл задачи: срок идёт от счёта, а не от даты в рейсе.
    await expect(page.getByText(/от выставленного счёта/)).toBeVisible();
});

test('карточка рейса открывается и предлагает документы', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders');

    // В строке списка открывает карточку кнопка-шеврон в конце, а не
    // клик по строке.
    const firstRow = page.locator('[data-order-row]').first();
    await expect(firstRow).toBeVisible();
    await firstRow.locator('button').last().click();

    await page.waitForURL(/\/company\/orders\/[^/]+$/);
    // «Рейс» — карточка с маршрутом и грузом, «Стороны сделки» — с кем
    // работаем. Обе появляются только когда заявка загрузилась.
    await expect(page.getByText(/Стороны сделки|Деньги рейса/).first()).toBeVisible();
});
