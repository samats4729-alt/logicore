import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CompanyService {
    constructor(private prisma: PrismaService) { }

    /**
     * Получить пользователей компании
     */
    async getCompanyUsers(companyId: string) {
        return this.prisma.user.findMany({
            where: { companyId, isActive: true },
            select: {
                id: true,
                email: true,
                phone: true,
                firstName: true,
                lastName: true,
                role: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Создать пользователя в компании
     */
    async createCompanyUser(
        companyId: string,
        data: {
            email: string;
            phone: string;
            password: string;
            firstName: string;
            lastName: string;
            role: 'LOGISTICIAN' | 'WAREHOUSE_MANAGER';
        },
    ) {
        // Проверяем что роль допустима
        if (!['LOGISTICIAN', 'WAREHOUSE_MANAGER'].includes(data.role)) {
            throw new BadRequestException('Недопустимая роль');
        }

        // Проверяем уникальность email
        const existingEmail = await this.prisma.user.findUnique({
            where: { email: data.email },
        });
        if (existingEmail) {
            throw new BadRequestException('Email уже занят');
        }

        // Проверяем уникальность телефона
        const existingPhone = await this.prisma.user.findUnique({
            where: { phone: data.phone },
        });
        if (existingPhone) {
            throw new BadRequestException('Телефон уже занят');
        }

        const passwordHash = await bcrypt.hash(data.password, 10);

        return this.prisma.user.create({
            data: {
                email: data.email,
                phone: data.phone,
                passwordHash,
                firstName: data.firstName,
                lastName: data.lastName,
                role: data.role as UserRole,
                companyId,
            },
            select: {
                id: true,
                email: true,
                phone: true,
                firstName: true,
                lastName: true,
                role: true,
            },
        });
    }

    /**
     * Обновить пользователя компании
     */
    async updateCompanyUser(
        companyId: string,
        userId: string,
        data: Partial<{
            firstName: string;
            lastName: string;
            role: 'LOGISTICIAN' | 'WAREHOUSE_MANAGER';
            password: string;
        }>,
    ) {
        // Проверяем что пользователь принадлежит компании
        const user = await this.prisma.user.findFirst({
            where: { id: userId, companyId },
        });
        if (!user) {
            throw new NotFoundException('Пользователь не найден');
        }

        const updateData: any = { ...data };
        if (data.password) {
            updateData.passwordHash = await bcrypt.hash(data.password, 10);
            delete updateData.password;
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                phone: true,
                firstName: true,
                lastName: true,
                role: true,
            },
        });
    }

    /**
     * Деактивировать пользователя компании
     */
    async deactivateCompanyUser(companyId: string, userId: string) {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, companyId },
        });
        if (!user) {
            throw new NotFoundException('Пользователь не найден');
        }

        // Нельзя деактивировать COMPANY_ADMIN
        if (user.role === 'COMPANY_ADMIN') {
            throw new ForbiddenException('Нельзя деактивировать админа компании');
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: { isActive: false },
        });
    }

    /**
     * Получить заявки компании
     */
    async getCompanyOrders(companyId: string) {
        return this.prisma.order.findMany({
            where: { customerCompanyId: companyId },
            include: {
                pickupLocation: true,
                deliveryPoints: { include: { location: true } },
                driver: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        vehiclePlate: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Получить профиль компании
     */
    async getCompanyProfile(companyId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
        });
        if (!company) {
            throw new NotFoundException('Компания не найдена');
        }
        return company;
    }
}
