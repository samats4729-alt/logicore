import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';
import { PaginationQueryDto, getPaginationParams } from '../common/dto/pagination.dto';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class CompanyService {
    constructor(private prisma: PrismaService, private s3Service: S3Service) { }

    async getCompanyUsers(companyId: string, query: any = {}) {
        const { skip, take, page, limit } = getPaginationParams(query);
        const where: any = { companyId, isActive: true };

        if (query.role) {
            where.role = query.role;
        } else if (query.segment) {
            if (query.segment === 'drivers') {
                where.role = UserRole.DRIVER;
            } else if (query.segment === 'office') {
                where.role = { not: UserRole.DRIVER };
            }
        }

        const [data, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                skip,
                take,
                select: {
                    id: true,
                    email: true,
                    phone: true,
                    firstName: true,
                    lastName: true,
                    middleName: true,
                    role: true,
                    position: true,
                    permissions: true,
                    createdAt: true,
                    departmentId: true,
                    department: {
                        select: {
                            id: true,
                            name: true,
                        }
                    },
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
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.user.count({ where })
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Создать приглашение для сотрудника
     */
    async createInvitation(companyId: string, email: string, role: UserRole, permissions: string[] = [], departmentId?: string, position?: string) {
        // Создаем случайный токен, например, 32 символа
        const crypto = require('crypto');
        const token = crypto.randomBytes(16).toString('hex');
        
        // Срок годности - 3 дня
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 3);

        // Если передан отдел, проверим, принадлежит ли он компании
        if (departmentId) {
            const department = await this.prisma.department.findFirst({
                where: { id: departmentId, companyId },
            });
            if (!department) {
                throw new NotFoundException('Указанный отдел не найден');
            }
        }

        const invitation = await this.prisma.invitation.create({
            data: {
                email,
                role,
                position: position || null,
                companyId,
                token,
                permissions,
                expiresAt,
                departmentId: departmentId || null,
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
            role: 'LOGISTICIAN' | 'WAREHOUSE_MANAGER' | 'ACCOUNTANT';
        },
    ) {
        if (!['LOGISTICIAN', 'WAREHOUSE_MANAGER', 'ACCOUNTANT'].includes(data.role)) {
            throw new BadRequestException('Недопустимая роль');
        }

        const existingEmail = await this.prisma.user.findUnique({
            where: { email: data.email },
        });
        if (existingEmail) {
            throw new BadRequestException('Email уже занят');
        }

        const existingPhone = await this.prisma.user.findFirst({
            where: { phone: data.phone },
        });
        if (existingPhone) {
            throw new BadRequestException('Телефон уже занят');
        }

        const passwordHash = await bcrypt.hash(data.password, 12);

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
            role: 'COMPANY_ADMIN' | 'LOGISTICIAN' | 'WAREHOUSE_MANAGER' | 'ACCOUNTANT';
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
            updateData.passwordHash = await bcrypt.hash(data.password, 12);
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
     * Получить заявки компании с пагинацией
     */
    async getCompanyOrders(companyId: string, query: PaginationQueryDto & { type?: string } = {}) {
        const { skip, take, page, limit } = getPaginationParams(query);
        
        let where: any = {};
        if (query.type === 'active') {
            where = {
                AND: [
                    { status: { not: 'CANCELLED' } },
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            { responsibleManager: { companyId: companyId } },
                        ],
                    }
                ]
            };
        } else if (query.type === 'incoming') {
            where = {
                AND: [
                    { status: { not: 'CANCELLED' } },
                    {
                        OR: [
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { subForwarderId: companyId },
                            {
                                responsibleManager: { companyId: companyId },
                                NOT: { customerCompanyId: companyId }
                            }
                        ]
                    }
                ]
            };
        } else if (query.type === 'outgoing') {
            where = {
                AND: [
                    { status: { not: 'CANCELLED' } },
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            {
                                responsibleManager: { companyId: companyId },
                                NOT: { forwarderId: companyId }
                            }
                        ]
                    }
                ]
            };
        } else if (query.type === 'archive') {
            const firstUser = await this.prisma.user.findFirst({
                where: { companyId },
                orderBy: { createdAt: 'asc' },
                select: { createdAt: true },
            });
            const registeredAt = firstUser?.createdAt;

            where = {
                status: 'CANCELLED',
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId: companyId } }
                ]
            };

            if (registeredAt) {
                where.createdAt = { gte: registeredAt };
            }
        } else {
            where = {
                OR: [
                    { customerCompanyId: companyId },
                    { forwarderId: companyId },
                    { partnerId: companyId },
                    { subForwarderId: companyId },
                    { responsibleManager: { companyId: companyId } },
                ],
            };
        }

        const [data, total] = await Promise.all([
            this.prisma.order.findMany({
                where,
                skip,
                take,
                include: {
                    routePoints: { include: { location: true }, orderBy: { sequence: 'asc' } },
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
                            email: true,
                        },
                    },
                    customerCompany: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    partner: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    subForwarder: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    customer: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            phone: true,
                            email: true,
                        },
                    },
                    responsibleManager: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.order.count({ where })
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
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
        actualAddress?: string;
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

        const filename = `stamp_${companyId}_${Date.now()}.png`;
        const relativePath = `uploads/stamps/${filename}`;

        if (this.s3Service.isS3Enabled()) {
            // Upload to S3
            await this.s3Service.uploadFile(relativePath, file.buffer, file.mimetype);

            // Delete old file from S3 and local disk (for cleanup of legacy local files)
            if (company.stampImage) {
                await this.s3Service.deleteFile(company.stampImage);
                const oldLocalPath = path.join(process.cwd(), company.stampImage);
                if (fs.existsSync(oldLocalPath)) {
                    fs.unlinkSync(oldLocalPath);
                }
            }
        } else {
            // Fallback: Local disk storage
            const uploadsDir = path.join(process.cwd(), 'uploads', 'stamps');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, file.buffer);

            // Delete old local file
            if (company.stampImage) {
                const oldLocalPath = path.join(process.cwd(), company.stampImage);
                if (fs.existsSync(oldLocalPath)) {
                    fs.unlinkSync(oldLocalPath);
                }
            }
        }

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
     * Загрузить подпись руководителя (PNG)
     */
    async uploadSignature(companyId: string, file: Express.Multer.File) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
        });
        if (!company) {
            throw new NotFoundException('Компания не найдена');
        }

        const filename = `signature_${companyId}_${Date.now()}.png`;
        const relativePath = `uploads/signatures/${filename}`;

        if (this.s3Service.isS3Enabled()) {
            // Upload to S3
            await this.s3Service.uploadFile(relativePath, file.buffer, file.mimetype);

            // Delete old file from S3 and local disk (for cleanup of legacy local files)
            if (company.signatureImage) {
                await this.s3Service.deleteFile(company.signatureImage);
                const oldLocalPath = path.join(process.cwd(), company.signatureImage);
                if (fs.existsSync(oldLocalPath)) {
                    fs.unlinkSync(oldLocalPath);
                }
            }
        } else {
            // Fallback: Local disk storage
            const uploadsDir = path.join(process.cwd(), 'uploads', 'signatures');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const filepath = path.join(uploadsDir, filename);
            fs.writeFileSync(filepath, file.buffer);

            // Delete old local file
            if (company.signatureImage) {
                const oldLocalPath = path.join(process.cwd(), company.signatureImage);
                if (fs.existsSync(oldLocalPath)) {
                    fs.unlinkSync(oldLocalPath);
                }
            }
        }

        await this.prisma.company.update({
            where: { id: companyId },
            data: { signatureImage: relativePath },
        });

        return { signatureImage: relativePath };
    }

    /**
     * Получить путь к подписи руководителя
     */
    async getSignaturePath(companyId: string): Promise<string | null> {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { signatureImage: true },
        });
        if (!company) {
            throw new NotFoundException('Компания не найдена');
        }
        return company.signatureImage;
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

    /**
     * Получить список отделов компании
     */
    async getDepartments(companyId: string) {
        return this.prisma.department.findMany({
            where: { companyId },
            include: {
                users: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        middleName: true,
                        role: true,
                        position: true,
                        email: true,
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
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    /**
     * Создать отдел
     */
    async createDepartment(companyId: string, name: string, parentDepartmentId?: string, icon?: string) {
        if (parentDepartmentId) {
            const parent = await this.prisma.department.findFirst({
                where: { id: parentDepartmentId, companyId },
            });
            if (!parent) {
                throw new NotFoundException('Родительский отдел не найден');
            }
        }

        return this.prisma.department.create({
            data: {
                name,
                companyId,
                parentDepartmentId: parentDepartmentId || null,
                icon: icon || 'FolderOpenOutlined',
            },
        });
    }

    /**
     * Обновить название отдела
     */
    async updateDepartment(companyId: string, id: string, name: string, icon?: string) {
        const dept = await this.prisma.department.findFirst({
            where: { id, companyId },
        });
        if (!dept) {
            throw new NotFoundException('Отдел не найден');
        }

        return this.prisma.department.update({
            where: { id },
            data: { 
                name,
                icon: icon || undefined
            },
        });
    }

    /**
     * Удалить отдел
     */
    async deleteDepartment(companyId: string, id: string) {
        const dept = await this.prisma.department.findFirst({
            where: { id, companyId },
        });
        if (!dept) {
            throw new NotFoundException('Отдел не найден');
        }

        await this.prisma.department.updateMany({
            where: { parentDepartmentId: id },
            data: { parentDepartmentId: dept.parentDepartmentId },
        });

        await this.prisma.user.updateMany({
            where: { departmentId: id, companyId },
            data: { departmentId: null },
        });

        return this.prisma.department.delete({
            where: { id },
        });
    }

    /**
     * Привязать сотрудника к отделу
     */
    async assignUserToDepartment(companyId: string, userId: string, departmentId: string | null) {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, companyId },
        });
        if (!user) {
            throw new NotFoundException('Сотрудник не найден');
        }

        if (departmentId) {
            const dept = await this.prisma.department.findFirst({
                where: { id: departmentId, companyId },
            });
            if (!dept) {
                throw new NotFoundException('Отдел не найден');
            }
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: { departmentId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                departmentId: true,
            },
        });
    }

    /**
     * Получить список транспорта компании
     */
    async getVehicles(companyId: string) {
        return this.prisma.vehicle.findMany({
            where: { companyId, isActive: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Создать транспорт
     */
    async createVehicle(companyId: string, data: { type: string; plate: string; model: string; trailerNumber?: string }) {
        return this.prisma.vehicle.create({
            data: {
                ...data,
                companyId,
                isActive: true,
            },
        });
    }

    /**
     * Обновить транспорт
     */
    async updateVehicle(companyId: string, id: string, data: Partial<{ type: string; plate: string; model: string; trailerNumber?: string }>) {
        const vehicle = await this.prisma.vehicle.findFirst({
            where: { id, companyId },
        });
        if (!vehicle) {
            throw new NotFoundException('Транспорт не найден');
        }

        return this.prisma.vehicle.update({
            where: { id },
            data,
        });
    }

    /**
     * Удалить/деактивировать транспорт
     */
    async deleteVehicle(companyId: string, id: string) {
        const vehicle = await this.prisma.vehicle.findFirst({
            where: { id, companyId },
        });
        if (!vehicle) {
            throw new NotFoundException('Транспорт не найден');
        }

        return this.prisma.vehicle.update({
            where: { id },
            data: { isActive: false },
        });
    }
}
