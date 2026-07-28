import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import { AUTH_STATE } from './e2e/helpers';

/**
 * Браузерные тесты веба (задача A-05).
 *
 * До них у фронта не было ни одного теста на 34 000 строк, и поломки
 * интерфейса находил владелец, а не проверки: так всплыла ошибка кнопок
 * «Выдать доверенность» и «Договор-заявка». Здесь проверяются пути, по
 * которым ходят каждый день.
 *
 * Тесты идут против уже запущенных API и веба — поднимать их должен тот,
 * кто запускает прогон (локально или джоба CI). Адреса берём из
 * окружения, чтобы не зашивать порты.
 */

/** В этом окружении Chromium предустановлен, качать его не нужно. */
const PRESET_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = fs.existsSync(PRESET_CHROMIUM) ? PRESET_CHROMIUM : undefined;

export default defineConfig({
    testDir: './e2e',
    // Формы мастера заявки ждут ответов API — с коротким таймаутом тесты
    // мигают, а мигающий тест хуже отсутствующего: его перестают читать.
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : [['list']],
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
        actionTimeout: 20_000,
        navigationTimeout: 60_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        launchOptions: {
            executablePath,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    projects: [
        // Вход делается один раз: у `POST /auth/login` лимит пять запросов
        // в минуту, и прогон, где логинится каждый тест, сам себя блокирует.
        { name: 'setup', testMatch: /auth\.setup\.ts/ },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE },
            dependencies: ['setup'],
            testIgnore: /auth\.setup\.ts/,
        },
    ],
});
