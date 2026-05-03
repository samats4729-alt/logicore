import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class ForwarderTrackingService {
    constructor(private prisma: PrismaService) { }

    /**
     * Получить GPS точки всех водителей компании-экспедитора
     */
    async getDriversLocations(companyId: string) {
        // Получаем всех активных водителей компании
        const drivers = await this.prisma.user.findMany({
            where: {
                companyId,
                role: UserRole.DRIVER,
                isActive: true,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                vehiclePlate: true,
                vehicleModel: true,
            },
        });

        // Для каждого водителя получаем последнюю GPS точку
        const driversWithLocations = await Promise.all(
            drivers.map(async (driver) => {
                const lastGpsPoint = await this.prisma.gpsPoint.findFirst({
                    where: { driverId: driver.id },
                    orderBy: { recordedAt: 'desc' },
                });

                return {
                    ...driver,
                    lastLocation: lastGpsPoint ? {
                        latitude: lastGpsPoint.latitude,
                        longitude: lastGpsPoint.longitude,
                        timestamp: lastGpsPoint.recordedAt,
                        speed: lastGpsPoint.speed,
                    } : null,
                };
            })
        );

        return driversWithLocations;
    }
}
