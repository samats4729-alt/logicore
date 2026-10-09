import { expect, test, type Page } from '@playwright/test';
import { login, pickFromList } from './helpers';

/**
 * Журнал заявок по макету «shadcn Nova» (владелец, 08.10.2026).
 *
 * Ломается молча: кнопка на месте, а окно не открывается, фильтр не
 * отбирает, подвал со страницами уехал за край экрана. Поэтому проверяем
 * то, что делает человек: открыть рейс по глазу, отобрать по статусу,
 * переключиться на доску — и что всё помещается на его экране.
 */

async function открыть(page: Page) {
    await page.goto('/company/orders');
    await expect(page.locator('[data-order-row]').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState('networkidle');
}

test.describe('Журнал заявок', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('на экране 1920 таблица целиком, подвал со страницами виден', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await expect(page.getByRole('tab', { name: /Все заявки/ })).toBeVisible();
        const таблица = page.locator('[data-orders-table]');
        const вбок = await таблица.evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(вбок, 'таблица не помещается по ширине и едет вбок').toBeLessThanOrEqual(1);
        // Подвал «Показано 1–N из M» — в пределах окна, без прокрутки страницы.
        const подвал = page.getByText(/^Показано \d+–\d+ из \d+$/);
        await expect(подвал).toBeVisible();
        const низ = (await подвал.boundingBox())!;
        expect(низ.y + низ.height, 'подвал со страницами уехал за нижний край окна').toBeLessThanOrEqual(1080);
    });

    test('значок глаза открывает рейс в окне с картой, Esc закрывает', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const строка = page.locator('[data-order-row]').first();
        const номер = (await строка.locator('td').nth(1).innerText()).trim();
        await строка.locator('[data-action="preview"]').click();
        const окно = page.locator('[data-order-preview]');
        await expect(окно).toBeVisible();
        await expect(окно).toContainText(номер);
        await expect(окно.getByRole('button', { name: /Открыть заявку/ })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(окно).toHaveCount(0);

        // Из окна — в саму заявку.
        await строка.locator('[data-action="preview"]').click();
        await page.locator('[data-order-preview]').getByRole('button', { name: /Открыть заявку/ }).click();
        await page.waitForURL(/\/company\/orders\/[^/]+$/);
    });

    test('фильтр «Статус» отбирает, «Сбросить» возвращает всё', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const всего = await page.locator('[data-order-row]').count();
        await page.locator('[data-facet="Статус"]').click();
        await page.getByRole('option', { name: 'Завершён' }).click();
        await expect(page.locator('[data-narrowed]')).toBeVisible();
        const статусы = await page.locator('[data-order-row] [data-status]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
        expect(статусы.length).toBeGreaterThan(0);
        expect(new Set(статусы)).toEqual(new Set(['COMPLETED']));

        await page.getByRole('button', { name: /^Сбросить/ }).first().click();
        await expect(page.locator('[data-narrowed]')).toHaveCount(0);
        await expect(page.locator('[data-order-row]')).toHaveCount(всего);
    });

    test('«Все фильтры»: панель справа, отбор сразу, кнопка говорит сколько осталось', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await page.getByRole('button', { name: /Все фильтры/ }).click();
        const панель = page.locator('[data-filters-sheet]');
        await expect(панель).toBeVisible();
        await панель.getByRole('combobox', { name: 'Статус' }).click();
        await page.getByRole('option', { name: 'Завершён' }).click();
        await expect(панель.getByRole('button', { name: /^Показать \d+ заяв/ })).toBeVisible();
        await панель.getByRole('button', { name: /^Показать \d+ заяв/ }).click();
        await expect(панель).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Все фильтры/ })).toContainText('1');
    });

    test('доска: колонки по этапам, карточка открывает рейс в окне', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await page.getByRole('radio', { name: /Доска/ }).click();
        const доска = page.locator('[data-orders-board]');
        await expect(доска).toBeVisible();
        for (const колонка of ['Ждут исполнителя', 'Назначены', 'Погрузка', 'В пути', 'Выгрузка', 'Завершены']) {
            await expect(доска.getByRole('region', { name: колонка })).toBeVisible();
        }
        await доска.locator('[data-board-card]').first().click();
        await expect(page.locator('[data-order-preview]')).toBeVisible();
        await page.keyboard.press('Escape');
        await page.getByRole('radio', { name: /Таблица/ }).click();
        await expect(page.locator('[data-orders-table]')).toBeVisible();
    });

    /**
     * «Водитель закрыл рейс — проверьте накладную» — компактной кнопкой у
     * вкладок, а не полосой во всю ширину (владелец, 08.10.2026). Нажал —
     * только эти рейсы, ещё раз — все.
     */
    test('кнопка «Накладная на проверку» оставляет только такие рейсы', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const кнопка = page.locator('[data-review-chip]');
        test.skip(!(await кнопка.count()), 'На стенде нет рейсов, закрытых водителем без проверки накладной');
        const всего = await page.locator('[data-order-row]').count();
        await кнопка.click();
        await expect(кнопка).toHaveAttribute('aria-pressed', 'true');
        const строки = page.locator('[data-order-row]');
        const n = await строки.count();
        expect(n).toBeGreaterThan(0);
        expect(await строки.locator('[data-review-mark]').count(), 'в отборе есть рейс без метки проверки').toBe(n);
        await кнопка.click();
        await expect(кнопка).toHaveAttribute('aria-pressed', 'false');
        await expect(строки).toHaveCount(всего);
    });

    /**
     * Мастер заявки — окном поверх журнала (владелец, 08.10.2026): закрыл —
     * набранное осталось, открыл — на месте; оплата по умолчанию «за рейс».
     */
    test('«Создать заявку» открывает мастер окном, закрытие не теряет набранное', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lc:order-draft')).forEach((k) => localStorage.removeItem(k)));
        await page.getByRole('button', { name: 'Создать заявку' }).click();
        const окно = page.locator('[data-order-wizard-dialog]');
        await expect(окно.getByRole('heading', { name: 'Новая заявка' })).toBeVisible();
        await expect(окно.getByRole('combobox', { name: 'Тип оплаты' })).toContainText('За рейс');
        // Список под окном на месте — мы не ушли со страницы.
        await expect(page).toHaveURL(/\/company\/orders$/);

        const ставка = окно.locator('.ant-form-item').filter({ hasText: /Ставка от заказчика|^Ставка/ }).locator('input').first();
        await ставка.fill('321000');
        await expect(окно.getByTestId('order-draft-saved')).toBeVisible();
        await окно.getByRole('button', { name: 'Закрыть' }).click();
        await expect(окно).toHaveCount(0);

        await page.getByRole('button', { name: 'Создать заявку' }).click();
        await expect(page.getByTestId('order-draft-restored')).toBeVisible();
        await expect(page.locator('[data-order-wizard-dialog] .ant-form-item').filter({ hasText: /Ставка от заказчика|^Ставка/ }).locator('input').first()).toHaveValue(/321/);

        // Сбросить — с подтверждением, и черновика больше нет.
        await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
        await page.getByRole('button', { name: 'Сбросить всё?' }).click();
        await expect(page.getByTestId('order-draft-restored')).toHaveCount(0);
        await page.keyboard.press('Escape');
    });

    /**
     * Заказчик, перевозчик, водитель — окном по центру с поиском, а не
     * выпадающим списком (владелец, 08.10.2026): контрагентов сотни, и
     * список прокручивался вместе со всем мастером.
     */
    test('заказчик выбирается окном с поиском, выбранный потом — в «Недавних»', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        await page.evaluate(() => Object.keys(localStorage)
            .filter((k) => k.startsWith('lc:order-draft') || k.startsWith('lc:picker-recent'))
            .forEach((k) => localStorage.removeItem(k)));
        await page.getByRole('button', { name: 'Создать заявку' }).click();
        const мастер = page.locator('[data-order-wizard-dialog]');
        const поле = мастер.getByRole('button', { name: 'Заказчик', exact: true });
        await поле.click();

        const окно = page.locator('[data-list-picker]');
        await expect(окно).toBeVisible();
        // По центру экрана, а не списком под полем.
        const рамка = (await окно.boundingBox())!;
        expect(Math.abs(рамка.x + рамка.width / 2 - 960), 'окно выбора не по центру').toBeLessThan(4);

        const строки = окно.locator('[data-picker-option]');
        const всего = await строки.count();
        test.skip(всего < 2, 'на стенде нет заказчиков-контрагентов');
        // Первая строка — своя компания, вторая — первый контрагент.
        const имя = (await строки.nth(1).innerText()).split('\n')[0].trim();

        await окно.getByRole('textbox', { name: 'Поиск' }).fill(имя);
        await expect(строки.filter({ hasText: имя }).first()).toBeVisible();
        expect(await строки.count()).toBeLessThanOrEqual(всего);
        await строки.filter({ hasText: имя }).first().click();
        await expect(окно).toHaveCount(0);
        await expect(поле).toContainText(имя);

        // Снова открыл — выбранный уже наверху, в «Недавних».
        await поле.click();
        await expect(окно.getByText('Недавние', { exact: true })).toBeVisible();
        // Esc закрывает только окно выбора, мастер остаётся.
        await page.keyboard.press('Escape');
        await expect(окно).toHaveCount(0);
        await expect(мастер).toBeVisible();

        await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
        await page.getByRole('button', { name: 'Сбросить всё?' }).click();
        await page.evaluate(() => Object.keys(localStorage)
            .filter((k) => k.startsWith('lc:picker-recent'))
            .forEach((k) => localStorage.removeItem(k)));
    });

    /**
     * Заказчик платит в рублях, перевозчику — в тенге (владелец, 08.10.2026):
     * мастер вычитал «рубли минус тенге» и показывал убыток. Теперь, как
     * сервер, переводит обе ставки в тенге по курсу.
     */
    test('ставки в разных валютах: маржа по курсу, а не «рубли минус тенге»', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await открыть(page);
        const API = process.env.E2E_API_URL || 'http://localhost:3001';
        const курсы: any[] = await (await page.request.get(`${API}/currency/rates`)).json();
        const рубль = курсы.find((r) => r.code === 'RUB');
        test.skip(!рубль?.rate, 'на стенде нет курса рубля');

        await page.evaluate(() => Object.keys(localStorage)
            .filter((k) => k.startsWith('lc:order-draft') || k.startsWith('lc:picker-recent'))
            .forEach((k) => localStorage.removeItem(k)));
        await page.getByRole('button', { name: 'Создать заявку' }).click();
        const мастер = page.locator('[data-order-wizard-dialog]');
        // Посредник: обе ставки на экране — нужен контрагент и с той, и с другой стороны.
        await pickFromList(page, 'Выберите заказчика', 1);
        await pickFromList(page, 'Выберите перевозчика', 1);

        const ставкаЗаказчика = мастер.locator('.ant-form-item').filter({ hasText: 'Ставка от заказчика' });
        await ставкаЗаказчика.locator('input').first().fill('1000');
        await ставкаЗаказчика.locator('.ant-select-selector').click();
        await page.keyboard.type('RUB');
        await page.keyboard.press('Enter');
        // Перевозчику — 40% рублёвой ставки в тенге. «1000 − 2000» без курса
        // был бы убыток, по курсу — маржа даже за вычетом НДС.
        const вТенге = Math.round(1000 * Number(рубль.rate) * 0.4);
        await мастер.locator('.ant-form-item').filter({ hasText: 'Ставка перевозчику' }).locator('input').first().fill(String(вТенге));

        await expect(мастер.getByText('В тенге по курсу', { exact: false })).toBeVisible();
        await expect(мастер.getByText('Маржа', { exact: true })).toBeVisible();
        await expect(мастер.getByText('Убыток', { exact: true })).toHaveCount(0);

        await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
        await page.getByRole('button', { name: 'Сбросить всё?' }).click();
        await page.evaluate(() => Object.keys(localStorage)
            .filter((k) => k.startsWith('lc:picker-recent'))
            .forEach((k) => localStorage.removeItem(k)));
    });

    test('архив — своя вкладка', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await открыть(page);
        await page.getByRole('tab', { name: /Архив/ }).click();
        await expect(page.getByRole('tab', { name: /Архив/ })).toHaveAttribute('aria-selected', 'true');
        // В архиве отменённые: либо строки, либо честное «пока нет».
        await expect(page.locator('[data-order-row], [data-orders-table] td:has-text("Заявок пока нет")').first()).toBeVisible();
        const вбок = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(вбок, 'страница едет вбок').toBe(0);
    });
});
