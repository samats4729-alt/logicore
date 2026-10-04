import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExchangeLoadStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { cityKey } from '../cities/city-key';
import { kzTodayString } from '../common/utils/business-date';
import { assertAllowedUpload } from '../documents/allowed-files';
import { removeExchangeFile, safeExtension, storeExchangeFile } from './exchange-files';
import { CreateExchangeLoadDto, ExchangeListFilter, RoutePricesQueryDto } from './dto/exchange-load.dto';

/** Номер груза на экране: «Б-0042». Буква — чтобы не путать с номером заявки. */
export function loadNumber(seq: number): string {
    return `Б-${String(seq).padStart(4, '0')}`;
}

/** Больше фото водителю не нужно, а хранилище не резиновое. */
export const MAX_LOAD_PHOTOS = 10;

const STATUS_FILTER: Record<ExchangeListFilter, ExchangeLoadStatus[] | undefined> = {
    active: ['OPEN', 'TAKEN', 'IN_TRANSIT'],
    done: ['DELIVERED'],
    cancelled: ['CANCELLED'],
    all: undefined,
};

const LOAD_SELECT = {
    id: true, seq: true, status: true,
    originCityId: true, originCityName: true, originAddress: true,
    destinationCityId: true, destinationCityName: true, destinationAddress: true,
    loadingDate: true, loadingTime: true,
    bodyType: true, cargoDescription: true, weightKg: true, volumeM3: true, requirements: true,
    price: true, cancelledAt: true, cancelReason: true, createdAt: true,
    createdBy: { select: { firstName: true, lastName: true } },
    photos: { select: { id: true, fileName: true, mimeType: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ExchangeLoadSelect;

type LoadRow = Prisma.ExchangeLoadGetPayload<{ select: typeof LOAD_SELECT }>;

/** Медиана: одна случайная дорогая перевозка не должна задирать «обычную цену». */
function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Биржа со стороны компании, у которой груз.
 *
 * Компания ставит груз, видит свои грузы и снимает их. Водители появятся
 * следующим этапом — тогда груз будет уходить им в приложение.
 */
@Injectable()
export class ExchangeService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly s3: S3Service,
    ) {}

    private view(row: LoadRow) {
        const { seq, createdBy, ...rest } = row;
        return {
            ...rest,
            number: loadNumber(seq),
            createdByName: createdBy ? `${createdBy.lastName || ''} ${createdBy.firstName || ''}`.trim() : null,
        };
    }

    /** Город из справочника — только если такой есть; выдуманная ссылка не ломает сохранение. */
    private async knownCityId(id?: string): Promise<string | null> {
        if (!id) return null;
        const city = await this.prisma.city.findUnique({ where: { id }, select: { id: true } });
        return city?.id ?? null;
    }

    async create(companyId: string, userId: string, dto: CreateExchangeLoadDto) {
        const originCityName = dto.originCityName.trim();
        const destinationCityName = dto.destinationCityName.trim();
        const originKey = cityKey(originCityName);
        const destinationKey = cityKey(destinationCityName);
        if (!originKey) throw new BadRequestException('Укажите, откуда везти');
        if (!destinationKey) throw new BadRequestException('Укажите, куда везти');

        // День погрузки — календарный день Казахстана. Вчерашний груз на
        // бирже никому не нужен: водитель увидел бы его уже опоздавшим.
        const day = dto.loadingDate.slice(0, 10);
        if (day < kzTodayString()) {
            throw new BadRequestException('День погрузки уже прошёл — выберите сегодня или позже');
        }

        const row = await this.prisma.exchangeLoad.create({
            data: {
                companyId,
                createdById: userId,
                originCityId: await this.knownCityId(dto.originCityId),
                originCityName,
                originCityKey: originKey,
                originAddress: dto.originAddress?.trim() || null,
                destinationCityId: await this.knownCityId(dto.destinationCityId),
                destinationCityName,
                destinationCityKey: destinationKey,
                destinationAddress: dto.destinationAddress?.trim() || null,
                loadingDate: new Date(`${day}T00:00:00.000Z`),
                loadingTime: dto.loadingTime?.trim() || null,
                bodyType: dto.bodyType.trim(),
                cargoDescription: dto.cargoDescription.trim(),
                weightKg: dto.weightKg ?? null,
                volumeM3: dto.volumeM3 ?? null,
                requirements: dto.requirements?.trim() || null,
                price: dto.price,
            },
            select: LOAD_SELECT,
        });
        return this.view(row);
    }

    async list(companyId: string, filter: ExchangeListFilter = 'active') {
        const statuses = STATUS_FILTER[filter];
        const rows = await this.prisma.exchangeLoad.findMany({
            where: { companyId, ...(statuses ? { status: { in: statuses } } : {}) },
            select: LOAD_SELECT,
            orderBy: [{ loadingDate: 'asc' }, { seq: 'asc' }],
            take: 500,
        });
        // Сколько грузов в каждой вкладке — чтобы пустая вкладка не
        // открывалась наугад.
        const grouped = await this.prisma.exchangeLoad.groupBy({
            by: ['status'],
            where: { companyId },
            _count: { _all: true },
        });
        const count = (list?: ExchangeLoadStatus[]) => grouped
            .filter((g) => !list || list.includes(g.status))
            .reduce((sum, g) => sum + g._count._all, 0);
        return {
            loads: rows.map((r) => this.view(r)),
            counts: {
                active: count(STATUS_FILTER.active),
                done: count(STATUS_FILTER.done),
                cancelled: count(STATUS_FILTER.cancelled),
                all: count(),
            },
        };
    }

    async findOne(companyId: string, id: string) {
        const row = await this.prisma.exchangeLoad.findFirst({ where: { id, companyId }, select: LOAD_SELECT });
        if (!row) throw new NotFoundException('Груз не найден');
        return this.view(row);
    }

    /**
     * Снять груз с биржи. Только пока его никто не взял: дальше у груза есть
     * водитель, который уже едет, и снимать его кнопкой нельзя.
     */
    async cancel(companyId: string, id: string, reason: string) {
        const load = await this.prisma.exchangeLoad.findFirst({ where: { id, companyId }, select: { id: true, status: true } });
        if (!load) throw new NotFoundException('Груз не найден');
        if (load.status === 'CANCELLED') throw new BadRequestException('Груз уже снят с биржи');
        if (load.status !== 'OPEN') throw new BadRequestException('Груз уже взял водитель — снять его с биржи нельзя');

        // Условное обновление: если водитель взял груз в ту же секунду,
        // снятие не пройдёт, а не перезапишет его.
        const { count } = await this.prisma.exchangeLoad.updateMany({
            where: { id, companyId, status: 'OPEN' },
            data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason.trim() },
        });
        if (!count) throw new BadRequestException('Груз уже взял водитель — снять его с биржи нельзя');
        return this.findOne(companyId, id);
    }

    /**
     * Почём возили по этому направлению — факты, а не расчёт.
     *
     * Решение владельца по запросам (quote-memory.ts): система цену не
     * придумывает, называет её человек. Здесь то же самое: прошлые грузы
     * биржи по направлению (их цены и так видны водителям) и свои рейсы
     * компании — сколько она платила перевозчику.
     */
    async routePrices(companyId: string, query: RoutePricesQueryDto) {
        const originKey = cityKey(query.originCityName);
        const destinationKey = cityKey(query.destinationCityName);
        if (!originKey || !destinationKey) return { exchange: [], ownOrders: [], summary: null };

        const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000);

        const exchangeRows = await this.prisma.exchangeLoad.findMany({
            where: {
                originCityKey: originKey,
                destinationCityKey: destinationKey,
                status: { not: 'CANCELLED' },
                createdAt: { gte: yearAgo },
            },
            select: { seq: true, loadingDate: true, price: true, bodyType: true, weightKg: true, companyId: true },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        // Свои рейсы: маршрут лежит точками, город — в адресе. Сравниваем
        // первую погрузку и последнюю выгрузку теми же ключами.
        const orders = await this.prisma.order.findMany({
            where: {
                forwarderId: companyId,
                driverCost: { not: null },
                status: { not: 'CANCELLED' },
                createdAt: { gte: yearAgo },
            },
            select: {
                orderNumber: true, createdAt: true, driverCost: true, cargoType: true, cargoWeight: true,
                routePoints: {
                    select: { pointType: true, sequence: true, location: { select: { city: true, cityRecord: { select: { name: true } } } } },
                    orderBy: { sequence: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
        });
        const keyOf = (p?: { location: { city: string | null; cityRecord: { name: string } | null } }) =>
            cityKey(p?.location.cityRecord?.name || p?.location.city || '');
        const ownOrders = orders
            .filter((o) => {
                const pickup = o.routePoints.find((p) => p.pointType === 'PICKUP');
                const delivery = [...o.routePoints].reverse().find((p) => p.pointType === 'DELIVERY');
                return keyOf(pickup) === originKey && keyOf(delivery) === destinationKey;
            })
            .slice(0, 10)
            .map((o) => ({
                orderNumber: o.orderNumber,
                date: o.createdAt,
                price: Number(o.driverCost),
                bodyType: o.cargoType,
                weightKg: o.cargoWeight != null ? Math.round(o.cargoWeight) : null,
            }));

        const exchange = exchangeRows.map((r) => ({
            number: loadNumber(r.seq),
            date: r.loadingDate,
            price: Number(r.price),
            bodyType: r.bodyType,
            weightKg: r.weightKg,
            own: r.companyId === companyId,
        }));

        const prices = [...exchange, ...ownOrders].map((r) => r.price).filter((p) => p > 0);
        return {
            exchange,
            ownOrders,
            summary: prices.length
                ? { count: prices.length, min: Math.min(...prices), max: Math.max(...prices), median: median(prices) }
                : null,
        };
    }

    // ==================== фото ====================

    private async ownLoad(companyId: string, loadId: string) {
        const load = await this.prisma.exchangeLoad.findFirst({
            where: { id: loadId, companyId },
            select: { id: true, status: true, _count: { select: { photos: true } } },
        });
        if (!load) throw new NotFoundException('Груз не найден');
        return load;
    }

    async addPhoto(companyId: string, loadId: string, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Файл не получен');
        assertAllowedUpload(file);
        if (!file.mimetype.startsWith('image/')) {
            throw new BadRequestException('Сюда — только фотографии груза');
        }
        const load = await this.ownLoad(companyId, loadId);
        if (load.status !== 'OPEN') throw new BadRequestException('Груз уже не на бирже — фото не добавить');
        if (load._count.photos >= MAX_LOAD_PHOTOS) {
            throw new BadRequestException(`Не больше ${MAX_LOAD_PHOTOS} фото на груз`);
        }

        const fileKey = `uploads/exchange/${loadId}/${randomUUID()}${safeExtension(file.originalname)}`;
        await storeExchangeFile(this.s3, fileKey, file);

        return this.prisma.exchangeLoadPhoto.create({
            data: {
                loadId,
                fileKey,
                fileName: (file.originalname || 'фото').slice(0, 200),
                mimeType: file.mimetype,
                size: file.size,
            },
            select: { id: true, fileName: true, mimeType: true },
        });
    }

    async photo(companyId: string, photoId: string) {
        const photo = await this.prisma.exchangeLoadPhoto.findFirst({
            where: { id: photoId, load: { companyId } },
            select: { fileKey: true, fileName: true, mimeType: true },
        });
        if (!photo) throw new NotFoundException('Фото не найдено');
        return photo;
    }

    async removePhoto(companyId: string, photoId: string) {
        const photo = await this.prisma.exchangeLoadPhoto.findFirst({
            where: { id: photoId, load: { companyId } },
            select: { id: true, fileKey: true, load: { select: { status: true } } },
        });
        if (!photo) throw new NotFoundException('Фото не найдено');
        if (photo.load.status !== 'OPEN') throw new BadRequestException('Груз уже не на бирже — фото не убрать');
        await this.prisma.exchangeLoadPhoto.delete({ where: { id: photo.id } });
        // Файл чистим после записи: если удаление файла не удалось, фото уже
        // не показывается, а мусор в хранилище никому не мешает.
        await removeExchangeFile(this.s3, photo.fileKey);
        return { ok: true };
    }
}
