import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationsService {
    constructor(private prisma: PrismaService) { }

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

        return this.prisma.location.create({
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
    }

    async findAll(search?: string) {
        return this.prisma.location.findMany({
            where: search ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { address: { contains: search, mode: 'insensitive' } },
                ],
            } : undefined,
            orderBy: { name: 'asc' },
        });
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
        return this.prisma.location.update({ where: { id }, data });
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

        return this.prisma.location.delete({ where: { id } });
    }
}
