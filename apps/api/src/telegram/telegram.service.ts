import { Injectable, Logger } from '@nestjs/common';

/**
 * Отправка сообщений в Telegram владельцу платформы.
 *
 * Зачем: обращения пользователей копились в админке, и чтобы их увидеть, надо
 * было туда зайти. Владелец узнавал о поломке, когда сам вспоминал проверить.
 * Теперь сообщение приходит в телеграм сразу — там же, где он и так сидит.
 *
 * Настройка — двумя переменными окружения:
 *   TELEGRAM_BOT_TOKEN — ключ бота от @BotFather
 *   TELEGRAM_CHAT_ID   — куда слать (свой аккаунт, группа или канал)
 *
 * Пока их нет, отправка просто не работает — молча и без ошибок. Это
 * намеренно: обращение должно сохраниться в любом случае, даже если телеграм
 * недоступен или ключ не задан. Потерять обращение хуже, чем не уведомить.
 */
@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);
    private readonly token = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    private readonly chatId = process.env.TELEGRAM_CHAT_ID?.trim() || '';
    /**
     * Адрес API. Меняется только в проверках: подставить свой сервер — это
     * единственный способ убедиться, что сообщение уходит и выглядит как надо,
     * не дёргая живого бота.
     */
    private readonly apiUrl = process.env.TELEGRAM_API_URL?.trim() || 'https://api.telegram.org';

    /** Ограничение Telegram на одно сообщение. */
    private static readonly MAX_LENGTH = 4096;

    /**
     * Сколько ждём ответа. Без ограничения запрос висит сколько угодно, а с
     * ним висит и человек, нажавший «Отправить»: обращение уже сохранено, но
     * галочка не появится, пока мессенджер не ответит. Шесть секунд — заведомо
     * больше нормального ответа телеграма и заведомо меньше, чем терпение.
     */
    private static readonly TIMEOUT_MS = 6000;

    isEnabled(): boolean {
        return Boolean(this.token && this.chatId);
    }

    /**
     * Отправить текст. Никогда не бросает исключение: вызывающий код не должен
     * падать из-за того, что мессенджер не ответил.
     *
     * @returns удалось ли отправить
     */
    async send(text: string): Promise<boolean> {
        if (!this.isEnabled()) return false;

        // Обрезаем по границе, а не по символу: оборванное на полуслове
        // сообщение читать неприятно, а хвост всё равно есть в админке.
        const body = text.length > TelegramService.MAX_LENGTH
            ? `${text.slice(0, TelegramService.MAX_LENGTH - 40).trimEnd()}\n\n…текст обрезан`
            : text;

        try {
            const res = await fetch(`${this.apiUrl}/bot${this.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: body,
                    // Разметку не включаем намеренно. Текст обращения пишет
                    // человек, и любая звёздочка или подчёркивание в нём
                    // ломала бы разбор — сообщение не дошло бы вообще.
                    disable_web_page_preview: true,
                }),
                signal: AbortSignal.timeout(TelegramService.TIMEOUT_MS),
            });

            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                this.logger.warn(`Telegram отказал (${res.status}): ${detail.slice(0, 300)}`);
                return false;
            }
            return true;
        } catch (error: any) {
            this.logger.warn(`Telegram недоступен: ${error?.message}`);
            return false;
        }
    }
}
