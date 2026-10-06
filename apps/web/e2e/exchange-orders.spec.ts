import { test, expect } from '@playwright/test';

const API = process.env.E2E_API_URL || 'http://localhost:3001';

/**
 * Биржа на заявках: заявку без исполнителя выставляют на биржу из её
 * карточки, она появляется в «Мои на бирже», и её снимают с причиной.
 *
 * Биржа включается выключателем на сервере (EXCHANGE_ENABLED). Где он не
 * стоит — вкладки нет, и проверять нечего: тест пропускается, а не падает.
 * Так же — если на стенде нет ни одной заявки без исполнителя.
 */
test.describe('Биржа · заявки', () => {
    test('заявка без исполнителя выставляется на биржу и снимается с причиной', async ({ page }) => {
        test.setTimeout(150_000);
        await page.goto('/company');

        const tab = page.getByRole('button', { name: 'Биржа', exact: true });
        const enabled = await tab.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
        test.skip(!enabled, 'Биржа на этом сервере выключена');

        // Свободную заявку спрашиваем у самого сервера: он знает, кому её
        // можно выставить (экспедитору, пока исполнителя нет).
        const list = await page.request.get(`${API}/orders?status=PENDING&limit=50`);
        const body = await list.json();
        const orders: { id: string; orderNumber: string }[] = Array.isArray(body) ? body : body.data ?? [];
        let target: { id: string; orderNumber: string } | null = null;
        for (const o of orders) {
            const state = await page.request.get(`${API}/exchange/orders/${o.id}`);
            if (state.ok() && (await state.json()).canPublish) { target = o; break; }
        }
        test.skip(!target, 'На стенде нет заявки без исполнителя');

        await page.goto(`/company/orders/${target!.id}`);
        await page.getByRole('button', { name: 'Выставить на биржу' }).click();
        const publish = page.getByRole('dialog');
        await publish.getByLabel('Цена для исполнителя').fill('450000');
        await expect(publish.getByLabel('Цена для исполнителя')).toHaveValue('450 000');
        await publish.getByRole('button', { name: 'Выставить', exact: true }).click();
        await expect(page.getByText(/На бирже с .* за 450\s000/)).toBeVisible({ timeout: 30_000 });
        // Откликов ещё нет — так и сказано, а не пустое место (или уже есть список).
        await expect(page.getByText(/Откликов пока нет|Отклики ·/)).toBeVisible();

        // Своя заявка — во вкладке «Мои на бирже», не среди чужих.
        await page.goto('/company/exchange');
        await expect(page.getByRole('heading', { name: 'Биржа заявок', level: 1 })).toBeVisible({ timeout: 60_000 });
        await page.getByRole('tab', { name: /Мои на бирже/ }).click();
        await expect(page.getByText(target!.orderNumber).first()).toBeVisible();

        // Снять: вопрос, причина, и можно выставить снова.
        await page.goto(`/company/orders/${target!.id}`);
        await page.getByRole('button', { name: 'Снять с биржи' }).click();
        const close = page.getByRole('dialog');
        await close.getByRole('button', { name: 'Нашли исполнителя сами' }).click();
        await close.getByRole('button', { name: 'Снять с биржи' }).click();
        await expect(page.getByText(/Снята с биржи .* — Нашли исполнителя сами/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('button', { name: 'Выставить на биржу' })).toBeVisible();
    });
});
