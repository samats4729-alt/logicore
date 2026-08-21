import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TelegramAdminService } from './telegram-admin.service';

/**
 * Дверь, в которую стучится Telegram.
 *
 * Без входа по логину — стучится сюда сервер мессенджера, а не человек.
 * Вместо логина адрес защищён двумя замками сразу:
 *
 *   1. Пароль в заголовке. Telegram присылает `X-Telegram-Bot-Api-Secret-Token`
 *      с тем значением, которое мы задали при подписке на обновления. Не
 *      совпало — молча уходим. Пароль сравнивается посимвольно на равном
 *      времени: обычное `===` отвечает тем быстрее, чем раньше расходятся
 *      строки, и по времени ответа пароль подбирается по одному символу.
 *   2. Список разрешённых собеседников внутри `TelegramAdminService`. Даже
 *      если письмо пришло от настоящего Telegram, но пишет чужой человек —
 *      бот ему ничего не расскажет.
 *
 * Пароль не задан — дверь заперта наглухо. Это намеренно: открытый адрес,
 * принимающий команды боту, — это чужие руки на кнопке «Подтвердить компанию».
 *
 * Ответ всегда 200 и всегда сразу. Telegram считает любой другой ответ
 * сбоем и присылает то же обновление снова — по нарастающей, часами. Поэтому
 * разбор идёт после ответа, а его ошибки остаются в журнале.
 */
@ApiExcludeController()
@Controller('telegram')
export class TelegramWebhookController {
    private readonly logger = new Logger(TelegramWebhookController.name);

    constructor(private readonly admin: TelegramAdminService) {}

    @Post('webhook')
    // Настоящий Telegram столько не шлёт. Ограничение здесь против чужого,
    // который нашёл адрес и пробует пароль перебором.
    @Throttle({ default: { limit: 60, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    async webhook(
        @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
        @Body() update: unknown,
    ): Promise<{ ok: true }> {
        const ожидаемый = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
        if (!ожидаемый) {
            this.logger.warn('Пришло обновление, но TELEGRAM_WEBHOOK_SECRET не задан — не открываю.');
            return { ok: true };
        }
        if (!равныеСтроки(secret || '', ожидаемый)) {
            this.logger.warn('Обновление с неверным паролем — проигнорировано.');
            return { ok: true };
        }

        await this.admin.handleUpdate(update);
        return { ok: true };
    }
}

/**
 * Сравнение, не зависящее от того, где строки разошлись.
 *
 * `crypto.timingSafeEqual` требует одинаковой длины и бросает иначе, поэтому
 * длину сначала уравниваем — сама по себе она секретом не является.
 */
function равныеСтроки(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let разница = 0;
    for (let i = 0; i < a.length; i += 1) разница |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return разница === 0;
}
