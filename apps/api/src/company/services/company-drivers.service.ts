import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CompanyDriversService {
    constructor(private prisma: PrismaService) { }

    // Фиче-флаг чтения водителей из нового слоя (Affiliation). По умолчанию ВЫКЛ, кэш 30с.
    private driverFlagCache: { value: boolean; expiresAt: number } | null = null;
    private async isAffiliationDriverReads(): Promise<boolean> {
        if (this.driverFlagCache && this.driverFlagCache.expiresAt > Date.now()) {
            return this.driverFlagCache.value;
        }
        let value = false;
        try {
            const row = await this.prisma.platformSetting.findUnique({ where: { key: 'identity_reads_drivers' } });
            value = row?.value === 'true';
        } catch {
            value = false;
        }
        this.driverFlagCache = { value, expiresAt: Date.now() + 30000 };
        return value;
    }

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

        // Новый путь (за флагом): членство водителей — из Affiliation (sourceUserId).
        if (await this.isAffiliationDriverReads()) {
            const affs = await this.prisma.affiliation.findMany({
                where: { companyId: targetCompanyId, role: UserRole.DRIVER, sourceUserId: { not: null } },
                select: { sourceUserId: true },
            });
            const ids = Array.from(new Set(affs.map(a => a.sourceUserId).filter(Boolean))) as string[];
            return this.prisma.user.findMany({
                where: { id: { in: ids }, role: UserRole.DRIVER, isActive: true },
                select: this.driverSelect,
                orderBy: { createdAt: 'desc' },
            });
        }

        // Старый путь (по умолчанию).
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
        password?: string;
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
    }, requesterCompanyId?: string) {
        // Создавать водителей можно только в своей компании или у своего внешнего перевозчика
        if (requesterCompanyId && companyId !== requesterCompanyId) {
            const targetCompany = await this.prisma.company.findUnique({
                where: { id: companyId },
                select: { isExternal: true, createdByCompanyId: true },
            });

            if (!targetCompany) {
                throw new NotFoundException('Компания перевозчика не найдена');
            }

            if (!targetCompany.isExternal || targetCompany.createdByCompanyId !== requesterCompanyId) {
                throw new ForbiddenException('У вас нет доступа к водителям этой компании');
            }
        }

        // Пароль для мобильного приложения хранится только в виде хеша
        const { password, ...driverData } = data;
        const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

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
                    ...driverData,
                    ...(passwordHash ? { passwordHash } : {}),
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
        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    ...driverData,
                    ...(passwordHash ? { passwordHash } : {}),
                    role: UserRole.DRIVER,
                    companyId,
                    departmentId: driversDept.id,
                    isActive: true,
                },
                select: this.driverSelect,
            });

            await tx.userCompanyRelation.create({
                data: {
                    userId: user.id,
                    companyId,
                    role: UserRole.DRIVER,
                },
            });

            return user;
        });
    }

    /**
     * Обновить данные водителя
     */
    async updateDriver(
        driverId: string,
        companyId: string,
        data: {
            password?: string;
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

        const { password, ...updateData } = data;
        const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

        return this.prisma.user.update({
            where: { id: driverId },
            data: {
                ...updateData,
                ...(passwordHash ? { passwordHash } : {}),
            },
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
