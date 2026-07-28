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

        // Пустой справочник не кэшируем.
        //
        // Виды груза заполняются отдельным наполнением базы. Если запрос
        // пришёл раньше него, в кэш ложился пустой список — и целый час
        // каждый, кто открывал мастер заявки, видел пустой список в поле
        // «Характер груза». Поле обязательное, подпись обещает выбор из
        // списка, а выбирать не из чего. Само проходило через час, поэтому
        // выглядело как случайный глюк.
        //
        // Справочник пустым быть не должен. Пустой ответ — признак того, что
        // данные ещё не готовы, а не результат, который стоит запоминать.
        if (data.length) {
            await this.redis.set('cargo-types:all', JSON.stringify(data), 3600);
        }
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
