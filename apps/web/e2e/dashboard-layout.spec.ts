import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Дашборд-конструктор (макет владельца «LogiCore на shadcn Nova», 07.10.2026).
 *
 * Ломается он молча: блоки на месте, а перетаскивание, свёртка или
 * «Вернуть» не работают, или ряд встаёт лесенкой. Поэтому проверяем то, что
 * делает человек руками, и то, что видно глазом, — положение и размеры, а не
 * содержимое: данные на стенде бывают любыми.
 */

const LAYOUT_KEY = 'lc_dashboard_layout_v2';

async function открыть(page: Page) {
    await page.goto('/company');
    await expect(page.locator('[data-widget="chart"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
}

test.describe('Дашборд-конструктор', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // Расстановка живёт в браузере — каждый тест начинает с макетной.
        await page.evaluate((k) => localStorage.removeItem(k), LAYOUT_KEY);
    });

    test('по умолчанию — расстановка из макета', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        for (const kpi of ['inWork', 'pending', 'problems', 'ordersMonth', 'revenue']) {
            await expect(page.locator(`[data-kpi="${kpi}"]`)).toBeVisible();
        }
        for (const block of ['Выручка и маржа по неделям', 'Календарь погрузок', 'Ближайшие погрузки', 'Требуют внимания', 'Активность']) {
            await expect(page.getByRole('heading', { name: block, exact: true })).toBeVisible();
        }
        const ряды = await page.locator('[data-row]').evaluateAll((rows) =>
            rows.map((r) => Array.from(r.querySelectorAll('[data-drop-area]')).map((x) => x.getAttribute('data-drop-area')).join(',')));
        expect(ряды.slice(0, 3)).toEqual([
            'inWork,pending,problems,ordersMonth,revenue',
            'chart,calendar',
            'upcoming,attention',
        ]);
    });

    test('блоки одного ряда — одной высоты, края совпадают', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await открыть(page);
        const разброс = await page.locator('[data-row]').evaluateAll((rows) => rows.map((r) => {
            const boxes = Array.from(r.querySelectorAll('[data-drop-area]')).map((x) => x.getBoundingClientRect());
            const tops = boxes.map((b) => b.top);
            const heights = boxes.map((b) => b.height);
            return Math.max(Math.max(...tops) - Math.min(...tops), Math.max(...heights) - Math.min(...heights));
        }));
        for (const d of разброс) expect(d, 'в ряду блоки стоят лесенкой').toBeLessThanOrEqual(1);
    });

    test('ширину блока тянут мышкой за правый край', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const до = (await page.locator('[data-drop-area="chart"]').boundingBox())!;
        const край = (await page.locator('[data-handle-for="chart"]').boundingBox())!;
        await page.mouse.move(край.x + край.width / 2, край.y + край.height / 2);
        await page.mouse.down();
        await page.mouse.move(край.x - 200, край.y + край.height / 2, { steps: 10 });
        await page.mouse.up();
        const после = (await page.locator('[data-drop-area="chart"]').boundingBox())!;
        expect(до.width - после.width).toBeGreaterThan(100);
    });

    /**
     * Ряды «перетекают», как слова в тексте (владелец, 08.10.2026): сузил —
     * блок из ряда ниже поднялся; расширил — последний ушёл вниз.
     */
    test('сузил блок — блок снизу поднялся в ряд; расширил — ушёл обратно', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const ряд = (id: string) => page.locator(`[data-drop-area="${id}"]`).evaluate((el) =>
            Array.from(el.closest('[data-row]')!.querySelectorAll('[data-drop-area]')).map((x) => x.getAttribute('data-drop-area')));
        expect(await ряд('upcoming')).toEqual(['upcoming', 'attention']);

        const поле = (await page.locator('[data-dashboard-field]').boundingBox())!;
        const колонка = поле.width / 60;
        const тянуть = async (dx: number) => {
            const к = (await page.locator('[data-handle-for="upcoming"]').boundingBox())!;
            await page.mouse.move(к.x + к.width / 2, к.y + к.height / 2);
            await page.mouse.down();
            await page.mouse.move(к.x + к.width / 2 + dx, к.y + к.height / 2, { steps: 15 });
            await page.mouse.up();
        };

        await тянуть(-18 * колонка);
        expect(await ряд('upcoming')).toEqual(['upcoming', 'attention', 'activity']);

        await тянуть(18 * колонка);
        expect(await ряд('upcoming')).toEqual(['upcoming', 'attention']);
        expect((await ряд('activity'))[0]).toBe('activity');
    });

    test('«Убрать» — с кнопкой «Вернуть», и расстановка запоминается', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await открыть(page);
        await page.locator('[data-widget="upcoming"]').getByRole('button', { name: 'Действия с блоком' }).click();
        await page.getByRole('menuitem', { name: 'Убрать с дашборда' }).click();
        await expect(page.locator('[data-widget="upcoming"]')).toHaveCount(0);

        await page.locator('[data-sonner-toast] button', { hasText: 'Вернуть' }).click();
        await expect(page.locator('[data-widget="upcoming"]')).toHaveCount(1);

        // Убираем снова — и после перезагрузки блока нет: выбор запомнился.
        await page.locator('[data-widget="upcoming"]').getByRole('button', { name: 'Действия с блоком' }).click();
        await page.getByRole('menuitem', { name: 'Убрать с дашборда' }).click();
        await page.reload();
        await expect(page.locator('[data-widget="chart"]')).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('[data-widget="upcoming"]')).toHaveCount(0);
    });

    test('«Блоки»: добавить блок новым рядом снизу и вернуть как было', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await открыть(page);
        await page.getByRole('button', { name: /^Блоки/ }).click();
        await page.getByLabel('Добавить «Последние события»').click();
        await page.getByRole('menuitem', { name: 'Снизу' }).click();
        await expect(page.locator('[data-widget="events"]')).toHaveCount(1);

        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: /^Блоки/ }).click();
        await page.getByRole('button', { name: 'Как было' }).click();
        await expect(page.locator('[data-widget="events"]')).toHaveCount(0);
    });

    test('блок сворачивается вбок и разворачивается', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await открыть(page);
        await page.locator('[data-widget="attention"]').getByRole('button', { name: 'Свернуть блок' }).click();
        const полоска = page.getByRole('button', { name: 'Развернуть блок «Требуют внимания»' });
        await expect(полоска).toBeVisible();
        const w = (await page.locator('[data-drop-area="attention"]').boundingBox())!.width;
        expect(w, 'свёрнутый блок не сузился').toBeLessThan(120);
        await полоска.click();
        await expect(page.getByRole('heading', { name: 'Требуют внимания', exact: true })).toBeVisible();
    });

    test('перетаскивание: блок встаёт слева от того, на что навели', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await page.locator('[data-grip="attention"]').dragTo(page.locator('[data-drop-area="upcoming"]'), { targetPosition: { x: 20, y: 150 } });
        const ряд = await page.locator('[data-drop-area="upcoming"]').evaluate((el) =>
            Array.from(el.closest('[data-row]')!.querySelectorAll('[data-drop-area]')).map((x) => x.getAttribute('data-drop-area')));
        // «Требуют внимания» встал перед погрузками — в том же ряду.
        expect(ряд).toEqual(['attention', 'upcoming']);
    });

    test('на телефоне ничего не уезжает вбок, блоки идут друг под другом', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await открыть(page);
        const вбок = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(вбок, 'страница прокручивается вбок').toBe(0);
        const график = (await page.locator('[data-widget="chart"]').boundingBox())!;
        const календарь = (await page.locator('[data-widget="calendar"]').boundingBox())!;
        expect(календарь.y, 'календарь не под графиком').toBeGreaterThan(график.y + график.height - 1);
    });
});
