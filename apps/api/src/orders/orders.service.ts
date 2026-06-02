import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, OrderStatus, Prisma } from '@prisma/client';
import { PaginationQueryDto, getPaginationParams } from '../common/dto/pagination.dto';

@Injectable()
export class OrdersService {
    constructor(private prisma: PrismaService) { }

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
        driverId?: string;
        forwarderId?: string; // Экспедитор
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

        // Если водитель назначен → ASSIGNED
        // Если экспедитор внешний → ASSIGNED (подтверждать некому)
        // Иначе → PENDING
        const status = (data.driverId || isForwarderExternal)
            ? OrderStatus.ASSIGNED
            : OrderStatus.PENDING;

        // Получаем companyId заказчика
        const customer = await this.prisma.user.findUnique({
            where: { id: data.customerId },
            select: { companyId: true },
        });

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
                driverId: data.driverId,
                forwarderId: data.forwarderId, // Связь с экспедитором
                status,
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

    /**
     * Назначение водителя на заявку
     */
    async assignDriver(orderId: string, driverId: string, partnerId?: string) {
        const order = await this.findById(orderId);

        if (order.status !== OrderStatus.PENDING) {
            throw new BadRequestException('Нельзя назначить водителя на эту заявку');
        }

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                driverId,
                partnerId,
                status: OrderStatus.ASSIGNED,
                statusHistory: {
                    create: {
                        status: OrderStatus.ASSIGNED,
                        comment: 'Назначен водитель',
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
    }) {
        const order = await this.findById(orderId);

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
}
