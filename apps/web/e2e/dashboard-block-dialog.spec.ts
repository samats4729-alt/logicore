import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Окно блока на дашборде (владелец, 08.10.2026): «Открыть крупно» —
 * блок посередине экрана, фон размыт; «Настройки» — вид графика, цвета,
 * что показывать, своё название.
 *
 * Ломается молча: кнопка есть, окно не открывается, или настройка
 * сохраняется, а блок её не слушает. Поэтому проверяем то, что видно:
 * окно, вид графика, цвет линии, название в шапке.
 */

const LAYOUT_KEY = 'lc_dashboard_layout_v5';
const SETTINGS_KEY = 'lc_dashboard_blocks_v1';

async function открыть(page: Page) {
    await page.goto('/company');
    await expect(page.locator('[data-widget="chart"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
}

const меню = (page: Page, id: string) => page.locator(`[data-widget="${id}"]`).getByRole('button', { name: 'Действия с блоком' });

test.describe('Окно блока: открыть крупно и настройки', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // Каждый тест — с исходной расстановкой и без настроек.
        await page.evaluate(([a, b]) => { localStorage.removeItem(a); localStorage.removeItem(b); }, [LAYOUT_KEY, SETTINGS_KEY]);
    });

    test('«Открыть крупно»: окно посередине, фон размыт, у графика — недели цифрами', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await page.locator('[data-expand="chart"]').click();
        const окно = page.locator('[data-block-dialog="chart"]');
        await expect(окно).toBeVisible();
        await expect(окно.getByRole('heading', { name: 'Выручка и маржа по неделям' })).toBeVisible();
        await expect(окно.locator('[data-weeks-table]')).toBeVisible();
        expect((await окно.boundingBox())!.width, 'окно не крупнее блока').toBeGreaterThan(1000);
        const размытие = await page.evaluate(() =>
            Array.from(document.querySelectorAll('div')).map((el) => getComputedStyle(el).backdropFilter).find((v) => v.includes('blur')) ?? '');
        expect(размытие, 'фон за окном не размыт').toContain('blur');

        await page.keyboard.press('Escape');
        await expect(окно).toHaveCount(0);
        // После закрытия страница по-прежнему отвечает на клики.
        await меню(page, 'chart').click();
        await expect(page.getByRole('menuitem', { name: 'Настройки…' })).toBeVisible();
    });

    test('узкий блок: «Открыть крупно» уходит в меню «…»', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await открыть(page);
        await expect(page.locator('[data-expand="chart"]')).toBeVisible();
        await expect(page.locator('[data-widget="earnings"] [data-expand]')).toHaveCount(0);
        await меню(page, 'earnings').click();
        await page.getByRole('menuitem', { name: 'Открыть крупно' }).click();
        await expect(page.locator('[data-block-dialog="earnings"]')).toBeVisible();
    });

    test('настройки графика: линии и зелёный цвет — запоминаются, «Как было» возвращает', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await меню(page, 'chart').click();
        await page.getByRole('menuitem', { name: 'Настройки…' }).click();
        const окно = page.locator('[data-block-dialog="chart"]');
        const панель = окно.locator('[data-settings-panel]');
        await expect(панель).toBeVisible();

        await панель.getByRole('radio', { name: 'Линии' }).click();
        await панель.getByRole('radiogroup', { name: 'Цвет выручки' }).getByRole('radio', { name: 'Зелёный' }).click();
        // Блок в окне меняется сразу.
        await expect(окно.locator('.recharts-line-curve').first()).toHaveAttribute('stroke', '#10b981');

        await панель.getByRole('button', { name: 'Готово' }).click();
        await expect(окно).toHaveCount(0);
        const линия = page.locator('[data-widget="chart"] .recharts-line-curve').first();
        await expect(линия).toHaveAttribute('stroke', '#10b981');

        await page.reload();
        await expect(page.locator('[data-widget="chart"]')).toBeVisible({ timeout: 60_000 });
        await expect(линия).toHaveAttribute('stroke', '#10b981', { timeout: 15_000 });

        await меню(page, 'chart').click();
        await page.getByRole('menuitem', { name: 'Настройки…' }).click();
        await page.locator('[data-settings-panel]').getByRole('button', { name: 'Как было' }).click();
        await expect(page.locator('[data-sonner-toast]', { hasText: 'Настройки блока сброшены' })).toBeVisible();
        await page.locator('[data-settings-panel]').getByRole('button', { name: 'Готово' }).click();
        await expect(page.locator('[data-widget="chart"] .recharts-line-curve')).toHaveCount(0);
        await expect(page.locator('[data-widget="chart"] .recharts-bar-rectangle').first()).toBeVisible();
    });

    test('своё название блока — в шапке, пустое — прежнее', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await открыть(page);
        await меню(page, 'attention').click();
        await page.getByRole('menuitem', { name: 'Настройки…' }).click();
        await page.getByLabel('Своё название блока').fill('Хвосты и долги');
        await page.getByRole('button', { name: 'Готово' }).click();
        await expect(page.locator('[data-widget="attention"]').getByRole('heading', { name: 'Хвосты и долги' })).toBeVisible();

        await меню(page, 'attention').click();
        await page.getByRole('menuitem', { name: 'Настройки…' }).click();
        await page.getByLabel('Своё название блока').fill('');
        await page.getByRole('button', { name: 'Готово' }).click();
        await expect(page.locator('[data-widget="attention"]').getByRole('heading', { name: 'Требуют внимания' })).toBeVisible();
    });

    test('показатель открывается крупно — с числом и графиком', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await page.locator('[data-widget="inWork"]').hover();
        await page.getByRole('button', { name: 'Действия с плиткой «Сейчас в работе»' }).click();
        await page.getByRole('menuitem', { name: 'Открыть крупно' }).click();
        const окно = page.locator('[data-block-dialog="inWork"]');
        await expect(окно).toBeVisible();
        await expect(окно.locator('.recharts-surface').first()).toBeVisible();
    });
});
