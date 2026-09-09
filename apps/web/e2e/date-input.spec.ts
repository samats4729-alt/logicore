import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Дату набирают с клавиатуры, разделители поле ставит само.
 *
 * Раньше поле подписывалось «Выберите дату» и вело себя буквально так:
 * набранное повисало в поле, но в форму не попадало, пока не нажмёшь Enter
 * или не уйдёшь из поля. Человек печатал «20.05.2026», видел дату перед
 * собой, сохранял — и получал «укажите дату». А в части мест формат вообще
 * не был задан, и точки там не понимались.
 *
 * Потом владелец уточнил главное: точку не должен жать человек. «Ввёл 25 —
 * точка сама поставилась, ввёл 12 — снова сама». Восемь нажатий на всю
 * дату, и ни разу не надо искать точку — на цифровой части клавиатуры её
 * нет вовсе, там запятая.
 *
 * Проверяем поведение, а не разметку: что разделители появляются вовремя и
 * что набранное действительно встало в форму. Признак второго — Escape: он
 * откатывает неподтверждённый набор, и если после него дата на месте,
 * значит она уже записана.
 */

/** Нажать цифры по одной — так же, как это делает человек. */
async function цифрами(page: Page, поле: Locator, цифры: string) {
    await поле.click();
    await поле.press('Control+a');
    await поле.press('Delete');
    for (const цифра of цифры) await page.keyboard.press(цифра);
}

test('точки расставляются сами: человек жмёт только цифры', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/accounting/invoices/create');
    const поле = page.locator('.ant-picker input').first();
    await expect(поле).toBeVisible({ timeout: 30_000 });

    // Подпись поля говорит, что можно печатать, и в каком порядке.
    await expect(поле).toHaveAttribute('placeholder', 'ДД.ММ.ГГГГ');

    await поле.click();
    await поле.press('Control+a');
    await поле.press('Delete');

    // Точка появляется сразу, как только группа заполнена, а не с приходом
    // следующей цифры: иначе поле выглядит подтормаживающим.
    await page.keyboard.press('2');
    await expect(поле).toHaveValue('2');
    await page.keyboard.press('5');
    await expect(поле).toHaveValue('25.');
    await page.keyboard.press('1');
    await expect(поле).toHaveValue('25.1');
    await page.keyboard.press('2');
    await expect(поле).toHaveValue('25.12.');

    for (const цифра of '2026') await page.keyboard.press(цифра);
    await expect(поле).toHaveValue('25.12.2026');

    // И дата встала в форму, без Enter и не уходя из поля.
    await поле.press('Escape');
    await expect(поле).toHaveValue('25.12.2026');
});

test('точку можно стереть, она не возвращается сама', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/accounting/invoices/create');
    const поле = page.locator('.ant-picker input').first();
    await expect(поле).toBeVisible({ timeout: 30_000 });

    await цифрами(page, поле, '25122026');
    await expect(поле).toHaveValue('25.12.2026');

    // Если дописывать разделитель и при стирании, последнюю точку нельзя
    // убрать никогда: стёр — она тут же вернулась.
    for (const ожидаем of ['25.12.202', '25.12.20', '25.12.2', '25.12', '25.1']) {
        await поле.press('Backspace');
        await expect(поле).toHaveValue(ожидаем);
    }
});

test('точку можно нажать и самому — она не задваивается', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/accounting/invoices/create');
    const поле = page.locator('.ant-picker input').first();
    await expect(поле).toBeVisible({ timeout: 30_000 });

    // Привычка жать точку остаётся надолго, и поле не должно за неё
    // наказывать: своя точка уже стоит, набранную оно проглатывает.
    await поле.click();
    await поле.press('Control+a');
    await поле.press('Delete');
    await поле.pressSequentially('20.05.2026', { delay: 25 });
    await expect(поле).toHaveValue('20.05.2026');
});

test('несуществующая дата не подставляется', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/accounting/invoices/create');
    const поле = page.locator('.ant-picker input').first();
    await expect(поле).toBeVisible({ timeout: 30_000 });

    await цифрами(page, поле, '20052026');
    await expect(поле).toHaveValue('20.05.2026');

    // 31 февраля не бывает. Пока человек не ушёл из поля, набранное
    // остаётся перед глазами — но помечено ошибкой, а в форму не попало.
    await цифрами(page, поле, '31022026');
    await expect(поле).toHaveValue('31.02.2026');
    await expect(поле).toHaveAttribute('aria-invalid', 'true');

    // И это видно глазами, а не только разметкой: рамка красная. Без неё
    // отказ был беззвучным — человек видел свою дату, уходил из поля, и
    // она молча менялась на прежнюю.
    const пикер = page.locator('.ant-picker').first();
    await expect(async () => {
        const цвет = await пикер.evaluate((e) => getComputedStyle(e).borderColor);
        expect(цвет).toBe('rgb(255, 77, 79)');
    }).toPass({ timeout: 10_000 });

    // А как только из поля ушли — вернулась прежняя дата. Молча съехать
    // на третье марта поле не имеет права: дату в счёте потом никто не
    // перепроверит.
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await expect(поле).toHaveValue('20.05.2026');
});

test('в периоде «с — по» разделители ставятся в обоих полях', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/company/accounting/invoices');
    const поля = page.locator('.ant-picker-range input');
    await expect(поля.first()).toBeVisible({ timeout: 30_000 });

    await цифрами(page, поля.nth(0), '01012026');
    await expect(поля.nth(0)).toHaveValue('01.01.2026');

    await поля.nth(0).press('Enter');
    await цифрами(page, поля.nth(1), '31122026');
    await expect(поля.nth(1)).toHaveValue('31.12.2026');
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
    await цифрами(page, поле, '20052026');
    await запрос;
});
