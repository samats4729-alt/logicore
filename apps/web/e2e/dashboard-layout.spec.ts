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

const LAYOUT_KEY = 'lc_dashboard_layout_v5';

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

    /** Карточка не вылезает за свой ряд и не налезает на соседний (владелец, 08.10.2026). */
    test('блоки не налезают друг на друга — и после растягивания ряда', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const налезают = () => page.locator('[data-row]').evaluateAll((rows) => {
            const bad: string[] = [];
            for (const r of rows) {
                const rb = r.getBoundingClientRect();
                for (const card of Array.from(r.querySelectorAll('[data-widget]'))) {
                    const cb = card.getBoundingClientRect();
                    if (cb.bottom > rb.bottom + 1 || cb.top < rb.top - 1) bad.push(card.getAttribute('data-widget')!);
                }
            }
            return bad;
        });
        expect(await налезают()).toEqual([]);
        // Ряд с показателями тянем вниз и обратно вверх: плашки меняют вид, но из ряда не вылезают.
        const ручка = (await page.locator('[data-slot="row-handle"]').first().boundingBox())!;
        await page.mouse.move(ручка.x + ручка.width / 2, ручка.y + ручка.height / 2);
        await page.mouse.down();
        await page.mouse.move(ручка.x + ручка.width / 2, ручка.y + 260, { steps: 10 });
        await page.mouse.move(ручка.x + ручка.width / 2, ручка.y + 20, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        expect(await налезают()).toEqual([]);
    });

    /**
     * Ширина (владелец, 08.10.2026). Граница между блоками меняет только двух
     * соседей. Край ряда ужимает весь ряд, и блок снизу поднимается в
     * освободившееся место; потянул обратно — его выталкивает вниз.
     */
    test('граница между блоками меняет только двух соседей', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const ширина = async (id: string) => (await page.locator(`[data-drop-area="${id}"]`).boundingBox())!.width;
        const до = { chart: await ширина('chart'), calendar: await ширина('calendar'), upcoming: await ширина('upcoming') };
        const ручка = page.locator('[data-handle-for="chart"]');
        await expect(ручка).toHaveAttribute('data-handle-kind', 'divider');
        const к = (await ручка.boundingBox())!;
        await page.mouse.move(к.x + к.width / 2, к.y + к.height / 2);
        await page.mouse.down();
        await page.mouse.move(к.x + к.width / 2 - 200, к.y + к.height / 2, { steps: 10 });
        await page.mouse.up();
        expect(до.chart - (await ширина('chart'))).toBeGreaterThan(150);
        expect((await ширина('calendar')) - до.calendar).toBeGreaterThan(150);
        // Соседний ряд не тронут.
        expect(Math.abs((await ширина('upcoming')) - до.upcoming)).toBeLessThanOrEqual(1);
        const ряд = await page.locator('[data-drop-area="chart"]').evaluate((el) =>
            Array.from(el.closest('[data-row]')!.querySelectorAll('[data-drop-area]')).map((x) => x.getAttribute('data-drop-area')));
        expect(ряд).toEqual(['chart', 'calendar']);
    });

    test('край ряда: ужал — блок снизу поднялся, потянул обратно — ушёл вниз', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const ряд = (id: string) => page.locator(`[data-drop-area="${id}"]`).evaluate((el) =>
            Array.from(el.closest('[data-row]')!.querySelectorAll('[data-drop-area]')).map((x) => x.getAttribute('data-drop-area')));
        const ширина = async (id: string) => (await page.locator(`[data-drop-area="${id}"]`).boundingBox())!.width;
        expect(await ряд('upcoming')).toEqual(['upcoming', 'attention']);
        const до = { upcoming: await ширина('upcoming'), attention: await ширина('attention') };

        const поле = (await page.locator('[data-dashboard-field]').boundingBox())!;
        const колонка = поле.width / 120;
        const ручка = page.locator('[data-handle-for="attention"]');
        await expect(ручка).toHaveAttribute('data-handle-kind', 'edge');
        const к = (await ручка.boundingBox())!;
        const x0 = к.x + к.width / 2;
        const y0 = к.y + к.height / 2;
        await page.mouse.move(x0, y0);
        await page.mouse.down();
        await page.mouse.move(x0 - 36 * колонка, y0, { steps: 15 });
        // Ещё держим мышку: ужались оба блока ряда, а «Активность» поднялась к ним.
        expect(await ряд('upcoming')).toEqual(['upcoming', 'attention', 'activity']);
        expect(await ширина('upcoming')).toBeLessThan(до.upcoming - 50);
        expect(await ширина('attention')).toBeLessThan(до.attention - 30);
        // Тянем обратно — «Активность» вытолкнуло вниз, ряд как был.
        await page.mouse.move(x0, y0, { steps: 15 });
        expect(await ряд('upcoming')).toEqual(['upcoming', 'attention']);
        expect((await ряд('activity'))[0]).toBe('activity');
        // И снова влево — отпускаем там.
        await page.mouse.move(x0 - 36 * колонка, y0, { steps: 15 });
        await page.mouse.up();
        await page.waitForTimeout(100);
        expect(await ряд('upcoming')).toEqual(['upcoming', 'attention', 'activity']);

        // Ряды — до правого края: ни пустоты справа, ни «выступов».
        const правыеКрая = await page.locator('[data-row]').evaluateAll((rows) => rows.map((r) => {
            const items = Array.from(r.querySelectorAll('[data-drop-area]'));
            return items[items.length - 1].getBoundingClientRect().right;
        }));
        for (const x of правыеКрая) expect(Math.abs(x - (поле.x + поле.width)), 'ряд не доходит до правого края').toBeLessThanOrEqual(2);

        // Граница внутри ряда теперь между «Требуют внимания» и «Активностью» — меняет только их.
        const сейчас = { upcoming: await ширина('upcoming'), attention: await ширина('attention'), activity: await ширина('activity') };
        await expect(ручка).toHaveAttribute('data-handle-kind', 'divider');
        const к2 = (await ручка.boundingBox())!;
        await page.mouse.move(к2.x + к2.width / 2, к2.y + к2.height / 2);
        await page.mouse.down();
        await page.mouse.move(к2.x + к2.width / 2 + 60, к2.y + к2.height / 2, { steps: 10 });
        await page.mouse.up();
        expect(Math.abs((await ширина('upcoming')) - сейчас.upcoming)).toBeLessThanOrEqual(1);
        expect((await ширина('attention')) - сейчас.attention).toBeGreaterThan(40);
        expect(сейчас.activity - (await ширина('activity'))).toBeGreaterThan(40);
        expect(await ряд('upcoming')).toEqual(['upcoming', 'attention', 'activity']);
    });

    /** Узкое окно не «запоминается»: расширил обратно — расстановка как была. */
    test('сузил окно и расширил — показатели снова в один ряд', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const первыйРяд = () => page.locator('[data-row]').first().evaluate((r) =>
            Array.from(r.querySelectorAll('[data-drop-area]')).map((x) => x.getAttribute('data-drop-area')).join(','));
        expect(await первыйРяд()).toBe('inWork,pending,problems,ordersMonth,revenue');
        // Ждём результат, а не таймер: на нагруженной машине ряды перестраиваются не сразу.
        await page.setViewportSize({ width: 1100, height: 900 });
        await expect.poll(первыйРяд, { timeout: 10_000 }).not.toBe('inWork,pending,problems,ordersMonth,revenue');
        await page.setViewportSize({ width: 1920, height: 1080 });
        await expect.poll(первыйРяд, { timeout: 10_000 }).toBe('inWork,pending,problems,ordersMonth,revenue');
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
