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
    full_address_name?: string;
    address_name?: string;
    building_name?: string;
    purpose_name?: string;
    locale?: string;
    point?: { lat: number; lon: number };
    adm_div?: Array<{ id?: string; type: string; name: string }>;
    geography?: GeoProviderHierarchy;
}

export interface GeoProviderEntity {
    externalId?: string;
    name: string;
}

export interface GeoProviderCountry extends GeoProviderEntity {
    code: string;
}

export interface GeoProviderHierarchy {
    provider: '2gis';
    placeId?: string;
    country?: GeoProviderCountry;
    region?: GeoProviderEntity;
    city?: GeoProviderEntity;
}

@Injectable()
export class GeoService {
    private readonly logger = new Logger(GeoService.name);

    constructor(private redis: RedisService) { }

    private get apiKey(): string | undefined {
        return process.env.DGIS_API_KEY || process.env.NEXT_PUBLIC_2GIS_API_KEY;
    }

    private normalizeAdmType(type?: string): string {
        return String(type || '').replace(/^adm_div\./, '');
    }

    private getCountryCode(locale?: string): string | undefined {
        const match = String(locale || '').match(/[_-]([a-z]{2})$/i);
        return match?.[1]?.toUpperCase();
    }

    private getCountryName(code: string): string | undefined {
        try {
            return new Intl.DisplayNames(['ru'], { type: 'region' }).of(code);
        } catch {
            return undefined;
        }
    }

    private mapItem(item: any): GeoItem {
        const admDiv: Array<{ id?: string; type: string; name: string }> = Array.isArray(item?.adm_div)
            ? item.adm_div
                .filter((division: any) => division?.type && division?.name)
                .map((division: any) => ({
                    id: division.id ? String(division.id) : undefined,
                    type: this.normalizeAdmType(division.type),
                    name: String(division.name),
                }))
            : [];
        const findDivision = (...types: string[]) => admDiv.find(division => types.includes(division.type));
        const countryDivision = findDivision('country');
        const regionDivision = findDivision('region');
        const cityDivision = findDivision('city', 'settlement');
        const countryCode = this.getCountryCode(item?.locale);
        const countryName = countryDivision?.name || (countryCode ? this.getCountryName(countryCode) : undefined);

        const geography: GeoProviderHierarchy = {
            provider: '2gis',
            placeId: item?.id ? String(item.id) : undefined,
            country: countryCode && countryName
                ? {
                    code: countryCode,
                    name: countryName,
                    externalId: countryDivision?.id,
                }
                : undefined,
            region: regionDivision
                ? { name: regionDivision.name, externalId: regionDivision.id }
                : undefined,
            city: cityDivision
                ? { name: cityDivision.name, externalId: cityDivision.id }
                : undefined,
        };

        return {
            id: item?.id,
            name: item?.name,
            full_name: item?.full_name,
            full_address_name: item?.full_address_name,
            address_name: item?.address_name,
            building_name: item?.building_name,
            purpose_name: item?.purpose_name,
            locale: item?.locale,
            point: item?.point,
            adm_div: admDiv,
            geography,
        };
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
            const params = new URLSearchParams({
                q,
                key: this.apiKey,
                fields: 'items.point,items.address_name,items.building_name,items.full_name,items.full_address_name,items.adm_div,items.locale',
                page_size: '10',
            });
            const res = await fetch(`https://catalog.api.2gis.com/3.0/items/geocode?${params}`);
            const data: any = await res.json();
            const items: GeoItem[] = (data?.result?.items || []).map((item: any) => this.mapItem(item));

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
            const params = new URLSearchParams({
                key: this.apiKey,
                fields: 'items.point,items.address_name,items.building_name,items.full_name,items.full_address_name,items.adm_div,items.locale',
                lon: String(lon),
                lat: String(lat),
                radius: '100',
            });
            const res = await fetch(`https://catalog.api.2gis.com/3.0/items/geocode?${params}`);
            const data: any = await res.json();
            const items: GeoItem[] = (data?.result?.items || []).map((item: any) => this.mapItem(item));

            await this.redis.set(cacheKey, JSON.stringify(items), CACHE_TTL_SECONDS);
            return { configured: true, items };
        } catch (error: any) {
            this.logger.warn(`2GIS reverse failed: ${error.message}`);
            return { configured: true, items: [] };
        }
    }
}
