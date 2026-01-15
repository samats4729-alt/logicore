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
                forwarderId: companyId,
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
