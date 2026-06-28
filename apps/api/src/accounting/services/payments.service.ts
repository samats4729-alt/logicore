import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PeriodClosingService } from './period-closing.service';
import { FinancialSettingsService } from './financial-settings.service';
import { PaymentDirection, PaymentMethod, AccountKind, Payment } from '@prisma/client';
import { money } from '../../common/utils/money';

@Injectable()
export class PaymentsService {
    private static readonly AUTO_NOTE_CUSTOMER = 'Проведение оплаты заказчика (на остаток)';
    private static readonly AUTO_NOTE_DRIVER = 'Оплата водителю (на остаток)';
    private static readonly AUTO_NOTE_SUBFORWARDER = 'Оплата суб-экспедитору (на остаток)';

    constructor(
        private prisma: PrismaService,
        private periodClosingService: PeriodClosingService,
        private financialSettingsService: FinancialSettingsService,
    ) { }

    // ==================== EXPENSES (manual) ====================

    async getExpenses(companyId: string) {
        return this.prisma.expense.findMany({
            where: { companyId, isDeleted: false },
            include: { order: { select: { orderNumber: true } } },
            orderBy: { date: 'desc' },
        });
    }

    async createExpense(companyId: string, userId: string, data: {
        date: string;
        category: string;
        description: string;
        amount: number;
        note?: string;
        orderId?: string;
    }) {
        await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        return this.prisma.expense.create({
            data: {
                companyId,
                createdById: userId,
                date: new Date(data.date),
                category: data.category,
                description: data.description,
                amount: data.amount,
                note: data.note || null,
                orderId: data.orderId || null,
            },
        });
    }

    async updateExpense(companyId: string, expenseId: string, data: {
        date?: string;
        category?: string;
        description?: string;
        amount?: number;
        note?: string;
    }) {
        const expense = await this.prisma.expense.findFirst({
            where: { id: expenseId, companyId },
        });

        if (!expense) throw new NotFoundException('Расход не найден');

        await this.periodClosingService.checkPeriodNotClosed(companyId, expense.date);
        if (data.date && new Date(data.date).getTime() !== new Date(expense.date).getTime()) {
            await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        }

        return this.prisma.expense.update({
            where: { id: expenseId },
            data: {
                ...(data.date && { date: new Date(data.date) }),
                ...(data.category && { category: data.category }),
                ...(data.description && { description: data.description }),
                ...(data.amount !== undefined && { amount: data.amount }),
                ...(data.note !== undefined && { note: data.note || null }),
            },
        });
    }

    async deleteExpense(companyId: string, expenseId: string) {
        const expense = await this.prisma.expense.findFirst({
            where: { id: expenseId, companyId },
        });

        if (!expense) throw new NotFoundException('Расход не найден');

        await this.periodClosingService.checkPeriodNotClosed(companyId, expense.date);

        return this.prisma.expense.update({
            where: { id: expenseId },
            data: { isDeleted: true },
        });
    }

    // ==================== INCOMES (manual) ====================

    async getIncomes(companyId: string) {
        return this.prisma.income.findMany({
            where: { companyId, isDeleted: false },
            orderBy: { date: 'desc' },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        cargoDescription: true,
                        status: true,
                    },
                },
            },
        });
    }

    async createIncome(companyId: string, userId: string, data: {
        date: string;
        category: string;
        description: string;
        amount: number;
        note?: string;
        orderId?: string;
    }) {
        await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        return this.prisma.income.create({
            data: {
                companyId,
                createdById: userId,
                date: new Date(data.date),
                category: data.category,
                description: data.description,
                amount: data.amount,
                note: data.note || null,
                orderId: data.orderId || null,
            },
        });
    }

    async updateIncome(companyId: string, incomeId: string, data: {
        date?: string;
        category?: string;
        description?: string;
        amount?: number;
        note?: string;
    }) {
        const income = await this.prisma.income.findFirst({
            where: { id: incomeId, companyId },
        });

        if (!income) throw new NotFoundException('Поступление не найдено');

        await this.periodClosingService.checkPeriodNotClosed(companyId, income.date);
        if (data.date && new Date(data.date).getTime() !== new Date(income.date).getTime()) {
            await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        }

        return this.prisma.income.update({
            where: { id: incomeId },
            data: {
                ...(data.date && { date: new Date(data.date) }),
                ...(data.category && { category: data.category }),
                ...(data.description && { description: data.description }),
                ...(data.amount !== undefined && { amount: data.amount }),
                ...(data.note !== undefined && { note: data.note || null }),
            },
        });
    }

    async deleteIncome(companyId: string, incomeId: string) {
        const income = await this.prisma.income.findFirst({
            where: { id: incomeId, companyId },
        });

        if (!income) throw new NotFoundException('Поступление не найдено');

        await this.periodClosingService.checkPeriodNotClosed(companyId, income.date);

        return this.prisma.income.update({
            where: { id: incomeId },
            data: { isDeleted: true },
        });
    }

    // ==================== PAYMENTS CRUD ====================

    async getPayments(companyId: string, query: { startDate?: string; endDate?: string; direction?: PaymentDirection }) {
        return this.prisma.payment.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(query.direction && { direction: query.direction }),
                ...(query.startDate && query.endDate && {
                    date: {
                        gte: new Date(query.startDate),
                        lte: new Date(query.endDate),
                    }
                }),
            },
            include: {
                order: { select: { orderNumber: true } },
                counterparty: { select: { name: true } },
                account: true,
                category: true,
            },
            orderBy: { date: 'desc' },
        });
    }

    async getPaymentsByOrder(companyId: string, orderId: string) {
        return this.prisma.payment.findMany({
            where: {
                companyId,
                orderId,
                isDeleted: false,
            },
            include: {
                counterparty: { select: { name: true } },
                account: true,
                category: true,
            },
            orderBy: { date: 'desc' },
        });
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
        await this.financialSettingsService.ensureCompanyFinanceSettings(companyId);
        const amt = money(data.amount);
        await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);

        let accountId = data.accountId;
        let categoryId = data.categoryId;

        if (!accountId) {
            const kind = data.method === PaymentMethod.CASH ? AccountKind.CASH : AccountKind.BANK;
            const defaultAcc = await this.prisma.financeAccount.findFirst({
                where: { companyId, kind, isDefault: true, isActive: true },
            });
            accountId = defaultAcc?.id;
        }

        if (!categoryId) {
            const defaultCatName = data.direction === PaymentDirection.IN ? 'Оплата за рейс' : 'Оплата исполнителю';
            const defaultCat = await this.prisma.financeCategory.findFirst({
                where: { companyId, name: defaultCatName, direction: data.direction, isSystem: true, isActive: true },
            });
            categoryId = defaultCat?.id;
        }

        const payment = await this.prisma.payment.create({
            data: {
                companyId,
                orderId: data.orderId || null,
                counterpartyId: data.counterpartyId || null,
                direction: data.direction,
                amount: amt,
                date: new Date(data.date),
                method: data.method || PaymentMethod.BANK,
                note: data.note || null,
                createdById: userId,
                accountId: accountId || null,
                categoryId: categoryId || null,
            },
            include: {
                order: { select: { orderNumber: true } },
            }
        });

        if (payment.orderId) {
            await this.syncOrderPaymentFlags(payment.orderId);
            await this.prisma.orderChangeLog.create({
                data: {
                    orderId: payment.orderId,
                    userId,
                    action: 'payment_added',
                    details: `Добавлен платеж: ${payment.direction === 'IN' ? 'Поступление' : 'Расход'} на сумму ${payment.amount} ₸ (${payment.note || 'без примечания'}).`
                }
            });
        }

        return payment;
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
        const payment = await this.prisma.payment.findFirst({
            where: { id: paymentId, companyId, isDeleted: false },
        });
        if (!payment) throw new NotFoundException('Платеж не найден');

        await this.periodClosingService.checkPeriodNotClosed(companyId, payment.date);
        if (data.date && new Date(data.date).getTime() !== new Date(payment.date).getTime()) {
            await this.periodClosingService.checkPeriodNotClosed(companyId, data.date);
        }

        const amt = data.amount !== undefined ? money(data.amount) : payment.amount;

        const updated = await this.prisma.payment.update({
            where: { id: paymentId },
            data: {
                ...(data.amount !== undefined && { amount: amt }),
                ...(data.date && { date: new Date(data.date) }),
                ...(data.method && { method: data.method }),
                ...(data.note !== undefined && { note: data.note || null }),
                ...(data.counterpartyId !== undefined && { counterpartyId: data.counterpartyId || null }),
                ...(data.accountId !== undefined && { accountId: data.accountId || null }),
                ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
            },
            include: {
                order: { select: { orderNumber: true } },
            }
        });

        if (updated.orderId) {
            await this.syncOrderPaymentFlags(updated.orderId);
            await this.prisma.orderChangeLog.create({
                data: {
                    orderId: updated.orderId,
                    userId,
                    action: 'payment_updated',
                    details: `Обновлен платеж: ${updated.direction === 'IN' ? 'Поступление' : 'Расход'} на сумму ${updated.amount} ₸ (${updated.note || 'без примечания'}).`
                }
            });
        }

        return updated;
    }

    async deletePayment(companyId: string, paymentId: string, userId: string) {
        const payment = await this.prisma.payment.findFirst({
            where: { id: paymentId, companyId, isDeleted: false },
        });
        if (!payment) throw new NotFoundException('Платеж не найден');

        await this.periodClosingService.checkPeriodNotClosed(companyId, payment.date);

        const updated = await this.prisma.payment.update({
            where: { id: paymentId },
            data: { isDeleted: true }
        });

        if (updated.orderId) {
            await this.syncOrderPaymentFlags(updated.orderId);
            await this.prisma.orderChangeLog.create({
                data: {
                    orderId: updated.orderId,
                    userId,
                    action: 'payment_deleted',
                    details: `Удален платеж: ${updated.direction === 'IN' ? 'Поступление' : 'Расход'} на сумму ${updated.amount} ₸ (${updated.note || 'без примечания'}).`
                }
            });
        }

        return updated;
    }

    // ==================== PAYMENT FLAGS SYNC ====================

    async syncOrderPaymentFlags(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });
        if (!order) return;

        // Sync Customer Paid Flag
        const customerPayments = await this.prisma.payment.findMany({
            where: { orderId, direction: PaymentDirection.IN, isDeleted: false },
        });
        const paidIn = customerPayments.reduce((sum, p) => sum + p.amount, 0);
        const revenue = order.customerPrice || 0;
        const isCustomerPaid = paidIn >= revenue && revenue > 0;

        // Sync Driver / Sub-forwarder Paid Flag
        const executorPayments = await this.prisma.payment.findMany({
            where: { orderId, direction: PaymentDirection.OUT, isDeleted: false },
        });
        const paidOut = executorPayments.reduce((sum, p) => sum + p.amount, 0);

        let isDriverPaid = order.isDriverPaid;
        let driverPaidAt = order.driverPaidAt;
        let isSubForwarderPaid = order.isSubForwarderPaid;
        let subForwarderPaidAt = order.subForwarderPaidAt;

        if (order.subForwarderId) {
            const subForwarderPrice = order.subForwarderPrice || 0;
            isSubForwarderPaid = paidOut >= subForwarderPrice && subForwarderPrice > 0;
            subForwarderPaidAt = isSubForwarderPaid ? (order.subForwarderPaidAt || new Date()) : null;
        } else {
            const driverCost = order.driverCost || 0;
            isDriverPaid = paidOut >= driverCost && driverCost > 0;
            driverPaidAt = isDriverPaid ? (order.driverPaidAt || new Date()) : null;
        }

        await this.prisma.order.update({
            where: { id: orderId },
            data: {
                isCustomerPaid,
                customerPaidAt: isCustomerPaid ? (order.customerPaidAt || new Date()) : null,
                isDriverPaid,
                driverPaidAt,
                isSubForwarderPaid,
                subForwarderPaidAt,
            },
        });
    }

    async markCustomerPaid(companyId: string, orderId: string, paid: boolean, userId: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        if (paid) {
            const payments = await this.prisma.payment.findMany({
                where: { orderId, direction: PaymentDirection.IN, isDeleted: false, companyId }
            });
            const paidIn = payments.reduce((sum, p) => sum + p.amount, 0);
            const balance = money((order.customerPrice || 0) - paidIn);
            if (balance > 0) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    counterpartyId: order.customerCompanyId || undefined,
                    direction: PaymentDirection.IN,
                    amount: balance,
                    date: new Date().toISOString(),
                    note: PaymentsService.AUTO_NOTE_CUSTOMER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.IN,
                    isDeleted: false,
                    companyId,
                    note: PaymentsService.AUTO_NOTE_CUSTOMER,
                }
            });
            for (const p of payments) {
                await this.deletePayment(companyId, p.id, userId);
            }
            await this.syncOrderPaymentFlags(orderId);
        }

        return this.prisma.order.findUnique({ where: { id: orderId } });
    }

    async markDriverPaid(companyId: string, orderId: string, paid: boolean, userId: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        if (order.subForwarderId) {
            throw new BadRequestException('На заявке назначен суб-экспедитор, используйте оплату суб-экспедитору');
        }

        if (paid) {
            const payments = await this.prisma.payment.findMany({
                where: { orderId, direction: PaymentDirection.OUT, isDeleted: false, companyId }
            });
            const paidOut = payments.reduce((sum, p) => sum + p.amount, 0);
            const balance = money((order.driverCost || 0) - paidOut);
            if (balance > 0) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    direction: PaymentDirection.OUT,
                    amount: balance,
                    date: new Date().toISOString(),
                    note: PaymentsService.AUTO_NOTE_DRIVER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.OUT,
                    isDeleted: false,
                    companyId,
                    note: PaymentsService.AUTO_NOTE_DRIVER,
                }
            });
            for (const p of payments) {
                await this.deletePayment(companyId, p.id, userId);
            }
            await this.syncOrderPaymentFlags(orderId);
        }

        return this.prisma.order.findUnique({ where: { id: orderId } });
    }

    async markSubForwarderPaid(companyId: string, orderId: string, paid: boolean, userId: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        if (!order.subForwarderId) {
            throw new BadRequestException('На заявке нет суб-экспедитора, используйте оплату водителю');
        }

        if (paid) {
            const payments = await this.prisma.payment.findMany({
                where: { orderId, direction: PaymentDirection.OUT, isDeleted: false, companyId }
            });
            const paidOut = payments.reduce((sum, p) => sum + p.amount, 0);
            const balance = money((order.subForwarderPrice || 0) - paidOut);
            if (balance > 0) {
                await this.createPayment(companyId, userId, {
                    orderId,
                    counterpartyId: order.subForwarderId || undefined,
                    direction: PaymentDirection.OUT,
                    amount: balance,
                    date: new Date().toISOString(),
                    note: PaymentsService.AUTO_NOTE_SUBFORWARDER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.OUT,
                    isDeleted: false,
                    companyId,
                    note: PaymentsService.AUTO_NOTE_SUBFORWARDER,
                }
            });
            for (const p of payments) {
                await this.deletePayment(companyId, p.id, userId);
            }
            await this.syncOrderPaymentFlags(orderId);
        }

        return this.prisma.order.findUnique({ where: { id: orderId } });
    }
}
