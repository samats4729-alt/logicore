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

        // Заявки компании: она может быть заказчиком, экспедитором, суб-экспедитором,
        // партнёром или ответственным менеджером — а не только заказчиком.
        const companyScope = companyId ? {
            OR: [
                { customerCompanyId: companyId },
                { forwarderId: companyId },
                { partnerId: companyId },
                { subForwarderId: companyId },
                { responsibleManager: { companyId } },
            ],
        } : {};

        const points = await this.prisma.gpsPoint.findMany({
            where: {
                recordedAt: { gte: oneHourAgo },
                order: companyId ? companyScope : undefined,
            },
            orderBy: { recordedAt: 'desc' },
            distinct: ['driverId'],
            include: {
                driver: { select: { id: true, firstName: true, lastName: true, vehiclePlate: true } },
                order: { select: { id: true, orderNumber: true, status: true } },
            },
        });

        // Водители по веб-ссылке — местоположение хранится прямо в заявке (без учётки/GpsPoint)
        const linkOrders = await this.prisma.order.findMany({
            where: {
                driverLat: { not: null },
                driverLng: { not: null },
                driverLocationAt: { gte: oneHourAgo },
                status: { notIn: ['DRAFT', 'CANCELLED', 'COMPLETED'] },
                ...(companyId ? companyScope : {}),
            },
            select: {
                id: true, orderNumber: true, status: true,
                driverLat: true, driverLng: true, driverSpeed: true, driverHeading: true, driverLocationAt: true,
                driverId: true, assignedDriverName: true, assignedDriverPlate: true,
                driver: { select: { firstName: true, lastName: true, vehiclePlate: true } },
            },
        });

        // Ключ — по заявке (одна заявка = один грузовик), берём самое свежее
        const byKey = new Map<string, any>();
        const put = (row: any) => {
            const key = row.orderId || row.driverId;
            const prev = byKey.get(key);
            if (!prev || new Date(row.updatedAt) > new Date(prev.updatedAt)) byKey.set(key, row);
        };

        for (const p of points) {
            put({
                driverId: p.driverId,
                driverName: `${p.driver.lastName || ''} ${p.driver.firstName || ''}`.trim() || 'Водитель',
                vehiclePlate: p.driver.vehiclePlate || '',
                latitude: p.latitude,
                longitude: p.longitude,
                speed: p.speed,
                heading: p.heading,
                updatedAt: p.recordedAt.toISOString(),
                orderId: p.order?.id,
                orderNumber: p.order?.orderNumber,
            });
        }
        for (const o of linkOrders) {
            put({
                driverId: o.driverId || `order_${o.id}`,
                driverName: o.assignedDriverName || `${o.driver?.lastName || ''} ${o.driver?.firstName || ''}`.trim() || 'Водитель',
                vehiclePlate: o.assignedDriverPlate || o.driver?.vehiclePlate || '',
                latitude: o.driverLat,
                longitude: o.driverLng,
                speed: o.driverSpeed || 0,
                heading: o.driverHeading || 0,
                updatedAt: (o.driverLocationAt || new Date()).toISOString(),
                orderId: o.id,
                orderNumber: o.orderNumber,
            });
        }

        return Array.from(byKey.values());
    }
}
