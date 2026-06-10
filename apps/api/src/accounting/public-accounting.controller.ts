import { Controller, Get, Param } from '@nestjs/common';
import { AccountingService } from './accounting.service';

@Controller('public/accounting')
export class PublicAccountingController {
    constructor(private readonly accountingService: AccountingService) { }

    /**
     * Публичный эндпоинт для просмотра отчёта по токену.
     * Не требует авторизации (JWT).
     */
    @Get('report/:token')
    async getSharedReport(@Param('token') token: string) {
        return this.accountingService.getSharedReport(token);
    }
}
