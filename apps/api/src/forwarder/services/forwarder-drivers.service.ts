import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ForwarderDriversService {
    constructor(private prisma: PrismaService) { }

    private readonly driverSelect = {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        vehiclePlate: true,
        vehicleModel: true,
        trailerNumber: true,
        docType: true,
        docNumber: true,
        docIssuedAt: true,
        docExpiresAt: true,
        docIssuedBy: true,
        createdAt: true,
    };

    /**
     * Получить список водителей компании-экспедитора
     */
    async getDrivers(companyId: string) {
        return this.prisma.user.findMany({
            where: {
                companyId,
                role: UserRole.DRIVER,
                isActive: true,
            },
            select: this.driverSelect,
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Создать водителя для компании-экспедитора
     */
    async createDriver(companyId: string, data: {
        firstName: string;
        lastName: string;
        middleName?: string;
        phone: string;
        vehiclePlate?: string;
        vehicleModel?: string;
        trailerNumber?: string;
        docType?: string;
        docNumber?: string;
        docIssuedAt?: Date;
        docExpiresAt?: Date;
        docIssuedBy?: string;
    }) {
        // Проверяем что телефон уникален
        const existing = await this.prisma.user.findUnique({
            where: { phone: data.phone },
        });

        if (existing) {
            throw new BadRequestException('Водитель с таким телефоном уже зарегистрирован');
        }

        // Создаём водителя без пароля (авторизация по SMS)
        return this.prisma.user.create({
            data: {
                ...data,
                role: UserRole.DRIVER,
                companyId,
                isActive: true,
            },
            select: this.driverSelect,
        });
    }

    /**
     * Обновить данные водителя
     */
    async updateDriver(
        driverId: string,
        companyId: string,
        data: {
            firstName?: string;
            lastName?: string;
            middleName?: string;
            vehiclePlate?: string;
            vehicleModel?: string;
            trailerNumber?: string;
            docType?: string;
            docNumber?: string;
            docIssuedAt?: Date;
            docExpiresAt?: Date;
            docIssuedBy?: string;
        }
    ) {
        // Проверяем что водитель принадлежит компании
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
        });

        if (!driver) {
            throw new NotFoundException('Водитель не найден');
        }

        if (driver.companyId !== companyId) {
            throw new ForbiddenException('У вас нет доступа к этому водителю');
        }

        return this.prisma.user.update({
            where: { id: driverId },
            data,
            select: this.driverSelect,
        });
    }

    /**
     * Деактивировать водителя
     */
    async deactivateDriver(driverId: string, companyId: string) {
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
        });

        if (!driver) {
            throw new NotFoundException('Водитель не найден');
        }

        if (driver.companyId !== companyId) {
            throw new ForbiddenException('У вас нет доступа к этому водителю');
        }

        return this.prisma.user.update({
            where: { id: driverId },
            data: { isActive: false },
        });
    }
}
