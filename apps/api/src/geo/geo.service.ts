import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { mapGeoItem, type GeoItem } from './geo-item';

/**
 * Прокси к геокодеру 2ГИС с кэшем в Redis: одинаковые запросы не бьют
 * в платный API повторно, а ключ 2ГИС не светится в браузере.
 * Ключ: переменная DGIS_API_KEY на api-сервисе.
 */
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 дней

/** Что просим у геокодера: без `adm_div` не собрать страну, область и город. */
const GEO_FIELDS = 'items.point,items.address_name,items.building_name,items.full_name,items.full_address_name,items.adm_div,items.locale';

export type { GeoItem, GeoProviderEntity, GeoProviderCountry, GeoProviderHierarchy } from './geo-item';

@Injectable()
export class GeoService {
    private readonly logger = new Logger(GeoService.name);

    constructor(private redis: RedisService) { }

    private get apiKey(): string | undefined {
        return process.env.DGIS_API_KEY || process.env.NEXT_PUBLIC_2GIS_API_KEY;
    }

    /**
     * Сходить в геокодер и разобрать ответ.
     *
     * `locale` просим ради русских названий: без него область приходила как
     * «Turkistan Region Oblast». Но если геокодер этот параметр не примет,
     * подсказки пропадут совсем — а это хуже английских названий. Поэтому
     * при отказе повторяем запрос без него, один раз.
     */
    private async ask(params: Record<string, string>): Promise<GeoItem[]> {
        const call = async (withLocale: boolean) => {
            const query = new URLSearchParams({
                ...params,
                key: this.apiKey as string,
                fields: GEO_FIELDS,
                ...(withLocale ? { locale: 'ru_KZ' } : {}),
            });
            const res = await fetch(`https://catalog.api.2gis.com/3.0/items/geocode?${query}`);
            return res.json() as Promise<any>;
        };

        let data = await call(true);
        const code = Number(data?.meta?.code || 200);
        if (code >= 400 && code !== 404) {
            this.logger.warn(`2GIS отказал с locale (${code}) — повторяем без него`);
            data = await call(false);
        }
        return (data?.result?.items || []).map((item: any) => mapGeoItem(item));
    }

    /** Подсказки адресов по строке */
    async suggest(query: string): Promise<{ configured: boolean; items: GeoItem[] }> {
        const q = (query || '').trim().slice(0, 120);
        if (q.length < 2) return { configured: !!this.apiKey, items: [] };
        if (!this.apiKey) return { configured: false, items: [] };

        // v2 contains normalized country/region/city metadata; do not reuse old address-only cache entries.
        const cacheKey = `geo:v2:suggest:${q.toLowerCase()}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return { configured: true, items: JSON.parse(cached) };

        try {
            const items = await this.ask({ q, page_size: '10' });

            await this.redis.set(cacheKey, JSON.stringify(items), CACHE_TTL_SECONDS);
            return { configured: true, items };
        } catch (error: any) {
            this.logger.warn(`2GIS suggest failed: ${error.message}`);
            return { configured: true, items: [] };
        }
    }

    /** Обратный геокодинг: адрес по координатам */
    async reverse(lat: number, lon: number): Promise<{ configured: boolean; items: GeoItem[] }> {
        if (!this.apiKey) return { configured: false, items: [] };
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { configured: true, items: [] };

        const cacheKey = `geo:v2:reverse:${lat.toFixed(5)}:${lon.toFixed(5)}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return { configured: true, items: JSON.parse(cached) };

        try {
            const items = await this.ask({ lon: String(lon), lat: String(lat), radius: '100' });

            await this.redis.set(cacheKey, JSON.stringify(items), CACHE_TTL_SECONDS);
            return { configured: true, items };
        } catch (error: any) {
            this.logger.warn(`2GIS reverse failed: ${error.message}`);
            return { configured: true, items: [] };
        }
    }
}
