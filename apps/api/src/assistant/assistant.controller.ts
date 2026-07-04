import { Controller, Post, Get, Patch, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { AssistantService } from './assistant.service';

@Controller('assistant')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class AssistantController {
    constructor(private readonly assistantService: AssistantService) {}

    @Post('chat')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    async chat(@Body() body: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; context?: string }) {
        return this.assistantService.chat(body?.messages || [], body?.context);
    }

    // ==================== SUPPORT ====================

    @Post('support')
    @Throttle({ default: { limit: 15, ttl: 60000 } })
    async supportChat(
        @Request() req: any,
        @Body() body: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[] },
    ) {
        return this.assistantService.supportChat(body?.messages || [], req.user.sub, req.user.companyId);
    }

    @Post('support/ticket')
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

    @Patch('support/tickets/:id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN)
    async updateTicketStatus(@Param('id') id: string, @Body() body: { status: string }) {
        return this.assistantService.updateTicketStatus(id, body?.status);
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

    @Get('updates/published')
    async publishedUpdates() {
        return this.assistantService.getPublishedPlatformUpdates();
    }
}
