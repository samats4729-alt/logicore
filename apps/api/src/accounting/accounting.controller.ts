import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards, Query, Res } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailService } from '../email/email.service';
import { Response } from 'express';

@Controller('accounting')
@UseGuards(JwtAuthGuard)
export class AccountingController {
    constructor(
        private readonly accountingService: AccountingService,
        private readonly emailService: EmailService,
    ) { }

    // ==================== ORDER FINANCIALS ====================

    @Get('orders/:id/financials')
    async getOrderFinancials(@Request() req: any, @Param('id') id: string) {
        return this.accountingService.getOrderFinancials(req.user.companyId, id);
    }

    // ==================== FINANCIAL REGISTRY ====================

    @Get('financial-registry')
    async getFinancialRegistry(@Request() req: any) {
        return this.accountingService.getFinancialRegistry(req.user.companyId);
    }

    // ==================== PAYMENT JOURNAL ====================

    @Get('incomes-journal')
    async getIncomesJournal(@Request() req: any) {
        return this.accountingService.getIncomesJournal(req.user.companyId);
    }

    @Get('expenses-journal')
    async getExpensesJournal(@Request() req: any) {
        return this.accountingService.getExpensesJournal(req.user.companyId);
    }

    @Get('customer-expenses-journal')
    async getCustomerExpensesJournal(@Request() req: any) {
        return this.accountingService.getCustomerExpensesJournal(req.user.companyId);
    }

    @Put('orders/:id/customer-paid')
    async markCustomerPaid(@Request() req: any, @Param('id') id: string, @Body() body: { paid: boolean }) {
        return this.accountingService.markCustomerPaid(req.user.companyId, id, body.paid, req.user.id);
    }

    @Put('orders/:id/driver-paid')
    async markDriverPaid(@Request() req: any, @Param('id') id: string, @Body() body: { paid: boolean }) {
        return this.accountingService.markDriverPaid(req.user.companyId, id, body.paid, req.user.id);
    }

    @Put('orders/:id/subforwarder-paid')
    async markSubForwarderPaid(@Request() req: any, @Param('id') id: string, @Body() body: { paid: boolean }) {
        return this.accountingService.markSubForwarderPaid(req.user.companyId, id, body.paid, req.user.id);
    }

    @Put('orders/:id/update-finance')
    async updateOrderFinance(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        return this.accountingService.updateOrderFinance(req.user.companyId, id, body, req.user.id);
    }

    // ==================== EXPENSES (manual) ====================

    @Get('expenses')
    async getExpenses(@Request() req: any) {
        return this.accountingService.getExpenses(req.user.companyId);
    }

    @Post('expenses')
    async createExpense(@Request() req: any, @Body() body: any) {
        return this.accountingService.createExpense(req.user.companyId, req.user.id, body);
    }

    @Put('expenses/:id')
    async updateExpense(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        return this.accountingService.updateExpense(req.user.companyId, id, body);
    }

    @Delete('expenses/:id')
    async deleteExpense(@Request() req: any, @Param('id') id: string) {
        return this.accountingService.deleteExpense(req.user.companyId, id);
    }

    // ==================== INCOMES (manual) ====================

    @Get('incomes')
    async getIncomes(@Request() req: any) {
        return this.accountingService.getIncomes(req.user.companyId);
    }

    @Post('incomes')
    async createIncome(@Request() req: any, @Body() body: any) {
        return this.accountingService.createIncome(req.user.companyId, req.user.id, body);
    }

    @Put('incomes/:id')
    async updateIncome(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        return this.accountingService.updateIncome(req.user.companyId, id, body);
    }

    @Delete('incomes/:id')
    async deleteIncome(@Request() req: any, @Param('id') id: string) {
        return this.accountingService.deleteIncome(req.user.companyId, id);
    }

    // ==================== COUNTERPARTY REPORT ====================

    @Get('counterparty-report')
    async getCounterpartyReport(@Request() req: any) {
        return this.accountingService.getCounterpartyReport(req.user.companyId);
    }

    // ==================== SHARE REPORT ====================

    @Post('share-report')
    async shareReport(
        @Request() req: any,
        @Body() body: { counterpartyId: string; ourRole: string; email?: string },
    ) {
        const result = await this.accountingService.generateShareToken(
            req.user.companyId,
            body.counterpartyId,
            body.ourRole,
        );

        // Если передан email — отправляем письмо
        if (body.email) {
            try {
                // Получаем название компании отправителя
                const company = await this.accountingService['prisma'].company.findUnique({
                    where: { id: req.user.companyId },
                    select: { name: true },
                });
                await this.emailService.sendCounterpartyReportEmail(
                    body.email,
                    result.shareUrl,
                    company?.name || 'Компания',
                    '', // counterparty name будет виден из контекста
                );
            } catch (err) {
                console.error('Ошибка отправки email отчёта:', err);
            }
        }

        return result;
    }

    // ==================== PAYMENTS CRUD ====================

    @Get('payments')
    async getPayments(
        @Request() req: any,
        @Query() query: { startDate?: string; endDate?: string; direction?: any },
    ) {
        return this.accountingService.getPayments(req.user.companyId, query);
    }

    @Get('payments/order/:orderId')
    async getPaymentsByOrder(@Request() req: any, @Param('orderId') orderId: string) {
        return this.accountingService.getPaymentsByOrder(req.user.companyId, orderId);
    }

    @Post('payments')
    async createPayment(@Request() req: any, @Body() body: any) {
        return this.accountingService.createPayment(req.user.companyId, req.user.id, body);
    }

    @Delete('payments/:id')
    async deletePayment(@Request() req: any, @Param('id') id: string) {
        return this.accountingService.deletePayment(req.user.companyId, id, req.user.id);
    }

    // ==================== DASHBOARD KPI SUMMARY ====================

    @Get('dashboard-summary')
    async getDashboardSummary(
        @Request() req: any,
        @Query() query: { startDate?: string; endDate?: string },
    ) {
        return this.accountingService.getDashboardSummary(req.user.companyId, query);
    }

    // ==================== PERIOD CLOSING ENDPOINTS ====================

    @Get('closed-periods')
    async getClosedPeriods(@Request() req: any) {
        return this.accountingService.getClosedPeriods(req.user.companyId);
    }

    @Post('closed-periods')
    async closePeriod(@Request() req: any, @Body() body: { year: number; month: number }) {
        return this.accountingService.closePeriod(req.user.companyId, req.user.id, body.year, body.month);
    }

    @Delete('closed-periods/:year/:month')
    async openPeriod(
        @Request() req: any,
        @Param('year') year: string,
        @Param('month') month: string,
    ) {
        return this.accountingService.openPeriod(
            req.user.companyId,
            req.user.id,
            parseInt(year, 10),
            parseInt(month, 10),
        );
    }

    // ==================== EXCEL EXPORTS ====================

    @Get('financial-registry/export')
    async exportFinancialRegistry(@Request() req: any, @Res() res: Response) {
        const buffer = await this.accountingService.exportFinancialRegistry(req.user.companyId);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="financial-registry.xlsx"',
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }

    @Get('counterparty-report/export')
    async exportCounterpartyReport(@Request() req: any, @Res() res: Response) {
        const buffer = await this.accountingService.exportCounterpartyReport(req.user.companyId);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="counterparty-report.xlsx"',
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }
}
