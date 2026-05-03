import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CargoTypesService {
    constructor(private readonly prisma: PrismaService) { }

    // Получить все категории с типами
    async findAll() {
        return this.prisma.cargoCategory.findMany({
            include: {
                types: {
                    orderBy: { sortOrder: 'asc' },
                },
            },
            orderBy: { sortOrder: 'asc' },
        });
    }

    // Создать категорию
    async createCategory(name: string) {
        return this.prisma.cargoCategory.create({
            data: { name },
        });
    }

    // Создать тип груза
    async createType(name: string, categoryId: string) {
        return this.prisma.cargoType.create({
            data: { name, categoryId },
        });
    }

    // Удалить тип
    async removeType(id: string) {
        return this.prisma.cargoType.delete({ where: { id } });
    }

    // Удалить категорию
    async removeCategory(id: string) {
        // Удаляем сначала типы
        await this.prisma.cargoType.deleteMany({ where: { categoryId: id } });
        return this.prisma.cargoCategory.delete({ where: { id } });
    }
}
