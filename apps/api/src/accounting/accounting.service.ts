import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';
import { PaymentDirection, PaymentMethod, Prisma } from '@prisma/client';
import { money } from '../common/utils/money';
import * as XLSX from 'xlsx';

@Injectable()
export class AccountingService {
    private static readonly AUTO_NOTE_CUSTOMER = 'Проведение оплаты заказчика (на остаток)';
    private static readonly AUTO_NOTE_DRIVER = 'Оплата водителю (на остаток)';
    private static readonly AUTO_NOTE_SUBFORWARDER = 'Оплата суб-экспедитору (на остаток)';

    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private configService: ConfigService,
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

        const companyPayments = payments.filter(p => p.companyId === companyId);
        const paidIn = money(companyPayments.filter(p => p.direction === PaymentDirection.IN).reduce((sum, p) => sum + p.amount, 0));
        const paidOut = money(companyPayments.filter(p => p.direction === PaymentDirection.OUT).reduce((sum, p) => sum + p.amount, 0));

        const extraIncomes = money(incomes.filter(i => i.category !== 'order_payment' && i.category !== 'prepayment' && !i.isDeleted).reduce((sum, i) => sum + i.amount, 0));
        const otherExpenses = money(expenses.filter(e => e.category !== 'driver_payment' && !e.isDeleted).reduce((sum, e) => sum + e.amount, 0));

        const margin = money(revenueNet + extraIncomes - executorCostNet - otherExpenses);
        const customerDebt = money(Math.max(revenueGross - paidIn, 0));
        const executorDebt = money(Math.max(executorCostGross - paidOut, 0));

        const isCustomerPaid = paidIn >= revenueGross && revenueGross > 0;
        const isExecutorPaid = paidOut >= executorCostGross && executorCostGross > 0;

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

        const [payments, incomes, expenses] = await Promise.all([
            this.prisma.payment.findMany({
                where: { orderId, companyId, isDeleted: false },
                orderBy: { date: 'desc' },
                include: { counterparty: { select: { name: true } } },
            }),
            this.prisma.income.findMany({
                where: { orderId, companyId },
                orderBy: { date: 'desc' },
            }),
            isCustomer
                ? []
                : this.prisma.expense.findMany({
                    where: { orderId, companyId },
                    orderBy: { date: 'desc' },
                }),
        ]);

        const fin = this.computeOrderFinance({
            order,
            payments,
            incomes,
            expenses,
            companyId,
        });

        if (isCustomer) {
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
                payments,
                incomes,
                expenses: [],
                summary: {
                    customerPrice: order.customerPrice || 0,
                    driverCost: 0,
                    subForwarderPrice: 0,
                    executorCost: 0,
                    margin: 0,
                    totalIncomes: fin.paidIn,
                    totalExpenses: 0,
                    balance: fin.paidIn,
                    isCustomerPaid: fin.isCustomerPaid,
                    isDriverPaid: false,
                    isSubForwarderPaid: false,
                    customerDebt: fin.customerDebt,
                    driverDebt: 0,
                    subForwarderDebt: 0,
                    executorDebt: 0,
                },
            };
        }

        return {
            order,
            payments,
            incomes,
            expenses,
            summary: {
                customerPrice: order.customerPrice || 0,
                driverCost: order.driverCost || 0,
                subForwarderPrice: order.subForwarderPrice || 0,
                executorCost: fin.executorCost,
                margin: fin.margin,
                totalIncomes: money(fin.paidIn + fin.extraIncomes),
                totalExpenses: money(fin.paidOut + fin.otherExpenses),
                balance: money((fin.paidIn + fin.extraIncomes) - (fin.paidOut + fin.otherExpenses)),
                isCustomerPaid: fin.isCustomerPaid,
                isDriverPaid: order.subForwarderId ? false : fin.isExecutorPaid,
                isSubForwarderPaid: order.subForwarderId ? fin.isExecutorPaid : false,
                customerDebt: fin.customerDebt,
                driverDebt: order.subForwarderId ? 0 : fin.executorDebt,
                subForwarderDebt: order.subForwarderId ? fin.executorDebt : 0,
                executorDebt: fin.executorDebt,
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
            include: {
                customerCompany: { select: { id: true, name: true } },
                forwarder: { select: { id: true, name: true } },
                driver: { select: { id: true, firstName: true, lastName: true } },
                partner: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                routePoints: { select: { pointType: true, sequence: true, location: { select: { address: true, city: true } } }, orderBy: { sequence: 'asc' } },
                payments: { where: { isDeleted: false } },
                incomes: { where: { isDeleted: false } },
                expenses: { where: { isDeleted: false } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return orders.map(order => {
            const isCustomer = order.customerCompanyId === companyId;
            const fin = this.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            const mapped = {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                completedAt: order.completedAt,
                customerPrice: order.customerPrice,
                customerPriceType: order.customerPriceType,
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                driverCost: isCustomer ? null : order.driverCost,
                subForwarderPrice: isCustomer ? null : order.subForwarderPrice,
                subForwarderId: isCustomer ? null : order.subForwarderId,
                isDriverPaid: isCustomer ? false : (order.subForwarderId ? false : fin.isExecutorPaid),
                driverPaidAt: order.driverPaidAt,
                isSubForwarderPaid: isCustomer ? false : (order.subForwarderId ? fin.isExecutorPaid : false),
                subForwarderPaidAt: order.subForwarderPaidAt,
                customerCompanyId: order.customerCompanyId,
                customerCompany: order.customerCompany,
                forwarder: order.forwarder,
                assignedDriverName: order.assignedDriverName,
                driver: order.driver,
                partner: order.partner,
                subForwarder: order.subForwarder,
                routePoints: order.routePoints,
                margin: fin.margin,
                customerDebt: fin.customerDebt,
                executorDebt: fin.executorDebt,
                paidIn: fin.paidIn,
                paidOut: fin.paidOut,
                executorCost: isCustomer ? null : fin.executorCost,
            };

            if (isCustomer) {
                mapped.driverCost = null;
                mapped.subForwarderPrice = null;
                mapped.subForwarderId = null;
                mapped.isDriverPaid = false;
                mapped.driverPaidAt = null;
                mapped.isSubForwarderPaid = false;
                mapped.subForwarderPaidAt = null;
                mapped.partner = null;
                mapped.subForwarder = null;
                mapped.executorCost = null;
            }

            return mapped;
        });
    }

    // ==================== PAYMENT JOURNAL ====================

    async getIncomesJournal(companyId: string) {
        const orders = await this.prisma.order.findMany({
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
                    { customerCompanyId: { not: companyId } },
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
            include: {
                customerCompany: { select: { id: true, name: true } },
                customer: { select: { id: true, firstName: true, lastName: true } },
                payments: { where: { isDeleted: false } },
                incomes: { where: { isDeleted: false } },
                expenses: { where: { isDeleted: false } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return orders.map(order => {
            const fin = this.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            return {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                customerPrice: order.customerPrice,
                customerPriceType: order.customerPriceType,
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                customerPaymentCondition: order.customerPaymentCondition,
                customerPaymentForm: order.customerPaymentForm,
                completedAt: order.completedAt,
                customerCompany: order.customerCompany,
                customer: order.customer,
            };
        });
    }

    async getExpensesJournal(companyId: string) {
        const orders = await this.prisma.order.findMany({
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
                    { customerCompanyId: { not: companyId } },
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
            include: {
                driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
                partner: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                payments: { where: { isDeleted: false } },
                incomes: { where: { isDeleted: false } },
                expenses: { where: { isDeleted: false } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return orders.map(order => {
            const fin = this.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            return {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                driverCost: order.driverCost,
                subForwarderPrice: order.subForwarderPrice,
                subForwarderId: order.subForwarderId,
                isDriverPaid: order.subForwarderId ? false : fin.isExecutorPaid,
                driverPaidAt: order.driverPaidAt,
                isSubForwarderPaid: order.subForwarderId ? fin.isExecutorPaid : false,
                subForwarderPaidAt: order.subForwarderPaidAt,
                driverPaymentCondition: order.driverPaymentCondition,
                driverPaymentForm: order.driverPaymentForm,
                completedAt: order.completedAt,
                assignedDriverName: order.assignedDriverName,
                assignedDriverPhone: order.assignedDriverPhone,
                driver: order.driver,
                partner: order.partner,
                subForwarder: order.subForwarder,
            };
        });
    }

    async getCustomerExpensesJournal(companyId: string) {
        const orders = await this.prisma.order.findMany({
            where: {
                customerCompanyId: companyId,
                customerPrice: { not: null },
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            include: {
                forwarder: { select: { id: true, name: true } },
                payments: { where: { isDeleted: false } },
                incomes: { where: { isDeleted: false } },
                expenses: { where: { isDeleted: false } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return orders.map(order => {
            const fin = this.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            return {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                status: order.status,
                cargoDescription: order.cargoDescription || '',
                customerPrice: order.customerPrice,
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                forwarder: order.forwarder,
            };
        });
    }

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
                    note: AccountingService.AUTO_NOTE_CUSTOMER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.IN,
                    isDeleted: false,
                    companyId,
                    note: AccountingService.AUTO_NOTE_CUSTOMER,
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
                    note: AccountingService.AUTO_NOTE_DRIVER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.OUT,
                    isDeleted: false,
                    companyId,
                    note: AccountingService.AUTO_NOTE_DRIVER,
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
                    note: AccountingService.AUTO_NOTE_SUBFORWARDER,
                });
            }
        } else {
            const payments = await this.prisma.payment.findMany({
                where: {
                    orderId,
                    direction: PaymentDirection.OUT,
                    isDeleted: false,
                    companyId,
                    note: AccountingService.AUTO_NOTE_SUBFORWARDER,
                }
            });
            for (const p of payments) {
                await this.deletePayment(companyId, p.id, userId);
            }
            await this.syncOrderPaymentFlags(orderId);
        }

        return this.prisma.order.findUnique({ where: { id: orderId } });
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

        const orderDate = order.completedAt || order.createdAt;
        await this.checkPeriodNotClosed(companyId, orderDate);

        const detailsParts: string[] = [];
        if (data.customerPrice !== undefined && data.customerPrice !== order.customerPrice) {
            detailsParts.push(`Ставка заказчика: ${order.customerPrice || 0} -> ${data.customerPrice}`);
        }
        if (data.driverCost !== undefined && data.driverCost !== order.driverCost) {
            detailsParts.push(`Ставка перевозчика: ${order.driverCost || 0} -> ${data.driverCost}`);
        }
        if (data.subForwarderPrice !== undefined && data.subForwarderPrice !== order.subForwarderPrice) {
            detailsParts.push(`Ставка суб-экспедитора: ${order.subForwarderPrice || 0} -> ${data.subForwarderPrice}`);
        }
        if (data.vatRate !== undefined && data.vatRate !== order.vatRate) {
            detailsParts.push(`Ставка НДС: ${order.vatRate || 0}% -> ${data.vatRate}%`);
        }
        if (data.hasVat !== undefined && data.hasVat !== order.hasVat) {
            detailsParts.push(`НДС заказчика: ${order.hasVat ? 'Да' : 'Нет'} -> ${data.hasVat ? 'Да' : 'Нет'}`);
        }
        if (data.executorVatRate !== undefined && data.executorVatRate !== order.executorVatRate) {
            detailsParts.push(`Ставка НДС исполнителя: ${order.executorVatRate || 0}% -> ${data.executorVatRate}%`);
        }
        if (data.executorHasVat !== undefined && data.executorHasVat !== order.executorHasVat) {
            detailsParts.push(`НДС исполнителя: ${order.executorHasVat ? 'Да' : 'Нет'} -> ${data.executorHasVat ? 'Да' : 'Нет'}`);
        }

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                ...(data.customerPrice !== undefined && { customerPrice: data.customerPrice }),
                ...(data.driverCost !== undefined && { driverCost: data.driverCost }),
                ...(data.subForwarderPrice !== undefined && { subForwarderPrice: data.subForwarderPrice }),
                ...(data.customerPaymentCondition !== undefined && { customerPaymentCondition: data.customerPaymentCondition }),
                ...(data.customerPaymentForm !== undefined && { customerPaymentForm: data.customerPaymentForm }),
                ...(data.driverPaymentCondition !== undefined && { driverPaymentCondition: data.driverPaymentCondition }),
                ...(data.driverPaymentForm !== undefined && { driverPaymentForm: data.driverPaymentForm }),
                ...(data.vatRate !== undefined && { vatRate: data.vatRate }),
                ...(data.hasVat !== undefined && { hasVat: data.hasVat }),
                ...(data.executorVatRate !== undefined && { executorVatRate: data.executorVatRate }),
                ...(data.executorHasVat !== undefined && { executorHasVat: data.executorHasVat }),
            },
        });

        if (detailsParts.length > 0) {
            await this.prisma.orderChangeLog.create({
                data: {
                    orderId,
                    userId,
                    action: 'finance_updated',
                    details: `Обновлены финансовые параметры: ${detailsParts.join(', ')}`
                }
            });
        }

        return updated;
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
        await this.checkPeriodNotClosed(companyId, data.date);
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

        await this.checkPeriodNotClosed(companyId, expense.date);
        if (data.date && new Date(data.date).getTime() !== new Date(expense.date).getTime()) {
            await this.checkPeriodNotClosed(companyId, data.date);
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

        await this.checkPeriodNotClosed(companyId, expense.date);

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
        await this.checkPeriodNotClosed(companyId, data.date);
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

        await this.checkPeriodNotClosed(companyId, income.date);
        if (data.date && new Date(data.date).getTime() !== new Date(income.date).getTime()) {
            await this.checkPeriodNotClosed(companyId, data.date);
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

        await this.checkPeriodNotClosed(companyId, income.date);

        return this.prisma.income.update({
            where: { id: incomeId },
            data: { isDeleted: true },
        });
    }

    // ==================== COUNTERPARTY REPORT (Взаиморасчёты) ====================

    async getCounterpartyReport(companyId: string) {
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
            include: {
                customerCompany: { select: { id: true, name: true } },
                forwarder: { select: { id: true, name: true } },
                subForwarder: { select: { id: true, name: true } },
                partner: { select: { id: true, name: true } },
                routePoints: {
                    select: {
                        pointType: true,
                        sequence: true,
                        location: { select: { city: true, address: true } },
                    },
                    orderBy: { sequence: 'asc' },
                },
                payments: { where: { isDeleted: false } },
                incomes: { where: { isDeleted: false } },
                expenses: { where: { isDeleted: false } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const counterpartyMap = new Map<string, {
            counterparty: { id: string; name: string };
            ourRole: string;
            orders: any[];
            theyOweUs: number;
            theyOweUsPaid: number;
            weOweThem: number;
            weOweThemPaid: number;
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
            const isForwarder = order.forwarderId === companyId || order.partnerId === companyId;
            const isSubForwarder = order.subForwarderId === companyId;

            const fin = this.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            const orderData = {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                completedAt: order.completedAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                customerPrice: order.customerPrice,
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                routePoints: order.routePoints,
            };

            if (isCustomer && order.forwarder) {
                const entry = getOrCreateEntry(order.forwarder.id, order.forwarder.name, 'Заказчик');
                const amount = fin.executorCost;
                const paid = fin.paidOut;
                entry.weOweThem += amount;
                entry.weOweThemPaid += paid;
                entry.orders.push({
                    ...orderData,
                    amount,
                    isPaid: fin.isExecutorPaid,
                    paidAt: order.customerPaidAt,
                    direction: 'weOwe',
                });
            }

            if (isForwarder && order.customerCompany) {
                const entry = getOrCreateEntry(order.customerCompany.id, order.customerCompany.name, 'Экспедитор');
                const amount = fin.revenue;
                const paid = fin.paidIn;
                entry.theyOweUs += amount;
                entry.theyOweUsPaid += paid;
                entry.orders.push({
                    ...orderData,
                    amount,
                    isPaid: fin.isCustomerPaid,
                    paidAt: order.customerPaidAt,
                    direction: 'theyOwe',
                });
            }

            if (isForwarder && order.subForwarder) {
                const entry = getOrCreateEntry(order.subForwarder.id, order.subForwarder.name, 'Экспедитор');
                const amount = fin.executorCost;
                const paid = fin.paidOut;
                entry.weOweThem += amount;
                entry.weOweThemPaid += paid;
                entry.orders.push({
                    ...orderData,
                    amount,
                    isPaid: fin.isExecutorPaid,
                    paidAt: order.subForwarderPaidAt || order.driverPaidAt,
                    direction: 'weOwe',
                });
            }

            if (isSubForwarder && order.forwarder) {
                const entry = getOrCreateEntry(order.forwarder.id, order.forwarder.name, 'Суб-экспедитор');
                const amount = fin.revenue;
                const paid = fin.paidIn;
                entry.theyOweUs += amount;
                entry.theyOweUsPaid += paid;
                entry.orders.push({
                    ...orderData,
                    amount,
                    isPaid: fin.isCustomerPaid,
                    paidAt: order.subForwarderPaidAt,
                    direction: 'theyOwe',
                });
            }
        }

        const counterparties = Array.from(counterpartyMap.values()).map(entry => ({
            ...entry,
            balance: money(entry.theyOweUs - entry.weOweThem),
            unpaidTheyOweUs: money(Math.max(entry.theyOweUs - entry.theyOweUsPaid, 0)),
            unpaidWeOweThem: money(Math.max(entry.weOweThem - entry.weOweThemPaid, 0)),
            totalOrders: entry.orders.length,
        }));

        counterparties.sort((a, b) => {
            const aUnpaid = a.unpaidTheyOweUs + a.unpaidWeOweThem;
            const bUnpaid = b.unpaidTheyOweUs + b.unpaidWeOweThem;
            return bUnpaid - aUnpaid;
        });

        const totals = {
            totalTheyOweUs: money(counterparties.reduce((s, c) => s + c.theyOweUs, 0)),
            totalWeOweThem: money(counterparties.reduce((s, c) => s + c.weOweThem, 0)),
            unpaidTheyOweUs: money(counterparties.reduce((s, c) => s + c.unpaidTheyOweUs, 0)),
            unpaidWeOweThem: money(counterparties.reduce((s, c) => s + c.unpaidWeOweThem, 0)),
            balance: money(counterparties.reduce((s, c) => s + c.balance, 0)),
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
    }) {
        const amt = money(data.amount);
        await this.checkPeriodNotClosed(companyId, data.date);

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

    async deletePayment(companyId: string, paymentId: string, userId: string) {
        const payment = await this.prisma.payment.findFirst({
            where: { id: paymentId, companyId, isDeleted: false },
        });
        if (!payment) throw new NotFoundException('Платеж не найден');

        await this.checkPeriodNotClosed(companyId, payment.date);

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

    // ==================== PERIOD CLOSING logic & CRUD ====================

    async checkPeriodNotClosed(companyId: string, date: Date | string) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;

        const closed = await this.prisma.closedPeriod.findUnique({
            where: {
                companyId_year_month: {
                    companyId,
                    year,
                    month,
                },
            },
        });

        if (closed) {
            throw new BadRequestException(`Период за ${month.toString().padStart(2, '0')}/${year} закрыт для финансовых операций.`);
        }
    }

    async getClosedPeriods(companyId: string) {
        return this.prisma.closedPeriod.findMany({
            where: { companyId },
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
            include: {
                closedBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
    }

    async closePeriod(companyId: string, userId: string, year: number, month: number) {
        if (month < 1 || month > 12) {
            throw new BadRequestException('Неверный месяц');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (!user || (user.role !== 'COMPANY_ADMIN' && user.role !== 'ACCOUNTANT')) {
            throw new ForbiddenException('У вас нет прав для закрытия периода');
        }

        try {
            return await this.prisma.closedPeriod.create({
                data: {
                    companyId,
                    year,
                    month,
                    closedById: userId,
                },
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new BadRequestException('Этот период уже закрыт');
            }
            throw error;
        }
    }

    async openPeriod(companyId: string, userId: string, year: number, month: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (!user || (user.role !== 'COMPANY_ADMIN' && user.role !== 'ACCOUNTANT')) {
            throw new ForbiddenException('У вас нет прав для открытия периода');
        }

        const period = await this.prisma.closedPeriod.findUnique({
            where: {
                companyId_year_month: {
                    companyId,
                    year,
                    month,
                },
            },
        });

        if (!period) {
            throw new NotFoundException('Закрытый период не найден');
        }

        await this.prisma.closedPeriod.delete({
            where: {
                id: period.id,
            },
        });

        return { success: true };
    }

    // ==================== DASHBOARD KPI SUMMARY ====================

    async getDashboardSummary(companyId: string, query: { startDate?: string; endDate?: string }) {
        const { startDate, endDate } = query;

        const dateFilter = startDate && endDate ? {
            createdAt: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            }
        } : {};

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
                    },
                    dateFilter,
                ],
                status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            include: {
                payments: { where: { isDeleted: false } },
                incomes: { where: { isDeleted: false } },
                expenses: { where: { isDeleted: false } },
            }
        });

        let totalRevenue = 0;
        let totalMargin = 0;
        let debtorSum = 0;
        let creditorSum = 0;
        let unpaidOrdersCount = 0;

        for (const order of orders) {
            const fin = this.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            totalRevenue += fin.revenue;
            totalMargin += fin.margin;
            debtorSum += fin.customerDebt;
            creditorSum += fin.executorDebt;

            const hasUnpaid = (!fin.isCustomerPaid && fin.revenue > 0) || (!fin.isExecutorPaid && fin.executorCost > 0);
            if (hasUnpaid) {
                unpaidOrdersCount++;
            }
        }

        const payments = await this.prisma.payment.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(startDate && endDate && {
                    date: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    }
                })
            }
        });

        const cashIn = payments.filter(p => p.direction === PaymentDirection.IN).reduce((sum, p) => sum + p.amount, 0);
        const cashOut = payments.filter(p => p.direction === PaymentDirection.OUT).reduce((sum, p) => sum + p.amount, 0);

        const manualIncomes = await this.prisma.income.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(startDate && endDate && {
                    date: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    }
                })
            }
        });

        const manualExpenses = await this.prisma.expense.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(startDate && endDate && {
                    date: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    }
                })
            }
        });

        const totalManualIncomes = manualIncomes.filter(i => i.category !== 'order_payment' && i.category !== 'prepayment').reduce((sum, i) => sum + i.amount, 0);
        const totalManualExpenses = manualExpenses.filter(e => e.category !== 'driver_payment').reduce((sum, e) => sum + e.amount, 0);

        const totalCashIn = cashIn + totalManualIncomes;
        const totalCashOut = cashOut + totalManualExpenses;
        const cashBalance = money(totalCashIn - totalCashOut);

        totalRevenue = money(totalRevenue);
        totalMargin = money(totalMargin);
        debtorSum = money(debtorSum);
        creditorSum = money(creditorSum);

        const marginPercentage = totalRevenue > 0 ? money((totalMargin / totalRevenue) * 100) : 0;

        return {
            revenue: totalRevenue,
            margin: totalMargin,
            marginPercentage,
            debtorSum,
            creditorSum,
            cashBalance,
            unpaidOrdersCount,
        };
    }

    // ==================== EXCEL EXPORT GENERATORS ====================

    async exportFinancialRegistry(companyId: string): Promise<Buffer> {
        const registry = await this.getFinancialRegistry(companyId);

        const STATUS_RU = {
            DRAFT: 'Черновик',
            PENDING: 'Ожидает назначения',
            ASSIGNED: 'Назначен водитель',
            EN_ROUTE_PICKUP: 'В пути на погрузку',
            AT_PICKUP: 'На погрузке',
            LOADING: 'Идет погрузка',
            IN_TRANSIT: 'В пути',
            AT_DELIVERY: 'Прибыл на выгрузку',
            UNLOADING: 'Идет разгрузка',
            COMPLETED: 'Завершен',
            CANCELLED: 'Отменен',
            PROBLEM: 'Проблема',
        };

        const rows = registry.map(item => {
            let carrierName = '';
            if (item.subForwarder) carrierName = item.subForwarder.name;
            else if (item.partner) carrierName = item.partner.name;
            else if (item.assignedDriverName) carrierName = item.assignedDriverName;
            else if (item.driver) carrierName = `${item.driver.lastName} ${item.driver.firstName}`;

            const route = (item.routePoints || [])
                .map((p: any) => `${p.location?.city || ''} (${p.pointType === 'PICKUP' ? 'П' : 'В'})`)
                .join(' -> ');

            return {
                'Номер заявки': item.orderNumber,
                'Дата создания': item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '',
                'Статус': STATUS_RU[item.status] || item.status,
                'Груз': item.cargoDescription || '',
                'Маршрут': route,
                'Заказчик': item.customerCompany?.name || '',
                'Стоимость для заказчика (KZT)': item.customerPrice || 0,
                'Оплачено заказчиком (KZT)': item.paidIn || 0,
                'Долг заказчика (KZT)': item.customerDebt || 0,
                'Статус оплаты заказчика': item.isCustomerPaid ? 'Оплачено' : 'Не оплачено',
                'Перевозчик': carrierName,
                'Стоимость перевозчика (KZT)': item.executorCost || 0,
                'Оплачено перевозчению (KZT)': item.paidOut || 0,
                'Долг перед перевозчиком (KZT)': item.executorDebt || 0,
                'Статус оплаты перевозчика': item.isDriverPaid || item.isSubForwarderPaid ? 'Оплачено' : 'Не оплачено',
                'Маржа (KZT)': item.margin || 0,
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        const maxLen = rows.reduce((widths, row) => {
            Object.keys(row).forEach((key, i) => {
                const val = String((row as any)[key] ?? '');
                widths[i] = Math.max(widths[i] || 10, val.length, key.length);
            });
            return widths;
        }, [] as number[]);
        ws['!cols'] = maxLen.map(w => ({ wch: w + 2 }));

        XLSX.utils.book_append_sheet(wb, ws, 'Реестр');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    async exportCounterpartyReport(companyId: string): Promise<Buffer> {
        const report = await this.getCounterpartyReport(companyId);

        const rows = report.counterparties.map(item => {
            let balanceText = 'В расчете';
            if (item.balance > 0) balanceText = 'Они нам должны';
            else if (item.balance < 0) balanceText = 'Мы им должны';

            return {
                'Контрагент': item.counterparty.name,
                'Наша роль': item.ourRole,
                'Всего сделок': item.totalOrders,
                'Всего они нам должны (KZT)': item.theyOweUs,
                'Оплачено ими нам (KZT)': item.theyOweUsPaid,
                'Долг за ними (KZT)': item.unpaidTheyOweUs,
                'Всего мы им должны (KZT)': item.weOweThem,
                'Оплачено нами им (KZT)': item.weOweThemPaid,
                'Долг за нами (KZT)': item.unpaidWeOweThem,
                'Баланс взаиморасчетов (KZT)': item.balance,
                'Статус': balanceText,
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        const maxLen = rows.reduce((widths, row) => {
            Object.keys(row).forEach((key, i) => {
                const val = String((row as any)[key] ?? '');
                widths[i] = Math.max(widths[i] || 10, val.length, key.length);
            });
            return widths;
        }, [] as number[]);
        ws['!cols'] = maxLen.map(w => ({ wch: w + 2 }));

        XLSX.utils.book_append_sheet(wb, ws, 'Взаиморасчеты');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }
}
