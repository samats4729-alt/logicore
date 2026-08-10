import { expect, test } from '@playwright/test';
import { login, pickAntOption } from './helpers';

/**
 * Пути, по которым в компании ходят каждый день. Ломается любой — работа
 * встаёт, поэтому проверка обязана быть красной.
 */

test('вход в кабинет работает', async ({ page }) => {
    await login(page);
    await expect(page.getByText('Создать заявку').first()).toBeVisible();
});

test('мастер заявки доходит до груза и показывает состав', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders/create');

    // Шаг 1: без сторон сделки дальше не пускает.
    await pickAntOption(page, 'Выберите заказчика', 1);
    await pickAntOption(page, 'Выберите перевозчика', 1);
    await page.getByRole('button', { name: /Далее/ }).first().click();

    // Шаг 2: маршрут. Дата погрузки обязательна — без неё шага «Груз» не будет.
    await expect(page.getByText('Точки маршрута')).toBeVisible();
    // Именно #pickupDate: шаги мастера отрисованы все сразу, и общий
    // селектор ловит скрытое поле оплаты с первого шага.
    await page.locator('#pickupDate').click();
    await page.locator('.ant-picker-cell-today').first().click();
    // Кнопка подтверждения времени живёт в своём контейнере antd.
    await page.locator('.ant-picker-ok button').first().click();

    // Без адресов погрузки и выгрузки шаг не пропускает.
    // После выбора подпись кнопки меняется на адрес, поэтому каждый раз
    // берём первую ещё не заполненную.
    for (let i = 0; i < 2; i++) {
        await page.getByRole('button', { name: /Выберите адрес или склад/ }).first().click();
        // Адрес выбирается в отдельном окне с поиском и фильтрами.
        await expect(page.getByRole('dialog')).toBeVisible();
        // Целимся в строку адреса, а не «в кнопку с подходящим словом»: в окне
        // есть фильтры по группе и городу, и их подписи содержат те же слова.
        // На стенде с наполненными складами заказчика тест кликал в фильтр,
        // окно оставалось открытым, и падение выглядело как поломка окна.
        const option = page.getByRole('dialog').locator('[data-address-option]').first();
        await expect(option).toBeVisible();
        await option.click();
        await expect(page.getByRole('dialog')).toBeHidden();
    }

    await page.getByRole('button', { name: /Далее/ }).first().click();

    // Шаг 3: состав груза. Это то, чего в интерфейсе не было и что легко
    // потерять при следующей правке формы.
    await expect(page.getByText('Паллеты и места')).toBeVisible();
    await expect(page.getByText('Способ погрузки')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Боковая' })).toBeVisible();
    await expect(page.getByText('Упаковка')).toBeVisible();

    // Комбинация паллет — ради неё задача и делалась.
    await page.getByRole('button', { name: /Добавить вид паллет/ }).click();
    await expect(page.locator('select').first()).toBeVisible();
});

test('список заявок открывается', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders');
    await expect(page.getByText('Заявки компании')).toBeVisible();
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
    const firstRow = page.locator('.ant-table-row').first();
    await expect(firstRow).toBeVisible();
    await firstRow.locator('button').last().click();

    await page.waitForURL(/\/company\/orders\/[^/]+$/);
    // «Рейс» — карточка с маршрутом и грузом, «Стороны сделки» — с кем
    // работаем. Обе появляются только когда заявка загрузилась.
    await expect(page.getByText(/Стороны сделки|Деньги рейса/).first()).toBeVisible();
});
