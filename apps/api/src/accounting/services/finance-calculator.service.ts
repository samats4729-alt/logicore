import { Injectable } from '@nestjs/common';
import { PaymentDirection } from '@prisma/client';
import { money, moneyGte } from '../../common/utils/money';
import { EXCLUDED_INCOME_CATEGORIES, EXCLUDED_EXPENSE_CATEGORIES } from '../constants';

// Архитектурная заметка (см. аудит M-9): computeOrderFinance() и
// PaymentsService.syncOrderPaymentFlags() выглядят как дублирование одной и
// той же логики «оплачено ли», но НЕ являются им — у них разная и осознанно
// разделённая роль:
//
//   - syncOrderPaymentFlags — канонический расчёт с полной видимостью
//     платежей ОБЕИХ сторон заявки. Его результат ПЕРСИСТИТСЯ в
//     Order.isCustomerPaid/isDriverPaid/isSubForwarderPaid — это единый
//     глобальный факт «оплачено», не зависящий от того, кто спрашивает.
//   - computeOrderFinance — расчёт «с точки зрения» конкретной компании
//     (companyId) для отображения в её кабинете, ограниченный платежами,
//     которые видны ЭТОЙ компании. Поэтому он намеренно берёт OR с уже
//     сохранённым каноническим флагом (order.isCustomerPaid и т.п.) —
//     это фолбэк на канонический факт, когда локальная видимость платежей
//     неполная (например, платёж провела встречная сторона сделки).
//
// Слияние их в одну функцию убрало бы этот фолбэк и либо сломало бы
// персистентность канонического флага, либо сделало бы канонический расчёт
// зависимым от того, кто его вызывает. Единая часть, которая ДЕЙСТВИТЕЛЬНО
// дублировалась — сравнение суммы платежей с порогом — уже вынесена в
// moneyGte() и используется в обоих местах одинаково.
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
            // Customer's payment can be recorded by either side: as the forwarder's IN
            // or as the customer's own OUT. Take max to avoid double counting.
            const forwarderIn = forwarderCompId
                ? payments.filter(p => p.companyId === forwarderCompId && p.direction === PaymentDirection.IN).reduce((sum, p) => sum + p.amount, 0)
                : 0;
            const ownOut = payments.filter(p => p.companyId === companyId && p.direction === PaymentDirection.OUT).reduce((sum, p) => sum + p.amount, 0);
            paidIn = Math.max(forwarderIn, ownOut);
            paidOut = paidIn; // Customer paid this out
        } else if (isSubForwarder) {
            // Sub-forwarder is paid by the forwarder: mirror the forwarder's OUT payments
            // as our income (or our own recorded IN, whichever side recorded it).
            const subForwarderPayments = payments.filter(p => p.companyId === companyId);
            const ownIn = subForwarderPayments.filter(p => p.direction === PaymentDirection.IN).reduce((sum, p) => sum + p.amount, 0);
            const forwarderOut = forwarderCompId
                ? payments.filter(p => p.companyId === forwarderCompId && p.direction === PaymentDirection.OUT).reduce((sum, p) => sum + p.amount, 0)
                : 0;
            paidIn = Math.max(ownIn, forwarderOut);
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
            isCustomerPaid = (executorCostGross > 0 && moneyGte(paidOut, executorCostGross)) || !!order.isCustomerPaid;
        } else if (isSubForwarder) {
            isCustomerPaid = (revenueGross > 0 && moneyGte(paidIn, revenueGross)) || !!order.isSubForwarderPaid;
        } else {
            isCustomerPaid = (revenueGross > 0 && moneyGte(paidIn, revenueGross)) || !!order.isCustomerPaid;
        }

        let isExecutorPaid = false;
        if (isCustomer) {
            isExecutorPaid = (executorCostGross > 0 && moneyGte(paidOut, executorCostGross)) || !!order.isCustomerPaid;
        } else if (isSubForwarder) {
            isExecutorPaid = false;
        } else {
            isExecutorPaid = (executorCostGross > 0 && moneyGte(paidOut, executorCostGross)) || (order.subForwarderId ? !!order.isSubForwarderPaid : !!order.isDriverPaid);
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
