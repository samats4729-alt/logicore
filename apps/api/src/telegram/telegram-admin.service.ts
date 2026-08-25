import { Injectable, Logger } from '@nestjs/common';
import { CompanyVerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TelegramService } from './telegram.service';
import { CompanyVerificationService } from '../company/services/company-verification.service';
import { AdminStatsService } from '../admin-stats/admin-stats.service';
import { formatKzDateTime } from './support-ticket-message';

/**
 * Бот владельца платформы: подтверждать компании и смотреть сводку, не
 * открывая админку.
 *
 * Компании подаются на проверку в любое время, а решение по ним нужно
 * быстрое: пока организация не подтверждена, она не может завести ни одной
 * заявки — то есть просто ждёт. Раньше владелец узнавал о поданной заявке,
 * только когда сам заходил в админку.
 *
 * Сюда попадает всё, что пришло от Telegram. Отсюда — команды и нажатия
 * кнопок.
 *
 * Настройка:
 *   TELEGRAM_BOT_TOKEN      — ключ бота (уже используется для уведомлений)
 *   TELEGRAM_ADMIN_IDS      — кому можно, через запятую: числовые id в Telegram
 *   TELEGRAM_ADMIN_EMAIL    — под кем в системе записывать решения
 *   TELEGRAM_WEBHOOK_SECRET — пароль вебхука, см. контроллер
 */
@Injectable()
export class TelegramAdminService {
    private readonly logger = new Logger(TelegramAdminService.name);

    /**
     * Кому разрешено. Пустой список — бот не делает ничего и только
     * называет собеседнику его номер: без этого узнать свой id неоткуда, а
     * пускать кого попало нельзя ни на секунду.
     */
    private get adminIds(): string[] {
        return (process.env.TELEGRAM_ADMIN_IDS || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
    }

    /** Под кем в системе записывать подтверждение и отказ. */
    private get reviewerEmail(): string {
        return (process.env.TELEGRAM_ADMIN_EMAIL || '').trim().toLowerCase();
    }

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly telegram: TelegramService,
        private readonly verification: CompanyVerificationService,
        private readonly stats: AdminStatsService,
    ) {}

    /**
     * Всё, что прислал Telegram.
     *
     * Никогда не бросает: Telegram повторяет неотвеченные обновления, и
     * одна ошибка разбора превратилась бы в бесконечный поток повторов.
     */
    async handleUpdate(update: any): Promise<void> {
        try {
            if (update?.callback_query) await this.handleCallback(update.callback_query);
            else if (update?.message) await this.handleMessage(update.message);
        } catch (error: any) {
            this.logger.warn(`Не смог разобрать обновление: ${error?.message}`);
        }
    }

    // ==================== ДОСТУП ====================

    private allowed(chatId: string): boolean {
        return this.adminIds.includes(chatId);
    }

    /**
     * Отказ незнакомцу.
     *
     * Пока список пуст, бот называет номер собеседника: это единственный
     * способ узнать свой id, и он безопасен — делать бот всё равно ничего
     * не станет, пока номер не впишут в настройки.
     */
    private async denyAccess(chatId: string): Promise<void> {
        if (!this.adminIds.length) {
            await this.telegram.sendTo(chatId,
                'Бот ещё никому не открыт.\n\n'
                + `Ваш номер в Telegram: ${chatId}\n`
                + 'Впишите его в переменную TELEGRAM_ADMIN_IDS и перезапустите сервер.');
            return;
        }
        await this.telegram.sendTo(chatId, 'Доступ закрыт.');
        this.logger.warn(`Чужой стучится в бот: ${chatId}`);
    }

    /**
     * Кем подписать решение.
     *
     * Подтверждение компании — действие с последствиями, и в истории должно
     * стоять имя, а не «бот». Не нашли такого администратора — не делаем:
     * лучше отказать, чем записать решение на неизвестно кого.
     */
    private async reviewer(): Promise<{ id: string; name: string } | null> {
        if (!this.reviewerEmail) return null;
        const user = await this.prisma.user.findFirst({
            where: { email: this.reviewerEmail, role: 'ADMIN' },
            select: { id: true, firstName: true, lastName: true },
        });
        if (!user) return null;
        return { id: user.id, name: `${user.lastName || ''} ${user.firstName || ''}`.trim() || this.reviewerEmail };
    }

    // ==================== СООБЩЕНИЯ ====================

    private async handleMessage(message: any): Promise<void> {
        const chatId = String(message?.chat?.id ?? '');
        const text = String(message?.text ?? '').trim();
        if (!chatId) return;
        if (!this.allowed(chatId)) return this.denyAccess(chatId);

        // Ждём причину отказа — значит это она и есть, а не команда.
        const ожидание = await this.redis.get(this.rejectKey(chatId));
        if (ожидание && !text.startsWith('/')) {
            await this.redis.del(this.rejectKey(chatId));
            return this.rejectCompany(chatId, ожидание, text);
        }

        const [command] = text.split(/\s+/);
        switch (command) {
            case '/start':
            case '/help':
                return this.sendHelp(chatId);
            case '/pending':
                return this.sendPending(chatId);
            case '/stats':
                return this.sendStats(chatId);
            default:
                await this.telegram.sendTo(chatId, 'Не понял. /help — что я умею.');
        }
    }

    private async sendHelp(chatId: string): Promise<void> {
        await this.telegram.sendTo(chatId,
            'LogiCore — бот владельца.\n\n'
            + '/pending — компании, ждущие проверки\n'
            + '/stats — сводка по платформе\n\n'
            + 'По каждой компании приходят её данные, документы и кнопки '
            + '«Подтвердить» и «Отклонить».');
    }

    // ==================== ОЧЕРЕДЬ ПРОВЕРКИ ====================

    private async sendPending(chatId: string): Promise<void> {
        const компании = await this.verification.listForReview(CompanyVerificationStatus.PENDING);
        if (!компании.length) {
            await this.telegram.sendTo(chatId, 'Очередь пуста — проверять нечего.');
            return;
        }
        for (const company of компании.slice(0, 10)) {
            await this.sendCompanyCard(chatId, company);
        }
        if (компании.length > 10) {
            await this.telegram.sendTo(chatId, `…и ещё ${компании.length - 10}. Разберите эти — покажу следующие.`);
        }
    }

    /** Карточка компании: что подали и чем решать. */
    async sendCompanyCard(chatId: string, company: any): Promise<void> {
        const строки = [
            company.name,
            company.bin ? `БИН/ИИН: ${company.bin}` : null,
            company.directorName ? `Директор: ${company.directorName}` : null,
            company.email ? `Почта: ${company.email}` : null,
            company.phone ? `Телефон: ${company.phone}` : null,
            company.verificationSubmittedAt
                ? `Подана: ${formatKzDateTime(new Date(company.verificationSubmittedAt))}`
                : null,
            `Документов: ${company.documents?.length ?? 0}`,
        ].filter(Boolean);

        await this.telegram.sendTo(chatId, строки.join('\n'), [
            [
                { text: '📄 Документы', callback_data: `docs:${company.id}` },
            ],
            [
                { text: '✅ Подтвердить', callback_data: `approve:${company.id}` },
                { text: '✖️ Отклонить', callback_data: `reject:${company.id}` },
            ],
        ]);
    }

    // ==================== СВОДКА ====================

    private async sendStats(chatId: string): Promise<void> {
        const s: any = await this.stats.getOverview();
        const деньги = (v: number) => Math.round(v || 0).toLocaleString('ru-RU');
        await this.telegram.sendTo(chatId, [
            'Сводка по платформе',
            '',
            `Компаний: ${s.companies.total} (за 30 дней +${s.companies.new30})`,
            `Сотрудников: ${s.users.office}, водителей: ${s.users.drivers}`,
            '',
            `Заявок всего: ${s.orders.total}`,
            `За месяц: ${s.orders.month}`,
            `В работе: ${s.orders.active}, завершено: ${s.orders.completed}`,
            s.orders.problem ? `С проблемой: ${s.orders.problem}` : null,
            '',
            `Оборот за месяц: ${деньги(s.gmvMonth)} ₸`,
            s.openTickets ? `Открытых обращений: ${s.openTickets}` : 'Открытых обращений нет',
        ].filter((line) => line !== null).join('\n'));
    }

    // ==================== КНОПКИ ====================

    private rejectKey(chatId: string): string {
        return `telegram:reject:${chatId}`;
    }

    private async handleCallback(callback: any): Promise<void> {
        const chatId = String(callback?.message?.chat?.id ?? '');
        const data = String(callback?.data ?? '');
        await this.telegram.answerCallback(callback?.id);
        if (!chatId) return;
        if (!this.allowed(chatId)) return this.denyAccess(chatId);

        const [действие, companyId] = data.split(':');
        if (!companyId) return;

        if (действие === 'docs') return this.sendDocuments(chatId, companyId);
        if (действие === 'approve') return this.approveCompany(chatId, companyId);
        if (действие === 'reject') {
            // Причину не выбирают из списка: она уходит в компанию текстом, и
            // человеку важно прочитать, что именно исправить.
            await this.redis.set(this.rejectKey(chatId), companyId, 900);
            await this.telegram.sendTo(chatId, 'Напишите причину отказа одним сообщением — я передам её компании.');
        }
    }

    private async sendDocuments(chatId: string, companyId: string): Promise<void> {
        const компании = await this.verification.listForReview(CompanyVerificationStatus.PENDING);
        const company = компании.find((c: any) => c.id === companyId);
        if (!company) {
            // Кнопки живут в переписке вечно, а очередь меняется. Нажали на
            // вчерашнее сообщение — надо сказать прямо, а не отвечать
            // «документов нет»: это разные вещи и разные действия дальше.
            await this.telegram.sendTo(chatId, 'Этой компании в очереди уже нет — решение по ней принято.');
            return;
        }
        const документы = company.documents ?? [];
        if (!документы.length) {
            await this.telegram.sendTo(chatId, 'Документов не приложено.');
            return;
        }

        for (const doc of документы) {
            try {
                const файл = await this.verification.readDocument(doc.id);
                const buffer = await streamToBuffer(файл.stream);
                const подпись = [company.name, doc.type].filter(Boolean).join(' · ');
                await this.telegram.sendDocument(
                    chatId,
                    { buffer, name: файл.fileName || 'документ', mimeType: файл.mimeType || undefined },
                    подпись,
                );
            } catch (error: any) {
                await this.telegram.sendTo(chatId, `Не удалось достать «${doc.fileName}»: ${error?.message}`);
            }
        }
    }

    private async approveCompany(chatId: string, companyId: string): Promise<void> {
        const кто = await this.reviewer();
        if (!кто) {
            await this.telegram.sendTo(chatId,
                'Не могу подтвердить: не задано, под кем записывать решение.\n'
                + 'Укажите TELEGRAM_ADMIN_EMAIL — почту администратора платформы.');
            return;
        }
        try {
            const company: any = await this.verification.approve(companyId, кто.id);
            await this.telegram.sendTo(chatId, `Подтверждено: ${company?.name || companyId}. Компания может работать.`);
        } catch (error: any) {
            await this.telegram.sendTo(chatId, `Не вышло: ${error?.message || 'ошибка'}`);
        }
    }

    private async rejectCompany(chatId: string, companyId: string, reason: string): Promise<void> {
        const причина = reason.trim();
        if (!причина) {
            await this.telegram.sendTo(chatId, 'Причина пустая — компания не поймёт, что исправлять. Отказ не отправлен.');
            return;
        }
        const кто = await this.reviewer();
        if (!кто) {
            await this.telegram.sendTo(chatId, 'Не могу отклонить: не задан TELEGRAM_ADMIN_EMAIL.');
            return;
        }
        try {
            const company: any = await this.verification.reject(companyId, кто.id, причина);
            await this.telegram.sendTo(chatId, `Отклонено: ${company?.name || companyId}.\nПричина ушла компании.`);
        } catch (error: any) {
            await this.telegram.sendTo(chatId, `Не вышло: ${error?.message || 'ошибка'}`);
        }
    }

    // ==================== ИЗВЕЩЕНИЕ О ПОДАЧЕ ====================

    /**
     * Компания подалась на проверку — сразу карточка с кнопками.
     *
     * Ради этого всё и затевалось: пока организация не подтверждена, она не
     * может завести ни одной заявки и просто ждёт.
     */
    async notifySubmitted(companyId: string): Promise<void> {
        const чаты = this.adminIds;
        if (!чаты.length || !this.telegram.hasToken()) return;
        try {
            const компании = await this.verification.listForReview(CompanyVerificationStatus.PENDING);
            const company = компании.find((c: any) => c.id === companyId);
            if (!company) return;
            for (const chatId of чаты) {
                await this.telegram.sendTo(chatId, 'Новая компания на проверку:');
                await this.sendCompanyCard(chatId, company);
            }
        } catch (error: any) {
            this.logger.warn(`Не смог сообщить о подаче: ${error?.message}`);
        }
    }
}

/** Документ читается потоком, а Telegram принимает его целиком. */
async function streamToBuffer(stream: any): Promise<Buffer> {
    const части: Buffer[] = [];
    for await (const кусок of stream) {
        части.push(Buffer.isBuffer(кусок) ? кусок : Buffer.from(кусок));
    }
    return Buffer.concat(части);
}
