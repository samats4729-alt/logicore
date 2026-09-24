import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Страница «Водители» — все водители компании в одном месте.
 *
 * Раньше учёта водителей не было: штатные жили в «Сотрудниках», водители ИП —
 * в карточках перевозчиков, а человека со своей фурой без ИП завести было
 * некуда. Проверяем то, ради чего страница сделана: нештатного без ИП можно
 * добавить, он виден в общем списке и находится в заявке.
 */

const API = process.env.E2E_API_URL || 'http://localhost:3001';

test.describe('Водители', () => {
    test('нештатный без ИП добавляется, виден в списке и находится в заявке', async ({ page }) => {
        await login(page);
        await page.goto('/company/drivers');
        await expect(page.getByRole('heading', { name: 'Водители' })).toBeVisible();

        // Номер на каждый прогон свой: стенд общий, и двойник по телефону
        // пришёл бы как «уже был в списке» вместо нового водителя.
        const хвост = String(Date.now()).slice(-7);
        const телефон = `+7 709 ${хвост.slice(0, 3)} ${хвост.slice(3, 5)} ${хвост.slice(5)}`;
        const фамилия = `Проверкин${хвост}`;

        await page.getByRole('button', { name: 'Добавить водителя' }).first().click();
        const окно = page.getByRole('dialog');
        await expect(окно.getByRole('radio', { name: /Нештатный/ })).toHaveAttribute('aria-checked', 'true');

        const поле = (подпись: string) => окно.locator('label', { hasText: подпись }).locator('xpath=..').locator('input').first();
        await поле('Фамилия').fill(фамилия);
        await поле('Имя').fill('Тест');
        await поле('Телефон').fill(телефон);
        await поле('Госномер тягача').fill('900 TST 02');
        await окно.getByRole('button', { name: 'Добавить' }).click();

        await expect(page.getByText('Водитель добавлен')).toBeVisible();
        const строка = page.locator('tbody tr', { hasText: фамилия });
        await expect(строка).toBeVisible();
        await expect(строка).toContainText('Нештатный');
        await expect(строка).toContainText('без перевозчика');

        // В общем списке, из которого выбирают водителя в заявке, он есть.
        const база: any[] = await (await page.request.get(`${API}/company/drivers/pool`)).json();
        const он = база.find((в) => в.lastName === фамилия);
        expect(он, 'нештатного нет в общем списке для заявок').toBeTruthy();
        expect(он.kind).toBe('INDEPENDENT');

        // Убираем за собой: стенд общий.
        await строка.click();
        await окно.getByRole('button', { name: 'Убрать из списка' }).click();
        await окно.getByRole('button', { name: 'Убрать', exact: true }).click();
        await expect(page.locator('tbody tr', { hasText: фамилия })).toHaveCount(0);
    });

    test('отбор «Штатные» и «Нештатные» делит список без остатка', async ({ page }) => {
        await login(page);
        await page.goto('/company/drivers');
        const вкладка = (имя: RegExp) => page.getByRole('tab', { name: имя });
        await expect(вкладка(/Все/)).toBeVisible();

        const число = async (имя: RegExp) => Number((await вкладка(имя).innerText()).replace(/\D/g, ''));
        const все = await число(/Все/);
        const штатные = await число(/^Штатные/);
        const нештатные = await число(/Нештатные/);
        expect(штатные + нештатные).toBe(все);
    });

    test('в кабинете пункт «Водители» ведёт на общий список', async ({ page }) => {
        await login(page);
        await page.goto('/company/cabinet');
        await page.getByText('Штатные и нештатные — все, кто возит рейсы').click();
        await expect(page).toHaveURL(/\/company\/drivers/);
        await expect(page.getByRole('heading', { name: 'Водители' })).toBeVisible();
    });
});
