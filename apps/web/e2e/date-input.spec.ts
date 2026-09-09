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

    // 31 февраля не бывает. Пока человек не ушёл из поля, набранное
    // остаётся перед глазами — но помечено ошибкой, а в форму не попало.
    await поле.click();
    await поле.press('Control+a');
    await поле.press('Delete');
    await поле.type('31.02.2026', { delay: 30 });
    await expect(поле).toHaveAttribute('aria-invalid', 'true');

    // И это видно глазами, а не только разметкой: рамка красная. Без неё
    // отказ был беззвучным — человек видел свою дату, уходил из поля, и
    // она молча менялась на прежнюю.
    const пикер = page.locator('.ant-picker').first();
    await expect(async () => {
        const цвет = await пикер.evaluate((e) => getComputedStyle(e).borderColor);
        expect(цвет).toBe('rgb(255, 77, 79)');
    }).toPass({ timeout: 10_000 });

    // И набранное не покалечено: перерисовка не должна съедать последнюю
    // цифру — иначе к неверной дате добавляется ещё и «поле само стирает».
    await expect(поле).toHaveValue('31.02.2026');

    // А как только из поля ушли — вернулась прежняя дата. Молча съехать
    // на третье марта поле не имеет права: дату в счёте потом никто не
    // перепроверит.
    await page.locator('body').click({ position: { x: 5, y: 400 } });
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
