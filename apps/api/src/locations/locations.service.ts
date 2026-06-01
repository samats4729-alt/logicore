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
    }) {
        // Explicitly select fields to avoid passing unknown args (like countryId, regionId) to Prisma
        const {
            name, address, latitude, longitude,
            contactName, contactPhone, notes, createdById,
            city
        } = data as any;

        const location = await this.prisma.location.create({
            data: {
                name,
                address,
                latitude,
                longitude,
                contactName,
                contactPhone,
                notes,
                createdById,
                city: city || null,
            }
        });
        await this.redis.del('locations:all');
        return location;
    }

    async findAll(search?: string) {
        if (!search) {
            const cached = await this.redis.get('locations:all');
            if (cached) return JSON.parse(cached);
        }

        const data = await this.prisma.location.findMany({
            where: search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { address: { contains: search, mode: 'insensitive' } },
                ],
            } : undefined,
            orderBy: { name: 'asc' },
        });

        if (!search) {
            await this.redis.set('locations:all', JSON.stringify(data), 3600); // cache for 1 hour
        }
        return data;
    }

    async findById(id: string) {
        return this.prisma.location.findUnique({ where: { id } });
    }

    async update(id: string, data: Partial<{
        name: string;
        address: string;
        latitude: number;
        longitude: number;
        contactName: string;
        contactPhone: string;
        notes: string;
    }>) {
        const updated = await this.prisma.location.update({ where: { id }, data });
        await this.redis.del('locations:all');
        return updated;
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
