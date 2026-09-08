import { test, expect } from '@playwright/test';

/**
 * Дату можно набрать руками.
 *
 * Раньше поле даты подписывалось «Выберите дату» и вело себя буквально
 * так: набранное с клавиатуры повисало в поле, но в форму не попадало,
 * пока не нажмёшь Enter или не уйдёшь из поля. Человек печатал «20.05.2026»,
 * видел дату перед собой, сохранял — и получал «укажите дату». А в части
 * мест формат вообще не был задан, и точки там не понимались.
 *
 * Проверяем не разметку, а именно это: что набранное действительно
 * встало. Признак — Escape: он откатывает неподтверждённый набор, и если
 * после него дата на месте, значит она уже в форме.
 */

/** Набрать дату и убедиться, что она осталась после Escape. */
async function набрать(поле: import('@playwright/test').Locator, текст: string) {
    await поле.click();
    await поле.press('Control+a');
    await поле.press('Delete');
    await поле.type(текст, { delay: 30 });
    await поле.press('Escape');
}

test('набранная дата встаёт сама, без Enter и без ухода из поля', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/accounting/invoices/create');
    const поле = page.locator('.ant-picker input').first();
    await expect(поле).toBeVisible({ timeout: 30_000 });

    // Подпись поля прямо говорит, что можно печатать, и в каком порядке.
    await expect(поле).toHaveAttribute('placeholder', 'ДД.ММ.ГГГГ');

    await набрать(поле, '20.05.2026');
    await expect(поле).toHaveValue('20.05.2026');
});

test('день и месяц можно писать одной цифрой, разделитель — любой привычный', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/accounting/invoices/create');
    const поле = page.locator('.ant-picker input').first();
    await expect(поле).toBeVisible({ timeout: 30_000 });

    // «1.5.2027» — так пишут в спешке; поле дописывает нули само.
    await набрать(поле, '1.5.2027');
    await expect(поле).toHaveValue('01.05.2027');

    // Запятая — она же на цифровой части клавиатуры, туда чаще и попадают.
    await набрать(поле, '20,05,2028');
    await expect(поле).toHaveValue('20.05.2028');
});

test('несуществующая дата не подставляется', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/accounting/invoices/create');
    const поле = page.locator('.ant-picker input').first();
    await expect(поле).toBeVisible({ timeout: 30_000 });

    await набрать(поле, '20.05.2026');
    await expect(поле).toHaveValue('20.05.2026');

    // 31 февраля не бывает: поле обязано остаться на прежней дате, а не
    // молча съехать на 3 марта.
    await набрать(поле, '31.02.2026');
    await expect(поле).toHaveValue('20.05.2026');
});

test('в отборе по датам набранное доходит до запроса', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/documents');
    const поле = page.locator('.ant-picker input').first();
    await expect(поле).toBeVisible({ timeout: 30_000 });

    // Здесь раньше стояло обычное браузерное поле: формат в нём задавал
    // браузер, и «20.05.2026» он принимал за мусор. Теперь поле наше, а
    // наружу по-прежнему уходит строка «2026-05-20».
    const запрос = page.waitForRequest(
        (r) => /\/documents\?/.test(r.url()) && r.url().includes('from=2026-05-20'),
        { timeout: 30_000 },
    );
    await набрать(поле, '20.05.2026');
    await запрос;
});
