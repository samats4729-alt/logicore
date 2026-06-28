import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LocationsService {
    constructor(private prisma: PrismaService, private redis: RedisService) { }

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
    }) {
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
            await this.redis.del('locations:all');
            return location;
        } catch (error: any) {
            console.error('Failed to create location in DB:', error);
            throw new ConflictException(`Ошибка базы данных при создании адреса: ${error.message || error}`);
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
            whereConditions.push({
                OR: [
                    { companyId },
                    { companyId: null }, // Общие адреса без привязки к компании
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

    async findById(id: string) {
        return this.prisma.location.findUnique({ 
            where: { id },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
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
    }>) {
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
            await this.redis.del('locations:all');
            return updated;
        } catch (error: any) {
            console.error('Failed to update location in DB:', error);
            throw new ConflictException(`Ошибка базы данных при изменении адреса: ${error.message || error}`);
        }
    }

    async delete(id: string) {
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
        await this.redis.del('locations:all');
        return deleted;
    }
}
