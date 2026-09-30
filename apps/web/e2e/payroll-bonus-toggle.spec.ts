import { test, expect } from '@playwright/test';

/**
 * Зарплата: ведомость, список сотрудников с галочками и условия рядом.
 *
 * Решения владельца (30.09.2026), которые здесь проверяются:
 *   — зарплату назначают из списка сотрудников с галочками, а не в
 *     маленьком окне; условия отмеченных — в панели рядом;
 *   — деления на «общие» и «свои» условия нет: у каждого свои цифры;
 *   — бонус за план включается галочкой: поля появляются только после неё.
 *
 * Тесты ничего не сохраняют: стенд CI общий для всех проверок.
 */

test('«Назначить зарплату»: отмеченные в списке получают поля условий', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/company/payroll');

    await page.getByRole('button', { name: 'Назначить зарплату' }).click({ timeout: 60_000 });
    const panel = page.getByRole('complementary', { name: 'Условия выбранных' });
    await expect(panel.getByText('Кому назначить зарплату?')).toBeVisible({ timeout: 60_000 });

    // Курсор сразу в поиске — можно печатать имя.
    await expect(page.getByLabel('Поиск сотрудника')).toBeFocused();

    // Деления на «общие» и «свои» больше нет ни в списке, ни в панели.
    await expect(page.getByText('Общие условия')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Как у всех' })).toHaveCount(0);

    const boxes = page.getByRole('checkbox', { name: /^Выбрать: / });
    await expect(boxes.first()).toBeVisible();
    const count = await boxes.count();

    await boxes.first().click();
    await expect(panel.getByRole('checkbox', { name: 'Платить оклад' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Сохранить' })).toBeVisible();

    if (count > 1) {
        await boxes.nth(1).click();
        await expect(panel.getByText('Выбрано сотрудников: 2')).toBeVisible();
        await expect(panel.getByRole('button', { name: 'Назначить 2 сотрудникам' })).toBeVisible();
    }

    await panel.getByRole('button', { name: 'Снять выбор' }).click();
    await expect(panel.getByText('Кому назначить зарплату?')).toBeVisible();
});

test('бонус за план: поля появляются только после галочки', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/company/payroll');
    await page.getByRole('button', { name: 'Условия оплаты' }).click({ timeout: 60_000 });

    const panel = page.getByRole('complementary', { name: 'Условия выбранных' });
    const boxes = page.getByRole('checkbox', { name: /^Выбрать: / });
    await expect(boxes.first()).toBeVisible({ timeout: 60_000 });
    await boxes.first().click();

    const bonus = panel.getByRole('checkbox', { name: 'Бонус за план по рейсам' });
    const amount = panel.getByLabel('Сумма бонуса');
    await expect(bonus).toBeVisible();

    // Бонус уже назначен — поля стоят сразу; снимать чужой не будем.
    if (await bonus.isChecked()) {
        await expect(amount).toBeVisible();
    } else {
        await expect(amount).toHaveCount(0);
        await bonus.click();
        await expect(amount).toBeVisible();
        await expect(panel.getByLabel('Рейсов за месяц')).toBeVisible();
        await bonus.click();
        await expect(amount).toHaveCount(0);
    }

    // Ничего не сохраняем.
    await panel.getByRole('button', { name: 'Отмена' }).click();
    await expect(panel.getByText('Кому назначить зарплату?')).toBeVisible();
});

/**
 * Ведомость: кому и сколько — и карточка сотрудника по нажатию.
 *
 * Раньше страница открывалась на схемах и формах, а итог по людям прятался
 * во второй вкладке без расшифровки. Проверяем, что ведомость — первое, что
 * видно, и что нажатие на человека открывает его начисления.
 */
test('ведомость открывается первой, строка ведёт в карточку сотрудника', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/company/payroll');

    await expect(page.getByText('К выплате за месяц')).toBeVisible({ timeout: 60_000 });
    const firstRow = page.getByRole('row', { name: /Открыть начисления/ }).first();
    await expect(firstRow).toBeVisible();
    // Что строка нажимается, подсказано прямо над таблицей.
    await expect(page.getByText('Нажмите на сотрудника — откроется, за какие рейсы начислено')).toBeVisible();

    await firstRow.click();
    const card = page.getByRole('dialog');
    await expect(card).toBeVisible();
    await expect(card.getByText('Проценты по рейсам')).toBeVisible();
    await expect(card.getByText(/Как платим/)).toBeVisible();

    // Бонус за план назначен — видно, за какие рейсы, или что их пока нет.
    if (await card.getByText('Бонус за план').count() > 0) {
        await expect(card.getByText(/Рейсы в зачёт плана · \d+|Завершённых рейсов в этом месяце пока нет/)).toBeVisible();
    }
});
