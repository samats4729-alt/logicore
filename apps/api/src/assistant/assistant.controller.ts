import { Controller, Post, Get, Patch, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AllowWithoutCompany, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { AssistantService } from './assistant.service';

@Controller('assistant')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class AssistantController {
    constructor(private readonly assistantService: AssistantService) {}

    // Помощник и поддержка нужны в первую очередь тому, кто ещё не смог
    // подключить организацию, — им отказывать нельзя.
    @Post('chat')
    @AllowWithoutCompany()
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    async chat(
        @Request() req: any,
        @Body() body: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; context?: string },
    ) {
        // Роль и права берём из токена, а не из тела запроса: иначе достаточно
        // подменить их в запросе, чтобы гид рассказал про разделы, к которым
        // человека не пускают.
        // Компанию тоже берём из токена, а не из тела: иначе достаточно
        // прислать чужой идентификатор, чтобы гид пересказал чужие рейсы.
        return this.assistantService.chat(
            body?.messages || [],
            body?.context,
            { role: req.user?.role, permissions: req.user?.permissions },
            req.user?.companyId,
        );
    }

    // ==================== SUPPORT ====================

    @Post('support')
    @AllowWithoutCompany()
    @Throttle({ default: { limit: 15, ttl: 60000 } })
    async supportChat(
        @Request() req: any,
        @Body() body: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[] },
    ) {
        return this.assistantService.supportChat(body?.messages || [], req.user.sub, req.user.companyId);
    }

    @Post('support/ticket')
    @AllowWithoutCompany()
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    async createTicket(
        @Request() req: any,
        @Body() body: {
            title: string;
            category?: string;
            severity?: string;
            description: string;
            process?: string;
            where?: string;
            expected?: string;
            actual?: string;
            orders?: string[];
            transcript?: { role: string; content: string }[];
        },
    ) {
        return this.assistantService.createTicket(req.user.sub, req.user.companyId, body);
    }

    @Get('support/tickets')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    async listTickets(@Query('status') status?: string) {
        return this.assistantService.listTickets(status);
    }

    /** Свои обращения: что писала компания и что ей ответили. */
    @Get('support/my')
    @AllowWithoutCompany()
    async myTickets(@Request() req: any) {
        return this.assistantService.listCompanyTickets(req.user.companyId);
    }

    /** Свежие ответы поддержки — для колокольчика. */
    @Get('support/my/answers')
    @AllowWithoutCompany()
    async myAnswers(@Request() req: any) {
        return this.assistantService.listAnsweredTickets(req.user.companyId);
    }

    @Patch('support/tickets/:id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    async updateTicket(
        @Param('id') id: string,
        @Body() body: { status?: string; answer?: string },
        @Request() req: any,
    ) {
        return this.assistantService.updateTicket(id, body || {}, req.user?.sub);
    }

    /** Сколько обращений ещё ни разу не уходило в телеграм. */
    @Get('support/telegram/pending')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    async pendingTelegram() {
        return { pending: await this.assistantService.countPendingTelegram() };
    }

    /**
     * Досыл накопившегося. Частота ограничена: одна пачка — это до сотни
     * сообщений в телеграм. Но не слишком туго: когда обращений накопилось
     * много, пачки жмут подряд, и упереться в лимит на середине обидно.
     */
    @Post('support/telegram/resend')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    @Throttle({ default: { limit: 6, ttl: 60000 } })
    async resendPending(@Body() body: { limit?: number }) {
        return this.assistantService.resendPendingTickets(body?.limit ?? 50);
    }

    @Post('support/tickets/:id/telegram')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    async resendTicket(@Param('id') id: string) {
        return this.assistantService.resendTicket(id);
    }

    // ==================== PLATFORM UPDATES ====================

    @Post('updates/generate')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    async generateUpdates() {
        return this.assistantService.generatePlatformUpdates();
    }

    @Get('updates')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    async listUpdates(@Query('status') status?: string) {
        return this.assistantService.listPlatformUpdates(status);
    }

    @Patch('updates/:id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    async updateUpdate(
        @Param('id') id: string,
        @Body() body: { title?: string; description?: string; status?: string },
    ) {
        return this.assistantService.updatePlatformUpdate(id, body || {});
    }

    // Запрашивается общей обёрткой кабинета, в том числе на экране
    // подключения организации.
    @Get('updates/published')
    @AllowWithoutCompany()
    async publishedUpdates() {
        return this.assistantService.getPublishedPlatformUpdates();
    }
}
