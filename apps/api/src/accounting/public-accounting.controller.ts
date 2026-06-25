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
     * Публичный эндпоинт для выставления счёта по выбранным сделкам из отчёта.
     * Не требует авторизации (JWT).
     */
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Post('report/:token/invoice')
    async createPublicInvoiceFromReport(
        @Param('token') token: string,
        @Body() dto: {
            invoiceNumber: string;
            date: string;
            dueDate?: string;
            orderIds: string[];
            note?: string;
        },
    ) {
        return this.accountingService.createPublicInvoiceFromReport(token, dto);
    }
}
