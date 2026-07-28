import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Кнопки переезжают с Ant Design на shadcn/ui.
 *
 * Проверка живая, потому что поломка здесь невидима для типов и сборки:
 * preflight у Tailwind выключен, вместо него в `globals.css` лежит
 * мини-сброс. Пока он был написан как `button:not([class*='ant-'])`, он
 * весил больше утилит Tailwind и обнулял им фон и рамку — «Далее»
 * превращалась в белый текст на белом. `tsc` и `next build` при этом
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

    const next = page.getByRole('button', { name: /Далее/ }).first();
    await expect(next).toBeVisible();

    const bg = await next.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(isTransparent(bg), `у кнопки «Далее» прозрачный фон: ${bg}`).toBe(false);
});

test('у вторичной кнопки видна рамка', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders/create');

    const cancel = page.getByRole('button', { name: 'Отмена' }).first();
    await expect(cancel).toBeVisible();

    const border = await cancel.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { width: cs.borderTopWidth, color: cs.borderTopColor };
    });
    expect(border.width, 'у кнопки «Отмена» нулевая рамка').not.toBe('0px');
    expect(isTransparent(border.color), `рамка «Отмены» прозрачная: ${border.color}`).toBe(false);
});

test('главная кнопка списка заявок сохранила фирменный вид', async ({ page }) => {
    await login(page);
    await page.goto('/company/orders');

    // `.lc-cta` раньше висел на `.ant-btn`; после переезда на shadcn
    // селектор в globals.css опирается на сам класс — если это отменить,
    // кнопка потеряет тёмную заливку и скруглённую форму.
    const cta = page.getByRole('button', { name: /Создать заявку/ }).first();
    await expect(cta).toBeVisible();

    // Проверяем именно градиент: обычная заливка есть и у shadcn по
    // умолчанию, так что «фон не прозрачный» тут ничего не доказывает —
    // такой тест остался бы зелёным и без `.lc-cta`. Тёмный градиент
    // даёт только фирменное правило.
    const image = await cta.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(image, 'кнопка «Создать заявку» потеряла фирменный градиент').toContain('linear-gradient');
});
