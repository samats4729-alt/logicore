import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountingService {
    constructor(private prisma: PrismaService) { }

    // ==================== FINANCIAL REGISTRY (Реестр) ====================

    async getFinancialRegistry(companyId: string) {
        return this.prisma.order.findMany({
            where: {
                forwarderId: companyId,
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                isConfirmed: true,
            },
            select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                status: true,
                cargoDescription: true,
                pickupDate: true,
                completedAt: true,
                // Доходная часть
                customerPrice: true,
                customerPriceType: true,
                isCustomerPaid: true,
                customerPaidAt: true,
                // Расходная часть
                driverCost: true,
                subForwarderPrice: true,
                subForwarderId: true,
                isDriverPaid: true,
                driverPaidAt: true,
                // Связи
                customerCompany: { select: { id: true, name: true } },
                assignedDriverName: true,
                driver: { select: { id: true, firstName: true, lastName: true } },
                partner: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                pickupLocation: { select: { address: true, city: true } },
                deliveryPoints: { select: { location: { select: { address: true, city: true } } }, orderBy: { sequence: 'desc' as const }, take: 1 },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ==================== PAYMENT JOURNAL ====================

    async getIncomesJournal(companyId: string) {
        // Заявки где мы экспедитор — ждём оплату от заказчика
        return this.prisma.order.findMany({
            where: {
                forwarderId: companyId,
                customerPrice: { not: null },
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                isConfirmed: true,
            },
            select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                status: true,
                cargoDescription: true,
                customerPrice: true,
                customerPriceType: true,
                isCustomerPaid: true,
                customerPaidAt: true,
                customerPaymentCondition: true,
                customerPaymentForm: true,
                pickupDate: true,
                completedAt: true,
                customerCompany: {
                    select: { id: true, name: true },
                },
                customer: {
                    select: { id: true, firstName: true, lastName: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getExpensesJournal(companyId: string) {
        // Заявки где мы экспедитор — должны оплатить перевозчику
        return this.prisma.order.findMany({
            where: {
                forwarderId: companyId,
                OR: [
                    { driverCost: { not: null } },
                    { subForwarderPrice: { not: null } }
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
                isConfirmed: true,
            },
            select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                status: true,
                cargoDescription: true,
                driverCost: true,
                subForwarderPrice: true,
                subForwarderId: true,
                isDriverPaid: true,
                driverPaidAt: true,
                driverPaymentCondition: true,
                driverPaymentForm: true,
                pickupDate: true,
                completedAt: true,
                assignedDriverName: true,
                assignedDriverPhone: true,
                driver: {
                    select: { id: true, firstName: true, lastName: true, phone: true },
                },
                partner: {
                    select: { id: true, name: true },
                },
                subForwarder: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async markCustomerPaid(companyId: string, orderId: string, paid: boolean) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, forwarderId: companyId },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                isCustomerPaid: paid,
                customerPaidAt: paid ? new Date() : null,
            },
        });
    }

    async markDriverPaid(companyId: string, orderId: string, paid: boolean) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, forwarderId: companyId },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                isDriverPaid: paid,
                driverPaidAt: paid ? new Date() : null,
            },
        });
    }

    async updateOrderFinance(companyId: string, orderId: string, data: {
        customerPrice?: number;
        driverCost?: number;
        subForwarderPrice?: number;
        customerPaymentCondition?: string;
        customerPaymentForm?: string;
        driverPaymentCondition?: string;
        driverPaymentForm?: string;
    }) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, forwarderId: companyId },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                ...(data.customerPrice !== undefined && { customerPrice: data.customerPrice }),
                ...(data.driverCost !== undefined && { driverCost: data.driverCost }),
                ...(data.subForwarderPrice !== undefined && { subForwarderPrice: data.subForwarderPrice }),
                ...(data.customerPaymentCondition !== undefined && { customerPaymentCondition: data.customerPaymentCondition }),
                ...(data.customerPaymentForm !== undefined && { customerPaymentForm: data.customerPaymentForm }),
                ...(data.driverPaymentCondition !== undefined && { driverPaymentCondition: data.driverPaymentCondition }),
                ...(data.driverPaymentForm !== undefined && { driverPaymentForm: data.driverPaymentForm }),
            },
        });
    }

    // ==================== EXPENSES (manual) ====================

    async getExpenses(companyId: string) {
        return this.prisma.expense.findMany({
            where: { companyId },
            orderBy: { date: 'desc' },
        });
    }

    async createExpense(companyId: string, userId: string, data: {
        date: string;
        category: string;
        description: string;
        amount: number;
        note?: string;
    }) {
        return this.prisma.expense.create({
            data: {
                companyId,
                createdById: userId,
                date: new Date(data.date),
                category: data.category,
                description: data.description,
                amount: data.amount,
                note: data.note || null,
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

        return this.prisma.expense.delete({
            where: { id: expenseId },
        });
    }

    // ==================== INCOMES (manual) ====================

    async getIncomes(companyId: string) {
        return this.prisma.income.findMany({
            where: { companyId },
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

        return this.prisma.income.delete({
            where: { id: incomeId },
        });
    }
}
