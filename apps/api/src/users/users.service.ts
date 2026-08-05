import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Убрать из записи то, что не должно уезжать клиенту.
 *
 * Хеш пароля уходил в ответ на правку профиля и на список пользователей.
 * Сам по себе он не пароль, но это материал для подбора в открытом виде —
 * в ответе API ему делать нечего.
 */
function withoutSecrets<T extends { passwordHash?: string | null }>(user: T): Omit<T, 'passwordHash'>;
function withoutSecrets(user: null): null;
function withoutSecrets(user: any): any {
    if (!user) return user;
    const { passwordHash, ...rest } = user;
    return rest;
}

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService, private s3Service: S3Service) { }

    // ==================== Фото профиля ====================

    /**
     * Загрузить фото профиля. Каждый пользователь меняет только своё фото —
     * userId всегда берётся из JWT, а не из запроса.
     */
    async uploadAvatar(userId: string, file: Express.Multer.File) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('Пользователь не найден');
        }

        const filename = `avatar_${userId}_${Date.now()}.png`;
        const relativePath = `uploads/avatars/${filename}`;

        if (this.s3Service.isS3Enabled()) {
            await this.s3Service.uploadFile(relativePath, file.buffer, file.mimetype);

            if (user.avatarPath) {
                await this.s3Service.deleteFile(user.avatarPath);
                const oldLocalPath = path.join(process.cwd(), user.avatarPath);
                if (fs.existsSync(oldLocalPath)) {
                    fs.unlinkSync(oldLocalPath);
                }
            }
        } else {
            const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);

            if (user.avatarPath) {
                const oldLocalPath = path.join(process.cwd(), user.avatarPath);
                if (fs.existsSync(oldLocalPath)) {
                    fs.unlinkSync(oldLocalPath);
                }
            }
        }

        await this.prisma.user.update({
            where: { id: userId },
            data: { avatarPath: relativePath },
        });

        return { avatarPath: relativePath };
    }

    /**
     * Путь к фото профиля с проверкой доступа: своё фото, фото коллеги из
     * своей компании или водителя своего внешнего перевозчика; ADMIN — любое.
     */
    async getAvatarPathFor(
        targetUserId: string,
        requester: { sub: string; role: string; companyId?: string },
    ): Promise<string | null> {
        const target = await this.prisma.user.findUnique({
            where: { id: targetUserId },
            select: { avatarPath: true, companyId: true },
        });
        if (!target) {
            throw new NotFoundException('Пользователь не найден');
        }

        if (targetUserId !== requester.sub && requester.role !== 'ADMIN') {
            let hasAccess = !!requester.companyId && target.companyId === requester.companyId;
            if (!hasAccess && requester.companyId && target.companyId) {
                const targetCompany = await this.prisma.company.findUnique({
                    where: { id: target.companyId },
                    select: { isExternal: true, createdByCompanyId: true },
                });
                hasAccess = !!targetCompany?.isExternal && targetCompany.createdByCompanyId === requester.companyId;
            }
            if (!hasAccess) {
                throw new ForbiddenException('Нет доступа к этому фото');
            }
        }

        return target.avatarPath;
    }

    async create(data: {
        phone: string;
        email?: string;
        password?: string;
        firstName: string;
        lastName: string;
        middleName?: string;
        role: UserRole;
        vehiclePlate?: string;
        vehicleModel?: string;
        companyId?: string;
    }) {
        const passwordHash = data.password
            ? await bcrypt.hash(data.password, 12)
            : null;

        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    phone: data.phone,
                    email: data.email,
                    passwordHash,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    middleName: data.middleName,
                    role: data.role,
                    vehiclePlate: data.vehiclePlate,
                    vehicleModel: data.vehicleModel,
                    companyId: data.companyId,
                },
            });

            if (data.companyId) {
                await tx.userCompanyRelation.create({
                    data: {
                        userId: user.id,
                        companyId: data.companyId,
                        role: data.role,
                    },
                });
            }

            return withoutSecrets(user);
        });
    }

    async findAll(filters?: { role?: UserRole; isActive?: boolean }) {
        const users = await this.prisma.user.findMany({
            where: {
                role: filters?.role,
                isActive: filters?.isActive,
            },
            include: { company: true },
            orderBy: { createdAt: 'desc' },
        });
        return users.map((user) => withoutSecrets(user));
    }

    async findById(id: string) {
        return withoutSecrets(await this.prisma.user.findUnique({
            where: { id },
            include: { company: true },
        }) as any);
    }

    /**
     * Запись вместе с хешем пароля — только для сверки текущего пароля при
     * его смене. Наружу такая запись не отдаётся: для ответов есть findById.
     */
    async findForPasswordCheck(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
            select: { id: true, passwordHash: true },
        });
    }

    async findByPhone(phone: string) {
        return this.prisma.user.findFirst({
            where: { phone },
        });
    }

    async findDrivers(companyId?: string) {
        const where: any = { role: 'DRIVER', isActive: true };
        if (companyId) {
            where.companyId = companyId;
        }
        const drivers = await this.prisma.user.findMany({
            where,
            orderBy: { lastName: 'asc' },
        });
        return drivers.map((driver) => withoutSecrets(driver));
    }

    /**
     * Правка пользователя администратором.
     *
     * Поля перечислены руками: раньше сюда уходил объект запроса целиком, и
     * присланный клиентом `password` доходил до базы как несуществующая
     * колонка — правка падала пятисоткой вместо того, чтобы сменить пароль.
     */
    async update(id: string, data: Partial<{
        firstName: string;
        lastName: string;
        middleName: string;
        email: string;
        phone: string;
        vehiclePlate: string;
        vehicleModel: string;
        isActive: boolean;
        role: UserRole;
        password: string;
    }>) {
        return withoutSecrets(await this.prisma.user.update({
            where: { id },
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                middleName: data.middleName,
                email: data.email,
                phone: data.phone,
                vehiclePlate: data.vehiclePlate,
                vehicleModel: data.vehicleModel,
                isActive: data.isActive,
                role: data.role,
                passwordHash: data.password ? await bcrypt.hash(data.password, 12) : undefined,
            },
        }));
    }

    /**
     * Правка своего профиля.
     *
     * Поля перечислены руками, а не берутся из запроса целиком: раньше сюда
     * уходило всё, что прислал клиент, и водитель одним запросом делал себя
     * администратором платформы или переезжал в чужую компанию. Роль,
     * компания, пароль и признак активности сюда не попадают никогда — их
     * меняет только администратор через свои эндпоинты.
     */
    async updateProfile(userId: string, data: {
        firstName?: string;
        lastName?: string;
        middleName?: string;
        email?: string;
        phone?: string;
        vehiclePlate?: string;
        vehicleModel?: string;
    }) {
        return this.update(userId, {
            firstName: data.firstName,
            lastName: data.lastName,
            middleName: data.middleName,
            email: data.email,
            phone: data.phone,
            vehiclePlate: data.vehiclePlate,
            vehicleModel: data.vehicleModel,
        });
    }

    async updatePassword(id: string, newPassword: string) {
        const passwordHash = await bcrypt.hash(newPassword, 12);
        return withoutSecrets(await this.prisma.user.update({
            where: { id },
            data: { passwordHash },
        }));
    }

    async deactivate(id: string) {
        return withoutSecrets(await this.prisma.user.update({
            where: { id },
            data: { isActive: false },
        }));
    }

    async resetDeviceBinding(userId: string) {
        // Удаляем все сессии пользователя
        await this.prisma.session.deleteMany({
            where: { userId },
        });
    }
}