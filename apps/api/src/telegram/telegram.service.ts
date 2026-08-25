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

    /** Бот настроен, даже если чат владельца не задан — команды всё равно ходят. */
    hasToken(): boolean {
        return Boolean(this.token);
    }

    /**
     * Отправить текст. Никогда не бросает исключение: вызывающий код не должен
     * падать из-за того, что мессенджер не ответил.
     *
     * @returns удалось ли отправить
     */
    async send(text: string): Promise<boolean> {
        if (!this.isEnabled()) return false;
        return this.sendTo(this.chatId, text);
    }

    /**
     * Тот же текст, но в указанный чат — боту отвечают туда, откуда написали.
     *
     * Кнопки под сообщением (`keyboard`) — способ подтвердить компанию, не
     * набирая команду: владелец читает карточку с телефона и нажимает.
     */
    async sendTo(chatId: string | number, text: string, keyboard?: unknown): Promise<boolean> {
        if (!this.hasToken()) return false;

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
                    chat_id: chatId,
                    text: body,
                    // Разметку не включаем намеренно. Текст обращения пишет
                    // человек, и любая звёздочка или подчёркивание в нём
                    // ломала бы разбор — сообщение не дошло бы вообще.
                    disable_web_page_preview: true,
                    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
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

    /**
     * Отправить файл — устав, справку, скан приказа.
     *
     * Владелец смотрит поданные документы с телефона и тут же решает. Ради
     * этого документ уезжает с нашего сервера на серверы Telegram; решение
     * владельца от 21.08.2026 — так удобнее, чем открывать админку.
     */
    async sendDocument(
        chatId: string | number,
        file: { buffer: Buffer; name: string; mimeType?: string },
        caption?: string,
    ): Promise<boolean> {
        if (!this.hasToken()) return false;

        try {
            const form = new FormData();
            form.append('chat_id', String(chatId));
            if (caption) form.append('caption', caption.slice(0, 1000));
            form.append(
                'document',
                new Blob([new Uint8Array(file.buffer)], { type: file.mimeType || 'application/octet-stream' }),
                file.name,
            );

            const res = await fetch(`${this.apiUrl}/bot${this.token}/sendDocument`, {
                method: 'POST',
                body: form,
                // Файл тяжелее текста, поэтому и ждём дольше: обрыв на
                // середине оставил бы владельца без документа, ради которого
                // он и открыл переписку.
                signal: AbortSignal.timeout(TelegramService.TIMEOUT_MS * 5),
            });
            if (!res.ok) {
                this.logger.warn(`Telegram не принял файл (${res.status})`);
                return false;
            }
            return true;
        } catch (error: any) {
            this.logger.warn(`Telegram недоступен при отправке файла: ${error?.message}`);
            return false;
        }
    }

    /**
     * Погасить «часики» на нажатой кнопке.
     *
     * Telegram крутит их, пока не ответишь, и человеку кажется, что бот завис.
     */
    async answerCallback(callbackId: string, text?: string): Promise<void> {
        if (!this.hasToken()) return;
        try {
            await fetch(`${this.apiUrl}/bot${this.token}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: callbackId, text: text?.slice(0, 200) }),
                signal: AbortSignal.timeout(TelegramService.TIMEOUT_MS),
            });
        } catch {
            // Часики покрутятся и погаснут сами — это не повод падать.
        }
    }
}
