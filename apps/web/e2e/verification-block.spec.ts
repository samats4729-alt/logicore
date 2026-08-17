import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * Окончательный отказ глазами того, кому отказали.
 *
 * Запрет ставится в админке, а живёт в чужом кабинете — и опасность
 * именно там: человек, которому закрыли доступ, не должен упираться в
 * молчаливо неработающие кнопки. Он должен прочитать, что произошло, и
 * увидеть единственный оставшийся ход — написать в поддержку.
 *
 * Ответ `/my-company` подменяется: заводить на стенде компанию с закрытым
 * доступом ради одной проверки дороже, чем она стоит, а проверяем мы
 * поведение экрана.
 */

const blocked = {
    company: { id: 'к-1', name: 'ТОО «Ромашка»', bin: '123456789012' },
    verification: {
        verificationStatus: 'REJECTED',
        rejectionReason: 'Фирма зарегистрирована не её владельцем',
        verificationBlockedAt: new Date().toISOString(),
        canSubmit: false,
        missingDocuments: [],
        documents: [],
    },
    verificationRequired: false,
};

test('закрытый доступ объясняется словами, а не молчащими кнопками', async ({ page }) => {
    await page.route('**/my-company', (route) => route.fulfill({ json: blocked }));

    await login(page);

    await expect(page.getByText('Заявка отклонена окончательно')).toBeVisible();
    await expect(page.getByText('Фирма зарегистрирована не её владельцем')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Написать в поддержку' })).toBeVisible();
});

test('повторная подача закрыта, и это видно на самой странице проверки', async ({ page }) => {
    await page.route('**/my-company', (route) => route.fulfill({ json: blocked }));

    await login(page);
    await page.goto('/company/onboarding');

    // Кнопки отправки нет вовсе: висящая неактивная кнопка читается как
    // поломка платформы, а не как решение по заявке.
    await expect(page.getByRole('button', { name: 'Отправить на проверку' })).toHaveCount(0);
    await expect(page.getByText(/Подать документы заново нельзя/)).toBeVisible();
});
