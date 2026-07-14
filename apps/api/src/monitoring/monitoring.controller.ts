import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { captureClientError } from '../common/sentry';

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {

    @Post('client-error')
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Приём ошибок фронтенда (уходят в Sentry, если он настроен)' })
    reportClientError(@Body() body: { message?: string; stack?: string; url?: string }) {
        const message = String(body?.message || 'Unknown client error').slice(0, 500);
        captureClientError({
            message,
            stack: String(body?.stack || '').slice(0, 4000),
            url: String(body?.url || '').slice(0, 300),
        });
    }
}
