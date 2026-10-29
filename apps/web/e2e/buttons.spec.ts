import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Кнопки переезжают с Ant Design на shadcn/ui.
 *
 * Проверка живая, потому что поломка здесь невидима для типов и сборки:
 * preflight у Tailwind выключен, вместо него в `globals.css` лежит
 * мини-сброс. Пока он был написан как `button:not([class*='ant-'])`, он
 * весил больше утилит Tailwind и обнулял им фон и рамку — «Далее» мастера
 * заявки превращалась в белый текст на белом. `tsc` и `next build` при этом
 * зелёные, разметка на месте, кнопка нажимается. Видно только в браузере.
 *
 * Поэтому смотрим не на разметку, а на вычисленный стиль.
 */

/** Прозрачный фон — та самая поломка, которую тест обязан ловить. */
function isTransparent(color: string) {
    return color === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color);
}

test('заливка главной кнопки не съедается сбросом стилей', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders/create');

    // «Создать заявку» в окне заявки. Тот же сброс однажды перекрасил её
    // текст в цвет фона: кнопка залита, а надписи не видно.
    const cta = page.locator('[data-guide="wizard-submit"]');
    await expect(cta).toBeVisible();

    const { bg, color } = await cta.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, color: cs.color };
    });
    expect(isTransparent(bg), `у кнопки «Создать заявку» прозрачный фон: ${bg}`).toBe(false);
    expect(color, 'текст кнопки «Создать заявку» того же цвета, что фон').not.toBe(bg);
});

test('у вторичной кнопки видна рамка', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders');

    const refresh = page.getByRole('button', { name: 'Обновить список' }).first();
    await expect(refresh).toBeVisible();

    const border = await refresh.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { width: cs.borderTopWidth, color: cs.borderTopColor };
    });
    expect(border.width, 'у кнопки «Обновить список» нулевая рамка').not.toBe('0px');
    expect(isTransparent(border.color), `рамка «Обновить список» прозрачная: ${border.color}`).toBe(false);
});

test('главная кнопка списка заявок сохранила фирменный вид', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders');

    // `.lc-cta` раньше висел на `.ant-btn`; после переезда на shadcn
    // селектор опирается на сам класс — если это отменить, кнопка потеряет
    // фирменную заливку и станет обычной синей кнопкой shadcn.
    const cta = page.getByRole('button', { name: /Создать заявку/ }).first();
    await expect(cta).toBeVisible();

    // Журнал заявок переведён на макет «shadcn Nova» (08.10.2026): главная
    // кнопка — обычная кнопка shadcn с основным цветом темы. Токен темы
    // задан тем же графитом, что и фирменный (см. начало `globals.css`).
    //
    // Сравниваем с самим токеном, а не с «фон не прозрачный»: если токен
    // потеряется, кнопка станет прозрачной или синей, а такой тест остался
    // бы зелёным.
    const actual = await cta.evaluate((el) => getComputedStyle(el).backgroundColor);
    const expected = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'hsl(var(--primary))';
        document.querySelector('.lc-nova')!.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
    });
    expect(actual, 'кнопка «Создать заявку» залита не фирменным цветом').toBe(expected);
});

test('antd Upload по-прежнему получает клик от кнопки shadcn', async ({ page }) => {
    // Кнопка живёт внутри antd Upload: обработчик висит на обёртке
    // `span.ant-upload`, а клик до неё должен всплыть от самой кнопки.
    // У кнопки shadcn это обычный <button>, но выключенное состояние,
    // pointer-events или лишняя обёртка легко проглотят клик — и кнопка
    // останется на месте, будет нажиматься, а окно выбора файла не
    // откроется. Ни типы, ни сборка такого не покажут, поэтому ждём
    // настоящее событие браузера.
    await login(page);
    await page.goto('/company/orders');

    const firstRow = page.locator('[data-order-row]').first();
    await expect(firstRow).toBeVisible();
    await firstRow.locator('button').last().click();
    await page.waitForURL(/\/company\/orders\/[^/]+$/);

    await page.getByRole('tab', { name: /Документы/ }).first().click();

    // Кнопка называется «Загрузить файл»: вкладка собрала все документы
    // рейса, и вложить туда можно не только накладную.
    const upload = page.getByRole('button', { name: /Загрузить файл/ }).first();
    await expect(upload).toBeVisible();

    const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
    await upload.click();
    await chooser;
});
