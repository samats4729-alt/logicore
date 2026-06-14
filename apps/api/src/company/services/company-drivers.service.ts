import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CompanyDriversService {
    constructor(private prisma: PrismaService) { }

    private readonly driverSelect = {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        iin: true,
        vehicleType: true,
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
     * Получить список водителей компании-экспедитора или внешнего перевозчика с проверкой прав
     */
    async getDriversFiltered(myCompanyId: string, queryCompanyId?: string) {
        const targetCompanyId = queryCompanyId || myCompanyId;

        // Если запрашиваем чужих водителей (targetCompanyId != myCompanyId),
        // проверяем права: эта внешняя компания должна иметь createdByCompanyId == myCompanyId
        if (targetCompanyId !== myCompanyId) {
            const externalCompany = await this.prisma.company.findUnique({
                where: { id: targetCompanyId },
                select: { isExternal: true, createdByCompanyId: true },
            });

            if (!externalCompany) {
                throw new NotFoundException('Компания перевозчика не найдена');
            }

            if (!externalCompany.isExternal || externalCompany.createdByCompanyId !== myCompanyId) {
                throw new ForbiddenException('У вас нет доступа к водителям этой компании');
            }
        }

        return this.prisma.user.findMany({
            where: {
                companyId: targetCompanyId,
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
        iin?: string;
        vehicleType?: string;
        vehiclePlate?: string;
        vehicleModel?: string;
        trailerNumber?: string;
        docType?: string;
        docNumber?: string;
        docIssuedAt?: Date;
        docExpiresAt?: Date;
        docIssuedBy?: string;
    }) {
        // Проверяем, существует ли водитель с таким телефоном или ИИН в рамках данной компании
        const orConditions: any[] = [{ phone: data.phone }];
        if (data.iin) {
            orConditions.push({ iin: data.iin });
        }

        const existing = await this.prisma.user.findFirst({
            where: {
                companyId,
                role: UserRole.DRIVER,
                OR: orConditions,
            },
        });

        if (existing) {
            // Если найден существующий водитель - обновляем его данные и активируем
            const updated = await this.prisma.user.update({
                where: { id: existing.id },
                data: {
                    ...data,
                    isActive: true,
                },
                select: this.driverSelect,
            });

            return {
                ...updated,
                alreadyExists: true,
            };
        }

        // Автоматически создаем отдел "Водители" при регистрации водителя, если его нет
        let driversDept = await this.prisma.department.findFirst({
            where: { companyId, name: 'Водители' }
        });

        if (!driversDept) {
            driversDept = await this.prisma.department.create({
                data: {
                    name: 'Водители',
                    companyId,
                    icon: 'TruckOutlined'
                }
            });
        }

        // Создаём водителя
        return this.prisma.user.create({
            data: {
                ...data,
                role: UserRole.DRIVER,
                companyId,
                departmentId: driversDept.id,
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
            iin?: string;
            vehicleType?: string;
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
        // Проверяем что водитель принадлежит компании или её внешнему перевозчику
        const driver = await this.prisma.user.findUnique({
            where: { id: driverId },
        });
 
        if (!driver) {
            throw new NotFoundException('Водитель не найден');
        }
 
        let hasAccess = driver.companyId === companyId;
        if (!hasAccess && driver.companyId) {
            const driverCompany = await this.prisma.company.findUnique({
                where: { id: driver.companyId },
                select: { isExternal: true, createdByCompanyId: true },
            });
            if (driverCompany?.isExternal && driverCompany.createdByCompanyId === companyId) {
                hasAccess = true;
            }
        }
 
        if (!hasAccess) {
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
 
        let hasAccess = driver.companyId === companyId;
        if (!hasAccess && driver.companyId) {
            const driverCompany = await this.prisma.company.findUnique({
                where: { id: driver.companyId },
                select: { isExternal: true, createdByCompanyId: true },
            });
            if (driverCompany?.isExternal && driverCompany.createdByCompanyId === companyId) {
                hasAccess = true;
            }
        }
 
        if (!hasAccess) {
            throw new ForbiddenException('У вас нет доступа к этому водителю');
        }
 
        return this.prisma.user.update({
            where: { id: driverId },
            data: { isActive: false },
        });
    }
}
