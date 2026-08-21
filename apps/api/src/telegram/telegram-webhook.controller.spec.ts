import { TelegramWebhookController } from './telegram-webhook.controller';

/**
 * За этой дверью — кнопка «Подтвердить компанию». Логина у Telegram нет,
 * значит весь замок здесь: пароль в заголовке.
 *
 * Проверяется ровно одно свойство, но с разных сторон: обновление доходит до
 * разбора только при точном совпадении пароля. Всё остальное — тишина и 200,
 * потому что на любой другой ответ Telegram присылает то же самое снова,
 * по нарастающей, часами.
 */
describe('Вебхук телеграма', () => {
    const окружение = { ...process.env };
    let разобрано: unknown[];
    let controller: TelegramWebhookController;

    beforeEach(() => {
        разобрано = [];
        controller = new TelegramWebhookController({
            handleUpdate: async (update: unknown) => { разобрано.push(update); },
        } as any);
        process.env.TELEGRAM_WEBHOOK_SECRET = 'длинный-случайный-пароль';
    });

    afterEach(() => {
        process.env = { ...окружение };
    });

    const обновление = { message: { chat: { id: '1' }, text: '/stats' } };

    it('с верным паролем обновление уходит в разбор', async () => {
        await controller.webhook('длинный-случайный-пароль', обновление);
        expect(разобрано).toEqual([обновление]);
    });

    it('с неверным паролем не разбирает, но отвечает как ни в чём не бывало', async () => {
        // Отдать 401 — значит подтвердить, что адрес рабочий и пароль просто
        // не тот. Молчаливые 200 не отличить от заглушки.
        const ответ = await controller.webhook('не тот', обновление);

        expect(разобрано).toEqual([]);
        expect(ответ).toEqual({ ok: true });
    });

    it('без заголовка вовсе — тоже мимо', async () => {
        await controller.webhook(undefined, обновление);
        expect(разобрано).toEqual([]);
    });

    it('пустой пароль в настройках запирает дверь, а не открывает', async () => {
        // Самая опасная опечатка: переменную забыли задать, и адрес,
        // принимающий команды боту, оказался бы открыт всему интернету.
        delete process.env.TELEGRAM_WEBHOOK_SECRET;

        await controller.webhook('', обновление);
        await controller.webhook(undefined, обновление);

        expect(разобрано).toEqual([]);
    });

    it('пароль-приставка не подходит', async () => {
        // Сравнение посимвольное и на равном времени; заодно убеждаемся, что
        // это не `startsWith` и не сравнение по длине.
        await controller.webhook('длинный-случайный-парол', обновление);
        await controller.webhook('длинный-случайный-парольX', обновление);

        expect(разобрано).toEqual([]);
    });
});
