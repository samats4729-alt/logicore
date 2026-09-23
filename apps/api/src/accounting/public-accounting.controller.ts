import { Controller, Get, Post, Param, Body } from '@nestjs/common';
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

    /**
     * Постоянная ссылка заказчика: его счета и сделки.
     *
     * Отдельный путь от сверки с перевозчиком. Ссылка живёт годами, поэтому
     * ограничение частоты здесь тем более обязательно.
     */
    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @Get('client/:token')
    async getClientPortal(@Param('token') token: string) {
        return this.accountingService.getClientPortal(token);
    }
}
