import { expect, test } from '@playwright/test';
import { login } from './helpers';
import { SETTLEMENT_SIDES } from '@/lib/vocabulary';

/**
 * Платёжный календарь на дашборде и срок оплаты в счёте.
 *
 * Оба ломаются молча. Плитка при поломке запроса зависает на загрузке или
 * рисует сетку, за которой ничего нет, — дашборд при этом выглядит рабочим.
 * Срок оплаты при поломке подстановки останется пустым, счёт уйдёт
 * контрагенту без даты и выпадет из календаря целиком.
 *
 * Проверки написаны так, чтобы держаться на чистом стенде: денег в сиде
 * нет, и требовать их значило бы падать на пустой базе вместо поломки.
 * Поэтому строение плитки проверяется всегда, а суммы — когда они есть.
 */

/**
 * Плитка календаря после загрузки данных и дни, в которых есть деньги.
 *
 * Ждать обязательно: счёт клеток без ожидания выполняется раньше, чем
 * ответ сервера, и тест молча пропускал сам себя на стенде, где платежи
 * есть. Панель под сеткой отвечает всегда — платежами или тем, что их
 * нет, и её появление означает, что запрос завершился.
 */
async function плиткаСДанными(page: import('@playwright/test').Page) {
    const плитка = page.locator('section').filter({ hasText: 'Платёжный календарь' }).first();
    await expect(плитка).toBeVisible();
    await expect(плитка.getByText(/платежей нет|₸|тыс|млн/).first()).toBeVisible();
    // Дни с деньгами отличаются подписью: у пустой клетки её нет.
    return { плитка, сДеньгами: плитка.getByRole('button', { name: /поступит|платим/ }) };
}

test.describe('Платёжный календарь', () => {
    test('плитка на дашборде показывает месяц целиком', async ({ page }) => {
        await login(page);

        const плитка = page.locator('section').filter({ hasText: 'Платёжный календарь' }).first();
        await expect(плитка).toBeVisible();

        // Дни недели и полная сетка. Если запрос завис, плитка осталась бы
        // на загрузке и ничего этого не было бы.
        await expect(плитка.getByText('ПН', { exact: true })).toBeVisible();
        await expect(плитка.getByText('ВС', { exact: true })).toBeVisible();
        await expect(плитка.locator('button').filter({ hasText: /^\d{1,2}$/ })).toHaveCount(42);

        // Панель дня отвечает всегда — платежами или тем, что их нет.
        await expect(
            плитка.getByText(/платежей нет|₸|тыс|млн/).first(),
        ).toBeVisible();
    });

    test('день с деньгами разворачивается по нажатию', async ({ page }) => {
        await login(page);

        // Клеток с деньгами может не быть вовсе — на чистом стенде счетов
        // со сроком оплаты нет, и это пустая база, а не поломка.
        const { плитка, сДеньгами } = await плиткаСДанными(page);
        if (await сДеньгами.count() === 0) {
            test.skip(true, 'на стенде нет счетов со сроком оплаты');
            return;
        }

        await сДеньгами.first().click();
        // Нажали на день с деньгами — панель под сеткой обязана показать сумму.
        await expect(плитка.getByText(/₸|тыс|млн/).first()).toBeVisible();
    });

    test('наведение на дату называет контрагента и сумму', async ({ page }) => {
        await login(page);

        const { плитка, сДеньгами } = await плиткаСДанными(page);
        test.skip(await сДеньгами.count() === 0, 'на стенде нет платежей со сроком оплаты');

        await сДеньгами.first().hover();

        // Окошко обязано назвать, кому и за что: точка отвечает только
        // «что-то есть», и ради состава платежа не должно приходиться
        // нажимать. Оно же ломается тише всего — при поломке остаётся
        // рабочая на вид плитка без единой подсказки.
        const окно = плитка.getByRole('tooltip');
        await expect(окно).toBeVisible();
        await expect(окно.getByText(/платим|поступит/).first()).toBeVisible();
        await expect(окно.getByText(/₸/).first()).toBeVisible();
    });

    test('из плитки открывается полный календарь', async ({ page }) => {
        await login(page);

        const плитка = page.locator('section').filter({ hasText: 'Платёжный календарь' }).first();
        await плитка.getByRole('button', { name: 'Открыть' }).click();

        await expect(page).toHaveURL(/\/company\/accounting\/calendar/);
        await expect(page.getByRole('heading', { name: 'Платёжный календарь' })).toBeVisible();
        // Подпись берём из словаря: переименуют стороны расчётов — тест
        // переедет вместе с ними, а не упадёт на устаревшем слове.
        await expect(page.getByText(SETTLEMENT_SIDES.receivableShort).first()).toBeVisible();
    });
});

test('срок оплаты счёта подставляется из отсрочки, записанной в рейсе', async ({ page }) => {
    await login(page);
    await page.goto('/company/accounting/invoices/create');

    // Входящий счёт от перевозчика: отсрочка перевозчика записана в рейсе.
    await page.getByText('Входящий', { exact: true }).click();
    await page.waitForTimeout(600);

    const выбор = page.locator('.ant-select').first();
    await выбор.click();
    await page.waitForTimeout(900);
    const сколько = await page.locator('.ant-select-item-option:visible').count();

    /**
     * Перебираем контрагентов, пока не найдётся тот, у кого есть рейсы без
     * счёта. Брать первого попавшегося нельзя: у него рейсов может не быть,
     * и проверка молча превратилась бы в пропуск, ничего не проверив.
     *
     * Смена контрагента сбрасывает подбор сама — перезагружать страницу на
     * каждом круге не надо, а на этой странице это ещё и долго.
     */
    let нашли = false;
    for (let i = 0; i < сколько && !нашли; i += 1) {
        if (i > 0) {
            await выбор.click();
            await page.waitForTimeout(900);
        }
        await page.locator('.ant-select-item-option:visible').nth(i).click();
        await page.waitForTimeout(1200);

        await page.getByRole('button', { name: /Подобрать по заявкам/ }).click();
        await page.waitForTimeout(1500);

        // Рейсы в работе — счёт на аванс: завершённые могут быть уже
        // выставлены, и тогда подбирать нечего. Положение переключателя
        // переживает закрытие окна, поэтому жмём только когда он выключен —
        // иначе на втором круге он выключился бы обратно.
        const переключатель = page.locator('.ant-modal .ant-switch').first();
        if (await переключатель.getAttribute('aria-checked') !== 'true') {
            await переключатель.click();
        }
        await page.waitForTimeout(2500);

        const строки = page.locator('.ant-modal .ant-table-tbody tr.ant-table-row');
        if (await строки.count() > 0) {
            await строки.first().locator('.ant-checkbox-input').click();
            await page.locator('.ant-modal').getByRole('button', { name: /Перенести в счёт/ }).click();
            нашли = true;
        } else {
            await page.locator('.ant-modal').getByRole('button', { name: 'Отмена' }).click();
            await page.waitForTimeout(900);
        }
    }

    if (!нашли) {
        test.skip(true, 'на стенде нет рейсов без счёта ни у одного контрагента');
        return;
    }

    // Либо дата подставилась и подписана, либо честно сказано, почему её
    // нет. Пустая графа без объяснения — то, от чего уходили.
    await expect(
        page.getByText(/по отсрочке из заявки|ждём оригиналы|не задана отсрочка|не проставлена дата выгрузки/),
    ).toBeVisible({ timeout: 15000 });
});
