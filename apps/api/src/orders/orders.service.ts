import { Injectable, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, OrderStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto, getPaginationParams } from '../common/dto/pagination.dto';

@Injectable()
export class OrdersService implements OnModuleInit {
    constructor(private prisma: PrismaService) { }

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
    }) {
        // Генерация номера заявки
        const orderNumber = await this.generateOrderNumber();

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

        const isConfirmed = (
            data.driverId ||
            isForwarderExternal ||
            isCustomerExternal ||
            !data.forwarderId ||
            data.forwarderId === customer?.companyId ||
            data.forwarderId === (data.customerCompanyId || customer?.companyId)
        ) ? true : false;

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
    }, query: PaginationQueryDto = {}) {
        const { skip, take, page, limit } = getPaginationParams(query);
        const where = {
            status: filters?.status,
            customerId: filters?.customerId,
            driverId: filters?.driverId,
            createdAt: {
                gte: filters?.fromDate,
                lte: filters?.toDate,
            },
        };

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
     * Получение заявки по ID
     */
    async findById(id: string) {
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
            },
        });

        if (!order) {
            throw new NotFoundException('Заявка не найдена');
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
                forwarderId: partnerId || order.forwarderId || null,
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
     * Обновление статуса заявки
     */
    async updateStatus(orderId: string, status: OrderStatus, comment?: string, changedById?: string) {
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                status,
                completedAt: status === OrderStatus.COMPLETED ? new Date() : undefined,
                statusHistory: {
                    create: {
                        status,
                        comment,
                        changedById,
                    },
                },
            },
        });
    }

    /**
     * Обновление данных заявки (на любом этапе)
     */
    async update(orderId: string, data: {
        customerCompanyId?: string;
        cargoDescription?: string;
        cargoWeight?: number;
        cargoVolume?: number;
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

        return this.prisma.order.update({
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
    }

    /**
     * Добавление точки выгрузки в пути
     */
    async addDeliveryPoint(orderId: string, locationId: string, notes?: string) {
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

    /**
     * Генерация номера заявки (формат: LC-YYYYMMDD-XXXX)
     */
    private async generateOrderNumber(): Promise<string> {
        const today = new Date();
        const datePrefix = today.toISOString().slice(0, 10).replace(/-/g, '');

        const count = await this.prisma.order.count({
            where: {
                createdAt: {
                    gte: new Date(today.setHours(0, 0, 0, 0)),
                },
            },
        });

        return `LC-${datePrefix}-${String(count + 1).padStart(4, '0')}`;
    }

    /**
     * Заявки для водителя (текущие)
     */
    async findDriverOrders(driverId: string) {
        console.log(`🔍 [DEBUG] findDriverOrders for driverId: ${driverId}`);
        const orders = await this.prisma.order.findMany({
            where: {
                driverId,
                status: {
                    in: [
                        OrderStatus.ASSIGNED,
                        OrderStatus.EN_ROUTE_PICKUP,
                        OrderStatus.AT_PICKUP,
                        OrderStatus.LOADING,
                        OrderStatus.IN_TRANSIT,
                        OrderStatus.AT_DELIVERY,
                        OrderStatus.UNLOADING,
                    ],
                },
            },
            include: {
                routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return orders;
    }

    /**
     * Принять заявку в работу
     */
    async acceptOrder(orderId: string, companyId: string) {
        const order = await this.findById(orderId);
        return this.prisma.order.update({
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
    }

    /**
     * Отклонить заявку от заказчика
     */
    async rejectOrder(orderId: string, companyId: string) {
        const order = await this.findById(orderId);
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                forwarderId: null,
                subForwarderId: null,
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
                status: OrderStatus.PENDING,
                statusHistory: {
                    create: {
                        status: OrderStatus.PENDING,
                        comment: `Заявка переназначена на партнера ${partnerCompany.name}`,
                    },
                },
            },
        });
    }


    /**
     * Взять заявку в работу с биржи
     */
    async takeOrder(orderId: string, companyId: string) {
        const order = await this.findById(orderId);
        if (order.forwarderId) throw new ForbiddenException('Заявка уже занята другим экспедитором');
        if (order.status !== OrderStatus.PENDING) throw new ForbiddenException('Заявка не доступна для взятия');

        return this.prisma.order.update({
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
    }

}
