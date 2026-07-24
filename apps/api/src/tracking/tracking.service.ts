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

    /**
     * Активные рейсы для карты мониторинга: заявки в работе с точками маршрута
     * и (если есть) текущей позицией водителя. Показываются, даже если водитель
     * ещё не поделился координатами — тогда виден только маршрут.
     */
    async getActiveTrips(companyId?: string) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const ACTIVE = ['ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'AT_DELIVERY', 'UNLOADING', 'PROBLEM'] as any[];

        const companyScope = companyId ? {
            OR: [
                { customerCompanyId: companyId },
                { forwarderId: companyId },
                { partnerId: companyId },
                { subForwarderId: companyId },
                { responsibleManager: { companyId } },
            ],
        } : {};

        const orders = await this.prisma.order.findMany({
            where: {
                status: { in: ACTIVE },
                ...(companyId ? companyScope : {}),
            },
            select: {
                id: true, orderNumber: true, status: true,
                driverLat: true, driverLng: true, driverSpeed: true, driverHeading: true, driverLocationAt: true,
                driverId: true, assignedDriverName: true, assignedDriverPlate: true,
                driver: { select: { id: true, firstName: true, lastName: true, vehiclePlate: true } },
                routePoints: {
                    orderBy: { sequence: 'asc' },
                    select: {
                        pointType: true,
                        location: { select: { latitude: true, longitude: true, city: true, address: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Свежие GPS-точки водителей с учёткой (одна на водителя)
        const gps = await this.prisma.gpsPoint.findMany({
            where: { recordedAt: { gte: oneHourAgo }, order: companyId ? companyScope : undefined },
            orderBy: { recordedAt: 'desc' },
            distinct: ['driverId'],
            select: { driverId: true, orderId: true, latitude: true, longitude: true, speed: true, heading: true, recordedAt: true },
        });
        const gpsByOrder = new Map<string, typeof gps[number]>();
        for (const g of gps) if (g.orderId) gpsByOrder.set(g.orderId, g);

        return orders.map((o) => {
            const points = o.routePoints
                .filter((p) => p.location?.latitude != null && p.location?.longitude != null)
                .map((p) => ({
                    type: p.pointType,
                    latitude: p.location!.latitude,
                    longitude: p.location!.longitude,
                    city: p.location!.city || null,
                    address: p.location!.address || null,
                }));

            // Позиция водителя: свежий GpsPoint, иначе координаты из веб-ссылки (за час)
            const g = gpsByOrder.get(o.id);
            let driver: { latitude: number; longitude: number; speed: number; heading: number; updatedAt: string } | null = null;
            if (g) {
                driver = { latitude: g.latitude, longitude: g.longitude, speed: g.speed || 0, heading: g.heading || 0, updatedAt: g.recordedAt.toISOString() };
            } else if (o.driverLat != null && o.driverLng != null && o.driverLocationAt && o.driverLocationAt >= oneHourAgo) {
                driver = { latitude: o.driverLat, longitude: o.driverLng, speed: o.driverSpeed || 0, heading: o.driverHeading || 0, updatedAt: o.driverLocationAt.toISOString() };
            }

            return {
                id: o.id,
                orderNumber: o.orderNumber,
                status: o.status,
                driverName: o.assignedDriverName || `${o.driver?.lastName || ''} ${o.driver?.firstName || ''}`.trim() || 'Водитель не назначен',
                vehiclePlate: o.assignedDriverPlate || o.driver?.vehiclePlate || '',
                driverId: o.driverId || `order_${o.id}`,
                points,
                driver,
            };
        });
    }
}
