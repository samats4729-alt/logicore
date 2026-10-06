import { test, expect, request as playwrightRequest } from '@playwright/test';

const API = process.env.E2E_API_URL || 'http://localhost:3001';

/**
 * Биржа: владелец платформы подтверждает компанию как парк — у неё свой
 * кабинет: с главной она попадает в «Кабинет парка», оттуда — в «Водители».
 *
 * Отметку ставим через сервер под владельцем платформы (отдельный человек,
 * не тот, под кем идут остальные тесты, — одна сессия на человека), а
 * в конце снимаем: остальные проверки видят компанию как прежде.
 */
test.describe('Биржа · парки', () => {
    test('парк попадает в свой кабинет и видит водителей', async ({ page }) => {
        test.setTimeout(150_000);

        const api = await playwrightRequest.newContext();
        const login = await api.post(`${API}/auth/login`, {
            data: { email: 'admin@logcomp.kz', password: process.env.E2E_PLATFORM_ADMIN_PASSWORD || 'admin123', deviceId: 'e2e-parks' },
        });
        test.skip(!login.ok(), 'Нет входа владельца платформы на этом стенде');
        const token = (await login.json()).accessToken as string;
        const auth = { Authorization: `Bearer ${token}` };

        const companies = await api.get(`${API}/exchange/admin/companies`, { headers: auth, params: { q: 'ЛогиКор' } });
        test.skip(companies.status() === 404, 'Биржа на этом сервере выключена');
        const company = (await companies.json()).find((c: any) => c.name.includes('ЛогиКор'));
        expect(company, 'компания стенда не нашлась').toBeTruthy();

        await api.put(`${API}/exchange/admin/companies/${company.id}/park`, { headers: auth, data: { isPark: true } });
        try {
            await page.goto('/company');
            await expect(page.getByRole('heading', { name: 'Кабинет парка' })).toBeVisible({ timeout: 60_000 });
            await expect(page.getByText('Пригласить водителя')).toBeVisible();
            await page.goto('/company/park/drivers');
            await expect(page.getByRole('heading', { name: 'Водители парка' })).toBeVisible({ timeout: 60_000 });
            // Новых анкет на стенде нет — пустота объясняет, откуда они берутся.
            await expect(page.getByText(/Новых анкет нет|Тестов/).first()).toBeVisible();
        } finally {
            if (!company.isPark) {
                await api.put(`${API}/exchange/admin/companies/${company.id}/park`, { headers: auth, data: { isPark: false } });
            }
            await api.dispose();
        }
    });
});
