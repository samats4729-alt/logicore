import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';

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
                permissions: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Создать приглашение для сотрудника
     */
    async createInvitation(companyId: string, email: string, role: UserRole, permissions: string[] = []) {
        // Создаем случайный токен, например, 32 символа
        const crypto = require('crypto');
        const token = crypto.randomBytes(16).toString('hex');
        
        // Срок годности - 3 дня
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3);

        const invitation = await this.prisma.invitation.create({
            data: {
                email,
                role,
                companyId,
                token,
                permissions,
                expiresAt,
            },
        });
        
        // Возвращаем токен (в реальной жизни здесь был бы вызов MailService)
        return invitation;
    }

    /**
     * Получить список активных приглашений компании
     */
    async getInvitations(companyId: string) {
        return this.prisma.invitation.findMany({
            where: { companyId, isUsed: false },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Отменить приглашение
     */
    async cancelInvitation(companyId: string, invitationId: string) {
        const inv = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
        if (!inv || inv.companyId !== companyId) {
            throw new NotFoundException('Приглашение не найдено');
        }
        return this.prisma.invitation.delete({ where: { id: invitationId } });
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
        if (!['LOGISTICIAN', 'WAREHOUSE_MANAGER'].includes(data.role)) {
            throw new BadRequestException('Недопустимая роль');
        }

        const existingEmail = await this.prisma.user.findUnique({
            where: { email: data.email },
        });
        if (existingEmail) {
            throw new BadRequestException('Email уже занят');
        }

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
     * Изменить права доступа пользователя
     */
    async updateUserPermissions(companyId: string, userId: string, permissions: string[]) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.companyId !== companyId) {
            throw new NotFoundException('Пользователь не найден');
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: { permissions },
            select: { id: true, permissions: true }
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
            role: 'COMPANY_ADMIN' | 'LOGISTICIAN' | 'WAREHOUSE_MANAGER';
            password: string;
        }>,
    ) {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, companyId },
        });
        if (!user) {
            throw new NotFoundException('Пользователь не найден');
        }

        if (data.role && user.role === 'COMPANY_ADMIN' && data.role !== 'COMPANY_ADMIN') {
            const adminCount = await this.prisma.user.count({
                where: {
                    companyId,
                    role: 'COMPANY_ADMIN',
                    isActive: true,
                },
            });

            if (adminCount <= 1) {
                throw new BadRequestException(
                    'Нельзя изменить роль единственного администратора компании. ' +
                    'Сначала добавьте другого администратора.'
                );
            }
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
                forwarder: {
                    select: {
                        id: true,
                        name: true,
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

    /**
     * Обновить профиль компании
     */
    async updateCompanyProfile(companyId: string, data: {
        name?: string;
        bin?: string;
        address?: string;
        phone?: string;
        email?: string;
        directorName?: string;
        bankAccount?: string;
        bankName?: string;
        bankBic?: string;
        kbe?: string;
    }) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
        });
        if (!company) {
            throw new NotFoundException('Компания не найдена');
        }

        return this.prisma.company.update({
            where: { id: companyId },
            data,
        });
    }

    /**
     * Загрузить печать компании (PNG)
     */
    async uploadStamp(companyId: string, file: Express.Multer.File) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
        });
        if (!company) {
            throw new NotFoundException('Компания не найдена');
        }

        const uploadsDir = path.join(process.cwd(), 'uploads', 'stamps');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filename = `stamp_${companyId}_${Date.now()}.png`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, file.buffer);

        // Удаляем старый файл
        if (company.stampImage) {
            const oldPath = path.join(process.cwd(), company.stampImage);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        const relativePath = `uploads/stamps/${filename}`;
        await this.prisma.company.update({
            where: { id: companyId },
            data: { stampImage: relativePath },
        });

        return { stampImage: relativePath };
    }

    /**
     * Получить путь к печати компании
     */
    async getStampPath(companyId: string): Promise<string | null> {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { stampImage: true },
        });
        if (!company) {
            throw new NotFoundException('Компания не найдена');
        }
        return company.stampImage;
    }

    /**
     * Получить список экспедиторов
     */
    async getForwarders() {
        return this.prisma.company.findMany({
            where: {
                type: 'FORWARDER',
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
            },
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Получить уведомления (счётчики)
     */
    async getNotifications(companyId: string) {
        const [pendingOrders, pendingPartners, company] = await Promise.all([
            // Заявки, назначенные нам, но ещё не подтверждённые
            this.prisma.order.count({
                where: {
                    forwarderId: companyId,
                    isConfirmed: false,
                    status: { notIn: ['DRAFT', 'CANCELLED'] },
                },
            }),
            // Входящие запросы на партнёрство
            this.prisma.partnership.count({
                where: {
                    recipientId: companyId,
                    status: 'PENDING',
                },
            }),
            // Проверка заполненности профиля
            this.prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true, bin: true, address: true, directorName: true, bankAccount: true, bankName: true, bankBic: true, kbe: true },
            }),
        ]);

        const requiredFields = ['name', 'bin', 'address', 'directorName', 'bankAccount', 'bankName', 'bankBic', 'kbe'];
        const profileIncomplete = requiredFields.some(f => !(company as Record<string, any>)?.[f]);

        return {
            pendingOrders,
            pendingPartners,
            profileIncomplete,
            settingsCount: profileIncomplete ? 1 : 0,
        };
    }
}
