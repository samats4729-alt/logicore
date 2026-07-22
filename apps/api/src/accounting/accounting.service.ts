import { Injectable } from '@nestjs/common';
import { FinanceCalculatorService } from './services/finance-calculator.service';
import { PeriodClosingService } from './services/period-closing.service';
import { FinancialSettingsService } from './services/financial-settings.service';
import { PaymentsService } from './services/payments.service';
import { FinancialReportsService } from './services/financial-reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentDirection, PaymentMethod, CostType } from '@prisma/client';

@Injectable()
export class AccountingService {
    constructor(
        public readonly prisma: PrismaService,
        private calculatorService: FinanceCalculatorService,
        private periodClosingService: PeriodClosingService,
        private settingsService: FinancialSettingsService,
        private paymentsService: PaymentsService,
        private reportsService: FinancialReportsService,
    ) { }

    // ==================== FINANCIAL CALCULATOR ====================

    computeOrderFinance(params: {
        order: {
            customerPrice?: number | null;
            driverCost?: number | null;
            subForwarderPrice?: number | null;
            customerCompanyId?: string | null;
            forwarderId?: string | null;
            subForwarderId?: string | null;
            partnerId?: string | null;
            vatRate?: number | null;
            hasVat?: boolean | null;
            executorVatRate?: number | null;
            executorHasVat?: boolean | null;
        };
        payments: Array<{ direction: PaymentDirection; amount: number; companyId: string }>;
        incomes: Array<{ category: string; amount: number; isDeleted?: boolean }>;
        expenses: Array<{ category: string; amount: number; isDeleted?: boolean }>;
        companyId: string;
    }) {
        return this.calculatorService.computeOrderFinance(params);
    }

    // ==================== ORDER FINANCIALS ====================

    async getOrderFinancials(companyId: string, orderId: string) {
        return this.reportsService.getOrderFinancials(companyId, orderId);
    }

    async updateOrderFinance(companyId: string, orderId: string, data: {
        customerPrice?: number;
        driverCost?: number;
        subForwarderPrice?: number;
        customerPaymentCondition?: string;
        customerPaymentForm?: string;
        driverPaymentCondition?: string;
        driverPaymentForm?: string;
        vatRate?: number;
        hasVat?: boolean;
        executorVatRate?: number;
        executorHasVat?: boolean;
    }, userId: string) {
        return this.reportsService.updateOrderFinance(companyId, orderId, data, userId);
    }

    // ==================== FINANCIAL REGISTRY ====================

    async getFinancialRegistry(companyId: string) {
        return this.reportsService.getFinancialRegistry(companyId);
    }

    // ==================== PAYMENT JOURNAL ====================

    async getIncomesJournal(companyId: string) {
        return this.reportsService.getIncomesJournal(companyId);
    }

    async getExpensesJournal(companyId: string) {
        return this.reportsService.getExpensesJournal(companyId);
    }

    async getCustomerExpensesJournal(companyId: string) {
        return this.reportsService.getCustomerExpensesJournal(companyId);
    }

    async markCustomerPaid(companyId: string, orderId: string, paid: boolean, userId: string) {
        return this.paymentsService.markCustomerPaid(companyId, orderId, paid, userId);
    }

    async markDriverPaid(companyId: string, orderId: string, paid: boolean, userId: string) {
        return this.paymentsService.markDriverPaid(companyId, orderId, paid, userId);
    }

    async markSubForwarderPaid(companyId: string, orderId: string, paid: boolean, userId: string) {
        return this.paymentsService.markSubForwarderPaid(companyId, orderId, paid, userId);
    }

    // ==================== EXPENSES (manual) ====================

    async getExpenses(companyId: string) {
        return this.paymentsService.getExpenses(companyId);
    }

    async createExpense(companyId: string, userId: string, data: {
        date: string;
        category: string;
        description: string;
        amount: number;
        note?: string;
        orderId?: string;
        accountId?: string;
    }) {
        return this.paymentsService.createExpense(companyId, userId, data);
    }

    async updateExpense(companyId: string, expenseId: string, data: {
        date?: string;
        category?: string;
        description?: string;
        amount?: number;
        note?: string;
        accountId?: string;
    }) {
        return this.paymentsService.updateExpense(companyId, expenseId, data);
    }

    async deleteExpense(companyId: string, expenseId: string) {
        return this.paymentsService.deleteExpense(companyId, expenseId);
    }

    // ==================== INCOMES (manual) ====================

    async getIncomes(companyId: string) {
        return this.paymentsService.getIncomes(companyId);
    }

    async createIncome(companyId: string, userId: string, data: {
        date: string;
        category: string;
        description: string;
        amount: number;
        note?: string;
        orderId?: string;
        accountId?: string;
    }) {
        return this.paymentsService.createIncome(companyId, userId, data);
    }

    async updateIncome(companyId: string, incomeId: string, data: {
        date?: string;
        category?: string;
        description?: string;
        amount?: number;
        note?: string;
        accountId?: string;
    }) {
        return this.paymentsService.updateIncome(companyId, incomeId, data);
    }

    async deleteIncome(companyId: string, incomeId: string) {
        return this.paymentsService.deleteIncome(companyId, incomeId);
    }

    // ==================== COUNTERPARTY REPORT ====================

    async getCounterpartyReport(companyId: string) {
        return this.reportsService.getCounterpartyReport(companyId);
    }

    // ==================== SHARE REPORT ====================

    async generateShareToken(companyId: string, counterpartyId: string, ourRole: string) {
        return this.reportsService.generateShareToken(companyId, counterpartyId, ourRole);
    }

    async getSharedReport(token: string) {
        return this.reportsService.getSharedReport(token);
    }

    async createPublicInvoiceFromReport(
        token: string,
        dto: {
            invoiceNumber: string;
            date: string;
            dueDate?: string;
            orderIds: string[];
            note?: string;
        },
    ) {
        return this.reportsService.createPublicInvoiceFromReport(token, dto);
    }

    // ==================== PAYMENTS CRUD ====================

    async getPayments(companyId: string, query: { startDate?: string; endDate?: string; direction?: PaymentDirection }) {
        return this.paymentsService.getPayments(companyId, query);
    }

    async getPaymentsByOrder(companyId: string, orderId: string) {
        return this.paymentsService.getPaymentsByOrder(companyId, orderId);
    }

    async createPayment(companyId: string, userId: string, data: {
        orderId?: string;
        counterpartyId?: string;
        direction: PaymentDirection;
        amount: number;
        date: string;
        method?: PaymentMethod;
        note?: string;
        accountId?: string;
        categoryId?: string;
    }) {
        return this.paymentsService.createPayment(companyId, userId, data);
    }

    async updatePayment(companyId: string, paymentId: string, userId: string, data: {
        amount?: number;
        date?: string;
        method?: PaymentMethod;
        note?: string;
        counterpartyId?: string;
        accountId?: string;
        categoryId?: string;
    }) {
        return this.paymentsService.updatePayment(companyId, paymentId, userId, data);
    }

    async deletePayment(companyId: string, paymentId: string, userId: string) {
        return this.paymentsService.deletePayment(companyId, paymentId, userId);
    }

    // ==================== PERIOD CLOSING ====================

    async checkPeriodNotClosed(companyId: string, date: Date | string) {
        return this.periodClosingService.checkPeriodNotClosed(companyId, date);
    }

    async getClosedPeriods(companyId: string) {
        return this.periodClosingService.getClosedPeriods(companyId);
    }

    async closePeriod(companyId: string, userId: string, year: number, month: number) {
        return this.periodClosingService.closePeriod(companyId, userId, year, month);
    }

    async openPeriod(companyId: string, userId: string, year: number, month: number) {
        return this.periodClosingService.openPeriod(companyId, userId, year, month);
    }

    // ==================== DASHBOARD SUMMARY ====================

    async getDashboardSummary(companyId: string, query: { startDate?: string; endDate?: string }) {
        return this.reportsService.getDashboardSummary(companyId, query);
    }

    // ==================== EXPORTS ====================

    async exportFinancialRegistry(companyId: string) {
        return this.reportsService.exportFinancialRegistry(companyId);
    }

    async exportCounterpartyReport(companyId: string) {
        return this.reportsService.exportCounterpartyReport(companyId);
    }

    async exportCashflowReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        return this.reportsService.exportCashflowReport(companyId, query);
    }

    async exportPnLReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        return this.reportsService.exportPnLReport(companyId, query);
    }

    // ==================== FINANCE SETTINGS ====================

    async ensureCompanyFinanceSettings(companyId: string) {
        return this.settingsService.ensureCompanyFinanceSettings(companyId);
    }

    async getFinanceAccounts(companyId: string) {
        return this.settingsService.getFinanceAccounts(companyId);
    }

    async updateFinanceAccount(companyId: string, id: string, data: { name?: string; openingBalance?: number; openingDate?: string | null }) {
        return this.settingsService.updateFinanceAccount(companyId, id, data);
    }

    async getAccountBalances(companyId: string) {
        return this.settingsService.getAccountBalances(companyId);
    }

    async getFinanceCategories(companyId: string) {
        return this.settingsService.getFinanceCategories(companyId);
    }

    async createFinanceCategory(companyId: string, data: { name: string; direction: PaymentDirection; costType?: CostType | null }) {
        return this.settingsService.createFinanceCategory(companyId, data);
    }

    async updateFinanceCategory(companyId: string, id: string, data: { name?: string; costType?: CostType | null }) {
        return this.settingsService.updateFinanceCategory(companyId, id, data);
    }

    async deactivateFinanceCategory(companyId: string, id: string, active: boolean) {
        return this.settingsService.deactivateFinanceCategory(companyId, id, active);
    }

    async getCashflowReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        return this.reportsService.getCashflowReport(companyId, query);
    }

    async getPnLReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        return this.reportsService.getPnLReport(companyId, query);
    }
}
