import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrackingService {
    constructor(private prisma: PrismaService) { }

    /**
     * Сохранение GPS точки от водителя
     */
    async saveGpsPoint(data: {
        driverId: string;
        orderId?: string;
        latitude: number;
        longitude: number;
        accuracy?: number;
        speed?: number;
        heading?: number;
        recordedAt: Date;
    }) {
        return this.prisma.gpsPoint.create({ data });
    }

    /**
     * Пакетное сохранение (когда был offline)
     */
    async saveGpsPointsBatch(points: {
        driverId: string;
        orderId?: string;
        latitude: number;
        longitude: number;
        accuracy?: number;
        speed?: number;
        heading?: number;
        recordedAt: Date;
    }[]) {
        return this.prisma.gpsPoint.createMany({ data: points });
    }

    /**
     * Получение последней позиции водителя
     */
    async getDriverLastPosition(driverId: string) {
        return this.prisma.gpsPoint.findFirst({
            where: { driverId },
            orderBy: { recordedAt: 'desc' },
        });
    }

    /**
     * Получение трека заявки
     */
    async getOrderTrack(orderId: string) {
        return this.prisma.gpsPoint.findMany({
            where: { orderId },
            orderBy: { recordedAt: 'asc' },
        });
    }

    /**
     * Получение позиций всех активных водителей
     */
    async getAllActiveDriversPositions(companyId?: string) {
        // Получаем последнюю точку для каждого водителя за последний час
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const points = await this.prisma.gpsPoint.findMany({
            where: {
                recordedAt: { gte: oneHourAgo },
                order: companyId ? { customerCompanyId: companyId } : undefined,
            },
            orderBy: { recordedAt: 'desc' },
            distinct: ['driverId'],
            include: {
                driver: {
                    select: { id: true, firstName: true, lastName: true, vehiclePlate: true },
                },
                order: {
                    select: { id: true, orderNumber: true, status: true },
                },
            },
        });

        // Форматируем для карты
        return points.map(point => ({
            driverId: point.driverId,
            driverName: `${point.driver.lastName} ${point.driver.firstName}`,
            vehiclePlate: point.driver.vehiclePlate || '',
            latitude: point.latitude,
            longitude: point.longitude,
            speed: point.speed,
            heading: point.heading,
            updatedAt: point.recordedAt.toISOString(),
            orderId: point.order?.id,
            orderNumber: point.order?.orderNumber,
        }));
    }
}
