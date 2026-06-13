import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AccountingService {
    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private configService: ConfigService,
    ) { }

    // ==================== ORDER FINANCIALS ====================

    async getOrderFinancials(companyId: string, orderId: string) {
        const order = await this.prisma.order.findFirst({
            where: {
                id: orderId,
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
            include: {
                customerCompany: { select: { id: true, name: true } },
                customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
                forwarder: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                responsibleManager: { select: { id: true, firstName: true, lastName: true } },
                statusHistory: { orderBy: { changedAt: 'desc' } },
                driver: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        middleName: true,
                        phone: true,
                        iin: true,
                        vehicleType: true,
                        vehiclePlate: true,
                        vehicleModel: true,
                        trailerNumber: true,
                        docType: true,
                        docNumber: true,
                        docIssuedAt: true,
                        docExpiresAt: true,
                        docIssuedBy: true,
                    }
                },
                partner: { select: { id: true, name: true } },
                assignees: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
                    orderBy: { assignedAt: 'desc' },
                },
                changeLog: {
                    include: { user: { select: { id: true, firstName: true, lastName: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                },
            },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        const isCustomer = order.customerCompanyId === companyId;

        const [incomes, expenses] = await Promise.all([
            this.prisma.income.findMany({
                where: { orderId, companyId },
                orderBy: { date: 'desc' },
            }),
            isCustomer
                ? [] // Customer should not see any carrier expenses
                : this.prisma.expense.findMany({
                    where: { orderId, companyId },
                    orderBy: { date: 'desc' },
                }),
        ]);

        const totalIncomes = incomes.filter((i: any) => !i.isDeleted).reduce((s: number, i: any) => s + i.amount, 0);
        const totalExpenses = expenses.filter((e: any) => !e.isDeleted).reduce((s: number, e: any) => s + e.amount, 0);

        // Находим только выплаты исполнителю (категория driver_payment)
        const executorPayments = expenses
            .filter((e: any) => !e.isDeleted && e.category === 'driver_payment')
            .reduce((s: number, e: any) => s + e.amount, 0);

        // Другие расходы по заказу (топливо, ремонт и т.д.)
        const otherExpenses = totalExpenses - executorPayments;

        // Exclude main customer payment category ('order_payment' and 'prepayment') from margins to prevent double-counting
        const extraIncomes = incomes
            .filter((i: any) => !i.isDeleted && i.category !== 'order_payment' && i.category !== 'prepayment')
            .reduce((s: number, i: any) => s + i.amount, 0);

        const executorCost = order.subForwarderId ? (order.subForwarderPrice || 0) : (order.driverCost || 0);

        if (isCustomer) {
            // Safe redacted response for customer
            return {
                order: {
                    ...order,
                    driverCost: null,
                    subForwarderPrice: null,
                    subForwarderId: null,
                    isDriverPaid: false,
                    driverPaidAt: null,
                    isSubForwarderPaid: false,
                    subForwarderPaidAt: null,
                    partner: null,
                    subForwarder: null,
                },
                incomes,
                expenses: [],
                summary: {
                    customerPrice: order.customerPrice || 0,
                    driverCost: 0,
                    subForwarderPrice: 0,
                    executorCost: 0,
                    margin: 0,
                    totalIncomes,
                    totalExpenses: 0,
                    balance: totalIncomes,
                    isCustomerPaid: order.isCustomerPaid,
                    isDriverPaid: false,
                    isSubForwarderPaid: false,
                    customerDebt: order.isCustomerPaid ? 0 : (order.customerPrice || 0) - totalIncomes,
                    driverDebt: 0,
                    subForwarderDebt: 0,
                    executorDebt: 0,
                },
            };
        }

        const executorDebt = order.subForwarderId
            ? (order.isSubForwarderPaid ? 0 : (order.subForwarderPrice || 0) - executorPayments)
            : (order.isDriverPaid ? 0 : (order.driverCost || 0) - executorPayments);

        return {
            order,
            incomes,
            expenses,
            summary: {
                customerPrice: order.customerPrice || 0,
                driverCost: order.driverCost || 0,
                subForwarderPrice: order.subForwarderPrice || 0,
                executorCost,  
                margin: (order.customerPrice || 0) + extraIncomes - executorCost - otherExpenses,
                totalIncomes,
                totalExpenses,
                balance: totalIncomes - totalExpenses,
                isCustomerPaid: order.isCustomerPaid,
                isDriverPaid: order.isDriverPaid,
                isSubForwarderPaid: order.isSubForwarderPaid,
                customerDebt: order.isCustomerPaid ? 0 : (order.customerPrice || 0) - totalIncomes,
                driverDebt: order.isDriverPaid ? 0 : (order.driverCost || 0) - executorPayments,
                subForwarderDebt: order.isSubForwarderPaid ? 0 : (order.subForwarderPrice || 0) - executorPayments,
                executorDebt,
            },
        };
    }

    // ==================== FINANCIAL REGISTRY (Реестр) ====================

    async getFinancialRegistry(companyId: string) {
        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            { responsibleManager: { companyId: companyId } },
                        ]
                    },
                    {
                        OR: [
                            { isConfirmed: true },
                            { status: { not: 'PENDING' } }
                        ]
                    }
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                status: true,
                cargoDescription: true,
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
                isSubForwarderPaid: true,
                subForwarderPaidAt: true,
                // Связи
                customerCompanyId: true,
                customerCompany: { select: { id: true, name: true } },
                forwarder: { select: { id: true, name: true } },
                assignedDriverName: true,
                driver: { select: { id: true, firstName: true, lastName: true } },
                partner: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                routePoints: { select: { pointType: true, sequence: true, location: { select: { address: true, city: true } } }, orderBy: { sequence: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Safe redaction for Customer company to prevent price leakage
        return orders.map(order => {
            if (order.customerCompanyId === companyId) {
                return {
                    ...order,
                    driverCost: null,
                    subForwarderPrice: null,
                    subForwarderId: null,
                    isDriverPaid: false,
                    driverPaidAt: null,
                    isSubForwarderPaid: false,
                    subForwarderPaidAt: null,
                    partner: null,
                    subForwarder: null,
                };
            }
            return order;
        });
    }

    // ==================== PAYMENT JOURNAL ====================

    async getIncomesJournal(companyId: string) {
        // Заявки где мы экспедитор или заказчик/посредник — ждём оплату от заказчика
        return this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            { responsibleManager: { companyId: companyId } },
                        ]
                    },
                    {
                        customerCompanyId: { not: companyId }
                    },
                    {
                        OR: [
                            { isConfirmed: true },
                            { status: { not: 'PENDING' } }
                        ]
                    }
                ],
                customerPrice: { not: null },
                status: { notIn: ['DRAFT', 'CANCELLED'] },
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
        // Заявки где мы экспедитор/исполнитель — должны оплатить перевозчику (исключаем заказы, где мы заказчик)
        return this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            { responsibleManager: { companyId: companyId } },
                        ]
                    },
                    {
                        customerCompanyId: { not: companyId }
                    },
                    {
                        OR: [
                            { driverCost: { not: null } },
                            { subForwarderPrice: { not: null } }
                        ]
                    },
                    {
                        OR: [
                            { isConfirmed: true },
                            { status: { not: 'PENDING' } }
                        ]
                    }
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
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
                isSubForwarderPaid: true,
                subForwarderPaidAt: true,
                driverPaymentCondition: true,
                driverPaymentForm: true,
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

    async getCustomerExpensesJournal(companyId: string) {
        // Заявки где мы заказчик — должны оплатить экспедитору
        return this.prisma.order.findMany({
            where: {
                customerCompanyId: companyId,
                customerPrice: { not: null },
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                status: true,
                cargoDescription: true,
                customerPrice: true,
                isCustomerPaid: true,
                customerPaidAt: true,
                forwarder: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async markCustomerPaid(companyId: string, orderId: string, paid: boolean) {
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

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                isDriverPaid: paid,
                driverPaidAt: paid ? new Date() : null,
            },
        });
    }

    async markSubForwarderPaid(companyId: string, orderId: string, paid: boolean) {
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

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                isSubForwarderPaid: paid,
                subForwarderPaidAt: paid ? new Date() : null,
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
            where: {
                id: orderId,
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            },
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

        return this.prisma.income.update({
            where: { id: incomeId },
            data: { isDeleted: true },
        });
    }

    // ==================== COUNTERPARTY REPORT (Взаиморасчёты) ====================

    async getCounterpartyReport(companyId: string) {
        // Загружаем все заявки, где наша компания участвует в любой роли
        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { subForwarderId: companyId },
                            { partnerId: companyId },
                        ],
                    },
                    {
                        OR: [
                            { isConfirmed: true },
                            { status: { not: 'PENDING' } },
                        ],
                    },
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                completedAt: true,
                status: true,
                cargoDescription: true,
                // Финансы
                customerPrice: true,
                driverCost: true,
                subForwarderPrice: true,
                isCustomerPaid: true,
                customerPaidAt: true,
                isDriverPaid: true,
                driverPaidAt: true,
                isSubForwarderPaid: true,
                subForwarderPaidAt: true,
                // Роли
                customerCompanyId: true,
                forwarderId: true,
                subForwarderId: true,
                partnerId: true,
                // Связи
                customerCompany: { select: { id: true, name: true } },
                forwarder: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                partner: { select: { id: true, name: true } },
                // Маршрут
                routePoints: {
                    select: {
                        pointType: true,
                        sequence: true,
                        location: { select: { city: true, address: true } },
                    },
                    orderBy: { sequence: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Группировка по контрагентам
        // Для каждой заявки определяем пары "наша роль ↔ контрагент" и финансовое направление
        const counterpartyMap = new Map<string, {
            counterparty: { id: string; name: string };
            ourRole: string;
            orders: any[];
            theyOweUs: number;       // Дебиторка (нам должны)
            theyOweUsPaid: number;   // Из дебиторки — оплачено
            weOweThem: number;       // Кредиторка (мы должны)
            weOweThemPaid: number;   // Из кредиторки — оплачено
        }>();

        const getOrCreateEntry = (counterpartyId: string, counterpartyName: string, ourRole: string) => {
            const key = `${counterpartyId}__${ourRole}`;
            if (!counterpartyMap.has(key)) {
                counterpartyMap.set(key, {
                    counterparty: { id: counterpartyId, name: counterpartyName },
                    ourRole,
                    orders: [],
                    theyOweUs: 0,
                    theyOweUsPaid: 0,
                    weOweThem: 0,
                    weOweThemPaid: 0,
                });
            }
            return counterpartyMap.get(key)!;
        };

        for (const order of orders) {
            const isCustomer = order.customerCompanyId === companyId;
            const isForwarder = order.forwarderId === companyId;
            const isSubForwarder = order.subForwarderId === companyId;

            // Базовый объект заявки для ответа (без лишних внутренних полей)
            const orderData = {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                completedAt: order.completedAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                customerPrice: order.customerPrice,
                isCustomerPaid: order.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                routePoints: order.routePoints,
            };

            if (isCustomer && order.forwarder) {
                // Мы заказчик → контрагент = экспедитор → мы ДОЛЖНЫ ему (кредиторка)
                const entry = getOrCreateEntry(order.forwarder.id, order.forwarder.name, 'Заказчик');
                const amount = order.customerPrice || 0;
                entry.weOweThem += amount;
                if (order.isCustomerPaid) entry.weOweThemPaid += amount;
                entry.orders.push({
                    ...orderData,
                    amount,
                    isPaid: order.isCustomerPaid,
                    paidAt: order.customerPaidAt,
                    direction: 'weOwe', // мы должны
                });
            }

            if (isForwarder && order.customerCompany) {
                // Мы экспедитор → контрагент = заказчик → он ДОЛЖЕН нам (дебиторка)
                const entry = getOrCreateEntry(order.customerCompany.id, order.customerCompany.name, 'Экспедитор');
                const amount = order.customerPrice || 0;
                entry.theyOweUs += amount;
                if (order.isCustomerPaid) entry.theyOweUsPaid += amount;
                entry.orders.push({
                    ...orderData,
                    amount,
                    isPaid: order.isCustomerPaid,
                    paidAt: order.customerPaidAt,
                    direction: 'theyOwe', // нам должны
                });
            }

            if (isForwarder && order.subForwarder) {
                // Мы экспедитор, но назначили суб → мы ДОЛЖНЫ суб-экспедитору (кредиторка)
                const entry = getOrCreateEntry(order.subForwarder.id, order.subForwarder.name, 'Экспедитор');
                const amount = order.subForwarderPrice || 0;
                entry.weOweThem += amount;
                if (order.isSubForwarderPaid) entry.weOweThemPaid += amount;
                entry.orders.push({
                    ...orderData,
                    amount,
                    isPaid: order.isSubForwarderPaid,
                    paidAt: order.subForwarderPaidAt,
                    direction: 'weOwe',
                });
            }

            if (isSubForwarder && order.forwarder) {
                // Мы суб-экспедитор → контрагент = основной экспедитор → он ДОЛЖЕН нам (дебиторка)
                const entry = getOrCreateEntry(order.forwarder.id, order.forwarder.name, 'Суб-экспедитор');
                const amount = order.subForwarderPrice || 0;
                entry.theyOweUs += amount;
                if (order.isSubForwarderPaid) entry.theyOweUsPaid += amount;
                entry.orders.push({
                    ...orderData,
                    amount,
                    isPaid: order.isSubForwarderPaid,
                    paidAt: order.subForwarderPaidAt,
                    direction: 'theyOwe',
                });
            }
        }

        // Формируем массив контрагентов
        const counterparties = Array.from(counterpartyMap.values()).map(entry => ({
            ...entry,
            balance: entry.theyOweUs - entry.weOweThem,
            unpaidTheyOweUs: entry.theyOweUs - entry.theyOweUsPaid,
            unpaidWeOweThem: entry.weOweThem - entry.weOweThemPaid,
            totalOrders: entry.orders.length,
        }));

        // Сортируем: сначала с бо́льшим балансом неоплаченных
        counterparties.sort((a, b) => {
            const aUnpaid = a.unpaidTheyOweUs + a.unpaidWeOweThem;
            const bUnpaid = b.unpaidTheyOweUs + b.unpaidWeOweThem;
            return bUnpaid - aUnpaid;
        });

        // Общие итоги
        const totals = {
            totalTheyOweUs: counterparties.reduce((s, c) => s + c.theyOweUs, 0),
            totalWeOweThem: counterparties.reduce((s, c) => s + c.weOweThem, 0),
            unpaidTheyOweUs: counterparties.reduce((s, c) => s + c.unpaidTheyOweUs, 0),
            unpaidWeOweThem: counterparties.reduce((s, c) => s + c.unpaidWeOweThem, 0),
            balance: counterparties.reduce((s, c) => s + c.balance, 0),
            totalCounterparties: counterparties.length,
            totalOrders: counterparties.reduce((s, c) => s + c.totalOrders, 0),
        };

        return { counterparties, totals };
    }

    // ==================== SHARE REPORT (Публичный доступ) ====================

    /**
     * Генерирует share-токен для публичного доступа к отчёту по контрагенту.
     * Токен хранится в Redis с TTL 7 дней.
     */
    async generateShareToken(companyId: string, counterpartyId: string, ourRole: string): Promise<{ token: string; shareUrl: string }> {
        // Проверяем, что компания и контрагент существуют
        const [company, counterparty] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } }),
            this.prisma.company.findUnique({ where: { id: counterpartyId }, select: { id: true, name: true } }),
        ]);

        if (!company) throw new NotFoundException('Компания не найдена');
        if (!counterparty) throw new NotFoundException('Контрагент не найден');

        const token = uuidv4();
        const ttl = 60 * 60 * 24 * 7; // 7 дней

        await this.redisService.set(
            `share_report:${token}`,
            JSON.stringify({
                companyId,
                companyName: company.name,
                counterpartyId,
                counterpartyName: counterparty.name,
                ourRole,
                createdAt: new Date().toISOString(),
            }),
            ttl,
        );

        const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
        const shareUrl = `${frontendUrl}/shared/report/${token}`;

        return { token, shareUrl };
    }

    /**
     * Получает отчёт по share-токену (публичный доступ, без JWT).
     * Возвращает данные только по конкретному контрагенту.
     */
    async getSharedReport(token: string) {
        const raw = await this.redisService.get(`share_report:${token}`);
        if (!raw) {
            throw new NotFoundException('Ссылка недействительна или истёк срок действия');
        }

        const { companyId, companyName, counterpartyId, ourRole, createdAt } = JSON.parse(raw);

        // Получаем полный отчёт компании
        const fullReport = await this.getCounterpartyReport(companyId);

        // Фильтруем: оставляем только данные по конкретному контрагенту и роли
        const key = `${counterpartyId}__${ourRole}`;
        const counterparty = fullReport.counterparties.find(
            (c: any) => `${c.counterparty.id}__${c.ourRole}` === key
        );

        if (!counterparty) {
            // Контрагент есть, но по нему пока нет сделок
            const { counterpartyName: cpName } = JSON.parse(raw);
            return {
                senderCompany: companyName,
                counterpartyName: cpName,
                ourRole,
                createdAt,
                expiresIn: '7 дней',
                counterparty: null,
                totals: null,
            };
        }

        return {
            senderCompany: companyName,
            counterpartyName: counterparty.counterparty.name,
            ourRole,
            createdAt,
            expiresIn: '7 дней',
            counterparty,
            totals: {
                theyOweUs: counterparty.theyOweUs,
                weOweThem: counterparty.weOweThem,
                unpaidTheyOweUs: counterparty.unpaidTheyOweUs,
                unpaidWeOweThem: counterparty.unpaidWeOweThem,
                balance: counterparty.balance,
                totalOrders: counterparty.totalOrders,
            },
        };
    }
}
