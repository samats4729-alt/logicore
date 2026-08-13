import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Тариф на виду.
 *
 * Цена приходит с сервера и на лендинг, и в кабинет. Сломается запрос —
 * страницы не упадут, а просто промолчат про деньги: блок отрисуется пустым
 * или исчезнет, и никто этого не заметит, пока не позвонит клиент. Поэтому
 * проверяем не вёрстку, а то, что цена и её объяснение на странице есть.
 *
 * Платный режим здесь не включается намеренно: рубильник общий на всю
 * платформу, и тест, который его дёргает, отключил бы кабинет остальным
 * тестам, идущим параллельно.
 */

test('лендинг называет цену и объясняет, почему она нулевая', async ({ page }) => {
    await page.goto('/');

    const tariff = page.locator('#тариф');
    await tariff.scrollIntoViewIfNeeded();

    await expect(tariff.getByText('идёт тестирование')).toBeVisible();
    await expect(tariff.getByText('Бесплатно')).toBeVisible();
    await expect(tariff.getByText('на время тестирования')).toBeVisible();
    await expect(tariff.getByText(/предупредим заранее/)).toBeVisible();
});

test('на главной кабинета видно, что доступ открыт', async ({ page }) => {
    await login(page);

    await expect(page.getByText('Бесплатно', { exact: true })).toBeVisible();
    await expect(page.getByText('на время тестирования · доступ открыт')).toBeVisible();
});
