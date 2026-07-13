import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PartnershipStatus } from '@prisma/client';

@Injectable()
export class LocationsService {
    constructor(private prisma: PrismaService, private redis: RedisService) { }

    /**
     * Проверка: к какой компании можно привязывать адрес.
     * Разрешено: своя компания, подтверждённый партнёр, свой внешний контрагент.
     */
    private async assertCompanyLinkAllowed(
        targetCompanyId?: string | null,
        user?: { role: string; companyId?: string },
    ) {
        if (!targetCompanyId || !user || user.role === 'ADMIN') return;
        if (targetCompanyId === user.companyId) return;
        if (!user.companyId) {
            throw new ForbiddenException('Нет доступа к этой компании');
        }

        const target = await this.prisma.company.findUnique({
            where: { id: targetCompanyId },
            select: { isExternal: true, createdByCompanyId: true },
        });
        if (!target) throw new NotFoundException('Компания не найдена');
        if (target.isExternal && target.createdByCompanyId === user.companyId) return;

        const partnership = await this.prisma.partnership.findFirst({
            where: {
                status: PartnershipStatus.ACCEPTED,
                OR: [
                    { requesterId: user.companyId, recipientId: targetCompanyId },
                    { requesterId: targetCompanyId, recipientId: user.companyId },
                ],
            },
            select: { id: true },
        });
        if (!partnership) {
            throw new ForbiddenException('Нет доступа: компания не является вашим партнёром или контрагентом');
        }
    }

    async create(data: {
        name: string;
        address: string;
        latitude: number;
        longitude: number;
        contactName?: string;
        contactPhone?: string;
        notes?: string;
        createdById?: string;
        city?: string;
        companyId?: string;
        emails?: string;
    }, user?: { sub: string; role: string; companyId?: string }) {
        await this.assertCompanyLinkAllowed(data.companyId, user);
        try {
            // Explicitly select fields to avoid passing unknown args (like countryId, regionId) to Prisma
            const {
                name, address, latitude, longitude,
                contactName, contactPhone, notes, createdById,
                city, companyId, emails
            } = data as any;

            const location = await this.prisma.location.create({
                data: {
                    name,
                    address,
                    latitude: Number(latitude),
                    longitude: Number(longitude),
                    contactName,
                    contactPhone,
                    notes,
                    createdById,
                    city: city || null,
                    companyId: companyId || null,
                    emails: emails || null,
                }
            });
            await this.redis.delByPattern('locations:*');
            return location;
        } catch (error: any) {
            console.error('Failed to create location in DB:', error);
            throw new ConflictException('Не удалось создать адрес. Проверьте данные и попробуйте ещё раз.');
        }
    }

    async findAll(search?: string, companyId?: string) {
        const cacheKey = companyId ? `locations:${companyId}` : 'locations:all';
        if (!search) {
            const cached = await this.redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        }

        const whereConditions: any[] = [];
        if (search) {
            whereConditions.push({
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { address: { contains: search, mode: 'insensitive' } },
                ],
            });
        }
        if (companyId) {
            // Сотрудники компании, чтобы показывать созданные ими точки
            // независимо от привязки (например, склад контрагента)
            const companyUsers = await this.prisma.user.findMany({
                where: { companyId },
                select: { id: true },
            });
            const companyUserIds = companyUsers.map(u => u.id);

            whereConditions.push({
                OR: [
                    { companyId },
                    { companyId: null }, // Общие адреса без привязки к компании
                    // Точки, привязанные к внешним контрагентам компании
                    { company: { isExternal: true, createdByCompanyId: companyId } },
                    // Точки, созданные сотрудниками компании (привязанные к партнёрам)
                    ...(companyUserIds.length ? [{ createdById: { in: companyUserIds } }] : []),
                ],
            });
        }

        const where = whereConditions.length > 0
            ? { AND: whereConditions }
            : undefined;

        const data = await this.prisma.location.findMany({
            where,
            include: {
                company: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: { name: 'asc' },
        });

        if (!search) {
            await this.redis.set(cacheKey, JSON.stringify(data), 3600);
        }
        return data;
    }

    async findById(id: string, user?: { sub: string; role: string; companyId?: string }) {
        const location = await this.prisma.location.findUnique({ 
            where: { id },
            include: {
                company: {
                    select: { id: true, name: true }
                }
            }
        });

        if (!location) throw new NotFoundException('Адрес не найден');

        // Проверка доступа: ADMIN всегда проходит; остальные — владелец или создатель
        if (user && user.role !== 'ADMIN') {
            const isOwner = location.companyId === user.companyId;
            let isCreator = false;
            if (location.createdById) {
                const creator = await this.prisma.user.findUnique({
                    where: { id: location.createdById },
                    select: { companyId: true },
                });
                isCreator = creator?.companyId === user.companyId;
            }
            if (!isOwner && !isCreator) {
                throw new ForbiddenException('Нет доступа к этому адресу');
            }
        }

        return location;
    }

    async update(id: string, data: Partial<{
        name: string;
        address: string;
        latitude: number;
        longitude: number;
        contactName: string;
        contactPhone: string;
        notes: string;
        city: string | null;
        companyId: string | null;
        emails: string | null;
    }>, user?: { sub: string; role: string; companyId?: string }) {
        // Проверка доступа
        if (user && user.role !== 'ADMIN') {
            const location = await this.prisma.location.findUnique({ where: { id }, select: { companyId: true, createdById: true } });
            if (!location) throw new NotFoundException('Адрес не найден');
            const isOwner = location.companyId === user.companyId;
            let isCreator = false;
            if (location.createdById) {
                const creator = await this.prisma.user.findUnique({ where: { id: location.createdById }, select: { companyId: true } });
                isCreator = creator?.companyId === user.companyId;
            }
            if (!isOwner && !isCreator) {
                throw new ForbiddenException('Нет доступа к этому адресу');
            }
        }

        if (data.companyId) {
            await this.assertCompanyLinkAllowed(data.companyId, user);
        }

        try {
            const {
                name, address, latitude, longitude,
                contactName, contactPhone, notes,
                city, companyId, emails
            } = data as any;

            const updateData: any = {};
            if (name !== undefined) updateData.name = name;
            if (address !== undefined) updateData.address = address;
            if (latitude !== undefined) updateData.latitude = Number(latitude);
            if (longitude !== undefined) updateData.longitude = Number(longitude);
            if (contactName !== undefined) updateData.contactName = contactName;
            if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
            if (notes !== undefined) updateData.notes = notes;
            if (city !== undefined) updateData.city = city || null;
            if (companyId !== undefined) updateData.companyId = companyId || null;
            if (emails !== undefined) updateData.emails = emails || null;
            
            const updated = await this.prisma.location.update({ 
                where: { id }, 
                data: updateData 
            });
            await this.redis.delByPattern('locations:*');
            return updated;
        } catch (error: any) {
            console.error('Failed to update location in DB:', error);
            throw new ConflictException('Не удалось изменить адрес. Проверьте данные и попробуйте ещё раз.');
        }
    }

    async delete(id: string, user?: { sub: string; role: string; companyId?: string }) {
        // Проверка доступа
        if (user && user.role !== 'ADMIN') {
            const location = await this.prisma.location.findUnique({ where: { id }, select: { companyId: true, createdById: true } });
            if (!location) throw new NotFoundException('Адрес не найден');
            const isOwner = location.companyId === user.companyId;
            let isCreator = false;
            if (location.createdById) {
                const creator = await this.prisma.user.findUnique({ where: { id: location.createdById }, select: { companyId: true } });
                isCreator = creator?.companyId === user.companyId;
            }
            if (!isOwner && !isCreator) {
                throw new ForbiddenException('Нет доступа к этому адресу');
            }
        }

        // Check for dependencies before deletion to prevent Foreign Key errors
        const usedInOrder = await this.prisma.orderRoutePoint.count({ where: { locationId: id } });
        if (usedInOrder > 0) {
            throw new ConflictException('Невозможно удалить локацию: она используется в маршрутах заявок.');
        }

        const usedInWarehouse = await this.prisma.warehouseGate.count({ where: { locationId: id } });
        if (usedInWarehouse > 0) {
            throw new ConflictException('Невозможно удалить локацию: она привязана к складским воротам.');
        }

        const deleted = await this.prisma.location.delete({ where: { id } });
        await this.redis.delByPattern('locations:*');
        return deleted;
    }
}