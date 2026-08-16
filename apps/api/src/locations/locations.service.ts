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

/** Приставки, которые ничего не добавляют к названию места. */
/* Длинные впереди коротких: иначе «г» срабатывает раньше «город». */
const CITY_PREFIXES = ['город', 'станция', 'посёлок', 'поселок', 'село', 'қала', 'гор', 'пос', 'аул', 'ст', 'қ', 'г', 'п', 'с'];
const HOUSE_PREFIXES = ['здание', 'дом', 'зд', 'д'];

/**
 * Привести часть адреса в порядок.
 *
 * Люди пишут как придётся: «МАМЕДОВА», «г.Шардара», «  дом 2 ». В договоре
 * это выглядит неряшливо, а в поиске мешает: «Шардара» и «г. Шардара» —
 * для геокодера разные строки.
 *
 * Правки только безопасные. Приставку снимаем у города и дома — она
 * никогда не бывает частью имени. У улицы не трогаем ничего: «проспект
 * Абая» и «улица Абая» в одном городе — разные улицы, и выкинуть слово
 * значит перепутать адрес. Заглавные приводим к обычному виду, только
 * если слово написано капсом целиком и длиннее трёх букв: «АЗС» и «ТЭЦ»
 * остаются как есть.
 */
export function tidyAddressPart(
    value: string | null | undefined,
    kind: 'country' | 'region' | 'city' | 'street' | 'house' = 'city',
): string | null {
    if (value === null || value === undefined) return null;

    let result = String(value).replace(/\s+/g, ' ').trim();
    result = result.replace(/^[.,;\s]+|[.,;\s]+$/g, '').trim();
    if (!result) return null;

    const prefixes = kind === 'house' ? HOUSE_PREFIXES : kind === 'city' ? CITY_PREFIXES : [];
    for (const prefix of prefixes) {
        // Отделитель обязателен — точка или пробел. Без него «д» откусывало
        // первую букву у «дом 2» и оставляло «ом 2»: приставка обязана быть
        // отдельным словом, а не началом другого.
        const match = new RegExp(`^${prefix}(?:\\.\\s*|\\s+)(?=\\S)`, 'i').exec(result);
        if (match && match[0].length < result.length) {
            result = result.slice(match[0].length).trim();
            break;
        }
    }

    if (kind !== 'house') result = fixShouting(result);
    return result || null;
}

/** «МАМЕДОВА» → «Мамедова», «АЗС» и «ТЭЦ-3» не трогаем. */
function fixShouting(value: string): string {
    if (/\p{Ll}/u.test(value)) return value;
    const letters = value.replace(/[^\p{L}]/gu, '');
    if (letters.length < 4) return value;
    return value.replace(/\p{L}+/gu, (word) => word[0] + word.slice(1).toLowerCase());
}

/**
 * Строка адреса из частей.
 *
 * Печатается в договоре-заявке и доверенности, поэтому собирается по порядку
 * «страна, область, город, улица, дом» и без пустых мест: у половины адресов
 * области нет, а «Казахстан, , Алматы» в документе выглядит браком.
 *
 * Когда улица названа, строка собирается из полей — и результат один и тот
 * же, нашёлся адрес подсказкой или его вписали руками. Раньше готовая
 * строка всегда была главнее, и «Мамедова 2», введённая в поля, в адрес не
 * попадала вовсе: в документ уходило то, что осталось в строке поиска.
 *
 * Готовая строка остаётся в ходу там, где полей нет: её присылают старые
 * клиенты и быстрый ввод адреса прямо в заявке.
 */
export function composeAddress(
    address: string | undefined | null,
    parts: { country?: string; region?: string; city?: string; street?: string; house?: string },
): string {
    const tidy = {
        country: tidyAddressPart(parts.country, 'country'),
        region: tidyAddressPart(parts.region, 'region'),
        city: tidyAddressPart(parts.city, 'city'),
        street: tidyAddressPart(parts.street, 'street'),
        house: tidyAddressPart(parts.house, 'house'),
    };
    const ready = (address || '').trim();
    if (ready && !tidy.street) return ready;

    const street = [tidy.street, tidy.house].filter(Boolean).join(' ');
    const composed = [tidy.country, tidy.region, tidy.city, street].filter(Boolean).join(', ');
    return composed || ready;
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
                    country: tidyAddressPart(country, 'country'),
                    region: tidyAddressPart(region, 'region'),
                    street: tidyAddressPart(street, 'street'),
                    house: tidyAddressPart(house, 'house'),
                    contactName,
                    contactPhone,
                    notes,
                    createdById,
                    city: tidyAddressPart(city, 'city'),
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

    /**
     * Какие адреса видит компания.
     *
     * `Location.companyId` — это контрагент, к которому привязана точка, а не
     * её владелец. У общих адресов там пусто, и таких в справочнике
     * большинство. Отбор «где companyId равен нашему» отсекал бы как раз их,
     * поэтому условие собрано здесь один раз — и для списка, и для подсчёта
     * адресов без координат.
     */
    async visibleToCompany(companyId?: string): Promise<Record<string, any>> {
        if (!companyId) return {};

        // Сотрудники компании: их точки видны, даже если привязаны к партнёру.
        const companyUsers = await this.prisma.user.findMany({
            where: { companyId },
            select: { id: true },
        });
        const companyUserIds = companyUsers.map((u) => u.id);

        return {
            OR: [
                { companyId },
                { companyId: null }, // Общие адреса без привязки к компании
                // Точки, привязанные к внешним контрагентам компании
                { company: { isExternal: true, createdByCompanyId: companyId } },
                ...(companyUserIds.length ? [{ createdById: { in: companyUserIds } }] : []),
            ],
        };
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
            whereConditions.push(await this.visibleToCompany(companyId));
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
            if (country !== undefined) updateData.country = tidyAddressPart(country, 'country');
            if (region !== undefined) updateData.region = tidyAddressPart(region, 'region');
            if (street !== undefined) updateData.street = tidyAddressPart(street, 'street');
            if (house !== undefined) updateData.house = tidyAddressPart(house, 'house');

            // Строку адреса пересобираем, как только тронули хоть одну часть.
            // Иначе правка улицы никуда не доходила: в документах и в списке
            // оставался прежний адрес, и человек видел одно, а печаталось
            // другое. Недостающие части берём из карточки — прислать могли
            // только то, что меняли.
            const touched = [address, country, region, city, street, house].some((v) => v !== undefined);
            if (touched) {
                const current = await this.prisma.location.findUnique({
                    where: { id },
                    select: { country: true, region: true, city: true, street: true, house: true },
                });
                const pick = (next: any, was: string | null | undefined) =>
                    (next !== undefined ? next : was) || undefined;
                updateData.address = composeAddress(address, {
                    country: pick(country, current?.country),
                    region: pick(region, current?.region),
                    city: pick(city, current?.city),
                    street: pick(street, current?.street),
                    house: pick(house, current?.house),
                });
            }
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
            if (city !== undefined) updateData.city = tidyAddressPart(city, 'city');
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
