import { Injectable } from '@nestjs/common';
import { PaymentDirection, Prisma } from '@prisma/client';
import { D, Money, ZERO, roundMoney, sumOf } from '../../common/utils/money';
import { EXCLUDED_INCOME_CATEGORIES, EXCLUDED_EXPENSE_CATEGORIES } from '../constants';

/** Суммы приходят из базы как Decimal, из DTO — как числа. */
type Amount = Money | number | null | undefined;

/**
 * Поля заявки, которые нужны computeOrderFinance — и только они.
 *
 * У Order около семидесяти колонок, а расчёту нужно пятнадцать. Без явного
 * select Prisma тянет строки целиком: на отчёте по нескольким тысячам заявок
 * это мегабайты лишних данных из базы в память приложения. Экспортируется,
 * чтобы все тяжёлые выборки просили одно и то же и не расходились.
 */
export const ORDER_FINANCE_SELECT = {
    customerPrice: true,
    driverCost: true,
    subForwarderPrice: true,
    customerCompanyId: true,
    forwarderId: true,
    subForwarderId: true,
    partnerId: true,
    vatRate: true,
    hasVat: true,
    executorVatRate: true,
    executorHasVat: true,
    isCustomerPaid: true,
    isDriverPaid: true,
    isSubForwarderPaid: true,
} satisfies Prisma.OrderSelect;

/**
 * Связанные записи в том же объёме: расчёту нужны направление и сумма
 * платежа, категория и сумма дохода/расхода. Остальные колонки не читаются.
 */
export const ORDER_FINANCE_RELATIONS_SELECT = {
    payments: { where: { isDeleted: false }, select: { direction: true, amount: true, companyId: true } },
    incomes: { where: { isDeleted: false }, select: { category: true, amount: true, isDeleted: true } },
    expenses: { where: { isDeleted: false }, select: { category: true, amount: true, isDeleted: true } },
} satisfies Prisma.OrderSelect;

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
// зависимым от того, кто его вызывает. Сравнение суммы платежей с порогом
// раньше требовало обходного moneyGte из-за погрешности плавающей точки;
// теперь суммы — Decimal, и обе стороны сравнивают их точным .gte().
@Injectable()
export class FinanceCalculatorService {
    computeOrderFinance(params: {
        order: {
            customerPrice?: Amount;
            driverCost?: Amount;
            subForwarderPrice?: Amount;
            customerCompanyId?: string | null;
            forwarderId?: string | null;
            subForwarderId?: string | null;
            partnerId?: string | null;
            vatRate?: Amount;
            hasVat?: boolean | null;
            executorVatRate?: Amount;
            executorHasVat?: boolean | null;
            isCustomerPaid?: boolean | null;
            isDriverPaid?: boolean | null;
            isSubForwarderPaid?: boolean | null;
        };
        payments: Array<{ direction: PaymentDirection; amount: Amount; companyId: string }>;
        incomes: Array<{ category: string; amount: Amount; isDeleted?: boolean }>;
        expenses: Array<{ category: string; amount: Amount; isDeleted?: boolean }>;
        companyId: string;
    }) {
        const { order, payments, incomes, expenses, companyId } = params;

        const isCustomer = order.customerCompanyId === companyId;
        const isForwarder = order.forwarderId === companyId || order.partnerId === companyId;
        const isSubForwarder = order.subForwarderId === companyId;

        const vatRate = D(order.vatRate);
        const hasVat = order.hasVat ?? false;
        const executorVatRate = D(order.executorVatRate);
        const executorHasVat = order.executorHasVat ?? false;

        const customerPrice = D(order.customerPrice);
        const subForwarderPrice = D(order.subForwarderPrice);
        const driverCost = D(order.driverCost);

        let revenueGross: Money;
        let executorCostGross: Money;

        if (isCustomer) {
            revenueGross = ZERO;
            executorCostGross = customerPrice;
        } else if (isForwarder) {
            revenueGross = customerPrice;
            executorCostGross = order.subForwarderId ? subForwarderPrice : driverCost;
        } else if (isSubForwarder) {
            revenueGross = subForwarderPrice;
            executorCostGross = ZERO;
        } else {
            revenueGross = customerPrice;
            executorCostGross = order.subForwarderId ? subForwarderPrice : driverCost;
        }

        revenueGross = roundMoney(revenueGross);
        executorCostGross = roundMoney(executorCostGross);

        /** Выделение нетто из суммы, включающей НДС. */
        const netOf = (gross: Money, rate: Money) =>
            roundMoney(gross.div(rate.div(100).plus(1)));

        // Revenue Net/VAT/Gross
        let revenueNet = revenueGross;
        let revenueVat = ZERO;
        if (!isCustomer && hasVat && vatRate.gt(0)) {
            revenueNet = netOf(revenueGross, vatRate);
            revenueVat = roundMoney(revenueGross.minus(revenueNet));
        }

        // Executor Cost Net/VAT/Gross
        let executorCostNet = executorCostGross;
        let executorCostVat = ZERO;
        if (isCustomer) {
            // For customer, their cost is customerPrice, so they use the customer-side VAT settings
            if (hasVat && vatRate.gt(0)) {
                executorCostNet = netOf(executorCostGross, vatRate);
                executorCostVat = roundMoney(executorCostGross.minus(executorCostNet));
            }
        } else {
            if (executorHasVat && executorVatRate.gt(0)) {
                executorCostNet = netOf(executorCostGross, executorVatRate);
                executorCostVat = roundMoney(executorCostGross.minus(executorCostNet));
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

        const sumPayments = (predicate: (p: { direction: PaymentDirection; companyId: string }) => boolean) =>
            sumOf(payments.filter(predicate), (p) => p.amount);

        let paidIn: Money;
        let paidOut: Money;

        if (isCustomer) {
            // Customer's payment can be recorded by either side: as the forwarder's IN
            // or as the customer's own OUT. Take max to avoid double counting.
            const forwarderIn = forwarderCompId
                ? sumPayments(p => p.companyId === forwarderCompId && p.direction === PaymentDirection.IN)
                : ZERO;
            const ownOut = sumPayments(p => p.companyId === companyId && p.direction === PaymentDirection.OUT);
            paidIn = forwarderIn.gte(ownOut) ? forwarderIn : ownOut;
            paidOut = paidIn; // Customer paid this out
        } else if (isSubForwarder) {
            // Sub-forwarder is paid by the forwarder: mirror the forwarder's OUT payments
            // as our income (or our own recorded IN, whichever side recorded it).
            const ownIn = sumPayments(p => p.companyId === companyId && p.direction === PaymentDirection.IN);
            const forwarderOut = forwarderCompId
                ? sumPayments(p => p.companyId === forwarderCompId && p.direction === PaymentDirection.OUT)
                : ZERO;
            paidIn = ownIn.gte(forwarderOut) ? ownIn : forwarderOut;
            paidOut = sumPayments(p => p.companyId === companyId && p.direction === PaymentDirection.OUT);
        } else {
            // For Forwarder or main company/admin
            const targetCompId = companyId || forwarderCompId;
            const belongs = (p: { companyId: string }) => !targetCompId || p.companyId === targetCompId;

            paidIn = sumPayments(p => belongs(p) && p.direction === PaymentDirection.IN);
            paidOut = sumPayments(p => belongs(p) && p.direction === PaymentDirection.OUT);
        }

        paidIn = roundMoney(paidIn);
        paidOut = roundMoney(paidOut);

        const extraIncomes = roundMoney(sumOf(
            incomes.filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category) && !i.isDeleted),
            (i) => i.amount,
        ));
        const otherExpenses = roundMoney(sumOf(
            expenses.filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category) && !e.isDeleted),
            (e) => e.amount,
        ));

        const margin = roundMoney(revenueNet.plus(extraIncomes).minus(executorCostNet).minus(otherExpenses));

        const debtOf = (owed: Money, paid: Money) => {
            const rest = owed.minus(paid);
            return roundMoney(rest.gt(0) ? rest : ZERO);
        };
        const customerDebt = debtOf(revenueGross, paidIn);
        const executorDebt = debtOf(executorCostGross, paidOut);

        /** Порог считается достигнутым только при ненулевой сумме к оплате. */
        const covers = (paid: Money, target: Money) => target.gt(0) && paid.gte(target);

        let isCustomerPaid = false;
        if (isCustomer) {
            isCustomerPaid = covers(paidOut, executorCostGross) || !!order.isCustomerPaid;
        } else if (isSubForwarder) {
            isCustomerPaid = covers(paidIn, revenueGross) || !!order.isSubForwarderPaid;
        } else {
            isCustomerPaid = covers(paidIn, revenueGross) || !!order.isCustomerPaid;
        }

        let isExecutorPaid = false;
        if (isCustomer) {
            isExecutorPaid = covers(paidOut, executorCostGross) || !!order.isCustomerPaid;
        } else if (isSubForwarder) {
            isExecutorPaid = false;
        } else {
            isExecutorPaid = covers(paidOut, executorCostGross)
                || (order.subForwarderId ? !!order.isSubForwarderPaid : !!order.isDriverPaid);
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
