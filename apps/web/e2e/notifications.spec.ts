import { test, expect } from '@playwright/test';
import { E2E_ALT_EMAIL, E2E_ALT_PASSWORD, submitLoginForm } from './helpers';

// Эти два теста проверяют саму форму входа, поэтому идут без сохранённой
// сессии — иначе `/login` сразу уводит в кабинет. Два запроса к `/auth/login`
// плюс один из `auth.setup.ts` укладываются в лимит в пять штук за минуту.
test.use({ storageState: { cookies: [], origins: [] } });

// Вход здесь идёт под вторым сотрудником, и это не мелочь. В платформе одна
// живая сессия на человека: успешный вход гасит предыдущую. Пока тест
// логинился под тем же адресом, что и `auth.setup.ts`, он убивал общую
// сессию — а файлы идут по алфавиту, и весь `smoke.spec.ts` после него
// работал разлогиненным. Пять его проверок падали на «элемент не найден»,
// проверка была красной, и выкладка на сайт стояла.

/**
 * Уведомления переехали с `message` из antd на sonner.
 *
 * Ни типы, ни сборка этого не покажут: если `<Toaster />` не смонтирован,
 * вызов `toast()` молча ничего не делает — человек решит, что кнопка не
 * сработала, и нажмёт второй раз. Поэтому проверка живая, в браузере.
 */
test('ошибка показывает уведомление', async ({ page }) => {
    await submitLoginForm(page, E2E_ALT_EMAIL, 'заведомо-неверный');

    const toast = page.locator('[data-sonner-toast]');
    await expect(toast).toBeVisible({ timeout: 15_000 });
    await expect(toast).toContainText(/Неверн|Ошибка|не найден/i);

    // Разметки antd быть не должно: два механизма уведомлений разом —
    // это когда часть сообщений видна, а часть нет.
    await expect(page.locator('.ant-message')).toHaveCount(0);
});

test('успешное действие показывает уведомление', async ({ page }) => {
    await submitLoginForm(page, E2E_ALT_EMAIL, E2E_ALT_PASSWORD);

    await expect(page.locator('[data-sonner-toast]')).toContainText('Вход выполнен', {
        timeout: 15_000,
    });
});
