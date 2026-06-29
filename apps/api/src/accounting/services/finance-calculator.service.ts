import { Injectable } from '@nestjs/common';
import { PaymentDirection } from '@prisma/client';
import { money } from '../../common/utils/money';
import { EXCLUDED_INCOME_CATEGORIES, EXCLUDED_EXPENSE_CATEGORIES } from '../constants';

@Injectable()
export class FinanceCalculatorService {
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
            isCustomerPaid?: boolean | null;
            isDriverPaid?: boolean | null;
            isSubForwarderPaid?: boolean | null;
        };
        payments: Array<{ direction: PaymentDirection; amount: number; companyId: string }>;
        incomes: Array<{ category: string; amount: number; isDeleted?: boolean }>;
        expenses: Array<{ category: string; amount: number; isDeleted?: boolean }>;
        companyId: string;
    }) {
        const { order, payments, incomes, expenses, companyId } = params;

        const isCustomer = order.customerCompanyId === companyId;
        const isForwarder = order.forwarderId === companyId || order.partnerId === companyId;
        const isSubForwarder = order.subForwarderId === companyId;

        const vatRate = order.vatRate ?? 0;
        const hasVat = order.hasVat ?? false;
        const executorVatRate = order.executorVatRate ?? 0;
        const executorHasVat = order.executorHasVat ?? false;

        let revenueGross = 0;
        let executorCostGross = 0;

        if (isCustomer) {
            revenueGross = 0;
            executorCostGross = order.customerPrice || 0;
        } else if (isForwarder) {
            revenueGross = order.customerPrice || 0;
            executorCostGross = order.subForwarderId ? (order.subForwarderPrice || 0) : (order.driverCost || 0);
        } else if (isSubForwarder) {
            revenueGross = order.subForwarderPrice || 0;
            executorCostGross = 0;
        } else {
            revenueGross = order.customerPrice || 0;
            executorCostGross = order.subForwarderId ? (order.subForwarderPrice || 0) : (order.driverCost || 0);
        }

        revenueGross = money(revenueGross);
        executorCostGross = money(executorCostGross);

        // Revenue Net/VAT/Gross
        let revenueNet = revenueGross;
        let revenueVat = 0;
        if (!isCustomer && hasVat && vatRate > 0) {
            revenueNet = money(revenueGross / (1 + vatRate / 100));
            revenueVat = money(revenueGross - revenueNet);
        }

        // Executor Cost Net/VAT/Gross
        let executorCostNet = executorCostGross;
        let executorCostVat = 0;
        if (isCustomer) {
            // For customer, their cost is customerPrice, so they use the customer-side VAT settings
            if (hasVat && vatRate > 0) {
                executorCostNet = money(executorCostGross / (1 + vatRate / 100));
                executorCostVat = money(executorCostGross - executorCostNet);
            }
        } else {
            if (executorHasVat && executorVatRate > 0) {
                executorCostNet = money(executorCostGross / (1 + executorVatRate / 100));
                executorCostVat = money(executorCostGross - executorCostNet);
            }
        }

        // Determine the forwarder company ID
        let forwarderCompId = order.forwarderId || order.partnerId;
        if (!forwarderCompId) {
            const nonForwarderIds = [order.customerCompanyId, order.subForwarderId].filter(Boolean);
            const found = payments.find(p => !nonForwarderIds.includes(p.companyId));
            if (found) {
                forwarderCompId = found.companyId;
            }
        }

        let paidIn = 0;
        let paidOut = 0;

        if (isCustomer) {
            // For Customer, their payments to Forwarder are recorded as IN payments by the Forwarder
            const customerPayments = forwarderCompId
                ? payments.filter(p => p.companyId === forwarderCompId && p.direction === PaymentDirection.IN)
                : [];
            paidIn = customerPayments.reduce((sum, p) => sum + p.amount, 0);
            paidOut = paidIn; // Customer paid this out
        } else if (isSubForwarder) {
            // For Sub-Forwarder, they only look at their own payments
            const subForwarderPayments = payments.filter(p => p.companyId === companyId);
            paidIn = subForwarderPayments.filter(p => p.direction === PaymentDirection.IN).reduce((sum, p) => sum + p.amount, 0);
            paidOut = subForwarderPayments.filter(p => p.direction === PaymentDirection.OUT).reduce((sum, p) => sum + p.amount, 0);
        } else {
            // For Forwarder or main company/admin
            const targetCompId = companyId || forwarderCompId;
            const forwarderPayments = targetCompId
                ? payments.filter(p => p.companyId === targetCompId)
                : payments;
            
            paidIn = forwarderPayments.filter(p => p.direction === PaymentDirection.IN).reduce((sum, p) => sum + p.amount, 0);
            paidOut = forwarderPayments.filter(p => p.direction === PaymentDirection.OUT).reduce((sum, p) => sum + p.amount, 0);
        }

        paidIn = money(paidIn);
        paidOut = money(paidOut);

        const extraIncomes = money(incomes.filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category) && !i.isDeleted).reduce((sum, i) => sum + i.amount, 0));
        const otherExpenses = money(expenses.filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category) && !e.isDeleted).reduce((sum, e) => sum + e.amount, 0));

        const margin = money(revenueNet + extraIncomes - executorCostNet - otherExpenses);
        const customerDebt = money(Math.max(revenueGross - paidIn, 0));
        const executorDebt = money(Math.max(executorCostGross - paidOut, 0));

        let isCustomerPaid = false;
        if (isCustomer) {
            isCustomerPaid = (paidOut >= executorCostGross && executorCostGross > 0) || !!order.isCustomerPaid;
        } else if (isSubForwarder) {
            isCustomerPaid = (paidIn >= revenueGross && revenueGross > 0) || !!order.isSubForwarderPaid;
        } else {
            isCustomerPaid = (paidIn >= revenueGross && revenueGross > 0) || !!order.isCustomerPaid;
        }

        let isExecutorPaid = false;
        if (isCustomer) {
            isExecutorPaid = (paidOut >= executorCostGross && executorCostGross > 0) || !!order.isCustomerPaid;
        } else if (isSubForwarder) {
            isExecutorPaid = false;
        } else {
            isExecutorPaid = (paidOut >= executorCostGross && executorCostGross > 0) || (order.subForwarderId ? !!order.isSubForwarderPaid : !!order.isDriverPaid);
        }

        return {
            revenue: revenueGross,
            revenueNet,
            revenueVat,
            executorCost: executorCostGross,
            executorCostNet,
            executorCostVat,
            extraIncomes,
            otherExpenses,
            paidIn,
            paidOut,
            margin,
            customerDebt,
            executorDebt,
            isCustomerPaid,
            isExecutorPaid,
            isCustomer,
        };
    }
}
