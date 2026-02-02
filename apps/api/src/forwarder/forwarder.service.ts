import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ForwarderService {
    constructor(private prisma: PrismaService) { }

    /**
     * Получить заявки, назначенные на экспедитора
     */
    async getForwarderOrders(companyId: string) {
        return this.prisma.order.findMany({
            where: {
                OR: [
                    { forwarderId: companyId },
                    { subForwarderId: companyId }
                ]
            },
            include: {
                pickupLocation: true,
                deliveryPoints: {
                    include: { location: true },
                    orderBy: { sequence: 'asc' },
                },
                customer: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        email: true,
                    },
                },
                customerCompany: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    },
                },
                subForwarder: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    }
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Получить одну заявку для экспедитора
     */
    async getForwarderOrder(orderId: string, companyId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                pickupLocation: true,
                deliveryPoints: {
                    include: { location: true },
                    orderBy: { sequence: 'asc' },
                },
                customer: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        email: true,
                    },
                },
                customerCompany: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    },
                },
            },
        });

        if (!order) {
            throw new NotFoundException('Заявка не найдена');
        }

        if (order.forwarderId !== companyId) {
            throw new ForbiddenException('Нет доступа к этой заявке');
        }

        return order;
    }

    /**
     * Назначить водителя на заявку
     */
    async assignDriver(
        orderId: string,
        companyId: string,
        data: {
            driverId?: string; // ID пользователя-водителя
            driverName: string;
            driverPhone: string;
            driverPlate: string;
            trailerNumber?: string;
        }
    ) {
        // Проверяем что заявка назначена на эту компанию или ещё не назначена
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });

        if (!order) {
            throw new NotFoundException('Заявка не найдена');
        }

        // DEBUG: Логируем для отладки
        console.log('DEBUG assignDriver:', {
            orderId,
            companyId: companyId,
            orderForwarderId: order.forwarderId,
            match: order.forwarderId === companyId
        });

        // Разрешаем назначение если заявка уже на этом экспедиторе или ещё не назначена
        if (order.forwarderId && order.forwarderId !== companyId) {
            throw new ForbiddenException(`Эта заявка уже назначена другому экспедитору (forwarderId: ${order.forwarderId}, ваш ID: ${companyId})`);
        }

        // Обновляем заявку с данными водителя и устанавливаем экспедитора
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                forwarderId: companyId, // Устанавливаем экспедитора если ещё не установлен
                driverId: data.driverId, // Привязываем к аккаунту водителя
                assignedDriverName: data.driverName,
                assignedDriverPhone: data.driverPhone,
                assignedDriverPlate: data.driverPlate,
                assignedDriverTrailer: data.trailerNumber,
                assignedAt: new Date(),
                status: order.status === 'PENDING' ? 'ASSIGNED' : order.status,
            },
            include: {
                pickupLocation: true,
                deliveryPoints: {
                    include: { location: true },
                },
            },
        });
    }

    /**
     * Переназначить заявку на партнера-экспедитора
     */
    async assignForwarder(orderId: string, companyId: string, partnerId: string, price: number) {
        // 1. Проверяем заявку (должна быть назначена на текущего экспедитора)
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });

        if (!order) throw new NotFoundException('Заявка не найдена');
        if (order.forwarderId !== companyId) throw new ForbiddenException('Нет доступа к этой заявке');

        // 2. Проверяем партнера (должен быть в статусе ACCEPTED)
        const partnership = await this.prisma.partnership.findFirst({
            where: {
                OR: [
                    { requesterId: companyId, recipientId: partnerId },
                    { requesterId: partnerId, recipientId: companyId }
                ],
                status: 'ACCEPTED'
            }
        });

        if (!partnership) {
            throw new ForbiddenException('Выбранная компания не является вашим подтвержденным партнером');
        }

        // 3. Обновляем заявку
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                subForwarderId: partnerId,
                subForwarderPrice: price,
                // Если мы передаем заявку, мы убираем своего водителя
                driverId: null,
                assignedDriverName: null,
                assignedDriverPhone: null,
                assignedDriverPlate: null,
                assignedDriverTrailer: null,
                assignedAt: null,
                // Статус можно оставить ASSIGNED или перевести в PENDING для суб-экспедитора?
                // Пока оставим текущий статус, логика статусов может быть сложнее
                // Но логично, что для суб-экспедитора это "новая" заявка.
                // В текущей системе, subForwarder увидит эту заявку через какой endpoint?
                // Нужно будет обновить getForwarderOrders чтобы видеть и subForwardingOrders
            }
        });
    }



    /**
     * Получить список свободных заявок (Биржа)
     */
    async getMarketplaceOrders() {
        return this.prisma.order.findMany({
            where: {
                forwarderId: null,
                status: 'PENDING',
            },
            include: {
                pickupLocation: true,
                deliveryPoints: {
                    include: { location: true },
                    orderBy: { sequence: 'asc' },
                },
                customerCompany: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Взять заявку в работу (назначить на себя)
     */
    async takeOrder(orderId: string, companyId: string) {
        // Проверяем что заявка свободна
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
        });

        if (!order) throw new NotFoundException('Заявка не найдена');
        if (order.forwarderId) throw new ForbiddenException('Заявка уже занята другим экспедитором');
        if (order.status !== 'PENDING') throw new ForbiddenException('Заявка не доступна для взятия');

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                forwarderId: companyId,
                status: 'PENDING', // Остается PENDING, пока экспедитор не назначит водителя
                // Можно добавить логику уведомления заказчика
            },
        });
    }

    /**
     * Получить статистику для дашборда
     */
    async getForwarderStats(companyId: string) {
        const orders = await this.prisma.order.findMany({
            where: { forwarderId: companyId },
            select: { status: true },
        });

        return {
            total: orders.length,
            pending: orders.filter(o => o.status === 'PENDING').length,
            assigned: orders.filter(o =>
                ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING'].includes(o.status)
            ).length,
            completed: orders.filter(o => o.status === 'COMPLETED').length,
        };
    }

    /**
     * Обновить статус заявки
     */
    async updateOrderStatus(orderId: string, companyId: string, status: string, comment?: string) {
        // Проверяем что заявка принадлежит экспедитору
        await this.getForwarderOrder(orderId, companyId);

        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                status: status as any,
                statusHistory: {
                    create: {
                        status: status as any,
                        comment: comment || 'Статус обновлён экспедитором',
                    },
                },
            },
        });
    }
}
