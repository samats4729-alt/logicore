import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Раскладка дашборда (просьба владельца от 23.09.2026: «равновесие
 * нарушено… один выше другого… активность на всю ширину длинный»).
 *
 * Ломается она молча: разметка на месте, данные на месте, а карточки снова
 * стоят лесенкой — и замечает это владелец, а не проверки. Поэтому здесь
 * проверяется то, что видно глазом, — положение и размеры карточек, а не
 * их содержимое.
 *
 * Данные на стенде бывают любыми (чеки и входящие счета появляются только
 * когда они есть), поэтому проверки не расписывают, какой блок где стоит, —
 * только правила: края в ряду совпадают, активность не во всю ширину,
 * тариф в ряду плиток.
 */

/** Карточки блоков дашборда — дети той же сетки, что и «Активность». */
async function карточки(page: Page) {
    const активность = page.locator('section', { has: page.getByRole('heading', { name: 'Активность', exact: true }) });
    await expect(активность).toBeVisible();
    // Ждём, пока блоки догрузятся: до ответа сервера карточки ниже и
    // сравнивать их края рано.
    await expect(активность.locator('table')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const сетка = активность.locator('xpath=..');
    return { активность, сетка, блоки: сетка.locator(':scope > section') };
}

test.describe('Раскладка дашборда', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // Свёрнутые блоки живут в браузере — начинаем с полного набора.
        await page.evaluate(() => localStorage.setItem('lc_dashboard_hidden_blocks', '[]'));
    });

    test('на мониторе карточки одного ряда кончаются на одной высоте', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/company');
        const { блоки } = await карточки(page);

        const рамки = await блоки.evaluateAll((els) => els.map((el) => {
            const r = el.getBoundingClientRect();
            return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
        }));
        expect(рамки.length).toBeGreaterThan(1);

        // Ряд — карточки с общим верхним краем. Нижние края у них обязаны
        // совпасть: лесенка из карточек разной высоты и была жалобой.
        const ряды = new Map<number, number[]>();
        for (const { top, bottom } of рамки) {
            ряды.set(top, [...(ряды.get(top) ?? []), bottom]);
        }
        for (const [top, низы] of Array.from(ряды.entries())) {
            const разброс = Math.max(...низы) - Math.min(...низы);
            expect(разброс, `в ряду с верхом ${top} карточки разной высоты: ${низы.join(', ')}`).toBeLessThanOrEqual(1);
        }
    });

    test('«Активность» занимает две трети ряда, а не всю ширину', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/company');
        const { активность, сетка } = await карточки(page);

        const ширинаСетки = (await сетка.boundingBox())!.width;
        const ширина = (await активность.boundingBox())!.width;
        const доля = ширина / ширинаСетки;
        expect(доля, `активность заняла ${Math.round(доля * 100)}% ряда`).toBeGreaterThan(0.6);
        expect(доля, `активность заняла ${Math.round(доля * 100)}% ряда`).toBeLessThan(0.7);
    });

    test('шапки всех блоков одного вида', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/company');
        const { блоки } = await карточки(page);

        // Раньше у половины блоков был свой заголовок — крупный жирный на
        // белом, у другой половины серая полоса. Сравниваем вычисленный
        // стиль, а не классы: у сломанной шапки разметка правильная.
        const виды = await блоки.evaluateAll((els) => els.map((el) => {
            const h = el.querySelector('h2');
            const шапка = h?.parentElement;
            if (!h || !шапка) return 'нет шапки';
            const t = getComputedStyle(h);
            const s = getComputedStyle(шапка);
            return [t.fontFamily, t.fontSize, t.fontWeight, s.backgroundColor, s.borderBottomWidth].join(' | ');
        }));
        expect(new Set(виды).size, `шапки различаются:\n${виды.join('\n')}`).toBe(1);
        expect(виды[0]).not.toBe('нет шапки');
    });

    test('тариф — плиткой в ряду показателей, а не отдельной полосой', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/company');

        const тариф = page.getByText('Тариф', { exact: true }).locator('xpath=../..');
        const вРаботе = page.getByText('Сейчас в работе', { exact: true }).locator('xpath=../..');
        await expect(тариф).toBeVisible();
        await expect(вРаботе).toBeVisible();

        const a = (await тариф.boundingBox())!;
        const b = (await вРаботе.boundingBox())!;
        expect(Math.abs(a.y - b.y), 'тариф стоит не в ряду плиток').toBeLessThanOrEqual(1);
        expect(Math.abs(a.height - b.height), 'тариф другой высоты, чем соседние плитки').toBeLessThanOrEqual(1);
    });

    test('на телефоне ничего не уезжает вбок, а активность видна целиком', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/company');
        const { активность } = await карточки(page);

        const вбок = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(вбок, 'страница прокручивается вбок').toBe(0);

        // Раньше за краем таблицы оставались этот месяц и динамика — ровно
        // то, ради чего в неё смотрят. Теперь шапки столбцов нет, а каждая
        // строка складывается вдвое и помещается в карточку.
        await expect(активность.locator('thead')).toBeHidden();
        const влезает = await активность.locator('tbody tr').evaluateAll((rows) => rows.every((tr) => {
            const r = tr.getBoundingClientRect();
            const card = tr.closest('section')!.getBoundingClientRect();
            return r.right <= card.right + 0.5 && tr.scrollWidth <= tr.clientWidth + 1;
        }));
        expect(влезает, 'строка активности не помещается в карточку').toBe(true);
    });

    test('«Настроить» сворачивает блок и помнит выбор', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/company');
        await карточки(page);

        await page.getByRole('button', { name: 'Настроить' }).click();
        const галочка = page.getByRole('checkbox', { name: 'Последние события' });
        await expect(галочка).toBeVisible();

        // Квадратная, а не круглая: круг читается как «выбрать одно из».
        const радиус = await галочка.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
        expect(радиус, 'галочка в настройках круглая').toBeLessThanOrEqual(5);

        await галочка.click();
        await expect(page.getByRole('heading', { name: 'Последние события' })).toHaveCount(0);
        expect(await page.evaluate(() => localStorage.getItem('lc_dashboard_hidden_blocks'))).toContain('events');

        await галочка.click();
        await expect(page.getByRole('heading', { name: 'Последние события' })).toBeVisible();
    });
});
