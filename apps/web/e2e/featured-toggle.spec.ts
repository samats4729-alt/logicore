import { test, expect } from '@playwright/test';

/**
 * Сворачивание карточки рейса на «Заявках».
 *
 * Первая версия была серой строкой со стрелочкой над карточкой — владелец
 * смотрел прямо на неё и не понял, чем свернулась карточка. Полосу убрали
 * по согласованному эталону `design/orders-list`: стрелка переехала в шапку
 * самой карточки, туда, где она и управляет.
 *
 * Проверяем не разметку, а то, что органом управления можно пользоваться:
 * у него есть понятное имя, он переключает состояние и помнит выбор.
 */
test('карточку рейса можно свернуть и развернуть', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/company/orders');
    await page.waitForTimeout(2500);

    const toggle = page.getByRole('button', { name: /карточку рейса/ });
    await expect(toggle).toBeVisible();

    // Свёрнута карточка или развёрнута — видно из имени кнопки, а не из
    // догадок по разметке.
    const wasCollapsed = (await toggle.getAttribute('aria-label'))?.includes('Развернуть');
    await toggle.click();
    await page.waitForTimeout(400);
    await expect(page.getByRole('button', { name: wasCollapsed ? /Свернуть карточку рейса/ : /Развернуть карточку рейса/ }))
        .toBeVisible();

    // Выбор переживает перезагрузку: логист открывает экран десятки раз в день.
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.getByRole('button', { name: wasCollapsed ? /Свернуть карточку рейса/ : /Развернуть карточку рейса/ }))
        .toBeVisible();
});
