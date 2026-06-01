import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CargoTypesService {
    constructor(private readonly prisma: PrismaService, private redis: RedisService) { }

    // Получить все категории с типами
    async findAll() {
        const cached = await this.redis.get('cargo-types:all');
        if (cached) return JSON.parse(cached);

        const data = await this.prisma.cargoCategory.findMany({
            include: {
                types: {
                    orderBy: { sortOrder: 'asc' },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });

        await this.redis.set('cargo-types:all', JSON.stringify(data), 3600); // cache for 1 hour
        return data;
    }

    // Создать категорию
    async createCategory(name: string) {
        const res = await this.prisma.cargoCategory.create({ data: { name } });
        await this.redis.del('cargo-types:all');
        return res;
    }

    // Создать тип груза
    async createType(name: string, categoryId: string) {
        const res = await this.prisma.cargoType.create({ data: { name, categoryId } });
        await this.redis.del('cargo-types:all');
        return res;
    }

    // Удалить тип
    async removeType(id: string) {
        const res = await this.prisma.cargoType.delete({ where: { id } });
        await this.redis.del('cargo-types:all');
        return res;
    }

    // Удалить категорию
    async removeCategory(id: string) {
        // Удаляем сначала типы
        await this.prisma.cargoType.deleteMany({ where: { categoryId: id } });
        const res = await this.prisma.cargoCategory.delete({ where: { id } });
        await this.redis.del('cargo-types:all');
        return res;
    }
}
