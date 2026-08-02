import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImportProviderGeographyDto } from './dto/import-provider-geography.dto';

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
            // С поиском двадцати достаточно: это подсказка при вводе, дальше
            // человек дописывает буквы. А вот без поиска обрезка до двадцати
            // была ошибкой — так справочник запрашивают, когда нужен ЦЕЛИКОМ:
            // список городов в админке платформы показывал двадцать записей
            // из сорока девяти, и остальные выглядели как несуществующие.
            // Потолок оставлен, чтобы разросшийся справочник не утянул
            // страницу за собой.
            take: search ? 20 : 1000,
            include: {
                country: true,
                region: true,
            },
        });
    }

    async importFromProvider(dto: ImportProviderGeographyDto) {
        const provider = dto.provider;
        const countryName = dto.country.name.trim();
        const countryCode = dto.country.code.trim().toUpperCase();
        const regionName = dto.region?.name.trim();
        const cityName = dto.city.name.trim();

        return this.prisma.$transaction(async (tx) => {
            const countryExternalLookup = dto.country.externalId
                ? [{ externalProvider: provider, externalId: dto.country.externalId }]
                : [];
            let country = await tx.country.findFirst({
                where: {
                    OR: [
                        { code: countryCode },
                        { name: countryName },
                        ...countryExternalLookup,
                    ],
                },
            });

            if (country) {
                if (!country.externalId && dto.country.externalId) {
                    country = await tx.country.update({
                        where: { id: country.id },
                        data: { externalProvider: provider, externalId: dto.country.externalId },
                    });
                }
            } else {
                country = await tx.country.create({
                    data: {
                        name: countryName,
                        code: countryCode,
                        externalProvider: dto.country.externalId ? provider : null,
                        externalId: dto.country.externalId || null,
                    },
                });
            }

            let region = null;
            if (regionName) {
                const regionExternalLookup = dto.region?.externalId
                    ? [{ externalProvider: provider, externalId: dto.region.externalId }]
                    : [];
                region = await tx.region.findFirst({
                    where: {
                        OR: [
                            { countryId: country.id, name: regionName },
                            ...regionExternalLookup,
                        ],
                    },
                });

                if (region) {
                    if (!region.externalId && dto.region?.externalId) {
                        region = await tx.region.update({
                            where: { id: region.id },
                            data: { externalProvider: provider, externalId: dto.region.externalId },
                        });
                    }
                } else {
                    region = await tx.region.create({
                        data: {
                            name: regionName,
                            countryId: country.id,
                            externalProvider: dto.region?.externalId ? provider : null,
                            externalId: dto.region?.externalId || null,
                        },
                    });
                }
            }

            const cityExternalLookup = dto.city.externalId
                ? [{ externalProvider: provider, externalId: dto.city.externalId }]
                : [];
            let city = await tx.city.findFirst({
                where: {
                    OR: [
                        {
                            countryId: country.id,
                            regionId: region?.id || null,
                            name: cityName,
                        },
                        ...cityExternalLookup,
                    ],
                },
            });

            if (city) {
                if (!city.externalId && dto.city.externalId) {
                    city = await tx.city.update({
                        where: { id: city.id },
                        data: { externalProvider: provider, externalId: dto.city.externalId },
                    });
                }
            } else {
                city = await tx.city.create({
                    data: {
                        name: cityName,
                        latitude: dto.latitude,
                        longitude: dto.longitude,
                        countryId: country.id,
                        regionId: region?.id || null,
                        externalProvider: dto.city.externalId ? provider : null,
                        externalId: dto.city.externalId || null,
                    },
                });
            }

            return { country, region, city };
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
