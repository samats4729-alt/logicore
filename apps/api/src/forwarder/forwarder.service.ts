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
                forwarder: {
                    select: {
                        id: true,
                        name: true,
                    }
                },
                responsibleManager: {
                    select: { id: true, firstName: true, lastName: true }
                },
                assignees: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
                    orderBy: { assignedAt: 'desc' },
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
        const result = await this.prisma.order.update({
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

        // Логируем изменение
        await this.logOrderChange(orderId, companyId, 'driver_assigned', `Назначен водитель: ${data.driverName} (${data.driverPlate})`);

        return result;
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

        // 2. Проверяем партнера (должен быть в статусе ACCEPTED или это внешняя компания)
        const partnerCompany = await this.prisma.company.findUnique({
            where: { id: partnerId }
        });

        if (!partnerCompany) throw new NotFoundException('Компания не найдена');

        let isAllowed = false;

        if (partnerCompany.isExternal && partnerCompany.createdByCompanyId === companyId) {
            isAllowed = true;
        } else {
            const partnership = await this.prisma.partnership.findFirst({
                where: {
                    OR: [
                        { requesterId: companyId, recipientId: partnerId },
                        { requesterId: partnerId, recipientId: companyId }
                    ],
                    status: 'ACCEPTED'
                }
            });
            if (partnership) isAllowed = true;
        }

        if (!isAllowed) {
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
                isConfirmed: true, // Сразу подтверждаем, так как берем с биржи добровольно
            },
        });
    }

    /**
     * Принять заявку от заказчика
     */
    async acceptOrder(orderId: string, companyId: string) {
        const order = await this.getForwarderOrder(orderId, companyId);
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
        const order = await this.getForwarderOrder(orderId, companyId);
        return this.prisma.order.update({
            where: { id: orderId },
            data: {
                forwarderId: null,      // Снимаем с себя
                subForwarderId: null,   // На всякий случай
                isConfirmed: false,
                status: 'DRAFT',        // Возвращаем заказчику в черновики/отклоненные
                statusHistory: {
                    create: {
                        status: 'DRAFT',
                        comment: 'Заявка отклонена экспедитором',
                    },
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
    async updateOrderStatus(orderId: string, companyId: string, status: string, comment?: string, userId?: string) {
        // Проверяем что заявка принадлежит экспедитору
        await this.getForwarderOrder(orderId, companyId);

        const result = await this.prisma.order.update({
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

        // Логируем изменение статуса
        if (userId) {
            await this.logOrderChange(orderId, userId, 'status_changed', `Статус изменён на: ${status}${comment ? ' — ' + comment : ''}`);
        }

        return result;
    }

    // ==================== МЕНЕДЖЕРЫ НА ЗАЯВКЕ ====================

    /**
     * Менеджер прикрепляет себя к заявке
     */
    async assignManagerToOrder(orderId: string, companyId: string, userId: string) {
        // Проверяем что заявка принадлежит компании
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Заявка не найдена');
        if (order.forwarderId !== companyId && order.subForwarderId !== companyId) {
            throw new ForbiddenException('Нет доступа к этой заявке');
        }

        // Проверяем что пользователь из этой компании
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { companyId: true, firstName: true, lastName: true } });
        if (!user || user.companyId !== companyId) {
            throw new ForbiddenException('Пользователь не принадлежит этой компании');
        }

        // Создаём привязку (upsert чтобы не дублировать)
        const assignee = await this.prisma.orderAssignee.upsert({
            where: { orderId_userId: { orderId, userId } },
            create: { orderId, userId },
            update: {},
            include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
        });

        // Логируем
        await this.logOrderChange(orderId, userId, 'manager_assigned', `${user.firstName} ${user.lastName} взял(а) заявку в работу`);

        return assignee;
    }

    /**
     * Менеджер открепляет себя от заявки
     */
    async unassignManagerFromOrder(orderId: string, companyId: string, userId: string) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Заявка не найдена');
        if (order.forwarderId !== companyId && order.subForwarderId !== companyId) {
            throw new ForbiddenException('Нет доступа к этой заявке');
        }

        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });

        await this.prisma.orderAssignee.deleteMany({
            where: { orderId, userId },
        });

        // Логируем
        await this.logOrderChange(orderId, userId, 'manager_unassigned', `${user?.firstName} ${user?.lastName} открепился(-ась) от заявки`);

        return { success: true };
    }

    /**
     * Получить лог изменений заявки
     */
    async getOrderChangeLog(orderId: string, companyId: string) {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Заявка не найдена');
        if (order.forwarderId !== companyId && order.subForwarderId !== companyId) {
            throw new ForbiddenException('Нет доступа к этой заявке');
        }

        return this.prisma.orderChangeLog.findMany({
            where: { orderId },
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Записать изменение в лог заявки
     */
    async logOrderChange(orderId: string, userId: string, action: string, details?: string) {
        return this.prisma.orderChangeLog.create({
            data: { orderId, userId, action, details },
        });
    }

    // ==================== КОМИССИЯ МЕНЕДЖЕРОВ ====================

    /**
     * Установить процент комиссии для менеджера (только админ)
     */
    async setManagerCommission(companyId: string, userId: string, commissionPercent: number) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.companyId !== companyId) {
            throw new ForbiddenException('Пользователь не найден в этой компании');
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: { commissionPercent },
            select: { id: true, firstName: true, lastName: true, commissionPercent: true },
        });
    }

    /**
     * Получить заработок менеджера за указанный месяц
     */
    async getManagerEarnings(companyId: string, userId: string, year?: number, month?: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, firstName: true, lastName: true, companyId: true, commissionPercent: true },
        });
        if (!user || user.companyId !== companyId) {
            throw new ForbiddenException('Пользователь не найден в этой компании');
        }

        const now = new Date();
        const targetYear = year || now.getFullYear();
        const targetMonth = month || (now.getMonth() + 1); // 1-indexed

        const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
        const endOfMonth = new Date(targetYear, targetMonth, 1);

        // Находим все заявки, к которым прикреплён этот менеджер, завершённые в этом месяце
        const assignments = await this.prisma.orderAssignee.findMany({
            where: {
                userId,
                order: {
                    OR: [
                        { forwarderId: companyId },
                        { subForwarderId: companyId },
                    ],
                    completedAt: {
                        gte: startOfMonth,
                        lt: endOfMonth,
                    },
                    status: 'COMPLETED',
                },
            },
            include: {
                order: {
                    select: {
                        id: true,
                        orderNumber: true,
                        customerPrice: true,
                        completedAt: true,
                        expenses: {
                            where: { isDeleted: false, companyId },
                            select: { amount: true },
                        },
                    },
                },
            },
        });

        // Считаем маржу и заработок по каждой заявке
        const orderEarnings = assignments.map(a => {
            const customerPrice = a.order.customerPrice || 0;
            const totalExpenses = a.order.expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
            const margin = customerPrice - totalExpenses;
            const earning = Math.max(0, margin * (user.commissionPercent / 100));
            return {
                orderId: a.order.id,
                orderNumber: a.order.orderNumber,
                customerPrice,
                totalExpenses,
                margin,
                earning: Math.round(earning),
                completedAt: a.order.completedAt,
            };
        });

        const totalMargin = orderEarnings.reduce((s, o) => s + o.margin, 0);
        const totalEarning = orderEarnings.reduce((s, o) => s + o.earning, 0);

        return {
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                commissionPercent: user.commissionPercent,
            },
            period: {
                year: targetYear,
                month: targetMonth,
                label: `${String(targetMonth).padStart(2, '0')}.${targetYear}`,
            },
            ordersCount: orderEarnings.length,
            totalMargin,
            totalEarning,
            orders: orderEarnings,
        };
    }
}
