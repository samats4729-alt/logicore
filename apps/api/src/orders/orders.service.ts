import { Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, OrderStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto, getPaginationParams } from '../common/dto/pagination.dto';
import { RedisService } from '../redis/redis.service';
import { PaymentsService } from '../accounting/services/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PayrollService } from '../payroll/payroll.service';

const STATUS_CHAIN = [
    OrderStatus.ASSIGNED,
    OrderStatus.EN_ROUTE_PICKUP,
    OrderStatus.AT_PICKUP,
    OrderStatus.LOADING,
    OrderStatus.IN_TRANSIT,
    OrderStatus.AT_DELIVERY,
    OrderStatus.UNLOADING,
    OrderStatus.COMPLETED
];

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    DRAFT: [OrderStatus.PENDING, OrderStatus.CANCELLED],
    PENDING: [OrderStatus.ASSIGNED, OrderStatus.DRAFT, OrderStatus.CANCELLED],
    ASSIGNED: [
        OrderStatus.PENDING,
        OrderStatus.CANCELLED,
        OrderStatus.PROBLEM,
        ...STATUS_CHAIN.slice(STATUS_CHAIN.indexOf(OrderStatus.ASSIGNED) + 1)
    ],
    EN_ROUTE_PICKUP: [
        OrderStatus.CANCELLED,
        OrderStatus.PROBLEM,
        ...STATUS_CHAIN.slice(STATUS_CHAIN.indexOf(OrderStatus.EN_ROUTE_PICKUP) + 1)
    ],
    AT_PICKUP: [
        OrderStatus.CANCELLED,
        OrderStatus.PROBLEM,
        ...STATUS_CHAIN.slice(STATUS_CHAIN.indexOf(OrderStatus.AT_PICKUP) + 1)
    ],
    LOADING: [
        OrderStatus.CANCELLED,
        OrderStatus.PROBLEM,
        ...STATUS_CHAIN.slice(STATUS_CHAIN.indexOf(OrderStatus.LOADING) + 1)
    ],
    IN_TRANSIT: [
        OrderStatus.CANCELLED,
        OrderStatus.PROBLEM,
        ...STATUS_CHAIN.slice(STATUS_CHAIN.indexOf(OrderStatus.IN_TRANSIT) + 1)
    ],
    AT_DELIVERY: [
        OrderStatus.CANCELLED,
        OrderStatus.PROBLEM,
        ...STATUS_CHAIN.slice(STATUS_CHAIN.indexOf(OrderStatus.AT_DELIVERY) + 1)
    ],
    UNLOADING: [
        OrderStatus.CANCELLED,
        OrderStatus.PROBLEM,
        ...STATUS_CHAIN.slice(STATUS_CHAIN.indexOf(OrderStatus.UNLOADING) + 1)
    ],
    // Завершённую заявку можно переоткрыть на любой активный этап (или отменить/проблема).
    // Разрешено только когда контрагентов нет на платформе — это проверяется отдельно в updateStatus.
    COMPLETED: [
        ...STATUS_CHAIN.slice(0, STATUS_CHAIN.indexOf(OrderStatus.COMPLETED)),
        OrderStatus.PENDING,
        OrderStatus.PROBLEM,
        OrderStatus.CANCELLED,
    ],
    // Отменённую заявку можно вернуть в работу (например, отменили по ошибке):
    // на любой активный этап или в «Ожидание». Сразу «Завершён» — нельзя.
    CANCELLED: [
        ...STATUS_CHAIN.slice(0, STATUS_CHAIN.indexOf(OrderStatus.COMPLETED)),
        OrderStatus.PENDING,
        OrderStatus.PROBLEM,
    ],
    PROBLEM: [
        OrderStatus.ASSIGNED,
        OrderStatus.EN_ROUTE_PICKUP,
        OrderStatus.AT_PICKUP,
        OrderStatus.LOADING,
        OrderStatus.IN_TRANSIT,
        OrderStatus.AT_DELIVERY,
        OrderStatus.UNLOADING,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED
    ],
};

@Injectable()
export class OrdersService implements OnModuleInit {
    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private paymentsService: PaymentsService,
        private notificationsService: NotificationsService,
        private payrollService: PayrollService,
    ) { }

    async onModuleInit() {
        try {
            const orders = await this.prisma.order.findMany({
                where: {
                    isConfirmed: false,
                    status: 'PENDING',
                },
                include: {
                    customer: { select: { companyId: true } },
                    customerCompany: { select: { isExternal: true } },
                }
            });

            for (const order of orders) {
                const isCustomerExternal = order.customerCompany?.isExternal ?? false;
                const creatorCompanyId = order.customer?.companyId;
                const isCreatorForwarder = creatorCompanyId && order.forwarderId && creatorCompanyId === order.forwarderId;

                if (isCustomerExternal || isCreatorForwarder) {
                    await this.prisma.order.update({
                        where: { id: order.id },
                        data: { isConfirmed: true }
                    });
                    console.log(`Auto-confirmed order #${order.orderNumber} (isCustomerExternal=${isCustomerExternal}, isCreatorForwarder=${isCreatorForwarder})`);
                }
            }
        } catch (error) {
            console.error('Error auto-confirming existing pending orders on init:', error);
        }
    }

    /**
     * Создание заявки на перевозку
     */
    async create(data: {
        customerId: string;
        customerCompanyId?: string; // Компания заказчика
        routePoints: { locationId: string; pointType: 'PICKUP' | 'ADDITIONAL_PICKUP' | 'DELIVERY'; notes?: string; expectedDate?: string | Date }[];
        cargoDescription?: string;
        cargoWeight?: number;
        cargoVolume?: number;
        cargoLength?: number;
        cargoWidth?: number;
        cargoHeight?: number;
        palletCount?: number;
        cargoType?: string;
        requirements?: string;
        customerPrice?: number;
        driverCost?: number;
        driverId?: string;
        forwarderId?: string; // Экспедитор
        subForwarderId?: string; // Суб-экспедитор
        subForwarderPrice?: number; // Цена для суб-экспедитора
        // New fields
        customerPaymentCondition?: string;
        customerPaymentForm?: string;
        customerPaymentDate?: Date;
        driverPaymentCondition?: string;
        driverPaymentForm?: string;
        driverPaymentDate?: Date;
        ttnNumber?: string;
        atiCodeCustomer?: string;
        atiCodeCarrier?: string;
        trailerNumber?: string;
        actualWeight?: number;
        actualVolume?: number;
        appliedTariffId?: string;
        responsibleManagerId?: string;
        natureOfCargo?: string;
        customerPriceType?: 'FIXED' | 'PER_KM' | 'PER_TON';
        ownerCompanyId?: string;
    }) {
        // Генерация номера заявки (по настройке нумерации компании-создателя)
        const orderNumber = await this.generateOrderNumber(data.ownerCompanyId);

        // Проверяем: если экспедитор — внешняя компания, пропускаем PENDING
        let isForwarderExternal = false;
        if (data.forwarderId) {
            const forwarderCompany = await this.prisma.company.findUnique({
                where: { id: data.forwarderId },
                select: { isExternal: true },
            });
            isForwarderExternal = forwarderCompany?.isExternal ?? false;
        }

        // Получаем companyId заказчика
        const customer = await this.prisma.user.findUnique({
            where: { id: data.customerId },
            select: { companyId: true },
        });

        // Проверяем: если заказчик — внешняя компания
        let isCustomerExternal = false;
        const targetCustomerCompanyId = data.customerCompanyId || customer?.companyId;
        if (targetCustomerCompanyId) {
            const customerCompany = await this.prisma.company.findUnique({
                where: { id: targetCustomerCompanyId },
                select: { isExternal: true },
            });
            isCustomerExternal = customerCompany?.isExternal ?? false;
        }

        // Если водитель назначен → ASSIGNED
        // Иначе → PENDING
        const status = data.driverId ? OrderStatus.ASSIGNED : OrderStatus.PENDING;

        const creatorCompanyId = data.customerCompanyId || customer?.companyId;
        const isCreatorForwarder = !!(data.forwarderId && creatorCompanyId && data.forwarderId === creatorCompanyId);

        const isConfirmed = !!(
            data.driverId ||
            isForwarderExternal ||
            isCustomerExternal ||
            isCreatorForwarder
        );

        let driverName = null;
        let driverPhone = null;
        let driverPlate = null;
        let driverTrailer = null;

        if (data.driverId) {
            const driverUser = await this.prisma.user.findUnique({
                where: { id: data.driverId },
            });
            if (driverUser) {
                driverName = `${driverUser.lastName || ''} ${driverUser.firstName || ''} ${driverUser.middleName || ''}`.trim();
                driverPhone = driverUser.phone;
                driverPlate = driverUser.vehiclePlate;
                driverTrailer = driverUser.trailerNumber;
            }
        }

        const order = await this.prisma.order.create({
            data: {
                orderNumber,
                customerId: data.customerId,
                customerCompanyId: data.customerCompanyId || customer?.companyId, // Устанавливаем компанию заказчика
                cargoDescription: data.cargoDescription || '',
                cargoWeight: data.cargoWeight,
                cargoVolume: data.cargoVolume,
                cargoLength: data.cargoLength,
                cargoWidth: data.cargoWidth,
                cargoHeight: data.cargoHeight,
                palletCount: data.palletCount,
                cargoType: data.cargoType,
                requirements: data.requirements,
                customerPrice: data.customerPrice,
                driverCost: data.driverCost,
                driverId: data.driverId,
                assignedDriverName: driverName,
                assignedDriverPhone: driverPhone,
                assignedDriverPlate: driverPlate,
                assignedDriverTrailer: driverTrailer,
                assignedAt: data.driverId ? new Date() : null,
                forwarderId: data.forwarderId, // Связь с экспедитором
                subForwarderId: data.subForwarderId, // Связь с суб-экспедитором
                subForwarderPrice: data.subForwarderPrice,
                status,
                isConfirmed,
                // New fields
                customerPaymentCondition: data.customerPaymentCondition,
                customerPaymentForm: data.customerPaymentForm,
                customerPaymentDate: data.customerPaymentDate,
                driverPaymentCondition: data.driverPaymentCondition,
                driverPaymentForm: data.driverPaymentForm,
                driverPaymentDate: data.driverPaymentDate,
                ttnNumber: data.ttnNumber,
                atiCodeCustomer: data.atiCodeCustomer,
                atiCodeCarrier: data.atiCodeCarrier,
                trailerNumber: data.trailerNumber,
                actualWeight: data.actualWeight,
                actualVolume: data.actualVolume,
                appliedTariffId: data.appliedTariffId,
                responsibleManagerId: data.responsibleManagerId,
                natureOfCargo: data.natureOfCargo,
                customerPriceType: data.customerPriceType,
                routePoints: {
                    create: data.routePoints?.map((rp, index) => ({
                        locationId: rp.locationId,
                        pointType: rp.pointType,
                        sequence: index + 1,
                        expectedDate: rp.expectedDate ? new Date(rp.expectedDate) : null,
                        notes: rp.notes,
                    })) || [],
                },
                statusHistory: {
                    create: {
                        status,
                        comment: data.driverId
                            ? 'Заявка создана с назначенным водителем'
                            : isForwarderExternal
                                ? 'Заявка создана (внешняя компания, подтверждение не требуется)'
                                : 'Заявка создана',
                    },
                },
            },
            include: {
                customer: true,
                customerCompany: true, // Включаем компанию заказчика
                driver: true,
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
                forwarder: true, // Включаем экспедитора в ответ
                subForwarder: true, // Включаем суб-экспедитора
                partner: true, // Включаем партнера
                appliedTariff: { include: { originCity: true, destinationCity: true } }, // Включаем тариф с городами
                responsibleManager: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        return order;
    }

    /**
     * Получение списка заявок с фильтрами
     */
    async findAll(filters?: {
        status?: OrderStatus;
        customerId?: string;
        driverId?: string;
        fromDate?: Date;
        toDate?: Date;
        companyId?: string;
    }, query: PaginationQueryDto = {}) {
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = {
            status: filters?.status,
            customerId: filters?.customerId,
            driverId: filters?.driverId,
            createdAt: {
                gte: filters?.fromDate,
                lte: filters?.toDate,
            },
        };

        // Изоляция по компании: заказ принадлежит компании через customerCompanyId, forwarderId или subForwarderId
        if (filters?.companyId) {
            where.OR = [
                { customerCompanyId: filters.companyId },
                { forwarderId: filters.companyId },
                { subForwarderId: filters.companyId },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.order.findMany({
                where,
                skip,
                take,
                include: {
                    customer: true,
                    driver: true,
                    routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.order.count({ where })
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Получение заявки по ID с проверкой доступа
     */
    async findById(id: string, userContext?: { userId: string; role: string; companyId?: string }) {
        const order = await this.prisma.order.findUnique({
            where: { id },
            include: {
                customer: true,
                customerCompany: true,
                driver: true,
                recipient: true,
                partner: true,
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
                documents: true,
                statusHistory: { orderBy: { changedAt: 'desc' } },
                problems: true,
                responsibleManager: { select: { companyId: true } },
                responsibles: {
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true } },
                        company: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!order) {
            throw new NotFoundException('Заявка не найдена');
        }

        // Проверка принадлежности (если передан user context)
        if (userContext && userContext.role !== 'ADMIN') {
            const { userId, companyId } = userContext;
            const isOwner = order.customerId === userId;
            const isDriver = order.driverId === userId;
            const isManager = order.responsibleManagerId === userId;
            const isCompanyOrder = companyId && (
                order.customerCompanyId === companyId ||
                order.forwarderId === companyId ||
                order.subForwarderId === companyId
            );

            if (!isOwner && !isDriver && !isManager && !isCompanyOrder) {
                throw new ForbiddenException('У вас нет доступа к этой заявке');
            }
        }

        return order;
    }

    async assignDriver(
        orderId: string,
        driverId?: string,
        partnerId?: string,
        manualDriverData?: {
            assignedDriverName?: string;
            assignedDriverPhone?: string;
            assignedDriverPlate?: string;
            assignedDriverTrailer?: string;
        }
    ) {
        const order = await this.findById(orderId);

        if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.ASSIGNED) {
            throw new BadRequestException('Нельзя назначить водителя на эту заявку');
        }

        let driverName = null;
        let driverPhone = null;
        let driverPlate = null;
        let driverTrailer = null;

        const hasManual = manualDriverData && (
            manualDriverData.assignedDriverName ||
            manualDriverData.assignedDriverPhone ||
            manualDriverData.assignedDriverPlate ||
            manualDriverData.assignedDriverTrailer
        );

        if (driverId) {
            if (hasManual) {
                throw new BadRequestException('Нельзя одновременно передавать ID водителя и заполнять данные вручную');
            }

            const driverUser = await this.prisma.user.findUnique({
                where: { id: driverId },
            });

            if (!driverUser) {
                throw new NotFoundException('Водитель не найден');
            }

            if (driverUser.role !== UserRole.DRIVER) {
                throw new BadRequestException('Пользователь не является водителем');
            }

            if (driverUser.companyId) {
                const targetCompanyId = partnerId || order.forwarderId;
                if (targetCompanyId && driverUser.companyId !== targetCompanyId) {
                    throw new BadRequestException('Назначаемый водитель должен принадлежать компании-исполнителю (экспедитору/партнеру)');
                }
            }

            driverName = `${driverUser.lastName || ''} ${driverUser.firstName || ''} ${driverUser.middleName || ''}`.trim();
            driverPhone = driverUser.phone;
            driverPlate = driverUser.vehiclePlate;
            driverTrailer = driverUser.trailerNumber;
        } else if (hasManual) {
            driverName = manualDriverData.assignedDriverName || null;
            driverPhone = manualDriverData.assignedDriverPhone || null;
            driverPlate = manualDriverData.assignedDriverPlate || null;
            driverTrailer = manualDriverData.assignedDriverTrailer || null;
        } else {
            throw new BadRequestException('Необходимо указать водителя (ID или заполнить вручную)');
        }

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                driverId: driverId || null,
                partnerId: partnerId || null,
                forwarderId: order.forwarderId || partnerId || null,
                assignedDriverName: driverName,
                assignedDriverPhone: driverPhone,
                assignedDriverPlate: driverPlate,
                assignedDriverTrailer: driverTrailer,
                assignedAt: new Date(),
                status: OrderStatus.ASSIGNED,
                isConfirmed: true,
                statusHistory: {
                    create: {
                        status: OrderStatus.ASSIGNED,
                        comment: hasManual
                            ? `Назначен водитель вручную: ${driverName}`
                            : `Назначен водитель: ${driverName}`,
                    },
                },
            },
            include: { driver: true },
        });
    }

    /**
     * Получить зарегистрированных участников заказа (isExternal = false)
     */
    private async getRegisteredParticipants(order: any): Promise<string[]> {
        const participantIds = [
            order.customerCompanyId,
            order.forwarderId,
            order.partnerId,
            order.subForwarderId
        ].filter((id): id is string => !!id);

        const uniqueParticipantIds = Array.from(new Set(participantIds));

        const companies = await this.prisma.company.findMany({
            where: {
                id: { in: uniqueParticipantIds },
                isExternal: false
            },
            select: { id: true }
        });

        return companies.map(c => c.id);
    }

    /**
     * Обновление статуса заявки
     */
    async updateStatus(orderId: string, status: OrderStatus, comment?: string, changedById?: string, companyId?: string, role?: string) {
        const order = await this.findById(orderId);

        // Проверка прав на смену статуса
        if (role && role !== 'ADMIN') {
            if (role === 'DRIVER') {
                if (order.driverId !== changedById) {
                    throw new ForbiddenException('Водитель может менять статус только своих заявок');
                }
            } else {
                // Остальные роли — проверка участия компании в заявке
                const isParticipant = order.customerCompanyId === companyId
                    || order.forwarderId === companyId
                    || order.partnerId === companyId
                    || order.responsibleManager?.companyId === companyId;
                if (!isParticipant) {
                    throw new ForbiddenException('Нет доступа к заявке');
                }
            }
        }

        if (order.status !== status) {
            const allowed = ALLOWED_TRANSITIONS[order.status] || [];
            if (!allowed.includes(status)) {
                throw new BadRequestException(`Недопустимый переход статуса из ${order.status} в ${status}`);
            }
        }

        // Возврат статуса с «Завершён»: свободно, если контрагентов нет на платформе;
        // если в заявке есть другая зарегистрированная компания — только по согласованию с ней.
        if (order.status === OrderStatus.COMPLETED && status !== OrderStatus.COMPLETED) {
            let initiatorCompanyId = companyId;
            if (!initiatorCompanyId && changedById) {
                const userObj = await this.prisma.user.findUnique({
                    where: { id: changedById },
                    select: { companyId: true },
                });
                initiatorCompanyId = userObj?.companyId || undefined;
            }
            const registered = await this.getRegisteredParticipants(order);
            const otherSide = registered.filter(id => id !== initiatorCompanyId);
            if (otherSide.length > 0) {
                throw new BadRequestException('Заявка завершена с участием зарегистрированной на платформе компании. Изменить её можно только по согласованию с этой компанией.');
            }
        }

        // Если целевой статус COMPLETED, проверяем необходимость подтверждения второй зарегистрированной стороной
        if (status === OrderStatus.COMPLETED) {
            let initiatorCompanyId = companyId;
            if (!initiatorCompanyId && changedById) {
                const userObj = await this.prisma.user.findUnique({
                    where: { id: changedById },
                    select: { companyId: true }
                });
                initiatorCompanyId = userObj?.companyId || undefined;
            }

            if (initiatorCompanyId) {
                const registeredParticipants = await this.getRegisteredParticipants(order);
                const otherSide = registeredParticipants.filter(id => id !== initiatorCompanyId);

                if (otherSide.length > 0) {
                    // Есть другие зарегистрированные участники -> требуется подтверждение
                    const updated = await this.prisma.order.update({
                        where: { id: orderId },
                        data: {
                            pendingStatus: OrderStatus.COMPLETED,
                            pendingStatusById: initiatorCompanyId,
                            pendingStatusAt: new Date(),
                            statusHistory: {
                                create: {
                                    status: order.status, // Оставляем текущий статус
                                    comment: `Запрошено подтверждение завершения рейса`,
                                    changedById,
                                }
                            }
                        }
                    });

                    // Уведомляем сотрудников другой стороны
                    try {
                        for (const targetCompanyId of otherSide) {
                            await this.notificationsService.notifyCompany(targetCompanyId, {
                                title: 'Запрос завершения рейса',
                                body: `Инициатор запросил подтверждение завершения рейса по заявке №${order.orderNumber}`,
                                data: { type: 'COMPLETION_REQUESTED', orderId }
                            });
                        }
                    } catch (err) {
                        console.warn('Completion request notification failed:', err);
                    }

                    return updated;
                }
            }
        }

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                status,
                // Завершаем → ставим дату; переоткрываем с «Завершён» → очищаем дату
                completedAt: status === OrderStatus.COMPLETED
                    ? new Date()
                    : (order.status === OrderStatus.COMPLETED ? null : undefined),
                pendingStatus: null,
                pendingStatusById: null,
                pendingStatusAt: null,
                statusHistory: {
                    create: {
                        status,
                        comment,
                        changedById,
                    },
                },
            },
        });

        if (status === OrderStatus.COMPLETED) {
            await this.paymentsService.syncOrderPaymentFlags(orderId);
        }

        try {
            await this.payrollService.processOrderTrigger(orderId, 'STATUS:' + status);
        } catch (err) {
            console.warn(`Payroll trigger failed for status update: ${err}`);
        }

        return updated;
    }

    async confirmCompletion(orderId: string, companyId: string, userId: string) {
        const order = await this.findById(orderId);
        if (!order) {
            throw new NotFoundException('Заявка не найдена');
        }

        if (order.pendingStatus !== OrderStatus.COMPLETED) {
            throw new BadRequestException('Заявка не ожидает подтверждения завершения');
        }

        const registeredParticipants = await this.getRegisteredParticipants(order);
        if (!registeredParticipants.includes(companyId) || order.pendingStatusById === companyId) {
            throw new ForbiddenException('У вас нет прав на подтверждение завершения этой заявки');
        }

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: OrderStatus.COMPLETED,
                completedAt: new Date(),
                pendingStatus: null,
                pendingStatusById: null,
                pendingStatusAt: null,
                statusHistory: {
                    create: {
                        status: OrderStatus.COMPLETED,
                        comment: 'Завершение рейса подтверждено',
                        changedById: userId,
                    }
                }
            }
        });

        await this.paymentsService.syncOrderPaymentFlags(orderId);

        try {
            await this.payrollService.processOrderTrigger(orderId, 'STATUS:COMPLETED');
        } catch (err) {
            console.warn(`Payroll trigger failed for completion confirmation: ${err}`);
        }

        // Уведомляем инициатора
        if (order.pendingStatusById) {
            try {
                await this.notificationsService.notifyCompany(order.pendingStatusById, {
                    title: 'Завершение рейса подтверждено',
                    body: `Завершение рейса по заявке №${order.orderNumber} подтверждено второй стороной`,
                    data: { type: 'COMPLETION_CONFIRMED', orderId }
                });
            } catch (err) {
                console.warn('Completion confirmation notification failed:', err);
            }
        }

        return updated;
    }

    async rejectCompletion(orderId: string, companyId: string, userId: string, reason?: string) {
        const order = await this.findById(orderId);
        if (!order) {
            throw new NotFoundException('Заявка не найдена');
        }

        if (order.pendingStatus !== OrderStatus.COMPLETED) {
            throw new BadRequestException('Заявка не ожидает подтверждения завершения');
        }

        const registeredParticipants = await this.getRegisteredParticipants(order);
        if (!registeredParticipants.includes(companyId) || order.pendingStatusById === companyId) {
            throw new ForbiddenException('У вас нет прав на отклонение завершения этой заявки');
        }

        const comment = `Завершение отклонено: ${reason || 'без указания причины'}`;
        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                pendingStatus: null,
                pendingStatusById: null,
                pendingStatusAt: null,
                statusHistory: {
                    create: {
                        status: order.status,
                        comment,
                        changedById: userId,
                    }
                }
            }
        });

        // Уведомляем инициатора
        if (order.pendingStatusById) {
            try {
                await this.notificationsService.notifyCompany(order.pendingStatusById, {
                    title: 'Запрос завершения отклонен',
                    body: `Запрос на завершение рейса по заявке №${order.orderNumber} отклонен второй стороной. Причина: ${reason || 'не указана'}`,
                    data: { type: 'COMPLETION_REJECTED', orderId }
                });
            } catch (err) {
                console.warn('Completion rejection notification failed:', err);
            }
        }

        return updated;
    }

    async cancelCompletionRequest(orderId: string, companyId: string, userId: string) {
        const order = await this.findById(orderId);
        if (!order) {
            throw new NotFoundException('Заявка не найдена');
        }

        if (order.pendingStatus !== OrderStatus.COMPLETED) {
            throw new BadRequestException('Заявка не ожидает подтверждения завершения');
        }

        if (order.pendingStatusById !== companyId) {
            throw new ForbiddenException('Вы не являетесь инициатором запроса завершения');
        }

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                pendingStatus: null,
                pendingStatusById: null,
                pendingStatusAt: null,
                statusHistory: {
                    create: {
                        status: order.status,
                        comment: 'Запрос завершения рейса отменен инициатором',
                        changedById: userId,
                    }
                }
            }
        });

        // Уведомляем другую сторону
        const registeredParticipants = await this.getRegisteredParticipants(order);
        const otherSide = registeredParticipants.filter(id => id !== companyId);

        try {
            for (const targetCompanyId of otherSide) {
                await this.notificationsService.notifyCompany(targetCompanyId, {
                    title: 'Запрос завершения отменен',
                    body: `Инициатор отменил запрос завершения рейса по заявке №${order.orderNumber}`,
                    data: { type: 'COMPLETION_CANCELLED', orderId }
                });
            }
        } catch (err) {
            console.warn('Completion cancel notification failed:', err);
        }

        return updated;
    }

    /**
     * Обновление данных заявки (на любом этапе)
     */
    async update(orderId: string, data: {
        customerCompanyId?: string;
        cargoDescription?: string;
        cargoWeight?: number;
        cargoVolume?: number;
        cargoLength?: number;
        cargoWidth?: number;
        cargoHeight?: number;
        palletCount?: number;
        cargoType?: string;
        requirements?: string;
        customerPrice?: number;
        driverCost?: number;
        routePoints?: { locationId: string; pointType: 'PICKUP' | 'ADDITIONAL_PICKUP' | 'DELIVERY'; notes?: string; expectedDate?: string | Date }[];
        driverId?: string;
        forwarderId?: string;
        subForwarderId?: string;
        subForwarderPrice?: number;
        customerPaymentCondition?: string;
        customerPaymentForm?: string;
        customerPaymentDate?: Date;
        driverPaymentCondition?: string;
        driverPaymentForm?: string;
        driverPaymentDate?: Date;
        ttnNumber?: string;
        atiCodeCustomer?: string;
        atiCodeCarrier?: string;
        trailerNumber?: string;
        actualWeight?: number;
        actualVolume?: number;
        appliedTariffId?: string;
        natureOfCargo?: string;
        customerPriceType?: string;
    }, user?: { id: string; role: string; companyId?: string }) {
        const order = await this.findById(orderId);

        if (user) {
            const isAdmin = user.role === 'ADMIN';
            const isCreator = order.customerId === user.id || order.responsibleManagerId === user.id;
            const isRegisteredCustomerCompany = order.customerCompanyId &&
                (order as any).customerCompany &&
                !(order as any).customerCompany.isExternal &&
                user.companyId === order.customerCompanyId;

            if (!isAdmin && !isCreator && !isRegisteredCustomerCompany) {
                throw new ForbiddenException('У вас нет прав на редактирование этой заявки');
            }
        }

        // Собираем данные для обновления
        const { routePoints, ...updateFields } = data;
        const updateData: any = { ...updateFields };

        // Если назначается водитель - меняем статус на ASSIGNED
        if (data.driverId && (order.status === 'PENDING' || order.status === 'DRAFT')) {
            updateData.status = OrderStatus.ASSIGNED;
        }

        // Обновляем точки маршрута, если переданы
        if (routePoints) {
            await this.prisma.orderRoutePoint.deleteMany({ where: { orderId } });
            updateData.routePoints = {
                create: routePoints.map((rp, index) => ({
                    locationId: rp.locationId,
                    pointType: rp.pointType,
                    sequence: index + 1,
                    expectedDate: rp.expectedDate ? new Date(rp.expectedDate) : null,
                    notes: rp.notes,
                })),
            };
        }

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: updateData,
            include: {
                customer: true,
                driver: true,
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
                forwarder: true,
                subForwarder: true,
                partner: true,
                appliedTariff: { include: { originCity: true, destinationCity: true } },
                responsibleManager: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        if (
            data.customerPrice !== undefined ||
            data.driverCost !== undefined ||
            data.subForwarderPrice !== undefined ||
            data.subForwarderId !== undefined
        ) {
            await this.paymentsService.syncOrderPaymentFlags(orderId);
        }

        return updated;
    }

    /**
     * Добавление точки выгрузки в пути
     */
    async addDeliveryPoint(orderId: string, locationId: string, notes?: string, user?: { sub: string; role: string; companyId?: string }) {
        // Проверка участия компании в заявке
        if (user && user.role !== 'ADMIN') {
            const order = await this.prisma.order.findUnique({
                where: { id: orderId },
                select: { customerCompanyId: true, forwarderId: true, partnerId: true, responsibleManagerId: true },
            });
            if (order) {
                const mgrCompany = order.responsibleManagerId ? (await this.prisma.user.findUnique({ where: { id: order.responsibleManagerId }, select: { companyId: true } }))?.companyId : undefined;
                const isParticipant = order.customerCompanyId === user.companyId || order.forwarderId === user.companyId || order.partnerId === user.companyId || mgrCompany === user.companyId;
                if (!isParticipant) {
                    throw new ForbiddenException('Нет доступа к заявке');
                }
            }
        }
        const lastPoint = await this.prisma.orderRoutePoint.findFirst({
            where: { orderId },
            orderBy: { sequence: 'desc' },
        });

        return this.prisma.orderRoutePoint.create({
            data: {
                orderId,
                locationId,
                pointType: 'DELIVERY',
                sequence: (lastPoint?.sequence || 0) + 1,
                notes,
            },
            include: { location: true },
        });
    }

    /**
     * Отметка о проблеме
     */
    async reportProblem(orderId: string, description: string, reportedById: string) {
        await this.updateStatus(orderId, OrderStatus.PROBLEM, description, reportedById);

        return this.prisma.orderProblem.create({
            data: {
                orderId,
                description,
                reportedById,
            },
        });
    }

    // ==================== НУМЕРАЦИЯ ЗАЯВОК ====================

    async getNumberingSettings(companyId: string) {
        const cfg = await this.prisma.orderNumbering.upsert({
            where: { companyId },
            create: { companyId },
            update: {},
        });
        return {
            prefix: cfg.prefix,
            padding: cfg.padding,
            nextNumber: cfg.nextNumber,
            preview: `${cfg.prefix}${String(cfg.nextNumber).padStart(cfg.padding, '0')}`,
        };
    }

    async updateNumberingSettings(companyId: string, data: { prefix?: string; padding?: number; nextNumber?: number }) {
        const padding = data.padding !== undefined ? Math.min(Math.max(Math.trunc(data.padding), 1), 12) : undefined;
        const nextNumber = data.nextNumber !== undefined ? Math.max(Math.trunc(data.nextNumber), 1) : undefined;
        const prefix = data.prefix !== undefined ? data.prefix.trim().slice(0, 20) : undefined;
        await this.prisma.orderNumbering.upsert({
            where: { companyId },
            create: { companyId, ...(prefix !== undefined && { prefix }), ...(padding !== undefined && { padding }), ...(nextNumber !== undefined && { nextNumber }) },
            update: { ...(prefix !== undefined && { prefix }), ...(padding !== undefined && { padding }), ...(nextNumber !== undefined && { nextNumber }) },
        });
        return this.getNumberingSettings(companyId);
    }

    /**
     * Генерация номера заявки.
     * Если у компании настроена нумерация — формат как в 1С: {prefix}{0…0N}.
     * Иначе — устаревший формат LC-YYYYMMDD-XXXX.
     */
    private async generateOrderNumber(companyId?: string): Promise<string> {
        if (companyId) {
            // Гарантируем наличие конфигурации
            await this.prisma.orderNumbering.upsert({ where: { companyId }, create: { companyId }, update: {} });
            for (let attempts = 0; attempts < 500; attempts++) {
                // Атомарный инкремент счётчика (UPDATE … SET nextNumber = nextNumber + 1)
                const updated = await this.prisma.orderNumbering.update({
                    where: { companyId },
                    data: { nextNumber: { increment: 1 } },
                });
                const seq = updated.nextNumber - 1; // значение до инкремента
                const candidate = `${updated.prefix}${String(seq).padStart(updated.padding, '0')}`;
                const exists = await this.prisma.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
                if (!exists) return candidate;
            }
            throw new Error('Не удалось сгенерировать номер заявки');
        }
        return this.generateLegacyOrderNumber();
    }

    /**
     * Устаревшая генерация номера заявки (формат: LC-YYYYMMDD-XXXX)
     */
    private async generateLegacyOrderNumber(): Promise<string> {
        const today = new Date();
        const datePrefix = today.toISOString().slice(0, 10).replace(/-/g, '');
        const redisKey = `order_counter:${datePrefix}`;
        
        let orderSeq: number | null = null;
        
        try {
            const redisClient = this.redis.getClient();
            if (redisClient) {
                const exists = await redisClient.exists(redisKey);
                if (!exists) {
                    const count = await this.prisma.order.count({
                        where: {
                            createdAt: {
                                gte: new Date(today.setHours(0, 0, 0, 0)),
                            },
                        },
                    });
                    await redisClient.set(redisKey, String(count), 'EX', 172800, 'NX');
                }
                
                const val = await redisClient.incr(redisKey);
                orderSeq = val;
            }
        } catch (err) {
            console.warn('Failed to generate order number via Redis, falling back to DB count:', err);
        }

        if (orderSeq === null) {
            const count = await this.prisma.order.count({
                where: {
                    createdAt: {
                        gte: new Date(today.setHours(0, 0, 0, 0)),
                    },
                },
            });
            orderSeq = count + 1;

            // Без Redis счётчик по count подвержен гонкам — подбираем свободный номер
            let attempts = 0;
            while (attempts < 200) {
                const candidate = `LC-${datePrefix}-${String(orderSeq).padStart(4, '0')}`;
                const exists = await this.prisma.order.findUnique({
                    where: { orderNumber: candidate },
                    select: { id: true },
                });
                if (!exists) break;
                orderSeq++;
                attempts++;
            }
        }

        return `LC-${datePrefix}-${String(orderSeq).padStart(4, '0')}`;
    }

    /**
     * Заявки для водителя (текущие)
     */
    async findDriverOrders(driverId: string, includeHistory = false) {
        const activeStatuses = [
            OrderStatus.ASSIGNED,
            OrderStatus.EN_ROUTE_PICKUP,
            OrderStatus.AT_PICKUP,
            OrderStatus.LOADING,
            OrderStatus.IN_TRANSIT,
            OrderStatus.AT_DELIVERY,
            OrderStatus.UNLOADING,
        ];
        const statuses = includeHistory
            ? [...activeStatuses, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.PROBLEM]
            : activeStatuses;

        const orders = await this.prisma.order.findMany({
            where: {
                driverId,
                status: { in: statuses },
            },
            include: {
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
            take: includeHistory ? 50 : undefined,
        });
        return orders;
    }

    /**
     * Принять заявку в работу
     */
    // ==================== Ответственные от компаний ====================

    /**
     * Назначить ответственного менеджера от компании по заявке.
     * onlyIfEmpty — не перезаписывать, если у компании уже есть ответственный
     * (используется при автоназначении «кто принял — тот и ведёт»).
     */
    async setCompanyResponsible(orderId: string, companyId: string, userId: string, onlyIfEmpty = true) {
        if (!orderId || !companyId || !userId) return null;
        try {
            const existing = await this.prisma.orderResponsible.findUnique({
                where: { orderId_companyId: { orderId, companyId } },
            });
            if (existing) {
                if (onlyIfEmpty) return existing;
                return this.prisma.orderResponsible.update({
                    where: { id: existing.id },
                    data: { userId },
                });
            }
            return await this.prisma.orderResponsible.create({
                data: { orderId, companyId, userId },
            });
        } catch (error) {
            // Автоназначение не должно ломать основную операцию
            console.warn('setCompanyResponsible failed:', error);
            return null;
        }
    }

    /**
     * Передать заявку другому менеджеру своей компании (только админ компании).
     */
    async reassignResponsible(orderId: string, companyId: string, targetUserId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            select: { id: true, orderNumber: true, customerCompanyId: true, forwarderId: true, partnerId: true, subForwarderId: true },
        });
        if (!order) throw new NotFoundException('Заявка не найдена');

        const participates = [order.customerCompanyId, order.forwarderId, order.partnerId, order.subForwarderId].includes(companyId);
        if (!participates) {
            throw new ForbiddenException('Ваша компания не участвует в этой заявке');
        }

        const target = await this.prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, companyId: true, role: true, isActive: true, firstName: true, lastName: true },
        });
        if (!target || target.companyId !== companyId || !target.isActive) {
            throw new BadRequestException('Менеджер не найден в вашей компании');
        }
        if (target.role === 'DRIVER' || target.role === 'RECIPIENT') {
            throw new BadRequestException('Ответственным может быть только офисный сотрудник');
        }

        const result = await this.setCompanyResponsible(orderId, companyId, targetUserId, false);
        return { ...result, orderNumber: order.orderNumber, targetName: `${target.lastName} ${target.firstName}` };
    }

    async acceptOrder(orderId: string, companyId: string, userId?: string) {
        const order = await this.findById(orderId);
        if (order.forwarderId !== companyId && order.subForwarderId !== companyId) {
            throw new ForbiddenException('Вы не можете принять эту заявку');
        }
        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                isConfirmed: true,
                statusHistory: {
                    create: {
                        status: order.status,
                        comment: 'Заявка принята экспедитором',
                    },
                },
            },
        });

        // Кто принял — тот и ведёт заявку со стороны своей компании
        if (userId) {
            await this.setCompanyResponsible(orderId, companyId, userId, true);
        }

        return updated;
    }

    /**
     * Отклонить заявку от заказчика
     */
    async rejectOrder(orderId: string, companyId: string) {
        const order = await this.findById(orderId);
        if (order.forwarderId !== companyId && order.subForwarderId !== companyId) {
            throw new ForbiddenException('Вы не можете отклонить эту заявку');
        }

        // Отклоняет суб-экспедитор: заказ остаётся у экспедитора, чистим только суб-поля
        if (order.subForwarderId === companyId && order.forwarderId && order.forwarderId !== companyId) {
            return this.prisma.order.update({
                where: { id: orderId },
                data: {
                    subForwarderId: null,
                    subForwarderPrice: null,
                    isConfirmed: true,
                    statusHistory: {
                        create: {
                            status: order.status,
                            comment: 'Суб-экспедитор отклонил заявку, заказ возвращён экспедитору',
                        },
                    },
                },
            });
        }

        // Отклоняет экспедитор: заявка возвращается заказчику
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                forwarderId: null,
                subForwarderId: null,
                subForwarderPrice: null,
                isConfirmed: false,
                status: OrderStatus.DRAFT,
                statusHistory: {
                    create: {
                        status: OrderStatus.DRAFT,
                        comment: 'Заявка отклонена экспедитором',
                    },
                },
            },
        });
    }

    /**
     * Переназначить заявку на партнера-экспедитора
     */
    async assignForwarder(orderId: string, companyId: string, partnerId: string, price: number) {
        const order = await this.findById(orderId);

        if (order.forwarderId !== companyId && order.partnerId !== companyId) {
            throw new ForbiddenException('Переназначить заявку на партнёра может только её экспедитор');
        }
        if (partnerId === companyId) {
            throw new BadRequestException('Нельзя переназначить заявку на собственную компанию');
        }

        const partnerCompany = await this.prisma.company.findUnique({
            where: { id: partnerId }
        });
        if (!partnerCompany) throw new NotFoundException('Компания не найдена');

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                subForwarderId: partnerId,
                subForwarderPrice: price,
                isConfirmed: false,
                statusHistory: {
                    create: {
                        status: order.status,
                        comment: `Заявка переназначена на партнера ${partnerCompany.name}`,
                    },
                },
            },
        });
    }


    /**
     * Взять заявку в работу с биржи
     */
    async takeOrder(orderId: string, companyId: string, userId?: string) {
        const order = await this.findById(orderId);
        if (order.forwarderId) throw new ForbiddenException('Заявка уже занята другим экспедитором');
        if (order.status !== OrderStatus.PENDING) throw new ForbiddenException('Заявка не доступна для взятия');

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: {
                forwarderId: companyId,
                status: OrderStatus.PENDING,
                isConfirmed: true, // Подтверждается автоматически при взятии
                statusHistory: {
                    create: {
                        status: OrderStatus.PENDING,
                        comment: 'Заявка взята экспедитором с биржи',
                    },
                },
            },
        });

        // Кто взял с биржи — тот и ведёт заявку со стороны своей компании
        if (userId) {
            await this.setCompanyResponsible(orderId, companyId, userId, true);
        }

        return updated;
    }

}