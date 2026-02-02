import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CitiesService {
    constructor(private prisma: PrismaService) { }

    async create(data: { name: string; latitude: number; longitude: number; countryId: string; regionId?: string }) {
        return this.prisma.city.create({
            data,
        });
    }

    async getCountries() {
        // Casting to any to allow compilation while Prisma types update
        return (this.prisma as any).country.findMany({
            orderBy: { name: 'asc' },
        });
    }

    async getRegions(countryId: string) {
        return (this.prisma as any).region.findMany({
            where: { countryId },
            orderBy: { name: 'asc' },
        });
    }

    async findAll(search?: string, regionId?: string) {
        const where: any = {
            AND: [],
        };

        if (search) {
            where.AND.push({ name: { contains: search, mode: 'insensitive' } });
        }
        if (regionId) {
            where.AND.push({ regionId });
        }

        return this.prisma.city.findMany({
            where,
            orderBy: { name: 'asc' },
            take: 20,
            include: {
                country: true,
            },
        });
    }

    async remove(id: string) {
        return this.prisma.city.delete({
            where: { id },
        });
    }

    // --- Country CRUD ---
    async createCountry(data: { name: string; code: string }) {
        return this.prisma.country.create({ data });
    }

    async updateCountry(id: string, data: { name?: string; code?: string }) {
        return this.prisma.country.update({ where: { id }, data });
    }

    async deleteCountry(id: string) {
        return this.prisma.country.delete({ where: { id } });
    }

    // --- Region CRUD ---
    async createRegion(data: { name: string; countryId: string }) {
        return this.prisma.region.create({ data });
    }

    async updateRegion(id: string, data: { name?: string }) {
        return this.prisma.region.update({ where: { id }, data });
    }

    async deleteRegion(id: string) {
        return this.prisma.region.delete({ where: { id } });
    }
}
