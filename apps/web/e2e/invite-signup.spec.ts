import { expect, test, type Browser, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Приглашённый сотрудник: регистрация и возвращение после удаления.
 *
 * Жалоба: человека пригласили, он зарегистрировался — и сразу оказался на
 * странице входа: кабинет отвечал «Сессия недействительна». Войти он не
 * смог — почту, под которой его завели, ему нигде не показали. Руководитель
 * удалил его и пригласил снова, а регистрация ответила «Пользователь с
 * таким телефоном уже существует».
 *
 * Проверяем путь целиком, как его проходит человек: регистрация по ссылке
 * оставляет в кабинете, страница называет почту для входа, а после
 * удаления новое приглашение возвращает его обратно.
 */

const API = process.env.E2E_API_URL || 'http://localhost:3001';

async function пригласить(page: Page, почта: string) {
    const res = await page.request.post(`${API}/company/invitations`, {
        data: { email: почта, role: 'LOGISTICIAN', permissions: ['orders'] },
    });
    const тело = await res.json();
    return { ok: res.ok(), token: тело.token as string | undefined, message: тело.message as string | undefined };
}

/** Регистрация по ссылке в чистом браузере — как у человека, получившего приглашение. */
async function зарегистрироваться(browser: Browser, token: string, телефон: string, почта: string) {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto(`/invite?token=${token}`);

    await expect(page.getByTestId('invite-login-email')).toContainText(почта);

    await page.getByPlaceholder('Имя').fill('Проверка');
    await page.getByPlaceholder('Фамилия').fill('Приглашения');
    await page.getByPlaceholder('+77001234567').fill(телефон);
    await page.getByPlaceholder('Придумайте пароль').fill('Parol12345');
    await page.getByPlaceholder('Повторите пароль').fill('Parol12345');
    const ответ = page.waitForResponse((r) => r.url().includes('/auth/register/invited'));
    await page.getByRole('button', { name: 'Завершить регистрацию' }).click();
    const тело = await (await ответ).json();
    expect(тело.user?.id, тело.message).toBeTruthy();

    // Кабинет не выкидывает на вход: сессия записана при регистрации.
    await page.waitForURL('**/company**');
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname.startsWith('/login'), 'после регистрации выкинуло на вход').toBe(false);
    const me = await page.request.post(`${API}/auth/me`);
    expect(me.status(), 'кабинет не пускает с пропуском, выданным при регистрации').toBe(200);

    await context.close();
    return тело.user.id as string;
}

test('приглашённый регистрируется, остаётся в кабинете и возвращается после удаления', async ({ page, browser }) => {
    await login(page);
    const метка = Date.now();
    // Руководитель набрал почту с заглавной буквы — входить человек будет
    // по ней же, но маленькими буквами.
    const почта = `E2E.Priglashenie.${метка}@Example.kz`;
    const логин = почта.toLowerCase();
    const телефон = `+7701${String(метка).slice(-7)}`;

    const первое = await пригласить(page, почта);
    test.skip(!первое.ok && /лимит/i.test(первое.message || ''), 'на стенде исчерпан лимит сотрудников по тарифу');
    expect(первое.token, первое.message).toBeTruthy();

    const id = await зарегистрироваться(browser, первое.token!, телефон, логин);

    // Удалили — и пригласили снова: тот же человек, тот же телефон.
    expect((await page.request.delete(`${API}/company/users/${id}`)).ok()).toBe(true);
    const второе = await пригласить(page, почта);
    expect(второе.token, второе.message).toBeTruthy();

    const вернулся = await зарегистрироваться(browser, второе.token!, телефон, логин);
    expect(вернулся, 'вернулся под той же записью — с его прежней историей').toBe(id);

    // Не копим сотрудников от прогона к прогону: лимит тарифа считает действующих.
    await page.request.delete(`${API}/company/users/${id}`);
});
