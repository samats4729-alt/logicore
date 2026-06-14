import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountingService } from './accounting.service';

@Controller('public/accounting')
export class PublicAccountingController {
    constructor(private readonly accountingService: AccountingService) { }

    /**
     * Публичный эндпоинт для просмотра отчёта по токену.
     * Не требует авторизации (JWT).
     */
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Get('report/:token')
    async getSharedReport(@Param('token') token: string) {
        return this.accountingService.getSharedReport(token);
    }
}
