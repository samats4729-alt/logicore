import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
    constructor(
        private prisma: PrismaService,
        private configService: ConfigService
    ) { }

    /**
     * Отправка Push-уведомления (через Firebase)
     * TODO: Интеграция с Firebase Cloud Messaging
     */
    async sendPush(data: {
        userId: string;
        title: string;
        body: string;
        data?: Record<string, any>;
    }) {
        // В dev режиме просто логируем
        if (this.configService.get('NODE_ENV') === 'development') {
            console.log(`📲 [DEV PUSH] To: ${data.userId}`);
            console.log(`   Title: ${data.title}`);
            console.log(`   Body: ${data.body}`);
            return true;
        }

        // TODO: Реальная интеграция с Firebase
        // const message = {
        //   notification: { title: data.title, body: data.body },
        //   data: data.data,
        //   token: userFcmToken,
        // };
        // await admin.messaging().send(message);

        return true;
    }

    /**
     * Уведомление водителю о назначении
     */
    async notifyDriverAssigned(driverId: string, orderNumber: string) {
        return this.sendPush({
            userId: driverId,
            title: 'Новый рейс',
            body: `Вам назначена заявка ${orderNumber}`,
            data: { type: 'ORDER_ASSIGNED', orderNumber },
        });
    }

    /**
     * Уведомление завскладу о прибытии машины
     */
    async notifyDriverArrived(warehouseUserId: string, driverName: string, vehiclePlate: string) {
        return this.sendPush({
            userId: warehouseUserId,
            title: 'Машина прибыла',
            body: `${driverName} (${vehiclePlate}) ожидает на погрузку`,
            data: { type: 'DRIVER_ARRIVED' },
        });
    }

    /**
     * Уведомление водителю о назначении ворот
     */
    async notifyGateAssigned(driverId: string, gateNumber: string, instructions?: string) {
        return this.sendPush({
            userId: driverId,
            title: 'Назначены ворота',
            body: `Заезжайте на ворота ${gateNumber}. ${instructions || ''}`,
            data: { type: 'GATE_ASSIGNED', gateNumber },
        });
    }

    /**
     * Уведомление грузополучателю о приближении
     */
    async notifyRecipientApproaching(recipientId: string, orderNumber: string, eta?: string) {
        return this.sendPush({
            userId: recipientId,
            title: 'Груз приближается',
            body: `Заявка ${orderNumber} скоро прибудет${eta ? `. Ожидаемое время: ${eta}` : ''}`,
            data: { type: 'APPROACHING', orderNumber },
        });
    }

    /**
     * Отправка Push-уведомлений всем сотрудникам компании (за исключением DRIVER и RECIPIENT)
     */
    async notifyCompany(companyId: string, data: { title: string; body: string; data?: Record<string, any> }) {
        try {
            const relations = await this.prisma.userCompanyRelation.findMany({
                where: { companyId },
                select: { userId: true }
            });
            const userIdsFromRelations = relations.map(r => r.userId);

            const directUsers = await this.prisma.user.findMany({
                where: { companyId },
                select: { id: true }
            });
            const directUserIds = directUsers.map(u => u.id);

            const allUserIds = Array.from(new Set([...userIdsFromRelations, ...directUserIds]));

            const usersToNotify = await this.prisma.user.findMany({
                where: {
                    id: { in: allUserIds },
                    role: { notIn: ['DRIVER', 'RECIPIENT'] }
                },
                select: { id: true }
            });

            for (const user of usersToNotify) {
                await this.sendPush({
                    userId: user.id,
                    title: data.title,
                    body: data.body,
                    data: data.data
                });
            }
        } catch (err) {
            console.warn(`Failed to notify company ${companyId}:`, err);
        }
    }
}
