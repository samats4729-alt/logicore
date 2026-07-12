import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards, Query, Res } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { PermissionsGuard, RequirePermissions } from '../auth/guards/permissions.guard';
import { UserRole, PaymentDirection } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { Response } from 'express';

const FINANCE_VIEW_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.LOGISTICIAN, UserRole.FORWARDER];
const FINANCE_CHANGE_ROLES = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT];

@Controller('accounting')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@RequirePermissions('accounting')
export class AccountingController {
    constructor(
        private readonly accountingService: AccountingService,
        private readonly emailService: EmailService,
    ) { }

    // ==================== ORDER FINANCIALS ====================

    @Get('orders/:id/financials')
    @Roles(...FINANCE_VIEW_ROLES)
    @RequirePermissions('accounting', 'orders')
    async getOrderFinancials(@Request() req: any, @Param('id') id: string) {
        return this.accountingService.getOrderFinancials(req.user.companyId, id);
    }

    // ==================== FINANCIAL REGISTRY ====================

    @Get('financial-registry')
    @Roles(...FINANCE_VIEW_ROLES)
    async getFinancialRegistry(@Request() req: any) {
        return this.accountingService.getFinancialRegistry(req.user.companyId);
    }

    // ==================== PAYMENT JOURNAL ====================

    @Get('incomes-journal')
    @Roles(...FINANCE_VIEW_ROLES)
    async getIncomesJournal(@Request() req: any) {
        return this.accountingService.getIncomesJournal(req.user.companyId);
    }

    @Get('expenses-journal')
    @Roles(...FINANCE_VIEW_ROLES)
    async getExpensesJournal(@Request() req: any) {
        return this.accountingService.getExpensesJournal(req.user.companyId);
    }

    @Get('customer-expenses-journal')
    @Roles(...FINANCE_VIEW_ROLES)
    async getCustomerExpensesJournal(@Request() req: any) {
        return this.accountingService.getCustomerExpensesJournal(req.user.companyId);
    }

    @Put('orders/:id/customer-paid')
    @Roles(...FINANCE_CHANGE_ROLES)
    async markCustomerPaid(@Request() req: any, @Param('id') id: string, @Body() body: { paid: boolean }) {
        return this.accountingService.markCustomerPaid(req.user.companyId, id, body.paid, req.user.id);
    }

    @Put('orders/:id/driver-paid')
    @Roles(...FINANCE_CHANGE_ROLES)
    async markDriverPaid(@Request() req: any, @Param('id') id: string, @Body() body: { paid: boolean }) {
        return this.accountingService.markDriverPaid(req.user.companyId, id, body.paid, req.user.id);
    }

    @Put('orders/:id/subforwarder-paid')
    @Roles(...FINANCE_CHANGE_ROLES)
    async markSubForwarderPaid(@Request() req: any, @Param('id') id: string, @Body() body: { paid: boolean }) {
        return this.accountingService.markSubForwarderPaid(req.user.companyId, id, body.paid, req.user.id);
    }

    @Put('orders/:id/update-finance')
    @Roles(...FINANCE_CHANGE_ROLES)
    async updateOrderFinance(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        return this.accountingService.updateOrderFinance(req.user.companyId, id, body, req.user.id);
    }

    // ==================== EXPENSES (manual) ====================

    @Get('expenses')
    @Roles(...FINANCE_VIEW_ROLES)
    async getExpenses(@Request() req: any) {
        return this.accountingService.getExpenses(req.user.companyId);
    }

    @Post('expenses')
    @Roles(...FINANCE_CHANGE_ROLES)
    async createExpense(@Request() req: any, @Body() body: any) {
        return this.accountingService.createExpense(req.user.companyId, req.user.id, body);
    }

    @Put('expenses/:id')
    @Roles(...FINANCE_CHANGE_ROLES)
    async updateExpense(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        return this.accountingService.updateExpense(req.user.companyId, id, body);
    }

    @Delete('expenses/:id')
    @Roles(...FINANCE_CHANGE_ROLES)
    async deleteExpense(@Request() req: any, @Param('id') id: string) {
        return this.accountingService.deleteExpense(req.user.companyId, id);
    }

    // ==================== INCOMES (manual) ====================

    @Get('incomes')
    @Roles(...FINANCE_VIEW_ROLES)
    async getIncomes(@Request() req: any) {
        return this.accountingService.getIncomes(req.user.companyId);
    }

    @Post('incomes')
    @Roles(...FINANCE_CHANGE_ROLES)
    async createIncome(@Request() req: any, @Body() body: any) {
        return this.accountingService.createIncome(req.user.companyId, req.user.id, body);
    }

    @Put('incomes/:id')
    @Roles(...FINANCE_CHANGE_ROLES)
    async updateIncome(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        return this.accountingService.updateIncome(req.user.companyId, id, body);
    }

    @Delete('incomes/:id')
    @Roles(...FINANCE_CHANGE_ROLES)
    async deleteIncome(@Request() req: any, @Param('id') id: string) {
        return this.accountingService.deleteIncome(req.user.companyId, id);
    }

    // ==================== COUNTERPARTY REPORT ====================

    @Get('counterparty-report')
    @Roles(...FINANCE_VIEW_ROLES)
    async getCounterpartyReport(@Request() req: any) {
        return this.accountingService.getCounterpartyReport(req.user.companyId);
    }

    // ==================== SHARE REPORT ====================

    @Post('share-report')
    @Roles(...FINANCE_CHANGE_ROLES)
    async shareReport(
        @Request() req: any,
        @Body() body: { counterpartyId: string; ourRole: string; email?: string },
    ) {
        const result = await this.accountingService.generateShareToken(
            req.user.companyId,
            body.counterpartyId,
            body.ourRole,
        );

        if (body.email) {
            const company = await this.accountingService['prisma'].company.findUnique({
                where: { id: req.user.companyId },
                select: { name: true },
            });
            await this.emailService.sendCounterpartyReportEmail(
                body.email,
                result.shareUrl,
                company?.name || 'Компания',
                '',
            );
        }

        return result;
    }

    @Post('send-report-email')
    @Roles(...FINANCE_CHANGE_ROLES)
    async sendReportEmail(
        @Request() req: any,
        @Body() body: { shareUrl: string; email: string },
    ) {
        const company = await this.accountingService['prisma'].company.findUnique({
            where: { id: req.user.companyId },
            select: { name: true },
        });
        await this.emailService.sendCounterpartyReportEmail(
            body.email,
            body.shareUrl,
            company?.name || 'Компания',
            '',
        );
        return { ok: true };
    }

    // ==================== PAYMENTS CRUD ====================

    @Get('payments')
    @Roles(...FINANCE_VIEW_ROLES)
    async getPayments(
        @Request() req: any,
        @Query() query: { startDate?: string; endDate?: string; direction?: any },
    ) {
        return this.accountingService.getPayments(req.user.companyId, query);
    }

    @Get('payments/order/:orderId')
    @Roles(...FINANCE_VIEW_ROLES)
    @RequirePermissions('accounting', 'orders')
    async getPaymentsByOrder(@Request() req: any, @Param('orderId') orderId: string) {
        return this.accountingService.getPaymentsByOrder(req.user.companyId, orderId);
    }

    @Post('payments')
    @Roles(...FINANCE_CHANGE_ROLES)
    async createPayment(@Request() req: any, @Body() body: any) {
        return this.accountingService.createPayment(req.user.companyId, req.user.id, body);
    }

    @Delete('payments/:id')
    @Roles(...FINANCE_CHANGE_ROLES)
    async deletePayment(@Request() req: any, @Param('id') id: string) {
        return this.accountingService.deletePayment(req.user.companyId, id, req.user.id);
    }

    // ==================== DASHBOARD KPI SUMMARY ====================

    @Get('dashboard-summary')
    @Roles(...FINANCE_VIEW_ROLES)
    async getDashboardSummary(
        @Request() req: any,
        @Query() query: { startDate?: string; endDate?: string },
    ) {
        return this.accountingService.getDashboardSummary(req.user.companyId, query);
    }

    // ==================== PERIOD CLOSING ENDPOINTS ====================

    @Get('closed-periods')
    @Roles(...FINANCE_VIEW_ROLES)
    async getClosedPeriods(@Request() req: any) {
        return this.accountingService.getClosedPeriods(req.user.companyId);
    }

    @Post('closed-periods')
    @Roles(...FINANCE_CHANGE_ROLES)
    async closePeriod(@Request() req: any, @Body() body: { year: number; month: number }) {
        return this.accountingService.closePeriod(req.user.companyId, req.user.id, body.year, body.month);
    }

    @Delete('closed-periods/:year/:month')
    @Roles(...FINANCE_CHANGE_ROLES)
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
    @Roles(...FINANCE_VIEW_ROLES)
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
    @Roles(...FINANCE_VIEW_ROLES)
    async exportCounterpartyReport(@Request() req: any, @Res() res: Response) {
        const buffer = await this.accountingService.exportCounterpartyReport(req.user.companyId);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="counterparty-report.xlsx"',
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }

    // ==================== PAYMENTS UPDATE ====================

    @Put('payments/:id')
    @Roles(...FINANCE_CHANGE_ROLES)
    async updatePayment(
        @Request() req: any,
        @Param('id') id: string,
        @Body() body: any,
    ) {
        return this.accountingService.updatePayment(req.user.companyId, id, req.user.id, body);
    }

    // ==================== FINANCE ACCOUNTS CRUD ====================

    @Get('finance-accounts')
    @Roles(...FINANCE_VIEW_ROLES)
    @RequirePermissions('accounting', 'orders')
    async getFinanceAccounts(@Request() req: any) {
        return this.accountingService.getFinanceAccounts(req.user.companyId);
    }

    @Put('finance-accounts/:id')
    @Roles(...FINANCE_CHANGE_ROLES)
    async updateFinanceAccount(
        @Request() req: any,
        @Param('id') id: string,
        @Body() body: { name: string },
    ) {
        return this.accountingService.updateFinanceAccount(req.user.companyId, id, body);
    }

    // ==================== FINANCE CATEGORIES CRUD ====================

    @Get('finance-categories')
    @Roles(...FINANCE_VIEW_ROLES)
    @RequirePermissions('accounting', 'orders')
    async getFinanceCategories(@Request() req: any) {
        return this.accountingService.getFinanceCategories(req.user.companyId);
    }

    @Post('finance-categories')
    @Roles(...FINANCE_CHANGE_ROLES)
    async createFinanceCategory(
        @Request() req: any,
        @Body() body: { name: string; direction: PaymentDirection },
    ) {
        return this.accountingService.createFinanceCategory(req.user.companyId, body);
    }

    @Put('finance-categories/:id')
    @Roles(...FINANCE_CHANGE_ROLES)
    async updateFinanceCategory(
        @Request() req: any,
        @Param('id') id: string,
        @Body() body: { name: string },
    ) {
        return this.accountingService.updateFinanceCategory(req.user.companyId, id, body);
    }

    @Put('finance-categories/:id/deactivate')
    @Roles(...FINANCE_CHANGE_ROLES)
    async deactivateFinanceCategory(
        @Request() req: any,
        @Param('id') id: string,
        @Body() body: { active: boolean },
    ) {
        return this.accountingService.deactivateFinanceCategory(req.user.companyId, id, body.active);
    }

    // ==================== CASH FLOW & P&L REPORTS ====================

    @Get('cashflow')
    @Roles(...FINANCE_VIEW_ROLES)
    async getCashflowReport(
        @Request() req: any,
        @Query() query: { startDate?: string; endDate?: string },
    ) {
        return this.accountingService.getCashflowReport(req.user.companyId, query);
    }

    @Get('cashflow/export')
    @Roles(...FINANCE_VIEW_ROLES)
    async exportCashflowReport(
        @Request() req: any,
        @Query() query: { startDate?: string; endDate?: string },
        @Res() res: Response,
    ) {
        const buffer = await this.accountingService.exportCashflowReport(req.user.companyId, query);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="cashflow.xlsx"',
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }

    @Get('pnl')
    @Roles(...FINANCE_VIEW_ROLES)
    async getPnLReport(
        @Request() req: any,
        @Query() query: { startDate?: string; endDate?: string },
    ) {
        return this.accountingService.getPnLReport(req.user.companyId, query);
    }

    @Get('pnl/export')
    @Roles(...FINANCE_VIEW_ROLES)
    async exportPnLReport(
        @Request() req: any,
        @Query() query: { startDate?: string; endDate?: string },
        @Res() res: Response,
    ) {
        const buffer = await this.accountingService.exportPnLReport(req.user.companyId, query);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="pnl.xlsx"',
            'Content-Length': buffer.length,
        });
        res.end(buffer);
    }
}
