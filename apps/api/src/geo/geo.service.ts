import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Прокси к геокодеру 2ГИС с кэшем в Redis: одинаковые запросы не бьют
 * в платный API повторно, а ключ 2ГИС не светится в браузере.
 * Ключ: переменная DGIS_API_KEY на api-сервисе.
 */
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 дней

export interface GeoItem {
    id?: string;
    name?: string;
    full_name?: string;
    address_name?: string;
    building_name?: string;
    purpose_name?: string;
    point?: { lat: number; lon: number };
    adm_div?: Array<{ type: string; name: string }>;
}

@Injectable()
export class GeoService {
    private readonly logger = new Logger(GeoService.name);

    constructor(private redis: RedisService) { }

    private get apiKey(): string | undefined {
        return process.env.DGIS_API_KEY || process.env.NEXT_PUBLIC_2GIS_API_KEY;
    }

    /** Подсказки адресов по строке */
    async suggest(query: string): Promise<{ configured: boolean; items: GeoItem[] }> {
        const q = (query || '').trim().slice(0, 120);
        if (q.length < 2) return { configured: !!this.apiKey, items: [] };
        if (!this.apiKey) return { configured: false, items: [] };

        const cacheKey = `geo:suggest:${q.toLowerCase()}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return { configured: true, items: JSON.parse(cached) };

        try {
            const params = new URLSearchParams({
                q,
                key: this.apiKey,
                fields: 'items.point,items.address_name,items.building_name,items.full_name',
                page_size: '10',
            });
            const res = await fetch(`https://catalog.api.2gis.com/3.0/items/geocode?${params}`);
            const data: any = await res.json();
            const items: GeoItem[] = (data?.result?.items || []).map((i: any) => ({
                id: i.id,
                name: i.name,
                full_name: i.full_name,
                address_name: i.address_name,
                building_name: i.building_name,
                purpose_name: i.purpose_name,
                point: i.point,
            }));

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

        const cacheKey = `geo:reverse:${lat.toFixed(5)}:${lon.toFixed(5)}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return { configured: true, items: JSON.parse(cached) };

        try {
            const params = new URLSearchParams({
                key: this.apiKey,
                fields: 'items.point,items.address_name,items.building_name,items.full_name,items.adm_div',
                lon: String(lon),
                lat: String(lat),
                radius: '100',
            });
            const res = await fetch(`https://catalog.api.2gis.com/3.0/items/geocode?${params}`);
            const data: any = await res.json();
            const items: GeoItem[] = (data?.result?.items || []).map((i: any) => ({
                id: i.id,
                name: i.name,
                full_name: i.full_name,
                address_name: i.address_name,
                building_name: i.building_name,
                purpose_name: i.purpose_name,
                point: i.point,
                adm_div: i.adm_div,
            }));

            await this.redis.set(cacheKey, JSON.stringify(items), CACHE_TTL_SECONDS);
            return { configured: true, items };
        } catch (error: any) {
            this.logger.warn(`2GIS reverse failed: ${error.message}`);
            return { configured: true, items: [] };
        }
    }
}
