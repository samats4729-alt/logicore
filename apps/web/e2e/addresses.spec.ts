import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Адрес, когда геокодер молчит.
 *
 * Раньше форма требовала координаты, а координаты давал только 2ГИС.
 * Кончились оплаченные запросы — и адрес завести нельзя, значит нельзя
 * оформить рейс. Проверяется ровно это свойство: адрес сохраняется по
 * частям, без единой подсказки и без точки на карте, и после этого он не
 * теряется, а виден в списке «без точки на карте».
 *
 * Ответ геокодера во втором тесте подменяется намеренно. Стенд может быть
 * и с ключом, и без — а слова, которыми платформа объясняет отказ, должны
 * проверяться всегда, а не через раз.
 */

/** Заполнить поле по подписи: Ant Design связывает их через `for`/`id`. */
const fill = (page: any, label: string, value: string) =>
    page.getByRole('dialog').getByLabel(label, { exact: true }).fill(value);

test.describe('Адреса без геокодера', () => {
    test('адрес сохраняется по частям и попадает в список «без точки»', async ({ page }) => {
        const name = `E2E склад ${Date.now()}`;

        await login(page);
        await page.goto('/company/locations');
        await page.getByRole('button', { name: 'Добавить новый адрес' }).click();

        const form = page.getByRole('dialog');
        await expect(form).toBeVisible();

        await fill(page, 'Название точки', name);
        await fill(page, 'Страна', 'Казахстан');
        // Мынарала нет ни в подсказках, ни в справочнике — на этом и
        // спотыкалась компания, пока город выбирался только из списка.
        await fill(page, 'Город или посёлок', 'Мынарал');
        await fill(page, 'Улица', 'Центральная');
        await fill(page, 'Дом', '5');

        // Написание причёсывается на глазах: в документ уйдёт «Мамедова»,
        // а не «МАМЕДОВА», и человек видит это до сохранения.
        await fill(page, 'Улица', 'МАМЕДОВА');
        await form.getByLabel('Дом', { exact: true }).blur();
        await expect(form.getByText(/В документах и в списке будет так/)).toBeVisible();
        await expect(form.getByText(/Мынарал, Мамедова 5/)).toBeVisible();

        // Ни подсказки 2ГИС, ни клика по карте: точки у адреса нет.
        await expect(form.getByText(/Координат пока нет/)).toBeVisible();

        await page.getByRole('button', { name: 'Сохранить адрес' }).click();
        await expect(page.locator('[data-sonner-toast]')).toContainText('Адрес добавлен', { timeout: 15_000 });

        // Полоса над списком: адрес не потерялся и про него сказано вслух.
        const strip = page.getByText(/без точки на карте/);
        await expect(strip).toBeVisible({ timeout: 15_000 });
        await page.getByRole('button', { name: /Показать/ }).click();
        await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();

        // Убираем за собой: стенд общий, и каждый прогон иначе оставлял бы
        // на нём по адресу-призраку без координат.
        const response = await page.request.get(
            `${process.env.E2E_API_URL || 'http://localhost:3001'}/locations/missing-coordinates`,
        );
        const created = (await response.json()).items.find((item: any) => item.name === name);
        expect(created, 'созданный адрес должен быть в списке без координат').toBeTruthy();
        await page.request.delete(
            `${process.env.E2E_API_URL || 'http://localhost:3001'}/locations/${created.id}`,
        );
    });

    test('«Найти сейчас» при выключенном геокодере отвечает понятно', async ({ page }) => {
        await page.route('**/locations/missing-coordinates', (route) => route.fulfill({
            json: {
                total: 2, failed: 1,
                items: [
                    { id: 'a-1', name: 'Склад Мынарал', address: 'Казахстан, Мынарал', geocodeFailedAt: '2026-08-01T00:00:00.000Z' },
                    { id: 'a-2', name: 'Площадка Балхаш', address: 'Казахстан, Балхаш', geocodeFailedAt: null },
                ],
            },
        }));
        await page.route('**/locations/geocode-missing', (route) => route.fulfill({
            json: { tried: 0, found: 0, missed: 0, configured: false },
        }));

        await login(page);
        await page.goto('/company/locations');

        await expect(page.getByText('2 адреса без точки на карте')).toBeVisible();
        // Про ненайденные сказано отдельно: их ждёт не оплата запросов, а
        // человек с картой.
        await expect(page.getByText(/геокодер уже не узнал/)).toBeVisible();

        await page.getByRole('button', { name: 'Найти сейчас' }).click();
        await expect(page.locator('[data-sonner-toast]'))
            .toContainText('точки допишем, когда он снова заработает', { timeout: 15_000 });
    });
});

/**
 * Тот же адрес, но геокодер отвечает.
 *
 * Ответ подменяется намеренно: ключ 2ГИС в проверках не живёт, а свойство
 * проверять надо всегда. Раньше подсказка клала всё одной строкой, поля
 * оставались пустыми — и когда запросы кончались, искать адрес заново было
 * не по чему. Теперь она заполняет поля, и они же идут в поиск потом.
 */
test('подсказка заполняет поля, а не одну строку', async ({ page }) => {
    await page.route('**/geo/suggest**', (route) => route.fulfill({
        json: {
            configured: true,
            items: [{
                id: '1', name: 'Мамедова, 2',
                full_name: 'Шардара, Мамедова, 2',
                address_name: 'Мамедова, 2',
                point: { lat: 41.2545, lon: 67.9705 },
                geography: {
                    provider: '2gis',
                    country: { code: 'KZ', name: 'Казахстан' },
                    region: { name: 'Туркестанская область' },
                    city: { name: 'Шардара' },
                },
            }],
        },
    }));
    await page.route('**/cities/import-from-provider', (route) => route.fulfill({
        json: {
            country: { id: 'c-1', name: 'Казахстан', code: 'KZ' },
            region: { id: 'r-1', name: 'Туркестанская область' },
            city: { id: 'g-1', name: 'Шардара', latitude: 41.25, longitude: 67.97 },
        },
    }));

    await login(page);
    await page.goto('/company/locations');
    await page.getByRole('button', { name: 'Добавить новый адрес' }).click();

    const form = page.getByRole('dialog');
    await fill(page, 'Название точки', 'E2E подсказка');
    // У поля поиска нет имени в форме, поэтому целимся по подсказке ввода.
    await form.getByPlaceholder(/Сатпаева 90\/1/).fill('Мамедова');
    // Берём видимый пункт списка: у Ant рядом лежит скрытый двойник для
    // экранных читалок, и клик по нему не проходит.
    await page.locator('.ant-select-item-option:visible').first().click();

    // Всё разошлось по своим полям — по ним потом и ищется адрес.
    await expect(form.getByLabel('Страна', { exact: true })).toHaveValue('Казахстан');
    await expect(form.getByLabel('Область или район', { exact: true })).toHaveValue('Туркестанская область');
    await expect(form.getByLabel('Город или посёлок', { exact: true })).toHaveValue('Шардара');
    await expect(form.getByLabel('Улица', { exact: true })).toHaveValue('Мамедова');
    await expect(form.getByLabel('Дом', { exact: true })).toHaveValue('2');

    await expect(form.getByText(/Точка на карте есть/)).toBeVisible();
});

/**
 * Выбрали посёлок, а не улицу в нём.
 *
 * Так и случилось у владельца на Шардаре: в «Страну» подставилась Россия —
 * её брали из языка ответа, — а в «Улицу» название самого посёлка. Поля
 * были заполнены, и поэтому неправду никто не заметил.
 */
test('у посёлка не выдумывается ни улица, ни чужая страна', async ({ page }) => {
    await page.route('**/geo/suggest**', (route) => route.fulfill({
        json: {
            configured: true,
            items: [{
                id: '95707', name: 'Шардара',
                full_name: 'Казахстан, Туркестанская область, Шардара',
                // Улицы у посёлка нет — значит и поля «Улица» быть не должно.
                address_name: undefined,
                point: { lat: 41.2545, lon: 67.9705 },
                geography: {
                    provider: '2gis',
                    country: { code: 'KZ', name: 'Казахстан' },
                    region: { name: 'Туркестанская область' },
                    city: { name: 'Шардара' },
                },
            }],
        },
    }));
    await page.route('**/cities/import-from-provider', (route) => route.fulfill({
        json: {
            country: { id: 'c-1', name: 'Казахстан', code: 'KZ' },
            region: { id: 'r-1', name: 'Туркестанская область' },
            city: { id: 'g-1', name: 'Шардара', latitude: 41.25, longitude: 67.97 },
        },
    }));

    await login(page);
    await page.goto('/company/locations');
    await page.getByRole('button', { name: 'Добавить новый адрес' }).click();

    const form = page.getByRole('dialog');
    await fill(page, 'Название точки', 'E2E посёлок');
    await form.getByPlaceholder(/Сатпаева 90\/1/).fill('Шардара');
    await page.locator('.ant-select-item-option:visible').first().click();

    await expect(form.getByLabel('Страна', { exact: true })).toHaveValue('Казахстан');
    await expect(form.getByLabel('Город или посёлок', { exact: true })).toHaveValue('Шардара');
    // Пустое поле честнее, чем посёлок в графе «Улица».
    await expect(form.getByLabel('Улица', { exact: true })).toHaveValue('');
    await expect(form.getByLabel('Дом', { exact: true })).toHaveValue('');
    // Берём последнее совпадение: та же строка попадает и в подсказку поиска.
    await expect(form.getByText('Казахстан, Туркестанская область, Шардара').last()).toBeVisible();
});
