import { expect, test, type Page } from '@playwright/test';
import { login, pickAntOption } from './helpers';

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
        await pickAntOption(page, 'Выберите заказчика', 0);
        await page.locator('.ant-select-selector').filter({ hasText: 'Выберите перевозчика' }).first().click();
        await page.locator('.ant-select-item-option:visible').filter({ hasText: перевозчик.name }).first().click();
        await page.waitForTimeout(600);

        const выбор = page.locator('.ant-select-selector').filter({ hasText: 'Выберите водителя из базы' }).first();
        await выбор.click();

        // Список длинный и прокручивается, поэтому ищем по фамилии — так же,
        // как диспетчер. Находиться должны и прописанные у других ИП.
        for (const в of водители.slice(0, 3)) {
            await page.keyboard.press('Control+A');
            await page.keyboard.type(в.lastName);
            await expect(
                page.locator('.ant-select-item-option:visible').filter({ hasText: в.lastName }).first(),
                `водитель ${в.lastName} (прописан у «${в.companyName}») не нашёлся в заявке «${перевозчик.name}»`,
            ).toBeVisible();
        }

        // «Добавить нового» на виду при любом поиске: не нашёл — сразу заводит.
        await expect(
            page.locator('.ant-select-item-option:visible').filter({ hasText: 'Добавить нового водителя' }),
        ).toBeVisible();
    });

    test('по госномеру водитель тоже находится', async ({ page }) => {
        await login(page);
        const водители = await база(page);
        const сМашиной = водители.find((в) => в.vehiclePlate);
        test.skip(!сМашиной, 'на стенде нет водителя с госномером');

        await page.goto('/company/orders/create');
        await pickAntOption(page, 'Выберите заказчика', 0);
        await pickAntOption(page, 'Выберите перевозчика', 0);
        const выбор = page.locator('.ant-select-selector').filter({ hasText: 'Выберите водителя из базы' });
        test.skip(await выбор.count() === 0, 'у первого перевозчика водителя назначают сами (он на платформе)');

        await выбор.first().click();
        await page.keyboard.type(String(сМашиной.vehiclePlate).slice(0, 5));
        await expect(
            page.locator('.ant-select-item-option:visible').filter({ hasText: сМашиной.lastName }).first(),
        ).toBeVisible();
    });
});
