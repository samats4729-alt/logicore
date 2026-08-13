import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GeoService } from '../geo/geo.service';

/**
 * Дозапись координат адресам, которые завели без них.
 *
 * Смысл всей затеи: адрес можно записать, когда геокодер молчит — кончились
 * запросы, отвалилась сеть, нет ключа. Такой адрес работает, только на карте
 * его не видно. Когда геокодер снова отвечает, эта служба проходит по
 * накопившемуся и дописывает точки; маршруты после этого считаются сами.
 *
 * Три правила, которые здесь важнее скорости:
 *
 * Точку человека не трогаем. Он знает, где въезд на склад, а геокодер
 * поставит середину улицы.
 *
 * Идём медленно и пачками. Геокодер платный и с лимитом; вычерпать месячный
 * запас за одну минуту на старом хвосте адресов — худшее, что можно сделать
 * с деньгами владельца.
 *
 * Ненайденное помечаем, а не прячем. Мынарал может не отдаться и рабочему
 * ключу. Молча оставить адрес без точки — значит никогда об этом не узнать.
 */

/** Сколько адресов берём за один проход. */
const BATCH_SIZE = 25;

/** Пауза между запросами: геокодер не любит очередей, и мы не спешим. */
const PAUSE_MS = 300;

/** Как часто фон сам проверяет, не появились ли ответы. */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Сколько ждать, прежде чем снова пробовать ненайденный адрес.
 *
 * Без этого каждый проход тратил бы запросы на одни и те же адреса, которых
 * в геокодере нет, — и до новых очередь бы не дошла.
 */
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface GeocodeSweepResult {
    /** Сколько адресов взяли в работу */
    tried: number;
    /** Скольким записали координаты */
    found: number;
    /** Сколько геокодер не узнал */
    missed: number;
    /** Настроен ли геокодер вообще */
    configured: boolean;
}

@Injectable()
export class LocationGeocodingService implements OnApplicationBootstrap {
    private readonly logger = new Logger(LocationGeocodingService.name);
    private running = false;

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private geo: GeoService,
    ) { }

    onApplicationBootstrap() {
        // Первый проход не сразу: при запуске платформе есть чем заняться.
        setTimeout(() => this.sweepQuietly(), 60_000);
        setInterval(() => this.sweepQuietly(), SWEEP_INTERVAL_MS);
    }

    private sweepQuietly() {
        this.sweep().catch((error) => {
            this.logger.warn(`Дозапись координат не прошла: ${(error as Error).message}`);
        });
    }

    /** Сколько адресов ждут координат. Для списка в кабинете. */
    async countMissing(companyId?: string): Promise<{ total: number; failed: number }> {
        const where = this.whereMissing(companyId);
        const [total, failed] = await Promise.all([
            this.prisma.location.count({ where }),
            this.prisma.location.count({ where: { ...where, geocodeFailedAt: { not: null } } }),
        ]);
        return { total, failed };
    }

    async listMissing(companyId?: string, take = 100) {
        return this.prisma.location.findMany({
            where: this.whereMissing(companyId),
            orderBy: [{ geocodeFailedAt: 'asc' }, { createdAt: 'desc' }],
            take,
            select: {
                id: true, name: true, address: true, city: true,
                country: true, region: true, street: true, house: true,
                geocodeFailedAt: true, createdAt: true,
            },
        });
    }

    /**
     * Пройти по адресам без координат и попробовать найти их.
     *
     * `force` — человек нажал «Найти сейчас»: тогда берём и те, что недавно
     * не нашлись. Сам по себе фон их пропускает, чтобы не жечь запросы.
     */
    async sweep(options: { companyId?: string; force?: boolean } = {}): Promise<GeocodeSweepResult> {
        const empty: GeocodeSweepResult = { tried: 0, found: 0, missed: 0, configured: true };

        // Два прохода разом только удвоят расход запросов. Замок ставится до
        // первого ожидания: если сделать это после проверки ключа, оба
        // прохода успевают проскочить, пока геокодер отвечает.
        if (this.running) return empty;
        this.running = true;

        try {
            // Спрашивать геокодер, когда ключа нет, незачем: он ответит
            // отказом на каждый адрес, а мы пометим их всех ненайденными и
            // потеряем очередь на неделю.
            const probe = await this.geo.suggest('Алматы');
            if (!probe.configured) return { ...empty, configured: false };

            const where = this.whereMissing(options.companyId);
            const locations = await this.prisma.location.findMany({
                where: options.force ? where : {
                    ...where,
                    OR: [
                        { geocodeFailedAt: null },
                        { geocodeFailedAt: { lt: new Date(Date.now() - RETRY_AFTER_MS) } },
                    ],
                },
                orderBy: [{ geocodeFailedAt: 'asc' }, { createdAt: 'desc' }],
                take: BATCH_SIZE,
                select: {
                    id: true, address: true, country: true,
                    region: true, city: true, street: true, house: true,
                },
            });

            let found = 0;
            let missed = 0;
            for (const location of locations) {
                const point = await this.locate(location);
                if (point) {
                    await this.prisma.location.update({
                        where: { id: location.id },
                        data: { latitude: point.lat, longitude: point.lon, geocodeFailedAt: null },
                    });
                    found++;
                } else {
                    await this.prisma.location.update({
                        where: { id: location.id },
                        data: { geocodeFailedAt: new Date() },
                    });
                    missed++;
                }
                await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
            }

            if (found > 0) await this.redis.delByPattern('locations:*');
            if (locations.length > 0) {
                this.logger.log(`Дозапись координат: взяли ${locations.length}, нашли ${found}, не нашли ${missed}`);
            }
            return { tried: locations.length, found, missed, configured: true };
        } finally {
            this.running = false;
        }
    }

    /**
     * Спросить геокодер про один адрес.
     *
     * Сначала спрашиваем строкой целиком — так больше шансов попасть в дом.
     * Не вышло — спрашиваем по частям без дома: точка на улице лучше, чем
     * никакой. Города без улицы достаточно для карты маршрута.
     */
    private async locate(location: {
        address: string; country: string | null; region: string | null;
        city: string | null; street: string | null; house: string | null;
    }): Promise<{ lat: number; lon: number } | null> {
        const attempts = [
            location.address,
            [location.country, location.city, location.street, location.house].filter(Boolean).join(', '),
            [location.country, location.city, location.street].filter(Boolean).join(', '),
            [location.country, location.region, location.city].filter(Boolean).join(', '),
        ].map((q) => (q || '').trim()).filter((q) => q.length >= 2);

        for (const query of Array.from(new Set(attempts))) {
            const { items } = await this.geo.suggest(query);
            const point = items.find((item) => item.point)?.point;
            if (point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
                return { lat: point.lat, lon: point.lon };
            }
        }
        return null;
    }

    private whereMissing(companyId?: string) {
        return {
            latitude: null,
            // Ручные точки сюда не попадают по определению: у них координаты
            // есть. Условие оставлено явным, чтобы правка отбора не съела
            // главное правило.
            coordinatesManual: false,
            ...(companyId ? { companyId } : {}),
        };
    }
}
