import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Сменили водителя — сразу окно «Отправить новую доверенность».
 *
 * Жалоба: водитель сломался в дороге, его сменили, а у склада на руках
 * осталась доверенность на прежнего. Сама новая никуда не уходила, и о ней
 * вспоминали, когда машину не пускали на погрузку.
 *
 * Ничего не сохраняем: ответ сервера на назначение и адреса прежней
 * доверенности подменяем. Проверяем то, что ломается тихо: окно открывается
 * само, говорит, кого на кого сменили, и отмечает ровно тех, кто получал
 * прежнюю.
 */

const API = process.env.E2E_API_URL || 'http://localhost:3001';
const В_ПУТИ = ['EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'];

const окно = (page: Page, заголовок: string) =>
    page.locator('.ant-modal').filter({ has: page.locator('.ant-modal-title', { hasText: заголовок }) });

/** Рейс с водителем у внешнего перевозчика: окно назначения сразу на водителе. */
async function рейсСВодителем(page: Page) {
    const внешние: any[] = await (await page.request.get(`${API}/external-companies`)).json();
    const перевозчики = new Set(внешние.filter((к) => к.isCarrier).map((к) => к.id));
    const заявки: any[] = (await (await page.request.get(
        `${API}/company/orders?page=1&limit=100&type=active`,
    )).json()).data ?? [];
    const подходит = (з: any) => перевозчики.has(з.subForwarderId)
        && (!з.partnerId || з.partnerId === з.subForwarderId)
        && з.driverId && з.assignedDriverName;
    return заявки.find((з) => В_ПУТИ.includes(з.status) && подходит(з))
        ?? заявки.find((з) => з.status === 'ASSIGNED' && подходит(з));
}

test.describe('Доверенность после замены водителя', () => {
    test('сменили водителя — окно открывается само и отмечает тех, кто получал прежнюю', async ({ page }) => {
        await login(page);
        const рейс = await рейсСВодителем(page);
        test.skip(!рейс, 'на стенде нет рейса с водителем у внешнего перевозчика');

        // Сервер «отвечает», что водителя сменили, — в базе ничего не меняется.
        await page.route(`**/company/orders/${рейс.id}/assign-driver`, (route) => route.fulfill({
            json: { ...рейс, driverId: 'e2e-новый-водитель', assignedDriverName: 'Проверочный Водитель' },
        }));
        await page.route('**/company/drivers/*', (route) => (
            route.request().method() === 'PUT' ? route.fulfill({ json: {} }) : route.continue()
        ));
        await page.route(`**/orders/${рейс.id}/power-of-attorney/recipients`, (route) => route.fulfill({
            json: { at: '2026-09-24T10:00:00.000Z', emails: ['sklad-e2e@example.kz'] },
        }));

        await page.goto(`/company/orders/${рейс.id}`);
        await page.getByRole('button', { name: 'Заменить водителя' }).click();
        const назначение = окно(page, 'Назначить перевозчика и водителя');
        await expect(назначение.locator('.ant-steps-item-process')).toContainText('Водитель');
        const номер = назначение.getByLabel('Госномер автомобиля');
        if (!(await номер.inputValue())) await номер.fill('000 E2E 02');
        await назначение.getByRole('button', { name: 'Назначить' }).click();

        const доверенность = окно(page, 'Отправить новую доверенность');
        await expect(доверенность.getByTestId('poa-after-replace'))
            .toContainText(`Водитель заменён: ${рейс.assignedDriverName} → Проверочный Водитель`);
        // Ссылка прежнего водителя погасла — новому её отправляют отсюда же.
        await expect(доверенность.getByRole('button', { name: 'Ссылка для водителя' })).toBeVisible();

        // Туда же, куда ушла прежняя, и только туда.
        const строки = доверенность.locator('.ant-checkbox-wrapper');
        const прежний = строки.filter({ hasText: 'sklad-e2e@example.kz' });
        await expect(прежний).toContainText('Получали прежнюю доверенность');
        await expect(прежний.locator('input[type="checkbox"]')).toBeChecked();
        const остальные = строки.filter({ hasNotText: 'sklad-e2e@example.kz' });
        for (let i = 0; i < await остальные.count(); i++) {
            await expect(остальные.nth(i).locator('input[type="checkbox"]')).not.toBeChecked();
        }

        await доверенность.locator('.ant-modal-footer').getByRole('button', { name: 'Не сейчас' }).click();
        await expect(доверенность).toBeHidden();
    });

    test('«На почту» без замены — обычное окно, без напоминаний', async ({ page }) => {
        await login(page);
        const рейс = await рейсСВодителем(page);
        test.skip(!рейс, 'на стенде нет рейса с водителем у внешнего перевозчика');

        await page.goto(`/company/orders/${рейс.id}`);
        await page.getByRole('button', { name: 'На почту' }).click();
        const обычное = окно(page, 'Отправить доверенность по email');

        await expect(обычное).toBeVisible();
        await expect(обычное.getByTestId('poa-after-replace')).toHaveCount(0);
        await expect(обычное.locator('.ant-modal-footer')).toContainText('Отмена');
        await обычное.locator('.ant-modal-footer').getByRole('button', { name: 'Отмена' }).click();
    });
});
