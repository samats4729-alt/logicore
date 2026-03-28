import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('accounting')
@UseGuards(JwtAuthGuard)
export class AccountingController {
    constructor(private readonly accountingService: AccountingService) { }

    // ==================== PAYMENT JOURNAL ====================

    @Get('incomes-journal')
    async getIncomesJournal(@Request() req: any) {
        return this.accountingService.getIncomesJournal(req.user.companyId);
    }

    @Get('expenses-journal')
    async getExpensesJournal(@Request() req: any) {
        return this.accountingService.getExpensesJournal(req.user.companyId);
    }

    @Put('orders/:id/customer-paid')
    async markCustomerPaid(@Request() req: any, @Param('id') id: string, @Body() body: { paid: boolean }) {
        return this.accountingService.markCustomerPaid(req.user.companyId, id, body.paid);
    }

    @Put('orders/:id/driver-paid')
    async markDriverPaid(@Request() req: any, @Param('id') id: string, @Body() body: { paid: boolean }) {
        return this.accountingService.markDriverPaid(req.user.companyId, id, body.paid);
    }

    @Put('orders/:id/update-finance')
    async updateOrderFinance(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        return this.accountingService.updateOrderFinance(req.user.companyId, id, body);
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
}
