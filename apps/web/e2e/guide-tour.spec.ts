import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Маршрут ИИ-гида по кабинету.
 *
 * Ответ модели подменяем: сюда её не пускают из проверок, да и проверять надо
 * не формулировки, а проводку. Всё остальное настоящее — разбор ответа, поиск
 * элементов, подсветка, переход к следующему шагу.
 *
 * Ловится этим два отказа, каждый из которых уже случался:
 *   — гид называет селектор, которого на экране нет, и маршрут встаёт на
 *     «не вижу элемент»;
 *   — подсказка ложится поверх подсвеченной кнопки, и нажать её нельзя.
 *     Так было с «Далее» в мастере заявки: подсказка прижималась к низу окна
 *     ровно на кнопку, и длинный маршрут останавливался намертво.
 */

const ROUTE = [
    { selector: "[data-menu-id$='-/company/orders']", say: 'Откройте «Заявки»' },
    { selector: "[data-guide='orders-create']", say: 'Нажмите «Создать заявку»' },
    { selector: "[data-guide='wizard-customer']", say: 'Выберите заказчика', fill: true },
    { selector: "[data-guide='wizard-next']", say: 'Нажмите «Далее»' },
];

const REPLY = 'Заявка заводится мастером. Проведу по шагам.\n\n```steps\n'
    + JSON.stringify(ROUTE) + '\n```';

/** Стоит ли подсветка ровно на элементе. */
async function ringOn(page: Page, selector: string): Promise<boolean> {
    return page.evaluate((sel) => {
        const ring = document.querySelector('.ai-spot-ring') as HTMLElement | null;
        const el = document.querySelector(sel);
        if (!ring || !el || getComputedStyle(ring).opacity === '0') return false;
        const a = ring.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        return Math.abs(a.top + 6 - b.top) < 4 && Math.abs(a.left + 6 - b.left) < 4;
    }, selector);
}

test('гид доводит по шагам, и подсказка не закрывает то, что показывает', async ({ page }) => {
    await page.route('**/assistant/chat', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: REPLY }) }));

    await login(page);

    // Открываем помощника по его подписи, а не «первой кнопкой со значком»:
    // такой отбор ловил соседнюю кнопку шапки, и тест падал через раз.
    await page.getByRole('button', { name: 'ИИ-помощник' }).click();
    const field = page.getByPlaceholder(/Спросите/i).first();
    await field.fill('Как создать заявку?');
    await field.press('Enter');

    // Маршрут начинается только по этой кнопке — ждём её появления, а не
    // проверяем наличие сразу. `count()` не ждёт: ответ помощника прилетает
    // мгновением позже, в этот момент кнопок ноль, и раньше тест молча шёл
    // дальше. Тур при этом не запускался вовсе, а падал первый шаг —
    // «подсветка не встала», через двадцать секунд и совсем не там, где
    // причина. Ровно так CI и краснел, пока локально успевало отрисоваться.
    const start = page.getByRole('button', { name: 'Показать по шагам' }).first();
    await expect(start).toBeVisible({ timeout: 20_000 });
    await start.click();

    for (const step of ROUTE) {
        await expect.poll(() => ringOn(page, step.selector), {
            message: `подсветка не встала на ${step.selector}`,
            timeout: 20_000,
        }).toBe(true);

        // Подсказка не должна перекрывать подсвеченное: иначе нажать нечем.
        const overlap = await page.evaluate((sel) => {
            const tip = document.querySelector('.ai-spot-tip') as HTMLElement | null;
            const el = document.querySelector(sel);
            if (!tip || !el) return false;
            const a = tip.getBoundingClientRect();
            const b = el.getBoundingClientRect();
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        }, step.selector);
        expect(overlap, `подсказка легла на ${step.selector}`).toBe(false);

        if (step.fill) {
            // Шаг с заполнением не перескакивает от касания — человек
            // заполняет и сам жмёт «Дальше».
            await page.locator(step.selector).click();
            await expect.poll(() => ringOn(page, step.selector), { timeout: 3_000 }).toBe(true);
            await page.keyboard.press('Escape');
            await page.getByRole('button', { name: /Дальше|Готово/ }).first().click();
        } else {
            await page.locator(step.selector).first().click();
        }
    }
});
