import { expect, test, type Page } from '@playwright/test';
import { login, pickInCombo } from './helpers';

/**
 * Общая база водителей.
 *
 * Жалоба клиента: водитель один день едет от одного ИП, другой день — от
 * другого, а в заявке после выбора перевозчика видны были только «его»
 * водители. Того, кто вчера ездил от соседнего ИП, заводили заново.
 *
 * Ломается это тихо: список просто снова становится списком одного
 * перевозчика, и никто не заметит, пока водителя не заведут в третий раз.
 * Поэтому проверяем по-живому: в заявке у внешнего перевозчика находится
 * любой водитель базы, а не только прописанные у этого перевозчика.
 */

const API = process.env.E2E_API_URL || 'http://localhost:3001';

async function база(page: Page) {
    const res = await page.request.get(`${API}/company/drivers/pool`);
    expect(res.ok(), 'общий список водителей не отдаётся').toBe(true);
    return res.json() as Promise<any[]>;
}

test.describe('Общая база водителей', () => {
    test('один человек — одна строка, даже если его заводили у нескольких ИП', async ({ page }) => {
        await login(page);

        const водители = await база(page);

        const телефоны = водители.map((в) => String(в.phone).replace(/\D/g, '').slice(-10));
        expect(new Set(телефоны).size, 'в общем списке двойники').toBe(телефоны.length);
        for (const в of водители) {
            expect(Array.isArray(в.carrierIds), `у ${в.lastName} нет списка перевозчиков`).toBe(true);
        }
    });

    test('в заявке у внешнего перевозчика находится любой водитель базы', async ({ page }) => {
        await login(page);
        const внешние: any[] = await (await page.request.get(`${API}/external-companies`)).json();
        const перевозчик = внешние.find((к) => к.isCarrier);
        test.skip(!перевозчик, 'на стенде нет внешнего перевозчика');
        const водители = await база(page);
        test.skip(!водители.length, 'на стенде нет водителей');

        await page.goto('/company/orders/create');
        await pickInCombo(page, 'no-customer', 0);
        // Перевозчик — выпадашкой с поиском под полем (новое окно заявки, 29.10.2026).
        await page.locator('#no-carrier').click();
        await page.keyboard.type(перевозчик.name);
        await page.locator('#no-carrier-list [data-combo-option]').filter({ hasText: перевозчик.name }).first().click();
        await expect(page.locator('#no-carrier-list')).toHaveCount(0);

        // Водитель — та же выпадашка, а вся база — в справочнике (последний пункт).
        await page.locator('#no-driver').click();
        await page.locator('#no-driver-list').getByRole('option', { name: /базу водителей/ }).click();
        const окно = page.locator('[data-list-picker]');
        await expect(окно).toBeVisible();
        const поиск = окно.getByRole('textbox', { name: 'Поиск' });

        // Список длинный, поэтому ищем по фамилии — так же, как диспетчер.
        // Находиться должны и прописанные у других ИП.
        for (const в of водители.slice(0, 3)) {
            await поиск.fill(в.lastName);
            await expect(
                окно.locator('[data-picker-option]').filter({ hasText: в.lastName }).first(),
                `водитель ${в.lastName} (прописан у «${в.companyName}») не нашёлся в заявке «${перевозчик.name}»`,
            ).toBeVisible();
        }

        // «Добавить нового» на виду при любом поиске: не нашёл — сразу заводит.
        await expect(окно.getByRole('button', { name: 'Добавить нового водителя' })).toBeVisible();
    });

    test('в заявке окно назначения сразу на водителе — перевозчик взят из заявки', async ({ page }) => {
        // Перевозчика выбирают при заведении заявки. Окно «Назначить
        // водителя» всё равно начинало с вопроса «свой транспорт или
        // перевозчик» — с ответом «свой» — и просило выбрать перевозчика
        // заново: смотрело только на поле, которое заполняет само.
        await login(page);
        const внешние: any[] = await (await page.request.get(`${API}/external-companies`)).json();
        const перевозчики = new Map(внешние.filter((к) => к.isCarrier).map((к) => [к.id, к.name]));
        const заявки: any[] = (await (await page.request.get(
            `${API}/company/orders?page=1&limit=100&type=active`,
        )).json()).data ?? [];
        // Рейс, который мы передали внешнему перевозчику и где водителя ещё
        // можно назначить или сменить. Окно только открываем — ничего не
        // сохраняем.
        const рейс = заявки.find((з) =>
            ['PENDING', 'ASSIGNED'].includes(з.status) && перевозчики.has(з.subForwarderId) && !з.partnerId);
        test.skip(!рейс, 'на стенде нет рейса у внешнего перевозчика');

        await page.goto(`/company/orders/${рейс.id}`);
        await page.getByRole('button', { name: /Назначить водителя|Заменить водителя/ }).first().click();
        const окно = page.locator('.ant-modal').filter({ hasText: 'Назначить перевозчика и водителя' });

        await expect(окно.getByText('Кто везёт:')).toBeVisible();
        await expect(окно.getByText(перевозчики.get(рейс.subForwarderId)!, { exact: true })).toBeVisible();
        await expect(окно.locator('.ant-steps-item-process')).toContainText('Водитель');
        await expect(окно.getByText('Кто выполняет перевозку?')).toHaveCount(0);
        await expect(окно.locator('.ant-select-selector').filter({ hasText: /Выберите водителя из базы|\(\+?\d/ })).toBeVisible();
    });

    test('рейс в пути: водителя можно сменить — окно предупреждает, что статус останется', async ({ page }) => {
        // Машина сломалась в дороге — водителя меняют. Раньше «Заменить
        // водителя» на выехавшем рейсе отвечало «Нельзя назначить водителя на
        // эту заявку». Окно только открываем — ничего не сохраняем.
        await login(page);
        const внешние: any[] = await (await page.request.get(`${API}/external-companies`)).json();
        const перевозчики = new Set(внешние.filter((к) => к.isCarrier).map((к) => к.id));
        const заявки: any[] = (await (await page.request.get(
            `${API}/company/orders?page=1&limit=100&type=active`,
        )).json()).data ?? [];
        const вПути = заявки.find((з) =>
            ['EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'].includes(з.status)
            && перевозчики.has(з.subForwarderId)
            // Окно назначения само пишет перевозчика и в partnerId — это тот же перевозчик.
            && (!з.partnerId || з.partnerId === з.subForwarderId)
            && (з.assignedDriverName || з.driverId));
        test.skip(!вПути, 'на стенде нет рейса в пути у внешнего перевозчика');

        await page.goto(`/company/orders/${вПути.id}`);
        await page.getByRole('button', { name: 'Заменить водителя' }).click();
        const окно = page.locator('.ant-modal').filter({ hasText: 'Назначить перевозчика и водителя' });

        await expect(окно.getByTestId('replace-on-road')).toContainText('статус останется прежним');
        await expect(окно.locator('.ant-steps-item-process')).toContainText('Водитель');
    });

    test('в завершённом рейсе водителя не меняют — кнопки нет', async ({ page }) => {
        await login(page);
        const заявки: any[] = (await (await page.request.get(
            `${API}/company/orders?page=1&limit=100&type=active`,
        )).json()).data ?? [];
        const завершённый = заявки.find((з) => з.status === 'COMPLETED' && (з.assignedDriverName || з.driverId));
        test.skip(!завершённый, 'на стенде нет завершённого рейса с водителем');

        await page.goto(`/company/orders/${завершённый.id}`);
        // Водитель — первой колонкой панели над вкладками (вариант 5, 31.10.2026).
        await expect(page.getByRole('region', { name: 'Водитель, стороны и деньги рейса' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Заменить водителя' })).toHaveCount(0);
    });

    test('по госномеру водитель тоже находится', async ({ page }) => {
        await login(page);
        const водители = await база(page);
        const сМашиной = водители.find((в) => в.vehiclePlate);
        test.skip(!сМашиной, 'на стенде нет водителя с госномером');

        await page.goto('/company/orders/create');
        await pickInCombo(page, 'no-customer', 0);
        await pickInCombo(page, 'no-carrier', 0);
        const выбор = page.locator('#no-driver');
        test.skip(await выбор.count() === 0, 'у первого перевозчика водителя назначают сами (он на платформе)');

        // Госномер набирают прямо в поле водителя — выпадашка ищет и по нему.
        await выбор.click();
        await page.keyboard.type(String(сМашиной.vehiclePlate).slice(0, 5));
        const список = page.locator('#no-driver-list');
        const нашёлся = список.locator('[data-combo-option]').filter({ hasText: сМашиной.lastName }).first();
        // В выпадашке — шесть строк; если водителя там нет, он должен быть в справочнике.
        if (!(await нашёлся.isVisible())) {
            await список.getByRole('option', { name: /базу водителей/ }).click();
            const окно = page.locator('[data-list-picker]');
            await expect(окно.getByRole('textbox', { name: 'Поиск' })).toHaveValue(String(сМашиной.vehiclePlate).slice(0, 5));
            await expect(окно.locator('[data-picker-option]').filter({ hasText: сМашиной.lastName }).first()).toBeVisible();
            return;
        }
        await expect(нашёлся).toBeVisible();
    });
});
