import { test, expect } from '@playwright/test';

/**
 * Переключатель карточки рейса на «Заявках».
 *
 * Первая версия была серой строкой со стрелочкой — владелец смотрел прямо
 * на неё и не понял, чем свернулась карточка. Поэтому проверяем не факт
 * существования кнопки, а то, что она читается как кнопка: понятная
 * подпись и видимая рамка.
 */
test('карточку рейса можно свернуть и развернуть', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/company/orders');
    await page.waitForTimeout(2500);

    const toggle = page.locator('.lc2-featured-toggle');
    await expect(toggle).toBeVisible();

    // Подпись говорит, что произойдёт, а не как называется блок.
    await expect(toggle).toContainText(/Показать карточку рейса|Скрыть карточку рейса/);

    // Рамка — то, по чему элемент опознаётся как нажимаемый.
    const border = await toggle.evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(parseFloat(border)).toBeGreaterThan(0);

    const wasOpen = (await toggle.innerText()).includes('Скрыть');
    await toggle.click();
    await page.waitForTimeout(400);
    await expect(toggle).toContainText(wasOpen ? 'Показать' : 'Скрыть');

    // Выбор переживает перезагрузку: логист открывает экран десятки раз в день.
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.locator('.lc2-featured-toggle'))
        .toContainText(wasOpen ? 'Показать' : 'Скрыть');
});
