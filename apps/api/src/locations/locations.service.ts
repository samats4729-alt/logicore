import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PartnershipStatus } from '@prisma/client';

/** Пустое значение координаты — это отсутствие точки, а не ноль. */
export function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Строка адреса из частей.
 *
 * Печатается в договоре-заявке и доверенности, поэтому собирается по порядку
 * «страна, область, город, улица, дом» и без пустых мест: у половины адресов
 * области нет, а «Казахстан, , Алматы» в документе выглядит браком.
 *
 * Готовая строка, если её прислали, важнее собранной: адрес мог прийти из
 * подсказки геокодера целиком, и разбирать его обратно незачем.
 */
export function composeAddress(
    address: string | undefined | null,
    parts: { country?: string; region?: string; city?: string; street?: string; house?: string },
): string {
    if (address && address.trim()) return address.trim();
    const street = [parts.street, parts.house].map((p) => p?.trim()).filter(Boolean).join(' ');
    return [parts.country, parts.region, parts.city, street]
        .map((p) => p?.trim())
        .filter(Boolean)
        .join(', ');
}

/** Что записать в координаты: точку человека, точку геокодера или пусто. */
export function coordinateFields(
    latitude: unknown,
    longitude: unknown,
    manual?: boolean,
): { latitude: number | null; longitude: number | null; coordinatesManual: boolean } {
    const lat = numberOrNull(latitude);
    const lng = numberOrNull(longitude);
    // Одна координата без второй — это не точка, а половина ошибки.
    const hasPoint = lat !== null && lng !== null;
    return {
        latitude: hasPoint ? lat : null,
        longitude: hasPoint ? lng : null,
        coordinatesManual: hasPoint ? Boolean(manual) : false,
    };
}

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
        address?: string;
        latitude?: number | null;
        longitude?: number | null;
        coordinatesManual?: boolean;
        country?: string;
        region?: string;
        street?: string;
        house?: string;
        contactName?: string;
        contactPhone?: string;
        notes?: string;
        createdById?: string;
        city?: string;
        cityId?: string;
        companyId?: string;
        emails?: string;
    }, user?: { sub: string; role: string; companyId?: string }) {
        await this.assertCompanyLinkAllowed(data.companyId, user);
        try {
            // Explicitly select fields to avoid passing unknown args (like countryId, regionId) to Prisma
            const {
                name, address, latitude, longitude, coordinatesManual,
                country, region, street, house,
                contactName, contactPhone, notes, createdById,
                city, cityId, companyId, emails
            } = data as any;

            const parts = { country, region, city, street, house };
            const location = await this.prisma.location.create({
                data: {
                    name,
                    address: composeAddress(address, parts),
                    ...coordinateFields(latitude, longitude, coordinatesManual),
                    country: country || null,
                    region: region || null,
                    street: street || null,
                    house: house || null,
                    contactName,
                    contactPhone,
                    notes,
                    createdById,
                    city: city || null,
                    cityId: cityId || null,
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

        const rows = await this.prisma.location.findMany({
            where,
            include: {
                company: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                cityRecord: {
                    include: { country: true, region: true },
                },
            },
            orderBy: { name: 'asc' },
        });

        // Свой список почт компании перекрывает тот, что записан в самом
        // адресе: у общего склада контакты у каждого свои, и подставлять
        // в рассылку доверенности надо именно их.
        const data = companyId ? await this.withCompanyEmails(rows, companyId) : rows;

        if (!search) {
            await this.redis.set(cacheKey, JSON.stringify(data), 3600);
        }
        return data;
    }

    /** Подменяет `emails` на список этой компании там, где он заведён. */
    private async withCompanyEmails<T extends { id: string; emails?: string | null }>(
        rows: T[],
        companyId: string,
    ): Promise<T[]> {
        if (!rows.length) return rows;
        const lists = await this.prisma.locationEmailList.findMany({
            where: { companyId, locationId: { in: rows.map(r => r.id) } },
            select: { locationId: true, emails: true },
        });
        if (!lists.length) return rows;
        const own = new Map(lists.map(l => [l.locationId, l.emails]));
        return rows.map(r => (own.has(r.id) ? { ...r, emails: own.get(r.id) ?? null } : r));
    }

    /**
     * Записать свой список почт для адреса.
     *
     * Права владельца адреса здесь не проверяем: компания правит собственный
     * список, а не чужой справочник. Иначе менеджер не смог бы вписать почту
     * общему складу — а это ровно тот случай, ради которого список и заведён.
     */
    async setEmails(locationId: string, companyId: string, emails: string) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
            select: { id: true },
        });
        if (!location) throw new NotFoundException('Адрес не найден');

        const value = emails
            .split(',')
            .map(e => e.trim())
            .filter(Boolean)
            .join(',');

        const saved = await this.prisma.locationEmailList.upsert({
            where: { locationId_companyId: { locationId, companyId } },
            create: { locationId, companyId, emails: value },
            update: { emails: value },
        });
        // Сбрасываем весь кэш адресов, как это делают создание и правка. Точечный
        // ключ компании пропускал список администратора (`locations:all`), и там
        // почты оставались прежними ещё час.
        await this.redis.delByPattern('locations:*');
        return saved;
    }

    async findById(id: string, user?: { sub: string; role: string; companyId?: string }) {
        const location = await this.prisma.location.findUnique({ 
            where: { id },
            include: {
                company: {
                    select: { id: true, name: true }
                },
                cityRecord: {
                    include: { country: true, region: true },
                },
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
        latitude: number | null;
        longitude: number | null;
        coordinatesManual: boolean;
        country: string | null;
        region: string | null;
        street: string | null;
        house: string | null;
        contactName: string;
        contactPhone: string;
        notes: string;
        city: string | null;
        cityId: string | null;
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
                name, address, latitude, longitude, coordinatesManual,
                country, region, street, house,
                contactName, contactPhone, notes,
                city, cityId, companyId, emails
            } = data as any;

            const updateData: any = {};
            if (name !== undefined) updateData.name = name;
            if (address !== undefined) updateData.address = address;
            if (country !== undefined) updateData.country = country || null;
            if (region !== undefined) updateData.region = region || null;
            if (street !== undefined) updateData.street = street || null;
            if (house !== undefined) updateData.house = house || null;
            // Пустые координаты — это «убрать точку», а не «не менять»: человек
            // мог стереть ошибочную. Number(null) даёт ноль, то есть точку в
            // Гвинейском заливе, поэтому пустое приводим к null явно.
            if (latitude !== undefined) updateData.latitude = numberOrNull(latitude);
            if (longitude !== undefined) updateData.longitude = numberOrNull(longitude);
            if (coordinatesManual !== undefined) updateData.coordinatesManual = Boolean(coordinatesManual);
            // Поставили точку руками — прежняя неудача поиска больше не в счёт.
            if (numberOrNull(latitude) !== null) updateData.geocodeFailedAt = null;
            if (contactName !== undefined) updateData.contactName = contactName;
            if (contactPhone !== undefined) updateData.contactPhone = contactPhone;
            if (notes !== undefined) updateData.notes = notes;
            if (city !== undefined) updateData.city = city || null;
            if (cityId !== undefined) updateData.cityId = cityId || null;
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
