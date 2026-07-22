import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceType, InvoiceStatus } from '@prisma/client';
import { PaymentsService } from '../accounting/services/payments.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class InvoiceService {
    constructor(
        private prisma: PrismaService,
        private paymentsService: PaymentsService,
        private emailService: EmailService,
        private configService: ConfigService,
    ) {}

    async createInvoice(
        companyId: string,
        createdById: string,
        dto: {
            invoiceNumber: string;
            type: InvoiceType;
            date: string | Date;
            dueDate?: string | Date;
            issuerId: string;
            recipientId: string;
            orderIds: string[];
            note?: string;
        },
    ) {
        if (!dto.orderIds || dto.orderIds.length === 0) {
            throw new BadRequestException('Счет должен содержать как минимум один заказ');
        }

        // Загрузим заказы
        const orders = await this.prisma.order.findMany({
            where: {
                id: { in: dto.orderIds },
            },
        });

        if (orders.length !== dto.orderIds.length) {
            throw new BadRequestException('Некоторые заказы не найдены');
        }

        // Проверим, что заказы еще не выставлены в счет по данному типу
        for (const order of orders) {
            if (dto.type === InvoiceType.OUTGOING && order.outgoingInvoiceId) {
                throw new BadRequestException(`Заказ №${order.orderNumber} уже добавлен в исходящий счет`);
            }
            if (dto.type === InvoiceType.INCOMING && order.incomingInvoiceId) {
                throw new BadRequestException(`Заказ №${order.orderNumber} уже добавлен во входящий счет`);
            }
        }

        // Рассчитаем сумму счета
        let amount = 0;
        for (const order of orders) {
            if (dto.type === InvoiceType.OUTGOING) {
                amount += order.customerPrice || 0;
            } else {
                // Входящий счет от перевозчика или субподрядчика
                if (order.subForwarderId === dto.issuerId) {
                    amount += order.subForwarderPrice || 0;
                } else {
                    amount += order.driverCost || 0;
                }
            }
        }

        // Создаём счёт и привязываем заказы атомарно (в одной транзакции):
        // либо всё вместе, либо ничего — чтобы не оставалось «полусозданных» счетов
        let invoice;
        try {
            invoice = await this.prisma.$transaction(async (tx) => {
                const created = await tx.invoice.create({
                    data: {
                        invoiceNumber: dto.invoiceNumber,
                        type: dto.type,
                        status: InvoiceStatus.DRAFT,
                        issuerId: dto.issuerId,
                        recipientId: dto.recipientId,
                        date: new Date(dto.date),
                        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
                        amount,
                        note: dto.note,
                        createdById,
                    },
                });

                await tx.order.updateMany({
                    where: { id: { in: dto.orderIds } },
                    data: dto.type === InvoiceType.OUTGOING
                        ? { outgoingInvoiceId: created.id }
                        : { incomingInvoiceId: created.id },
                });

                return created;
            });
        } catch (e: any) {
            // Понятное сообщение при повторном номере счёта (нарушение уникальности)
            if (e?.code === 'P2002') {
                throw new BadRequestException(`Счёт с номером «${dto.invoiceNumber}» уже существует. Укажите другой номер.`);
            }
            throw e;
        }

        return this.getInvoiceDetails(invoice.id, companyId);
    }

    /** Отправить счёт контрагенту по email (публичная ссылка) */
    async sendInvoiceEmail(id: string, companyId: string, email: string) {
        const target = (email || '').trim();
        if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
            throw new BadRequestException('Укажите корректный email-адрес');
        }

        const invoice = await this.prisma.invoice.findUnique({
            where: { id },
            include: { issuer: { select: { name: true } } },
        });
        if (!invoice) {
            throw new NotFoundException('Счёт не найден');
        }
        if (invoice.issuerId !== companyId && invoice.recipientId !== companyId) {
            throw new BadRequestException('У вас нет доступа к этому счёту');
        }

        const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
        const shareUrl = `${frontendUrl}/shared/invoice/${invoice.shareToken}`;

        await this.emailService.sendInvoiceEmail(
            target,
            shareUrl,
            invoice.issuer?.name || 'LogiCore',
            invoice.invoiceNumber,
            invoice.amount,
        );

        return { message: `Счёт отправлен на ${target}` };
    }

    async getInvoices(
        companyId: string,
        query: { type?: InvoiceType; status?: InvoiceStatus; counterpartyId?: string },
    ) {
        const whereClause: any = {};

        // Фильтрация: пользователь видит счета своей компании
        whereClause.OR = [
            { issuerId: companyId },
            { recipientId: companyId },
        ];

        if (query.type) {
            whereClause.type = query.type;
        }
        if (query.status) {
            whereClause.status = query.status;
        }
        if (query.counterpartyId) {
            whereClause.AND = [
                {
                    OR: [
                        { issuerId: query.counterpartyId },
                        { recipientId: query.counterpartyId },
                    ],
                },
            ];
        }

        return this.prisma.invoice.findMany({
            where: whereClause,
            include: {
                issuer: true,
                recipient: true,
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
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
    }

    async getInvoiceDetails(id: string, companyId: string) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id },
            include: {
                issuer: true,
                recipient: true,
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                incomingOrders: {
                    include: {
                        routePoints: {
                            include: {
                                location: true,
                            },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                },
                outgoingOrders: {
                    include: {
                        routePoints: {
                            include: {
                                location: true,
                            },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                },
            },
        });

        if (!invoice) {
            throw new NotFoundException('Счет не найден');
        }

        if (invoice.issuerId !== companyId && invoice.recipientId !== companyId) {
            throw new BadRequestException('У вас нет доступа к этому счету');
        }

        return invoice;
    }

    async updateInvoiceStatus(id: string, companyId: string, status: InvoiceStatus, userId: string) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id },
            include: {
                incomingOrders: true,
                outgoingOrders: true,
            },
        });

        if (!invoice) {
            throw new NotFoundException('Счет не найден');
        }

        if (invoice.issuerId !== companyId && invoice.recipientId !== companyId) {
            throw new BadRequestException('У вас нет доступа к этому счету');
        }

        const oldStatus = invoice.status;

        // Если переводим в PAID — сначала проводим платежи. Если платёж не пройдёт
        // (например, дата в закрытом периоде), счёт останется в прежнем статусе.
        if (status === InvoiceStatus.PAID && oldStatus !== InvoiceStatus.PAID) {
            const dateStr = invoice.date ? invoice.date.toISOString() : undefined;
            if (invoice.type === InvoiceType.OUTGOING) {
                for (const order of invoice.outgoingOrders) {
                    await this.paymentsService.markCustomerPaid(invoice.issuerId, order.id, true, userId, dateStr);
                }
            } else {
                for (const order of invoice.incomingOrders) {
                    if (order.subForwarderId) {
                        await this.paymentsService.markSubForwarderPaid(invoice.recipientId, order.id, true, userId, dateStr);
                    } else {
                        await this.paymentsService.markDriverPaid(invoice.recipientId, order.id, true, userId, dateStr);
                    }
                }
            }
        }

        const updatedInvoice = await this.prisma.invoice.update({
            where: { id },
            data: { status },
        });

        // Если отменили PAID, удаляем автоматически созданные платежи
        if (oldStatus === InvoiceStatus.PAID && status !== InvoiceStatus.PAID) {
            if (invoice.type === InvoiceType.OUTGOING) {
                for (const order of invoice.outgoingOrders) {
                    await this.paymentsService.markCustomerPaid(invoice.issuerId, order.id, false, userId);
                }
            } else {
                for (const order of invoice.incomingOrders) {
                    if (order.subForwarderId) {
                        await this.paymentsService.markSubForwarderPaid(invoice.recipientId, order.id, false, userId);
                    } else {
                        await this.paymentsService.markDriverPaid(invoice.recipientId, order.id, false, userId);
                    }
                }
            }
        }

        return updatedInvoice;
    }

    async acceptDispute(id: string, companyId: string) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id },
            include: {
                incomingOrders: true,
                outgoingOrders: true,
            },
        });

        if (!invoice) {
            throw new NotFoundException('Счет не найден');
        }

        if (invoice.status !== InvoiceStatus.DISPUTED) {
            throw new BadRequestException('Счет не находится в статусе Споpa');
        }

        if (invoice.issuerId !== companyId && invoice.recipientId !== companyId) {
            throw new BadRequestException('У вас нет доступа к этому счету');
        }

        const orders = invoice.type === InvoiceType.OUTGOING ? invoice.outgoingOrders : invoice.incomingOrders;

        let newAmount = 0;

        for (const order of orders) {
            const dataToUpdate: any = {};

            if (invoice.type === InvoiceType.OUTGOING) {
                if (order.proposedCustomerPrice !== null && order.proposedCustomerPrice !== undefined) {
                    dataToUpdate.customerPrice = order.proposedCustomerPrice;
                    newAmount += order.proposedCustomerPrice;
                } else {
                    newAmount += order.customerPrice || 0;
                }
                dataToUpdate.proposedCustomerPrice = null;
            } else {
                // INCOMING
                if (order.subForwarderId === invoice.issuerId) {
                    if (order.proposedSubForwarderPrice !== null && order.proposedSubForwarderPrice !== undefined) {
                        dataToUpdate.subForwarderPrice = order.proposedSubForwarderPrice;
                        newAmount += order.proposedSubForwarderPrice;
                    } else {
                        newAmount += order.subForwarderPrice || 0;
                    }
                } else {
                    if (order.proposedDriverCost !== null && order.proposedDriverCost !== undefined) {
                        dataToUpdate.driverCost = order.proposedDriverCost;
                        newAmount += order.proposedDriverCost;
                    } else {
                        newAmount += order.driverCost || 0;
                    }
                }
                dataToUpdate.proposedDriverCost = null;
                dataToUpdate.proposedSubForwarderPrice = null;
            }

            await this.prisma.order.update({
                where: { id: order.id },
                data: dataToUpdate,
            });
        }

        const updatedInvoice = await this.prisma.invoice.update({
            where: { id },
            data: {
                status: InvoiceStatus.APPROVED,
                amount: newAmount,
                adjustedAmount: null,
            },
        });

        return updatedInvoice;
    }

    async deleteInvoice(id: string, companyId: string) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { id },
        });

        if (!invoice) {
            throw new NotFoundException('Счет не найден');
        }

        if (invoice.issuerId !== companyId && invoice.recipientId !== companyId) {
            throw new BadRequestException('У вас нет доступа к этому счету');
        }

        if (invoice.status !== InvoiceStatus.DRAFT) {
            throw new BadRequestException('Можно удалять только счета в статусе черновика');
        }

        // Отвязываем заказы
        if (invoice.type === InvoiceType.OUTGOING) {
            await this.prisma.order.updateMany({
                where: { outgoingInvoiceId: invoice.id },
                data: { outgoingInvoiceId: null },
            });
        } else {
            await this.prisma.order.updateMany({
                where: { incomingInvoiceId: invoice.id },
                data: { incomingInvoiceId: null },
            });
        }

        await this.prisma.invoice.delete({
            where: { id },
        });

        return { success: true };
    }

    // ==================== PUBLIC ENDPOINTS ====================

    async getPublicInvoiceByToken(shareToken: string) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { shareToken },
            include: {
                issuer: true,
                recipient: true,
                createdBy: {
                    select: {
                        firstName: true,
                        lastName: true,
                    },
                },
                incomingOrders: {
                    include: {
                        routePoints: {
                            include: {
                                location: true,
                            },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                },
                outgoingOrders: {
                    include: {
                        routePoints: {
                            include: {
                                location: true,
                            },
                            orderBy: { sequence: 'asc' },
                        },
                    },
                },
            },
        });

        if (!invoice) {
            throw new NotFoundException('Счет по данной ссылке не найден');
        }

        return invoice;
    }

    async disputePublicInvoice(
        shareToken: string,
        proposedPrices: {
            orderId: string;
            proposedCustomerPrice?: number;
            proposedDriverCost?: number;
            proposedSubForwarderPrice?: number;
        }[],
    ) {
        const invoice = await this.prisma.invoice.findUnique({
            where: { shareToken },
            include: {
                incomingOrders: true,
                outgoingOrders: true,
            },
        });

        if (!invoice) {
            throw new NotFoundException('Счет по данной ссылке не найден');
        }

        if (
            invoice.status !== InvoiceStatus.DRAFT &&
            invoice.status !== InvoiceStatus.PENDING &&
            invoice.status !== InvoiceStatus.DISPUTED
        ) {
            throw new BadRequestException('Этот счет уже согласован, оплачен или отменен');
        }

        const orders = invoice.type === InvoiceType.OUTGOING ? invoice.outgoingOrders : invoice.incomingOrders;

        let adjustedAmount = 0;

        for (const order of orders) {
            const proposedPriceObj = proposedPrices.find((p) => p.orderId === order.id);
            const dataToUpdate: any = {};

            if (invoice.type === InvoiceType.OUTGOING) {
                if (proposedPriceObj && proposedPriceObj.proposedCustomerPrice !== undefined) {
                    dataToUpdate.proposedCustomerPrice = proposedPriceObj.proposedCustomerPrice;
                    adjustedAmount += proposedPriceObj.proposedCustomerPrice;
                } else {
                    // Если цену по рейсу не оспаривают, берем изначальную
                    dataToUpdate.proposedCustomerPrice = order.proposedCustomerPrice !== null ? order.proposedCustomerPrice : order.customerPrice;
                    adjustedAmount += dataToUpdate.proposedCustomerPrice || 0;
                }
            } else {
                // INCOMING
                if (order.subForwarderId === invoice.issuerId) {
                    if (proposedPriceObj && proposedPriceObj.proposedSubForwarderPrice !== undefined) {
                        dataToUpdate.proposedSubForwarderPrice = proposedPriceObj.proposedSubForwarderPrice;
                        adjustedAmount += proposedPriceObj.proposedSubForwarderPrice;
                    } else {
                        dataToUpdate.proposedSubForwarderPrice = order.proposedSubForwarderPrice !== null ? order.proposedSubForwarderPrice : order.subForwarderPrice;
                        adjustedAmount += dataToUpdate.proposedSubForwarderPrice || 0;
                    }
                } else {
                    if (proposedPriceObj && proposedPriceObj.proposedDriverCost !== undefined) {
                        dataToUpdate.proposedDriverCost = proposedPriceObj.proposedDriverCost;
                        adjustedAmount += proposedPriceObj.proposedDriverCost;
                    } else {
                        dataToUpdate.proposedDriverCost = order.proposedDriverCost !== null ? order.proposedDriverCost : order.driverCost;
                        adjustedAmount += dataToUpdate.proposedDriverCost || 0;
                    }
                }
            }

            await this.prisma.order.update({
                where: { id: order.id },
                data: dataToUpdate,
            });
        }

        // Обновим статус счета на DISPUTED и запишем скорректированную сумму
        const updatedInvoice = await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: {
                status: InvoiceStatus.DISPUTED,
                adjustedAmount,
            },
        });

        return this.getPublicInvoiceByToken(shareToken);
    }

    async getUninvoicedOrders(
        companyId: string,
        type: InvoiceType,
        counterpartyId: string,
        includeInProgress = false,
    ) {
        // По умолчанию — только завершённые заявки. С флагом includeInProgress
        // добавляем заявки «в работе» (для аванса/предоплаты): исключены только
        // черновики, ожидающие назначения и отменённые — по ним счёт выставлять рано/незачем.
        const IN_PROGRESS_STATUSES = [
            'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING',
            'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'COMPLETED', 'PROBLEM',
        ];
        const whereClause: any = {
            status: includeInProgress ? { in: IN_PROGRESS_STATUSES } : 'COMPLETED',
        };

        if (type === InvoiceType.OUTGOING) {
            whereClause.customerCompanyId = counterpartyId;
            whereClause.outgoingInvoiceId = null;
            whereClause.OR = [
                { forwarderId: companyId },
                { partnerId: companyId },
                { subForwarderId: companyId },
                { responsibleManager: { companyId: companyId } },
            ];
        } else {
            whereClause.incomingInvoiceId = null;
            whereClause.AND = [
                {
                    OR: [
                        { partnerId: counterpartyId },
                        { subForwarderId: counterpartyId },
                    ],
                },
                {
                    OR: [
                        { customerCompanyId: companyId },
                        { forwarderId: companyId },
                    ],
                },
            ];
        }

        return this.prisma.order.findMany({
            where: whereClause,
            include: {
                routePoints: {
                    include: {
                        location: true,
                    },
                    orderBy: { sequence: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}
