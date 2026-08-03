import { test, expect } from '@playwright/test';

/**
 * Экран «Документы» в кабинете.
 *
 * До этого он был заготовкой: таблица держала пустой список прямо в коде,
 * поиск и фильтры ни к чему не были подключены. Экран выглядел рабочим и
 * всегда сообщал «нет загруженных документов» — даже когда накладные к
 * рейсам вкладывали каждый день. Бухгалтер из-за этого шла за накладной к
 * логисту.
 *
 * Поэтому проверяем не разметку, а то, что экран действительно спрашивает
 * данные и что отбор доходит до запроса: именно этого и не было.
 */

const DOCUMENTS_REQUEST = /\/documents(\?|$)/;

test('экран документов берёт список из системы, а не показывает заглушку', async ({ page }) => {
    test.setTimeout(120_000);

    const request = page.waitForRequest(
        (r) => DOCUMENTS_REQUEST.test(r.url()) && r.method() === 'GET',
        { timeout: 30_000 },
    );
    await page.goto('/company/documents');
    await request;

    await expect(page.getByRole('heading', { name: 'Документы' })).toBeVisible();

    // Либо список, либо честное объяснение пустоты — но не молчаливая пустота.
    const rows = page.locator('tbody tr');
    await expect(async () => {
        const hasRows = await rows.count() > 0;
        const hasExplanation = await page.getByText(/Пока ничего не вложено|По этому отбору ничего нет/).count() > 0;
        expect(hasRows || hasExplanation).toBe(true);
    }).toPass({ timeout: 20_000 });
});

test('вид документа и поиск доходят до запроса', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/company/documents');
    await page.waitForTimeout(2000);

    const byType = page.waitForRequest(
        (r) => DOCUMENTS_REQUEST.test(r.url()) && r.url().includes('type=TTN'),
        { timeout: 20_000 },
    );
    await page.getByRole('button', { name: 'Накладные' }).click();
    await byType;

    // Ищут накладную по заказчику и городу, а не по номеру заявки —
    // ради этого поиск и уехал на сервер.
    const bySearch = page.waitForRequest(
        (r) => DOCUMENTS_REQUEST.test(r.url()) && r.url().includes('search='),
        { timeout: 20_000 },
    );
    await page.getByPlaceholder(/Заказчик/).fill('Алматы');
    await bySearch;
});
