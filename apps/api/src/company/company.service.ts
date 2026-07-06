import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';
import { PaginationQueryDto, getPaginationParams } from '../common/dto/pagination.dto';
import { S3Service } from '../s3/s3.service';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';

const ROLE_LABELS_RU: Record<string, string> = {
    COMPANY_ADMIN: 'Администратор',
    LOGISTICIAN: 'Менеджер',
    ACCOUNTANT: 'Бухгалтер',
    WAREHOUSE_MANAGER: 'Заведующий складом',
    DRIVER: 'Водитель',
    FORWARDER: 'Экспедитор',
};

@Injectable()
export class CompanyService {
    constructor(
        private prisma: PrismaService,
        private s3Service: S3Service,
        private jwtService: JwtService,
        private redisService: RedisService,
        private emailService: EmailService,
    ) { }

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
        // Платформенного ADMIN нельзя назначить через приглашение компании
        if (role === UserRole.ADMIN) {
            throw new ForbiddenException('Недопустимая роль для приглашения');
        }

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

        // Автоматически отправляем письмо-приглашение (сбой почты не ломает создание)
        let emailSent = false;
        try {
            const company = await this.prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true },
            });
            const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
            const inviteLink = `${frontendUrl}/invite?token=${token}`;
            emailSent = await this.emailService.sendInvitationEmail(
                email,
                inviteLink,
                company?.name || 'LogiCore',
                ROLE_LABELS_RU[role] || role,
            );
        } catch (e) {
            console.warn('Invitation email failed:', e);
        }

        return { ...invitation, emailSent };
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

        const result = await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    email: data.email,
                    phone: data.phone,
                    passwordHash,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    role: data.role as UserRole,
                    companyId,
                },
            });

            await tx.userCompanyRelation.create({
                data: {
                    userId: user.id,
                    companyId,
                    role: data.role as UserRole,
                },
            });

            return user;
        });

        return {
            id: result.id,
            email: result.email,
            phone: result.phone,
            firstName: result.firstName,
            lastName: result.lastName,
            role: result.role,
        };
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

        const updated = await this.prisma.user.update({
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

        // Синхронизируем роль в связи с компанией — при логине JWT берёт роль из relation
        if (data.role) {
            await this.prisma.userCompanyRelation.upsert({
                where: { userId_companyId: { userId, companyId } },
                update: { role: data.role as UserRole },
                create: { userId, companyId, role: data.role as UserRole },
            });
        }

        return updated;
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
    async getCompanyOrders(companyId: string, query: PaginationQueryDto & { type?: string; mine?: string } = {}, userId?: string) {
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

        // «Мои заявки»: менеджер видит только заявки, где он ответственный или создатель
        if (query.mine === 'true' && userId) {
            where = {
                AND: [
                    where,
                    { OR: [{ responsibleManagerId: userId }, { customerId: userId }] },
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
        const vehicles = await this.prisma.vehicle.findMany({
            where: { companyId, isActive: true },
            orderBy: { createdAt: 'desc' },
        });

        const drivers = await this.prisma.user.findMany({
            where: {
                companyId,
                role: UserRole.DRIVER,
                isActive: true,
                vehiclePlate: { not: null },
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                vehiclePlate: true,
            },
        });

        // Map drivers to vehicles
        return vehicles.map(vehicle => {
            const driver = drivers.find(d => d.vehiclePlate === vehicle.plate);
            return {
                ...vehicle,
                driverId: driver?.id || null,
                driverName: driver ? `${driver.lastName} ${driver.firstName}`.trim() : null,
                driverPhone: driver?.phone || null,
            };
        });
    }

    /**
     * Создать транспорт
     */
    async createVehicle(companyId: string, data: { type: string; plate: string; model: string; trailerNumber?: string; driverId?: string }) {
        const { driverId, ...vehicleData } = data;
        const vehicle = await this.prisma.vehicle.create({
            data: {
                ...vehicleData,
                companyId,
                isActive: true,
            },
        });

        if (driverId) {
            // First, clear vehicle fields for any other driver who might have been assigned to this plate/vehicle
            await this.prisma.user.updateMany({
                where: {
                    companyId,
                    role: UserRole.DRIVER,
                    vehiclePlate: vehicle.plate,
                },
                data: {
                    vehicleType: null,
                    vehiclePlate: null,
                    vehicleModel: null,
                    trailerNumber: null,
                },
            });

            // Assign this vehicle to the selected driver
            await this.prisma.user.update({
                where: { id: driverId },
                data: {
                    vehicleType: vehicle.type,
                    vehiclePlate: vehicle.plate,
                    vehicleModel: vehicle.model,
                    trailerNumber: vehicle.trailerNumber || null,
                },
            });
        }

        return vehicle;
    }

    /**
     * Обновить транспорт
     */
    async updateVehicle(companyId: string, id: string, data: Partial<{ type: string; plate: string; model: string; trailerNumber?: string; driverId?: string | null }>) {
        const vehicle = await this.prisma.vehicle.findFirst({
            where: { id, companyId },
        });
        if (!vehicle) {
            throw new NotFoundException('Транспорт не найден');
        }

        const { driverId, ...vehicleData } = data;
        const oldPlate = vehicle.plate;

        const updatedVehicle = await this.prisma.vehicle.update({
            where: { id },
            data: vehicleData,
        });

        if (driverId !== undefined) {
            // Clear vehicle fields for any driver who was assigned to the old plate or the new plate
            await this.prisma.user.updateMany({
                where: {
                    companyId,
                    role: UserRole.DRIVER,
                    OR: [
                        { vehiclePlate: oldPlate },
                        { vehiclePlate: updatedVehicle.plate },
                    ],
                },
                data: {
                    vehicleType: null,
                    vehiclePlate: null,
                    vehicleModel: null,
                    trailerNumber: null,
                },
            });

            if (driverId) {
                // Assign to new driver
                await this.prisma.user.update({
                    where: { id: driverId },
                    data: {
                        vehicleType: updatedVehicle.type,
                        vehiclePlate: updatedVehicle.plate,
                        vehicleModel: updatedVehicle.model,
                        trailerNumber: updatedVehicle.trailerNumber || null,
                    },
                });
            }
        } else {
            // If vehicle details (plate, model, type, trailerNumber) changed,
            // update the driver currently assigned to this vehicle (matched by oldPlate)
            if (vehicleData.plate || vehicleData.model || vehicleData.type || vehicleData.trailerNumber !== undefined) {
                await this.prisma.user.updateMany({
                    where: {
                        companyId,
                        role: UserRole.DRIVER,
                        vehiclePlate: oldPlate,
                    },
                    data: {
                        vehiclePlate: vehicleData.plate !== undefined ? vehicleData.plate : undefined,
                        vehicleModel: vehicleData.model !== undefined ? vehicleData.model : undefined,
                        vehicleType: vehicleData.type !== undefined ? vehicleData.type : undefined,
                        trailerNumber: vehicleData.trailerNumber !== undefined ? (vehicleData.trailerNumber || null) : undefined,
                    },
                });
            }
        }

        return updatedVehicle;
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

        // Clear driver vehicle fields
        await this.prisma.user.updateMany({
            where: {
                companyId,
                role: UserRole.DRIVER,
                vehiclePlate: vehicle.plate,
            },
            data: {
                vehicleType: null,
                vehiclePlate: null,
                vehicleModel: null,
                trailerNumber: null,
            },
        });

        return this.prisma.vehicle.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * Получить все организации пользователя
     */
    async getMyCompanies(userId: string, activeCompanyId?: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { company: true },
        });

        const relations = await this.prisma.userCompanyRelation.findMany({
            where: { userId },
            include: { company: true },
        });
        
        const companies = relations.map(r => ({
            ...r.company,
            role: r.role,
        }));

        const ensureCompanyId = activeCompanyId || user?.companyId;

        if (ensureCompanyId && !companies.some(c => c.id === ensureCompanyId)) {
            const activeCompany = await this.prisma.company.findUnique({
                where: { id: ensureCompanyId }
            });
            if (activeCompany) {
                companies.push({
                    ...activeCompany,
                    role: user?.role || 'COMPANY_ADMIN',
                });
            }
        }

        return companies;
    }

    /**
     * Создать дополнительную организацию и привязать к текущему пользователю
     */
    async addMyCompany(userId: string, data: { companyName: string; bin: string }) {
        const existingCompanies = await this.prisma.company.findMany({
            where: { bin: data.bin },
        });
        const registeredCompany = existingCompanies.find(c => !c.isExternal);
        if (registeredCompany) {
            throw new BadRequestException('Компания с таким БИН уже зарегистрирована в системе');
        }

        const result = await this.prisma.$transaction(async (tx) => {
            const company = await tx.company.create({
                data: {
                    name: data.companyName,
                    bin: data.bin,
                    isOurCompany: false,
                    isExternal: false,
                },
            });

            await tx.userCompanyRelation.create({
                data: {
                    userId,
                    companyId: company.id,
                    role: UserRole.COMPANY_ADMIN,
                },
            });

            return company;
        });

        return result;
    }

    /**
     * Переключить текущую активную организацию
     */
    async switchCompany(userId: string, companyId: string) {
        const relation = await this.prisma.userCompanyRelation.findUnique({
            where: {
                userId_companyId: { userId, companyId },
            },
        });
        if (!relation) {
            throw new ForbiddenException('У вас нет доступа к этой организации');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { company: true },
        });
        if (!user) {
            throw new NotFoundException('Пользователь не найден');
        }

        const payload = {
            sub: user.id,
            email: user.email,
            role: relation.role,      // ← роль в этой конкретной компании
            companyId: companyId,     // ← активная компания только в JWT
        };

        const accessToken = this.jwtService.sign(payload);

        // Находим текущую сессию пользователя в БД, чтобы узнать deviceId
        const activeSession = await this.prisma.session.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        const deviceId = activeSession?.deviceId || 'web-browser';

        // Удаляем старые сессии пользователя
        await this.prisma.session.deleteMany({
            where: { userId },
        });

        // Создаем новую сессию
        const expiresIn = 60 * 60 * 24 * 7;
        await this.prisma.session.create({
            data: {
                userId,
                deviceId,
                token: accessToken,
                expiresAt: new Date(Date.now() + expiresIn * 1000),
            },
        });

        // Обновляем сессию в Redis
        try {
            await this.redisService.setSession(userId, deviceId, accessToken, expiresIn);
        } catch (e) {
            console.warn('Redis setSession failed in switchCompany:', e);
        }

        const activeCompany = await this.prisma.company.findUnique({
            where: { id: companyId }
        });

        const { passwordHash, ...userWithoutPassword } = user;
        return {
            user: {
                ...userWithoutPassword,
                companyId: companyId,
                role: relation.role,  // ← роль в этой конкретной компании
                company: activeCompany,
            },
            accessToken,
        };
    }

    /**
     * Удалить связь с организацией (или саму организацию)
     */
    async deleteCompany(userId: string, companyId: string) {
        // 1. Проверяем количество компаний пользователя
        const relations = await this.prisma.userCompanyRelation.findMany({
            where: { userId }
        });
        if (relations.length <= 1) {
            throw new BadRequestException('Нельзя удалить единственную организацию');
        }

        // 2. Удаляем связь
        await this.prisma.userCompanyRelation.delete({
            where: {
                userId_companyId: { userId, companyId }
            }
        });

        // 3. Если удаляемая компания была активной, переключаем на первую оставшуюся
        let newActiveCompanyId = null;
        let nextAccessToken = null;
        let nextUser = null;
        
        const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
        if (currentUser && currentUser.companyId === companyId) {
            const remaining = relations.filter(r => r.companyId !== companyId);
            newActiveCompanyId = remaining[0].companyId;
            
            const updatedUser = await this.prisma.user.update({
                where: { id: userId },
                data: { companyId: newActiveCompanyId },
                include: { company: true }
            });

            const payload = {
                sub: updatedUser.id,
                email: updatedUser.email,
                role: updatedUser.role,
                companyId: updatedUser.companyId,
            };
            nextAccessToken = this.jwtService.sign(payload);
            const { passwordHash, ...userWithoutPassword } = updatedUser;
            nextUser = {
                ...userWithoutPassword,
                companyId: updatedUser.companyId,
                role: updatedUser.role,
                company: updatedUser.company,
            };

            // Обновляем сессию в БД и Redis
            const activeSession = await this.prisma.session.findFirst({
                where: { userId },
                orderBy: { createdAt: 'desc' },
            });
            const deviceId = activeSession?.deviceId || 'web-browser';
            await this.prisma.session.deleteMany({ where: { userId } });
            const expiresIn = 60 * 60 * 24 * 7;
            await this.prisma.session.create({
                data: {
                    userId,
                    deviceId,
                    token: nextAccessToken,
                    expiresAt: new Date(Date.now() + expiresIn * 1000),
                },
            });
            try {
                await this.redisService.setSession(userId, deviceId, nextAccessToken, expiresIn);
            } catch (e) {
                console.warn('Redis setSession failed in deleteCompany:', e);
            }
        }

        return {
            switched: !!newActiveCompanyId,
            accessToken: nextAccessToken,
            user: nextUser
        };
    }

    /** Получить последние события (смены статусов) по заявкам компании — для живого тикера */
    async getOrderEvents(companyId: string, limit = 20) {
        const events = await this.prisma.orderStatusHistory.findMany({
            where: {
                order: {
                    OR: [
                        { customerCompanyId: companyId },
                        { forwarderId: companyId },
                        { partnerId: companyId },
                        { responsibleManager: { companyId } },
                    ],
                },
            },
            orderBy: { changedAt: 'desc' },
            take: limit,
            select: {
                id: true,
                status: true,
                changedAt: true,
                order: {
                    select: { id: true, orderNumber: true },
                },
            },
        });
        return events.map((e) => ({
            orderId: e.order.id, orderNumber: e.order.orderNumber,
            status: e.status, changedAt: e.changedAt.toISOString(),
        }));
    }

    /** Заявки компании, ожидающие подтверждения завершения */
    async getPendingConfirmations(companyId: string) {
        const orders = await this.prisma.order.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { customerCompanyId: companyId },
                            { forwarderId: companyId },
                            { partnerId: companyId },
                            { responsibleManager: { companyId } },
                        ],
                    },
                    { pendingStatus: { not: null } },
                ],
            },
            orderBy: { pendingStatusAt: 'desc' },
            take: 10,
            select: { id: true, orderNumber: true, pendingStatus: true, pendingStatusAt: true },
        });
        return orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, pendingStatus: o.pendingStatus, pendingStatusAt: o.pendingStatusAt?.toISOString() || null }));
    }

    /** Глобальный поиск: заявки по номеру + контрагенты по названию */
    async globalSearch(companyId: string, q: string) {
        const orderWhere = {
            AND: [
                {
                    OR: [
                        { customerCompanyId: companyId },
                        { forwarderId: companyId },
                        { partnerId: companyId },
                        { responsibleManager: { companyId } },
                    ],
                },
                { orderNumber: { contains: q, mode: 'insensitive' as const } },
            ],
        };

        const [orders, partnerIds] = await Promise.all([
            this.prisma.order.findMany({
                where: orderWhere,
                take: 7,
                orderBy: { createdAt: 'desc' },
                select: { id: true, orderNumber: true, status: true, customerCompany: { select: { name: true } } },
            }),
            this.prisma.partnership.findMany({
                where: {
                    OR: [{ requesterId: companyId }, { recipientId: companyId }],
                    status: 'ACCEPTED',
                },
                select: { requesterId: true, recipientId: true },
            }),
        ]);

        const companyIds = partnerIds.map((p) => (p.requesterId === companyId ? p.recipientId : p.requesterId));

        const partners = companyIds.length > 0 ? await this.prisma.company.findMany({
            where: { id: { in: companyIds }, name: { contains: q, mode: 'insensitive' }, isActive: true },
            take: 7, select: { id: true, name: true, isCustomer: true, isCarrier: true },
        }) : [];

        return { orders: orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, customerName: o.customerCompany?.name || null })), partners };
    }
}