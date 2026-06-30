import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssistantService } from './assistant.service';

@Controller('assistant')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class AssistantController {
    constructor(private readonly assistantService: AssistantService) {}

    @Post('chat')
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    async chat(@Body() body: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[] }) {
        return this.assistantService.chat(body?.messages || []);
    }
}
