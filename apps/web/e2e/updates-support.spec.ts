import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * «Что нового» и «Поддержка» — две отдельные страницы.
 *
 * Раньше и то и другое жило внутри ИИ-помощника: нововведения он вываливал
 * сообщением в чат, обращение писалось там же и уходило в никуда — ответа
 * человек не видел никогда.
 *
 * Ответы сервера подменяются: проверяются страницы, а не содержимое стенда.
 * На чистом стенде нововведений нет вовсе, и тест проверял бы пустоту.
 */

test.describe('Что нового', () => {
    test('нововведения читаются лентой, а не сообщением в чате', async ({ page }) => {
        await page.route('**/assistant/updates/published', (route) => route.fulfill({
            json: [
                {
                    id: 'u-1', title: 'Адрес можно завести без 2ГИС',
                    description: 'Страна, город, улица и дом вписываются руками.',
                    publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
                },
                {
                    id: 'u-2', title: 'История запросов по направлению',
                    description: 'Видно все запросы по маршруту, а не только по выбранному клиенту.',
                    publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
                },
            ],
        }));

        await login(page);
        await page.goto('/company/updates');

        await expect(page.getByRole('heading', { name: 'Что нового' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Адрес можно завести без 2ГИС' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'История запросов по направлению' })).toBeVisible();
    });

    test('пустая лента объясняет себя, а не показывает пустоту', async ({ page }) => {
        await page.route('**/assistant/updates/published', (route) => route.fulfill({ json: [] }));

        await login(page);
        await page.goto('/company/updates');

        await expect(page.getByText(/Пока ничего не выходило/)).toBeVisible();
    });
});

test.describe('Поддержка', () => {
    test('письмо уходит и остаётся на виду вместе с ответом', async ({ page }) => {
        const answered = {
            id: 'т-1', title: 'Не печатается договор-заявка',
            category: 'documents', severity: 'high',
            description: 'Нажимаю печать, ничего не происходит.',
            status: 'DONE',
            answer: 'Поправили, обновите страницу.',
            answeredAt: new Date().toISOString(),
            userName: 'Евгений', createdAt: new Date().toISOString(),
        };

        await page.route('**/assistant/support/my', (route) => route.fulfill({ json: [answered] }));
        let sent: any = null;
        await page.route('**/assistant/support/ticket', async (route) => {
            sent = route.request().postDataJSON();
            await route.fulfill({ json: { id: 'т-2' } });
        });

        await login(page);
        await page.goto('/company/support');

        // Прошлое обращение и ответ на него — на одной странице.
        await expect(page.getByText('Не печатается договор-заявка')).toBeVisible();
        await expect(page.getByText('Ответ поддержки', { exact: false })).toBeVisible();
        await expect(page.getByText('Поправили, обновите страницу.')).toBeVisible();

        // Новое письмо.
        await page.getByPlaceholder(/не печатается договор/).fill('Не приходит уведомление');
        await page.getByPlaceholder(/Что делали/).fill('Заявку подтвердили, а уведомление не пришло ни мне, ни бухгалтеру.');
        // Точное совпадение: на странице бывает и полоса о проверке
        // организации со своей кнопкой.
        await page.getByRole('button', { name: 'Отправить', exact: true }).click();

        await expect(page.locator('[data-sonner-toast]')).toContainText('Письмо отправлено', { timeout: 15_000 });
        expect(sent?.title).toBe('Не приходит уведомление');
    });

    test('письмо из одной строки не отправляется', async ({ page }) => {
        // Иначе поддержка получает «не работает» без единой подробности и
        // тратит день на выяснение того, что человек знал с самого начала.
        await page.route('**/assistant/support/my', (route) => route.fulfill({ json: [] }));

        await login(page);
        await page.goto('/company/support');

        await page.getByPlaceholder(/не печатается договор/).fill('Ошибка');
        await page.getByPlaceholder(/Что делали/).fill('не то');
        // Точное совпадение: на странице бывает и полоса о проверке
        // организации со своей кнопкой.
        await page.getByRole('button', { name: 'Отправить', exact: true }).click();

        await expect(page.locator('[data-sonner-toast]')).toContainText('подробнее');
    });
});
