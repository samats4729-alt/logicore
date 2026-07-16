import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { FinanceCalculatorService } from './finance-calculator.service';
import { PeriodClosingService } from './period-closing.service';
import { v4 as uuidv4 } from 'uuid';
import { PaymentDirection, PaymentMethod, Prisma, AccountKind, InvoiceType, InvoiceStatus } from '@prisma/client';
import { money } from '../../common/utils/money';
import { PaymentsService } from './payments.service';
import { EXCLUDED_INCOME_CATEGORIES, EXCLUDED_EXPENSE_CATEGORIES } from '../constants';
import * as XLSX from 'xlsx';

@Injectable()
export class FinancialReportsService {
    constructor(
        private prisma: PrismaService,
        private redisService: RedisService,
        private configService: ConfigService,
        private calculator: FinanceCalculatorService,
        private periodClosing: PeriodClosingService,
        private paymentsService: PaymentsService,
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
                responsibles: {
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true } },
                        company: { select: { id: true, name: true } },
                    },
                },
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

        // Платежи всего заказа нужны калькулятору (оплата заказчика/суб-экспедитора
        // определяется по платежам экспедитора); на экран отдаём только свои.
        const [allPayments, incomes, expenses] = await Promise.all([
            this.prisma.payment.findMany({
                where: { orderId, isDeleted: false },
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

        const payments = allPayments.filter(p => p.companyId === companyId);

        const fin = this.calculator.computeOrderFinance({
            order,
            payments: allPayments,
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
                    revenueNet: 0,
                    revenueVat: 0,
                    executorCostNet: fin.executorCostNet,
                    executorCostVat: fin.executorCostVat,
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
                revenueNet: fin.revenueNet,
                revenueVat: fin.revenueVat,
                executorCostNet: fin.executorCostNet,
                executorCostVat: fin.executorCostVat,
            },
        };
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
        await this.periodClosing.checkPeriodNotClosed(companyId, orderDate);

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

        await this.paymentsService.syncOrderPaymentFlags(orderId);

        return updated;
    }

    // ==================== FINANCIAL REGISTRY ====================

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
            const fin = this.calculator.computeOrderFinance({
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
                margin: isCustomer ? null : fin.margin,
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
            const fin = this.calculator.computeOrderFinance({
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
            const fin = this.calculator.computeOrderFinance({
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
            const fin = this.calculator.computeOrderFinance({
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

    // ==================== COUNTERPARTY REPORT ====================

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
                driver: { select: { firstName: true, lastName: true, vehiclePlate: true, vehicleModel: true } },
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

            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            // Водитель и машина: приоритет — вручную назначенные поля, иначе из карточки водителя
            const driverName = order.assignedDriverName
                || (order.driver ? `${order.driver.lastName || ''} ${order.driver.firstName || ''}`.trim() : '')
                || null;
            const vehiclePlate = order.assignedDriverPlate || order.driver?.vehiclePlate || null;

            const orderData = {
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt,
                completedAt: order.completedAt,
                status: order.status,
                cargoDescription: order.cargoDescription,
                driverName,
                vehiclePlate,
                customerPrice: order.customerPrice,
                isCustomerPaid: fin.isCustomerPaid,
                customerPaidAt: order.customerPaidAt,
                routePoints: order.routePoints,
                incomingInvoiceId: order.incomingInvoiceId,
                outgoingInvoiceId: order.outgoingInvoiceId,
                subForwarderId: order.subForwarderId,
                subForwarderPrice: order.subForwarderPrice,
                driverCost: order.driverCost,
            };

            if (isCustomer && order.forwarder && order.forwarder.id !== companyId) {
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

            if (isForwarder && order.customerCompany && order.customerCompany.id !== companyId) {
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

            if (isForwarder && order.subForwarder && order.subForwarder.id !== companyId) {
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

            if (isSubForwarder && order.forwarder && order.forwarder.id !== companyId) {
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

    // ==================== SHARE REPORT ====================

    async generateShareToken(companyId: string, counterpartyId: string, ourRole: string): Promise<{ token: string; shareUrl: string }> {
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

        const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
        const shareUrl = `${frontendUrl}/shared/report/${token}`;

        return { token, shareUrl };
    }

    async getSharedReport(token: string) {
        const raw = await this.redisService.get(`share_report:${token}`);
        if (!raw) {
            throw new NotFoundException('Ссылка недействительна или истёк срок действия');
        }

        const { companyId, companyName, counterpartyId, ourRole, createdAt } = JSON.parse(raw);
        const fullReport = await this.getCounterpartyReport(companyId);

        const key = `${counterpartyId}__${ourRole}`;
        const counterparty = fullReport.counterparties.find(
            (c: any) => `${c.counterparty.id}__${c.ourRole}` === key
        );

        const invoices = await this.prisma.invoice.findMany({
            where: {
                OR: [
                    { issuerId: companyId, recipientId: counterpartyId },
                    { issuerId: counterpartyId, recipientId: companyId },
                ],
            },
            include: {
                issuer: { select: { id: true, name: true } },
                recipient: { select: { id: true, name: true } },
                incomingOrders: {
                    select: {
                        id: true,
                        orderNumber: true,
                    },
                },
                outgoingOrders: {
                    select: {
                        id: true,
                        orderNumber: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!counterparty) {
            const { counterpartyName: cpName } = JSON.parse(raw);
            return {
                senderCompany: companyName,
                counterpartyName: cpName,
                ourRole,
                createdAt,
                expiresIn: '7 дней',
                counterparty: null,
                totals: null,
                invoices,
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
            invoices,
        };
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
        const raw = await this.redisService.get(`share_report:${token}`);
        if (!raw) {
            throw new NotFoundException('Ссылка недействительна или истёк срок действия');
        }

        const { companyId, counterpartyId } = JSON.parse(raw);

        if (!dto.orderIds || dto.orderIds.length === 0) {
            throw new BadRequestException('Счет должен содержать как минимум один заказ');
        }

        const orders = await this.prisma.order.findMany({
            where: {
                id: { in: dto.orderIds },
            },
        });

        if (orders.length !== dto.orderIds.length) {
            throw new BadRequestException('Некоторые заказы не найдены');
        }

        // Каждый заказ обязан относиться к паре companyId<->counterpartyId,
        // все — к одному «потоку» денег:
        //  - customer: заказчик платит экспедитору (сумма = customerPrice, слот outgoingInvoiceId)
        //  - executor: экспедитор платит суб-экспедитору (сумма = subForwarderPrice, слот incomingInvoiceId)
        const pair = new Set([companyId, counterpartyId]);
        let flow: 'customer' | 'executor' | null = null;
        let issuerId = '';
        let recipientId = '';

        for (const o of orders) {
            const fwd = o.forwarderId || o.partnerId;
            let f: 'customer' | 'executor' | null = null;
            let iss = '';
            let rec = '';
            if (o.customerCompanyId && fwd && o.customerCompanyId !== fwd && pair.has(o.customerCompanyId) && pair.has(fwd)) {
                f = 'customer';
                iss = fwd;
                rec = o.customerCompanyId;
            } else if (fwd && o.subForwarderId && fwd !== o.subForwarderId && pair.has(fwd) && pair.has(o.subForwarderId)) {
                f = 'executor';
                iss = o.subForwarderId;
                rec = fwd;
            }
            if (!f) {
                throw new BadRequestException(`Заказ №${o.orderNumber} не относится к взаиморасчётам этих компаний`);
            }
            if (!flow) {
                flow = f;
                issuerId = iss;
                recipientId = rec;
            } else if (flow !== f || issuerId !== iss || recipientId !== rec) {
                throw new BadRequestException('Все заказы в счёте должны относиться к одной паре компаний и одному направлению расчётов');
            }
        }

        let amount = 0;
        for (const o of orders) {
            amount += flow === 'customer' ? (o.customerPrice || 0) : (o.subForwarderPrice || 0);
        }

        // Тип счёта следует потоку денег (единая конвенция со слотами и страницами счёта):
        // customer-поток (экспедитор выставляет заказчику) = OUTGOING, executor-поток = INCOMING
        const type = flow === 'customer' ? InvoiceType.OUTGOING : InvoiceType.INCOMING;

        // Проверяем, что заказы ещё не засчётованы по этому направлению
        for (const order of orders) {
            const already = flow === 'customer' ? order.outgoingInvoiceId : order.incomingInvoiceId;
            if (already) {
                throw new BadRequestException(`Заказ №${order.orderNumber} уже включён в счёт по этому направлению`);
            }
        }

        const companyUser = await this.prisma.user.findFirst({
            where: { companyId, role: { in: ['ACCOUNTANT', 'COMPANY_ADMIN', 'FORWARDER'] } },
        });

        if (!companyUser) {
            throw new BadRequestException('Не найден ответственный пользователь для привязки к счету');
        }

        const invoice = await this.prisma.invoice.create({
            data: {
                invoiceNumber: dto.invoiceNumber,
                type,
                status: InvoiceStatus.PENDING,
                issuerId,
                recipientId,
                date: new Date(dto.date),
                dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                amount,
                note: dto.note,
                createdById: companyUser.id,
            },
        });

        // Слот привязки зависит от потока денег, а не от типа счёта:
        // customer-поток занимает outgoingInvoiceId, executor-поток — incomingInvoiceId
        if (flow === 'customer') {
            await this.prisma.order.updateMany({
                where: { id: { in: dto.orderIds } },
                data: { outgoingInvoiceId: invoice.id },
            });
        } else {
            await this.prisma.order.updateMany({
                where: { id: { in: dto.orderIds } },
                data: { incomingInvoiceId: invoice.id },
            });
        }

        return invoice;
    }

    // ==================== DASHBOARD SUMMARY ====================

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
            const fin = this.calculator.computeOrderFinance({
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

        const totalManualIncomes = manualIncomes.filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category)).reduce((sum, i) => sum + i.amount, 0);
        const totalManualExpenses = manualExpenses.filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category)).reduce((sum, e) => sum + e.amount, 0);

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

    // ==================== CASHFLOW REPORT ====================

    async getCashflowReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        const { startDate, endDate } = query;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        const defaultBank = await this.prisma.financeAccount.findFirst({
            where: { companyId, kind: AccountKind.BANK, isDefault: true }
        });
        const defaultCash = await this.prisma.financeAccount.findFirst({
            where: { companyId, kind: AccountKind.CASH, isDefault: true }
        });

        let startBalance = 0;
        if (start) {
            const prevPayments = await this.prisma.payment.findMany({
                where: { companyId, isDeleted: false, date: { lt: start } }
            });
            const prevIncomes = await this.prisma.income.findMany({
                where: { companyId, isDeleted: false, date: { lt: start } }
            });
            const prevExpenses = await this.prisma.expense.findMany({
                where: { companyId, isDeleted: false, date: { lt: start } }
            });

            const pIn = money(prevPayments.filter(p => p.direction === PaymentDirection.IN).reduce((s, p) => s + p.amount, 0));
            const pOut = money(prevPayments.filter(p => p.direction === PaymentDirection.OUT).reduce((s, p) => s + p.amount, 0));
            const inc = money(prevIncomes.filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category)).reduce((s, i) => s + i.amount, 0));
            const exp = money(prevExpenses.filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category)).reduce((s, e) => s + e.amount, 0));

            startBalance = money(pIn + inc - pOut - exp);
        }

        const dateFilter = start && end ? {
            date: { gte: start, lte: end }
        } : {};

        const payments = await this.prisma.payment.findMany({
            where: { companyId, isDeleted: false, ...dateFilter },
            include: { account: true, category: true, counterparty: { select: { name: true } }, order: { select: { orderNumber: true } } },
            orderBy: { date: 'desc' },
        });

        const incomes = await this.prisma.income.findMany({
            where: { companyId, isDeleted: false, ...dateFilter },
            orderBy: { date: 'desc' },
        });

        const expenses = await this.prisma.expense.findMany({
            where: { companyId, isDeleted: false, ...dateFilter },
            orderBy: { date: 'desc' },
        });

        const flowItems: Array<{
            id: string;
            date: Date;
            direction: PaymentDirection;
            amount: number;
            method: PaymentMethod;
            accountName: string;
            categoryName: string;
            counterpartyName: string;
            note: string;
            source: 'payment' | 'income' | 'expense';
        }> = [];

        payments.forEach(p => {
            flowItems.push({
                id: p.id,
                date: p.date,
                direction: p.direction,
                amount: money(p.amount),
                method: p.method,
                accountName: p.account?.name || (p.method === 'CASH' ? defaultCash?.name : defaultBank?.name) || 'Банк',
                categoryName: p.category?.name || (p.direction === PaymentDirection.IN ? 'Оплата за рейс' : 'Оплата исполнителю'),
                counterpartyName: p.counterparty?.name || '—',
                note: p.note || (p.order ? `По заявке ${p.order.orderNumber}` : ''),
                source: 'payment',
            });
        });

        incomes.filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category)).forEach(i => {
            flowItems.push({
                id: i.id,
                date: i.date,
                direction: PaymentDirection.IN,
                amount: money(i.amount),
                method: PaymentMethod.BANK,
                accountName: defaultBank?.name || 'Банк',
                categoryName: i.category === 'order_payment' ? 'Оплата за рейс' : i.category === 'prepayment' ? 'Предоплата' : i.category,
                counterpartyName: '—',
                note: i.description + (i.note ? ` (${i.note})` : ''),
                source: 'income',
            });
        });

        expenses.filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category)).forEach(e => {
            flowItems.push({
                id: e.id,
                date: e.date,
                direction: PaymentDirection.OUT,
                amount: money(e.amount),
                method: PaymentMethod.BANK,
                accountName: defaultBank?.name || 'Банк',
                categoryName: e.category,
                counterpartyName: '—',
                note: e.description + (e.note ? ` (${e.note})` : ''),
                source: 'expense',
            });
        });

        flowItems.sort((a, b) => b.date.getTime() - a.date.getTime());

        const accountsMap = new Map<string, { name: string; in: number; out: number; balance: number }>();
        const getAcc = (name: string) => {
            if (!accountsMap.has(name)) {
                accountsMap.set(name, { name, in: 0, out: 0, balance: 0 });
            }
            return accountsMap.get(name)!;
        };

        if (defaultBank) getAcc(defaultBank.name);
        if (defaultCash) getAcc(defaultCash.name);

        const methodsMap = new Map<string, { name: string; in: number; out: number; balance: number }>();
        const getMethodGroup = (method: string) => {
            const labels: Record<string, string> = {
                CASH: 'Наличные',
                BANK: 'Банк',
                CARD: 'Карта',
                OTHER: 'Прочее',
            };
            const label = labels[method] || method;
            if (!methodsMap.has(method)) {
                methodsMap.set(method, { name: label, in: 0, out: 0, balance: 0 });
            }
            return methodsMap.get(method)!;
        };

        const categoriesMap = new Map<string, { name: string; direction: PaymentDirection; amount: number }>();
        const getCatGroup = (name: string, dir: PaymentDirection) => {
            const key = `${name}__${dir}`;
            if (!categoriesMap.has(key)) {
                categoriesMap.set(key, { name, direction: dir, amount: 0 });
            }
            return categoriesMap.get(key)!;
        };

        let totalIn = 0;
        let totalOut = 0;

        flowItems.forEach(item => {
            const amt = item.amount;
            const isCopy = item.direction === PaymentDirection.IN;

            if (isCopy) {
                totalIn = money(totalIn + amt);
            } else {
                totalOut = money(totalOut + amt);
            }

            const acc = getAcc(item.accountName);
            if (isCopy) acc.in = money(acc.in + amt);
            else acc.out = money(acc.out + amt);

            const met = getMethodGroup(item.method);
            if (isCopy) met.in = money(met.in + amt);
            else met.out = money(met.out + amt);

            const cat = getCatGroup(item.categoryName, item.direction);
            cat.amount = money(cat.amount + amt);
        });

        totalIn = money(totalIn);
        totalOut = money(totalOut);
        const netChange = money(totalIn - totalOut);
        const endBalance = money(startBalance + netChange);

        const accounts = Array.from(accountsMap.values()).map(a => ({
            ...a,
            in: money(a.in),
            out: money(a.out),
            balance: money(a.in - a.out),
        }));

        const methods = Array.from(methodsMap.values()).map(m => ({
            ...m,
            in: money(m.in),
            out: money(m.out),
            balance: money(m.in - m.out),
        }));

        const categories = Array.from(categoriesMap.values()).map(c => ({
            ...c,
            amount: money(c.amount),
        }));

        return {
            startBalance,
            totalIn,
            totalOut,
            netChange,
            endBalance,
            accounts,
            methods,
            categories,
            flows: flowItems.map(item => ({
                ...item,
                date: item.date.toISOString(),
            })),
        };
    }

    // ==================== PNL REPORT ====================

    async getPnLReport(companyId: string, query: { startDate?: string; endDate?: string }) {
        const { startDate, endDate } = query;

        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        const dateFilter = start && end ? {
            createdAt: { gte: start, lte: end }
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

        let totalRevenueNet = 0;
        let totalExecutorCostNet = 0;

        for (const order of orders) {
            const fin = this.calculator.computeOrderFinance({
                order,
                payments: order.payments,
                incomes: order.incomes,
                expenses: order.expenses,
                companyId,
            });

            totalRevenueNet = money(totalRevenueNet + fin.revenueNet);
            totalExecutorCostNet = money(totalExecutorCostNet + fin.executorCostNet);
        }

        totalRevenueNet = money(totalRevenueNet);
        totalExecutorCostNet = money(totalExecutorCostNet);

        const manualIncomes = await this.prisma.income.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(start && end && {
                    date: { gte: start, lte: end }
                })
            }
        });

        const manualExpenses = await this.prisma.expense.findMany({
            where: {
                companyId,
                isDeleted: false,
                ...(start && end && {
                    date: { gte: start, lte: end }
                })
            }
        });

        const otherIncomesMap = new Map<string, number>();
        const otherExpensesMap = new Map<string, number>();

        manualIncomes
            .filter(i => !EXCLUDED_INCOME_CATEGORIES.includes(i.category))
            .forEach(i => {
                otherIncomesMap.set(i.category, money((otherIncomesMap.get(i.category) || 0) + i.amount));
            });

        manualExpenses
            .filter(e => !EXCLUDED_EXPENSE_CATEGORIES.includes(e.category))
            .forEach(e => {
                otherExpensesMap.set(e.category, money((otherExpensesMap.get(e.category) || 0) + e.amount));
            });

        const otherIncomes = Array.from(otherIncomesMap.entries()).map(([name, amount]) => ({
            name,
            amount: money(amount),
        }));

        const otherExpenses = Array.from(otherExpensesMap.entries()).map(([name, amount]) => ({
            name,
            amount: money(amount),
        }));

        const totalOtherIncomes = money(otherIncomes.reduce((s, i) => s + i.amount, 0));
        const totalOtherExpenses = money(otherExpenses.reduce((s, e) => s + e.amount, 0));

        const grossProfit = money(totalRevenueNet - totalExecutorCostNet);
        const netProfit = money(grossProfit + totalOtherIncomes - totalOtherExpenses);
        const marginPercentage = totalRevenueNet > 0 ? money((netProfit / totalRevenueNet) * 100) : 0;

        return {
            revenueNet: totalRevenueNet,
            executorCostNet: totalExecutorCostNet,
            grossProfit,
            otherIncomes,
            otherExpenses,
            totalOtherIncomes,
            totalOtherExpenses,
            netProfit,
            marginPercentage,
        };
    }

    // ==================== EXPORTS ====================

    async exportFinancialRegistry(companyId: string): Promise<Buffer> {
        const registry = await this.getFinancialRegistry(companyId);

        const STATUS_RU: Record<string, string> = {
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

    async exportCashflowReport(companyId: string, query: { startDate?: string; endDate?: string }): Promise<Buffer> {
        const report = await this.getCashflowReport(companyId, query);

        const rows = report.flows.map(item => ({
            'Дата': new Date(item.date).toLocaleDateString(),
            'Направление': item.direction === 'IN' ? 'Поступление' : 'Расход',
            'Сумма (₸)': item.amount,
            'Способ оплаты': item.method === 'CASH' ? 'Наличные' : item.method === 'BANK' ? 'Банк' : item.method === 'CARD' ? 'Карта' : 'Прочее',
            'Счет / Касса': item.accountName,
            'Статья': item.categoryName,
            'Контрагент': item.counterpartyName,
            'Примечание': item.note,
        }));

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

        XLSX.utils.book_append_sheet(wb, ws, 'ДДС');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    async exportPnLReport(companyId: string, query: { startDate?: string; endDate?: string }): Promise<Buffer> {
        const report = await this.getPnLReport(companyId, query);

        const rows = [
            { 'Показатель': 'Выручка (Net)', 'Сумма (₸)': report.revenueNet },
            { 'Показатель': 'Себестоимость исполнителя (Net)', 'Сумма (₸)': report.executorCostNet },
            { 'Показатель': 'Валовая прибыль (Gross Profit)', 'Сумма (₸)': report.grossProfit },
            { 'Показатель': '—', 'Сумма (₸)': '—' },
            ...report.otherIncomes.map(i => ({ 'Показатель': `Прочие доходы: ${i.name}`, 'Сумма (₸)': i.amount })),
            { 'Показатель': 'Всего прочих доходов', 'Сумма (₸)': report.totalOtherIncomes },
            { 'Показатель': '—', 'Сумма (₸)': '—' },
            ...report.otherExpenses.map(e => ({ 'Показатель': `Прочие расходы: ${e.name}`, 'Сумма (₸)': e.amount })),
            { 'Показатель': 'Всего прочих расходов', 'Сумма (₸)': report.totalOtherExpenses },
            { 'Показатель': '—', 'Сумма (₸)': '—' },
            { 'Показатель': 'Чистая прибыль (Net Profit)', 'Сумма (₸)': report.netProfit },
            { 'Показатель': 'Рентабельность (%)', 'Сумма (₸)': `${report.marginPercentage}%` }
        ];

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

        XLSX.utils.book_append_sheet(wb, ws, 'P&L');
        return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }
}
