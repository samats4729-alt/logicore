import { expect, test } from '@playwright/test';

/**
 * Как сайт видят поисковики и мессенджеры (06.11.2026).
 *
 * До этого главная и регистрация отдавали поисковику одно слово
 * «Загрузка»: текст появлялся только после запуска программы в браузере.
 * Google знал одну страницу сайта, карты сайта не было, ссылка в WhatsApp
 * приходила без картинки. Здесь проверяется то, что видно без запуска
 * программы, — ровно так страницу читает поисковик.
 */

test.describe('поисковик видит сайт', () => {
    test('главная и регистрация читаются без запуска программы', async ({ browser }) => {
        const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: undefined });
        const page = await ctx.newPage();

        await page.goto('/');
        await expect(page).toHaveTitle(/CRM для грузоперевозок/);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('в одной системе');
        await expect(page.getByText('Загрузка', { exact: true })).toHaveCount(0);

        await page.goto('/register');
        await expect(page).toHaveTitle('Регистрация компании — LogiCore');
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Начните управлять');

        await ctx.close();
    });

    test('у главной есть описание и картинка для превью ссылки', async ({ request }) => {
        const html = await (await request.get('/')).text();
        expect(html).toMatch(/<meta name="description" content="[^"]*перевозчиков/);
        expect(html).toMatch(/<meta property="og:image" content="[^"]+opengraph-image\.png/);
        expect(html).toContain('<link rel="canonical" href="https://logicore.kz"');

        const image = await request.get('/opengraph-image.png');
        expect(image.ok()).toBe(true);
        const icon = await request.get('/favicon.ico');
        expect(icon.ok()).toBe(true);
    });

    test('карта сайта — только открытые страницы, кабинеты закрыты от обхода', async ({ request }) => {
        const sitemap = await (await request.get('/sitemap.xml')).text();
        expect(sitemap).toContain('<loc>https://logicore.kz/register</loc>');
        expect(sitemap).not.toContain('/company');

        const robots = await (await request.get('/robots.txt')).text();
        expect(robots).toContain('Sitemap: https://logicore.kz/sitemap.xml');
        // В «поделиться документом» — документы клиентов, им не место в поиске.
        expect(robots).toContain('Disallow: /shared');
        expect(robots).toContain('Disallow: /company');
    });
});
