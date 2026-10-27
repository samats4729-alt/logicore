import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isExpoPushToken, PushMessage, sendExpoPush } from './expo-push';

export interface PushContent {
    title: string;
    body: string;
    /** `url` — экран приложения, который откроется по нажатию. */
    data?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService
    ) { }

    // ==================== телефоны ====================

    /**
     * Запомнить телефон пользователя. Тот же телефон под другим входом —
     * переходит к новому владельцу. У водителя один вход — один телефон:
     * прежние телефоны забываются, иначе рейсы и выплаты приходили бы на
     * аппарат, который он отдал или продал.
     */
    async registerDevice(userId: string, token: string, platform?: string | null, deviceId?: string | null) {
        if (!isExpoPushToken(token)) throw new BadRequestException('Неверный адрес для уведомлений');
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        await this.prisma.$transaction(async (tx) => {
            if (user?.role === 'DRIVER') {
                await tx.pushDevice.deleteMany({ where: { userId, token: { not: token } } });
            }
            await tx.pushDevice.upsert({
                where: { token },
                create: { userId, token, platform: platform ?? null, deviceId: deviceId ?? null },
                update: { userId, platform: platform ?? null, deviceId: deviceId ?? null },
            });
        });
        return { ok: true };
    }

    /** Вышел из приложения — на этот телефон больше не шлём. */
    async unregisterDevice(userId: string, token: string) {
        await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
        return { ok: true };
    }

    // ==================== отправка ====================

    /**
     * Отправить уведомление людям на их телефоны. Нет телефона — нечего
     * слать. Никогда не бросает исключений: уведомление — вдогонку к
     * действию, и его сбой не должен отменять само действие.
     *
     * Телефон, который Expo больше не знает (приложение удалили), забываем.
     * `PUSH_DISABLED=true` — не слать вовсе (только в журнал).
     */
    async sendToUsers(userIds: string[], content: PushContent): Promise<number> {
        try {
            const ids = Array.from(new Set(userIds.filter(Boolean)));
            if (!ids.length) return 0;
            const devices = await this.prisma.pushDevice.findMany({ where: { userId: { in: ids } }, select: { token: true } });
            if (!devices.length) return 0;
            if (this.configService.get('PUSH_DISABLED') === 'true') {
                this.logger.log(`push выключен: «${content.title}» — ${devices.length} тел.`);
                return 0;
            }
            const messages: PushMessage[] = devices.map((d) => ({ to: d.token, title: content.title, body: content.body, data: content.data }));
            const tickets = await sendExpoPush(messages, {
                url: this.configService.get('EXPO_PUSH_URL') || undefined,
                accessToken: this.configService.get('EXPO_ACCESS_TOKEN') || null,
            });
            const gone = tickets
                .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? messages[i].to : null))
                .filter((t): t is string => !!t);
            if (gone.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: gone } } });
            const failed = tickets.filter((t) => t.status === 'error');
            if (failed.length) this.logger.warn(`push: не ушло ${failed.length} из ${tickets.length} — ${failed[0].message ?? failed[0].details?.error ?? ''}`);
            return tickets.length - failed.length;
        } catch (e: any) {
            this.logger.warn(`push не отправлен: ${e?.message ?? e}`);
            return 0;
        }
    }

    /** Уведомление одному человеку. */
    async sendPush(data: { userId: string } & PushContent) {
        await this.sendToUsers([data.userId], data);
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

            await this.sendToUsers(usersToNotify.map((u) => u.id), data);
        } catch (err) {
            console.warn(`Failed to notify company ${companyId}:`, err);
        }
    }
}
